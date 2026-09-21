const { test, expect } = require('@playwright/test');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({
  viewport:{width:390,height:844},
  isMobile:true,
  hasTouch:true,
  deviceScaleFactor:1,
  serviceWorkers:'block',
  screenshot:'only-on-failure',
  trace:'retain-on-failure'
});

test('V234 — le loader reste unique et masque l’ancienne UI jusqu’à home-rendered',async({page})=>{
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));

  let homeRefreshIntercepted=false;
  await page.route('**/home-refresh-v2.js*',async route=>{
    homeRefreshIntercepted=true;
    await new Promise(resolve=>setTimeout(resolve,5200));
    await route.continue();
  });

  await page.goto(APP_URL,{waitUntil:'commit'});

  const boot=page.locator('[data-store-runner-boot]');
  await expect(boot).toHaveCount(1);
  await expect(boot).toBeVisible();
  await expect(boot.locator('[data-boot-text]')).toHaveText('Chargement de ton espace terrain…');

  await expect.poll(()=>homeRefreshIntercepted,{timeout:5000}).toBe(true);

  // L'ancien code retirait l'overlay à 4,5 s même si la nouvelle UI n'était pas prête.
  // On dépasse volontairement ce délai pendant que home-refresh-v2.js est bloqué.
  await page.waitForTimeout(4700);
  await expect(boot).toHaveCount(1);
  await expect(boot).toBeVisible();
  await expect(boot.locator('[data-boot-text]')).toHaveText('Finalisation de Store Runner…');

  const snapshot=await page.evaluate(()=>({
    bootCount:document.querySelectorAll('[data-store-runner-boot]').length,
    oldRuntimeLoader:!!document.getElementById('srRuntimeBoot'),
    bootZ:getComputedStyle(document.querySelector('[data-store-runner-boot]')).zIndex,
    homeRendered:!!document.querySelector('#homePanel .phTop')
  }));
  expect(snapshot.bootCount).toBe(1);
  expect(snapshot.oldRuntimeLoader).toBe(false);
  expect(Number(snapshot.bootZ)).toBeGreaterThan(1000000);
  expect(snapshot.homeRendered).toBe(false);

  await page.waitForFunction(()=>document.querySelector('#homePanel .phTop')&&document.querySelector('#bottomAppNav[data-v2="1"]'),null,{timeout:10000});
  await expect(boot).toHaveCount(0,{timeout:3000});

  const finalState=await page.evaluate(()=>({
    oldRuntimeLoader:!!document.getElementById('srRuntimeBoot'),
    home:!!document.querySelector('#homePanel .phTop'),
    nav:!!document.querySelector('#bottomAppNav[data-v2="1"]'),
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth
  }));
  expect(finalState).toMatchObject({oldRuntimeLoader:false,home:true,nav:true});
  expect(finalState.overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
