// V261 — une seule porte pour ajouter un magasin : chercher → choisir → ajouter.
// Le service de recherche (Nominatim) est simulé : aucun appel réseau réel.
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const NOMINATIM='https://nominatim.openstreetmap.org/**';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});

const darty={place_id:1,osm_type:'node',osm_id:101,lat:'45.9905',lon:'4.7201',category:'shop',type:'electronics',name:'Darty Villefranche',
 address:{house_number:'210',road:'Route de Frans',town:'Arnas',postcode:'69400'},extratags:{brand:'Darty',phone:'+33 4 74 00 00 00'},namedetails:{name:'Darty Villefranche'}};
const boulanger={place_id:2,osm_type:'way',osm_id:202,lat:'45.9811',lon:'4.7302',category:'shop',type:'electronics',name:'Boulanger Villefranche',
 address:{road:'Avenue de l’Europe',city:'Villefranche-sur-Saône',postcode:'69400'},extratags:{brand:'Boulanger'},namedetails:{}};
const fnac={place_id:3,osm_type:'node',osm_id:303,lat:'45.9870',lon:'4.7190',category:'shop',type:'books',name:'Fnac Villefranche',
 address:{house_number:'5',road:'Rue Nationale',city:'Villefranche-sur-Saône',postcode:'69400'},extratags:{brand:'Fnac'},namedetails:{}};
const house={place_id:4,osm_type:'node',osm_id:404,lat:'45.72',lon:'4.80',category:'place',type:'house',address:{house_number:'8',road:'Rue des Artisans',city:'Oullins',postcode:'69600'}};
const EXISTING=[
 {id:'old1',enseigne:'Darty',ville:'Lyon',adresse:'1 rue Ancienne',codePostal:'69002',dept:'69',lat:45.76,lon:4.83,type:'Gros',freq:'Hebdo',intervalDays:7,priority:5,active:true,products:['Blanc']},
 {id:'old2',enseigne:'Boulanger',ville:'Villefranche-sur-Saône',adresse:'1 rue Ailleurs',dept:'69',lat:45.97,lon:4.70,freq:'Mensuel',intervalDays:30,priority:3,active:true,products:['À confirmer']}
];

async function boot(page,stores=EXISTING){
 await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.StoreRunnerStoreAdd&&window.RegionStores&&window.state&&window.storage&&window.StoreRunnerManualPlanning&&window.StoreRunnerVisits);
 await page.evaluate(async stores=>{
  state.stores=JSON.parse(JSON.stringify(stores));state.notes={old1:'Note conservée'};state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
  state.profile=Object.assign({},state.profile,{baseLat:45.9,baseLon:4.75,baseName:'Maison'});
  save();const db=window.__chefStorage;if(db&&db.flush)await db.flush();renderFilterControls();renderAll();goTab('storesPanel');
 },stores);
}
async function route(page,rows){
 const calls=[];
 await page.route(NOMINATIM,r=>{calls.push(new URL(r.request().url()));const out=typeof rows==='function'?rows(calls.at(-1)):rows;return out==='abort'?r.abort('internetdisconnected'):r.fulfill({json:out})});
 return calls;
}
const dlg=page=>page.locator('#storeAddDlg');
async function noOverflow(page){
 const o=await page.evaluate(()=>({doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,dlg:(()=>{const d=document.getElementById('storeAddDlg');if(!d)return 0;const b=d.getBoundingClientRect();return Math.max(0,b.right-innerWidth,-b.left)})()}));
 expect(o.doc).toBeLessThanOrEqual(1);expect(o.dlg).toBeLessThanOrEqual(1);
}

test('une seule action visible, recherche, plusieurs résultats, aperçu, ajout, fiche prête pour planning et visite, persistance',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
 await boot(page);const calls=await route(page,[darty,boulanger,fnac,house]);
 const before=await page.evaluate(()=>JSON.stringify(state.stores));
 const panel=page.locator('#storesPanel');
 await expect(panel.getByRole('button',{name:'+ Ajouter un magasin'})).toBeVisible();
 for(const hidden of ['Carnet officiel','Gérer mon secteur','Ajouter une région','Secteur national'])await expect(panel.getByRole('button',{name:new RegExp(hidden)})).toHaveCount(0);
 await page.locator('#addStoreBtn').click();
 await expect(dlg(page)).toBeVisible();
 await expect(dlg(page).getByText('Rechercher un magasin',{exact:true})).toBeVisible();
 const input=page.locator('#sraQuery');
 await expect(input).toBeFocused();
 await expect(input).toHaveAttribute('placeholder','Nom, enseigne ou adresse');
 await expect(input).toHaveAttribute('enterkeyhint','search');
 expect(await dlg(page).locator('input:visible').count()).toBe(1);
 await page.screenshot({path:'test-results/store-add-v261-search-390.png'});
 expect(calls.length).toBe(0);
 await input.fill('Darty Villefranche');
 await input.press('Enter');
 await expect(dlg(page).locator('.sraResult')).toHaveCount(4);
 await expect(input).not.toBeFocused();
 expect(calls.length).toBe(1);
 expect(calls[0].searchParams.get('q')).toBe('Darty Villefranche');
 expect(calls[0].searchParams.get('viewbox')).toBeTruthy();
 const first=dlg(page).locator('.sraResult').first();
 await expect(first).toContainText('Darty Villefranche');await expect(first).toContainText('210 Route de Frans · 69400 Arnas');
 await expect(dlg(page).locator('.sraResult').nth(1)).toContainText('Déjà dans ton secteur ?');
 await expect(dlg(page).locator('.sraResult').last()).toContainText('adresse');
 for(const b of await dlg(page).locator('.sraResult').all())expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(56);
 await noOverflow(page);
 await page.screenshot({path:'test-results/store-add-v261-results-390.png'});
 await first.click();
 await expect(dlg(page).locator('[data-sra-name]')).toHaveText('Darty Villefranche');
 await expect(dlg(page).locator('[data-sra-address]')).toHaveText('210 Route de Frans');
 await expect(dlg(page).locator('[data-sra-city]')).toHaveText('69400 Arnas');
 await expect(dlg(page).locator('[data-sra-meta]')).toHaveText('+33 4 74 00 00 00');
 await expect(dlg(page).locator('[data-sra-dup]')).toBeHidden();
 await expect(dlg(page).getByRole('button',{name:'Ajouter ce magasin'})).toBeVisible();
 await page.screenshot({path:'test-results/store-add-v261-preview-390.png'});
 // Retour : les résultats sont conservés, sans nouvelle requête.
 await dlg(page).getByRole('button',{name:'Retour'}).click();
 await expect(dlg(page).locator('.sraResult')).toHaveCount(4);expect(calls.length).toBe(1);
 await first.click();
 expect(await page.evaluate(()=>state.stores.length)).toBe(2);
 await dlg(page).getByRole('button',{name:'Ajouter ce magasin'}).click();
 await expect(dlg(page).locator('[data-sra-step="done"]')).toBeVisible();
 await expect(dlg(page).locator('[data-sra-done-name]')).toHaveText('Darty Villefranche');
 await page.screenshot({path:'test-results/store-add-v261-done-390.png'});
 const added=await page.evaluate(()=>state.stores.find(s=>s.id==='osm-node-101'));
 expect(added).toMatchObject({enseigne:'Darty',sourceName:'Darty Villefranche',adresse:'210 Route de Frans',ville:'Arnas',codePostal:'69400',dept:'69',lat:45.9905,lon:4.7201,
  freq:'Mensuel',intervalDays:30,priority:3,active:true,products:['À confirmer'],channel:'retail',phone:'+33 4 74 00 00 00',sourceUrl:'https://www.openstreetmap.org/node/101'});
 // Les magasins existants sont intacts.
 expect(await page.evaluate(()=>JSON.stringify(state.stores.slice(0,2)))).toBe(before);
 await expect(page.locator('#storeList')).toContainText('Darty · Arnas');
 // « Voir la fiche » ouvre la fiche rapide du nouveau magasin.
 await dlg(page).getByRole('button',{name:'Voir la fiche'}).click();
 await expect(dlg(page)).toBeHidden();
 await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
 await expect(page.locator('#sqTitle')).toContainText('Darty');
 // Utilisable tout de suite : planning manuel et visite 6P.
 const planned=await page.evaluate(async()=>{const r=await StoreRunnerManualPlanning.addStore(window,'osm-node-101','Mardi');return{ok:r.ok,ids:(state.plan.Mardi||[]).map(s=>s.id)}});
 expect(planned.ok).toBe(true);expect(planned.ids).toContain('osm-node-101');
 await page.evaluate(()=>{closeStoreQuick&&closeStoreQuick();return StoreRunnerVisits.start('osm-node-101')});
 await expect(page.locator('#srVisitDialog')).toBeVisible();
 await page.evaluate(async()=>{const db=window.__chefStorage;if(db&&db.flush)await db.flush()});
 await page.reload();await page.waitForFunction(()=>window.state&&window.storage&&window.StoreRunnerStoreAdd);
 const reloaded=await page.evaluate(()=>({count:state.stores.length,store:state.stores.find(s=>s.id==='osm-node-101'),note:state.notes.old1,plan:(state.plan.Mardi||[]).map(s=>s.id)}));
 expect(reloaded.count).toBe(3);expect(reloaded.store.lat).toBe(45.9905);expect(reloaded.note).toBe('Note conservée');expect(reloaded.plan).toContain('osm-node-101');
 expect(errors).toEqual([]);
});

test('doublon certain : rien n’est ajouté, la fiche existante s’ouvre ; doublon probable : confirmation explicite',async({page})=>{
 await boot(page,EXISTING.concat([{id:'near',enseigne:'Darty',sourceName:'Darty Arnas',ville:'Arnas',adresse:'210 route de Frans',lat:45.9906,lon:4.7203,active:true,products:['À confirmer'],priority:3,intervalDays:30,freq:'Mensuel'}]));
 await route(page,[darty,boulanger]);
 await page.locator('#addStoreBtn').click();
 await page.locator('#sraQuery').fill('Darty Villefranche');await page.locator('#sraQuery').press('Enter');
 await expect(dlg(page).locator('.sraResult').first()).toContainText('Déjà dans ton secteur ?');
 await dlg(page).locator('.sraResult').first().click();
 await expect(dlg(page).locator('[data-sra-dup]')).toBeVisible();
 await expect(dlg(page).locator('[data-sra-dup]')).toContainText('Ce magasin semble déjà être dans ton secteur');
 await expect(dlg(page).locator('[data-sra-dup]')).toContainText('Darty Arnas');
 await expect(dlg(page).getByRole('button',{name:'Ajouter ce magasin'})).toBeHidden();
 await expect(dlg(page).getByRole('button',{name:'Ajouter quand même'})).toBeHidden();
 await page.screenshot({path:'test-results/store-add-v261-duplicate-390.png'});
 await noOverflow(page);
 await dlg(page).getByRole('button',{name:'Ouvrir la fiche existante'}).click();
 await expect(dlg(page)).toBeHidden();
 await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
 await expect(page.locator('#srQuickStart')).toHaveAttribute('data-sr-start','near');
 expect(await page.evaluate(()=>state.stores.length)).toBe(3);
 await page.evaluate(()=>closeStoreQuick());
 // Même enseigne dans la même ville, 2,6 km plus loin : probable → confirmation explicite.
 await page.locator('#addStoreBtn').click();
 await page.locator('#sraQuery').fill('Darty Villefranche');await page.locator('#sraQuery').press('Enter');
 await dlg(page).locator('.sraResult').nth(1).click();
 await expect(dlg(page).locator('[data-sra-dup]')).toContainText('1 rue Ailleurs');
 await expect(dlg(page).getByRole('button',{name:'Ajouter ce magasin'})).toBeHidden();
 await dlg(page).getByRole('button',{name:'Ajouter quand même'}).click();
 await expect(dlg(page).locator('[data-sra-step="done"]')).toBeVisible();
 expect(await page.evaluate(()=>state.stores.map(s=>s.id))).toEqual(['old1','old2','near','osm-way-202']);
});

test('aucun résultat → saisie manuelle réduite à trois champs, adresse localisée, ajout',async({page})=>{
 await boot(page);
 const calls=await route(page,u=>u.searchParams.get('street')?[{lat:'45.8',lon:'4.9',address:{postcode:'69100',city:'Villeurbanne'}}]:[]);
 await page.locator('#addStoreBtn').click();
 await page.locator('#sraQuery').fill('Cuisines Martin');await page.locator('#sraQuery').press('Enter');
 await expect(page.locator('#sraStatus')).toContainText('Aucun magasin trouvé');
 await dlg(page).getByRole('button',{name:'Saisir manuellement'}).click();
 await expect(dlg(page).locator('input:visible')).toHaveCount(3);
 await expect(page.locator('#sraName')).toBeFocused();
 await page.screenshot({path:'test-results/store-add-v261-manual-390.png'});
 await dlg(page).getByRole('button',{name:'Continuer'}).click();
 await expect(dlg(page).locator('[data-sra-manual-status]')).toHaveText('Indique le nom, l’adresse et la ville du magasin.');
 await page.locator('#sraName').fill('Cuisines Martin');
 await page.locator('#sraName').press('Enter');await expect(page.locator('#sraAddress')).toBeFocused();
 await page.locator('#sraAddress').fill('3 rue du Test');await page.locator('#sraAddress').press('Enter');
 await expect(page.locator('#sraCity')).toBeFocused();
 await page.locator('#sraCity').fill('Villeurbanne');await page.locator('#sraCity').press('Enter');
 await expect(dlg(page).locator('[data-sra-name]')).toHaveText('Cuisines Martin');
 expect(calls.at(-1).searchParams.get('street')).toBe('3 rue du Test');expect(calls.at(-1).searchParams.get('city')).toBe('Villeurbanne');
 await dlg(page).getByRole('button',{name:'Ajouter ce magasin'}).click();
 await expect(dlg(page).locator('[data-sra-step="done"]')).toBeVisible();
 const s=await page.evaluate(()=>state.stores.at(-1));
 expect(s).toMatchObject({enseigne:'Cuisines Martin',adresse:'3 rue du Test',ville:'Villeurbanne',codePostal:'69100',dept:'69',lat:45.8,lon:4.9,source:'Saisie manuelle',active:true});
 await dlg(page).getByRole('button',{name:'Terminé'}).click();await expect(dlg(page)).toBeHidden();
});

test('une adresse choisie dans les résultats ne demande plus que le nom',async({page})=>{
 await boot(page);const calls=await route(page,[house]);
 await page.locator('#addStoreBtn').click();
 await page.locator('#sraQuery').fill('8 rue des Artisans Oullins');await page.locator('#sraQuery').press('Enter');
 await dlg(page).locator('.sraResult').first().click();
 await expect(page.locator('#sraAddress')).toHaveValue('8 Rue des Artisans');await expect(page.locator('#sraCity')).toHaveValue('Oullins');
 await expect(page.locator('#sraName')).toBeFocused();
 await page.locator('#sraName').fill('Électro Service');await dlg(page).getByRole('button',{name:'Continuer'}).click();
 expect(calls.length).toBe(1);
 await dlg(page).getByRole('button',{name:'Ajouter ce magasin'}).click();
 expect(await page.evaluate(()=>state.stores.at(-1))).toMatchObject({sourceName:'Électro Service',lat:45.72,lon:4.8,codePostal:'69600',ville:'Oullins'});
});

test('erreur réseau et service saturé : message humain, aucune création',async({page})=>{
 await boot(page);let mode='abort';
 await page.route(NOMINATIM,r=>mode==='abort'?r.abort('connectionreset'):r.fulfill({status:429,json:{}}));
 await page.locator('#addStoreBtn').click();
 await page.locator('#sraQuery').fill('Darty Villefranche');await page.locator('#sraQuery').press('Enter');
 await expect(page.locator('#sraStatus')).toHaveText('Impossible de joindre le service de recherche. Vérifie ta connexion et réessaie.');
 await expect(dlg(page).getByRole('button',{name:'Rechercher'})).toBeEnabled();
 mode='busy';await page.locator('#sraQuery').fill('Darty Lyon');await dlg(page).getByRole('button',{name:'Rechercher'}).click();
 await expect(page.locator('#sraStatus')).toHaveText('Le service de recherche est très sollicité. Réessaie dans quelques secondes.');
 await expect(dlg(page).getByRole('button',{name:'Saisir manuellement'})).toBeVisible();
 expect(await page.evaluate(()=>state.stores.length)).toBe(2);
 // Fermer pendant une recherche lente n'ajoute rien.
 await page.unroute(NOMINATIM);let release;
 await page.route(NOMINATIM,async r=>{await new Promise(res=>release=res);await r.fulfill({json:[darty]}).catch(()=>{})});
 await page.locator('#sraQuery').fill('Fnac Villefranche');await page.locator('#sraQuery').press('Enter');
 await expect(page.locator('[data-sra-spinner]')).toBeVisible();
 await dlg(page).getByRole('button',{name:'Annuler'}).click();await expect(dlg(page)).toBeHidden();
 // Annulée pendant l'attente d'une seconde entre deux requêtes, la recherche ne part même pas.
 await page.waitForTimeout(1500);if(release)release();await page.waitForTimeout(300);
 await expect(dlg(page)).toBeHidden();
 expect(await page.evaluate(()=>state.stores.length)).toBe(2);
});

test('import IA : les magasins proposés passent un par un par la même recherche',async({page})=>{
 await boot(page);const calls=await route(page,u=>/fnac/i.test(u.searchParams.get('q'))?[fnac]:[darty]);
 await page.evaluate(()=>{aiConfig.gateway='https://example.test';callAIGateway=async()=>({stores:[{enseigne:'Darty',nom:'Villefranche',ville:'Arnas',lat:1,lon:1},{enseigne:'Fnac',ville:'Villefranche-sur-Saône'}]});document.getElementById('aiStoreText').value='Deux magasins';return aiParseStores()});
 await expect(dlg(page)).toBeVisible();
 await expect(dlg(page).locator('[data-sra-progress]')).toContainText('Magasin 1 sur 2');
 await expect(page.locator('#sraQuery')).toHaveValue('Darty Villefranche Arnas');
 await expect(dlg(page).locator('.sraResult')).toHaveCount(1);
 await dlg(page).locator('.sraResult').first().click();
 await dlg(page).getByRole('button',{name:'Ajouter ce magasin'}).click();
 expect(await page.evaluate(()=>state.stores.at(-1).lat)).toBe(45.9905);
 await dlg(page).getByRole('button',{name:'Magasin suivant'}).click();
 await expect(dlg(page).locator('[data-sra-progress]')).toContainText('Magasin 2 sur 2');
 await expect(dlg(page).locator('.sraResult')).toContainText('Fnac Villefranche');
 await dlg(page).getByRole('button',{name:'Passer'}).click();
 await expect(dlg(page)).toBeHidden();
 expect(calls.length).toBe(2);expect(await page.evaluate(()=>state.stores.length)).toBe(3);
});

test('hors ligne : pas de recherche dans le vide, saisie manuelle avec la position sur place',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',permissions:['geolocation'],geolocation:{latitude:45.7401,longitude:4.8702}});
 try{
  const page=await context.newPage();await boot(page);const calls=await route(page,[darty]);
  await context.setOffline(true);
  await page.locator('#addStoreBtn').click();
  await expect(page.locator('#sraStatus')).toContainText('Hors ligne : la recherche nécessite une connexion');
  await page.locator('#sraQuery').fill('Darty Villefranche');await page.locator('#sraQuery').press('Enter');
  await expect(page.locator('[data-sra-spinner]')).toBeHidden();
  expect(calls.length).toBe(0);
  await page.screenshot({path:'test-results/store-add-v261-offline-390.png'});
  await dlg(page).getByRole('button',{name:'Saisir manuellement'}).click();
  await expect(dlg(page).locator('[data-sra-manual-hint]')).toContainText('ta position servira à le situer');
  await page.locator('#sraName').fill('Fnac Lyon Est');await page.locator('#sraAddress').fill('2 avenue Test');await page.locator('#sraCity').fill('Lyon');
  await dlg(page).getByRole('button',{name:'Continuer avec ma position'}).click();
  await expect(dlg(page).locator('[data-sra-name]')).toHaveText('Fnac Lyon Est');
  await dlg(page).getByRole('button',{name:'Ajouter ce magasin'}).click();
  await expect(dlg(page).locator('[data-sra-step="done"]')).toBeVisible();
  expect(await page.evaluate(()=>state.stores.at(-1))).toMatchObject({enseigne:'Fnac',sourceName:'Fnac Lyon Est',lat:45.7401,lon:4.8702,source:'Saisie manuelle (position sur place)'});
  expect(calls.length).toBe(0);
  await dlg(page).getByRole('button',{name:'Terminé'}).click();
  // Retour du réseau pendant que l'écran est ouvert : le message hors ligne disparaît.
  await page.locator('#addStoreBtn').click();await expect(page.locator('#sraStatus')).toContainText('Hors ligne');
  await context.setOffline(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(page.locator('#sraStatus')).toHaveText('');
 }finally{await context.close()}
});
