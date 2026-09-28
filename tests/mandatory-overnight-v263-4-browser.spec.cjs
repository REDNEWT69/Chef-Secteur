/* V263.4 — découché obligatoire dans le vrai runtime.
   Les deux copies de la règle (auto-planning-fix.js et la copie V185 de v182-fixes.js)
   sont chargées ensemble : l'écran, la pastille et le statut de génération doivent dire
   la même chose. Fixture inventée : base (47, 1), fin de lundi à ~39 km, reprise mardi à
   ~45 km, ~6 km entre les deux, soit ~78 km économisés sous le seuil des 55 km. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

async function seed(page,mode,coords){
  await page.evaluate(({mode,coords})=>{
    const st=window.state;
    const mk=(id,[lat,lon])=>({id,enseigne:'Enseigne '+id,ville:'Ville-Test '+id,adresse:'1 rue Test',dept:'99',
      lat,lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.profile=Object.assign({},st.profile,{baseName:'Base test',baseAddress:'Base',
      baseLat:47,baseLon:1,overnightMode:mode,overnightMinSaving:40});
    st.stores=coords.map((c,i)=>mk('s'+i,c));
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',maxVisitsPerDay:4});
    st.plan={Lundi:[st.stores[0],st.stores[1]],Mardi:[st.stores[2],st.stores[3]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    st.excluded={};st.included={};st.locks={};st.calendarEvents=[];st.appointments=[];st.hotelReservations={};
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },{mode,coords});
  await page.waitForTimeout(1800);
}
const badges=page=>page.evaluate(()=>[...document.querySelectorAll('#dayTabs .dayTab')]
  .filter(b=>b.querySelector('.hotelDayBadge'))
  .map(b=>b.dataset.date+' → '+b.querySelector('.hotelDayBadge').textContent));

const NEAR=[[47.30,1],[47.35,1],[47.40,1.02],[47.45,1.04]];      // ~78 km économisés, zone à ~39 km
const LOCAL=[[47.02,1],[47.05,1],[47.06,1.01],[47.08,1]];        // < 20 km économisés

test('V263.4 : Obligatoire propose la nuit utile sous 55 km, Automatique et Jamais inchangés',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-14T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&document.getElementById('planPanel')&&typeof window.overnightCandidate==='function'&&typeof window.storeRunnerRefreshOvernightDecision==='function');

  /* 1. Automatique : zone à ~39 km, aucune nuit (comportement historique). */
  await seed(page,'auto',NEAR);
  const auto=await page.evaluate(()=>{const a=window.StoreRunnerStoreControlsV189.futureOvernightAnalysis();return{reason:a.reason,remote:Math.round(a.best.remoteKm),saving:Math.round(a.best.saving)}});
  expect(auto.reason).toBe('too-close');
  expect(auto.remote).toBeLessThan(55);
  expect(auto.saving).toBeGreaterThanOrEqual(20);
  expect(await badges(page)).toEqual([]);

  /* 2. Obligatoire : la même semaine propose la nuit Lundi → Mardi. */
  await seed(page,'mandatory',NEAR);
  expect(await page.evaluate(()=>window.overnightCandidate()&&window.overnightCandidate().night)).toBe('Nuit Lundi → Mardi');
  expect(await badges(page)).toEqual(['2026-09-14 → 🌙 découché']);
  /* V263.5 : le bandeau n'a qu'un seul rendu (V189), même quand le statut de génération
     le rafraîchit : il annonce la nuit sur place, jamais un refus contradictoire. */
  const box=page.locator('#overnightBox');
  await expect(box).toContainText('Nuit sur place');
  await expect(box).not.toContainText('Mode obligatoire actif, mais');
  const refreshed=await page.evaluate(()=>{const a=window.storeRunnerRefreshOvernightDecision(window.state.plan);return{night:a&&a.candidate&&a.candidate.night,box:document.getElementById('overnightBox').textContent}});
  expect(refreshed.night).toBe('Nuit Lundi → Mardi');
  expect(refreshed.box).toContain('Nuit sur place');
  expect(refreshed.box).not.toContain('Mode obligatoire actif, mais');

  /* Hôtel conseillé → réservation sans adresse : aucune position inventée, le lendemain
     demande son point de départ au lieu de repartir en silence du domicile. */
  await page.locator('#planningOvernightCueV206').click();
  await page.waitForTimeout(250);
  await expect(box).toContainText('Nuit sur place');
  await expect(box).toContainText('Zone hôtel conseillée');
  await page.locator('#srHotelNameV212').fill('Hôtel Test');
  await page.getByRole('button',{name:'Enregistrer la réservation'}).click();
  await page.waitForTimeout(300);
  const origin=await page.evaluate(()=>{const r=window.state.hotelReservations['2026-09-14'],o=window.StoreRunnerDayOrigin.originFor('2026-09-15');return{lat:r&&r.lat,lon:r&&r.lon,toDate:r&&r.toDate,pending:o.pending,type:o.type}});
  expect(origin).toEqual({lat:null,lon:null,toDate:'2026-09-15',pending:true,type:'base'});

  /* 3. Obligatoire sans gain utile (< 20 km) : aucune nuit forcée. */
  await seed(page,'mandatory',LOCAL);
  const local=await page.evaluate(()=>{const a=window.StoreRunnerStoreControlsV189.futureOvernightAnalysis();return{reason:a.reason,saving:a.best&&a.best.saving}});
  expect(local.reason).toBe('mandatory-no-useful');
  expect(local.saving).toBeLessThan(20);
  expect(await badges(page)).toEqual([]);

  /* 4. Jamais : aucune nuit, même sur la paire utile. */
  await seed(page,'never',NEAR);
  expect(await page.evaluate(()=>window.overnightCandidate())).toBeNull();
  expect(await badges(page)).toEqual([]);
  await expect(page.locator('#overnightBox')).toContainText('Découché désactivé');

  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
