const {test,expect}=require('@playwright/test');
const cleanupBaseline=require('./fixtures/cleanup-baseline-r20.json');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
/* Total officiel des ressources script au démarrage : 74 après la suppression A4 de la
   campagne V187, 75 depuis le Planning Command Engine (Lot B, planning-command-engine.js),
   76 depuis Explorer Terrain V1 (store-explorer.js), 77 depuis Runner Visual System V1
   (runner-visual.js), 78 depuis la personnalité de Runner V273 (runner-behavior.js). Il reste plafonné par le budget de cleanup-baseline-r20, relevé d'une
   unité à chaque nouveau module de démarrage décidé, jamais en silence. */
const OFFICIAL_SCRIPT_RESOURCES=78;

test.use({
  viewport:{width:390,height:844},
  isMobile:true,
  hasTouch:true,
  deviceScaleFactor:1,
  serviceWorkers:'block'
});

test('A4 — la campagne V187 supprimée ne laisse aucun runtime navigateur',async({page})=>{
  const demandes=[];
  const erreurs=[];
  page.on('request',request=>demandes.push(new URL(request.url()).pathname));
  page.on('pageerror',error=>erreurs.push(String((error&&error.message)||error)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!document.querySelector('#premiumHomeV2 .phTop')&&!!window.StoreRunnerUpdates,null,{timeout:30000});
  await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(entry=>entry.initiatorType==='script').length),{
      timeout:30000,
      message:'les '+OFFICIAL_SCRIPT_RESOURCES+' ressources script officielles doivent finir de charger'
    }).toBe(OFFICIAL_SCRIPT_RESOURCES);

  const scripts=await page.evaluate(()=>performance.getEntriesByType('resource')
    .filter(entry=>entry.initiatorType==='script')
    .map(entry=>new URL(entry.name).pathname.split('/').pop())
    .filter(Boolean));
  const garde=await page.evaluate(()=>({
    api:typeof window.StoreRunnerPriorityCampaignV188,
    element:!!document.getElementById('priorityCampaignV187')
  }));

  expect(OFFICIAL_SCRIPT_RESOURCES,'le total officiel respecte le budget de démarrage r20').toBeLessThanOrEqual(cleanupBaseline.runtimeInventory.startupScriptResources);
  expect(scripts.length,'ressources script officielles après suppression').toBe(OFFICIAL_SCRIPT_RESOURCES);
  expect(new Set(scripts).size,'aucun script runtime chargé deux fois').toBe(scripts.length);
  expect(scripts.filter(name=>name==='planning-command-engine.js'),'module Lot B chargé une seule fois').toEqual(['planning-command-engine.js']);
  expect(scripts.filter(name=>name==='priority-campaign-v187.js')).toEqual([]);
  expect(demandes.filter(path=>path.endsWith('/priority-campaign-v187.js'))).toEqual([]);
  expect(garde).toEqual({api:'undefined',element:false});
  expect(erreurs).toEqual([]);
});
