/* Hotfix r44 — l'Assistant ne annonce jamais une action planning non réellement appliquée.

   Reproduction du terrain : « Boulanger Limonest » est au planning du lundi ; dans l'Assistant
   en ligne : « Déprogramme Limonest » ; la passerelle IA répond « C'est fait. La visite … a été
   déprogrammée » ; au retour dans le Planning, la visite est toujours là.

   Ce test exécute les VRAIES fonctions du noyau (assistantOnlineSend, applyAIActions, relecture)
   avec les VRAIS propriétaires du Planning (planning-manual-visits.js, visites réalisées V263,
   verrous, rendez-vous), une passerelle IA simulée et un stockage en mémoire. Il ne contient
   aucune assertion sur le code source : seul le comportement observé compte. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const H = require('./helpers/planning-command-runtime.cjs');
const CORE = fs.readFileSync(path.join(__dirname, '..', 'src', 'chef-secteur.html'), 'utf8');

const LIMONEST = { id: 'blim', enseigne: 'Boulanger', ville: 'Limonest', adresse: '1 rue blim', dept: '', lat: 45.82, lon: 4.77, priority: 3, active: true, intervalDays: 30, visitMinutes: 45, products: ['Brun'] };
const MONDAY = '2026-10-05';
const LIE = 'C\'est fait. La visite de Boulanger Limonest prévue ce lundi a été déprogrammée.';

/* Extrait une définition du noyau (une par ligne) ; absente = chaîne vide (état avant correctif). */
function coreLine(re) { const m = CORE.match(re); return m ? m[0] : ''; }
const CORE_SRC = [
  /^function norm\(s\)\{.*$/m, /^var AI_UNSCHEDULE_TYPES=.*$/m, /^async function aiUnschedule\(.*$/m,
  /^function aiClaimText\(.*$/m, /^function aiClaimsPlanningChange\(.*$/m, /^function aiClaimsSuccess\(.*$/m, /^function aiTruthfulReply\(.*$/m,
  /^(async )?function applyAIActions\(.*$/m, /^async function assistantOnlineSend\(.*$/m,
  /^function assistantAdd\(.*$/m, /^function assistantBot\(.*$/m
].map(coreLine).join('\n');

function boot(o = {}) {
  const stores = H.copy(H.STORES).concat([H.copy(LIMONEST)]);
  const plan = H.emptyPlan();
  plan.Lundi = [H.copy(stores.find(s => s.id === 'bl')), H.copy(LIMONEST)];
  plan.Mardi = [H.copy(stores.find(s => s.id === 'dl'))];
  const rt = H.runtime(Object.assign({ now: '2026-10-05T07:00:00', weekDate: MONDAY, stores, plan }, o));
  const { ctx } = rt;
  const messages = [];
  const box = { scrollTop: 0, get lastChild() { return messages[messages.length - 1] || null; }, get children() { return messages; }, appendChild(d) { d.parentNode = box; messages.push(d); }, removeChild(d) { const i = messages.indexOf(d); if (i >= 0) messages.splice(i, 1); } };
  const getById = ctx.document.getElementById;
  const targetInput = { value: '' };
  ctx.document.getElementById = id => id === 'assistantMsgs' ? box : id === 'target' ? targetInput : getById(id);
  ctx.document.createElement = () => ({ className: '', textContent: '', parentNode: null });
  ctx.DAYS = H.DAYS.slice(0, 5);
  ctx.sectorContext = () => ({});
  ctx.setRecurringLock = () => {}; ctx.generateWeek = () => {}; ctx.regenerateDay = () => {};
  ctx.fillProfileForm = ctx.renderOvernight = ctx.renderFilterControls = () => {};
  ctx.renders = 0; ctx.renderAll = () => { ctx.renders++; };
  ctx.callAIGateway = async () => rt.gateway;
  vm.runInNewContext(CORE_SRC, ctx, { filename: 'src/chef-secteur.html (assistant)' });
  const api = Object.assign(rt, {
    messages,
    reply: () => messages.map(m => m.textContent).join('\n---\n'),
    last: () => (messages[messages.length - 1] || {}).textContent || '',
    ask: async (gateway) => { rt.gateway = gateway; messages.length = 0; await ctx.assistantOnlineSend('Déprogramme Limonest'); return api.last(); },
    mondayIds: () => H.copy(ctx.state.plan.Lundi.map(s => String(s.id))),
    canonical: () => H.copy(JSON.parse(rt.db.getItem(H.KEYS.MAIN)).plan.Lundi.map(s => String(s.id)))
  });
  return api;
}
const SUCCESS = /c.est fait|action appliquée|déprogrammé|déprogrammée/i;
const unschedule = { type: 'unschedule_store', store_id: 'blim', day: 'Lundi' };
let passed = 0; const ok = n => { passed++; console.log('✓ ' + n); };

(async () => {
  /* 1. Reproduction : l'IA affirme sans action → la phrase est rejetée, le plan n'a pas bougé. */
  {
    const t = boot();
    assert.deepEqual(t.mondayIds(), ['bl', 'blim'], 'précondition : Limonest est au planning du lundi');
    const reply = await t.ask({ text: LIE, actions: [] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim'], 'le plan ne change pas');
    assert.doesNotMatch(reply, SUCCESS, 'aucune confirmation de succès affichée : ' + reply);
    assert.match(reply, /Rien n’a été modifié/);
    assert.doesNotMatch(t.reply(), SUCCESS);
    ok('IA qui prétend « C’est fait » sans action → rejetée, Limonest toujours là, aucun faux succès');
  }
  /* 2. Action inconnue de la passerelle (cas terrain probable) : échec explicite. */
  {
    const t = boot();
    const reply = await t.ask({ text: LIE, actions: [{ type: 'something_unknown', store_id: 'blim' }] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim']);
    assert.doesNotMatch(reply, SUCCESS);
    assert.match(reply, /Non appliqué.*non prise en charge/);
    ok('action non supportée → refus explicite, jamais « C’est fait »');
  }
  /* 3. exclure ≠ déprogrammer : l'exclusion est annoncée pour ce qu'elle est, la visite reste, pas de faux « déprogrammée ». */
  {
    const t = boot();
    const reply = await t.ask({ text: LIE, actions: [{ type: 'exclude_store', store_id: 'blim' }] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim'], 'exclure ne retire pas la visite du plan courant');
    assert.doesNotMatch(reply, /déprogrammé/i);
    assert.match(reply, /Rien n’a été modifié/);
    assert.match(reply, /Actions appliquées : exclu Boulanger Limonest/, 'ce qui a réellement été fait est dit tel quel');
    ok('exclure ne se présente jamais comme une déprogrammation');
  }
  /* 4. Déprogrammation réellement appliquée : relecture canonique, succès affiché. */
  {
    const t = boot();
    const reply = await t.ask({ text: LIE, actions: [unschedule] });
    assert.deepEqual(t.mondayIds(), ['bl'], 'Limonest a disparu du plan canonique');
    assert.deepEqual(t.canonical(), ['bl'], 'et du stockage relu');
    assert.match(reply, /Actions appliquées : déprogrammé Boulanger Limonest \(Lundi\)/);
    assert.equal(t.ctx.renders > 0, true, 'le Planning est rerendu par son propriétaire');
    assert.equal(t.events.some(e => e.type === 'store-runner:planning-updated' && e.detail.reason === 'manual-store-removed' && e.detail.storeId === 'blim'), true, 'événement public du propriétaire (Runner suit sans logique spéciale)');
    assert.deepEqual(t.ctx.StoreRunnerManualPlanning.dayIds(t.ctx.state, 'Mardi'), ['dl'], 'les autres jours sont intacts');
    ok('déprogrammation réelle : relecture confirme l’absence, succès affiché, rendu + événement');
  }
  /* 5. Écriture échouée (quota) : retour arrière, aucun succès. */
  {
    const flag = { on: false }, t = boot({ failWrite: key => flag.on && key === H.KEYS.ARCHIVE });
    flag.on = true;
    const reply = await t.ask({ text: LIE, actions: [unschedule] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim'], 'état rétabli');
    assert.doesNotMatch(reply, SUCCESS);
    assert.match(reply, /Non appliqué.*Boulanger Limonest/);
    ok('mutation échouée → retour arrière, aucune confirmation de succès');
  }
  /* 6. Protections : jamais de suppression silencieuse. */
  const protectedCases = [
    ['jour passé', { now: '2026-10-06T07:00:00' }, /passée/],
    ['visite réalisée ce jour-là', { visits: { blim: { lastVisit: MONDAY, history: [MONDAY] } } }, /déjà réalisée/],
    ['rendez-vous fixé', { appointments: [{ id: 'a1', storeId: 'blim', date: MONDAY, time: '10:00', duration: 45, type: 'rdv' }] }, /rendez-vous/],
    ['magasin verrouillé ce jour', { locks: { blim: { day: 'Lundi', week: MONDAY } } }, /verrouillé/]
  ];
  for (const [name, opts, re] of protectedCases) {
    const t = boot(opts);
    const reply = await t.ask({ text: LIE, actions: [unschedule] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim'], name + ' : le plan ne change pas');
    assert.doesNotMatch(reply, SUCCESS, name + ' : ' + reply);
    assert.match(reply, re, name + ' : refus explicite et motivé');
    ok('protection « ' + name + ' » : refus explicite, pas de suppression silencieuse');
  }
  {
    const t = boot({ visits: { blim: { lastVisit: '2026-09-01', history: ['2026-09-01'] } } });
    const reply = await t.ask({ text: LIE, actions: [unschedule] });
    assert.deepEqual(t.mondayIds(), ['bl'], 'une visite réalisée un AUTRE jour ne protège pas celle-ci');
    assert.match(reply, /déprogrammé Boulanger Limonest/);
    ok('une visite passée sur une autre date ne bloque pas à tort');
  }
  /* 7. Cibles invalides : magasin absent du jour, autre jour, date hors semaine, protection illisible. */
  {
    const t = boot();
    let reply = await t.ask({ text: LIE, actions: [{ type: 'unschedule_store', store_id: 'blim', day: 'Mardi' }] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim']); assert.match(reply, /n’est pas prévu mardi/); assert.doesNotMatch(reply, SUCCESS);
    reply = await t.ask({ text: LIE, actions: [{ type: 'unschedule_store', store_id: 'blim', date: '2026-10-19' }] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim']); assert.match(reply, /semaine affichée/); assert.doesNotMatch(reply, SUCCESS);
    reply = await t.ask({ text: LIE, actions: [{ type: 'unschedule_store', store_id: 'inconnu', day: 'Lundi' }] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim']); assert.doesNotMatch(reply, SUCCESS);
    reply = await t.ask({ text: LIE, actions: [{ type: 'unschedule_store', day: 'Lundi' }] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim']); assert.doesNotMatch(reply, SUCCESS);
    const byDate = await t.ask({ text: 'Fait.', actions: [{ type: 'unschedule_store', store_id: 'blim', date: MONDAY }] });
    assert.deepEqual(t.mondayIds(), ['bl']); assert.match(byDate, /déprogrammé Boulanger Limonest \(Lundi\)/, 'une date de la semaine affichée est résolue par le propriétaire');
    ok('cibles invalides (autre jour, hors semaine, inconnue, sans id) refusées ; date de la semaine résolue');
  }
  {
    const t = boot();
    t.ctx.StoreRunnerActivityMetrics = undefined;
    const reply = await t.ask({ text: LIE, actions: [unschedule] });
    assert.deepEqual(t.mondayIds(), ['bl', 'blim']); assert.doesNotMatch(reply, SUCCESS); assert.match(reply, /protection des visites réalisées indisponible/);
    ok('protection illisible → on refuse (fail closed)');
  }
  /* 8. Rerender qui remet la visite : la relecture après rendu la voit et refuse de confirmer. */
  {
    const t = boot();
    t.ctx.renderAll = () => { if (!t.ctx.state.plan.Lundi.some(s => s.id === 'blim')) t.ctx.state.plan.Lundi.push(H.copy(LIMONEST)); };
    const reply = await t.ask({ text: LIE, actions: [unschedule] });
    assert.doesNotMatch(reply, /Actions appliquées : déprogrammé/);
    assert.doesNotMatch(reply, SUCCESS);
    assert.match(reply, /toujours (dans le|au) planning/);
    ok('un rendu qui réintroduit la visite n’est jamais confirmé (relecture après rendu)');
  }
  /* 9. Réponses honnêtes non touchées ; aucun faux succès cumulé sur les écrans suivants. */
  {
    const t = boot();
    let reply = await t.ask({ text: 'Tu as 2 visites lundi : Boulanger Lyon et Boulanger Limonest.', actions: [] });
    assert.equal(reply, 'Tu as 2 visites lundi : Boulanger Lyon et Boulanger Limonest.', 'texte informatif conservé tel quel');
    reply = await t.ask({ text: 'Je peux la déprogrammer si tu veux.', actions: [] });
    assert.match(reply, /déprogrammer si tu veux/, 'une proposition (infinitif) n’est pas une affirmation');
    reply = await t.ask({ text: 'Objectif réglé. C\'est fait.', actions: [{ type: 'set_target', value: 8 }] });
    assert.match(reply, /C.est fait/); assert.match(reply, /Actions appliquées : objectif 8/);
    assert.equal(t.ctx.state.settings.target, 8);
    reply = await t.ask({ text: 'Réponse', actions: [{ type: 'set_target', value: 8 }, { type: 'bogus' }] });
    assert.match(reply, /Actions appliquées : objectif 8/); assert.match(reply, /Non appliqué.*bogus/);
    /* après changement d'écran / rerender : le plan relu est toujours celui annoncé */
    const done = await t.ask({ text: LIE, actions: [unschedule] });
    assert.match(done, /déprogrammé Boulanger Limonest/);
    t.ctx.renderAll(); t.ctx.renderAll();
    assert.deepEqual(t.mondayIds(), ['bl'], 'après rerender, le plan confirme encore l’absence');
    ok('texte informatif conservé ; actions mixtes dites pour ce qu’elles sont ; état stable après rerender');
  }
  console.log('assistant-action-truth-r44: ' + passed + ' groupes OK');
})().catch(e => { console.error(e); process.exit(1); });
