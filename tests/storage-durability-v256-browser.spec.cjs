/* V256 — stockage durable dans un vrai Chromium mobile (390 px, service worker actif).

   1. Un appareil déjà installé (données dans localStorage) passe sur IndexedDB sans
      rien perdre ni rien effacer ; rechargement et hors ligne relisent la base.
   2. Un an de terrain s'enregistre, s'exporte, se restaure sur un appareil neuf et
      survit au rechargement, à l'identique.
   3. Une écriture refusée (quota) n'est plus silencieuse : bandeau, export possible,
      reprise automatique dès que l'appareil accepte à nouveau.
   Données 100 % synthétiques (tests/helpers/durability-fixture.cjs). */
const {test,expect}=require('@playwright/test');
const {latestBuild}=require('../version.json');
const F=require('./helpers/durability-fixture.cjs');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const MAIN='sector_planner_universal_v1';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'allow',screenshot:'only-on-failure',trace:'retain-on-failure'});

const ready=page=>page.waitForFunction(()=>document.readyState==='complete'&&window.state&&window.ChefReliability&&window.__chefStorage&&typeof window.exportFull==='function'&&typeof window.goTab==='function',null,{timeout:30000});
async function open(page){
  await page.addInitScript(build=>sessionStorage.setItem('store-runner-sw-reload:'+build,'1'),latestBuild);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});await ready(page);
}
const counts=page=>page.evaluate(()=>({mode:window.__chefStorageMode,visits:state.businessV2?state.businessV2.visits.length:0,actions:state.businessV2?state.businessV2.actions.length:0,stores:state.stores.length}));

test('V256 : bascule localStorage → IndexedDB sans perte, rechargement et hors ligne',async({page,context})=>{
  test.setTimeout(120000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const legacy=F.build({months:3,stores:40});const raw=JSON.stringify(legacy.state);
  /* Appareil installé avant V256 : tout est dans localStorage. */
  await context.addInitScript(({raw,key})=>{try{if(!localStorage.getItem('v256-seeded')){localStorage.setItem(key,raw);localStorage.setItem('v256-seeded','1')}}catch(e){}},{raw,key:MAIN});
  await open(page);
  await expect.poll(()=>counts(page)).toEqual({mode:'indexedDB',visits:legacy.state.businessV2.visits.length,actions:legacy.state.businessV2.actions.length,stores:40});
  expect(await page.evaluate(k=>localStorage.getItem(k).length,MAIN)).toBe(raw.length);
  expect(await page.evaluate(()=>!!localStorage.getItem('store-runner-storage-engine'))).toBe(true);
  /* Une modification part dans IndexedDB ; localStorage, copie d'avant bascule, ne bouge plus. */
  await page.evaluate(async()=>{state.notes['st-1']='Note V256 enregistrée dans la base';save();await __chefStorage.flush()});
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>state.notes['st-1'])).toBe('Note V256 enregistrée dans la base');
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).notes['st-1'],MAIN)).toBe(legacy.state.notes['st-1']);
  /* PWA hors ligne : même base, mêmes données. */
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await counts(page)).toMatchObject({mode:'indexedDB',visits:legacy.state.businessV2.visits.length});
  expect(await page.evaluate(()=>state.notes['st-1'])).toBe('Note V256 enregistrée dans la base');
  await context.setOffline(false);
  /* Écran Données à 390 px : santé du stockage lisible, aucun débordement. */
  await page.evaluate(()=>goTab('importPanel'));
  await expect(page.locator('#storageHealth')).toContainText('base de l’appareil (IndexedDB)');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(errors).toEqual([]);
});

test('V256 : un an de terrain — enregistrement, export, restauration sur appareil neuf, rechargement',async({page,browser},testInfo)=>{
  test.setTimeout(180000);
  const year=F.build({months:12,stores:60});
  const bundle={format:'ChefSecteurBackup',version:1,state:year.state,archive:year.archive,range:year.range,catalog:[],performance:year.performance};
  await open(page);
  const t0=Date.now();
  await page.evaluate(async b=>{ChefReliability.persist(b);window.state=ChefReliability.load();await __chefStorage.flush()},bundle);
  const persistMs=Date.now()-t0;
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  const expected={mode:'indexedDB',visits:year.visitCount,actions:year.state.businessV2.actions.length,stores:60};
  expect(await counts(page)).toEqual(expected);
  /* Sauvegarde courante sur un état d'un an : doit rester fluide. */
  const saveMs=await page.evaluate(async()=>{const t=performance.now();for(let i=0;i<5;i++){state.notes['st-2']='n'+i;save()}await __chefStorage.flush();return Math.round((performance.now()-t)/5)});
  expect(saveMs).toBeLessThan(2000);
  await page.evaluate(()=>goTab('importPanel'));
  const download=page.waitForEvent('download');await page.locator('#downloadBackup').tap();
  const file=testInfo.outputPath('store-runner-12-mois.json');await (await download).saveAs(file);
  const size=require('fs').statSync(file).size;expect(size).toBeLessThan(100*1024*1024);
  const exported=JSON.parse(require('fs').readFileSync(file,'utf8'));
  expect(exported.integrity.counts).toMatchObject({visits:year.visitCount,performanceImports:year.performance.imports.length});
  expect(exported.performance.imports.length).toBe(year.performance.imports.length);

  /* Appareil neuf : nouveau contexte, aucune donnée. */
  const fresh=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
  const other=await fresh.newPage();await open(other);
  await other.evaluate(()=>goTab('importPanel'));
  await other.locator('#restoreBackupFile').setInputFiles(file);
  const confirm=other.getByRole('button',{name:'Restaurer',exact:true});await expect(confirm).toBeVisible({timeout:30000});await confirm.tap();
  await expect(other.locator('#backupFeedback')).toContainText('Restauration terminée et vérifiée',{timeout:60000});
  await other.reload({waitUntil:'domcontentloaded'});await ready(other);
  expect(await counts(other)).toEqual(expected);
  expect(await other.evaluate(()=>state.notes['st-2'])).toBe('n4');
  expect(await other.evaluate(k=>JSON.parse(__chefStorage.getItem(k)).imports.length,'store-runner-performance-v190')).toBe(year.performance.imports.length);
  await fresh.close();
  console.log('V256 navigateur · 12 mois : état '+Math.round(JSON.stringify(year.state).length/1024)+' Ko, écriture initiale '+persistMs+' ms, sauvegarde '+saveMs+' ms, export '+Math.round(size/1024)+' Ko');
});

test('V256 : écriture refusée par l’appareil — bandeau, export possible, reprise automatique',async({page})=>{
  test.setTimeout(90000);
  await open(page);
  await page.evaluate(async()=>{state.notes=state.notes||{};save();await __chefStorage.flush()});
  /* Quota simulé : IndexedDB refuse toute écriture. */
  await page.evaluate(()=>{window.__v256Put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('The quota has been exceeded.','QuotaExceededError')}});
  await page.evaluate(()=>{const id=state.stores[0]&&state.stores[0].id||'x';state.notes[id]='Écrite pendant le quota plein';save()});
  const bar=page.locator('#srStorageAlert');
  await expect(bar).toBeVisible();await expect(bar).toContainText('Stockage de l’appareil plein');
  const box=await bar.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(()=>__chefStorage.flush().then(()=>'ok',e=>e.name))).toBe('QuotaExceededError');
  /* L'export part de la mémoire : il contient la note pas encore écrite sur disque. */
  const download=page.waitForEvent('download');await bar.getByRole('button',{name:'Sauvegarder mes données'}).tap();
  const text=await (await download).path().then(p=>require('fs').readFileSync(p,'utf8'));
  expect(text).toContain('Écrite pendant le quota plein');
  /* L'appareil accepte à nouveau : « Réessayer » écrit tout, le bandeau disparaît. La
     prochaine écriture de l'application emporte aussi les clés en retard : si elle passe
     la première, le bandeau est déjà parti — c'est la reprise automatique. */
  expect(await page.evaluate(()=>{IDBObjectStore.prototype.put=window.__v256Put;const retry=[...document.querySelectorAll('#srStorageAlert button')].find(b=>b.textContent==='Réessayer');if(retry)retry.click();return !!retry})).toBe(true);
  await expect(bar).toBeHidden();
  expect(await page.evaluate(()=>__chefStorage.health().failedKeys.length)).toBe(0);
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  expect(await page.evaluate(()=>Object.values(state.notes).includes('Écrite pendant le quota plein'))).toBe(true);
});
