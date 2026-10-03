/* Lot B — coût du Planning Command Engine sur un secteur dense (150 magasins, 60 visites
   réelles d'historique : la passe cross-day V264/H2 est active). Mesure la simulation de
   chaque famille de commandes, la compare à la construction du cycle 3 semaines seule, et
   vérifie le déterminisme. Les budgets sont larges (CI partagée) : ils protègent contre une
   dérive d'ordre de grandeur, pas contre le bruit de mesure. */
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const H = require('./helpers/planning-command-runtime.cjs');

const BRANDS = ['Darty', 'Boulanger', 'Fnac', 'Conforama', 'But'];
function sector(n) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i * 137.508) * Math.PI / 180, km = 6 + (i * 11) % 95;
    return { id: 'b' + String(i).padStart(3, '0'), enseigne: BRANDS[i % BRANDS.length], ville: 'Ville ' + String(i).padStart(3, '0'), adresse: i + ' rue', dept: '', lat: +(H.BASE.lat + km * Math.cos(a) / 111).toFixed(5), lon: +(H.BASE.lon + km * Math.sin(a) / 78).toFixed(5), priority: 3, active: true, intervalDays: [14, 21, 30, 45][i % 4], visitMinutes: 40, products: ['Brun'] };
  });
}
(async () => {
  const stores = sector(150), visits = {};
  for (let i = 0; i < 60; i++) { const id = stores[i * 2].id, d = '2026-09-' + String(1 + (i % 28)).padStart(2, '0'); visits[id] = { lastVisit: d, history: [d] }; }
  const p1 = stores.filter((_, i) => i % 7 === 0).slice(0, 20).map(s => s.id);
  const make = () => {
    const rt = H.runtime({ now: '2026-10-03T10:00:00', weekDate: '2026-10-05', stores, visits, target: 20, max: 4 });
    const P = rt.ctx.StoreRunnerPerformanceV190;
    P.saveSnapshot(rt.db, { week: 'W41', importedAt: '2026-10-01T09:00:00Z', rows: p1.map(id => { const s = stores.find(x => x.id === id); return { key: 'b|' + id, retailer: s.enseigne, site: s.ville, prio: 'P1', weeks: {}, deltaWeeks: {}, sellOutWeeks: {}, comment: '' }; }) });
    return rt;
  };
  const rows = [];
  const time = async (label, fn) => { const t0 = performance.now(); const out = await fn(); const ms = Math.round(performance.now() - t0); rows.push({ label, ms }); return out; };

  const rt = make(), T = rt.ctx.StoreRunnerTerrainPlanningV1, before = rt.snapshot();
  await time('cycle 3 semaines seul (simulateCommandWindow sans contrainte)', () => T.simulateCommandWindow({ state: rt.ctx.state, archive: {}, today: '2026-10-03', start: '2026-10-05', end: '2026-10-25', shownWeekKey: '2026-10-05', shownPlan: rt.ctx.state.plan }));
  const a = await time('« Programme mes P1 avant la W42 » (1 semaine, 20 P1)', () => rt.run('Programme mes P1 avant la W42'));
  const b = await time('« Répartis mes P1 sur les trois prochaines semaines »', () => rt.run('Répartis mes P1 sur les trois prochaines semaines'));
  const c = await time('« Mets Ville 007 mardi » (placement manuel simulé)', () => rt.run('Mets Ville 007 mardi'));
  const d = await time('« Évite Ville 010 jeudi » (régénération d’une semaine)', () => rt.run('Évite Ville 010 jeudi'));
  assert.equal(rt.snapshot(), before, 'aucune écriture pendant les simulations');
  for (const [s, name] of [[a, 'P1'], [b, 'répartition'], [c, 'placement'], [d, 'évitement']]) assert.equal(s.status, 'preview', name + ' : ' + JSON.stringify(s).slice(0, 200));
  assert.equal(a.simulation.totals.requested, p1.length);
  const again = await make().run('Programme mes P1 avant la W42');
  assert.equal(JSON.stringify(again.simulation), JSON.stringify(a.simulation), 'déterministe sur 150 magasins');
  const budget = Number(process.env.PLANNING_COMMAND_BUDGET_MS || 15000);
  for (const row of rows) assert(row.ms < budget, row.label + ' : ' + row.ms + ' ms > ' + budget + ' ms');
  console.log('planning-command-benchmark (150 magasins, 60 visites réelles, cross-day actif) : ' + JSON.stringify(rows));
  console.log('planning-command-benchmark: OK');
})().catch(error => { console.error(error); process.exit(1); });
