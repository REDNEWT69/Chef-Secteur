const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* V259 — « Votre activité » personnalisable, à 390 px : épingler, ordre, retirer,
   « Voir tout », persistance après rechargement (moteur durable V256), réinitialisation,
   taps, et bandeau historique « Cette semaine » depuis la source unique.
   Même jeu que V258 : mercredi 23/09/2026, 12 magasins planifiés, 18 crédits, 17 visites. */
const TODAY='2026-09-23';
const KEY='store-runner-home-cards-v1';
async function boot(page,errors){
  if(errors)page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.clock.setFixedTime(new Date(TODAY+'T10:00:00'));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await ready(page);
}
async function ready(page){
  await page.waitForFunction(()=>window.StoreRunnerActivityMetrics&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.StoreRunnerHomeV204&&document.querySelector('#premiumHomeV2 .phGrid'));
}
async function seed(page){
  await page.evaluate(()=>{
    const st=window.state,M=window.StoreRunnerVisitModel;
    const mk=(p,e,i)=>({id:p+i,enseigne:e,ville:'Ville-Test '+p+i,adresse:i+' rue Test',dept:'73',lat:45.5+i/100,lon:5.9,active:true,priority:3,intervalDays:30});
    const list=[0,1,2,3,4,5].map(i=>mk('d','Darty',i)).concat([0,1,2,3,4,5].map(i=>mk('s','Enseigne Simple',i)));
    st.stores=list;st.profile=Object.assign({},st.profile,{baseName:'Maison',baseLat:45.19,baseLon:5.72});
    st.settings.weekDate='2026-09-21';st.settings.target=15;st.settings.days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    st.plan={Lundi:list.slice(0,3),Mardi:list.slice(3,6),Mercredi:list.slice(6,9),Jeudi:list.slice(9,12),Vendredi:[],Samedi:[]};
    st.visits={};st.businessV2=M.empty();
    let k=0;
    for(const day of ['2026-09-21','2026-09-22','2026-09-23'])for(const s of list){
      if(k>=17)break;
      const id=M.start(st,s.id);M.editVisit(st,id,'conclusion',null,'Visite synthétique V259');M.complete(st,id,day);k++;
    }
    save();renderAll();
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'test-v259'}}));
    goTab('homePanel');
  });
  /* L'accueil a été reconstruit avec le jeu de test (12 magasins actifs). */
  await expect(page.locator('#premiumHomeV2 .phSector')).toContainText('12 magasins');
}
const homeIds=page=>page.locator('#premiumHomeV2 .phGrid .phCard').evaluateAll(els=>els.map(e=>e.dataset.homeCard));
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
async function withinViewport(locator){const b=await locator.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(390)}

test('Personnaliser : épingler, ordonner, retirer, puis rechargement et réinitialisation',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page);
  const heading=page.locator('#premiumHomeV2 .phActivityHeading');
  await expect(heading).toHaveAttribute('data-home-mode','auto');
  await expect(page.locator('#premiumHomeV2 .phCard.phPinned')).toHaveCount(0);
  const autoIds=await homeIds(page);
  expect(autoIds.length).toBeGreaterThan(0);expect(autoIds.length).toBeLessThanOrEqual(4);
  expect(await page.evaluate(k=>window.__chefStorage.getItem(k),KEY),'utilisateur existant : aucune préférence écrite').toBeNull();

  await heading.getByRole('button',{name:'Personnaliser'}).click();
  const sheet=page.locator('#homeCardsSheet');
  await expect(sheet).toHaveJSProperty('open',true);
  await expect(sheet.locator('[data-home-view="edit"]')).toHaveAttribute('aria-pressed','true');
  await withinViewport(sheet);
  expect(await sheet.locator('.phSheetBody').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);

  /* Épingler « Cette semaine » puis « Ce mois », et remonter « Ce mois ». */
  await sheet.locator('[data-card-id="week"]').locator('[data-home-pin],[data-home-add]').click();
  await sheet.locator('[data-card-id="month"]').locator('[data-home-pin],[data-home-add]').click();
  await expect(sheet.locator('.phEditRow[data-placement="pinned"]')).toHaveCount(2);
  await sheet.locator('.phEditRow[data-card-id="month"] [data-home-move="-1"]').click();
  await expect(sheet.locator('.phEditRow[data-placement="pinned"]').first()).toHaveAttribute('data-card-id','month');
  let ids=await homeIds(page);
  expect(ids.slice(0,2)).toEqual(['month','week']);
  expect(ids.length).toBe(Math.max(2,Math.min(4,2+autoIds.filter(id=>id!=='week'&&id!=='month').length)));
  await expect(page.locator('#premiumHomeV2 .phCard[data-home-card="month"]')).toHaveClass(/phPinned/);
  await expect(page.locator('#premiumHomeV2 .phCard[data-home-card="week"] .phValue')).toHaveText('17 visites réalisées');
  await expect(page.locator('#premiumHomeV2 .phCard[data-home-card="week"] .phSub')).toHaveText('12 magasins planifiés · 18 crédits de visite · objectif 15 magasins');
  await expect(page.locator('#premiumHomeV2 .phCard[data-home-card="month"] .phValue')).toHaveText('17 visites réalisées');

  /* Retirer une carte automatique : elle ne revient plus par le classement. */
  const autoRow=sheet.locator('.phEditRow[data-placement="auto"]').first();
  let removed=null;
  if(await autoRow.count()){
    removed=await autoRow.getAttribute('data-card-id');
    await autoRow.locator('[data-home-remove]').click();
    expect(await homeIds(page)).not.toContain(removed);
    await expect(sheet.locator(`.phEditRow[data-card-id="${removed}"]`)).toHaveAttribute('data-placement','hidden');
  }
  await expect(heading).toHaveAttribute('data-home-mode','custom');
  await sheet.locator('[data-home-close]').click();
  await expect(sheet).toHaveJSProperty('open',false);
  const before=await homeIds(page);
  expect(await noOverflow(page)).toBeLessThanOrEqual(1);

  /* Rechargement : les choix viennent du moteur durable, pas de la mémoire. */
  await page.evaluate(()=>window.__chefStorage.flush());
  const stored=JSON.parse(await page.evaluate(k=>window.__chefStorage.getItem(k),KEY));
  expect(stored.pinned).toEqual(['month','week']);
  await page.reload({waitUntil:'domcontentloaded'});await ready(page);
  await expect.poll(()=>homeIds(page)).toEqual(before);
  await expect(page.locator('#premiumHomeV2 .phActivityHeading')).toHaveAttribute('data-home-mode','custom');
  expect(await page.evaluate(()=>Object.keys(state.settings||{}).some(k=>/home.?cards/i.test(k))),'rien n’est écrit dans state').toBe(false);

  /* Réinitialiser : retour exact au mode automatique. */
  await page.locator('#premiumHomeV2 [data-home-customize]').click();
  await page.locator('#homeCardsSheet [data-home-reset]').click();
  await expect(page.locator('#premiumHomeV2 .phActivityHeading')).toHaveAttribute('data-home-mode','auto');
  await expect(page.locator('#homeCardsSheet [data-home-reset]')).toBeDisabled();
  expect(await homeIds(page)).toEqual(autoIds);
  expect(await page.evaluate(k=>window.__chefStorage.getItem(k),KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test('Voir tout : toutes les cartes, ajout/retrait de l’accueil, taps vers le bon contenu',async({page})=>{
  const errors=[];await boot(page,errors);await seed(page);
  await page.locator('#premiumHomeV2 [data-home-all]').click();
  const sheet=page.locator('#homeCardsSheet');
  await expect(sheet).toHaveJSProperty('open',true);
  await expect(sheet.locator('[data-home-view="all"]')).toHaveAttribute('aria-pressed','true');
  const cards=sheet.locator('.phSheetCard');
  await expect(cards).toHaveCount(8);
  expect(await cards.evaluateAll(els=>els.map(e=>e.dataset.cardId))).toEqual(['week','action-now','priority','opportunities','appointment','watch','actions','month']);
  for(const label of ['Cette semaine','À traiter maintenant','Prochaine priorité','Opportunités','Prochain rendez-vous','À surveiller','Actions ouvertes','Ce mois'])await expect(sheet.locator('.phLabel',{hasText:label})).toHaveCount(1);
  expect(await sheet.locator('.phSheetBody').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  const values=await cards.locator('.phValue').allTextContents();
  for(const v of values)expect(v).not.toMatch(/NaN|undefined|^\s*$/);

  /* Ajouter une carte absente, puis la retirer, depuis « Voir tout ». */
  const onHome=new Set(await homeIds(page));
  const target=['appointment','watch','actions','opportunities','priority','action-now'].find(id=>!onHome.has(id));
  await sheet.locator(`.phSheetCard[data-card-id="${target}"] [data-home-add]`).click();
  expect((await homeIds(page))[0]).toBe(target);
  await expect(sheet.locator(`.phSheetCard[data-card-id="${target}"]`)).toHaveClass(/\bon\b/);
  await sheet.locator(`.phSheetCard[data-card-id="${target}"] [data-home-remove]`).click();
  expect(await homeIds(page)).not.toContain(target);

  /* Tap sur une carte de la feuille : ouvre son contenu, ferme la feuille. */
  await sheet.locator('.phSheetCard[data-card-id="week"] [data-home-open]').click();
  await expect(sheet).toHaveJSProperty('open',false);
  await expect(page.locator('#planPanel')).toHaveClass(/active/);

  /* Tap normal sur les cartes de l'accueil. */
  await page.evaluate(()=>goTab('homePanel'));
  await page.evaluate(k=>{window.__chefStorage.setItem(k,JSON.stringify({version:1,pinned:['week','month','priority'],hidden:[]}));document.dispatchEvent(new CustomEvent('store-runner:planning-updated',{detail:{reason:'test-v259'}}))},KEY);
  await expect.poll(()=>homeIds(page)).toEqual(expect.arrayContaining(['week','month','priority']));
  await page.locator('#premiumHomeV2 .phCard[data-home-card="week"]').click();
  await expect(page.locator('#planPanel')).toHaveClass(/active/);
  await page.evaluate(()=>goTab('homePanel'));
  const priority=page.locator('#premiumHomeV2 .phCard[data-home-card="priority"]');
  const storeId=await priority.getAttribute('data-store-id');
  expect(storeId,'le jeu de test a une prochaine priorité réelle').toBeTruthy();
  await priority.click();
  await expect(page.locator('#storeQuickSheet')).toHaveClass(/open/);
  await expect(page.locator('#srQuickStart')).toHaveAttribute('data-sr-start',storeId);
  await page.evaluate(()=>{if(typeof closeStoreQuick==='function')closeStoreQuick();else document.getElementById('storeQuickSheet').classList.remove('open');goTab('homePanel')});
  await page.locator('#premiumHomeV2 .phCard[data-home-card="month"]').click();
  await expect(page.locator('#historyPanel')).toHaveClass(/active/);

  /* Bandeau historique : mêmes chiffres, même source, plus de compteur state.plan. */
  const brief=page.locator('#smartBrief [data-brief="week"]');
  await expect(brief.locator('strong')).toHaveText('17 visites réalisées');
  await expect(brief.locator('small')).toHaveText('12 magasins planifiés · 18 crédits de visite · objectif 15 magasins');
  await expect(page.locator('#historyKpis')).toContainText('17');
  expect(await noOverflow(page)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
