/* Runner 3D Lab : comportement réel dans un navigateur mobile. N'utilise PAS le serveur de l'application :
   la page est servie sur une origine fictive (https://lab.test/) avec exactement les fichiers publiés. */
const {test,expect}=require('@playwright/test');
const lab=require('../tools/runner-lab-routes.cjs');

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});

async function open(page,hash){
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  const net=await lab.install(page);
  await page.goto(net.url+(hash?'#'+hash:''));
  await page.waitForFunction(()=>window.RunnerLab&&window.RunnerLab.scene);
  return{errors,net};
}
const tab=(page,t)=>page.locator('#tabs [data-tab="'+t+'"]').tap();
const btn=(page,label)=>page.locator('.actions .btn',{hasText:label}).first();

test('Le Lab se charge sans erreur, sans requête hors de son origine, et affiche les deux Runners',async({page})=>{
  const {errors,net}=await open(page);
  await expect(page.locator('h1')).toHaveText('Runner 3D Lab');
  await expect(page.locator('.srRunner')).toHaveCount(1);
  await expect(page.locator('.r3Host')).toHaveCount(1);
  expect(await page.evaluate(()=>[typeof StoreRunnerRunner.mount,typeof Runner3D.mount])).toEqual(['function','function']);
  expect(net.outside).toEqual([]);
  expect(net.requests.every(p=>['/','/runner-visual.js','/runner3d.js','/lab.js','/runner-whats-new.webp','/favicon.ico'].includes(p))).toBe(true);
  expect(errors).toEqual([]);
});

test('Le bouton Runner actuel / Les deux / Runner 3D bascule et mémorise le choix',async({page})=>{
  const {errors}=await open(page);
  await page.locator('#modeSeg [data-mode="classic"]').tap();
  await expect(page.locator('.srRunner')).toHaveCount(1);await expect(page.locator('.r3Host')).toHaveCount(0);
  await page.locator('#modeSeg [data-mode="3d"]').tap();
  await expect(page.locator('.r3Host')).toHaveCount(1);await expect(page.locator('.srRunner')).toHaveCount(0);
  await page.reload();await page.waitForFunction(()=>window.RunnerLab&&window.RunnerLab.scene);
  await expect(page.locator('#modeSeg [data-mode="3d"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>!['r3lab:mode','r3lab:tab'].includes(k)))).toEqual([]);   // rien d'autre que les deux préférences
  expect(await page.evaluate(()=>localStorage.getItem('r3lab:mode'))).toBe('3d');
  expect(await page.evaluate(()=>navigator.serviceWorker?navigator.serviceWorker.getRegistrations().then(r=>r.length):0)).toBe(0);
  expect(errors).toEqual([]);
});

for(const [w,h] of [[360,740],[390,844],[412,915]]){
  test(`Chaque scène tient à ${w} px : aucun débordement, cibles tactiles ≥ 44 px`,async({page})=>{
    await page.setViewportSize({width:w,height:h});
    const {errors}=await open(page);
    for(const t of ['home','assistant','cards','moves','ambient','perf','report']){
      await tab(page,t);await page.waitForTimeout(250);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth),'scène '+t).toBeLessThanOrEqual(w);
      for(const b of await page.locator('.btn:visible, #modeSeg button, #tabs button').all())
        expect((await b.boundingBox()).height,'cible '+t).toBeGreaterThanOrEqual(43.5);
    }
    expect(errors).toEqual([]);
  });
}

test('Les quatre états : yeux recolorés en 3D, état identique côté classique',async({page})=>{
  const {errors}=await open(page);await tab(page,'moves');
  const eye=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.r3Eyes')).getPropertyValue('--eye').trim());
  const expected={Neutre:['neutral','#4db8ff'],Analyse:['analyzing','#6fd0ff'],Alerte:['alert','#ff6a55'],Succès:['success','#3fe0a0']};
  for(const [label,[state,color]] of Object.entries(expected)){
    await btn(page,label).tap();await page.waitForTimeout(150);
    await expect(page.locator('.srRunner')).toHaveAttribute('data-state',state);
    await expect(page.locator('.r3Host')).toHaveAttribute('data-state',state);
    expect(await eye()).toBe(color);
  }
  expect(errors).toEqual([]);
});

test('Gestes : chaque geste 3D anime le bon calque ; les gestes absents du classique sont signalés',async({page})=>{
  const {errors}=await open(page);await tab(page,'moves');
  const anim=sel=>page.evaluate(s=>document.querySelector(s).getAnimations().length,sel);
  const map={Clignement:'.r3Eyes',Hochement:'.r3Head',Inclinaison:'.r3Head',Regard:'.r3Head',Salut:'.r3Arm',Saut:'.r3Float',Secousse:'.r3Head'};
  for(const [label,sel] of Object.entries(map)){
    await btn(page,label).tap();await page.waitForTimeout(80);
    expect(await anim(sel),label).toBeGreaterThan(0);
    await page.waitForTimeout(1700);
  }
  await btn(page,'Salut').tap();
  await expect(page.locator('#toast')).toContainText('Absent du Runner actuel');
  expect(errors).toEqual([]);
});

test('Assis : jambes qui balancent (classique natif, 3D simulé) puis debout',async({page})=>{
  const {errors}=await open(page);await tab(page,'moves');
  await btn(page,'Assis').tap();await page.waitForTimeout(500);
  await expect(page.locator('.srRunner')).toHaveAttribute('data-posture','seated');
  await expect(page.locator('.srRunner')).toHaveAttribute('data-legs','swing');
  await expect(page.locator('.r3Host')).toHaveAttribute('data-posture','seated');
  expect(await page.evaluate(()=>document.querySelector('.r3LegL').getAnimations().length+document.querySelector('.r3LegR').getAnimations().length)).toBeGreaterThan(0);
  await btn(page,'Debout').tap();
  await expect(page.locator('.r3Host')).toHaveAttribute('data-posture','floating');
  expect(errors).toEqual([]);
});

test('Déplacement : les deux Runners changent d’hôte, d’une carte à l’autre et de A à B',async({page})=>{
  const {errors}=await open(page);await tab(page,'cards');
  const parentClass=()=>page.evaluate(()=>[...document.querySelectorAll('.srRunner,.r3Host')].map(h=>h.parentNode.closest('.storeCard').querySelector('b').textContent));
  expect(await parentClass()).toEqual(['Magasin Démo Nord','Magasin Démo Nord']);
  await btn(page,'Carte suivante').tap();await page.waitForTimeout(1500);
  expect(await parentClass()).toEqual(['Magasin Démo Centre','Magasin Démo Centre']);
  await page.locator('.storeCard').nth(2).tap();await page.locator('.storeCard').nth(5).tap();await page.waitForTimeout(1500);   // une carte par Runner
  expect(await parentClass()).toEqual(['Magasin Démo Sud','Magasin Démo Sud']);
  await btn(page,'S’asseoir').tap();await page.waitForTimeout(1500);
  await expect(page.locator('.r3Host')).toHaveAttribute('data-posture','seated');
  expect(errors).toEqual([]);
});

test('Accueil et Assistant : les états suivent le scénario fictif',async({page})=>{
  const {errors}=await open(page);
  await btn(page,'Fin de tournée').tap();await page.waitForTimeout(200);
  await expect(page.locator('.r3Host')).toHaveAttribute('data-state','success');
  await expect(page.locator('.r3Bubble')).toContainText('Tournée terminée');
  await tab(page,'assistant');
  await btn(page,'Poser une question').tap();await page.waitForTimeout(300);
  await expect(page.locator('.r3Host')).toHaveAttribute('data-state','analyzing');
  await page.waitForTimeout(2200);
  await expect(page.locator('.msg.bot').last()).toContainText('vendredi 9 h');
  await expect(page.locator('.r3Host')).toHaveAttribute('data-state','success');
  await btn(page,'Contrainte détectée').tap();await page.waitForTimeout(1900);
  await expect(page.locator('.r3Host')).toHaveAttribute('data-state','alert');
  expect(errors).toEqual([]);
});

test('Ambiance : les six micro-animations s’enchaînent sans erreur ni résidu',async({page})=>{
  test.setTimeout(90000);
  const {errors}=await open(page,'ambient');
  await page.waitForFunction(()=>RunnerLab.S.tab==='ambient');
  await btn(page,'Tout enchaîner').tap();
  await page.waitForFunction(()=>!document.querySelector('.letter'),null,{timeout:60000});
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('Mouvement réduit : le Lab le signale et aucun geste n’est joué, comme en production',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const {errors}=await open(page);
  await expect(page.locator('#motionNote')).toBeVisible();
  await tab(page,'moves');await btn(page,'Hochement').tap();await page.waitForTimeout(100);
  expect(await page.evaluate(()=>document.querySelector('.r3Head').getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});

test('Mode sombre : le Lab reste lisible et sans débordement',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  const {errors}=await open(page);
  expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 22, 38)');
  for(const t of ['home','report'])await tab(page,t);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test('Mesures : le banc d’essai produit des chiffres pour les deux Runners',async({page})=>{
  test.setTimeout(60000);
  const {errors}=await open(page);
  const res=await page.evaluate(async()=>{
    const box=document.createElement('div');document.body.appendChild(box);
    const out={};for(const k of ['classic','3d'])out[k]=await RunnerLab.measure(k,1800,box,()=>{});return out;
  });
  for(const k of ['classic','3d']){
    expect(res[k].images_par_s,k).toBeGreaterThan(5);
    expect(res[k].montage_ms,k).toBeGreaterThanOrEqual(0);
    expect(res[k].noeuds_dom,k).toBeGreaterThan(10);
  }
  expect(res['3d'].noeuds_dom).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Compte rendu : empreinte de runner-visual.js identique, isolation affichée',async({page})=>{
  const {errors}=await open(page,'report');
  await expect(page.locator('pre').first()).toContainText('identique à main ✓');
  await expect(page.locator('#panel')).toContainText('Requêtes vers store-runner.fr : aucune');
  await expect(page.locator('#panel table')).toContainText('Indisponible');
  expect(errors).toEqual([]);
});
