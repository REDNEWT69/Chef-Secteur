const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
const archive={
  '2026-09-07':{weekMonday:'2026-09-07',plan:{Lundi:[{id:'d1',enseigne:'Darty',ville:'Ville-Test A'}],Mardi:[{id:'c1',enseigne:'Carrefour',ville:'Ville-Test B'}],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}},
  '2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[{id:'b1',enseigne:'Boulanger',ville:'Ville-Test C'}],Mardi:[{id:'d2',enseigne:'Darty',ville:'Ville-Test A'}],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}
};
const range={start:'2026-09-07',end:'2026-09-20',weeks:2,totalStores:999,totalVisits:999,uniqueStores:999};
const storageData={chef_sector_plan_archive_v1:JSON.stringify(archive),chef_sector_range_v1:JSON.stringify(range)};
const state={settings:{visitCreditsByBrand:{fnac:3}},stores:[],plan:{Lundi:[{id:'d1',enseigne:'Darty'},{id:'b1',enseigne:'Boulanger'},{id:'c1',enseigne:'Carrefour'}]},visits:{}};
const listeners={};
const localStorage={getItem:key=>Object.prototype.hasOwnProperty.call(storageData,key)?storageData[key]:null,setItem(key,value){storageData[key]=String(value)},removeItem(key){delete storageData[key]}};
const ctx={state,console,Date,Map,Set,RegExp,JSON,Object,Array,String,Number,Math,setTimeout,requestAnimationFrame:fn=>fn(),localStorage,document:{readyState:'loading',addEventListener:(name,fn)=>{listeners[name]=fn},getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},CustomEvent:class{}};
ctx.window=ctx;vm.runInNewContext(source,ctx);
const V=ctx.StoreVisitCounting;
assert(V,'le module de comptage doit exposer son API de test');
assert.equal(V.credit({enseigne:'Darty'}),2,'Darty doit compter pour deux visites par défaut');
assert.equal(V.credit({enseigne:'Boulanger'}),2,'Boulanger doit compter pour deux visites par défaut');
assert.equal(V.credit({enseigne:'BUT'}),2,'BUT doit compter pour deux visites par défaut');
assert.equal(V.credit({enseigne:'Conforama'}),2,'Conforama doit compter pour deux visites par défaut');
assert.equal(V.credit({enseigne:'Carrefour'}),1,'Carrefour doit compter pour une visite par défaut en V189');
assert.equal(V.credit({enseigne:'Fnac'}),3,'une règle ajoutée ultérieurement doit être prise en compte sans modifier le moteur');
assert.equal(V.credit({enseigne:'Leclerc'}),1,'une enseigne non confirmée reste à une visite');
assert.equal(V.credit({enseigne:'Carrefour',visitCreditOverride:2}),2,'un Carrefour précis doit pouvoir être réglé à deux visites');
assert.equal(V.credit({enseigne:'Darty',visitCreditOverride:1}),1,'un Darty précis doit pouvoir être réglé à une visite');
assert.equal(V.routeCredits([{enseigne:'BUT'},{enseigne:'Conforama'}]),4,'BUT + Conforama doivent produire quatre visites comptabilisées pour deux passages physiques');
assert.equal(V.planStores(state.plan),3,'les trois arrêts restent trois magasins physiques');
assert.equal(V.planCredits(state.plan),5,'Darty + Boulanger + Carrefour doivent produire cinq visites métier avec Carrefour simple');
const tenStoresPlan={Lundi:[
  {id:'d1',enseigne:'Darty'},{id:'d2',enseigne:'Darty'},{id:'d3',enseigne:'Darty'},{id:'d4',enseigne:'Darty'},
  {id:'d5',enseigne:'Darty'},{id:'d6',enseigne:'Darty'},{id:'d7',enseigne:'Darty'},
  {id:'s1',enseigne:'Carrefour'},{id:'s2',enseigne:'Leclerc'},{id:'s3',enseigne:'Carrefour'}
],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
assert.equal(V.planStores(tenStoresPlan),10,'dix magasins planifiés restent dix passages physiques');
assert.equal(V.planCredits(tenStoresPlan),17,'sept magasins x2 + trois magasins x1 doivent afficher dix-sept visites comptabilisées');
const candidate={plan:state.plan,weekDate:'2026-09-07',archive,range:{start:'2026-09-07',end:'2026-09-08',weeks:1,totalVisits:2,uniqueStores:2}};
V.normalizeCandidate(candidate);
assert.equal(candidate.storeCount,3,'la proposition hebdomadaire doit conserver le nombre physique de magasins');
assert.equal(candidate.visitCredits,5,'la proposition hebdomadaire doit porter le nombre métier de visites');
assert.equal(candidate.range.totalStores,2,'la période testée contient deux magasins physiques');
assert.equal(candidate.range.totalVisits,3,'la période testée vaut trois visites métier : Darty x2 + Carrefour x1');
assert.equal(candidate.range.uniqueStores,2);
const reconciled=V.reconcileStoredRangeStats();
assert(reconciled,'le recalcul de période doit retourner les statistiques persistées');
assert.equal(reconciled.totalStores,4,'les quatre passages physiques doivent rester comptés');
assert.equal(reconciled.totalVisits,7,'Darty + Carrefour + Boulanger + Darty doivent valoir sept visites métier');
assert.equal(reconciled.uniqueStores,3,'deux IDs du même Darty Ville-Test A doivent compter pour un seul magasin physique distinct');
const persistedRange=JSON.parse(storageData.chef_sector_range_v1);
assert.equal(persistedRange.totalStores,4);
assert.equal(persistedRange.totalVisits,7);
assert.equal(persistedRange.uniqueStores,3);
assert.equal(persistedRange.visitCreditRules.carrefour,1,'la période persistée doit publier Carrefour x1 par défaut');
assert.equal(persistedRange.visitCreditRules.but,2,'la période persistée doit publier la règle BUT x2');
assert.equal(persistedRange.visitCreditRules.conforama,2,'la période persistée doit publier la règle Conforama x2');
const month=V.monthArchiveStats(2026,8);
assert.equal(month.stores,4,'septembre doit contenir quatre passages physiques dans l’archive de test');
assert.equal(month.visits,7,'septembre doit compter sept visites métier');
assert.equal(month.uniqueStores,3,'les statistiques mensuelles doivent dédupliquer un même magasin physique malgré un nouvel ID');
const idOnlyArchive={'2026-09-07':{weekMonday:'2026-09-07',plan:{Lundi:[{id:'u1'},{id:'u2'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}};
assert.equal(V.archiveStats(idOnlyArchive,'2026-09-07','2026-09-07').uniqueStores,2,'sans enseigne, ville ni adresse, deux IDs différents doivent rester deux magasins distincts');
assert.doesNotMatch(source,/visitMinutes\s*=/,'le double comptage ne doit jamais doubler la durée de visite');
assert.match(source,/darty:2,boulanger:2,but:2,conforama:2/,'Darty, Boulanger, BUT et Conforama restent les règles doubles par défaut');
assert.doesNotMatch(source,/DEFAULT_RULES=\{[^}]*carrefour:2/,'Carrefour ne doit plus être codé en dur à deux visites');
assert.match(source,/visitCreditOverride/,'le comptage doit accepter un choix propre à chaque magasin');
assert.match(source,/actual<=1\|\|!isBoulanger/,'un Boulanger réglé à une visite ne doit pas garder une capacité cachée de magasin double');
assert.match(source,/detail\.reason==='day-store-recenter'/,'le recalcul de période doit rester ciblé sur un recentrage manuel');
assert.doesNotMatch(source,/observe\(document\.body/,'le module de comptage ne doit jamais observer tout document.body');
assert.match(source,/OBSERVED_UI_IDS=\['summary','smartBrief','premiumHomeV2','proMonthBody','storeQuickSheet'\]/,'les zones observées doivent rester explicitement limitées aux vues de comptage utiles');
assert.match(source,/attributeFilter:\['class','aria-hidden','data-sr-start'\]/,'la fiche rapide doit rester rafraîchie quand le magasin affiché change');
assert.match(source,/\.phCard\[data-home-card="week"\]/,'l’accueil doit corriger la carte Cette semaine elle-même, pas la première carte arbitraire');
assert.doesNotMatch(source,/premiumHomeV2 \.phGrid \.phCard:first-child/,'une priorité ou opportunité classée avant la semaine ne doit jamais être écrasée par le compteur');
assert.match(source,/stats\.visits\+' visites comptabilisées'/,'la carte semaine doit afficher explicitement les crédits de visite');
console.log('PASS: V189 donne la main par magasin, Carrefour vaut 1 par défaut et les statistiques suivent les crédits réels.');
