const {test,expect,devices}=require('@playwright/test');
const M=require('../store-runner-visit-model.js');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const MAIN='sector_planner_universal_v1',DIALOG='#srVisitDialog';
function fixture(){const store={id:'auto-ai-cuisine',enseigne:'Schmidt',ville:'Ville-Test',channel:'cuisiniste',adresse:'1 rue Test',dept:'73',lat:45.5,lon:5.9,active:true,priority:2};return{schemaVersion:5,profile:{sectorName:'Test'},settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-10-05'},stores:[store],plan:{Lundi:[],Mardi:[],Mercredi:[store],Jeudi:[],Vendredi:[],Samedi:[]},visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[],manualWeekEdits:{},businessV2:M.empty()}}
async function ready(page){await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerVisitReport&&window.StoreRunnerBoot?.settled()&&window.__chefStorage);await page.waitForLoadState('load');await page.evaluate(async()=>{if(__chefStorage&&typeof __chefStorage.flush==='function')await __chefStorage.flush()})}
test.use({...devices['Pixel 7'],viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'block'});
test('V277.1 : Terminer déclenche l IA automatiquement sans laisser passer une invention',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-10-07T15:00:00+02:00'));
 await page.addInitScript(({MAIN,initial})=>localStorage.setItem(MAIN,JSON.stringify(initial)),{MAIN,initial:fixture()});
 await page.goto(APP,{waitUntil:'domcontentloaded'});await ready(page);
 await page.evaluate(()=>{window.__autoAICalls=0;window.aiConfig={gateway:'/api/ai'};window.callAIGateway=async()=>{window.__autoAICalls++;return{text:JSON.stringify({items:[
  {kind:'objection',text:'Bruno privilégie BSH en showroom.',source:'report.shared.context',status:'recorded'},
  {kind:'followup',text:'Revoir la gérante vendredi.',source:'report.shared.context',status:'planned'},
  {kind:'priority',text:'Commander 100 téléviseurs.',source:'report.shared.context',status:'planned'}
 ]})}}});
 const id=await page.evaluate(()=>StoreRunnerVisits.start('auto-ai-cuisine'));
 const field=page.locator(DIALOG+' label.sr-field').filter({hasText:'Rapport magasin'}).locator('textarea');
 await field.fill('Bruno privilégie BSH en showroom.\nRevoir la gérante vendredi.');
 await expect(page.locator(DIALOG+' .sr-status')).toContainText('Enregistré',{timeout:15000});
 page.once('dialog',d=>d.accept());await page.locator(DIALOG+' [data-sr-complete-visit]').tap();
 await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');
 await expect.poll(()=>page.evaluate(id=>state.businessV2.visits.find(v=>v.id===id)?.runnerAI?.status,id),{timeout:15000}).toBe('done');
 expect(await page.evaluate(()=>window.__autoAICalls)).toBe(1);
 expect(await page.evaluate(()=>!!window.StoreRunnerReportAIAutoV2771)).toBe(true);
 const memory=await page.evaluate(()=>StoreRunnerVisitModel.reportMemoryFor(state,'auto-ai-cuisine',{limit:100}).items);
 expect(memory.some(x=>x.kind==='objection'&&x.text==='Bruno privilégie BSH en showroom.')).toBe(true);
 expect(memory.some(x=>x.text.includes('100 téléviseurs'))).toBe(false);
 const saved=await page.evaluate(async id=>{await __chefStorage.flush();return JSON.parse(__chefStorage.getItem('sector_planner_universal_v1')).businessV2.visits.find(v=>v.id===id).runnerAI},id);
 expect(saved.status).toBe('done');
});
