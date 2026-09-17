/* La pastille 🌙 du découché doit se poser sur LE bon jour.
   Fixture inventée : une base et quatre magasins éloignés, deux jours enchaînés. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

async function seed(page,days,plan){
  await page.evaluate(({days,plan})=>{
    const st=window.state;
    const mk=(id,lat,lon,v)=>({id,enseigne:'Enseigne '+id,ville:v,adresse:'1 rue Test',dept:'99',
      lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.profile=Object.assign({},st.profile,{baseName:'Base test',baseAddress:'Base',
      baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:40});
    st.stores=[mk('a',48.6,1,'Ville-Test 01'),mk('b',48.62,1.02,'Ville-Test 02'),
               mk('c',48.64,1.04,'Ville-Test 03'),mk('d',48.66,1.06,'Ville-Test 04')];
    st.settings=Object.assign({},st.settings,{days,weekDate:'2026-09-14',maxVisitsPerDay:4});
    st.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.plan[plan[0]]=[st.stores[0],st.stores[1]];
    st.plan[plan[1]]=[st.stores[2],st.stores[3]];
    st.excluded={};st.included={};st.locks={};st.calendarEvents=[];st.appointments=[];
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },{days,plan});
  await page.waitForTimeout(2200);
}
const badges=page=>page.evaluate(()=>[...document.querySelectorAll('#dayTabs .dayTab')]
  .filter(b=>b.querySelector('.hotelDayBadge'))
  .map(b=>b.dataset.date+' → '+b.querySelector('.hotelDayBadge').textContent));

test('La lune du découché se pose sur le jour du découché, une seule fois',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-14T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&document.getElementById('planPanel')&&typeof window.overnightCandidate==='function');

  /* 1. Semaine complète : le découché tombe lundi, la pastille est sur lundi. */
  await seed(page,['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],['Lundi','Mardi']);
  expect(await page.evaluate(()=>window.overnightCandidate().night)).toBe('Nuit Lundi → Mardi');
  expect(await badges(page)).toEqual(['2026-09-14 → 🌙 découché']);

  /* V206 : même si un autre jour est sélectionné, la lune reste visible sans agrandir
     la tuile du découché et un raccourci permet de rejoindre directement l'hôtel. */
  await page.locator('#dayTabs .dayTab[data-date="2026-09-16"]').click();
  await page.waitForTimeout(120);
  const inactiveBadge=await page.evaluate(()=>{
    const tab=document.querySelector('#dayTabs .dayTab[data-date="2026-09-14"]'),badge=tab&&tab.querySelector('.hotelDayBadge');
    if(!tab||!badge)return null;
    const cs=getComputedStyle(badge),before=getComputedStyle(badge,'::before');
    return{active:tab.classList.contains('active'),display:cs.display,position:cs.position,width:badge.getBoundingClientRect().width,before:before.content};
  });
  expect(inactiveBadge).not.toBeNull();
  expect(inactiveBadge.active).toBe(false);
  expect(inactiveBadge.display).not.toBe('none');
  expect(inactiveBadge.position).toBe('absolute');
  expect(inactiveBadge.width).toBeLessThanOrEqual(20);
  expect(inactiveBadge.before).toContain('🌙');

  const cue=page.locator('#planningOvernightCueV206');
  await expect(cue).toBeVisible();
  await expect(cue).toContainText('Découché Lundi → Mardi');
  await expect(cue).toContainText('Hôtel conseillé');

  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('store-runner:planning-user-opened')));
  await page.waitForTimeout(80);
  await expect(cue).toHaveClass(/is-pulsing/);

  await cue.click();
  await page.waitForTimeout(180);
  expect(await page.locator('#dayTabs .dayTab.active').getAttribute('data-date')).toBe('2026-09-14');
  await expect(page.locator('#overnightBox')).toContainText('Zone hôtel conseillée');
  await expect(page.locator('#overnightBox')).toHaveClass(/srHotelFocusV206/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);

  /* 2. Semaine sans lundi : la position de l'onglet ne vaut plus le jour.
        C'est le cas qui décalait la pastille d'un cran. */
  await seed(page,['Mardi','Mercredi','Jeudi','Vendredi'],['Mardi','Mercredi']);
  expect(await page.evaluate(()=>window.overnightCandidate().night)).toBe('Nuit Mardi → Mercredi');
  expect(await badges(page)).toEqual(['2026-09-15 → 🌙 découché']);

  /* 3. Période de trois semaines : trois lundis affichés, une seule pastille,
        sur le lundi de la semaine réellement concernée. */
  await seed(page,['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],['Lundi','Mardi']);
  await page.evaluate(()=>{
    const db=window.__chefStorage||localStorage;
    db.setItem('chef_sector_range_v1',JSON.stringify({start:'2026-09-14',end:'2026-10-02'}));
    try{renderAll()}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await page.waitForTimeout(2200);
  const lundis=await page.evaluate(()=>[...document.querySelectorAll('#dayTabs .dayTab')]
    .map(b=>b.dataset.date).filter(d=>['2026-09-14','2026-09-21','2026-09-28'].includes(d)));
  expect(lundis).toEqual(['2026-09-14','2026-09-21','2026-09-28']);
  expect(await badges(page)).toEqual(['2026-09-14 → 🌙 découché']);

  /* 4. Découché désactivé : plus aucune pastille ni raccourci. */
  await page.evaluate(()=>{
    window.state.profile.overnightMode='never';
    try{save()}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await page.waitForTimeout(1200);
  expect(await badges(page)).toEqual([]);
  await expect(page.locator('#planningOvernightCueV206')).toHaveCount(0);

  expect(errors).toEqual([]);
});


test('V207 : depuis le 17, le découché du 21 est déjà signalé sans charger sa semaine',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-17T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&document.getElementById('planPanel')&&window.StoreRunnerStoreControlsV189&&typeof window.overnightCandidate==='function');
  await page.evaluate(()=>{
    const st=window.state;
    const mk=(id,lat,lon,v)=>({id,enseigne:'Enseigne '+id,ville:v,adresse:'1 rue Test',dept:'99',lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.profile=Object.assign({},st.profile,{baseName:'Base test',baseAddress:'Base',baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:40});
    st.stores=[mk('a',48.6,1,'Ville-Test 01'),mk('b',48.62,1.02,'Ville-Test 02'),mk('c',48.64,1.04,'Ville-Test 03'),mk('d',48.66,1.06,'Ville-Test 04')];
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',maxVisitsPerDay:4});
    st.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[st.stores[0]],Vendredi:[],Samedi:[]};
    st.excluded={};st.included={};st.locks={};st.calendarEvents=[];st.appointments=[];
    const next={Lundi:[st.stores[0],st.stores[1]],Mardi:[st.stores[2],st.stores[3]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const db=window.__chefStorage||localStorage;
    db.setItem('chef_sector_range_v1',JSON.stringify({start:'2026-09-14',end:'2026-09-25',workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']}));
    db.setItem('chef_sector_plan_archive_v1',JSON.stringify({'2026-09-21':{weekMonday:'2026-09-21',plan:next}}));
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
    document.dispatchEvent(new CustomEvent('store-runner:planning-user-opened'));
  });
  await page.waitForTimeout(700);

  expect(await page.evaluate(()=>window.state.settings.weekDate)).toBe('2026-09-14');
  expect(await page.evaluate(()=>window.overnightCandidate())).toBeNull();
  expect(await page.locator('#dayTabs .dayTab.active').getAttribute('data-date')).toBe('2026-09-17');
  /* La lune doit être visible sur le 21, peu importe qui la dessine : la vraie pastille
     posée par la bande, ou le repli CSS ::before de l'onglet si un autre module l'avait
     effacée. Depuis que chaque module ne nettoie plus que ses propres pastilles, c'est la
     vraie qui survit - et elle porte en plus son libellé accessible, ce qu'un
     pseudo-élément ne peut pas faire. */
  const futureMoon=await page.evaluate(()=>{
    const tab=document.querySelector('#dayTabs .dayTab[data-date="2026-09-21"]');if(!tab)return null;
    const badge=tab.querySelector('.hotelDayBadge'),tabBefore=getComputedStyle(tab,'::before');
    const drawn=badge
      ?{source:'badge',content:getComputedStyle(badge,'::before').content+badge.textContent,display:getComputedStyle(badge).display,label:badge.getAttribute('aria-label')}
      :{source:'fallback',content:tabBefore.content,display:tabBefore.display,label:null};
    return{className:tab.className,...drawn};
  });
  expect(futureMoon).not.toBeNull();
  expect(futureMoon.className).toContain('srOvernightDayV207');
  expect(futureMoon.content).toContain('🌙');
  expect(futureMoon.display).not.toBe('none');
  expect(futureMoon.source).toBe('badge');
  expect(futureMoon.label).toBe('Découché Lundi → Mardi · 21/09 → 22/09');

  const cue=page.locator('#planningOvernightCueV206');
  await expect(cue).toBeVisible();
  await expect(cue).toContainText('Découché Lundi → Mardi · 21/09 → 22/09');
  expect(await cue.getAttribute('data-date')).toBe('2026-09-21');

  const ring=await page.evaluate(()=>{
    const tab=document.querySelector('#dayTabs .dayTab[data-date="2026-09-21"]');if(!tab)return null;
    const pseudo=getComputedStyle(tab,'::after');
    return{className:tab.className,animationName:pseudo.animationName,animationDuration:pseudo.animationDuration};
  });
  expect(ring).not.toBeNull();
  expect(ring.className).toContain('srOvernightRingV207');
  expect(ring.animationName).toContain('srOvernightRingV207');
  expect(ring.animationDuration).not.toBe('0s');

  await cue.click();
  await page.waitForTimeout(260);
  expect(await page.locator('#dayTabs .dayTab.active').getAttribute('data-date')).toBe('2026-09-21');
  expect(await page.evaluate(()=>window.state.settings.weekDate)).toBe('2026-09-21');
  await expect(page.locator('#overnightBox')).toContainText('Zone hôtel conseillée');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
