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

/* Fixtures synthétiques : aucune note terrain réelle, aucun magasin réel. */
async function seed(page, family){
  await page.evaluate(fam => {
    const st=window.state,M=window.StoreRunnerVisitModel;
    st.stores=[{id:'ai-1',enseigne:'Enseigne-Test',ville:'Ville-Test',adresse:'3 rue de Test',dept:'99',
      lat:45.4,lon:4.4,active:true,priority:4,products:['Blanc','Brun']}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=M.empty();
    const id=M.start(st,'ai-1');
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
/* Passerelle de test : on remplace uniquement le transport, jamais le module V225,
   pour que la vraie chaîne extraction → validation → réparation soit exercée. */
async function installGateway(page, answers){
  await page.evaluate(list => {
    window.__aiCalls=[];
    const queue=list.slice();
    const transport=async opts=>{window.__aiCalls.push({mode:opts.mode,message:opts.message});
      const next=queue.shift();
      if(next&&next.throw)throw new Error(next.throw);
      return next&&next.response;};
    window.callAIGateway=transport;
    window.StoreRunnerVisitReportJSONV225.install();
  }, answers);
}
function brunDoc(){
  return {famille:'BRUN',contexte:'Tete de gondole occupee.',merchandising:'Visibilite correcte.',
    retours_vendeurs:['Le vendeur signale une rupture sur deux references.'],retours_clients:[],concurrence:[],
    audio:'',points_positifs:[],blocages:[],actions_realisees:[],formation:[],
    prochain_passage:['Revoir la disponibilite au prochain passage.'],priorite:'',synthese:'Situation stable.'};
}
async function openReport(page){
  const id=await page.evaluate(()=>state.businessV2.visits[0].id);
  await page.evaluate(v=>window.StoreRunnerVisitReport.open(v), id);
  const sheet=page.locator('#srReportSheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

test('La génération IA aboutit à 390 px, y compris après une réparation', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisitModel&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitReportJSONV225&&typeof window.save==='function');
  await seed(page,'brun');

  // Première réponse tronquée — le format exact qui provoquait « JSON de compte rendu invalide ».
  const doc=brunDoc();
  const full=JSON.stringify(doc,null,2);
  const truncated=full.slice(0,Math.floor(full.length*0.62));
  expect(truncated.includes('}'),'la fixture doit être coupée avant toute accolade fermante').toBe(false);
  await installGateway(page,[
    {response:{text:truncated,provider:'groq',finishReason:'length',truncated:true,mode:'visit_report'}},
    {response:{text:JSON.stringify(doc),provider:'groq',finishReason:'stop',truncated:false,mode:'visit_report'}}
  ]);

  const sheet=await openReport(page);
  const local=await sheet.locator('#srReportText').inputValue();
  expect(local.length).toBeGreaterThan(50);

  const button=sheet.locator('#srReportAI');
  await expect(button).toBeEnabled();
  await button.tap();

  await expect(sheet.locator('#srReportStatus')).toContainText('réparation automatique',{timeout:10000});
  await expect(sheet.locator('#srReportText')).toHaveValue(/^⚫ Résumé BRUN – Enseigne-Test Ville-Test/);
  // « Génération en cours… » a disparu et le bouton est réutilisable.
  await expect(button).toBeEnabled();
  await expect(button).not.toContainText('Génération en cours');

  const calls=await page.evaluate(()=>window.__aiCalls);
  expect(calls).toHaveLength(2);
  expect(calls[0].mode).toBe('visit_report');
  expect(calls[1].message.startsWith('Répare cette réponse pour produire exactement le JSON attendu.')).toBe(true);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('Un échec IA conserve le rapport local et laisse le bouton utilisable à 390 px', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisitModel&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitReportJSONV225&&typeof window.save==='function');
  await seed(page,'brun');
  await installGateway(page,[{throw:'Passerelle IA : HTTP 500 · moteur indisponible'}]);

  const sheet=await openReport(page);
  const before=await sheet.locator('#srReportText').inputValue();
  const button=sheet.locator('#srReportAI');
  await button.tap();

  await expect(sheet.locator('#srReportStatus')).toContainText('Le rapport local est conservé',{timeout:10000});
  await expect(sheet.locator('#srReportText')).toHaveValue(before,{timeout:5000});
  await expect(button).toBeEnabled();
  await expect(button).not.toContainText('Génération en cours');
  const box=await button.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);

  // Une panne de transport ne doit pas avoir consommé un second appel.
  const calls=await page.evaluate(()=>window.__aiCalls);
  expect(calls).toHaveLength(1);

  const notes=await page.evaluate(()=>{
    const M=window.StoreRunnerVisitModel,v=state.businessV2.visits[0];
    return M.reportOf(v).brun.team;
  });
  expect(notes).toBe('Le vendeur signale une rupture sur deux references.');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test('La famille BLANC génère son propre résumé et un double tap ne lance qu’une génération', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerVisitModel&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitReportJSONV225&&typeof window.save==='function');
  await seed(page,'blanc');

  const blanc={famille:'BLANC',contexte:'Rayon accessible.',lavage:'Presence correcte.',froid:'',cuisson:'',
    entretien_sols:'',retours_vendeurs:['Le vendeur signale une rupture sur deux references.'],retours_clients:[],
    concurrence:[],points_positifs:[],blocages:[],actions_realisees:[],formation:[],
    prochain_passage:['Revoir la disponibilite au prochain passage.'],priorite:'',synthese:'Situation stable.'};
  // Réponse lente : le second tap tombe pendant la génération.
  await page.evaluate(payload => {
    window.__aiCalls=[];
    window.callAIGateway=async opts=>{window.__aiCalls.push({mode:opts.mode});
      await new Promise(r=>setTimeout(r,900));
      return {text:'```json\n'+payload+'\n```',provider:'cloudflare-workers-ai',finishReason:'stop',mode:'visit_report'}};
    window.StoreRunnerVisitReportJSONV225.install();
  }, JSON.stringify(blanc));

  // La lecture des photos est ralentie : c'est pendant CE délai que le second tap tombait,
  // à l'époque où le verrou n'était posé qu'après le premier await.
  await page.evaluate(()=>{
    const api=window.StorePhotosV1;
    for(const key of ['list','listByFamily']){
      const original=api[key].bind(api);
      api[key]=async(...args)=>{await new Promise(r=>setTimeout(r,600));return original(...args)};
    }
  });

  const sheet=await openReport(page);
  await sheet.locator('.sr-reportTab[data-family="blanc"]').tap();
  const button=sheet.locator('#srReportAI');
  // Deux clics dans le MÊME tour de boucle : aucun await ne s'intercale entre eux.
  await page.evaluate(()=>{
    const b=document.getElementById('srReportAI');
    b.click();b.click();
  });

  await expect(sheet.locator('#srReportText')).toHaveValue(/^⚪ Résumé BLANC – Enseigne-Test Ville-Test/,{timeout:10000});
  await expect(button).toBeEnabled();
  const calls=await page.evaluate(()=>window.__aiCalls);
  expect(calls,'un double tap ne doit pas doubler les appels IA').toHaveLength(1);

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});
