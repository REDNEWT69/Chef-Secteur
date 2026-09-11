const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
const archive={
  '2026-09-07':{weekMonday:'2026-09-07',plan:{Lundi:[{id:'d1',enseigne:'Darty',ville:'Lyon'}],Mardi:[{id:'c1',enseigne:'Carrefour',ville:'Bron'}],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}},
  '2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[{id:'b1',enseigne:'Boulanger',ville:'Saint-Priest'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}
};
const state={settings:{visitCreditsByBrand:{fnac:3}},stores:[],plan:{Lundi:[{id:'d1',enseigne:'Darty'},{id:'b1',enseigne:'Boulanger'},{id:'c1',enseigne:'Carrefour'}]},visits:{}};
const listeners={};
const ctx={state,console,Date,Map,Set,RegExp,JSON,Object,Array,String,Number,Math,setTimeout,requestAnimationFrame:fn=>fn(),localStorage:{getItem:key=>key==='chef_sector_plan_archive_v1'?JSON.stringify(archive):null,setItem(){},removeItem(){}},document:{readyState:'loading',addEventListener:(name,fn)=>{listeners[name]=fn},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},CustomEvent:class{}};
ctx.window=ctx;vm.runInNewContext(source,ctx);
const V=ctx.StoreVisitCounting;
assert(V,'le module de comptage doit exposer son API de test');
assert.equal(V.credit({enseigne:'Darty'}),2,'Darty doit compter pour deux visites');
assert.equal(V.credit({enseigne:'Boulanger'}),2,'Boulanger doit compter pour deux visites');
assert.equal(V.credit({enseigne:'Carrefour'}),2,'Carrefour doit compter pour deux visites');
assert.equal(V.credit({enseigne:'Fnac'}),3,'une règle ajoutée ultérieurement doit être prise en compte sans modifier le moteur');
assert.equal(V.credit({enseigne:'Leclerc'}),1,'une enseigne non confirmée reste à une visite');
assert.equal(V.planStores(state.plan),3,'les trois arrêts restent trois magasins physiques');
assert.equal(V.planCredits(state.plan),6,'Darty + Boulanger + Carrefour doivent produire six visites comptabilisées');
const candidate={plan:state.plan,weekDate:'2026-09-07',archive,range:{start:'2026-09-07',end:'2026-09-08',weeks:1,totalVisits:2,uniqueStores:2}};
V.normalizeCandidate(candidate);
assert.equal(candidate.storeCount,3,'la proposition hebdomadaire doit conserver le nombre physique de magasins');
assert.equal(candidate.visitCredits,6,'la proposition hebdomadaire doit porter le nombre métier de visites');
assert.equal(candidate.range.totalStores,2,'la période testée contient deux magasins physiques');
assert.equal(candidate.range.totalVisits,4,'la période testée vaut quatre visites métier : Darty x2 + Carrefour x2');
assert.equal(candidate.range.uniqueStores,2);
const month=V.monthArchiveStats(2026,8);
assert.equal(month.stores,3,'septembre doit contenir trois passages physiques dans l’archive de test');
assert.equal(month.visits,6,'septembre doit compter six visites métier');
assert.doesNotMatch(source,/visitMinutes\s*=/,'le double comptage ne doit jamais doubler la durée de visite');
assert.match(source,/darty:2,boulanger:2,carrefour:2/,'Darty, Boulanger et Carrefour doivent être les trois règles par défaut');
console.log('PASS: Darty, Boulanger et Carrefour comptent chacun pour deux visites métier, les autres restent à une visite, les arrêts physiques et durées restent séparés, et les règles sont extensibles.');
