const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V225 charge le moteur de proposition cuisiniste sans toucher au planning',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerCuisinisteV193&&window.StoreRunnerCuisinisteProposalV225&&window.state&&window.__chefStorage);
  const result=await page.evaluate(()=>{
    const C=window.StoreRunnerCuisinisteV193,P=window.StoreRunnerCuisinisteProposalV225,db=window.__chefStorage;
    const stores=[
      {id:'cui-a',enseigne:'Schmidt',ville:'Ville Alpha',priority:4,active:true},
      {id:'cui-b',enseigne:'Schmidt',ville:'Ville Beta',priority:3,active:true}
    ];
    window.state.stores=stores;
    window.state.plan={Lundi:[stores[0]],Mardi:[stores[1]],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const before=JSON.stringify(window.state.plan);
    C.saveTracking(db,{type:'tracking',sector:'Secteur Test',sites:[
      {key:'SCH-VILLE ALPHA FR-00001',brand:'SCHMIDT',city:'Ville Alpha',cityKey:'ville alpha',postal:'00001',activeContract:null,lastContract:{group:'GROUPE TEST',status:'Finalisé'}},
      {key:'SCH-VILLE BETA FR-00002',brand:'SCHMIDT',city:'Ville Beta',cityKey:'ville beta',postal:'00002',activeContract:null,lastContract:{group:'GROUPE TEST',status:'Finalisé'}}
    ],importedAt:'2026-09-19T10:00:00Z'});
    C.saveTariff(db,{type:'tariff',products:[
      {refSchmidt:'A0',refCommercial:'A1',refSap:'A1',contractObjective:7200,purchasePrice:600,infos:''},
      {refSchmidt:'B0',refCommercial:'B1',refSap:'B1',contractObjective:5400,purchasePrice:600,infos:'objectif x9'},
      {refSchmidt:'N0',refCommercial:'NOEXPO',refSap:'NOEXPO',contractObjective:1200,purchasePrice:100,infos:"PAS D'EXPO"}
    ],importedAt:'2026-09-19T11:00:00Z'});
    const proposal=P.buildProposal(db,[{storeId:'cui-a',refs:['A1']},{storeId:'cui-b',refs:['B1']}],stores);
    let rejected=false;try{P.buildProposal(db,[{storeId:'cui-a',refs:['A1','NOEXPO']}],stores)}catch(e){rejected=/pas d.expo/i.test(String(e.message||e))}
    return{objective:proposal.objective,count:proposal.productCount,stores:proposal.stores.length,rejected,planStable:before===JSON.stringify(window.state.plan),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  expect(result.objective).toBe(12600);
  expect(result.count).toBe(2);
  expect(result.stores).toBe(2);
  expect(result.rejected).toBe(true);
  expect(result.planStable).toBe(true);
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
