/* Découché J1 → J2, incrément 1 — le bloc d'information du Planning, dans l'application réelle (390 px).
   Il n'existe que s'il y a une opportunité, ne propose aucune action, n'écrit rien, lit ses distances chez
   StoreRunnerRoadMatrixV248 (ici l'estimation du planning : localhost n'amorce pas OSRM) et reste lisible en
   mode sombre. Fixture inventée : un domicile, deux magasins éloignés, deux jours enchaînés. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

const LYON={lat:45.764,lon:4.8357};
const BLOCK='#planningOvernightOpportunity';

async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-14T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&document.getElementById('planPanel')&&window.StoreRunnerRoadMatrixV248&&window.StoreRunnerTerrainPlanningV1);
  return errors;
}
/* Mardi 15 : Annemasse ; mercredi 16 : Annecy (ou ce que `o` remplace). */
async function seed(page,o){
  await page.evaluate(opts=>{
    const st=window.state;
    const mk=(id,ville,lat,lon)=>({id,enseigne:'Enseigne '+id,ville,adresse:'1 rue Test',dept:'99',lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.profile=Object.assign({},st.profile,{baseName:'Lyon',baseAddress:'Lyon',baseLat:opts.base?opts.base.lat:null,baseLon:opts.base?opts.base.lon:null,overnightMode:opts.mode||'auto',overnightMinSaving:80});
    st.stores=[mk('a',opts.aCity||'Annemasse',opts.a.lat,opts.a.lon),mk('b',opts.bCity||'Annecy',opts.b.lat,opts.b.lon),mk('c','Chambéry',45.5646,5.9178)];
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',maxVisitsPerDay:4});
    st.plan={Lundi:[],Mardi:[st.stores[0]],Mercredi:opts.emptyJ2?[]:[st.stores[1]],Jeudi:[],Vendredi:[],Samedi:[]};
    st.excluded={};st.included={};st.locks={};st.calendarEvents=opts.calendarEvents||[];st.appointments=opts.appointments||[];st.hotelReservations=opts.hotelReservations||{};
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },o);
  await page.waitForTimeout(2200);
}
const FAR={base:LYON,a:{lat:46.1936,lon:6.2342},b:{lat:45.8992,lon:6.1294}};
const present=page=>page.evaluate(sel=>{const el=document.querySelector(sel);return !!(el&&el.isConnected&&el.getClientRects().length)},BLOCK);
const lines=page=>page.evaluate(sel=>[...document.querySelectorAll(sel+' > div')].map(d=>d.textContent),BLOCK);
const duration=m=>{const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+String(r).padStart(2,'0'):''):r+' min'};

test('Le découché conseillé s’affiche en quatre lignes, depuis les distances du propriétaire, sans rien écrire',async({page})=>{
  const errors=await boot(page);
  const appointments=[{id:'r1',storeId:'b',date:'2026-09-16',time:'09:30',duration:60,type:'Rendez-vous',note:'Le gérant'}];
  await seed(page,{...FAR,appointments});
  expect(await present(page)).toBe(true);

  /* Les nombres affichés sont exactement ceux de StoreRunnerRoadMatrixV248.leg (même source que le planning). */
  const owner=await page.evaluate(()=>{
    const V=window.StoreRunnerRoadMatrixV248,a=state.stores[0],b=state.stores[1],h={lat:state.profile.baseLat,lon:state.profile.baseLon};
    const l1=V.leg(a,h),l2=V.leg(h,b),l3=V.leg(a,b);
    return{km:l1.distanceKm+l2.distanceKm-l3.distanceKm,min:l1.durationMinutes+l2.durationMinutes-l3.durationMinutes,sources:[l1,l2,l3].map(l=>l.source)};
  });
  expect(owner.km).toBeGreaterThan(100);
  const km=Math.round(Math.round(owner.km*10)/10/5)*5,min=Math.round(Math.round(owner.min)/5)*5;
  const shown=await lines(page);
  expect(shown).toEqual([
    'Découchage conseillé · Mardi → Mercredi',
    'Annemasse → secteur Annecy',
    '≈ '+km+' km et '+duration(min)+' de route évités',
    'Raison : retour à la base puis nouveau départ nettement moins efficace.']);

  /* Information seule : rien d'interactif, rien de flottant, pas de modal. */
  const shape=await page.evaluate(sel=>{
    const el=document.querySelector(sel),cs=getComputedStyle(el),r=el.getBoundingClientRect();
    const timeline=document.querySelector('#planPanel .timelineShell'),tools=document.getElementById('planningToolsV2'),coverage=document.getElementById('planningCoverageV263');
    const rel=(a,b)=>a&&b?(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?'before':'after'):'n/a';
    return{position:cs.position,left:r.left,right:r.right,width:r.width,height:r.height,overflowX:document.documentElement.scrollWidth-window.innerWidth,
      interactive:el.querySelectorAll('button,a,input,select,textarea,[tabindex],[onclick]').length+(el.matches('button,a,[tabindex],[onclick]')?1:0),
      dialogOpen:!!document.querySelector('dialog[open],[role="dialog"]:not([hidden])'),
      toolsBefore:rel(tools,el),timelineAfter:rel(el,timeline),coverageBefore:coverage?rel(coverage,el):'absent',role:el.getAttribute('role'),inPlan:!!el.closest('#planPanel .applePlan')};
  },BLOCK);
  expect(shape.position).toBe('static');
  expect(shape.left).toBeGreaterThanOrEqual(8);expect(shape.right).toBeLessThanOrEqual(382);
  expect(shape.overflowX).toBeLessThanOrEqual(1);
  expect(shape.height).toBeLessThanOrEqual(140);
  expect(shape.interactive).toBe(0);
  expect(shape.dialogOpen).toBe(false);
  expect(shape.toolsBefore).toBe('before');expect(shape.timelineAfter).toBe('before');
  expect(['before','absent']).toContain(shape.coverageBefore);
  expect(shape.role).toBe('note');expect(shape.inPlan).toBe(true);

  /* Coexistence avec la pastille V189 : jamais superposés. */
  const overlap=await page.evaluate(sel=>{
    const a=document.querySelector(sel).getBoundingClientRect(),cue=document.getElementById('planningOvernightCueV206');
    if(!cue)return'no-cue';const b=cue.getBoundingClientRect();return a.top<b.bottom&&b.top<a.bottom&&a.left<b.right&&b.left<a.right?'overlap':'ok';
  },BLOCK);
  expect(['ok','no-cue']).toContain(overlap);

  /* Non destructif : changer de jour, de semaine, redéclencher des rendus ne touche ni plan, ni RDV, ni verrous, ni hôtels. */
  const snapshot=()=>page.evaluate(()=>JSON.stringify({plan:state.plan,appointments:state.appointments,locks:state.locks,included:state.included,excluded:state.excluded,hotels:state.hotelReservations,origins:state.dayOrigins||null}));
  const before=await snapshot();
  await page.locator('#dayTabs .dayTab[data-date="2026-09-17"]').click();await page.waitForTimeout(300);
  expect(await present(page)).toBe(true);
  expect((await lines(page))[0]).toBe('Découchage conseillé · Mardi → Mercredi');
  await page.evaluate(()=>{for(let i=0;i<3;i++)document.dispatchEvent(new CustomEvent('store-runner:planning-updated'))});
  await page.waitForTimeout(400);
  expect(await page.locator(BLOCK).count()).toBe(1);
  expect(await snapshot()).toBe(before);
  expect(await page.evaluate(()=>state.appointments.length&&state.appointments[0].time+'|'+state.appointments[0].date+'|'+state.plan.Mercredi.length)).toBe('09:30|2026-09-16|1');
  expect(errors).toEqual([]);
});

test('Aucune opportunité : aucune trace — gain faible, base inconnue, J2 vide, férié, nuit réservée, mode Jamais',async({page})=>{
  const errors=await boot(page);
  const none=async(label,o)=>{await seed(page,{...FAR,...o});expect(await page.locator(BLOCK).count(),label).toBe(0)};

  await none('gain faible : deux magasins à 8 km de la base',{a:{lat:45.8,lon:4.9},b:{lat:45.78,lon:4.88}});
  /* Sans base : ni le bloc, ni l'ancienne pastille V189 (qui lisait le point 0,0 du noyau). */
  await none('base inconnue',{base:null});
  expect(await page.evaluate(()=>typeof window.overnightCandidate==='function'?window.overnightCandidate():'absent')).toBeNull();
  expect(await page.locator('#planningOvernightCueV206').count()).toBe(0);
  await none('J2 sans visite',{emptyJ2:true});
  await none('mercredi férié',{calendarEvents:[{id:'f',date:'2026-09-16',title:'Jour férié',allDay:true}]});
  await none('hôtel déjà réservé pour la nuit',{hotelReservations:{'2026-09-15':{fromDate:'2026-09-15',toDate:'2026-09-16',hotelName:'Hôtel du Lac'}}});
  await none('mode Jamais',{mode:'never'});
  /* La preuve inverse : la même fixture, sans l'obstacle, affiche bien le bloc. */
  await seed(page,FAR);expect(await present(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('Le bloc reste lisible en mode sombre et ne déborde pas',async({page})=>{
  const errors=await boot(page);
  await seed(page,FAR);
  const ratio=await page.evaluate(async sel=>{
    await window.StoreRunnerAppearance.set({mode:'dark'});
    await new Promise(r=>setTimeout(r,200));
    const el=document.querySelector(sel),title=el.querySelector('.ovTitle'),reason=el.querySelector('.ovReason');
    const rgb=c=>(c.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
    const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
    const bg=getComputedStyle(el).backgroundColor,L=x=>lum(rgb(x));
    const contrast=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
    return{theme:document.documentElement.getAttribute('data-sr-theme'),bg,title:contrast(getComputedStyle(title).color,bg),reason:contrast(getComputedStyle(reason).color,bg),overflow:document.documentElement.scrollWidth-window.innerWidth};
  },BLOCK);
  expect(ratio.theme).toBe('dark');
  expect(ratio.bg).not.toBe('rgb(255, 255, 255)');
  expect(ratio.title).toBeGreaterThanOrEqual(4.5);
  expect(ratio.reason).toBeGreaterThanOrEqual(4.5);
  expect(ratio.overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
