/* V276 — « À retenir » : `StoreRunnerStoreExplorer.insightsFor` croise le rapport qui vient d'être clôturé avec les rapports
   précédents du même magasin, ses actions, son planning et sa priorité. Lecture seule ; que des statuts, des comptes et des
   dates (jamais le texte libre d'un rapport) ; rien d'utile = aucun constat. Fixtures inventées, vrai modèle de visites. */
const assert = require('node:assert/strict');
const path = require('node:path');
globalThis.StoreRunnerVisitModel = require('../store-runner-visit-model.js');
globalThis.StoreRunnerVisitCoverage = require('../visit-coverage.js');
globalThis.StoreRunnerManualHours = require('../planning-manual-hours.js');
const M = globalThis.StoreRunnerVisitModel;
const X = require('../store-explorer.js');
const B = require(path.join(__dirname, '..', 'runner-behavior.js'));

const TODAY = '2026-10-07'; // mercredi
const store = (id, extra) => Object.assign({ id, enseigne: 'Darty', ville: 'Ville ' + id, freq: 'Mensuel', active: true, priority: 3 }, extra || {});
const fresh = (extra) => Object.assign({ stores: [store('s'), store('t')], visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], plan: {}, settings: { weekDate: '2026-10-05', days: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'] }, businessV2: M.empty() }, extra || {});
const opt = (extra) => Object.assign({ today: TODAY, archive: {}, priorities: new Map() }, extra || {});
// Indices 6P lisibles : produit:1 = « Stocks », produit:4 = « Assortiment », place:0 = « Part de linéaire », prix:2 = « Ajustement nécessaire »
const STOCKS = ['produit', 1], RANGE = ['produit', 4], SHELF = ['place', 0], PRICE = ['prix', 2];
/* Clôture un rapport réel : `rows` = [[[p, i], statut, actionNotée?], ...]. */
function close(state, day, rows, id) {
  const sid = id || 's', v = M.start(state, sid);
  for (const [[p, i], status, action] of rows || []) {
    M.edit6P(state, v, p, i, 'status', status);
    if (action) M.edit6P(state, v, p, i, 'action', action);
  }
  M.editVisit(state, v, 'conclusion', null, 'Passage terminé');
  M.complete(state, v, day);
  return v;
}
const insights = (state, extra, id) => X.insightsFor(state, id || 's', opt(extra));
const byKind = (r, kind) => r.items.find(i => i.kind === kind);
const texts = r => r.items.map(i => i.text);

/* 1. Rien d'utile : silence ----------------------------------------------------------------------------------- */
{
  const s = fresh();
  assert.deepEqual(insights(s), { storeId: 's', visitId: '', date: '', priority: '', items: [] }, 'aucune visite terminée');
  assert.deepEqual(insights(s, {}, 'absent').items, [], 'magasin inconnu');
  const v = M.start(s, 's'); // brouillon : pas d'analyse
  assert.deepEqual(insights(s).items, [], 'une visite en cours n’est pas analysée');
  M.editVisit(s, v, 'conclusion', null, 'ok'); M.complete(s, v, '2026-10-01');
  assert.deepEqual(insights(s).items, [], 'première visite, rien d’utile : aucun constat');
  assert.equal(insights(s).visitId, v);
  assert.deepEqual(B.remarks({ items: insights(s).items }).lines, [], 'et donc aucune remarque de Runner');
}

/* 2. Point récurrent : le même point à corriger, visite après visite -------------------------------------------- */
{
  const s = fresh();
  close(s, '2026-08-05', [[STOCKS, 'correct', 'Refaire le facing']]);
  assert.equal(byKind(insights(s), 'recurring'), undefined, 'une seule visite : pas de récurrence');
  close(s, '2026-09-02', [[STOCKS, 'correct', 'Refaire le facing']]);
  let r = insights(s);
  assert.equal(byKind(r, 'recurring').text, 'Stocks (Produit) : à corriger pour la 2ᵉ visite de suite.');
  close(s, '2026-10-06', [[STOCKS, 'correct', 'Refaire le facing'], [SHELF, 'correct', 'Réaménager'], [PRICE, 'ok']]);
  r = insights(s);
  const rec = byKind(r, 'recurring');
  assert.equal(rec.text, 'Stocks (Produit) : à corriger pour la 3ᵉ visite de suite.', 'la plus persistante, avec son rang');
  assert.deepEqual([rec.severity, rec.tone], [2, 'attention']);
  assert.equal(r.date, '2026-10-06');
  // Une visite intermédiaire conforme casse la série
  const t = fresh();
  close(t, '2026-08-05', [[STOCKS, 'correct', 'a']]); close(t, '2026-09-02', [[STOCKS, 'ok']]); close(t, '2026-10-06', [[STOCKS, 'correct', 'a']]);
  assert.equal(byKind(insights(t), 'recurring'), undefined, 'conforme entre-temps : plus une récurrence');
  assert.ok(byKind(insights(t), 'regression'), '… mais une régression');
  // Plusieurs points récurrents : le plus persistant, et le compte des autres
  const u = fresh();
  close(u, '2026-08-05', [[STOCKS, 'correct', 'a'], [SHELF, 'correct', 'a'], [RANGE, 'correct', 'a']]);
  close(u, '2026-10-06', [[STOCKS, 'correct', 'a'], [SHELF, 'correct', 'a'], [RANGE, 'correct', 'a']]);
  assert.equal(byKind(insights(u), 'recurring').text, 'Stocks (Produit) : à corriger pour la 2ᵉ visite de suite (et 2 autres points récurrents).', 'à rang égal, l’ordre du rapport départage');
}

/* 3. Évolution depuis le dernier passage -------------------------------------------------------------------------- */
{
  const s = fresh();
  close(s, '2026-09-02', [[STOCKS, 'correct', 'a'], [SHELF, 'ok'], [PRICE, 'ok']]);
  close(s, '2026-10-06', [[STOCKS, 'ok'], [SHELF, 'correct', 'b'], [PRICE, 'ok']]);
  const r = insights(s);
  assert.equal(byKind(r, 'improved').text, 'Corrigé depuis le dernier passage : Stocks (Produit).');
  assert.equal(byKind(r, 'improved').tone, 'positive');
  assert.equal(byKind(r, 'regression').text, 'Nouveau point à corriger : Part de linéaire (Place) (conforme au dernier passage).');
  assert.equal(byKind(r, 'trend'), undefined, 'la tendance chiffrée n’est pas répétée quand le détail est connu');
  // Tendance seule : beaucoup moins de points à corriger, sans point précisément passé à « OK »
  const t = fresh();
  close(t, '2026-09-02', [[STOCKS, 'correct', 'a'], [SHELF, 'correct', 'a'], [RANGE, 'correct', 'a'], [PRICE, 'correct', 'a']]);
  close(t, '2026-10-06', [[STOCKS, 'correct', 'a']]);
  const trend = byKind(insights(t), 'trend');
  assert.equal(trend.text, '1 point à corriger, contre 4 au dernier passage.'); assert.equal(trend.tone, 'positive');
  const w = fresh();
  close(w, '2026-09-02', [[STOCKS, 'correct', 'a']]);
  close(w, '2026-10-06', [[STOCKS, 'correct', 'a'], [SHELF, 'correct', 'a'], [RANGE, 'correct', 'a']]);
  assert.equal(byKind(insights(w), 'trend').tone, 'attention'); assert.equal(byKind(insights(w), 'trend').text, '3 points à corriger, contre 1 au dernier passage.');
  const small = fresh();
  close(small, '2026-09-02', [[STOCKS, 'correct', 'a']]); close(small, '2026-10-06', [[STOCKS, 'correct', 'a'], [SHELF, 'correct', 'a']]);
  assert.equal(byKind(insights(small), 'trend'), undefined, 'une variation d’un seul point n’est pas une tendance');
}

/* 4. Actions : en retard, ouvertes des visites précédentes ; jamais celles que ce rapport vient de créer --------------- */
{
  const s = fresh();
  const old = close(s, '2026-08-05', [[STOCKS, 'ok']]);
  const a = M.data(s).actions; assert.equal(a.length, 0);
  // Action d'une visite précédente, ouverte, en retard
  const prior = fresh();
  const v1 = close(prior, '2026-08-05', [[STOCKS, 'correct', 'Réapprovisionner']]);
  const act = M.data(prior).actions[0]; assert.equal(act.status, 'open');
  M.editAction(prior, act.id, 'dueDate', '2026-09-10');
  close(prior, '2026-10-06', [[SHELF, 'ok']]);
  let r = insights(prior);
  assert.equal(byKind(r, 'overdue-action').text, '1 action en retard sur ce magasin (échéance la plus ancienne : 10 sept.).');
  assert.deepEqual([byKind(r, 'overdue-action').severity, byKind(r, 'overdue-action').tone], [3, 'attention']);
  assert.equal(byKind(r, 'open-actions'), undefined, 'en retard prime sur « ouverte »');
  // Échéance aujourd'hui : pas encore en retard
  M.editAction(prior, act.id, 'dueDate', TODAY);
  assert.equal(byKind(insights(prior), 'overdue-action'), undefined, 'échue aujourd’hui : pas en retard'); assert.ok(byKind(insights(prior), 'open-actions'));
  M.editAction(prior, act.id, 'dueDate', '2026-09-10');
  // Fermée ou annulée : plus rien
  M.editAction(prior, act.id, 'status', 'done'); assert.equal(byKind(insights(prior), 'overdue-action'), undefined);
  M.editAction(prior, act.id, 'status', 'cancelled'); assert.equal(byKind(insights(prior), 'overdue-action'), undefined);
  // Action ouverte, pas en retard
  const calm = fresh();
  close(calm, '2026-08-05', [[STOCKS, 'correct', 'Réapprovisionner']]);
  M.editAction(calm, M.data(calm).actions[0].id, 'dueDate', '2026-10-30');
  close(calm, '2026-10-06', [[SHELF, 'ok']]);
  r = insights(calm);
  assert.equal(byKind(r, 'open-actions').text, '1 action ouverte des visites précédentes · prochaine échéance le 30 oct.', 'un seul point final');
  assert.equal(byKind(r, 'open-actions').severity, 1);
  // Les actions créées par le rapport qu'on analyse ne sont pas une information
  const mine = fresh();
  close(mine, '2026-10-06', [[STOCKS, 'correct', 'Refaire le facing'], [SHELF, 'correct', 'Réaménager']]);
  assert.equal(M.data(mine).actions.length, 2);
  assert.equal(byKind(insights(mine), 'open-actions'), undefined, 'ce rapport vient de les créer : aucun écho');
  // Les actions d'un autre magasin ne comptent pas
  const other = fresh();
  close(other, '2026-08-05', [[STOCKS, 'correct', 'a']], 't'); M.editAction(other, M.data(other).actions[0].id, 'dueDate', '2026-09-01');
  close(other, '2026-10-06', [[SHELF, 'ok']], 's');
  assert.deepEqual(insights(other, {}, 's').items.filter(i => /action/.test(i.kind)), []);
}

/* 5. Incohérences -------------------------------------------------------------------------------------------- */
{
  const s = fresh();
  close(s, '2026-10-06', [[STOCKS, 'correct'], [SHELF, 'correct', 'Réaménager'], [RANGE, 'correct']]);
  const inc = byKind(insights(s), 'inconsistency');
  assert.equal(inc.text, '2 points à corriger sans action notée : Stocks (Produit), Assortiment (Produit).');
  assert.deepEqual([inc.severity, inc.tone], [2, 'attention']);
  const fine = fresh(); close(fine, '2026-10-06', [[STOCKS, 'correct', 'a']]);
  assert.equal(byKind(insights(fine), 'inconsistency'), undefined, 'une action est notée : cohérent');
  const empty = fresh(); close(empty, '2026-10-06', []);
  assert.equal(byKind(insights(empty), 'inconsistency'), undefined, 'rapport vide d’un magasin ordinaire : aucun reproche');
  const p1 = insights(empty, { priorities: new Map([['s', 'P1']]) });
  assert.equal(byKind(p1, 'inconsistency'), undefined, '6P vide, même sur un P1 : jamais une incohérence');
  assert.equal(p1.items.length, 0, '6P vide : aucune remarque produite');
  assert.equal(p1.priority, 'P1');
  const longList = fresh(); close(longList, '2026-10-06', [[STOCKS, 'correct'], [SHELF, 'correct'], [RANGE, 'correct'], [PRICE, 'correct']]);
  assert.match(byKind(insights(longList), 'inconsistency').text, /^4 points à corriger sans action notée : .*, .* et 2 autres\.$/);
}

/* 6. À revoir au prochain passage, avec ce que dit le planning ------------------------------------------------------ */
{
  const s = fresh(); close(s, '2026-10-06', [[SHELF, 'opportunity']]);
  let r = insights(s);
  assert.equal(byKind(r, 'revisit').text, 'À reprendre au prochain passage (aucun passage planifié) : Part de linéaire (Place).');
  s.plan = { Lundi: [], Mardi: [], Mercredi: [], Jeudi: [{ id: 's' }], Vendredi: [], Samedi: [] };
  r = insights(s);
  assert.equal(byKind(r, 'revisit').text, 'À reprendre au prochain passage (prévu le 8 oct.) : Part de linéaire (Place).');
  const noted = fresh(); close(noted, '2026-10-06', [[SHELF, 'opportunity', 'Proposer un implantation']]);
  assert.equal(byKind(insights(noted), 'revisit'), undefined, 'une action est notée : rien à revoir');
}

/* 7. Priorité : même constat, plus de poids et une étiquette ------------------------------------------------------- */
{
  const s = fresh();
  close(s, '2026-09-02', [[STOCKS, 'ok'], [PRICE, 'correct', 'a']]); close(s, '2026-10-06', [[STOCKS, 'correct', 'a'], [PRICE, 'correct', 'a']]);
  const plain = insights(s), p1 = insights(s, { priorities: new Map([['s', 'P1']]) }), p2 = insights(s, { priorities: new Map([['s', 'P2']]) });
  assert.equal(byKind(plain, 'regression').severity, 2); assert.equal(byKind(p1, 'regression').severity, 3); assert.equal(byKind(p2, 'regression').severity, 2);
  assert.match(byKind(p1, 'regression').text, /^P1 · /); assert.doesNotMatch(byKind(plain, 'regression').text, /P1/);
  assert.equal(p2.priority, 'P2'); assert.ok(p1.items.every(i => i.severity <= 3));
}

/* 8. Choix du rapport analysé et ordre des visites ----------------------------------------------------------------- */
{
  const s = fresh();
  const first = close(s, '2026-09-02', [[STOCKS, 'correct', 'a']]), second = close(s, '2026-10-06', [[STOCKS, 'correct', 'a']]);
  assert.equal(insights(s).visitId, second, 'par défaut : la dernière visite terminée');
  assert.equal(insights(s, { visitId: first }).visitId, first);
  assert.equal(byKind(insights(s, { visitId: first }), 'recurring'), undefined, 'la première visite n’a pas de précédente');
  assert.deepEqual(insights(s, { visitId: 'nope' }).items, [], 'visite inconnue');
  // Visites enregistrées dans le désordre (import, correction de date) : c'est la date de visite qui compte, pas l'ordre de saisie
  const late = fresh();
  const recent = close(late, '2026-10-06', [[STOCKS, 'ok']]);
  close(late, '2026-09-02', [[STOCKS, 'correct', 'a']]);
  assert.equal(insights(late).visitId, recent, 'la plus récente par sa date de visite');
  assert.equal(byKind(insights(late), 'improved').text, 'Corrigé depuis le dernier passage : Stocks (Produit).', 'comparée à la visite datée juste avant');
  // Un brouillon n'est jamais une visite précédente
  const withDraft = fresh();
  close(withDraft, '2026-10-06', [[STOCKS, 'ok']]);
  const draft = M.start(withDraft, 's'); M.edit6P(withDraft, draft, 'produit', 1, 'status', 'correct');
  assert.deepEqual(insights(withDraft).items, [], 'le brouillon n’est ni analysé ni pris pour un passage précédent');
  // Même jour : l'ordre d'enregistrement départage
  const d = fresh(); close(d, '2026-10-06', [[STOCKS, 'correct', 'a']]); const last = close(d, '2026-10-06', [[STOCKS, 'ok']]);
  assert.equal(insights(d).visitId, last);
}

/* 9. Jamais de texte libre, jamais d'écriture, jamais d'exception ------------------------------------------------ */
{
  const s = fresh(); const SECRET = 'SECRET_TEXTE_LIBRE_9137';
  const v = M.start(s, 's');
  M.editVisit(s, v, 'conclusion', null, SECRET); M.editReport(s, v, 'blanc', 'team', SECRET); M.editReport(s, v, 'shared', 'context', SECRET);
  M.edit6P(s, v, 'produit', 1, 'status', 'correct'); M.edit6P(s, v, 'produit', 1, 'comment', SECRET); M.edit6P(s, v, 'produit', 1, 'action', SECRET);
  M.edit6P(s, v, 'place', 0, 'status', 'opportunity'); M.edit6P(s, v, 'place', 0, 'comment', SECRET);
  M.complete(s, v, '2026-10-06');
  const r = insights(s);
  assert.ok(r.items.length === 0 || !JSON.stringify(r).includes(SECRET), 'le texte libre d’un rapport n’apparaît jamais');
  assert.ok(!JSON.stringify(r).includes(SECRET));
  const frozen = JSON.parse(JSON.stringify(s)); const deep = o => { Object.values(o).forEach(x => x && typeof x === 'object' && deep(x)); return Object.freeze(o) };
  deep(frozen);
  assert.doesNotThrow(() => X.insightsFor(frozen, 's', opt()), 'un état gelé : aucune écriture');
  const before = JSON.stringify(s); insights(s); insights(s, { visitId: v }); assert.equal(JSON.stringify(s), before, 'aucune modification de l’état');
  assert.equal(JSON.stringify(insights(s)), JSON.stringify(insights(s)), 'déterministe');
  for (const bad of [null, undefined, 42, 'x', [], {}, { businessV2: null }, { businessV2: { visits: 'x', actions: 3 } }, { businessV2: { visits: [null, 5, { storeId: 's', status: 'completed', sixP: 'x' }] } }])
    assert.doesNotThrow(() => assert.ok(Array.isArray(X.insightsFor(bad, 's', opt()).items)), 'état hostile : jamais d’exception');
  assert.doesNotThrow(() => X.insightsFor(s, { toString() { throw new Error('piégé') } }, opt()));
  const noModel = globalThis.StoreRunnerVisitModel; delete globalThis.StoreRunnerVisitModel;
  try { assert.deepEqual(insights(s).items, [], 'sans le modèle de visites : aucun constat'); } finally { globalThis.StoreRunnerVisitModel = noModel; }
}

/* 10. Chaîne complète : constats → remarques de Runner (1 ou 2, la plus grave d'abord, rien si rien) ----------------- */
{
  const s = fresh();
  close(s, '2026-08-05', [[STOCKS, 'correct', 'a'], [PRICE, 'ok']]);
  close(s, '2026-09-02', [[STOCKS, 'correct', 'a'], [PRICE, 'ok']]);
  close(s, '2026-10-06', [[STOCKS, 'correct', 'a'], [PRICE, 'correct', 'a'], [SHELF, 'opportunity']]);
  const r = insights(s), spoken = B.remarks({ items: r.items });
  assert.ok(r.items.length >= 3, 'plusieurs constats disponibles');
  assert.equal(spoken.lines.length, 2, 'mais Runner n’en dit que deux');
  assert.ok(spoken.lines[0].text.startsWith('Stocks (Produit) : à corriger pour la 3ᵉ visite de suite') || spoken.lines[0].kind === 'recurring', 'la plus grave d’abord');
  assert.equal(B.remarks({ items: r.items, personality: 'discret' }).lines.length, 1);
  assert.equal(spoken.state, 'alert');
  for (const i of r.items) { assert.ok(B.REMARK_KINDS.includes(i.kind), i.kind); assert.ok(['attention', 'positive', 'neutral'].includes(i.tone)); assert.ok(i.severity >= 0 && i.severity <= 3); assert.ok(i.text.length <= B.CONFIG.lineMaxChars, 'tient sur une ligne : ' + i.text); }
  // Vocabulaire : factuel, sans éloge, sans promesse d'optimalité, sans modèle non résolu
  for (const i of r.items) { assert.doesNotMatch(i.text, /bravo|super|excellent|parfait|optimal|meilleur|plus court|\{|\}|undefined|null|NaN/i, i.text); assert.doesNotMatch(i.text, /\.\./, 'un seul point final : ' + i.text); }
  const calm = fresh(); close(calm, '2026-09-02', [[STOCKS, 'ok']]); close(calm, '2026-10-06', [[STOCKS, 'ok'], [PRICE, 'ok']]);
  assert.deepEqual(B.remarks({ items: insights(calm).items }).lines, [], 'tout est conforme : Runner se tait');
}

console.log('PASS: Runner Insights V276 — constats croisés (récurrence, évolution, actions, incohérences, à revoir, priorité), lecture seule, sans texte libre.');
