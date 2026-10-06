/* Découché J1 → J2, incrément 1 — dans l'application réelle (390 px, puis 360 px).
   UNE SEULE AUTORITÉ ET UNE SEULE SURFACE : V189 décide qu'une nuit est un découché ; le bandeau V206
   (#planningOvernightCueV206) est la seule surface du Planning, enrichi de deux lignes routières lues chez
   StoreRunnerRoadMatrixV248 (ici l'estimation du planning : localhost n'amorce pas OSRM). Une nuit que V189
   n'a pas retenue n'a ni bandeau ni chiffre, même si la route y gagnerait beaucoup. Fixture inventée : un
   domicile, deux magasins éloignés, deux jours enchaînés. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

const LYON={lat:45.764,lon:4.8357};
const CUE='#planningOvernightCueV206';
const ROAD=CUE+' [data-overnight-road]';

async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-14T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&document.getElementById('planPanel')&&window.StoreRunnerRoadMatrixV248&&window.StoreRunnerTerrainPlanningV1&&typeof window.overnightCandidate==='function');
  return errors;
}
/* Mardi 15 : Annemasse ; mercredi 16 : Annecy (ou ce que `o` remplace). */
async function seed(page,o){
  await page.evaluate(opts=>{
    const st=window.state;
    const mk=(id,ville,lat,lon)=>({id,enseigne:'Enseigne '+id,ville,adresse:'1 rue Test',dept:'99',lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.profile=Object.assign({},st.profile,{baseName:'Lyon',baseAddress:'Lyon',baseLat:opts.base?opts.base.lat:null,baseLon:opts.base?opts.base.lon:null,overnightMode:opts.mode||'auto',overnightMinSaving:80});
    st.stores=[mk('a',opts.aCity||'Annemasse',opts.a.lat,opts.a.lon),mk('b',opts.bCity||'Annecy',opts.b.lat,opts.b.lon)];
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',maxVisitsPerDay:4});
    st.plan={Lundi:[],Mardi:[st.stores[0]],Mercredi:[st.stores[1]],Jeudi:[],Vendredi:[],Samedi:[]};
    st.excluded={};st.included={};st.locks={};st.calendarEvents=[];st.appointments=opts.appointments||[];st.hotelReservations=opts.hotelReservations||{};
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },o);
  await page.waitForTimeout(2200);
}
const FAR={base:LYON,a:{lat:46.1936,lon:6.2342},b:{lat:45.8992,lon:6.1294}};
const visible=(page,sel)=>page.evaluate(s=>{const el=document.querySelector(s);return !!(el&&el.isConnected&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')},sel);
const roadLines=page=>page.evaluate(sel=>{const box=document.querySelector(sel);return box?[...box.children].map(c=>c.textContent):null},ROAD);
const duration=m=>{const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+String(r).padStart(2,'0'):''):r+' min'};
/* Tout ce que le Planning montre sur le découché : les éléments dont le texte propre parle de route évitée ou de découchage conseillé. */
const surfaces=page=>page.evaluate(()=>{
  const out=[];
  for(const el of document.querySelectorAll('#planPanel *')){
    if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
    const own=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('');
    if(/de route évités|Découchage conseillé/i.test(own))out.push(el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className?'.'+String(el.className).split(' ')[0]:''));
  }
  return out;
});
const snapshot=page=>page.evaluate(()=>JSON.stringify({plan:state.plan,appointments:state.appointments,locks:state.locks,included:state.included,excluded:state.excluded,hotels:state.hotelReservations,origins:state.dayOrigins||null}));

test('Le bandeau V206 est la seule surface : V189 décide, deux lignes routières l’enrichissent, rien n’est écrit',async({page})=>{
  const errors=await boot(page);
  const appointments=[{id:'r1',storeId:'b',date:'2026-09-16',time:'09:30',duration:60,type:'Rendez-vous',note:'Le gérant'}];
  await seed(page,{...FAR,appointments});

  /* V189 décide, comme avant ce lot. */
  expect(await page.evaluate(()=>window.overnightCandidate().night)).toBe('Nuit Mardi → Mercredi');
  const cue=page.locator(CUE);
  await expect(cue).toBeVisible();
  await expect(cue).toContainText('Découché Mardi → Mercredi');
  await expect(cue).toContainText('Hôtel conseillé');
  expect(await page.locator('#dayTabs .hotelDayBadge[data-overnight]').count()).toBe(1);

  /* Les chiffres sont exactement ceux de StoreRunnerRoadMatrixV248.leg (même source que le planning). */
  const owner=await page.evaluate(()=>{
    const V=window.StoreRunnerRoadMatrixV248,a=state.stores[0],b=state.stores[1],h={lat:state.profile.baseLat,lon:state.profile.baseLon};
    const l1=V.leg(a,h),l2=V.leg(h,b),l3=V.leg(a,b);
    return{km:l1.distanceKm+l2.distanceKm-l3.distanceKm,min:l1.durationMinutes+l2.durationMinutes-l3.durationMinutes,sources:[l1,l2,l3].map(l=>l.source)};
  });
  expect(owner.km).toBeGreaterThan(100);
  const km=Math.round(Math.round(owner.km*10)/10/5)*5,min=Math.round(Math.round(owner.min)/5)*5;
  expect(await roadLines(page)).toEqual(['Annemasse → secteur Annecy','≈ '+km+' km · '+duration(min)+' de route évités']);
  expect(await visible(page,ROAD)).toBe(true);
  await expect(cue).toHaveAttribute('aria-label',/Découché Mardi → Mercredi.*Annemasse → secteur Annecy, ≈ \d+ km · .* de route évités\. Afficher l’hôtel conseillé\./);

  /* UNE SEULE surface : aucune carte « Découchage conseillé » à côté du bandeau, les chiffres n'existent qu'une fois. */
  expect(await page.locator('#planningOvernightOpportunity').count()).toBe(0);
  const shown=await surfaces(page);
  expect(shown.length,'surfaces visibles : '+shown.join(', ')).toBe(1);
  expect(shown[0]).toBe('span');
  expect(await page.locator('#planPanel [data-overnight-road]').count()).toBe(1);

  /* Compact et mobile : le bandeau tient dans l'écran, sans déborder, en flux. */
  const shape=await page.evaluate(sel=>{
    const el=document.querySelector(sel),r=el.getBoundingClientRect(),cs=getComputedStyle(el);
    return{position:cs.position,left:r.left,right:r.right,height:r.height,overflowX:document.documentElement.scrollWidth-window.innerWidth,
      interactive:el.querySelectorAll('button,a,input,select,textarea,[tabindex]').length,dialogOpen:!!document.querySelector('dialog[open],[role="dialog"]:not([hidden])'),
      copyOverflow:[...el.querySelectorAll('*')].some(n=>n.getBoundingClientRect().right>r.right+1)};
  },CUE);
  expect(shape.position).not.toBe('fixed');expect(shape.position).not.toBe('sticky');
  expect(shape.left).toBeGreaterThanOrEqual(8);expect(shape.right).toBeLessThanOrEqual(382);
  expect(shape.overflowX).toBeLessThanOrEqual(1);expect(shape.copyOverflow).toBe(false);
  expect(shape.height).toBeLessThanOrEqual(120);
  expect(shape.interactive).toBe(0);expect(shape.dialogOpen).toBe(false);

  /* Lecture seule : changer de jour, redéclencher des rendus, toucher le bandeau (il ouvre l'hôtel, comme avant). */
  const before=await snapshot(page);
  await page.locator('#dayTabs .dayTab[data-date="2026-09-17"]').click();await page.waitForTimeout(300);
  expect(await roadLines(page)).toHaveLength(2);expect(await surfaces(page)).toHaveLength(1);
  await page.evaluate(()=>{for(let i=0;i<3;i++)document.dispatchEvent(new CustomEvent('store-runner:planning-updated'))});
  await page.waitForTimeout(400);
  expect(await page.locator(CUE).count()).toBe(1);
  await page.locator(CUE).click();await page.waitForTimeout(250);
  await expect(page.locator('#overnightBox')).toContainText('Zone hôtel conseillée');
  expect(await snapshot(page)).toBe(before);
  expect(await page.evaluate(()=>state.appointments[0].time+'|'+state.appointments[0].date+'|'+state.plan.Mercredi.length)).toBe('09:30|2026-09-16|1');
  expect(errors).toEqual([]);
});

test('Une seule décision : une nuit que V189 n’a pas retenue n’a ni bandeau ni chiffre, même si la route y gagnerait',async({page})=>{
  const errors=await boot(page);
  const none=async(label)=>{
    expect(await page.locator(CUE).count(),label+' : bandeau').toBe(0);
    expect(await page.locator('[data-overnight-road]').count(),label+' : lignes routières').toBe(0);
    expect(await surfaces(page),label+' : surfaces').toEqual([]);
    expect(await page.locator('#planningOvernightOpportunity').count(),label).toBe(0);
  };
  /* Zone à ~45 km du domicile : V189 refuse (« trop proche »), alors que la route gagnerait plus de 100 km. */
  await seed(page,{base:LYON,a:{lat:46.17,lon:4.84},b:{lat:46.17,lon:4.9},aCity:'Nord-A',bCity:'Nord-B'});
  expect(await page.evaluate(()=>window.overnightCandidate())).toBeNull();
  const road=await page.evaluate(()=>{const g=StoreRunnerTerrainPlanningV1.overnightRoadGain(state.stores[0],state.stores[1],{lat:state.profile.baseLat,lon:state.profile.baseLon},StoreRunnerRoadMatrixV248);return g&&{km:g.savedKm,met:g.roadThresholdMet}});
  expect(road.km,'prémisse : la route gagnerait plus de 100 km').toBeGreaterThan(100);expect(road.met).toBe(true);
  await none('zone trop proche (V189 refuse)');
  /* Mode Jamais : l'utilisateur a dit non. */
  await seed(page,{...FAR,mode:'never'});
  expect(await page.evaluate(()=>window.overnightCandidate())).toBeNull();
  await none('mode Jamais');
  /* La preuve inverse : la même fixture, sans l'obstacle, affiche le bandeau enrichi. */
  await seed(page,FAR);expect(await visible(page,CUE)).toBe(true);expect(await roadLines(page)).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('Base absente : V189 ne propose plus de découché absurde, et rien n’est chiffré',async({page})=>{
  const errors=await boot(page);
  await seed(page,{...FAR,base:null});
  /* Avant ce lot, baseObj() du noyau répondait (0, 0) : V189 retenait la nuit avec ~10 000 km d'économie. */
  expect(await page.evaluate(()=>window.overnightCandidate())).toBeNull();
  expect(await page.locator(CUE).count()).toBe(0);
  expect(await page.locator('#dayTabs .hotelDayBadge[data-overnight]').count()).toBe(0);
  expect(await page.locator('[data-overnight-road]').count()).toBe(0);
  expect(await surfaces(page)).toEqual([]);
  /* Positif de contrôle : la base enregistrée, la nuit revient exactement comme avant. */
  await seed(page,FAR);expect(await visible(page,CUE)).toBe(true);
  expect(errors).toEqual([]);
});

test('Sans métriques routières, le découché V189 reste fonctionnel, sans chiffre inventé',async({page})=>{
  const errors=await boot(page);
  await seed(page,FAR);
  expect(await roadLines(page)).toHaveLength(2);
  /* Le propriétaire des distances ne sait plus répondre. */
  await page.evaluate(()=>{window.__legBackup=StoreRunnerRoadMatrixV248.leg;StoreRunnerRoadMatrixV248.leg=()=>null;document.dispatchEvent(new CustomEvent('store-runner:road-cache-updated'))});
  await page.waitForTimeout(500);
  const cue=page.locator(CUE);
  await expect(cue).toBeVisible();
  await expect(cue).toContainText('Découché Mardi → Mercredi');await expect(cue).toContainText('Hôtel conseillé');
  expect(await visible(page,ROAD),'les lignes routières disparaissent').toBe(false);
  expect(await roadLines(page)).toEqual(['','']);
  const text=await cue.innerText();
  expect(text).not.toMatch(/≈|de route évités|\d+\s*km/);
  await expect(cue).toHaveAttribute('aria-label','Découché Mardi → Mercredi · 15/09 → 16/09. Afficher l’hôtel conseillé.');
  expect(await page.evaluate(()=>window.overnightCandidate().night)).toBe('Nuit Mardi → Mercredi');
  expect(await page.locator('#dayTabs .hotelDayBadge[data-overnight]').count()).toBe(1);
  /* Le propriétaire répond de nouveau : les chiffres reviennent (événement existant du cache routier). */
  await page.evaluate(()=>{StoreRunnerRoadMatrixV248.leg=window.__legBackup;document.dispatchEvent(new CustomEvent('store-runner:road-cache-updated'))});
  await page.waitForTimeout(500);
  expect(await roadLines(page)).toHaveLength(2);expect(await visible(page,ROAD)).toBe(true);
  expect(errors).toEqual([]);
});

for(const width of [390,360]){
  test(`Clair et sombre à ${width} px : lignes lisibles, sans débordement`,async({page})=>{
    await page.setViewportSize({width,height:844});
    const errors=await boot(page);
    await seed(page,FAR);
    for(const mode of ['light','dark']){
      const r=await page.evaluate(async({sel,mode})=>{
        await window.StoreRunnerAppearance.set({mode});
        await new Promise(x=>setTimeout(x,250));
        const cue=document.querySelector(sel),road=cue.querySelector('[data-overnight-road]'),title=cue.querySelector('[data-overnight-title]');
        const rgb=c=>(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
        const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
        const contrast=(a,b)=>{const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
        const stop=(getComputedStyle(cue).backgroundImage.match(/rgba?\([^)]+\)/)||['rgb(255,255,255)'])[0];
        const route=road.querySelector('[data-overnight-route]'),gain=road.querySelector('[data-overnight-gain]'),cr=cue.getBoundingClientRect();
        return{theme:document.documentElement.getAttribute('data-sr-theme'),routeContrast:contrast(getComputedStyle(route).color,stop),gainContrast:contrast(getComputedStyle(gain).color,stop),
          sameInk:getComputedStyle(gain).color===getComputedStyle(title).color,overflow:document.documentElement.scrollWidth-window.innerWidth,
          inside:cr.left>=0&&cr.right<=window.innerWidth,height:cr.height,gainBold:Number(getComputedStyle(gain).fontWeight)>=600};
      },{sel:CUE,mode});
      expect(r.theme).toBe(mode);
      expect(r.routeContrast,mode+' route').toBeGreaterThanOrEqual(4.5);expect(r.gainContrast,mode+' gain').toBeGreaterThanOrEqual(4.5);
      expect(r.sameInk).toBe(true);expect(r.gainBold).toBe(true);
      expect(r.overflow).toBeLessThanOrEqual(1);expect(r.inside).toBe(true);expect(r.height).toBeLessThanOrEqual(130);
      expect(await surfaces(page)).toHaveLength(1);
    }
    expect(errors).toEqual([]);
  });
}
