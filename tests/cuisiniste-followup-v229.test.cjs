const assert = require('node:assert/strict');
const fs = require('node:fs');

const v193 = require('../cuisiniste-contracts-v193.js');
globalThis.StoreRunnerCuisinisteV193 = v193;   // V229 passe par la porte de V193
const followup = require('../cuisiniste-followup-v229.js');

const KEY = 'SCH-CHAMBERY FR-73000', AUTRE = 'CUI-ANNECY FR-74000';
const TODAY = '2026-09-20', NOW = new Date(TODAY + 'T09:00:00.000Z');
const memory = () => ({ m: {}, getItem(k) { return this.m[k] === undefined ? null : this.m[k]; },
  setItem(k, v) { this.m[k] = String(v); }, removeItem(k) { delete this.m[k]; } });
const raw = storage => JSON.parse(storage.getItem(v193.STORE_KEY) || '{}');

// --- 1 & 2. Ancien stockage sans followups, création paresseuse ----------------------
const legacy = memory();
legacy.setItem(v193.STORE_KEY, JSON.stringify({ schema: 1, trackingImports: [], tariffImports: [], mapping: { [KEY]: 'store-1' } }));
assert.deepEqual(v193.readStore(legacy).mapping, { [KEY]: 'store-1' }, 'un stockage schema 1 reste lisible');
assert.deepEqual(v193.readStore(legacy).followups, {}, 'followups apparaît vide, sans migration');
assert.equal(raw(legacy).followups, undefined, 'et rien n’est écrit tant que rien n’est saisi');
assert.deepEqual(followup.followupFor(legacy, KEY), followup.emptyFollowup());
assert.equal(raw(legacy).followups, undefined, 'une simple lecture n’écrit toujours rien');

// --- 10 & 11. Actions, historique, journalisation du statut --------------------------
const store = memory();
followup.addAction(store, KEY, { type: 'envoi', note: 'Envoyé par mail', date: '2026-09-18T10:00:00.000Z' });
let row = followup.followupFor(store, KEY);
assert.equal(row.history.length, 1, 'chaque action entre dans l’historique');
assert.equal(row.history[0].type, 'envoi');
assert.equal(row.history[0].note, 'Envoyé par mail');
assert.equal(row.lastAction.label, 'Contrat envoyé');
assert.equal(row.workflowStatus, null, 'une action ne change pas le statut toute seule');
assert.equal(followup.suggestedStatus('envoi'), 'contrat-envoye', 'elle le suggère seulement');
assert.equal(followup.suggestedStatus('signature'), 'signe-en-cours');
assert.equal(followup.suggestedStatus('renouvellement'), 'a-renouveler');
assert.equal(followup.suggestedStatus('appel'), null, 'un appel ne suggère aucun statut');

followup.addAction(store, KEY, { type: 'envoi', status: 'contrat-envoye' });
assert.equal(followup.followupFor(store, KEY).workflowStatus, 'contrat-envoye', 'le statut suit quand on le demande');
followup.setStatus(store, KEY, 'attente-signature', 'Relancé le responsable');
row = followup.followupFor(store, KEY);
assert.equal(row.workflowStatus, 'attente-signature');
const journal = row.history[row.history.length - 1];
assert.equal(journal.previousStatus, 'contrat-envoye', 'le changement de statut est journalisé');
assert.equal(journal.nextStatus, 'attente-signature');
assert.equal(journal.note, 'Relancé le responsable');
assert.throws(() => followup.setStatus(store, KEY, 'inconnu'), /inconnu/i);

// --- 12. Prochaine action : persistance et suppression -------------------------------
followup.setNextAction(store, KEY, { label: 'Relancer Mme X', dueDate: '2026-09-25', note: 'Par téléphone' });
row = followup.followupFor(store, KEY);
assert.equal(row.nextAction.label, 'Relancer Mme X');
assert.equal(row.nextAction.dueDate, '2026-09-25');
assert.equal(row.reminderDate, '2026-09-25');
assert.throws(() => followup.setNextAction(store, KEY, { label: '' }), /libellé/i);
assert.throws(() => followup.setNextAction(store, KEY, { label: 'X', dueDate: '25/09' }), /invalide/i);
// Une relance réalisée devient un fait passé, et cesse d'être due.
const before = followup.followupFor(store, KEY).history.length;
followup.completeNextAction(store, KEY, { note: 'Rappelée' });
row = followup.followupFor(store, KEY);
assert.equal(row.nextAction, null, 'la prochaine action est vidée une fois faite');
assert.equal(row.reminderDate, null);
assert.equal(row.history.length, before + 1, 'et rejoint l’historique');

// --- 13, 14, 15. Alertes de relance ---------------------------------------------------
const site = { key: KEY, activeContract: { status: 'Contrat actif', endDate: '2027-06-30', monthsRemaining: 9 } };
const withDue = due => Object.assign(followup.emptyFollowup(), { nextAction: { label: 'Relancer', dueDate: due } });
assert.equal(followup.alerts(site, withDue('2026-09-18'), NOW)[0].id, 'relance-retard');
assert.equal(followup.alerts(site, withDue(TODAY), NOW)[0].id, 'relance-aujourdhui');
assert.deepEqual(followup.alerts(site, withDue('2026-10-02'), NOW), [], 'une relance future n’alerte pas');

// --- 16. Fin de contrat : le signal vient des dates V193 ------------------------------
const bientot = { key: KEY, activeContract: { status: 'Contrat actif', endDate: '2026-11-30', monthsRemaining: 2 } };
assert.equal(followup.alerts(bientot, followup.emptyFollowup(), NOW)[0].id, 'contrat-fin-proche');
const fini = { key: KEY, activeContract: { status: 'Contrat actif', endDate: '2026-08-31', monthsRemaining: 0 } };
assert.equal(followup.alerts(fini, followup.emptyFollowup(), NOW)[0].id, 'contrat-termine');
// Priorité : une relance en retard passe devant un signal contrat.
const deux = followup.alerts(bientot, withDue('2026-09-01'), NOW);
assert.equal(deux[0].id, 'relance-retard');
assert.equal(deux[1].id, 'contrat-fin-proche');
assert.equal(deux[0].kind, 'suivi');
assert.equal(deux[1].kind, 'contrat', 'alerte contrat et alerte suivi restent distinguables');
// Signé sans suite, et à renouveler.
const signe = Object.assign(followup.emptyFollowup(), { workflowStatus: 'signe-en-cours' });
assert.equal(followup.alerts(site, signe, NOW)[0].id, 'signe-sans-suite');
const renouv = Object.assign(followup.emptyFollowup(), { workflowStatus: 'a-renouveler' });
assert(followup.alerts(site, renouv, NOW).some(a => a.id === 'a-renouveler'));

// --- 5 & 9. Statut workflow distinct du statut importé, cas sans contrat --------------
assert.equal(followup.statusFor(followup.emptyFollowup(), site), null,
  'un contrat connu sans démarche saisie n’invente aucun statut');
assert.equal(followup.statusFor(followup.emptyFollowup(), { key: AUTRE }), 'aucun-contrat',
  'sans contrat connu, « aucun contrat » est déduit');
assert.equal(followup.statusFor(followup.emptyFollowup(), null), 'aucun-contrat');
assert.equal(site.activeContract.status, 'Contrat actif', 'le statut importé n’est jamais touché');
const mixte = Object.assign(followup.emptyFollowup(), { workflowStatus: 'attente-signature' });
assert.equal(followup.statusFor(mixte, site), 'attente-signature');
assert.notEqual(followup.statusFor(mixte, site), site.activeContract.status,
  'workflowStatus et statut importé sont deux champs différents');

// --- 17. Un import ultérieur ne supprime pas le suivi ---------------------------------
const imported = memory();
followup.addAction(imported, KEY, { type: 'proposition', status: 'proposition-presentee' });
followup.setNextAction(imported, KEY, { label: 'Rappeler', dueDate: '2026-10-01' });
v193.saveTracking(imported, { sector: 'Secteur Test', importedAt: new Date().toISOString(),
  sites: [{ key: KEY, brand: 'SCHMIDT', city: 'Chambéry', cityKey: 'chambery', postal: '73000', label: KEY, contracts: [] }] });
let after = followup.followupFor(imported, KEY);
assert.equal(after.workflowStatus, 'proposition-presentee', 'un import de suivi ne remet pas le workflow à zéro');
assert.equal(after.nextAction.label, 'Rappeler', 'ni la prochaine action');
// Programmer une relance n'est pas une action effectuée : elle n'entre pas dans
// l'historique, seule l'action réellement faite y figure.
assert.equal(after.history.length, 1, 'ni l’historique des actions faites');
v193.saveTariff(imported, { importedAt: new Date().toISOString(), products: [] });
assert.equal(followup.followupFor(imported, KEY).workflowStatus, 'proposition-presentee', 'un import de tarifs non plus');

// --- 18. Remapping vers un autre magasin : le suivi reste attaché au site ------------
v193.rememberMatch(imported, KEY, 'store-1');
assert.equal(v193.readStore(imported).mapping[KEY], 'store-1');
v193.rememberMatch(imported, KEY, 'store-42');
assert.equal(v193.readStore(imported).mapping[KEY], 'store-42', 'le mapping a bien changé de magasin');
assert.equal(followup.followupFor(imported, KEY).workflowStatus, 'proposition-presentee',
  'le suivi est attaché à l’identité cuisiniste, pas au magasin');
v193.rememberMatch(imported, KEY, null);
assert.equal(v193.readStore(imported).mapping[KEY], undefined, 'le magasin peut être délié');
assert.equal(followup.followupFor(imported, KEY).history.length, 1,
  'et l’historique commercial survit à la perte du lien magasin');

// --- Filtres et compteurs de l'écran central -----------------------------------------
const central = memory();
const sites = [
  { key: KEY, activeContract: { status: 'Contrat actif', endDate: '2027-06-30', monthsRemaining: 9 } },
  { key: AUTRE, activeContract: null, lastContract: null },
];
followup.setStatus(central, KEY, 'attente-signature');
followup.setNextAction(central, KEY, { label: 'Relancer', dueDate: '2026-09-15' });
followup.setStatus(central, AUTRE, 'a-renouveler');
const counts = followup.summary(central, sites, NOW);
assert.equal(counts.relance, 1, 'une relance en retard compte comme à relancer');
assert.equal(counts['attente-signature'], 1);
assert.equal(counts['a-renouveler'], 1);
assert.equal(counts['signe-en-cours'], 0);
assert.deepEqual(followup.FILTERS.map(f => f.id), ['all', 'relance', 'attente-signature', 'a-renouveler', 'signe-en-cours']);
assert.equal(followup.matchesFilter('all', sites[0], followup.followupFor(central, KEY), NOW), true);

// --- Contrats de code : aucune base parallèle, rien d'écrasé -------------------------
const SRC = fs.readFileSync(__dirname + '/../cuisiniste-followup-v229.js', 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
assert(!/localStorage/.test(CODE), 'aucun stockage indépendant');
assert(!/setItem|getItem/.test(CODE), 'tout passe par readStore/writeStore de V193');
assert(/StoreRunnerCuisinisteV193/.test(CODE), 'la porte vers le stockage reste celle de V193');
for (const forbidden of ['store.type', 'trackingImports=', 'tariffImports=', 'mapping=']) {
  assert(!CODE.includes(forbidden), 'donnée importée jamais réécrite : ' + forbidden);
}
const V193SRC = fs.readFileSync(__dirname + '/../cuisiniste-contracts-v193.js', 'utf8');
assert(/followups:p\.followups/.test(V193SRC), 'readStore doit préserver followups, sinon un import l’efface');
assert(/writeStore,siteForStore/.test(V193SRC), 'V193 expose sa porte d’écriture au suivi');
assert(/,renderSheet,/.test(V193SRC), 'l’écran central doit pouvoir se redessiner quand le filtre change');

// --- 12. Proposition V225 : on lui délègue les règles, on ne les réécrit pas ---------
const V225SRC = fs.readFileSync(__dirname + '/../cuisiniste-contract-proposal-v225.js', 'utf8');
assert(/function buildProposal\(db=storage\(\),allocation,list=stores\(\)\)/.test(V225SRC),
  'signature V225 de référence : (stockage, allocation, magasins)');
assert(/p\.buildProposal\(storage\(\), \[\{ storeId: site\.storeId, refs: chosen \}\], \(root\.state && root\.state\.stores\)/.test(CODE),
  'V229 appelle buildProposal avec une vraie allocation, sinon le bouton ne produirait jamais rien');
assert(/p\.eligibleProducts\(storage\(\)\)/.test(CODE), 'les références proposables viennent du tarif V225, pas d’une liste recopiée');
for (const rule of ['pas d’expo', 'MIN_PRODUCTS =', 'MAX_PRODUCTS =', 'contractObjective']) {
  assert(!CODE.includes(rule), 'la règle de proposition reste chez V225 : ' + rule);
}
assert(/addAction\(storage\(\), siteKey, \{ type: 'proposition'/.test(CODE),
  'une proposition préparée entre dans l’historique commercial');

// --- 3, 6, 7, 8. Canal magasin : on réutilise le helper V228 -------------------------
const RUNTIME = fs.readFileSync(__dirname + '/../src/chef-secteur.html', 'utf8');
assert(/function storeChannel\(store\)\{if\(store\.channel==='retail'\|\|store\.channel==='cuisiniste'\)return store\.channel/.test(RUNTIME),
  'le helper de canal V228 reste la seule classification');
assert(/schmidt\|cuisinella/.test(RUNTIME), 'Schmidt et Cuisinella restent reconnus sans channel explicite');
assert(!/store\.type\s*=/.test(SRC), 'le champ historique store.type n’est jamais modifié');

console.log('suivi cuisinistes V229: stockage partagé, identité de site, actions, alertes, imports et remapping ok');
