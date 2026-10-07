const {test,expect,devices}=require('@playwright/test');
const M=require('../store-runner-visit-model.js');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const MAIN='sector_planner_universal_v1',TODAY='2026-10-07';
const DIALOG='#srVisitDialog',BRIEF='#homeRunnerBriefV276';
function fixture(){
 const store={id:'v277-a',enseigne:'Darty',ville:'Ville Test',adresse:'1 rue Test',dept:'69',lat:45.75,lon:4.85,active:true,priority:3,intervalDays:30,visitMinutes:60};
 return{schemaVersion:5,profile:{sectorName:'Test',baseName:'Base Test',baseAddress:'1 rue Test',baseLat:45.7,baseLon:4.8,overnight:'never'},
  settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],startTime:'08:30',endTime:'18:00',weekDate:'2026-10-05',visitMinutes:60,target:15},
  stores:[store],plan:{Lundi:[],Mardi:[],Mercredi:[store],Jeudi:[],Vendredi:[],Samedi:[]},visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[],manualWeekEdits:{},businessV2:M.empty()};
}
async function ready(page){await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerBehavior&&window.StoreRunnerBoot?.settled()&&document.querySelector('#homeRunnerTapV276'));await page.waitForLoadState('load')}
async function boot(page,initial=fixture()){
 await page.clock.setFixedTime(new Date(TODAY+'T10:00:00+02:00'));
 await page.addInitScript(({initial,MAIN})=>{if(!localStorage.getItem('v277-seed')){localStorage.setItem(MAIN,JSON.stringify(initial));localStorage.setItem('v277-seed','1')}},{initial,MAIN});
 await page.goto(APP,{waitUntil:'domcontentloaded'});await ready(page);
 await page.addStyleTag({content:'aside[role="status"]{display:none!important}'});
}
const field=(page,label)=>page.locator(DIALOG+' label.sr-field').filter({hasText:label}).locator('textarea');
async function complete(page){page.once('dialog',d=>d.accept());await page.locator(DIALOG+' [data-sr-complete-visit]').tap();await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée')}
async function close(page){await page.locator(DIALOG+' .sr-head').getByRole('button',{name:'Fermer',exact:true}).tap();await expect(page.locator(DIALOG)).not.toBeVisible()}
async function overflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1)}
test.use({timezoneId:'Europe/Paris',serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});
for(const width of [390,360])test.describe('Android '+width,()=>{
 const {defaultBrowserType,...device}=devices['Pixel 7'];test.use({...device,viewport:{width,height:844}});
 test('clôture réelle, reload, réouverture et nouvelle clôture remplacent la mémoire, puis suppression',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  const id=await page.evaluate(()=>StoreRunnerVisits.start('v277-a'));
  await field(page,'Note terrain BRUN').fill('Formation réalisée avec Julie.\nSAV RF48A401EB4 à relancer.');
  await expect(page.locator(DIALOG+' .sr-status')).toContainText('Enregistré',{timeout:15000});
  await field(page,'Prochain passage / formation BRUN').fill('Revoir le mural au prochain passage.');
  await expect(page.locator(DIALOG+' .sr-status')).toContainText('Enregistré',{timeout:15000});
  await expect.poll(()=>page.evaluate(()=>StoreRunnerVisitModel.reportMemoryFor(state,'v277-a').items.length)).toBe(0);
  await context.setOffline(true);await complete(page); // analyse sans réseau, aucune étape ajoutée
  await expect(page.locator(DIALOG+' .sr-reportMemory')).toContainText('Runner a retenu');
  await expect(page.locator(DIALOG+' .sr-reportMemory')).toContainText('SAV RF48A401EB4 à relancer.');
  const saved=await page.evaluate(async id=>{await __chefStorage.flush();return JSON.parse(__chefStorage.getItem('sector_planner_universal_v1')).businessV2.visits.find(v=>v.id===id).runnerMemory},id);
  expect(saved.version).toBe(1);expect(saved.items.some(i=>i.text==='Formation réalisée avec Julie.'&&i.status==='done')).toBe(true);
  await overflow(page);await context.setOffline(false);await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
  expect(await page.evaluate(id=>state.businessV2.visits.find(v=>v.id===id).runnerMemory,id)).toEqual(saved);
  page.once('dialog',d=>d.accept());await page.locator(DIALOG+' [data-sr-reopen-visit]').tap();
  await expect(page.locator('#srVisitTitle')).toContainText('Visite en cours');
  expect(await page.evaluate(()=>StoreRunnerVisitModel.reportMemoryFor(state,'v277-a').items)).toEqual([]);
  await field(page,'Note terrain BRUN').fill('SAV RF48A401EB4 résolu.');
  await expect(page.locator(DIALOG+' .sr-status')).toContainText('Enregistré',{timeout:15000});
  await field(page,'Prochain passage / formation BRUN').fill('Formation réalisée sur le son.');
  await expect(page.locator(DIALOG+' .sr-status')).toContainText('Enregistré',{timeout:15000});
  await complete(page);
  expect(await page.evaluate(()=>state.businessV2.visits.length)).toBe(1);
  expect(await page.evaluate(()=>StoreRunnerVisitModel.reportMemoryLines(state,'v277-a'))).toEqual([]);
  await close(page);await page.evaluate(()=>openStoreQuick('v277-a'));
  await expect(page.locator('#srStoreMemory .sr-reportMemory')).toContainText('SAV RF48A401EB4 résolu.');
  await page.locator('#srStoreMemory [data-memory-visit]').first().tap();
  await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');
  await page.locator(DIALOG+' [data-sr-danger-zone], '+DIALOG+' .sr-dangerZone summary').last().tap();
  page.once('dialog',d=>d.accept());await page.locator(DIALOG+' [data-sr-delete-visit]').tap();
  await expect.poll(()=>page.evaluate(()=>state.businessV2.visits.length)).toBe(0);
  expect(await page.evaluate(()=>StoreRunnerVisitModel.reportMemoryFor(state,'v277-a').items)).toEqual([]);
  expect(errors).toEqual([]);
 });
 test('prochain passage : mémoire ancienne datée, deux sujets distincts, famille isolée et décor silencieux',async({page})=>{
  const initial=fixture(),id=M.start(initial,'v277-a');
  M.editReport(initial,id,'brun','training','Formation à prévoir sur le son.\nSAV RF48A401EB4 à relancer.');
  M.editVisit(initial,id,'conclusion',null,'Formation à prévoir sur le son.');M.complete(initial,id,'2026-08-01');
  delete M.getVisit(initial,id).runnerMemory; // vraie sauvegarde ancienne, sans migration à l’ouverture
  await boot(page,initial);
  await expect(page.locator('#homeRunnerLineV273')).toBeHidden();
  await page.locator('#homeRunnerTapV276').tap();
  await expect(page.locator(BRIEF)).toContainText('2026-08-01');
  await expect(page.locator(BRIEF)).toContainText('Formation à prévoir sur le son.');
  await expect(page.locator(BRIEF)).toContainText('SAV RF48A401EB4 à relancer.');
  await expect(page.locator(BRIEF+' li')).toHaveCount(3);
  await page.evaluate(()=>StoreRunnerVisits.start('v277-a'));
  await expect(page.locator(DIALOG+' .sr-lastPromise')).toContainText('SAV RF48A401EB4 à relancer.');
  await page.locator(DIALOG+' [data-family="blanc"]').tap();
  await expect(page.locator(DIALOG+' .sr-lastPromise')).toHaveCount(0);
  await page.locator(DIALOG+' [data-family="brun"]').tap();
  const source=page.locator(DIALOG+' [data-memory-visit]').first();expect((await source.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await source.tap();await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');
  await overflow(page);await page.screenshot({path:'test-results/v277-memory-'+width+'.png',fullPage:true});
 });
});
