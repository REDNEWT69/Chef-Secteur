const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

const SEEN_KEY='store-runner-whatsnew-last-seen';
const LAST_BUILD_KEY='store-runner-whatsnew-last-build';
const ANCIEN_BUILD='20260101-ancienbuild225';
const ready=page=>page.waitForFunction(()=>window.StoreRunnerWhatsNew&&window.state&&document.getElementById('moreSheetV2'));
const read=(page,key)=>page.evaluate(k=>{try{return (window.__chefStorage||localStorage).getItem(k)}catch(e){return null}},key);

test('Une installation neuve n’annonce rien et prépare la mise à jour suivante',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.launchState())).toBe('premiere-installation');
  await page.waitForTimeout(2200);                 // au-delà du délai d'ouverture automatique
  await expect(page.locator('#storeRunnerWhatsNew')).toBeHidden();
  expect(await read(page,SEEN_KEY)).toBe(await page.evaluate(()=>window.StoreRunnerWhatsNew.currentVersion()));
  expect(await read(page,LAST_BUILD_KEY)).toBe(await page.evaluate(()=>window.StoreRunnerWhatsNew.currentBuild()));
  expect(errors).toEqual([]);
});

// Régression : pendant store-photos-browser, la modale restait ouverte après le
// rechargement de page et interceptait le tap sur #srReportQuickBtn. Un rechargement
// dans la même version n'est pas une mise à jour et ne doit rien ouvrir, même lorsque
// l'application a entre-temps écrit ses données.
test('Un rechargement dans la même version n’interpose jamais l’écran sur l’application',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  await expect(page.locator('#storeRunnerWhatsNew')).toBeHidden();

  // L'application écrit ses données, exactement comme le fait le test métier.
  await page.evaluate(()=>{
    const st=window.state;
    st.stores=[{id:'whatsnew-reload',enseigne:'Boulanger',ville:'Test',adresse:'1 rue Test',active:true,products:['Brun']}];
    st.visits={};st.notes={};st.included={};st.excluded={};st.locks={};st.plan={};
    try{save()}catch(e){}
  });

  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.launchState())).toBe('meme-build');
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.pendingVersion())).toBeNull();
  await page.waitForTimeout(2200);
  await expect(page.locator('#storeRunnerWhatsNew')).toBeHidden();

  // Rien n'intercepte les gestes de l'application : un vrai tap aboutit.
  await page.locator('.bottomNavBtn[data-more="1"]').tap();
  await expect(page.locator('#moreSheetV2')).toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test('Nouveautés s’affiche une seule fois après une vraie mise à jour et se rouvre depuis le menu ⋮ à 390 px',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  // Un utilisateur qui tournait sur une version antérieure et reçoit celle-ci.
  await page.addInitScript(([key,build])=>{try{if(!localStorage.getItem(key))localStorage.setItem(key,build)}catch(e){}},[LAST_BUILD_KEY,ANCIEN_BUILD]);

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.launchState())).toBe('mise-a-jour');

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
  expect(await read(page,SEEN_KEY)).toBeNull();

  // --- « Compris » ferme, enregistre la version et désarme l'annonce --------------------
  await ok.tap();
  await expect(dialog).toBeHidden();
  expect(await read(page,SEEN_KEY)).toBe(version);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.pendingVersion())).toBeNull();

  // --- Après rechargement : plus d'ouverture automatique --------------------------------
  await page.reload({waitUntil:'domcontentloaded'});
  await ready(page);
  expect(await page.evaluate(()=>window.StoreRunnerWhatsNew.launchState())).toBe('meme-build');
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
  expect(await read(page,SEEN_KEY)).toBe(version);

  expect(errors).toEqual([]);
});
