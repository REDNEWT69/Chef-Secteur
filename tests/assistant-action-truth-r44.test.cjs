/* Hotfix r44 — l'Assistant n'annonce jamais une action planning non réellement appliquée.

   Reproduction du terrain : « Boulanger Limonest » est au planning du lundi ; dans l'Assistant
   en ligne : « Déprogramme Limonest » ; la passerelle IA répond « C'est fait. La visite … a été
   déprogrammée » ; au retour dans le Planning, la visite est toujours là.

   Contrat : (1) l'IA en ligne ne modifie JAMAIS le Planning et sa phrase n'est jamais une preuve ;
   (2) « Déprogramme X » passe par Planning Command Engine : aperçu sans écriture → Appliquer →
   StoreRunnerManualPlanning.unscheduleStore, puis relecture du plan ; (3) les protections du
   propriétaire échouent fermées (jour passé, visite réalisée, rendez-vous, verrou, lecture des
   verrous en erreur ou absente). Un seul type d'action canonique : « unschedule_store ».

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
  /^function norm\(s\)\{.*$/m, /^var AI_PLANNING_COMMAND_TYPE=.*$/m,
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
const TYPE = 'unschedule_store';
let passed = 0; const ok = n => { passed++; console.log('✓ ' + n); };
const KEEP = ['bl', 'blim'];

(async () => {
  /* ===================== A. IA en ligne : aucune mutation planning, phrase ≠ preuve ===================== */
  {
    const t = boot();
    assert.deepEqual(t.mondayIds(), KEEP, 'précondition : Limonest est au planning du lundi');
    const reply = await t.ask({ text: LIE, actions: [] });
    assert.deepEqual(t.mondayIds(), KEEP);
    assert.doesNotMatch(reply, SUCCESS, reply);
    assert.match(reply, /Modification du planning non confirmée.*Rien n’a été modifié/);
    ok('IA qui prétend « C’est fait » sans action → rejetée, Limonest toujours là');
  }
  {
    const t = boot(), before = t.snapshot();
    /* Même avec une cible parfaitement valide, l'IA en ligne ne mute pas le Planning. */
    const reply = await t.ask({ text: LIE, actions: [{ type: TYPE, store_id: 'blim', day: 'Lundi' }] });
    assert.deepEqual(t.mondayIds(), KEEP, 'aucune mutation directe depuis l’IA en ligne');
    assert.equal(t.snapshot(), before, 'ni état ni stockage touchés');
    assert.doesNotMatch(reply, SUCCESS, reply);
    assert.match(reply, /Non appliqué.*passe par un aperçu à valider.*Déprogramme Limonest lundi/);
    ok('action unschedule_store de l’IA en ligne : refusée, renvoi vers la commande, rien d’écrit');
  }
  for (const alias of ['remove_visit', 'unplan_store', 'unschedule_visit', 'Unschedule_Store', 'deprogram_store']) {
    const t = boot(), before = t.snapshot();
    const reply = await t.ask({ text: LIE, actions: [{ type: alias, store_id: 'blim', day: 'Lundi' }] });
    assert.equal(t.snapshot(), before, alias + ' : rien d’écrit');
    assert.doesNotMatch(reply, SUCCESS, alias + ' : ' + reply);
    assert.match(reply, /Non appliqué.*non prise en charge/, alias + ' : un seul type canonique, les alias sont inconnus');
  }
  ok('un seul type d’action canonique : aucun alias n’est accepté');
  {
    const t = boot();
    const reply = await t.ask({ text: LIE, actions: [{ type: 'exclude_store', store_id: 'blim' }] });
    assert.deepEqual(t.mondayIds(), KEEP, 'exclure ne retire pas la visite du plan courant');
    assert.doesNotMatch(reply, /déprogrammé/i);
    assert.match(reply, /Modification du planning non confirmée/);
    assert.doesNotMatch(reply, /Rien n’a été modifié/, 'l’exclusion, elle, a eu lieu : on ne prétend pas le contraire');
    assert.match(reply, /Actions appliquées : exclu Boulanger Limonest/);
    ok('exclure ne se présente jamais comme une déprogrammation, et reste dit pour ce qu’il est');
  }
  {
    const t = boot();
    let reply = await t.ask({ text: 'Tu as 2 visites lundi : Boulanger Lyon et Boulanger Limonest.', actions: [] });
    assert.equal(reply, 'Tu as 2 visites lundi : Boulanger Lyon et Boulanger Limonest.', 'texte informatif conservé');
    reply = await t.ask({ text: 'Je peux la déprogrammer si tu veux.', actions: [] });
    assert.match(reply, /déprogrammer si tu veux/, 'une proposition n’est pas une affirmation');
    reply = await t.ask({ text: 'Objectif réglé. C\'est fait.', actions: [{ type: 'set_target', value: 8 }] });
    assert.match(reply, /C.est fait/); assert.match(reply, /Actions appliquées : objectif 8/); assert.equal(t.ctx.state.settings.target, 8);
    reply = await t.ask({ text: 'Réponse', actions: [{ type: 'set_target', value: 8 }, { type: 'bogus' }] });
    assert.match(reply, /Actions appliquées : objectif 8/); assert.match(reply, /Non appliqué.*bogus/);
    ok('textes honnêtes conservés ; actions mixtes dites pour ce qu’elles sont');
  }

  /* ===================== B. Planning Command Engine : aperçu → Appliquer → propriétaire ===================== */
  {
    const t = boot(), E = t.E;
    const parsed = text => E.parse(text, E.parseContext(E.runtimeContext(new t.clock.Date())));
    const p = parsed('Déprogramme Limonest');
    assert.equal(p.kind, 'intent'); assert.equal(p.intent.action, TYPE);
    assert.deepEqual(H.copy(p.intent.filters.stores), [{ query: 'limonest' }]);
    assert.deepEqual(H.copy(p.intent.scope), { start: MONDAY, end: '2026-10-11' }, 'sans jour : la semaine en cours');
    const d = parsed('Déprogramme Limonest lundi');
    assert.deepEqual(H.copy(d.intent.scope), { start: MONDAY, end: MONDAY });
    assert.equal(parsed('Peux-tu déprogrammer Limonest lundi ?').kind, 'intent');
    assert.equal(parsed('Déprogramme Limonest lundi et Valence mardi').kind, 'clarify', 'une seule déprogrammation par commande');
    assert.equal(parsed('Déprogramme').kind, 'clarify');
    assert.equal(parsed('Mets Valence mardi et déprogramme Limonest').kind, 'clarify', 'jamais mélangé avec une autre consigne');
    assert.notEqual((parsed('Supprime Limonest lundi') || {}).kind, 'intent', 'les autres verbes destructifs ne deviennent jamais une intention (l’IA en ligne, elle, ne mute rien)');
    assert.throws(() => E.validate(Object.assign(H.copy(d.intent), { action: 'remove_visit' }), { stage: 'raw' }), /Action non prise en charge/);
    const two = H.copy(d.intent); two.filters.stores.push({ query: 'lyon' });
    assert.throws(() => E.validate(two, { stage: 'raw' }), /un seul magasin/);
    ok('parseur : déprogrammation = intention stricte canonique, un magasin, un jour facultatif');
  }
  {
    const t = boot();
    const before = t.snapshot();
    const session = await t.run('Déprogramme Limonest');
    assert.equal(session.status, 'preview');
    assert.equal(t.snapshot(), before, 'l’aperçu n’écrit rien');
    assert.equal(session.simulation.canApply, true);
    assert.deepEqual(session.simulation.blocking, []);
    assert.equal(session.simulation.totals.removed, 1);
    assert.deepEqual(session.simulation.weeks[0].after.Lundi, ['bl']);
    assert.match(session.preview.days[0].lines[0].text, /^− Boulanger Limonest/);
    assert.deepEqual(t.mondayIds(), KEEP, 'avant « Appliquer », Limonest est toujours au planning');
    const result = await t.apply(session, 'Déprogramme Limonest');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(t.mondayIds(), ['bl'], 'Limonest a disparu du plan canonique');
    assert.deepEqual(t.canonical(), ['bl'], 'et du stockage relu');
    assert.deepEqual(t.ctx.StoreRunnerManualPlanning.dayIds(t.ctx.state, 'Mardi'), ['dl'], 'les autres jours sont intacts');
    assert.equal(t.events.some(e => e.type === 'store-runner:planning-updated' && e.detail.reason === 'manual-store-removed' && e.detail.storeId === 'blim'), true, 'événement public du propriétaire');
    assert.equal(t.events.some(e => e.type === 'store-runner:planning-command-applied'), true);
    assert.equal(t.E.readJournal(t.db)[0].outcome, 'applied');
    assert.deepEqual(t.archive()[MONDAY].plan.Lundi.map(s => s.id), ['bl'], 'archive de la semaine à jour');
    ok('reproduction : Limonest lundi → aperçu sans écriture → Appliquer → disparaît du plan relu');
  }
  {
    const t = boot();
    const session = await t.run('Déprogramme Limonest lundi');
    assert.equal(session.status, 'preview'); assert.equal(session.simulation.canApply, true);
    const tampered = H.copy(session); tampered.simulation.payload.ops[0].storeId = 'bl';
    const r = await t.E.apply(tampered.simulation, t.context(), { createdAt: session.createdAt });
    assert.equal(r.ok, false); assert.equal(r.code, 'tampered');
    assert.deepEqual(t.mondayIds(), KEEP, 'un aperçu modifié ne retire rien');
    ok('aperçu falsifié → refusé, rien retiré');
  }
  {
    /* Écriture échouée à l'application : retour arrière, aucun succès. */
    const flag = { on: false }, t = boot({ failWrite: key => { if (flag.on && key === H.KEYS.ARCHIVE) { flag.on = false; return true; } return false; } });
    const session = await t.run('Déprogramme Limonest lundi');
    flag.on = true;
    const result = await t.apply(session, 'x');
    assert.equal(result.ok, false); assert.match(result.code, /rolled_back/);
    assert.deepEqual(t.mondayIds(), KEEP, 'état rétabli');
    assert.equal(t.E.readJournal(t.db)[0].outcome, 'rolled-back');
    ok('mutation échouée → retour arrière, aucune confirmation de succès');
  }
  /* ----- protections : l'aperçu les nomme, rien n'est applicable, rien n'est supprimé ----- */
  const blocked = async (name, opts, re, command = 'Déprogramme Limonest lundi', mutate) => {
    const t = boot(opts);
    if (mutate) mutate(t);
    const session = await t.run(command);
    const msg = session.status === 'preview' ? session.simulation.blocking.map(b => b.message).join(' | ') : session.message;
    assert.notEqual(session.status === 'preview' && session.simulation.canApply, true, name + ' : jamais applicable (' + msg + ')');
    assert.match(msg, re, name + ' : motif explicite : ' + msg);
    if (session.status === 'preview') {
      const r = await t.E.apply(session.simulation, t.context(), { createdAt: session.createdAt });
      assert.equal(r.ok, false, name + ' : un aperçu bloqué ne s’applique pas');
    }
    assert.deepEqual(t.mondayIds(), KEEP, name + ' : pas de suppression silencieuse');
    ok('protection « ' + name + ' » : refus explicite, plan intact');
  };
  await blocked('visite réalisée ce jour-là', { visits: { blim: { lastVisit: MONDAY, history: [MONDAY] } } }, /déjà réalisée/);
  await blocked('rendez-vous fixé', { appointments: [{ id: 'a1', storeId: 'blim', date: MONDAY, time: '10:00', duration: 45, type: 'rdv' }] }, /rendez-vous/i);
  await blocked('magasin verrouillé ce jour', { locks: { blim: { day: 'Lundi', week: MONDAY } } }, /verrouillé/);
  await blocked('lecture des verrous en erreur', {}, /lecture des verrous impossible/, 'Déprogramme Limonest lundi', t => { t.ctx.storeRunnerLockInfo = () => { throw new Error('boom'); }; });
  await blocked('lecture des verrous absente', {}, /lecture des verrous indisponible/, 'Déprogramme Limonest lundi', t => { t.ctx.storeRunnerLockInfo = undefined; });
  for (const [name, value] of [['undefined', undefined], ['chaîne vide', ''], ['chaîne', 'oui'], ['tableau', []], ['nombre', 0], ['faux', false]])
    await blocked('verrou illisible (' + name + ')', {}, /verrou illisible/, 'Déprogramme Limonest lundi', t => { t.ctx.storeRunnerLockInfo = () => value; });
  await blocked('magasin imposé', {}, /imposé/, 'Déprogramme Limonest lundi', t => { t.ctx.state.included = { blim: true }; });
  await blocked('verrou illisible', {}, /verrou illisible/, 'Déprogramme Limonest lundi', t => { t.ctx.storeRunnerLockInfo = () => 'oui'; });
  await blocked('visites réalisées illisibles', {}, /protection des visites réalisées indisponible/, 'Déprogramme Limonest lundi', t => { t.ctx.StoreRunnerActivityMetrics = undefined; });
  await blocked('rendez-vous illisibles', {}, /rendez-vous illisibles/, 'Déprogramme Limonest lundi', t => { t.ctx.state.appointments = 'x'; });
  await blocked('journée passée', { now: '2026-10-06T07:00:00' }, /pas prévu|passé/);
  await blocked('journée passée (sans jour)', { now: '2026-10-06T07:00:00' }, /pas prévu/, 'Déprogramme Limonest');
  await blocked('magasin absent du jour', {}, /n’est pas prévu le mardi/, 'Déprogramme Limonest mardi');
  await blocked('magasin inconnu', {}, /Je ne trouve pas/, 'Déprogramme Zorglub lundi');
  {
    /* null = « aucun verrou » : c'est la seule absence de verrou admise. */
    const t = boot();
    t.ctx.storeRunnerLockInfo = () => null;
    const session = await t.run('Déprogramme Limonest lundi');
    assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    const direct = await t.ctx.StoreRunnerManualPlanning.unscheduleCheck(t.ctx, 'blim', { day: 'Lundi' });
    assert.equal(direct.ok, true);
    ok('seul null signifie « aucun verrou »');
  }
  {
    /* Verrou lisible mais posé un AUTRE jour, et visite faite un autre jour : aucune protection ne s'applique à tort. */
    const t = boot({ locks: { blim: { day: 'Jeudi', week: MONDAY } }, visits: { blim: { lastVisit: '2026-09-01', history: ['2026-09-01'] } } });
    const session = await t.run('Déprogramme Limonest lundi');
    assert.equal(session.status, 'preview'); assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    ok('verrou d’un autre jour / visite d’une autre date : pas de blocage à tort');
  }
  {
    /* Fail-closed au moment de l'écriture aussi : si la lecture des verrous casse entre l'aperçu et Appliquer, rien n'est retiré. */
    const t = boot();
    const session = await t.run('Déprogramme Limonest lundi');
    assert.equal(session.simulation.canApply, true);
    t.ctx.storeRunnerLockInfo = () => { throw new Error('boom'); };
    const r = await t.apply(session, 'x');
    assert.equal(r.ok, false);
    assert.deepEqual(t.mondayIds(), KEEP);
    const direct = await t.ctx.StoreRunnerManualPlanning.unscheduleStore(t.ctx, 'blim', { day: 'Lundi' });
    assert.equal(direct.ok, false); assert.equal(direct.code, 'protection');
    assert.deepEqual(t.mondayIds(), KEEP);
    ok('storeRunnerLockInfo() qui échoue entre aperçu et application : aucune suppression, ni par le moteur ni en direct');
  }
  {
    /* Semaine affichée ≠ semaine de la commande : l'aperçu l'annonce ; sans pouvoir ouvrir la semaine, l'application échoue proprement. */
    const stores = H.copy(H.STORES).concat([H.copy(LIMONEST)]), plan = H.emptyPlan();
    plan.Lundi = [H.copy(stores.find(s => s.id === 'bl')), H.copy(LIMONEST)];
    const t = boot({ weekDate: '2026-10-12', plan: H.emptyPlan(), archive: { [MONDAY]: { weekMonday: MONDAY, plan } } });
    const session = await t.run('Déprogramme Limonest lundi');
    assert.equal(session.status, 'preview'); assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    assert.match(session.simulation.notes.join(' '), /s’ouvrira à l’application/);
    const before = t.snapshot();
    const result = await t.apply(session, 'x');
    assert.equal(result.ok, false, 'sans ouverture de la semaine, pas de succès : ' + JSON.stringify(result));
    assert.equal(t.snapshot(), before, 'rien n’a changé');
    ok('semaine non affichée : annoncée à l’aperçu, jamais de faux succès si elle ne peut pas s’ouvrir');
  }
  {
    const t = boot({ weekDate: '2026-10-12', plan: H.emptyPlan() });
    t.ctx.state.plan.Lundi = [H.copy(LIMONEST)];
    const session = await t.run('Déprogramme Limonest 12/10');
    assert.equal(session.status, 'preview'); assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation));
    const result = await t.apply(session, 'x');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(t.mondayIds(), []);
    ok('semaine affichée datée explicitement : déprogrammation confirmée par relecture');
  }
  {
    /* Aucun faux succès après rerender / changement d'écran : l'état annoncé est l'état relu. */
    const t = boot();
    const session = await t.run('Déprogramme Limonest lundi');
    const r = await t.apply(session, 'x'); assert.equal(r.ok, true);
    t.ctx.renderAll(); t.ctx.renderAll();
    assert.deepEqual(t.mondayIds(), ['bl']); assert.deepEqual(t.canonical(), ['bl']);
    const again = await t.run('Déprogramme Limonest lundi');
    assert.equal(again.status, 'preview'); assert.equal(again.simulation.canApply, false);
    assert.match(again.simulation.blocking.map(b => b.message).join(' '), /n’est pas prévu/, 'une seconde déprogrammation ne fabrique aucun succès');
    ok('après rerender : le plan relu confirme l’absence ; une répétition n’annonce rien');
  }
  console.log('assistant-action-truth-r44: ' + passed + ' groupes OK');
})().catch(e => { console.error(e); process.exit(1); });
