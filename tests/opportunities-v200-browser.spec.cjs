const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

async function seed(page){
 await page.evaluate(()=>{
  const s={id:'s1',enseigne:'Enseigne Test',ville:'Ville-Test Un',adresse:'1 rue Test',dept:'99',lat:47,lon:1,active:true,priority:3,products:['Blanc']};
  state.stores=[s];state.visits={};state.notes={};state.included={};state.excluded={};state.locks={};state.appointments=[];state.calendarEvents=[];
  state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  state.businessV2={version:2,revision:0,storeSnapshots:{},visits:[],actions:[]};
  try{save()}catch(e){}
  const start=document.getElementById('srQuickStart');if(start)start.dataset.srStart='s1';
  if(window.StoreRunnerOpportunities)window.StoreRunnerOpportunities.refreshButtons();
 });
}

test('Opportunity V200 : création magasin, suivi, vue secteur et rappel visite à 390 px',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.state&&window.StoreRunnerOpportunities&&window.StoreRunnerVisits&&document.getElementById('storeQuickSheet'));
 await seed(page);

 const quick=page.locator('#srOpportunityQuickBtn');await expect(quick).toHaveCount(1);await expect(quick).toContainText('Opportunités');
 const sector=page.locator('#srOpportunitySectorBtn');await expect(sector).toHaveCount(1);await expect(sector).toContainText('Opportunités');
 await page.evaluate(()=>window.StoreRunnerOpportunities.open('s1',''));
 const dlg=page.locator('#srOpportunityDialog');await expect(dlg).toBeVisible();
 await dlg.locator('select[name="category"]').selectOption('pdl');
 await dlg.locator('textarea[name="description"]').fill('Gagner deux facings sur le mural test');
 await dlg.locator('input[name="owner"]').fill('Chef de secteur');
 await dlg.locator('input[name="dueDate"]').fill('2026-10-01');
 await dlg.locator('button[type="submit"]').click();
 await expect(dlg.locator('.sr-oppCard')).toHaveCount(1);
 await expect(dlg.locator('.sr-oppCard')).toContainText('Gagner deux facings sur le mural test');

 const saved=await page.evaluate(()=>({
  opportunities:state.businessV2.opportunities,
  priority:state.stores[0].priority,
  planned:Object.values(state.plan).flat().length
 }));
 expect(saved.opportunities).toHaveLength(1);expect(saved.opportunities[0].status).toBe('open');expect(saved.priority).toBe(3);expect(saved.planned).toBe(0);

 await dlg.locator('.sr-oppClose').click();
 await page.waitForTimeout(100);
 await expect(quick).toContainText('· 1');await expect(sector).toContainText('· 1');

 await page.evaluate(()=>window.StoreRunnerOpportunities.open('',''));
 await expect(dlg).toBeVisible();await expect(dlg.locator('.sr-oppCard')).toHaveCount(1);await expect(dlg.locator('#srOppSubtitle')).toContainText('secteur');
 await dlg.locator('.sr-oppClose').click();

 await page.evaluate(()=>window.StoreRunnerVisits.start('s1'));
 await expect(page.locator('#srVisitDialog')).toBeVisible();
 await page.waitForTimeout(200);
 const visitBtn=page.locator('#srOpportunityVisitBtn');await expect(visitBtn).toHaveCount(1);await expect(visitBtn).toContainText('· 1');

 const stableMutations=await page.evaluate(()=>new Promise(resolve=>{
  const head=document.querySelector('#srVisitDialog .sr-head');let count=0;const observer=new MutationObserver(rows=>{count+=rows.length});observer.observe(head,{childList:true,subtree:true,attributes:true});
  window.StoreRunnerOpportunities.refreshButtons();setTimeout(()=>{observer.disconnect();resolve(count)},500);
 }));
 expect(stableMutations).toBe(0);

 const overflow=await page.evaluate(()=>{
  if(document.documentElement.scrollWidth>document.documentElement.clientWidth)return'page';
  const bad=[...document.querySelectorAll('#srOpportunityDialog *')].find(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+2);
  return bad?bad.className:'';
 });
 expect(overflow).toBe('');expect(errors).toEqual([]);
});
