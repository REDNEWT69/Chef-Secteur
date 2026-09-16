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
      activeContract:{sector:'Zone Ancienne',brand:'SCHMIDT',city:'TEST-NORD',clientNumber:'111',startDate:'2026-03-01',endDate:'2027-02-28',status:'En cours',objective:7200,realized:6300,progress:.875,monthsRemaining:6,closure:'25%',toInvoice:150,portfolio:1200,products:['BRBTEST']},
      lastContract:null,history:[]
    }]});
    A.saveTariff(db,{type:'tariff',importedAt:'2026-09-16T12:00:00Z',products:[{family:'REF',segment:'COMBINE',refSchmidt:'BRBTEST0',refCommercial:'BRBTEST',refSap:'BRBTEST',description:'Combiné test',type:'BIP',purchasePrice:600,contractObjective:7200}]});
    const host=document.createElement('div');host.id='cuiV193E2E';host.style.width='100%';document.body.appendChild(host);
    const card=A.createBriefing('cui-e2e');if(!card)throw new Error('Brief V193 non rendu');host.appendChild(card);
    const box=card.getBoundingClientRect();
    return{text:card.textContent,width:box.width,viewport:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,planStable:before===JSON.stringify(window.state.plan),priority:store.priority,signal:A.planningSignal('cui-e2e')};
  });
  expect(result.text).toContain('Contrat expo');expect(result.text).toContain('87,5 %');expect(result.text).toContain('6 mois');expect(result.text).toContain('BRBTEST');
  expect(result.signal.source).toBe('Contrat expo');expect(result.width).toBeLessThanOrEqual(result.viewport);expect(result.overflow).toBeLessThanOrEqual(1);expect(result.planStable).toBe(true);expect(result.priority).toBe(4);expect(errors).toEqual([]);
});
