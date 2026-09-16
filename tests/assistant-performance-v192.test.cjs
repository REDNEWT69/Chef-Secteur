const assert=require('node:assert/strict');
const fs=require('fs');

class DB{getItem(){return null}setItem(){}}
const db=new DB();
const stores=[];
for(let i=1;i<=15;i++)stores.push({id:'s'+i,enseigne:i===1?'Boulanger':'Darty',ville:i===1?'Lyon Test':'Ville '+i,priority:i===1?'manual':'normal'});
const row=(i,prio,treated=false)=>({
  storeId:'s'+i,store:stores[i-1],retailer:stores[i-1].enseigne,site:stores[i-1].ville,prio,treated:treated?{at:'2026-09-16'}:null,
  pdmYtd:i===15?null:30+i,deltaYtd:i===15?null:(30+i-42.5),evolYtd:i%2?-2:3,
  weekly:{direction:i%2?'baisse':'hausse',delta:i%2?-3:2,volatile:false,points:[{week:'W33',value:35},{week:'W34',value:32}]},
  status:i===15?{label:'Pas de PDM dans le fichier',underTarget:null,gap:null}:{label:30+i<42.5?'Sous la cible YTD':'Au-dessus de la cible YTD',underTarget:30+i<42.5,gap:30+i-42.5},
  sellOutYtd:-100*i,sellOutWeeks:{W34:-10*i},visits:i===2?{lastVisit:'2026-09-15',count:2}:null,
  comment:i===1?'Revoir la visibilité OLED':''
});
const rows=[row(1,'P1',true),row(2,'P1'),row(3,'P1'),row(4,'P2'),row(5,'P2'),row(6,'P2'),row(7,'P2'),row(8,'P2'),row(9,'P2'),row(10,'P2'),row(11,'P2'),row(12,'P2'),row(13,'P2'),row(14,'watch'),row(15,'nodata')];
let hasSnapshot=false;
const view={week:'W34',targetPdm:42.5,counts:{P1:3,P2:10,watch:1,nodata:1,unmatched:0},rows};
global.state={stores,plan:{Lundi:[stores[1],stores[3]],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[]},businessV2:{visits:[],actions:[]}};
global.__chefStorage=db;
global.StoreRunnerPerformanceV190={latestSnapshot(){return hasSnapshot?{week:'W34'}:null},dashboard(){return view},completedVisitsFor(){return null}};
let resolver=null,transform=null;
global.storeRunnerRegisterAssistantResolver=(fn,priority)=>{resolver={fn,priority};return true};
global.storeRunnerRegisterAssistantContextTransform=(fn,priority)=>{transform={fn,priority};return true};
const A=require('../assistant-performance-context-v192.js');

// 1. Sans snapshot : rien n'est inventé.
const base={hello:'world'};assert.strictEqual(A.compactContext(base),base);assert.equal(A.answer('top 5 magasins'),null);

hasSnapshot=true;
// 2. Contexte compact, enregistré sur les hooks existants.
assert.equal(resolver.priority,20);assert.equal(transform.priority,70);
const ctx=A.compactContext({hello:'world'});
assert.equal(ctx.performanceV192.week,'W34');assert.equal(ctx.performanceV192.targetPdm,42.5);
assert.ok(ctx.performanceV192.stores.length<=12,'le contexte performance est plafonné à 12 magasins');
assert.equal(ctx.performanceV192.rules.primaryStatus,'YTD');
assert.match(ctx.performanceV192.rules.weeklyTrend,/indicative/i);
assert.ok(!JSON.stringify(ctx).match(/PK\u0003\u0004|sharedStrings\.xml|workbook\.xml|\.xlsx/i),'aucun contenu de classeur brut dans le contexte');

// 3-4. P1 non traité avant P2 ; traité exclu du top.
const top=A.answer('Quels sont les 5 magasins à travailler en priorité ?');
assert.match(top,/Darty Ville 2/);assert.match(top,/Darty Ville 3/);assert.doesNotMatch(top,/Boulanger Lyon Test/,'le P1 traité ne doit pas revenir dans le top');
assert.ok(top.indexOf('Darty Ville 2')<top.indexOf('Darty Ville 4'),'un P1 non traité précède un P2');

// 5-7. YTD principal, hebdo indicative, aucune causalité.
const detail=A.answer('Pourquoi Darty Ville 2 est prioritaire ?');
assert.match(detail,/PDM YTD 32/);assert.match(detail,/tendance hebdo/i);assert.match(detail,/indicative/i);
assert.doesNotMatch(detail,/a fait (monter|baisser)|grâce à la visite|à cause de la visite/i);

// 8. Mission/commentaire transmis et tips prudents.
const treatedDetail=A.answer('donne moi des tips pour Boulanger Lyon Test');
assert.match(treatedDetail,/Mission : Revoir la visibilité OLED/);assert.match(treatedDetail,/Pistes à vérifier/);
assert.match(treatedDetail,/Vérifier sur place|Mission du fichier/);

// 9. Le module n'a aucun lecteur réseau/binaire de classeur.
const src=fs.readFileSync(__dirname+'/../assistant-performance-context-v192.js','utf8');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|FileReader|JSZip|sharedStrings/.test(src),'le pont ne relit ni n’envoie le XLSX');

// 10. Poser des questions ne modifie ni planning ni store.priority.
const beforePlan=JSON.stringify(global.state.plan),beforeStores=JSON.stringify(global.state.stores);
A.answer('Quels P1 restent à traiter ?');A.answer('Quels magasins sont sous la cible ?');A.answer('donne moi des tips pour Darty Ville 2');A.compactContext({});
assert.equal(JSON.stringify(global.state.plan),beforePlan);assert.equal(JSON.stringify(global.state.stores),beforeStores);

// 11. Réponse locale top 5.
assert.match(top,/À travailler en priorité W34/);assert.ok(top.split('\n').length>=3);

// 12. Réponse magasin précis et donnée manquante explicite.
const noData=A.answer('Pourquoi Darty Ville 15 est prioritaire ?');
assert.match(noData,/PDM YTD indisponible/);

// 13. P1 restants et sous cible.
const p1=A.answer('Quels P1 restent non traités ?');assert.doesNotMatch(p1,/Lyon Test/);assert.match(p1,/Ville 2/);
const under=A.answer('Quels magasins sont sous la cible ?');assert.match(under,/cible YTD 42,5 %/);

console.log('assistant-performance-v192: OK · contexte compact · YTD principal · top local · lecture seule');
