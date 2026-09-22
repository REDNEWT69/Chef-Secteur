/* V238 — ce que le FMT voit réellement à 390 px quand le moteur IA revient vide.
   Le second essai vit dans le Worker : la passerelle simulée ici reproduit donc ses deux
   sorties réelles, celle du succès après rejeu (`attempts:2`) et celle de l'échec classé
   (HTTP 502 portant `ai_empty_response`). Que le Worker produise bien ces deux sorties est
   prouvé par tests/visit-report-empty-retry-v238.test.cjs.
   Fixtures 100 % synthétiques : aucune note terrain, aucun magasin réel. */
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

async function seed(page, family){
  await page.evaluate(fam => {
    const st=window.state,M=window.StoreRunnerVisitModel;
    st.stores=[{id:'v238-1',enseigne:'Enseigne-Test',ville:'Ville-Test',adresse:'5 rue de Test',dept:'99',
      lat:45.4,lon:4.4,active:true,priority:4,products:['Blanc','Brun']}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=M.empty();
    const id=M.start(st,'v238-1');
    M.editReport(st,id,'shared','context','Rayon accessible, responsable present.');
    M.editReport(st,id,fam,'team','Le vendeur signale une rupture sur deux references.');
    M.editReport(st,id,fam,'training','Revoir la disponibilite au prochain passage.');
    M.editVisit(st,id,'conclusion',null,'Passage terrain');
    M.complete(st,id,'2026-09-21');
    save();
    window.aiConfig=window.aiConfig||{};window.aiConfig.gateway='/api/ai';window.aiConfig.mode='online';
    return id;
  }, family);
}
/* Seul le transport est remplacé : le module V225 et l'interface restent ceux du produit. */
async function installGateway(page, answers){
  await page.evaluate(list => {
    window.__aiCalls=[];
    const queue=list.slice();
    window.callAIGateway=async opts=>{
      window.__aiCalls.push({mode:opts.mode,retryEmpty:opts.retryEmpty,message:opts.message});
      const next=queue.shift();
      if(next&&next.throw)throw new Error(next.throw);
      return next&&next.response;
    };
    window.StoreRunnerVisitReportJSONV225.install();
  }, answers);
}
function blancDoc(){
  return {famille:'BLANC',contexte:'Rayon accessible.',lavage:'Presence correcte.',froid:'',cuisson:'',
    entretien_sols:'',retours_vendeurs:['Le vendeur signale une rupture sur deux references.'],
    retours_clients:[],concurrence:[],points_positifs:[],blocages:[],actions_realisees:[],formation:[],
    prochain_passage:['Revoir la disponibilite au prochain passage.'],priorite:'',synthese:'Situation stable.'};
}
/* Corps réellement renvoyé par le Worker quand les deux tentatives reviennent vides, puis
   tronqué à 180 caractères comme le fait `callAIGateway`. Le code interne, écrit en tête,
   doit survivre à cette coupe — c'est lui qui déclenche la phrase métier. */
function emptyGatewayError(){
  const body=JSON.stringify({code:'ai_empty_response',error:'Le moteur IA n’a produit aucun texte.',
    attempts:2,provider:'groq',model:'modele-test',finishReason:'length',textLength:0,fallbackUsed:true});
  return 'Passerelle IA : HTTP 502 · '+body.substring(0,180);
}
async function openReport(page){
  const id=await page.evaluate(()=>state.businessV2.visits[0].id);
  await page.evaluate(v=>window.StoreRunnerVisitReport.open(v), id);
  const sheet=page.locator('#srReportSheet');
  await expect(sheet).toBeVisible();
  await page.evaluate(()=>{
    const tabs=document.querySelectorAll('#srReportTabs button');
    const blanc=[...tabs].find(b=>/blanc/i.test(b.textContent||''));
    if(blanc)blanc.click();
  });
  return sheet;
}

test('BLANC : un second essai réussi est annoncé discrètement, à 390 px', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisitModel&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitReportJSONV225&&typeof window.save==='function');
  await seed(page,'blanc');
  // Sortie réelle du Worker après rejeu interne : un seul aller-retour, attempts=2.
  await installGateway(page,[{response:{text:JSON.stringify(blancDoc()),provider:'groq',
    fallbackFrom:'cloudflare-workers-ai',finishReason:'stop',truncated:false,attempts:2,retried:true,mode:'visit_report'}}]);

  const sheet=await openReport(page);
  const button=sheet.locator('#srReportAI');
  await expect(button).toBeEnabled();
  await button.tap();

  await expect(sheet.locator('#srReportStatus')).toContainText('généré après une seconde tentative',{timeout:10000});
  await expect(sheet.locator('#srReportText')).toHaveValue(/^⚪ Résumé BLANC – Enseigne-Test Ville-Test/);
  // Aucun jargon technique dans l'interface normale.
  const statut=await sheet.locator('#srReportStatus').textContent();
  expect(statut).not.toMatch(/HTTP|ai_empty_response|finishReason|provider/i);
  await expect(button).toBeEnabled();
  await expect(button).not.toContainText('Génération en cours');

  // Un seul aller-retour passerelle : le second essai est resté interne au Worker.
  const calls=await page.evaluate(()=>window.__aiCalls);
  expect(calls).toHaveLength(1);
  expect(calls[0].retryEmpty).toBe(true);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('BLANC : deux réponses vides donnent la phrase métier, jamais « HTTP 500 »', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisitModel&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitReportJSONV225&&typeof window.save==='function');
  await seed(page,'blanc');
  await installGateway(page,[{throw:emptyGatewayError()}]);

  const sheet=await openReport(page);
  const local=await sheet.locator('#srReportText').inputValue();
  expect(local.length).toBeGreaterThan(50);

  const button=sheet.locator('#srReportAI');
  await button.tap();

  await expect(sheet.locator('#srReportStatus'))
    .toContainText('Le résumé IA n’a pas pu être généré après deux tentatives. Le compte rendu local est conservé.',{timeout:10000});
  const statut=await sheet.locator('#srReportStatus').textContent();
  expect(statut).not.toMatch(/HTTP|ai_empty_response|502|Passerelle/i);

  // Le rapport local est intact, le bouton redevient utilisable, la cible tactile tient.
  await expect(sheet.locator('#srReportText')).toHaveValue(local,{timeout:5000});
  await expect(button).toBeEnabled();
  await expect(button).not.toContainText('Génération en cours');
  const box=await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);

  // Aucun troisième appel automatique, et les notes terrain ne bougent pas.
  const calls=await page.evaluate(()=>window.__aiCalls);
  expect(calls).toHaveLength(1);
  const notes=await page.evaluate(()=>window.StoreRunnerVisitModel.reportOf(state.businessV2.visits[0]).blanc.team);
  expect(notes).toBe('Le vendeur signale une rupture sur deux references.');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('BLANC : un double tap pendant le second essai ne lance qu’une génération', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisitModel&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitReportJSONV225&&typeof window.save==='function');
  await seed(page,'blanc');
  // Réponse lente : elle modélise le temps réel du second essai côté Worker.
  await page.evaluate(doc => {
    window.__aiCalls=[];
    window.callAIGateway=async opts=>{
      window.__aiCalls.push({mode:opts.mode});
      await new Promise(r=>setTimeout(r,700));
      return {text:JSON.stringify(doc),attempts:2,retried:true,mode:'visit_report'};
    };
    window.StoreRunnerVisitReportJSONV225.install();
  }, blancDoc());

  const sheet=await openReport(page);
  const button=sheet.locator('#srReportAI');
  await button.tap();
  // Le bouton doit être verrouillé pendant toute la génération, second essai compris.
  await expect(button).toBeDisabled();
  await expect(button).toContainText('Génération en cours');
  await page.evaluate(()=>document.getElementById('srReportAI').click());

  await expect(sheet.locator('#srReportStatus')).toContainText('généré après une seconde tentative',{timeout:10000});
  const calls=await page.evaluate(()=>window.__aiCalls);
  expect(calls).toHaveLength(1);
  await expect(button).toBeEnabled();

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
