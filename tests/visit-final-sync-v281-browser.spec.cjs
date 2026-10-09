const {test,expect,devices}=require('@playwright/test');
const M=require('../store-runner-visit-model.js');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const MAIN='sector_planner_universal_v1';
function seed(){
 const store={id:'v281-final',enseigne:'Boulanger',ville:'Ville-Test',products:['brun','blanc'],active:true,priority:2,lat:45.75,lon:4.85};
 const s={schemaVersion:5,profile:{sectorName:'Test'},settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-10-05'},stores:[store],plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[],manualWeekEdits:{},businessV2:M.empty()};
 const id=M.start(s,store.id);
 M.editReport(s,id,'brun','team','Dictée BRUN originale.');
 M.editReport(s,id,'brun','training','Ancien rendez-vous dicté.');
 M.editReport(s,id,'blanc','team','Dictée BLANC originale.');
 M.editVisit(s,id,'conclusion',null,'Passage effectué');
 M.complete(s,id,'2026-10-09');
 const v=M.getVisit(s,id);v.reportJob.status='failed';v.runnerAI.status='failed';
 return {s,id};
}
async function boot(page){
 await page.clock.setFixedTime(new Date('2026-10-09T16:00:00+02:00'));
 const {s,id}=seed();
 await page.addInitScript(({s,MAIN})=>{if(!localStorage.getItem('v281-seeded')){localStorage.setItem(MAIN,JSON.stringify(s));localStorage.setItem('v281-seeded','1')}},{s,MAIN});
 await page.goto(APP,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerVisitReport&&window.StoreRunnerBoot?.settled()&&window.__chefStorage);
 return id;
}
test.use({...devices['Pixel 7'],viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'block'});
test('V281 Android: validation Sortie magasin remplace réellement Note terrain BRUN, jamais BLANC',async({page})=>{
 const id=await boot(page);
 await page.evaluate(id=>StoreRunnerVisitReport.open(id),id);
 const text=page.locator('#srReportText');
 await page.locator('#srReportEdit').tap();
 const final='Résumé BRUN — Boulanger Ville-Test\\nMerchandising Samsung réorganisé.\\nFormation au prochain passage.';
 await text.fill(final);
 await expect.poll(()=>page.evaluate(id=>state.businessV2.visits.find(v=>v.id===id).professionalReport?.reports?.brun?.text,id)).toBe(final);
 expect(await page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).brun.team,id)).toBe('Dictée BRUN originale.','Before finish, raw note unchanged');
 await page.locator('#srReportEdit').tap();
 await expect(text).toHaveJSProperty('readOnly',true);
 await expect.poll(()=>page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).brun.team,id)).toBe(final);
 expect(await page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).blanc.team,id)).toBe('Dictée BLANC originale.');
 expect(await page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).brun.training,id)).toBe('');
 await page.locator('#srReportSheet .sr-reportClose').tap();
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 const dialog=page.locator('#srVisitDialog');
 await expect(dialog.locator('label.sr-field').filter({hasText:'Note terrain BRUN'}).locator('textarea')).toHaveValue(final);
 await expect(dialog.locator('label.sr-field').filter({hasText:'Prochain passage / formation BRUN'})).toHaveCount(0);
 await expect(dialog.getByText('Dictée BRUN originale.')).toHaveCount(0);
 await __flush(page);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerBoot?.settled());
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 await expect(page.locator('#srVisitDialog label.sr-field').filter({hasText:'Note terrain BRUN'}).locator('textarea')).toHaveValue(final);
 await page.locator('#srVisitDialog [data-family="blanc"]').tap();
 await expect(page.locator('#srVisitDialog label.sr-field').filter({hasText:'Note terrain BLANC'}).locator('textarea')).toHaveValue('Dictée BLANC originale.');
});
async function __flush(page){await page.evaluate(async()=>{await window.__chefStorage.flush()})}
test('V281 Android: fermer la Sortie magasin après modification valide aussi le texte',async({page})=>{
 const id=await boot(page);
 await page.evaluate(id=>StoreRunnerVisitReport.open(id),id);
 await page.locator('#srReportEdit').tap();
 await page.locator('#srReportText').fill('Texte BRUN final enregistré à la fermeture.');
 await page.locator('#srReportSheet .sr-reportClose').tap();
 await expect(page.locator('#srReportSheet')).not.toBeVisible();
 await expect.poll(()=>page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).brun.team,id)).toBe('Texte BRUN final enregistré à la fermeture.');
});
