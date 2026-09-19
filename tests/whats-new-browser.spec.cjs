const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

const SEEN_KEY='store-runner-whatsnew-last-seen';
const STATE_KEY='sector_planner_universal_v1';
const ready=page=>page.waitForFunction(()=>window.StoreRunnerWhatsNew&&window.state&&document.getElementById('moreSheetV2'));
const stored=page=>page.evaluate(k=>{try{return (window.__chefStorage||localStorage).getItem(k)}catch(e){return null}},SEEN_KEY);

// Une installation neuve n'a pas d'« avant » : c'est aussi pourquoi les autres specs,
// qui partent d'un profil vierge, ne voient jamais cet écran s'interposer.
test('Une installation neuve n’annonce rien et prépare la mise à jour suivante',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.hadPriorInstall())).toBe(false);
  await page.waitForTimeout(2200);                 // au-delà du délai d'ouverture automatique
  await expect(page.locator('#storeRunnerWhatsNew')).toBeHidden();
  expect(await stored(page)).toBe(await page.evaluate(()=>window.StoreRunnerWhatsNew.currentVersion()));
  expect(errors).toEqual([]);
});

test('Nouveautés s’affiche une seule fois après mise à jour et se rouvre depuis le menu ⋮ à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  // On simule un utilisateur qui avait déjà une version installée.
  await page.addInitScript(key=>{try{if(!localStorage.getItem(key))localStorage.setItem(key,'{}')}catch(e){}},STATE_KEY);

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.hadPriorInstall())).toBe(true);

  // --- Première ouverture d'une version jamais vue --------------------------------------
  const dialog=page.locator('#storeRunnerWhatsNew');
  await expect(dialog).toBeVisible({timeout:6000});
  const version=await page.evaluate(()=>window.StoreRunnerWhatsNew.currentVersion());
  expect(version).toMatch(/^\d+$/);
  await expect(dialog.locator('[data-srwn-title]')).toHaveText('Nouveautés V'+version);
  await expect(dialog.locator('[data-srwn-sub]')).not.toBeEmpty();

  const items=dialog.locator('[data-srwn-list] li');
  const count=await items.count();
  expect(count).toBeGreaterThanOrEqual(3);
  expect(count).toBeLessThanOrEqual(6);
  await expect(items.first()).not.toBeEmpty();

  // Le toast « Mise à jour installée » ne doit pas flotter sous le fond flouté.
  const banner=page.locator('#storeRunnerUpdateBanner');
  if(await banner.count())await expect(banner).toBeHidden();

  // --- Tenue à 390 px : rien ne déborde, la cible tactile reste atteignable -------------
  const card=dialog.locator('.srwnCard');
  const box=await card.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeLessThanOrEqual(844);
  expect(await card.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  const ok=dialog.locator('[data-srwn-ok]');
  await expect(ok).toHaveText('Compris');
  expect((await ok.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await stored(page)).toBeNull();

  // --- « Compris » ferme et enregistre la version --------------------------------------
  await ok.tap();
  await expect(dialog).toBeHidden();
  expect(await stored(page)).toBe(version);

  // --- Après rechargement : plus d'ouverture automatique --------------------------------
  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await stored(page)).toBe(version);
  await page.waitForTimeout(2200);
  await expect(page.locator('#storeRunnerWhatsNew')).toBeHidden();
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.hasUnseenRelease())).toBe(false);

  // --- Le menu ⋮ rouvre le changelog à la demande ---------------------------------------
  await page.locator('.bottomNavBtn[data-more="1"]').tap();
  const entry=page.locator('#moreSheetV2 .moreSheetGrid #storeRunnerWhatsNewMenuButton');
  await expect(entry).toHaveCount(1);
  await expect(entry).toBeVisible();
  await expect(entry).toHaveText('✦ Nouveautés');
  await entry.tap();
  await expect(page.locator('#storeRunnerWhatsNew')).toBeVisible();
  await expect(page.locator('#moreSheetV2')).not.toHaveClass(/open/);
  await expect(page.locator('#storeRunnerWhatsNew [data-srwn-list] li')).toHaveCount(count);

  await page.locator('#storeRunnerWhatsNew [data-srwn-ok]').tap();
  await expect(page.locator('#storeRunnerWhatsNew')).toBeHidden();
  expect(await stored(page)).toBe(version);

  expect(errors).toEqual([]);
});
