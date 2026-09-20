const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* V229 — suivi commercial des contrats expo. Le module se charge en différé comme V193
   et V225 : on attend les trois avant de semer quoi que ce soit. */
const ready=page=>page.waitForFunction(()=>window.StoreRunnerCuisinisteV193&&window.StoreRunnerCuisinisteFollowupV229&&window.state&&window.__chefStorage);

const SEED=()=>{
  const C=window.StoreRunnerCuisinisteV193,db=window.__chefStorage;
  const cuisiniste={id:'fu-cui',enseigne:'Schmidt',ville:'Ville Suivi',adresse:'1 rue Expo',priority:4,active:true};
  const retail={id:'fu-retail',enseigne:'Boulanger',ville:'Ville Retail',adresse:'2 rue Brun',priority:3,active:true};
  window.state.stores=[cuisiniste,retail];
  window.state.plan={Lundi:[cuisiniste],Mardi:[retail],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  C.saveTracking(db,{type:'tracking',sector:'Secteur Suivi',importedAt:'2026-09-19T10:00:00Z',sites:[
    {key:'SCH-VILLE SUIVI FR-00001',brand:'SCHMIDT',city:'Ville Suivi',cityKey:'ville suivi',postal:'00001',label:'SCH-VILLE SUIVI FR-00001',
     activeContract:{sector:'Secteur Suivi',brand:'SCHMIDT',city:'Ville Suivi',clientNumber:'900',startDate:'2026-01-01',endDate:'2026-11-30',
       status:'En cours',objective:7200,realized:3600,progress:.5,monthsRemaining:2,products:[{ref:'EXPO1'}]},
     lastContract:null,history:[]},
    {key:'CUI-VILLE AUTRE FR-00002',brand:'CUISINELLA',city:'Ville Autre',cityKey:'ville autre',postal:'00002',label:'CUI-VILLE AUTRE FR-00002',
     activeContract:null,lastContract:null,history:[]}
  ]});
  C.saveTariff(db,{type:'tariff',importedAt:'2026-09-19T11:00:00Z',products:[
    {family:'REF',segment:'COMBINE',refSchmidt:'EXPO10',refCommercial:'EXPO1',refSap:'EXPO1',description:'Combiné',type:'BIP',purchasePrice:600,contractObjective:7200},
    {family:'REF',segment:'FROID',refSchmidt:'EXPO20',refCommercial:'EXPO2',refSap:'EXPO2',description:'Froid',type:'BIP',purchasePrice:500,contractObjective:5400}
  ]});
  return JSON.stringify(window.state.plan);
};

const openStore=(page,id)=>page.evaluate(storeId=>{
  window.openStoreQuick(storeId,'Lundi');
  window.StoreRunnerCuisinisteV193.renderStoreCard();
},id);

test('Le suivi commercial s’affiche au-dessus du contrat, sans déborder à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  const planBefore=await page.evaluate(SEED);
  await openStore(page,'fu-cui');

  const section=page.locator('#srCuisineFollowupV229');
  await expect(section).toBeVisible();
  await expect(section).toContainText('Suivi commercial');
  await expect(section).toContainText('Prochaine action : aucune');
  await expect(section).toContainText('Dernière action : aucune');

  // Ordre mobile exigé : le suivi commercial passe AVANT la carte contrat de V193.
  const order=await page.evaluate(()=>{
    const s=document.getElementById('srCuisineFollowupV229'),c=document.getElementById('srCuisineContractCard');
    if(!s||!c)return null;
    return (s.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING)?'suivi-avant':'contrat-avant';
  });
  expect(order).toBe('suivi-avant');

  const box=await page.evaluate(()=>{
    const s=document.getElementById('srCuisineFollowupV229').getBoundingClientRect();
    return{width:s.width,viewport:document.documentElement.clientWidth,
      overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  expect(box.width).toBeLessThanOrEqual(box.viewport);
  expect(box.overflow).toBeLessThanOrEqual(1);

  // Une seule carte contrat : le suivi n'en ouvre pas une deuxième.
  expect(await page.locator('#srCuisineContractCard').count()).toBe(1);
  expect(await page.evaluate(p=>p===JSON.stringify(window.state.plan),planBefore)).toBe(true);
  expect(errors).toEqual([]);
});

test('Un statut et une action posés restent après rechargement de la fiche',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await openStore(page,'fu-cui');

  await page.evaluate(()=>{
    const F=window.StoreRunnerCuisinisteFollowupV229,db=window.__chefStorage,key='SCH-VILLE SUIVI FR-00001';
    F.setStatus(db,key,'attente-signature');
    F.addAction(db,key,{type:'relance',date:'2026-09-18',note:'Relance téléphonique'});
    F.setNextAction(db,key,{label:'Rappeler le magasin',dueDate:'2026-09-15',type:'relance'});
    window.StoreRunnerCuisinisteV193.renderStoreCard();
  });

  const section=page.locator('#srCuisineFollowupV229');
  await expect(section).toContainText('En attente de signature');
  await expect(section).toContainText('Rappeler le magasin');
  await expect(section).toContainText('Relance effectuée');
  await expect(section).toContainText('Relance en retard');
  await expect(section).toContainText('Historique · 2');

  // Le statut importé du contrat n'est jamais remplacé par le statut de workflow.
  await expect(page.locator('#srCuisineContractCard')).toContainText('En cours');

  // Rechargement complet : la donnée vient bien du stockage V193, pas de la page.
  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(()=>{
    const s={id:'fu-cui',enseigne:'Schmidt',ville:'Ville Suivi',adresse:'1 rue Expo',priority:4,active:true};
    window.state.stores=[s];window.state.plan={Lundi:[s],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  });
  await openStore(page,'fu-cui');
  await expect(page.locator('#srCuisineFollowupV229')).toContainText('En attente de signature');
  await expect(page.locator('#srCuisineFollowupV229')).toContainText('Rappeler le magasin');
  expect(errors).toEqual([]);
});

test('Un magasin retail n’affiche aucun suivi cuisiniste',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await openStore(page,'fu-cui');
  await expect(page.locator('#srCuisineFollowupV229')).toBeVisible();
  await openStore(page,'fu-retail');
  expect(await page.locator('#srCuisineFollowupV229').count()).toBe(0);
  expect(await page.evaluate(()=>window.storeChannel({id:'fu-retail',enseigne:'Boulanger'}))).toBe('retail');
  expect(errors).toEqual([]);
});

test('L’écran Contrats expo filtre les cuisinistes sans seconde liste',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(SEED);
  await page.evaluate(()=>{
    const F=window.StoreRunnerCuisinisteFollowupV229,db=window.__chefStorage;
    F.setStatus(db,'SCH-VILLE SUIVI FR-00001','attente-signature');
    F.setFilter('all');
    window.StoreRunnerCuisinisteV193.open();
  });
  const sheet=page.locator('#srCuisineSheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.fuSheetTabs button')).toHaveCount(5);
  expect(await sheet.locator('.srCuisineRow').count()).toBe(2);

  await sheet.locator('.fuSheetTabs button', {hasText:'En attente signature'}).tap();
  await expect(sheet.locator('.srCuisineRow')).toHaveCount(1);
  await expect(sheet.locator('.srCuisineRow')).toContainText('Ville Suivi');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await page.locator('#srCuisineSheet').count()).toBe(1);
  expect(errors).toEqual([]);
});

/* Revue d'import : l'utilisateur ne voit que ce qui demande une décision. On sème un site
   non rapproché et un site ambigu, sans passer par un vrai classeur. */
test('La revue d’import résume et ne montre que les cas à vérifier',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(()=>{
    const C=window.StoreRunnerCuisinisteV193,F=window.StoreRunnerCuisinisteFollowupV229,db=window.__chefStorage;
    const a={id:'imp-a',enseigne:'Schmidt',ville:'Ville Suivi',channel:'cuisiniste',active:true};
    const b={id:'imp-b',enseigne:'Schmidt',ville:'Ville Double',channel:'cuisiniste',active:true};
    const c={id:'imp-c',enseigne:'Schmidt',ville:'Ville Double',channel:'cuisiniste',active:true};
    const r={id:'imp-r',enseigne:'Boulanger',ville:'Ville Suivi',channel:'retail',active:true};
    window.state.stores=[a,b,c,r];
    window.state.plan={Lundi:[a],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    C.saveTracking(db,{type:'tracking',sector:'Secteur Suivi',importedAt:'2026-09-19T10:00:00Z',scanned:9,sites:[
      {key:'SCH-VILLE SUIVI FR-00001',brand:'SCHMIDT',city:'Ville Suivi',cityKey:'ville suivi',postal:'00001',
       activeContract:{status:'En cours',endDate:'2027-06-30',monthsRemaining:9},lastContract:null,history:[]},
      {key:'SCH-VILLE DOUBLE FR-00002',brand:'SCHMIDT',city:'Ville Double',cityKey:'ville double',postal:'00002',
       activeContract:{status:'En cours',endDate:'2027-06-30',monthsRemaining:9},lastContract:null,history:[]}
    ]});
    F.setFilter('all');
    C.open();
  });
  const review=page.locator('#srCuisineSheet .srCuisineReview');
  await expect(review).toBeVisible();
  await expect(review).toContainText('9 cuisinistes dans le fichier');
  await expect(review).toContainText('2 de mon secteur');
  await expect(review).toContainText('1 rapprochés');
  await expect(review).toContainText('1 à vérifier');
  // Seul le cas ambigu est proposé, et il propose un choix, jamais une confirmation.
  await expect(review.locator('.srCuisineReviewRow')).toHaveCount(1);
  await expect(review.locator('.srCuisineReviewRow')).toContainText('2 magasins possibles');
  await expect(review.locator('.srCuisineReviewRow select option')).toHaveCount(3);

  await review.locator('.srCuisineReviewRow select').selectOption('imp-c');
  await expect(page.locator('#srCuisineSheet .srCuisineReview')).toContainText('2 rapprochés');
  await expect(page.locator('#srCuisineSheet .srCuisineReview')).toContainText('0 à vérifier');

  // Le choix est persisté : il doit être reconnu sans nouvelle intervention.
  const kept=await page.evaluate(()=>window.StoreRunnerCuisinisteV193.resolveSites(window.__chefStorage,window.state.stores)
    .find(s=>s.city==='Ville Double'));
  expect(kept.storeId).toBe('imp-c');
  expect(kept.matchedBy).toBe('mapping');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

/* Le suivi saisi avant l'arrivée du fichier doit rejoindre la vraie clé de site. */
test('Le suivi posé avant l’import rejoint la clé de site sans rien perdre',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await page.evaluate(()=>{
    const F=window.StoreRunnerCuisinisteFollowupV229,db=window.__chefStorage;
    const s={id:'mig-a',enseigne:'Schmidt',ville:'Ville Migrée',channel:'cuisiniste',active:true};
    window.state.stores=[s];
    window.state.plan={Lundi:[s],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    F.setStatus(db,F.fallbackKey('mig-a'),'proposition-presentee');
    F.addAction(db,F.fallbackKey('mig-a'),{type:'rdv',date:'2026-08-01',note:'Visite avant import'});
    F.setNextAction(db,F.fallbackKey('mig-a'),{label:'Repasser',dueDate:'2026-11-05',type:'relance'});
  });
  await openStore(page,'mig-a');
  await expect(page.locator('#srCuisineFollowupV229')).toContainText('Proposition présentée');

  // Le fichier arrive ensuite et nomme enfin ce magasin.
  await page.evaluate(()=>{
    window.StoreRunnerCuisinisteV193.saveTracking(window.__chefStorage,{type:'tracking',sector:'Secteur Suivi',
      importedAt:'2026-09-20T10:00:00Z',sites:[{key:'SCH-VILLE MIGREE FR-00007',brand:'SCHMIDT',city:'Ville Migrée',
        cityKey:'ville migree',postal:'00007',activeContract:{status:'En cours',endDate:'2027-06-30',monthsRemaining:9},
        lastContract:null,history:[]}]});
  });
  await openStore(page,'mig-a');
  const migrated=await page.evaluate(()=>{
    const F=window.StoreRunnerCuisinisteFollowupV229,V=window.StoreRunnerCuisinisteV193,db=window.__chefStorage;
    const f=F.followupFor(db,'SCH-VILLE MIGREE FR-00007');
    return{status:f.workflowStatus,next:f.nextAction&&f.nextAction.label,history:f.history.length,
      orphan:V.readStore(db).followups[F.fallbackKey('mig-a')]||null};
  });
  expect(migrated.status).toBe('proposition-presentee');
  expect(migrated.next).toBe('Repasser');
  expect(migrated.history).toBeGreaterThanOrEqual(2);
  expect(migrated.orphan).toBeNull();
  await expect(page.locator('#srCuisineFollowupV229')).toContainText('Proposition présentée');
  expect(errors).toEqual([]);
});
