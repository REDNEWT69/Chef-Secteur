const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V193 affiche le contrat expo Secteur Test Nord à 390 px sans toucher au planning',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerCuisinisteV193&&window.state&&window.__chefStorage);
  const result=await page.evaluate(()=>{
    const A=window.StoreRunnerCuisinisteV193,db=window.__chefStorage;
    const store={id:'cui-e2e',enseigne:'Schmidt',ville:'Test-Nord',adresse:'1 rue Test',priority:4,active:true};
    window.state.stores=[store];
    window.state.plan={Lundi:[store],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const before=JSON.stringify(window.state.plan);
    A.saveTracking(db,{type:'tracking',sector:'Secteur Test Nord',importedAt:'2026-09-16T12:00:00Z',sites:[{
      key:'SCH-TEST-NORD FR-00001',brand:'SCHMIDT',city:'TEST-NORD',cityKey:'test nord',postal:'00001',label:'SCH-TEST-NORD FR-00001',
      activeContract:{sector:'Zone Ancienne',brand:'SCHMIDT',city:'TEST-NORD',clientNumber:'111',startDate:'2026-03-01',endDate:'2027-02-28',status:'En cours',objective:14400,realized:12600,progress:.875,monthsRemaining:6,closure:'25%',toInvoice:300,portfolio:1200,products:['BRBTEST'],groupContract:{key:'g|2026-03-01|2027-02-28',name:'GROUPE TEST',startDate:'2026-03-01',endDate:'2027-02-28',status:'En cours',objective:14400,realized:12600,progress:.875,monthsRemaining:6,closure:'25%',toInvoice:300,portfolio:2400,memberCount:2,members:[]},storeMetrics:{objective:null,realized:6300,portfolio:1200}},
      lastContract:null,history:[{sector:'Zone Ancienne',brand:'SCHMIDT',city:'TEST-NORD',clientNumber:'111',startDate:'2025-03-01',endDate:'2026-02-28',status:'Finalisé',objective:7200,realized:6900,progress:.958,monthsRemaining:null,closure:'25%',toInvoice:180,portfolio:0,products:['OLDREF'],storeMetrics:{objective:7200,realized:6900,portfolio:0}}]
    }]});
    A.saveTariff(db,{type:'tariff',importedAt:'2026-09-16T12:00:00Z',products:[{family:'REF',segment:'COMBINE',refSchmidt:'BRBTEST0',refCommercial:'BRBTEST',refSap:'BRBTEST',description:'Combiné test',type:'BIP',purchasePrice:600,contractObjective:7200}]});
    const host=document.createElement('div');host.id='cuiV193E2E';host.style.width='100%';document.body.appendChild(host);
    const card=A.createBriefing('cui-e2e');if(!card)throw new Error('Brief V193 non rendu');host.appendChild(card);
    A.open();
    const sheetText=document.getElementById('srCuisineSheet')?.textContent||'';
    const box=card.getBoundingClientRect();
    return{text:card.textContent,sheetText,width:box.width,viewport:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,planStable:before===JSON.stringify(window.state.plan),priority:store.priority,signal:A.planningSignal('cui-e2e')};
  });
  expect(result.text).toContain('Contrat expo');expect(result.text).toContain('GROUPE TEST');expect(result.text).toContain('Objectif groupe');expect(result.text).toContain('14 400 €');expect(result.text).toContain('CA magasin');expect(result.text).toContain('6 300 €');expect(result.text).toContain('87,5 %');expect(result.text).toContain('6 mois');expect(result.text).toContain('BRBTEST');expect(result.text).toContain('Historique : 2 contrats retrouvés');
  expect(result.sheetText).toContain('Contrat groupement : GROUPE TEST · 2 magasins');expect(result.sheetText).toContain('Groupe · objectif 14 400 € · réalisé 12 600 €');expect(result.sheetText).toContain('Groupe · facturation 25%');expect(result.sheetText).toContain('Ce magasin · réalisé 6 300 € · portefeuille 1 200 €');expect(result.sheetText).toContain('Historique contrats');
  expect(result.signal.source).toBe('Contrat expo');expect(result.width).toBeLessThanOrEqual(result.viewport);expect(result.overflow).toBeLessThanOrEqual(1);expect(result.planStable).toBe(true);expect(result.priority).toBe(4);expect(errors).toEqual([]);
});


test('V275 distingue clairement contrat groupement et chiffres de ce magasin à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerCuisinisteV193&&window.state&&window.__chefStorage);
  const result=await page.evaluate(()=>{
    const A=window.StoreRunnerCuisinisteV193,db=window.__chefStorage;
    const store={id:'cui-group-e2e',enseigne:'Schmidt',ville:'Ville Alpha',adresse:'1 rue Test',priority:4,active:true,channel:'cuisiniste',clientNumber:'111'};
    window.state.stores=[store];
    A.saveTracking(db,{type:'tracking',sector:'Secteur Test',sourceCount:2,importedAt:'2026-10-06T10:00:00Z',sites:[{
      key:'SCH-VILLE ALPHA FR-38300',brand:'SCHMIDT',city:'VILLE ALPHA',cityKey:'ville alpha',postal:'38300',label:'SCH-VILLE ALPHA FR-38300',
      activeContract:{sector:'Secteur Test',brand:'SCHMIDT',city:'VILLE ALPHA',clientNumber:'111',client:'SOCIETE TEST',group:'GROUPE TEST',startDate:'2025-12-01',endDate:'2026-11-30',status:'En cours',objective:14124,realized:13506,progress:.956,monthsRemaining:3,closure:'25%',toInvoice:294.25,portfolio:588.72,products:['BRBTEST','NVTEST'],
        groupContract:{key:'g|2025-12-01|2026-11-30',name:'GROUPE TEST',startDate:'2025-12-01',endDate:'2026-11-30',status:'En cours',objective:14124,realized:13506,progress:.956,monthsRemaining:3,closure:'25%',toInvoice:294.25,portfolio:2644.45,memberCount:2,members:[]},
        storeMetrics:{objective:null,realized:8154,portfolio:588.72}},
      lastContract:{sector:'Secteur Test',brand:'SCHMIDT',city:'VILLE ALPHA',clientNumber:'111',client:'SOCIETE TEST',group:'GROUPE TEST',startDate:'2024-05-01',endDate:'2025-06-30',status:'Finalisé',objective:21600,realized:16177.35,progress:.749,monthsRemaining:null,closure:'100%',toInvoice:1800,portfolio:588.72,products:['RFOLD'],
        groupContract:{key:'g|2024-05-01|2025-06-30',name:'GROUPE TEST',objective:21600,realized:16177.35,progress:.749,toInvoice:1800,portfolio:2644.45,memberCount:2,members:[]},
        storeMetrics:{objective:null,realized:13050.35,portfolio:588.72}},
      history:[
        {brand:'SCHMIDT',city:'VILLE ALPHA',clientNumber:'111',startDate:'2025-12-01',endDate:'2026-11-30',status:'En cours',objective:14124,realized:13506,progress:.956,monthsRemaining:3,products:['BRBTEST','NVTEST'],groupContract:{key:'g|2025-12-01|2026-11-30',name:'GROUPE TEST',objective:14124,realized:13506,progress:.956,memberCount:2},storeMetrics:{realized:8154,portfolio:588.72}},
        {brand:'SCHMIDT',city:'VILLE ALPHA',clientNumber:'111',startDate:'2024-05-01',endDate:'2025-06-30',status:'Finalisé',objective:21600,realized:16177.35,progress:.749,products:['RFOLD'],groupContract:{key:'g|2024-05-01|2025-06-30',name:'GROUPE TEST',objective:21600,realized:16177.35,progress:.749,memberCount:2},storeMetrics:{realized:13050.35,portfolio:588.72}}
      ]
    }]});
    const host=document.createElement('div');host.id='cuiV275E2E';host.style.width='100%';document.body.appendChild(host);
    const card=A.createBriefing('cui-group-e2e');if(!card)throw new Error('Brief V275 non rendu');host.appendChild(card);
    const box=card.getBoundingClientRect();
    return{text:card.textContent,width:box.width,viewport:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  expect(result.text).toContain('Groupement : GROUPE TEST');
  expect(result.text).toContain('Objectif groupe14 124 €');
  expect(result.text).toContain('Réalisé groupe13 506 €');
  expect(result.text).toContain('CA magasin8 154 €');
  expect(result.text).toContain('Historique : 2 contrats retrouvés');
  expect(result.width).toBeLessThanOrEqual(result.viewport);expect(result.overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
});
