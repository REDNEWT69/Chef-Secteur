/* Suggestions de proximité, vues dans un vrai navigateur mobile à 390 px.
   Fixture inventée : une journée avec un seul magasin planifié et sept voisins
   non planifiés à 0,1 / 3 / 3,5 / 5 / 7 / 8 / 9 km. */
const { test, expect } = require('@playwright/test');
const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const DEG_KM = 111.19492664455873;

test.use({
  viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:1,
  serviceWorkers:'block', screenshot:'only-on-failure', trace:'retain-on-failure'
});

async function seed(page, day){
  await page.evaluate(({day,DEG_KM})=>{
    const st=window.state;
    const at=km=>({lat:47+km/DEG_KM,lon:1});
    const mk=(id,km,extra)=>Object.assign({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,
      adresse:'1 rue Test',dept:'99',lat:at(km).lat,lon:at(km).lon,active:true,priority:3,
      intervalDays:30,freq:'Mensuel',products:['Blanc']},extra||{});
    const ancre=mk('anc',0);
    const voisins=[0.1,3,3.5,5,7,8,9].map((km,i)=>mk('v'+i,km));
    st.stores=[ancre,...voisins];
    st.profile=Object.assign({},st.profile,{baseName:'Base test',baseAddress:'Base',baseLat:47,baseLon:1});
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],
      weekDate:'2026-09-14',target:20,maxVisitsPerDay:8,startTime:'08:30',endTime:'18:00',visitMinutes:45,
      brands:[],products:[]});
    st.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.plan[day]=[ancre];
    st.included={};st.excluded={};st.locks={};st.appointments=[];st.calendarEvents=[];st.manualWeekEdits={};
    window.selectedPlanningDay=day;
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },{day,DEG_KM});
  await page.waitForTimeout(900);
}

/* La bande de jours porte la vraie date et c'est elle qui décide du jour
   courant : sans ce clic, le panneau reste sur le lundi de la semaine. */
async function selectDate(page, isoDate){
  const tab=page.locator('#dayTabs .periodDayTab[data-date="'+isoDate+'"]');
  await expect(tab).toHaveCount(1);
  await tab.click();
  await page.waitForTimeout(700);
}

async function open(page, fixedToday){
  await page.addInitScript(fixed=>{
    const Real=Date, at=Real.parse(fixed+'T09:00:00');
    class Fixed extends Real{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=Fixed;
  },fixedToday);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&Array.isArray(window.state.stores)&&document.getElementById('planPanel'));
}

test('Suggestions de proximité à 390 px : trois lignes un jour futur, rien un jour passé', async ({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  page.on('dialog',d=>d.accept().catch(()=>{}));

  /* On se place le mercredi : Jeudi est futur, Lundi est passé. */
  await open(page,'2026-09-16');

  /* --- jour passé : aucun bloc, pas même vide ---------------------------- */
  await seed(page,'Lundi');
  await selectDate(page,'2026-09-14');
  expect(await page.evaluate(()=>window.StoreRunnerManualPlanning.currentDay(window))).toBe('Lundi');
  await expect(page.locator('#planPanel .pmvSuggest')).toHaveCount(0);

  /* --- jour futur : trois suggestions, les plus proches ------------------ */
  await seed(page,'Jeudi');
  await selectDate(page,'2026-09-17');
  expect(await page.evaluate(()=>window.StoreRunnerManualPlanning.currentDay(window))).toBe('Jeudi');
  const zone=page.locator('#planPanel .pmvSuggest');
  await expect(zone).toHaveCount(1);
  const rows=zone.locator('.pmvSuggestRow');
  await expect(rows).toHaveCount(3);

  const names=await rows.locator('.pmvSuggestName').allTextContents();
  expect(names).toEqual(['Enseigne v0 Ville-Test v0','Enseigne v1 Ville-Test v1','Enseigne v2 Ville-Test v2']);
  const kms=await rows.locator('.pmvSuggestKm').allTextContents();
  expect(kms).toEqual(['≈ 0,1 km','≈ 3 km','≈ 3,5 km']);

  /* la zone est bien sous l'en-tête et avant l'astuce */
  const order=await page.evaluate(()=>[...document.querySelector('#planPanel .timelineShell').children].map(e=>e.className.split(' ')[0]));
  expect(order.indexOf('pmvSuggest')).toBe(order.indexOf('pmvHead')+1);
  expect(order.indexOf('pmvHint')).toBe(order.indexOf('pmvSuggest')+1);

  /* aucun magasin sans visite n'est proposé quand la journée est vide */
  await page.evaluate(()=>{window.state.plan.Jeudi=[];try{save()}catch(e){}document.dispatchEvent(new CustomEvent('store-runner:planning-updated'))});
  await page.waitForTimeout(600);
  await expect(page.locator('#planPanel .pmvSuggest')).toHaveCount(0);

  /* --- l'ajout emprunte le chemin manuel et la suggestion disparaît ------ */
  await seed(page,'Jeudi');
  await selectDate(page,'2026-09-17');
  const planAvant=await page.evaluate(()=>state.plan.Jeudi.map(s=>s.id));
  expect(planAvant).toEqual(['anc']);
  const bouton=page.locator('#planPanel .pmvSuggest .pmvSuggestRow').first().locator('.pmvSuggestAdd');
  const taille=await bouton.boundingBox();
  expect(taille.height).toBeGreaterThanOrEqual(44);
  await bouton.click();
  await page.waitForTimeout(1200);

  const apres=await page.evaluate(()=>({
    plan:state.plan.Jeudi.map(s=>s.id),
    priorites:state.stores.map(s=>s.priority),
    restantes:[...document.querySelectorAll('#planPanel .pmvSuggest .pmvSuggestName')].map(e=>e.textContent)
  }));
  expect(apres.plan).toEqual(['anc','v0']);
  expect(apres.priorites.every(p=>p===3)).toBe(true);
  expect(apres.restantes.some(n=>n.includes('v0'))).toBe(false);
  expect(apres.restantes.length).toBe(3);

  /* --- 390 px : rien ne déborde ----------------------------------------- */
  const debordement=await page.evaluate(()=>{
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)return'page';
    const bad=[...document.querySelectorAll('#planPanel .pmvSuggest *')].find(e=>e.scrollWidth>e.clientWidth+2&&e.clientWidth>0);
    return bad?bad.className:'';
  });
  expect(debordement).toBe('');

  /* --- le réglage du rayon existe et agit ------------------------------- */
  const champ=await page.evaluate(()=>{
    const el=document.getElementById('pmvRadiusKm');
    return el?{valeur:el.value,type:el.type}:null;
  });
  expect(champ).toEqual({valeur:'10',type:'number'});
  await page.evaluate(()=>{
    const el=document.getElementById('pmvRadiusKm');
    el.value='4';el.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForTimeout(500);
  await expect(page.locator('#planPanel .pmvSuggest .pmvSuggestRow')).toHaveCount(2);
  expect(await page.evaluate(()=>state.settings.suggestionRadiusKm)).toBe(4);

  /* --- pas de boucle : le panneau est déjà observé par le module, un rendu
         non idempotent se rappellerait lui-même sans fin. -------------------- */
  const churn=await page.evaluate(async()=>{
    const host=document.querySelector('#planPanel .pmvSuggest');
    if(!host)return -1;
    let n=0;
    const obs=new MutationObserver(m=>{n+=m.length});
    obs.observe(host,{childList:true,subtree:true,characterData:true});
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
    await new Promise(r=>setTimeout(r,2500));
    obs.disconnect();
    return n;
  });
  expect(churn).toBe(0);

  expect(errors).toEqual([]);
});
