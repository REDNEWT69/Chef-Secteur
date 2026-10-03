/* Lot B — Planning Command Engine avec les VRAIS propriétaires (tests/helpers/planning-command-runtime.cjs).
   A P1 avant W42 · B magasin précis imposé mardi · C jour interdit · D RDV intouchable ·
   E verrou manuel intouchable · F visite réalisée intouchable · G semaine passée non modifiable ·
   H ambiguïté → aucune application · J simulation → état bit à bit inchangé ·
   K application validée → résultat identique à la simulation · L erreur pendant l'application →
   retour arrière complet · M r38 date réelle + GPS frais · N V264/H2/V189/V251/M1 intacts.
   Chaque scénario part de données neuves ; les journées et dates sont celles du contrat r38. */
const assert = require('node:assert/strict');
const H = require('./helpers/planning-command-runtime.cjs');
const { runtime, planOf, emptyPlan, DAYS } = H;

const SAT = '2026-10-03T10:00:00', WED = '2026-10-07T09:00:00';
const W40 = '2026-09-28', W41 = '2026-10-05', W42 = '2026-10-12', W43 = '2026-10-19';
const history = { fly: { lastVisit: '2026-09-15', history: ['2026-09-15'] } };
const ids = plan => Object.fromEntries(DAYS.map(d => [d, ((plan || {})[d] || []).map(s => String(s.id))]));
const flatIds = plan => DAYS.flatMap(d => ((plan || {})[d] || []).map(s => String(s.id)));
const dayOf = (plan, id) => DAYS.find(d => ((plan || {})[d] || []).some(s => String(s.id) === id)) || '';
const archiveEntry = (plan, extra) => Object.assign({ weekMonday: '', plan, manualEdited: false, generatedMode: 'snail-distance-v1' }, extra || {});
let passed = 0;
async function scenario(name, fn) { await fn(); passed++; console.log('✓ ' + name); }
async function expectUnchanged(rt, fn) { const before = rt.snapshot(); const out = await fn(); assert.equal(rt.snapshot(), before, 'J — état, archive et période bit à bit inchangés'); return out; }
async function applyAndCompare(rt, session, text) {
  const result = await rt.apply(session, text);
  assert.equal(result.ok, true, 'application : ' + JSON.stringify(result));
  for (const w of session.simulation.weeks) if (w.after) assert.deepEqual(rt.planIds(w.weekKey), w.after, 'K — semaine ' + w.weekKey + ' identique à l’aperçu');
  return result;
}

(async () => {
  await scenario('A + J + K — « Programme-moi tous mes P1 avant la W42 » : tous les P1 dans la période, rien au-delà', async () => {
    const w42 = planOf({ Lundi: ['bl', 'dl'], Mardi: ['bvi'] });
    const rt = runtime({ now: SAT, weekDate: W40, p1: ['bv', 'dc', 'bg', 'da'], visits: history, archive: { [W41]: archiveEntry(planOf({ Lundi: ['bl', 'fly'], Mardi: ['dse', 'bse'], Jeudi: ['bvi'] }), { weekMonday: W41 }), [W42]: archiveEntry(w42, { weekMonday: W42 }) } });
    const session = await expectUnchanged(rt, () => rt.run('Programme-moi tous mes P1 avant la W42'));
    assert.equal(session.status, 'preview', JSON.stringify(session).slice(0, 300));
    const sim = session.simulation;
    assert.deepEqual(sim.scope, { start: W41, end: '2026-10-11' }, 'r38 : départ réel lundi 05/10 malgré la semaine consultée (28/09)');
    assert.equal(sim.canApply, true, JSON.stringify(sim.blocking));
    assert.deepEqual(sim.weeks.map(w => w.weekKey), [W41], 'seule la période est simulée');
    const after = flatIds(Object.fromEntries(DAYS.map(d => [d, sim.weeks[0].after[d].map(id => ({ id }))])));
    for (const id of ['bv', 'dc', 'bg', 'da']) assert(after.includes(id), id + ' (P1) placé avant la W42');
    assert.equal(sim.totals.requested, 4); assert.equal(sim.totals.placedTargets, 4);
    assert.equal(sim.totals.appointmentsChanged, 0);
    assert.match(session.preview.title, /Voilà ce que Store Runner va faire/);
    await applyAndCompare(rt, session, 'Programme-moi tous mes P1 avant la W42');
    assert.deepEqual(ids(rt.archive()[W42].plan), ids(w42), 'la W42 n’est pas touchée');
    assert.equal(rt.ctx.state.settings.weekDate, W40, 'la semaine consultée reste affichée');
    const journal = JSON.parse(rt.db.getItem('store-runner-planning-command-log-v1'));
    assert.equal(journal[0].outcome, 'applied'); assert.equal(journal[0].intent.filters.stores.length, 4);
    assert(rt.events.some(e => e.type === 'store-runner:planning-updated' && e.detail && e.detail.source === 'planning-command-v1'));
  });

  await scenario('B + H + K — « Mets Valence mardi » : choix demandé, puis Boulanger Valence posé mardi par le planning manuel', async () => {
    const plan = planOf({ Lundi: ['bl'], Mardi: ['dl'], Jeudi: ['bv', 'fly'] });
    const rt = runtime({ now: SAT, weekDate: W41, plan, visits: history, archive: { [W41]: archiveEntry(plan, { weekMonday: W41 }) } });
    const ask = await expectUnchanged(rt, () => rt.run('Mets Valence mardi'));
    assert.equal(ask.status, 'clarify');
    assert.equal(ask.choices.length, 4, 'Boulanger, Darty, Fnac Bourg-lès-Valence et « les 3 »');
    const session = await expectUnchanged(rt, () => rt.run('Mets Valence mardi', { selections: ask.choices[0].selections }));
    assert.equal(session.status, 'preview');
    assert.deepEqual(session.simulation.weeks[0].after, { Lundi: ['bl'], Mardi: ['dl', 'bv'], Mercredi: [], Jeudi: ['fly'], Vendredi: [], Samedi: [] });
    assert.deepEqual(session.preview.days.map(d => d.title + ':' + d.lines.map(l => l.text).join('/')), ['Mardi 06/10:→ Boulanger Valence (depuis jeudi 08/10)']);
    await applyAndCompare(rt, session, 'Mets Valence mardi');
    assert.deepEqual(JSON.parse(JSON.stringify(rt.ctx.state.locks.bv)), { day: 'Mardi', week: W41 }, 'ancre M1 datée posée par le propriétaire manuel');
    const entry = rt.archive()[W41];
    assert.equal(entry.manualEdited, true); assert.equal(entry.manualAdaptive, true);
  });

  await scenario('B — « Ajoute Darty Annemasse vendredi » et « garde » : déplacement minimal, pose datée pour le magasin conservé', async () => {
    const plan = planOf({ Lundi: ['bl'], Mercredi: ['bc', 'dc'], Vendredi: ['fly'] });
    const rt = runtime({ now: SAT, weekDate: W41, plan, visits: history });
    const session = await expectUnchanged(rt, () => rt.run('Ajoute Darty Annemasse vendredi et garde Darty Chambéry mercredi'));
    assert.equal(session.status, 'preview', JSON.stringify(session).slice(0, 300));
    assert.deepEqual(session.simulation.weeks[0].after.Vendredi, ['fly', 'da']);
    assert.deepEqual(session.simulation.weeks[0].after.Mercredi, ['bc', 'dc']);
    assert(session.preview.days.some(d => d.lines.some(l => l.type === '=' && /Darty Chambéry/.test(l.text))), '= conservé affiché');
    await applyAndCompare(rt, session, 'x');
    assert.deepEqual(JSON.parse(JSON.stringify(rt.ctx.state.locks.dc)), { day: 'Mercredi', week: W41 });
    assert.deepEqual(JSON.parse(JSON.stringify(rt.ctx.state.locks.da)), { day: 'Vendredi', week: W41 });
  });

  await scenario('C + K — « Évite Lyon jeudi » : aucun magasin de Lyon jeudi, le reste suit le moteur', async () => {
    const plan = planOf({ Lundi: ['bvi'], Jeudi: ['dl', 'bl'], Vendredi: ['fvi'] });
    const rt = runtime({ now: SAT, weekDate: W41, plan, visits: history, target: 8 });
    const ask = await rt.run('Évite Lyon jeudi');
    assert.equal(ask.status, 'clarify');
    const all = ask.choices[ask.choices.length - 1];
    assert.match(all.label, /Les 3 magasins de Lyon/);
    const session = await expectUnchanged(rt, () => rt.run('Évite Lyon jeudi', { selections: all.selections }));
    assert.equal(session.status, 'preview');
    assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    const thursday = session.simulation.weeks[0].after.Jeudi;
    assert(!thursday.some(id => ['bl', 'dl', 'fly'].includes(id)), 'jeudi sans Lyon : ' + thursday.join(','));
    await applyAndCompare(rt, session, 'Évite Lyon jeudi');
  });

  await scenario('C + D — « Évite jeudi » alors qu’un RDV y est posé : refus expliqué, rien n’est appliqué', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Jeudi: ['bc'] }), appointments: [{ id: 'r1', storeId: 'bc', date: '2026-10-08', time: '10:00', duration: 60, type: 'Visite', note: '' }] });
    const session = await expectUnchanged(rt, () => rt.run('Évite jeudi'));
    assert.equal(session.status, 'preview'); assert.equal(session.simulation.canApply, false);
    assert(session.simulation.blocking.some(b => b.code === 'appointment_conflict'));
    const refused = await expectUnchanged(rt, () => rt.apply(session, 'Évite jeudi'));
    assert.equal(refused.ok, false);
  });

  await scenario('D — un magasin avec RDV ne se déplace pas ; un P1 en RDV compte sans doublon', async () => {
    const rdv = { id: 'r1', storeId: 'bc', date: '2026-10-08', time: '10:00', duration: 60, type: 'Visite', note: '' };
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Jeudi: ['bc'] }), appointments: [rdv], p1: ['bc', 'bv'], visits: history });
    const move = await expectUnchanged(rt, () => rt.run('Mets Boulanger Chambéry mardi'));
    assert.equal(move.simulation.canApply, false);
    assert(move.simulation.blocking.some(b => b.code === 'appointment_conflict' && /rendez-vous/.test(b.message)));
    const p1 = await expectUnchanged(rt, () => rt.run('Programme mes P1 avant la W42'));
    const after = p1.simulation.weeks[0].after;
    assert.deepEqual(after.Jeudi.filter(id => id === 'bc'), ['bc'], 'RDV jeudi conservé, une seule fois');
    assert.equal(DAYS.filter(d => after[d].includes('bc')).length, 1);
    assert.equal(p1.simulation.totals.appointmentsChanged, 0);
    await applyAndCompare(rt, p1, 'P1');
  });

  await scenario('E — verrou manuel intouchable : refus du déplacement, verrou honoré par la programmation', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Mercredi: ['dc'] }), locks: { dc: { day: 'Mercredi', week: W41 } }, p1: ['dc', 'da'], visits: history });
    const move = await expectUnchanged(rt, () => rt.run('Mets Darty Chambéry lundi'));
    assert(move.simulation.blocking.some(b => b.code === 'lock_conflict'));
    const p1 = await expectUnchanged(rt, () => rt.run('Programme mes P1 avant la W42'));
    assert.equal(p1.simulation.canApply, true, JSON.stringify(p1.simulation.blocking));
    assert(p1.simulation.weeks[0].after.Mercredi.includes('dc'), 'verrou mercredi honoré');
    assert.equal(p1.simulation.totals.locksChanged, 0);
  });

  await scenario('F + G — mercredi : visite réalisée lundi et journées passées intouchables', async () => {
    const plan = planOf({ Lundi: ['bv', 'dv'], Mardi: ['bl'], Jeudi: ['fly'] });
    const rt = runtime({ now: WED, weekDate: W41, plan, visits: Object.assign({ bv: { lastVisit: '2026-10-05', history: ['2026-10-05'] } }, history), p1: ['bv', 'da'] });
    const move = await expectUnchanged(rt, () => rt.run('Mets Boulanger Valence jeudi'));
    assert.equal(move.simulation.canApply, false);
    assert(move.simulation.blocking.some(b => /réalisée|passée/.test(b.message)));
    const p1 = await expectUnchanged(rt, () => rt.run('Programme mes P1 cette semaine'));
    assert.equal(p1.status, 'preview');
    const after = p1.simulation.weeks[0].after;
    assert.deepEqual(after.Lundi, ['bv', 'dv'], 'lundi (passé, visite faite) identique');
    assert.deepEqual(after.Mardi, ['bl'], 'mardi (passé) identique');
    assert.equal(DAYS.filter(d => after[d].includes('bv')).length, 1, 'aucune seconde visite de Boulanger Valence');
    assert(p1.simulation.notes.some(n => /Boulanger Valence.*déjà couvert/.test(n)), 'garde V263 : visité récemment');
    assert(DAYS.slice(2).some(d => after[d].includes('da')), 'Darty Annemasse (P1) placé mercredi ou après');
    await applyAndCompare(rt, p1, 'P1');
    const gone = await rt.run('Programme mes P1 W40');
    assert.notEqual(gone.status, 'preview', 'G — semaine passée : aucune simulation applicable');
    assert.throws(() => rt.E.validate({ version: 1, action: 'plan_visits', scope: { start: '2026-10-05', end: '2026-10-11' }, filters: { priorities: ['P1'], brands: [], stores: [] }, constraints: { exactDays: [], keepDays: [], windowDays: [], forbidden: [], distribution: 'asap', preserveAppointments: true, preserveManualLocks: true, preserveCompletedVisits: true, preservePastDays: true } }, { today: '2026-10-07' }), /passé/);
  });

  await scenario('Semaine retouchée à la main sans ancre : intouchable pour une commande', async () => {
    const manual = planOf({ Lundi: ['bl'], Mardi: ['dl'] });
    const rt = runtime({ now: SAT, weekDate: W41, plan: manual, manualWeekEdits: { [W41]: { at: '2026-10-02T10:00:00Z', plan: manual } }, archive: { [W41]: archiveEntry(manual, { weekMonday: W41, manualEdited: true, manualEditedAt: '2026-10-02T10:00:00Z' }) }, p1: ['da'] });
    const session = await expectUnchanged(rt, () => rt.run('Programme mes P1 avant la W42'));
    assert.equal(session.simulation.canApply, false);
    assert(session.simulation.blocking.some(b => b.code === 'manual_week'));
  });

  await scenario('N (M1) — semaine adaptative : l’ancre datée reste sur son jour', async () => {
    const manual = planOf({ Mardi: ['bc'] });
    const rt = runtime({ now: SAT, weekDate: W41, plan: manual, locks: { bc: { day: 'Mardi', week: W41 } }, manualWeekEdits: { [W41]: { at: '2026-10-02T10:00:00Z', plan: manual } }, archive: { [W41]: archiveEntry(manual, { weekMonday: W41, manualEdited: true, manualAdaptive: true, manualEditedAt: '2026-10-02T10:00:00Z' }) }, p1: ['dc', 'da'], visits: history });
    const session = await expectUnchanged(rt, () => rt.run('Programme mes P1 avant la W42'));
    assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    assert(session.simulation.weeks[0].after.Mardi.includes('bc'), 'ancre M1 conservée');
    await applyAndCompare(rt, session, 'P1');
    const entry = rt.archive()[W41];
    assert.equal(entry.manualAdaptive, true, 'métadonnées M1 conservées');
  });

  await scenario('Répartition : « Répartis mes Prio 1 sur les trois prochaines semaines » — une visite chacun, étalée', async () => {
    const p1 = ['bv', 'dv', 'bc', 'dc', 'bg', 'dg'];
    const rt = runtime({ now: SAT, weekDate: W40, p1, visits: history, target: 8 });
    const session = await expectUnchanged(rt, () => rt.run('Répartis mes Prio 1 sur les trois prochaines semaines'));
    assert.equal(session.status, 'preview'); assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    const weeks = session.simulation.weeks;
    assert.deepEqual(weeks.map(w => w.weekKey), [W41, W42, W43]);
    for (const id of p1) assert.equal(weeks.reduce((n, w) => n + DAYS.filter(d => w.after[d].includes(id)).length, 0), 1, id + ' : exactement une visite sur les 3 semaines');
    const perWeek = weeks.map(w => p1.filter(id => DAYS.some(d => w.after[d].includes(id))).length);
    assert(perWeek.every(n => n >= 1), 'chaque semaine reçoit une partie des P1 : ' + perWeek.join('/'));
    await applyAndCompare(rt, session, 'Répartis');
  });

  await scenario('Zone : « Fais-moi une semaine autour de Chambéry mardi et mercredi »', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, visits: history, target: 10 });
    const ask = await rt.run('Fais-moi une semaine autour de Chambéry mardi et mercredi');
    assert.equal(ask.status, 'clarify');
    const session = await expectUnchanged(rt, () => rt.run('Fais-moi une semaine autour de Chambéry mardi et mercredi', { selections: ask.choices[ask.choices.length - 1].selections }));
    assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    const after = session.simulation.weeks[0].after;
    for (const id of ['bc', 'dc']) assert(after.Mardi.includes(id) || after.Mercredi.includes(id), id + ' mardi ou mercredi');
    await applyAndCompare(rt, session, 'Zone');
  });

  await scenario('Recalcul : « Recalcule seulement le reste de ma semaine » — aperçu du propriétaire V181, appliqué à l’identique', async () => {
    const plan = planOf({ Lundi: ['bl'], Mardi: ['dl'], Jeudi: ['bvi'], Vendredi: ['fvi'] });
    const formation = { id: 'f1', title: 'Formation produit', date: '2026-10-08', start: '2026-10-08', end: '2026-10-09', allDay: true };
    const visits = Object.assign({ bl: { lastVisit: '2026-10-05', history: ['2026-10-05'] } }, history);
    const rt = runtime({ now: WED, weekDate: W41, plan, visits, calendarEvents: [formation], archive: { [W41]: archiveEntry(plan, { weekMonday: W41 }) } });
    const session = await expectUnchanged(rt, () => rt.run('Recalcule seulement le reste de ma semaine'));
    assert.equal(session.status, 'preview', JSON.stringify(session).slice(0, 300));
    assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    const after = session.simulation.weeks[0].after;
    assert.deepEqual(after.Jeudi, [], 'jeudi en formation libéré');
    assert.deepEqual(after.Lundi, ['bl'], 'lundi passé avec visite réalisée intouché');
    assert.deepEqual(after.Mardi, [], 'la visite ratée de mardi est replacée, rien n’est ajouté dans le passé');
    for (const id of ['bvi', 'dl']) assert(['Mercredi', 'Vendredi'].some(d => after[d].includes(id)), id + ' replacé dans la semaine');
    await applyAndCompare(rt, session, 'Recalcule');
    const heavy = planOf({ Lundi: ['bl'], Mardi: ['dl'], Mercredi: ['dv'], Jeudi: ['bvi', 'dbo'], Vendredi: ['fvi'] });
    const spill = runtime({ now: WED, weekDate: W41, plan: heavy, visits, calendarEvents: [formation], archive: { [W41]: archiveEntry(heavy, { weekMonday: W41 }) } });
    const refused = await expectUnchanged(spill, () => spill.run('Recalcule seulement le reste de ma semaine'));
    assert.equal(refused.simulation.canApply, false);
    assert(refused.simulation.blocking.some(b => b.code === 'spill'), '« seulement » : aucun report silencieux sur la semaine suivante');
    const other = runtime({ now: WED, weekDate: W42, plan: planOf({ Lundi: ['bl'] }), visits: history });
    const elsewhere = await expectUnchanged(other, () => other.run('Recalcule seulement le reste de ma semaine'));
    assert(elsewhere.simulation.blocking.some(b => b.code === 'not_current_week' && b.action && b.action.kind === 'open_date'));
  });

  await scenario('L — échec d’écriture pendant l’application : retour arrière complet, aucun demi-planning', async () => {
    let armed = false, fired = false;
    /* Archive présente comme sur tout appareil : ChefReliability normalise une archive absente en {}. */
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Lundi: ['bl'] }), archive: { [W42]: archiveEntry(planOf({ Lundi: ['dl'] }), { weekMonday: W42 }) }, visits: history, p1: ['bv', 'da'], failWrite: k => { if (armed && !fired && k === 'chef_sector_plan_archive_v1') { fired = true; return true; } return false; } });
    const session = await rt.run('Programme mes P1 avant la W42');
    assert.equal(session.simulation.canApply, true);
    const before = rt.snapshot();
    armed = true;
    const result = await rt.apply(session, 'P1');
    assert.equal(fired, true, 'l’écriture a bien échoué');
    assert.equal(result.ok, false); assert.equal(result.code, 'rolled_back');
    assert.equal(rt.snapshot(), before, 'état, archive et période identiques à l’avant');
    assert.equal(JSON.parse(rt.db.getItem('store-runner-planning-command-log-v1'))[0].outcome, 'rolled-back');
  });

  await scenario('L — second placement refusé : le premier est annulé aussi (transaction de commande)', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Lundi: ['bl'] }), visits: history });
    const session = await rt.run('Mets Boulanger Valence mardi et Darty Annemasse vendredi');
    assert.equal(session.simulation.canApply, true, JSON.stringify(session.simulation.blocking));
    const before = rt.snapshot(), original = rt.ctx.StoreRunnerManualPlanning.addStore;
    let calls = 0;
    rt.ctx.StoreRunnerManualPlanning.addStore = async (win, id, day) => { calls++; if (calls === 2) return { ok: false, error: 'refus simulé' }; return original(win, id, day); };
    const result = await rt.apply(session, 'x');
    assert.equal(result.ok, false); assert.equal(calls, 2);
    assert.equal(rt.snapshot(), before, 'le premier placement est défait');
  });

  await scenario('K — résultat différent de l’aperçu : détecté et défait', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Lundi: ['bl'] }), visits: history });
    const session = await rt.run('Mets Boulanger Valence mardi');
    const before = rt.snapshot(), original = rt.ctx.StoreRunnerManualPlanning.addStore;
    rt.ctx.StoreRunnerManualPlanning.addStore = (win, id) => original(win, id, 'Mercredi');
    const result = await rt.apply(session, 'x');
    assert.equal(result.ok, false); assert.match(result.error, /diffère de l’aperçu/);
    assert.equal(rt.snapshot(), before);
  });

  await scenario('Aperçu altéré, périmé ou obsolète : refusé sans écriture', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, plan: planOf({ Lundi: ['bl'] }), visits: history });
    const session = await rt.run('Mets Boulanger Valence mardi');
    const tampered = JSON.parse(JSON.stringify(session)); tampered.simulation.payload.ops[0].day = 'Jeudi';
    assert.equal((await expectUnchanged(rt, () => rt.apply(tampered, 'x'))).code, 'tampered');
    const old = Object.assign({}, session, { createdAt: session.createdAt - 11 * 60 * 1000 });
    assert.equal((await expectUnchanged(rt, () => rt.apply(old, 'x'))).code, 'expired');
    rt.ctx.state.notes = { bl: 'changement fait ailleurs pendant l’aperçu' };
    assert.equal((await rt.apply(session, 'x')).code, 'stale');
  });

  await scenario('M — r38 : date réelle (pas la semaine consultée), GPS frais lu sans écriture, choix explicite si éloigné', async () => {
    const future = runtime({ now: SAT, weekDate: W43, p1: ['da'], visits: history });
    assert.deepEqual((await future.run('Programme mes P1 avant la W42')).simulation.scope, { start: W41, end: '2026-10-11' }, 'semaine future consultée sans effet');
    const far = runtime({ now: SAT, weekDate: W41, p1: ['da'], visits: history, origin: { lat: 44.93, lon: 4.89 } });
    const ask = await expectUnchanged(far, () => far.run('Programme mes P1 avant la W42'));
    assert.equal(ask.status, 'origin'); assert.match(ask.message, /km de ton point de départ/);
    assert.equal(far.ctx.StoreRunnerProfile.resolveCalls, 1);
    const kept = await expectUnchanged(far, () => far.run('Programme mes P1 avant la W42', { originDecision: 'keep_saved' }));
    assert.equal(kept.status, 'preview');
    const denied = runtime({ now: SAT, weekDate: W41, p1: ['da'], visits: history, origin: { fail: true } });
    const blocked = await expectUnchanged(denied, () => denied.run('Programme mes P1 avant la W42'));
    assert.equal(blocked.status, 'blocked');
    const place = runtime({ now: SAT, weekDate: W41, visits: history, origin: { fail: true } });
    assert.equal((await place.run('Mets Boulanger Valence mardi')).status, 'preview', 'un placement ne dépend pas du GPS');
  });

  await scenario('N — même moteur que la génération : sans contrainte, la simulation rend le cycle de generateThreeWeekSnail', async () => {
    const rt = runtime({ now: SAT, weekDate: W40, visits: history, target: 10 });
    const T = rt.ctx.StoreRunnerTerrainPlanningV1, state = rt.ctx.state;
    const sim = T.simulateCommandWindow({ state, archive: {}, today: '2026-10-03', start: W41, end: '2026-10-25', shownWeekKey: W40, shownPlan: state.plan });
    assert.equal(sim.ok, true, sim.error);
    await T.generateThreeWeekSnail({ start: W41, today: '2026-10-03' });
    const archive = rt.archive();
    for (const week of sim.built.weeks) assert.deepEqual(ids(archive[week.weekKey].plan), ids(week.plan), 'semaine ' + week.weekKey + ' identique au cycle 3 semaines');
    assert.equal(sim.weekCount, 3);
  });

  await scenario('N (V189/V251) — découché de l’aperçu = décision V189 sur le planning appliqué ; ordre V251 stable', async () => {
    const rt = runtime({ now: SAT, weekDate: W41, visits: history, p1: ['da', 'dan', 'bc', 'dc', 'bg', 'dg'], target: 10 });
    const session = await rt.run('Programme mes P1 avant la W42');
    await applyAndCompare(rt, session, 'P1');
    const owner = rt.ctx.StoreRunnerOvernightV182.analyze(rt.ctx.state.plan, W41), c = owner && owner.candidate;
    const shown = (session.simulation.overnight.find(o => o.weekKey === W41) || {}).after || null;
    assert.deepEqual(shown && { from: shown.fromDate, to: shown.toDate }, c ? { from: c.fromDate, to: c.toDate } : null, 'même nuit que V189');
    const reopt = rt.ctx.StoreRunnerRouteOptimizerV251.optimizePlan(rt.ctx.state.plan, W41, rt.ctx.state, {});
    assert.equal(reopt.changed, false, 'V251 ne réordonnerait rien : l’ordre appliqué est déjà le sien');
  });

  await scenario('Déterminisme — mêmes données, même date, même intention → simulation octet pour octet', async () => {
    const make = () => runtime({ now: SAT, weekDate: W41, p1: ['bv', 'dc', 'bg', 'da'], visits: history });
    const a = (await make().run('Programme-moi tous mes P1 avant la W42')).simulation, b = (await make().run('Programme-moi tous mes P1 avant la W42')).simulation;
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  console.log('planning-command-simulation: ' + passed + ' scénarios OK');
})().catch(error => { console.error(error); process.exit(1); });
