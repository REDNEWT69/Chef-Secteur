const assert=require('assert/strict');
const fs=require('fs');
/* Revue #496 (règle métier) : un P1/P2 garde sa priorité jusqu'au prochain fichier performance ; « traité »
   est un flag de suivi, jamais une sortie de priorité. Le SEF demande au moins 2 visites pour un P1 : tant
   qu'il en a moins depuis l'import, la garde V263 « visité trop récemment » cède. */
const SAVED={db:globalThis.__chefStorage,perf:globalThis.StoreRunnerPerformanceV190,cov:globalThis.StoreRunnerVisitCoverage};
let imported='2026-09-21T08:00:00Z',treated=new Set(['a','b','c','d']);
globalThis.__chefStorage={getItem(){return null}};
globalThis.StoreRunnerPerformanceV190={
  latestSnapshot:()=>({week:'W39',importedAt:imported,rows:[]}),
  matchRows:()=>({rows:[{storeId:'a',prio:'P1'},{storeId:'b',prio:'P2'},{storeId:'c',prio:'P1'},{storeId:'d',prio:'P1'},{storeId:'e',prio:'P1'}]}),
  readStore:()=>({mapping:{}}),
  isTreated:(db,week,id)=>treated.has(String(id))
};
const C=globalThis.StoreRunnerVisitCoverage=require('../visit-coverage.js');
const X=require('../store-explorer.js');
try{
  const mk=(id)=>({id,enseigne:'Magasin '+id,ville:'V'+id,freq:'Mensuel',active:true,priority:3});
  const stores=['a','b','c','d','e'].map(mk);
  const state={stores,
    visits:{
      a:{lastVisit:'2026-09-22',history:['2026-09-22']},                    // 1 visite depuis l'import
      b:{lastVisit:'2026-09-22',history:['2026-09-22']},                    // P2, 1 visite
      c:{lastVisit:'2026-09-22',history:['2026-09-01','2026-09-22']},       // 1 avant l'import + 1 depuis
      d:{lastVisit:'2026-09-25',history:['2026-09-22','2026-09-25']}},      // 2 depuis l'import
    included:{},excluded:{},locks:{},appointments:[],notes:{}};
  const today='2026-09-28';
  const need=id=>C.need(state,stores.find(s=>s.id===id),{today});

  // La priorité du parc ne dépend pas de « traité ».
  const prio=C.performancePriorities(state);
  assert.deepEqual([...prio].sort(),[['a','P1'],['b','P2'],['c','P1'],['d','P1'],['e','P1']],'tous les traités gardent leur P1/P2');
  assert.equal(prio.since,'2026-09-21','la date d’import sert de repère aux visites du P1');

  // P1 + traité après 1 passage : reste P1 et éligible pour le 2e passage.
  const a=need('a');
  assert.equal(a.priority,'P1');assert.equal(a.blocked,false,'la garde cède : 2e passage attendu');assert.equal(a.secondVisit,true);
  assert.match(C.explain(a),/2e passage P1 attendu/);
  assert.ok(a.tier>=1.25,'le bonus P1 est conservé');
  // Une visite antérieure à l'import ne compte pas.
  assert.equal(need('c').blocked,false);assert.equal(need('c').secondVisit,true);
  // P2 : aucune exception, la garde reste, la priorité aussi.
  assert.equal(need('b').priority,'P2');assert.equal(need('b').blocked,true);assert.equal(need('b').secondVisit,undefined);
  // 2 visites depuis l'import : la garde reprend.
  assert.equal(need('d').priority,'P1');assert.equal(need('d').blocked,true);assert.equal(need('d').tier,0);
  // Jamais visité : inchangé.
  assert.equal(need('e').status,'never');

  // « Traité » n'intervient pas : mêmes résultats avec ou sans le flag.
  const withFlag=JSON.stringify(stores.map(s=>need(s.id)));
  treated=new Set();
  assert.equal(JSON.stringify(stores.map(s=>need(s.id))),withFlag,'le flag « traité » ne change aucun besoin de visite');
  treated=new Set(['a','b','c','d']);

  // Nouvel import : le compte repart de zéro, le P1 à 2 visites redevient éligible.
  imported='2026-09-27T08:00:00Z';
  assert.equal(need('d').blocked,false,'nouveau fichier performance : le P1 doit de nouveau 2 passages');
  imported='2026-09-21T08:00:00Z';

  // Mes magasins lit la même priorité.
  const p=X.profileFor(state,'a',{today});
  assert.equal(p.priority,'P1');
  const lc=X.listContext({state,today});
  assert.equal(X.counts(lc.ctx).priority.P1,4,'a, c, d et e ; b est P2');

  // Aucun consommateur ne retire plus la priorité d'un magasin traité.
  const read=f=>fs.readFileSync(__dirname+'/../'+f,'utf8');
  const planning=read('performance-data-v190.js'),pb=planning.slice(planning.indexOf('function planningBoost'),planning.indexOf('const api={STORE_KEY'));
  assert.doesNotMatch(pb,/isTreated\(/,'planningBoost ne neutralise plus un magasin traité');
  const brief=read('weekly-brief-v246.js');assert.match(brief,/const perfRaw=prio\?/,'le brief hebdo garde le coup de pouce P1/P2');
  const range=read('range-planner-v2.js'),v211=range.slice(range.indexOf('function performancePriorityV211'),range.indexOf('/* Brief hebdomadaire V246'));
  assert.doesNotMatch(v211,/isTreated/,'V211 garde P1/P2 d’un magasin traité');
  assert.doesNotMatch(read('visit-coverage.js').slice(read('visit-coverage.js').indexOf('function performancePriorities'),read('visit-coverage.js').indexOf('function context(')),/isTreated/);
  console.log('p1-treated-priority-v266: OK');
}finally{
  globalThis.__chefStorage=SAVED.db;globalThis.StoreRunnerPerformanceV190=SAVED.perf;
  if(SAVED.db===undefined)delete globalThis.__chefStorage;if(SAVED.perf===undefined)delete globalThis.StoreRunnerPerformanceV190;
}
