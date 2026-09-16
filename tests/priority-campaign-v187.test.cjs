const fs=require('fs');
const vm=require('vm');
const assert=require('assert/strict');
const source=fs.readFileSync('priority-campaign-v187.js','utf8');

const memory=new Map();
const storage={getItem(k){return memory.has(k)?memory.get(k):null},setItem(k,v){memory.set(k,String(v))},removeItem(k){memory.delete(k)},flush(){return Promise.resolve()}};
/* Magasins entièrement inventés : le dépôt est public. Les coordonnées relatives sont
   conservées telles quelles, c'est la géométrie qui est testée, pas les villes. */
const stores=[
 {id:'m1',enseigne:'Boulanger',sourceName:'BOULANGER VILLE-UN',ville:'Ville-Un',x:-150,y:0},
 {id:'m2',enseigne:'Boulanger',sourceName:'BOULANGER VILLE-DEUX',ville:'Ville-Deux',x:150,y:20},
 {id:'m3',enseigne:'Boulanger',sourceName:'BOULANGER VILLE-TROIS',ville:'Ville-Trois',x:100,y:0},
 {id:'m4',enseigne:'Boulanger',sourceName:'BOULANGER VILLE-QUATRE',ville:'Ville-Quatre',x:0,y:-95},
 {id:'m5',enseigne:'Boulanger',sourceName:'BOULANGER VILLE-CINQ',ville:'Ville-Cinq',x:-55,y:-20},
 {id:'m6',enseigne:'Auchan',sourceName:'AUCHAN VILLE-SIX',ville:'Ville-Six',x:15,y:0},
 {id:'m7',enseigne:'BUT',sourceName:'BUT VILLE-SIX',ville:'Ville-Six',x:15,y:0}
];
/* La campagne est vide par défaut depuis la V190 : le test installe la sienne, inventée,
   pour continuer à exercer la logique de réorganisation. */
const CIBLES=[
 {key:'boulanger-un',brand:'Boulanger',label:'Boulanger Ville-Un',aliases:['ville un'],order:1},
 {key:'boulanger-deux',brand:'Boulanger',label:'Boulanger Ville-Deux',aliases:['ville deux'],order:2},
 {key:'boulanger-trois',brand:'Boulanger',label:'Boulanger Ville-Trois',aliases:['ville trois'],order:3},
 {key:'boulanger-quatre',brand:'Boulanger',label:'Boulanger Ville-Quatre',aliases:['ville quatre'],order:4},
 {key:'boulanger-cinq',brand:'Boulanger',label:'Boulanger Ville-Cinq',aliases:['ville cinq'],order:5},
 {key:'auchan-six',brand:'Auchan',label:'Auchan Ville-Six',aliases:['ville six'],order:6,creditedDate:'2026-09-14'},
 {key:'but-six',brand:'BUT',label:'BUT Ville-Six',aliases:['ville six'],order:7,creditedDate:'2026-09-15'}
];
const state={
 settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00'},
 stores,plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
 visits:{m6:{lastVisit:'2026-09-14',history:['2026-09-14']}},
 businessV2:{storeSnapshots:{},visits:[]},locks:{},appointments:[],profile:{overnightMinSaving:80}
};
const document={readyState:'complete',addEventListener(){},dispatchEvent(){},getElementById(){return null},querySelector(){return null}};
function dist(a,b){return Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0))}
function home(store){return Math.hypot(store.x||0,store.y||0)}
function routeKm(route){
 if(!route.length)return 0;
 let km=home(route[0]);
 for(let i=1;i<route.length;i++)km+=dist(route[i-1],route[i]);
 km+=home(route[route.length-1]);
 return km;
}
const ctx={console,state,document,__chefStorage:storage,localStorage:storage,CustomEvent:function(type,o){this.type=type;this.detail=o&&o.detail},setTimeout(){return 0},save(){},renderAll(){},
 storeVisitCredit(store){return store&&store.enseigne==='Boulanger'?3:1},
 routeWorkMinutes(route){return route.length*60+routeKm(route)*1.22/55*60},
 StoreOpeningHoursV1:{routeFits(route){return route.length<=2}},
 StoreRunnerGeographyV185:{routeKm,homeDistance:home},
 hav:dist,
 nearestRoute(route){return route.slice().sort((a,b)=>home(a)-home(b))},
 twoOpt(route){return route.slice()}
};
ctx.window=ctx;
vm.runInNewContext(source,ctx);
const api=ctx.StoreRunnerPriorityCampaignV188;
assert(api,'API V188 absente');
api.setCampaignTargets(CIBLES);
assert.equal(api.campaign.targets.length,7);
assert.equal(api.completionDate(api.campaign.targets.find(t=>t.key==='auchan-six')),'2026-09-14');
assert.equal(api.completionDate(api.campaign.targets.find(t=>t.key==='but-six')),'2026-09-15');
const result=api.apply({today:'2026-09-16T12:38:00',render:false,emit:false});
assert.equal(result.ok,true);
assert.equal(result.startDate,'2026-09-17','à 12h38 le moteur doit planifier à partir du lendemain');
assert.equal(result.done,2);
assert.equal(result.planned,5);
assert.equal(result.pending,0);
assert.equal(result.unresolved.length,0);
assert.equal(result.overflowDays.length,1,'5 Boulanger sur 4 jours imposent exactement une journée double');
assert.ok(result.overnight,'un découché utile doit être trouvé');
assert.deepEqual(new Set([result.overnight.fromStore.id,result.overnight.toStore.id]),new Set(['m3','m2']),'Chambéry et Annemasse doivent former le bloc de découché');

const archive=JSON.parse(storage.getItem('chef_sector_plan_archive_v1'));
const plans={'2026-09-14':state.plan,'2026-09-21':archive['2026-09-21'].plan};
const dates={};
let doubles=0;
for(const [weekKey,plan] of Object.entries(plans)){
 const mon=new Date(weekKey+'T12:00:00');
 for(let i=0;i<5;i++){
  const day=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'][i],date=new Date(mon);date.setDate(mon.getDate()+i);
  const ds=date.toISOString().slice(0,10);
  const boul=(plan[day]||[]).filter(s=>s.enseigne==='Boulanger');
  if(boul.length===2)doubles++;
  for(const s of boul)dates[s.id]=ds;
 }
}
assert.equal(doubles,1);
for(const id of ['m1','m2','m3','m4','m5'])assert.ok(dates[id]>='2026-09-17'&&dates[id]<='2026-09-22',id+' doit être planifié du 17 au 22');
assert.ok(!Object.values(plans).flatMap(p=>Object.values(p)).flat().some(s=>s.id==='m6'||s.id==='m7'));
console.log('priority-campaign-v188: OK', result.overflowDays, result.overnight.fromDate, result.overnight.toDate);
