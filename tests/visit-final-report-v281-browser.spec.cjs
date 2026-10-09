const {test,expect,devices}=require('@playwright/test');
const M=require('../store-runner-visit-model.js');
const APP=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const MAIN='sector_planner_universal_v1',DIALOG='#srVisitDialog';
const OLD_BRUN='Ancienne dictée BRUN qui ne doit plus apparaître.';
const OLD_BLANC='Ancienne dictée BLANC qui ne doit plus apparaître.';
const FINAL_BRUN='Résumé BRUN - Darty Ville Test\nVisite : implantation TV contrôlée.\nFormation des vendeurs à prévoir.';
const FINAL_BLANC='Résumé BLANC - Darty Ville Test\nLe rayon froid a été contrôlé.\nSuivi SAV à effectuer.';
function fixture(){
 const store={id:'v281-store',enseigne:'Darty',ville:'Ville Test',adresse:'1 rue Test',dept:'69',products:['brun','blanc'],active:true,priority:2,lat:45.75,lon:4.85};
 const state={schemaVersion:5,profile:{sectorName:'Test',baseName:'Base'},settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-10-05'},
 stores:[store],plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
 visits:{},notes:{},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[],manualWeekEdits:{},businessV2:M.empty()};
 const id=M.start(state,store.id);
 M.editReport(state,id,'brun','team',OLD_BRUN);
 M.editReport(state,id,'blanc','team',OLD_BLANC);
 M.editVisit(state,id,'conclusion',null,'Visite réalisée.');
 M.complete(state,id,'2026-10-09');
 // The test exercises manual ChatGPT paste only, not a network model.
 const v=M.getVisit(state,id);v.reportJob.status='failed';v.runnerAI.status='failed';
 return {state,id};
}
async function ready(page){await page.waitForFunction(()=>window.StoreRunnerVisits&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitModel&&window.StoreRunnerBoot?.settled()&&window.__chefStorage);await page.waitForLoadState('load')}
async function paste(page,family,text){
 await page.locator('#srReportTabs [data-family="'+family+'"]').tap();
 await page.locator('#srReportEdit').tap();
 await expect(page.locator('#srReportText')).not.toHaveAttribute('readonly');
 await page.locator('#srReportText').fill(text);
 await page.locator('#srReportEdit').tap();
 await expect(page.locator('#srReportText')).toHaveAttribute('readonly');
 await expect.poll(()=>page.evaluate(f=>StoreRunnerVisitModel.reportOf(state.businessV2.visits[0])[f].team,family)).toBe(text);
}
test.use({...devices['Pixel 7'],viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'block'});
test('V281 Android : coller sur Sortie magasin écrit vraiment dans Notes terrain BRUN et BLANC, après fermeture et reload',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const {state,id}=fixture();
 await page.addInitScript(({state,MAIN})=>{if(!localStorage.getItem('v281-seed')){localStorage.setItem(MAIN,JSON.stringify(state));localStorage.setItem('v281-seed','1')}},{state,MAIN});
 await page.goto(APP,{waitUntil:'domcontentloaded'});await ready(page);
 await page.evaluate(id=>StoreRunnerVisitReport.open(id),id);
 await expect(page.locator('#srReportSheet')).toBeVisible();
 await paste(page,'brun',FINAL_BRUN);
 await paste(page,'blanc',FINAL_BLANC);
 await page.locator('#srReportSheet button').getByText('Fermer',{exact:true}).tap();
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 await expect(page.locator(DIALOG)).toBeVisible();
 const terrain=family=>page.locator(DIALOG+' label.sr-field').filter({hasText:'Note terrain '+family.toUpperCase()}).locator('textarea');
 await page.locator(DIALOG+' [data-family="brun"]').tap();
 await expect(terrain('brun')).toHaveValue(FINAL_BRUN);
 await expect(page.locator(DIALOG+' label.sr-field').filter({hasText:'Contexte magasin'})).toHaveCount(0);
 await page.locator(DIALOG+' [data-family="blanc"]').tap();
 await expect(terrain('blanc')).toHaveValue(FINAL_BLANC);
 await page.evaluate(async()=>__chefStorage.flush());
 await page.reload({waitUntil:'domcontentloaded'});await ready(page);
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 await page.locator(DIALOG+' [data-family="brun"]').tap();
 await expect(terrain('brun')).toHaveValue(FINAL_BRUN);
 await page.locator(DIALOG+' [data-family="blanc"]').tap();
 await expect(terrain('blanc')).toHaveValue(FINAL_BLANC);
 const saved=await page.evaluate(()=>state.businessV2.visits[0]);
 expect(saved.report.brun.team).toBe(FINAL_BRUN);
 expect(saved.report.blanc.team).toBe(FINAL_BLANC);
 expect(saved.professionalReport.reports.brun.text).toBe(FINAL_BRUN);
 expect(saved.professionalReport.reports.blanc.text).toBe(FINAL_BLANC);
 expect(saved.reportJob.obsolete).toBe(true);
 expect(errors).toEqual([]);
});

test('V281 Android : une visite en cours n’a que Note terrain, les anciens champs sont transférés sans perte',async({page})=>{
 const {state,id}=fixture(),v=M.getVisit(state,id);
 v.status='draft';v.completedAt=null;v.completedDate=null;
 delete v.reportJob;delete v.runnerAI;delete v.runnerMemory;
 state.visits={};
 M.editReport(state,id,'shared','context','Contexte commun aux deux univers.');
 M.editReport(state,id,'brun','training','Revoir les formations au prochain passage.');
 M.editReport(state,id,'brun','massification','Tête de gondole Samsung à valoriser.');
 M.editReport(state,id,'blanc','training','Relancer le SAV BLANC.');
 await page.addInitScript(({state,MAIN})=>{if(!localStorage.getItem('v281-seed')){localStorage.setItem(MAIN,JSON.stringify(state));localStorage.setItem('v281-seed','1')}},{state,MAIN});
 await page.goto(APP,{waitUntil:'domcontentloaded'});await ready(page);
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 const dialog=page.locator(DIALOG);
 const note=family=>dialog.locator('label.sr-field').filter({hasText:'Note terrain '+family}).locator('textarea');
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('label.sr-field').filter({hasText:'Contexte magasin'})).toHaveCount(0);
 await expect(dialog.locator('label.sr-field').filter({hasText:'Prochain passage'})).toHaveCount(0);
 await expect(dialog.locator('.sr-legacyReport')).toHaveCount(0);
 await page.locator(DIALOG+' [data-family="brun"]').tap();
 await expect(note('BRUN')).toHaveValue(/Revoir les formations au prochain passage/);
 await expect(note('BRUN')).toHaveValue(/Tête de gondole Samsung à valoriser/);
 await expect(note('BRUN')).toHaveValue(/Contexte commun aux deux univers/);
 await expect.poll(()=>page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).shared.context,id)).toBe('');
 await page.locator(DIALOG+' [data-family="blanc"]').tap();
 await expect(note('BLANC')).toHaveValue(/Relancer le SAV BLANC/);
 await expect(note('BLANC')).toHaveValue(/Contexte commun aux deux univers/);
 const replacement='Nouveau carnet BLANC : références, actions, SAV, rendez-vous tout en un.';
 await note('BLANC').fill(replacement);
 await expect.poll(()=>page.evaluate(id=>StoreRunnerVisitModel.reportOf(state.businessV2.visits.find(v=>v.id===id)).blanc.team,id)).toBe(replacement);
 await page.evaluate(async()=>__chefStorage.flush());
 await page.reload({waitUntil:'domcontentloaded'});await ready(page);
 await page.evaluate(id=>StoreRunnerVisits.openVisit(id),id);
 await page.locator(DIALOG+' [data-family="blanc"]').tap();
 await expect(note('BLANC')).toHaveValue(replacement);
 await expect(dialog.locator('label.sr-field').filter({hasText:'Prochain passage'})).toHaveCount(0);
});
