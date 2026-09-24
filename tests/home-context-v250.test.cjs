const assert=require('assert/strict');
const home=require('../home-refresh-v2.js');

function store(id,enseigne,ville){return{id,enseigne,ville}}
function emptyPlan(){return{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}

const a=store('a','Darty','Lyon');
const b=store('b','Boulanger','Villefranche');
const c=store('c','Darty','Bourgoin');
const mondayPlan=emptyPlan();
mondayPlan.Mercredi=[a,b];
const nextWeek=emptyPlan();
nextWeek.Lundi=[c];

const state={
  stores:[a,b,c],
  settings:{weekDate:'2026-09-21'},
  plan:mondayPlan,
  businessV2:{storeSnapshots:{}}
};
const archive={
  '2026-09-28':{weekMonday:'2026-09-28',plan:nextWeek}
};

// Mercredi 23/09 à 18 h : tant qu'une visite reste, l'accueil reste sur Aujourd'hui.
let now=new Date('2026-09-23T18:00:00');
let today={date:'2026-09-23',day:'Mercredi',route:[a,b],total:2,done:1,remaining:1,finished:false};
let ctx=home.buildHomeContext(state,now,today,archive);
assert.equal(ctx.mode,'today');
assert.equal(ctx.title,'Aujourd’hui.');
assert.equal(ctx.pendingToday,1);

// La même journée terminée bascule immédiatement sur la prochaine journée planifiée.
today={date:'2026-09-23',day:'Mercredi',route:[a,b],total:2,done:2,remaining:0,finished:true};
ctx=home.buildHomeContext(state,now,today,archive);
assert.equal(ctx.mode,'next');
assert.equal(ctx.next.date,'2026-09-28');
assert.equal(ctx.title,'Lundi.');
assert.equal(ctx.pendingToday,0);
assert.deepEqual(ctx.next.route.map(s=>s.id),['c']);

// Après 20 h, on prépare la suite même si une visite du jour est encore en attente.
now=new Date('2026-09-23T21:15:00');
today={date:'2026-09-23',day:'Mercredi',route:[a,b],total:2,done:1,remaining:1,finished:false};
ctx=home.buildHomeContext(state,now,today,archive);
assert.equal(ctx.mode,'next');
assert.equal(ctx.next.date,'2026-09-28');
assert.equal(ctx.pendingToday,1);

// Le moteur ne suppose pas « demain » : il saute les journées vides et le week-end.
const fridayState={stores:[a,b,c],settings:{weekDate:'2026-09-21'},plan:emptyPlan(),businessV2:{storeSnapshots:{}}};
fridayState.plan.Vendredi=[a];
ctx=home.buildHomeContext(fridayState,new Date('2026-09-25T21:00:00'),{date:'2026-09-25',day:'Vendredi',route:[a],total:1,done:1,remaining:0,finished:true},archive);
assert.equal(ctx.next.date,'2026-09-28');
assert.equal(ctx.title,'Lundi.');

// Si demain est réellement planifié, le titre utilisateur devient « Demain. ».
const thursdayPlan=emptyPlan();thursdayPlan.Jeudi=[a];thursdayPlan.Vendredi=[b];
const thursdayState={stores:[a,b],settings:{weekDate:'2026-09-21'},plan:thursdayPlan,businessV2:{storeSnapshots:{}}};
ctx=home.buildHomeContext(thursdayState,new Date('2026-09-24T20:30:00'),{date:'2026-09-24',day:'Jeudi',route:[a],total:1,done:1,remaining:0,finished:true},{});
assert.equal(ctx.next.date,'2026-09-25');
assert.equal(ctx.title,'Demain.');

console.log('V250 accueil contextuel : OK');
