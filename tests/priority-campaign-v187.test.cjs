const fs=require('fs');
const vm=require('vm');
const assert=require('assert/strict');
const source=fs.readFileSync('priority-campaign-v187.js','utf8');

const memory=new Map();
const storage={getItem(k){return memory.has(k)?memory.get(k):null},setItem(k,v){memory.set(k,String(v))},removeItem(k){memory.delete(k)},flush(){return Promise.resolve()}};
const stores=[
 {id:'aub',enseigne:'Boulanger',sourceName:'BOULANGER AUBIERE / Clermont',ville:'Aubière',x:160},
 {id:'ann',enseigne:'Boulanger',sourceName:'BOULANGER ANNEMASSE',ville:'Annemasse',x:150},
 {id:'cha',enseigne:'Boulanger',sourceName:'BOULANGER CHAMBERY',ville:'Chambéry',x:100},
 {id:'val',enseigne:'Boulanger',sourceName:'BOULANGER VALENCE',ville:'Valence',x:95},
 {id:'vil',enseigne:'Boulanger',sourceName:'BOULANGER VILLARS / St Etienne',ville:'Villars',x:55},
 {id:'auc',enseigne:'Auchan',sourceName:'AUCHAN SAINT PRIEST',ville:'Saint-Priest',x:15},
 {id:'but',enseigne:'BUT',sourceName:'BUT LYON SAINT PRIEST',ville:'Saint-Priest',x:15}
];
const state={
 settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00'},
 stores,plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
 visits:{auc:{lastVisit:'2026-09-14',history:['2026-09-14']}},
 businessV2:{storeSnapshots:{},visits:[]},locks:{},appointments:[]
};
const document={readyState:'complete',addEventListener(){},dispatchEvent(){},getElementById(){return null},querySelector(){return null}};
const ctx={console,state,document,__chefStorage:storage,localStorage:storage,CustomEvent:function(type,o){this.type=type;this.detail=o&&o.detail},setTimeout(){return 0},save(){},renderAll(){},storeVisitCredit(store){return store&&store.enseigne==='Boulanger'?3:1},routeWorkMinutes(route){return route.length*60},StoreOpeningHoursV1:{routeFits(){return true}},StoreRunnerGeographyV185:{routeKm(route){return route.reduce((n,s)=>n+Number(s.x||0),0)}},nearestRoute(route){return route.slice()},twoOpt(route){return route.slice()}};
ctx.window=ctx;
vm.runInNewContext(source,ctx);
const api=ctx.StoreRunnerPriorityCampaignV187;
assert(api,'API V187 absente');
assert.equal(api.campaign.targets.length,7);
assert.equal(api.completionDate(api.campaign.targets.find(t=>t.key==='auchan-saint-priest')),'2026-09-14','la visite Auchan enregistrée doit valider la priorité');
assert.equal(api.completionDate(api.campaign.targets.find(t=>t.key==='but-saint-priest')),'2026-09-15','la visite BUT signalée par Redouane doit valider la priorité même sans ancien enregistrement');
const result=api.apply({today:'2026-09-16',render:false,emit:false});
assert.equal(result.ok,true);
assert.equal(result.done,2,'deux P1 sont déjà réalisées');
assert.equal(result.planned,5,'les cinq Boulanger restants doivent être planifiés');
assert.equal(result.pending,0,'aucun P1 résolu ne doit rester sans date avant le 22/09');
assert.deepEqual(result.unresolved,[]);

const archive=JSON.parse(storage.getItem('chef_sector_plan_archive_v1'));
const allPlans={'2026-09-14':state.plan,'2026-09-21':archive['2026-09-21'].plan};
const priorityDates={};
for(const [weekKey,plan] of Object.entries(allPlans)){
 const mon=new Date(weekKey+'T12:00:00');
 for(let i=0;i<5;i++){
  const day=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'][i],date=new Date(mon);date.setDate(mon.getDate()+i);const iso=date.toISOString().slice(0,10);
  const boul=(plan[day]||[]).filter(s=>s.enseigne==='Boulanger');
  assert.ok(boul.length<=1,'la capacité planning ne doit pas placer deux Boulanger le même jour');
  for(const s of boul)priorityDates[s.id]=iso;
 }
}
for(const id of ['aub','ann','cha','val','vil'])assert.ok(priorityDates[id]&&priorityDates[id]>='2026-09-16'&&priorityDates[id]<='2026-09-22',id+' doit être planifié avant mercredi 23');
assert.equal((allPlans['2026-09-21'].Lundi||[]).filter(s=>s.enseigne==='Boulanger').length,1,'le lundi suivant doit absorber un P1 faute de capacité cette semaine');
assert.equal((allPlans['2026-09-21'].Mardi||[]).filter(s=>s.enseigne==='Boulanger').length,1,'le mardi suivant doit absorber le dernier P1 avant l’échéance');
assert.ok(!Object.values(allPlans).flatMap(p=>Object.values(p)).flat().some(s=>s.id==='auc'||s.id==='but'),'les deux magasins déjà visités ne doivent pas être reprogrammés');
console.log('priority-campaign-v187: OK · 2/7 réalisées, 5/7 forcées avant le 22/09');
