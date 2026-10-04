/* Lot B — Planning Command Engine dans la vraie application, mobile 390 px (Android).
   Assistant en mode « IA en ligne » dont la passerelle lève une erreur : une commande planning
   ne doit jamais la joindre. Horloge figée samedi 03/10/2026 (contrat r38), GPS contrôlé au
   point de départ enregistré. */
const {test,expect}=require('@playwright/test');
const URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});
async function setup(page,{appointments=[]}={}){
  await page.addInitScript(()=>{
    const Real=Date,fixed=new Real('2026-10-03T10:00:00+02:00').getTime();
    window.Date=class extends Real{constructor(...a){super(...(a.length?a:[fixed]))}static now(){return fixed}};
  });
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.StoreRunnerPlanningCommandEngine&&window.storeRunnerPlanningCommand&&window.StoreRunnerPerformanceV190&&window.ChefReliability&&window.StoreRunnerManualPlanning);
  await page.waitForTimeout(500);
  await page.evaluate(({appointments})=>{
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const rows=[['bv','Boulanger','Valence',44.933,4.892],['dv','Darty','Valence',44.925,4.905],['fbv','Fnac','Bourg-lès-Valence',44.947,4.894],['bc','Boulanger','Chambéry',45.566,5.92],['dc','Darty','Chambéry',45.573,5.911],['bl','Boulanger','Lyon',45.75,4.85],['dl','Darty','Lyon',45.76,4.86],['da','Darty','Annemasse',46.193,6.234],['bg','Boulanger','Grenoble',45.188,5.724],['bvi','Boulanger','Vienne',45.525,4.874],['fly','Fnac','Lyon',45.761,4.857],['dbo','Darty','Bourgoin-Jallieu',45.587,5.279]];
    const stores=rows.map(([id,enseigne,ville,lat,lon])=>({id,enseigne,ville,adresse:'1 rue '+id,active:true,lat,lon,intervalDays:30,priority:3,products:['Brun']}));
    const by=id=>stores.find(s=>s.id===id);
    state.stores=stores;
    state.profile={...state.profile,baseName:'Domicile',baseAddress:'Lyon',baseLat:45.764,baseLon:4.8357,overnightMode:'auto'};
    state.settings={...state.settings,weekDate:'2026-10-05',days:days.slice(0,5),target:10,maxVisitsPerDay:4,startTime:'08:00',endTime:'19:00',visitMinutes:45,products:[],brands:[]};
    state.plan={Lundi:[by('bl')],Mardi:[by('dl')],Mercredi:[],Jeudi:[by('bv'),by('fly')],Vendredi:[by('bvi')],Samedi:[]};
    state.locks={};state.visits={fly:{lastVisit:'2026-09-15',history:['2026-09-15']}};state.appointments=appointments;state.calendarEvents=[];state.included={};state.excluded={};state.manualWeekEdits={};state.hotelReservations={};
    const db=window.__chefStorage;db.removeItem('chef_sector_range_v1');db.removeItem('store-runner-planning-command-log-v1');
    db.setItem('chef_sector_plan_archive_v1',JSON.stringify({'2026-10-05':{weekMonday:'2026-10-05',plan:state.plan,manualEdited:false}}));
    StoreRunnerPerformanceV190.saveSnapshot(db,{week:'W41',importedAt:'2026-10-01T09:00:00Z',rows:['bv','dc','bg','da'].map(id=>({key:'fixture|'+id,retailer:by(id).enseigne,site:by(id).ville,prio:'P1',weeks:{},deltaWeeks:{},sellOutWeeks:{},comment:''}))});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:45.764,longitude:4.8357,accuracy:6},timestamp:Date.now()}),20)}}});
    window.__gatewayCalls=0;aiConfig.mode='online';window.callAIGateway=async()=>{window.__gatewayCalls++;throw new Error('Une commande planning ne doit jamais joindre l’IA en ligne')};
    save();initControls();renderAll();goTab('planPanel');toggleAssistant();
  },{appointments});
}
const snapshot=page=>page.evaluate(()=>JSON.stringify({state,archive:__chefStorage.getItem('chef_sector_plan_archive_v1'),range:__chefStorage.getItem('chef_sector_range_v1')}));
async function send(page,text){await page.locator('#assistantInput').fill(text);await page.locator('#assistantInput').press('Enter')}
async function noHorizontalScroll(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1)}
async function sheetFits(page){
  const box=await page.locator('#srCommandSheet').boundingBox();expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(-1);expect(box.x+box.width).toBeLessThanOrEqual(391);
  for(const b of await page.locator('#srCommandSheet .srCmdActions button').all()){const r=await b.boundingBox();expect(r.height).toBeGreaterThanOrEqual(44)}
}

test('« Mets Valence mardi » : choix du magasin, aperçu lisible, rien d’écrit avant « Appliquer », puis placement manuel',async({page})=>{
  await setup(page);const before=await snapshot(page);
  await send(page,'Mets Valence mardi');
  const sheet=page.locator('#srCommandSheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('correspond à 3 magasins');
  await sheetFits(page);await noHorizontalScroll(page);
  await sheet.getByRole('button',{name:/^Boulanger Valence/}).click();
  await expect(sheet).toContainText('Voilà ce que Store Runner va faire');
  await expect(sheet).toContainText('Mardi 06/10');
  await expect(sheet).toContainText('→ Boulanger Valence (depuis jeudi 08/10)');
  await expect(sheet).toContainText('0 rendez-vous modifié');
  expect(await snapshot(page)).toBe(before);
  await sheetFits(page);await noHorizontalScroll(page);
  await page.screenshot({path:'test-results/planning-command-preview-390.png'});
  await sheet.getByRole('button',{name:'Appliquer',exact:true}).click();
  await expect(sheet).toBeHidden();
  const after=await page.evaluate(()=>({tue:state.plan.Mardi.map(s=>s.id),thu:state.plan.Jeudi.map(s=>s.id),lock:state.locks.bv,journal:JSON.parse(__chefStorage.getItem('store-runner-planning-command-log-v1'))[0]}));
  expect(after.tue).toEqual(['dl','bv']);expect(after.thu).toEqual(['fly']);
  expect(after.lock).toEqual({day:'Mardi',week:'2026-10-05'});expect(after.journal.outcome).toBe('applied');
  expect(await page.evaluate(()=>window.__gatewayCalls)).toBe(0);
  await noHorizontalScroll(page);
});

test('« Programme-moi tous mes P1 avant la W42 » en mode IA en ligne : aperçu local, « Annuler » ne change rien',async({page})=>{
  await setup(page);const before=await snapshot(page);
  await send(page,'Programme-moi tous mes P1 avant la W42');
  const sheet=page.locator('#srCommandSheet');
  await expect(sheet).toContainText('4 magasins demandés · 4 placés',{timeout:20000});
  await expect(sheet).toContainText('Du 05/10 au 11/10');
  await expect(sheet.getByRole('button',{name:'Appliquer',exact:true})).toBeEnabled();
  await sheetFits(page);await noHorizontalScroll(page);
  await page.screenshot({path:'test-results/planning-command-p1-390.png',fullPage:false});
  await sheet.getByRole('button',{name:'Annuler',exact:true}).click();
  await expect(sheet).toBeHidden();
  const now=JSON.parse(await snapshot(page)),then=JSON.parse(before);
  expect(now.state).toEqual(then.state);expect(now.archive).toBe(then.archive);expect(now.range).toBe(then.range);
  expect(await page.evaluate(()=>JSON.parse(__chefStorage.getItem('store-runner-planning-command-log-v1'))[0].outcome)).toBe('cancelled');
  expect(await page.evaluate(()=>window.__gatewayCalls)).toBe(0);
});

test('« Évite jeudi » avec un rendez-vous jeudi : refus expliqué, « Appliquer » désactivé',async({page})=>{
  await setup(page,{appointments:[{id:'rdv',storeId:'bv',date:'2026-10-08',time:'10:00',duration:30,type:'Visite',note:''}]});
  const before=await snapshot(page);
  await send(page,'Évite jeudi');
  const sheet=page.locator('#srCommandSheet');
  await expect(sheet).toContainText('Rien ne sera appliqué',{timeout:20000});
  await expect(sheet).toContainText('Rendez-vous le jeudi 08/10');
  await expect(sheet.getByRole('button',{name:'Appliquer',exact:true})).toBeDisabled();
  await sheetFits(page);await noHorizontalScroll(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await snapshot(page)).toBe(before);
});

test('phrases de l’assistant historique : non captées par les commandes',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{aiConfig.mode='local'});
  await send(page,'Résume ma semaine');
  await expect(page.locator('#srCommandSheet')).toHaveCount(0);
  await expect(page.locator('#assistantMsgs')).toContainText('Lundi');
});
