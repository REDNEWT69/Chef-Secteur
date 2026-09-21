const { test, expect } = require('@playwright/test');

const APP_URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 1,
  serviceWorkers: 'block',
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure'
});

/* Jeu d'essai calqué sur le cas réel : une visite saisie sur le mauvais magasin,
   alors qu'elle appartenait à Saint-Étienne Villard. */
async function seed(page){
  await page.evaluate(() => {
    const st=window.state,M=window.StoreRunnerVisitModel,O=window.StoreRunnerOpportunities;
    st.stores=[
      {id:'ste',enseigne:'Boulanger',ville:'Saint-Étienne Villard',adresse:'2 rue du Villard',dept:'42',lat:45.44,lon:4.39,active:true,priority:4},
      {id:'autre',enseigne:'Darty',ville:'Ville-Test B',adresse:'8 avenue Test',dept:'42',lat:45.46,lon:4.41,active:true,priority:3}
    ];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=M.empty();
    const erronee=M.start(st,'autre');
    M.editVisit(st,erronee,'conclusion',null,'Visite saisie sur le mauvais magasin');
    M.edit6P(st,erronee,'prix',0,'action','Corriger l’étiquette prix');
    M.actionFrom6P(st,erronee,'prix',0);
    M.complete(st,erronee,'2026-09-15');
    O.createOpportunity(st,{storeId:'autre',visitId:erronee,category:'pdl',description:'Mural TV à regagner'});
    const gardee=M.start(st,'ste');
    M.editVisit(st,gardee,'conclusion',null,'Vrai passage Saint-Étienne Villard');
    M.complete(st,gardee,'2026-09-16');
    for(const v of st.businessV2.visits){v.completedAt=v.completedDate+'T12:00:00.000Z';v.updatedAt=v.completedAt}
    save();
    return erronee;
  });
}

test('Une visite erronée se supprime proprement depuis sa consultation, à 390 px', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept());

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreRunnerVisits && window.StoreRunnerVisitModel && window.StoreRunnerOpportunities && typeof window.save==='function');
  await seed(page);

  const erronee=await page.evaluate(()=>state.businessV2.visits.find(v=>v.storeId==='autre').id);
  await page.evaluate(id=>window.StoreRunnerVisits.openVisit(id),erronee);

  const dialog=page.locator('#srVisitDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#srVisitTitle')).toContainText('Visite terminée');

  // Le bouton destructif n'est pas atteignable par un tap malheureux : il vit dans un repli fermé.
  const zone=dialog.locator('.sr-dangerZone');
  await expect(zone).toBeVisible();
  const deleteButton=dialog.locator('[data-sr-delete-visit]');
  await expect(deleteButton).toBeHidden();

  await zone.locator('summary').tap();
  await expect(deleteButton).toBeVisible();
  const box=await deleteButton.boundingBox();
  if(!box)throw new Error('Bouton de suppression introuvable');
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeLessThanOrEqual(390);

  // Le bouton destructif reste à distance du bouton de fermeture, en bas de l'écran.
  const head=await dialog.locator('.sr-head').boundingBox();
  if(head)expect(box.y).toBeGreaterThan(head.y+head.height);

  await deleteButton.tap();
  await expect(page.locator('#srVisitDialog .sr-status')).toContainText('Visite supprimée');

  const after=await page.evaluate(()=>({
    visits:state.businessV2.visits.map(v=>({id:v.id,storeId:v.storeId,date:v.completedDate})),
    actions:state.businessV2.actions.length,
    opportunities:(state.businessV2.opportunities||[]).map(o=>({storeId:o.storeId,visitId:o.visitId,source:o.source})),
    legacy:state.visits
  }));
  expect(after.visits).toHaveLength(1);
  expect(after.visits[0].storeId).toBe('ste');
  expect(after.actions).toBe(0);
  expect(after.opportunities).toEqual([{storeId:'autre',visitId:null,source:'store'}]);
  expect(after.legacy.autre.history).toEqual([]);
  expect(after.legacy.autre.lastVisit).toBe('');
  expect(after.legacy.ste.history).toEqual(['2026-09-16']);

  // Le hub Visites, l'historique et les KPI reflètent la suppression sans rechargement.
  await expect(dialog.locator('.sr-item')).toHaveCount(1);
  await page.evaluate(()=>{goTab('historyPanel')});
  await expect(page.locator('#historyList')).not.toContainText('Ville-Test B');
  await expect(page.locator('#historyKpis')).toContainText('1');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Persistance : après rechargement, la visite fantôme n'est jamais revenue.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreRunnerVisitModel && window.state && window.state.businessV2);
  const reloaded=await page.evaluate(()=>({
    visits:state.businessV2.visits.length,
    stores:state.businessV2.visits.map(v=>v.storeId),
    opportunities:(state.businessV2.opportunities||[]).map(o=>o.visitId),
    legacy:state.visits
  }));
  expect(reloaded.visits).toBe(1);
  expect(reloaded.stores).toEqual(['ste']);
  expect(reloaded.opportunities).toEqual([null]);
  expect(reloaded.legacy.ste.history).toEqual(['2026-09-16']);
  expect(pageErrors,'La suppression de visite ne doit produire aucune erreur JavaScript').toEqual([]);
});

test('L’écran Historique délègue la suppression et cible la bonne visite', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));
  page.on('dialog', d => d.accept());

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.StoreRunnerVisits && window.StoreRunnerVisitModel && window.StoreRunnerOpportunities && typeof window.save==='function');
  await seed(page);
  await page.evaluate(()=>{renderAll();goTab('historyPanel')});

  const row=page.locator('#historyList .historyRow',{hasText:'Ville-Test B'});
  await expect(row).toHaveCount(1);
  const deleteButton=row.locator('.visitDeleteBtn');
  const box=await deleteButton.boundingBox();
  if(!box)throw new Error('Bouton Supprimer introuvable dans l’historique');
  expect(box.height).toBeGreaterThanOrEqual(44);

  await deleteButton.tap();
  await expect(page.locator('#historyList')).not.toContainText('Ville-Test B');
  await expect(page.locator('#historyList')).toContainText('Saint-Étienne Villard');

  const after=await page.evaluate(()=>({
    visits:state.businessV2.visits.map(v=>v.storeId),
    legacy:state.visits
  }));
  expect(after.visits).toEqual(['ste'],'la vraie visite doit partir de businessV2, pas seulement la ligne d’historique');
  expect(after.legacy.autre.history).toEqual([]);
  expect(after.legacy.ste.history).toEqual(['2026-09-16']);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors,'L’écran Historique ne doit produire aucune erreur JavaScript').toEqual([]);
});
