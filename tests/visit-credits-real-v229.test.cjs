/* V229 — comptage réel des visites.

   Bug terrain : la carte semaine affichait « 10 visites » pour 10 magasins physiques dont
   7 Darty, alors que le total métier est 17. Cause : un élément de state.plan n'est pas
   toujours une copie complète du magasin — il peut être réduit à { id }. Le crédit était
   lu sur cette copie, qui n'a ni enseigne ni override, donc 1 par magasin.

   Le crédit se lit désormais sur le magasin canonique de state.stores.

   Toutes les fixtures sont synthétiques : enseignes génériques, villes inventées. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

const COUNTING=fs.readFileSync(__dirname+'/../visit-counting.js','utf8');
const CONTROLS=fs.readFileSync(__dirname+'/../auto-planning-fix.js','utf8');

// ---------------------------------------------------------------- DOM minimal de test
function makeEl(tag,id){
  const el={tagName:String(tag||'div').toUpperCase(),id:id||'',style:{},dataset:{},children:[],
    value:'',textContent:'',innerHTML:'',previousElementSibling:null,hidden:false,
    appendChild(c){el.children.push(c);return c},
    insertBefore(c){el.children.unshift(c);return c},
    insertAdjacentElement(_,c){el.children.push(c);return c},
    remove(){},setAttribute(){},getAttribute(){return null},addEventListener(){},
    querySelector(){return null},querySelectorAll(){return[]},
    classList:{add(){},remove(){},contains(){return false},toggle(){}}};
  return el;
}

function env(options){
  const opts=options||{};
  const reg={},listeners={};
  const put=(tag,id)=>{const e=makeEl(tag,id);reg[id]=e;return e};

  /* La carte semaine de l'accueil, désignée par son rôle et non par sa position. */
  const weekValue=makeEl('div'),weekSub=makeEl('div'),weekCard=makeEl('div');
  weekCard.querySelector=sel=>sel==='.phValue'?weekValue:sel==='.phSub'?weekSub:null;

  const summary=put('div','summary');
  const spans=[makeEl('span'),makeEl('span')];
  summary.querySelectorAll=sel=>sel==='span'?spans:[];

  /* La fiche magasin : le sélecteur de règle existe déjà, ensureStoreRulesUi() n'a donc
     rien à construire et le test exerce fillStoreRules() et le wrapper de sauvegarde. */
  put('div','storeDlg');put('textarea','fNote');put('section','srStoreRulesV189');
  const select=put('select','fVisitCreditOverride');

  const storageData=Object.assign({},opts.storage||{});
  const localStorage={
    getItem:k=>Object.prototype.hasOwnProperty.call(storageData,k)?storageData[k]:null,
    setItem(k,v){storageData[k]=String(v)},removeItem(k){delete storageData[k]}
  };

  const state={
    settings:Object.assign({target:10,visitMinutes:60},opts.settings||{}),
    stores:opts.stores||[],plan:opts.plan||{},visits:{},profile:{},
    included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]
  };

  const document={
    readyState:'loading',hidden:false,
    addEventListener(name,fn){(listeners[name]||(listeners[name]=[])).push(fn)},
    removeEventListener(){},
    getElementById:id=>reg[id]||null,
    querySelector(sel){
      if(sel==='#premiumHomeV2 .phGrid .phCard[data-home-card="week"]')return weekCard;
      return null;
    },
    querySelectorAll:()=>[],
    createElement:tag=>makeEl(tag),
    body:makeEl('body'),head:makeEl('head')
  };

  const saved=[];
  const ctx={
    console,Date,Map,Set,RegExp,JSON,Object,Array,String,Number,Math,Boolean,Error,
    setTimeout:fn=>{fn();return 0},clearTimeout(){},requestAnimationFrame:fn=>{fn();return 0},
    localStorage,document,state,
    CustomEvent:class{constructor(n,i){this.type=n;Object.assign(this,i||{})}},
    MutationObserver:class{observe(){}disconnect(){}},
    save(){saved.push('save')},
    renderStores(){},
    openStore(){},
    saveStore(){if(opts.onSaveStore)opts.onSaveStore(state)}
  };
  ctx.window=ctx;
  vm.runInNewContext(COUNTING,ctx);
  vm.runInNewContext(CONTROLS,ctx);
  const fire=name=>{for(const fn of (listeners[name]||[]))fn({})};
  fire('DOMContentLoaded');

  return{ctx,state,reg,select,weekValue,weekSub,spans,fire,storageData,saved,
    V:ctx.StoreVisitCounting,C:ctx.StoreRunnerStoreControlsV189};
}

// ------------------------------------- 1. Le bug réel : 10 magasins physiques, 17 visites
/* state.plan ne contient QUE les identifiants — exactement ce que produisaient certains
   chemins d'écriture du planning en production. */
const DIX_MAGASINS=[
  {id:'d1',enseigne:'Darty',ville:'Ville-Test A'},{id:'d2',enseigne:'Darty',ville:'Ville-Test B'},
  {id:'d3',enseigne:'Darty',ville:'Ville-Test C'},{id:'d4',enseigne:'Darty',ville:'Ville-Test D'},
  {id:'d5',enseigne:'Darty',ville:'Ville-Test E'},{id:'d6',enseigne:'Darty',ville:'Ville-Test F'},
  {id:'d7',enseigne:'Darty',ville:'Ville-Test G'},
  {id:'s1',enseigne:'Enseigne Simple',ville:'Ville-Test H'},
  {id:'s2',enseigne:'Enseigne Simple',ville:'Ville-Test I'},
  {id:'s3',enseigne:'Enseigne Simple',ville:'Ville-Test J'}
];
const PLAN_IDS={
  Lundi:[{id:'d1'},{id:'d2'},{id:'d3'}],
  Mardi:[{id:'d4'},{id:'d5'},{id:'d6'}],
  Mercredi:[{id:'d7'},{id:'s1'}],
  Jeudi:[{id:'s2'}],Vendredi:[{id:'s3'}],Samedi:[]
};

const reel=env({stores:DIX_MAGASINS,plan:PLAN_IDS,settings:{target:10}});
assert.equal(reel.V.planStores(reel.state.plan),10,
  'dix magasins planifiés restent dix magasins physiques');
assert.equal(reel.V.planCredits(reel.state.plan),17,
  'sept Darty x2 + trois magasins simples x1 = dix-sept visites comptabilisées, même quand state.plan ne porte que les identifiants');

/* Preuve que le correctif porte bien sur la résolution canonique : sans state.stores,
   les mêmes identifiants ne peuvent produire que dix crédits. C'est l'état d'avant. */
const sansCanonique=env({stores:[],plan:PLAN_IDS});
assert.equal(sansCanonique.V.planCredits(sansCanonique.state.plan),10,
  'sans magasin canonique, aucun crédit n’est inventé — c’est exactement le symptôme corrigé');

// ------------------------------------------------- 2. Chaque règle enseigne sur un partiel
const ENSEIGNES=[
  {id:'p-darty',enseigne:'Darty',attendu:2},
  {id:'p-boulanger',enseigne:'Boulanger',attendu:2},
  {id:'p-but',enseigne:'BUT',attendu:2},
  {id:'p-conforama',enseigne:'Conforama',attendu:2},
  {id:'p-carrefour',enseigne:'Carrefour',attendu:1},
  {id:'p-autre',enseigne:'Enseigne Simple',attendu:1}
];
const regles=env({stores:ENSEIGNES.map(x=>({id:x.id,enseigne:x.enseigne,ville:'Ville-Test'})),plan:{}});
for(const x of ENSEIGNES){
  assert.equal(regles.V.credit({id:x.id}),x.attendu,
    x.enseigne+' partiel doit compter '+x.attendu+' via son magasin canonique');
  assert.equal(regles.V.credit({id:x.id,enseigne:x.enseigne}),x.attendu,
    x.enseigne+' complet doit donner le même résultat que son partiel');
}

// ------------------------------------------------------- 3. Overrides explicites magasin
const OVERRIDES=[
  {id:'o-darty',enseigne:'Darty',ville:'Ville-Test',visitCreditOverride:1},
  {id:'o-simple',enseigne:'Enseigne Simple',ville:'Ville-Test',visitCreditOverride:2}
];
const over=env({stores:OVERRIDES,plan:{}});
assert.equal(over.V.credit({id:'o-darty'}),1,
  'un Darty réglé à 1 visite reste à 1, même lu depuis un élément partiel du planning');
assert.equal(over.V.credit({id:'o-simple'}),2,
  'un magasin simple réglé à 2 visites compte double, même lu depuis un élément partiel');
assert.equal(over.V.credit({id:'o-darty',enseigne:'Darty'}),1,
  'la copie du planning ne peut pas contredire l’override du magasin canonique');

// ---------------------------------------------- 4. Magasin canonique absent : aucun crash
const absent=env({stores:DIX_MAGASINS,plan:{Lundi:[{id:'inexistant-999'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}});
assert.equal(absent.V.credit({id:'inexistant-999'}),1,
  'un identifiant inconnu retombe sur un crédit sûr');
assert.equal(absent.V.credit({id:'inexistant-999',enseigne:'Darty'}),2,
  'sans magasin canonique, la copie du planning reste utilisée telle quelle');
assert.equal(absent.V.planCredits(absent.state.plan),1,'aucune exception sur un plan orphelin');
assert.equal(absent.V.credit(null),0,'un élément nul ne casse rien');
assert.equal(absent.V.credit(undefined),0,'un élément indéfini ne casse rien');
assert.equal(absent.V.planCredits(null),0,'un plan absent ne casse rien');
assert.equal(absent.V.credit({}),1,'un objet sans identifiant ne casse rien');

// ------------------------------------------------------ 5. Archives et stats de période
/* Les archives rejouent les mêmes copies partielles : leurs totaux doivent les résoudre
   aussi, sinon la période affiche des crédits faux. */
const ARCHIVE={'2026-09-07':{weekMonday:'2026-09-07',plan:PLAN_IDS}};
const archives=env({stores:DIX_MAGASINS,plan:{},storage:{chef_sector_plan_archive_v1:JSON.stringify(ARCHIVE)}});
const stats=archives.V.archiveStats(ARCHIVE,'2026-09-07','2026-09-13');
assert.equal(stats.stores,10,'dix passages physiques dans l’archive');
assert.equal(stats.visits,17,'dix-sept visites comptabilisées dans l’archive malgré les copies partielles');
assert.equal(stats.uniqueStores,10,'dix magasins distincts : un partiel et un complet ne font pas deux magasins');
const melange={'2026-09-07':{weekMonday:'2026-09-07',plan:{Lundi:[{id:'d1'}],Mardi:[{id:'d1',enseigne:'Darty',ville:'Ville-Test A'}],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}};
assert.equal(archives.V.archiveStats(melange,'2026-09-07','2026-09-13').uniqueStores,1,
  'le même magasin vu en partiel puis en complet reste un seul magasin distinct');

// --------------------------------------------- 6. La carte semaine affiche le vrai total
/* V245 : la carte semaine est construite par home-refresh-v2.js depuis la source unique
   StoreRunnerActivityMetrics. Ni visit-counting.js ni auto-planning-fix.js ne la
   réécrivent après rendu : un texte posé par l'accueil doit survivre à leurs événements. */
const metrics=reel.ctx.StoreRunnerActivityMetrics.compute(reel.state,{now:new Date('2026-09-09T12:00:00')});
assert.equal(metrics.plannedStoresWeek,10,'la source unique compte dix magasins planifiés');
assert.equal(metrics.plannedVisitCreditsWeek,17,'la source unique compte dix-sept crédits de visite malgré les copies partielles');
assert.equal(metrics.target,10,'settings.target reste un objectif de magasins');
assert.equal(metrics.targetUnit,'magasins');
assert.equal(reel.state.settings.target,10,'settings.target n’est jamais converti en crédits');
reel.weekValue.textContent='10 magasins planifiés';reel.weekSub.textContent='17 crédits de visite · objectif 10 magasins';
reel.fire('store-runner:planning-updated');
reel.fire('store-runner:home-rendered');
assert.equal(reel.weekValue.textContent,'10 magasins planifiés','aucun module ne réécrit la carte semaine après l’accueil');
assert.equal(reel.weekSub.textContent,'17 crédits de visite · objectif 10 magasins','aucun module ne réécrit le sous-texte de la carte semaine');
const summaryHtml=reel.reg.summary.innerHTML;
assert.match(summaryHtml,/<span>10 magasins planifiés<\/span><span>17 crédits de visite<\/span>/,
  'le résumé de la semaine compte les mêmes magasins et crédits · '+summaryHtml);
assert.match(summaryHtml,/visites? réalisées? aujourd’hui/,'le résumé parle de visites réalisées, pas de crédits');

// ------------------------------------------------------------ 7. Un seul moteur de calcul
const AUTOFIX=fs.readFileSync(__dirname+'/../auto-planning-fix.js','utf8');
assert.doesNotMatch(AUTOFIX,/DEFAULT_CREDITS/,
  'auto-planning-fix.js ne doit plus porter sa propre table de règles');
assert.doesNotMatch(AUTOFIX,/function brandCredit\(/,
  'auto-planning-fix.js ne doit plus recalculer le crédit d’enseigne');
assert.doesNotMatch(AUTOFIX,/V\.credit=visitCredit/,
  'auto-planning-fix.js ne doit plus écraser l’API du propriétaire des crédits');
assert.match(AUTOFIX,/window\.StoreVisitCounting/,'il consomme l’API publique du propriétaire');
assert.match(COUNTING,/function canonicalStore\(/,
  'la résolution canonique appartient au propriétaire des crédits');
assert.equal(typeof reel.V.canonicalStore,'function','la résolution canonique est exposée');
assert.equal(reel.V.canonicalStore({id:'d1'}).enseigne,'Darty','elle rend bien le magasin de state.stores');
assert.equal(reel.C.visitCredit({id:'d1'}),2,
  'les réglages magasin lisent le même moteur que l’accueil');

// ------------------------------- 8. « Automatique » : absence d'override, pas une valeur
const OVERRIDE_KEY='store-runner-visit-credit-overrides-v189';
const auto=env({
  stores:[{id:'a1',enseigne:'Darty',ville:'Ville-Test A',adresse:'1 rue Test',visitCreditOverride:1}],
  plan:{},
  storage:{[OVERRIDE_KEY]:JSON.stringify({'darty|ville test a|1 rue test':1})}
});
assert.equal(auto.V.credit({id:'a1'}),1,'au départ, le Darty porte bien un override à 1');
auto.C.applyCreditChoice(auto.state.stores[0],null);
assert.equal(auto.state.stores[0].visitCreditOverride,undefined,
  'Automatique supprime la propriété du magasin');
assert.equal(JSON.parse(auto.storageData[OVERRIDE_KEY]||'{}')['darty|ville test a|1 rue test'],undefined,
  'Automatique supprime aussi l’override persisté');
assert.equal(auto.V.credit({id:'a1'}),2,'la règle enseigne reprend immédiatement la main');
auto.C.restoreCreditOverrides();
assert.equal(auto.state.stores[0].visitCreditOverride,undefined,
  'un rendu suivant ne réécrit pas l’override supprimé');
assert.equal(auto.V.credit({id:'a1'}),2,'le Darty reste à deux visites après restauration');
/* Et le choix explicite continue de fonctionner dans les deux sens. */
auto.C.applyCreditChoice(auto.state.stores[0],1);
assert.equal(auto.V.credit({id:'a1'}),1,'un choix explicite à 1 visite est respecté');
auto.C.applyCreditChoice(auto.state.stores[0],2);
assert.equal(auto.V.credit({id:'a1'}),2,'un choix explicite à 2 visites est respecté');

// ---------------------------- 9. Un nouveau Darty n'hérite d'aucun override involontaire
/* Régression exacte : le sélecteur n'offrait que « 1 visite » / « 2 visites » et se
   présélectionnait sur 1 pour un magasin neuf. Toute création écrivait donc
   visitCreditOverride=1, y compris sur un Darty. */
assert.match(CONTROLS,/<option value="auto">Automatique/,
  'la fiche magasin doit proposer « Automatique · règle enseigne »');
assert.doesNotMatch(CONTROLS,/Number\(select\.value\)===2\?2:1/,
  'la sauvegarde ne doit plus retomber sur 1 quand aucun choix n’est fait');

const neuf=env({
  stores:[],plan:{},
  onSaveStore(state){state.stores.push({id:'n1',enseigne:'Darty',ville:'Ville-Test Z',adresse:'9 rue Test'})}
});
neuf.ctx.openStore();                       // création : aucun magasin existant
assert.equal(neuf.select.value,'auto',
  'la fiche d’un magasin neuf s’ouvre sur Automatique, jamais sur « 1 visite »');
neuf.ctx.saveStore();                       // l'utilisateur enregistre sans rien choisir
const cree=neuf.state.stores.find(s=>s.id==='n1');
assert(cree,'le magasin a bien été créé par le runtime');
assert.equal(cree.visitCreditOverride,undefined,
  'aucun visitCreditOverride n’est écrit quand l’utilisateur ne choisit rien');
assert.equal(JSON.stringify(JSON.parse(neuf.storageData[OVERRIDE_KEY]||'{}')),'{}',
  'aucune empreinte d’override n’est persistée non plus');
assert.equal(neuf.V.credit({id:'n1'}),2,
  'le nouveau Darty compte pour deux visites, comme sa règle enseigne');

/* Une modification ultérieure sans toucher au réglage ne doit pas créer d'override non plus. */
neuf.ctx.openStore('n1');
assert.equal(neuf.select.value,'auto','un magasin sans override se rouvre sur Automatique');
neuf.ctx.saveStore();
assert.equal(neuf.state.stores.find(s=>s.id==='n1').visitCreditOverride,undefined,
  'ré-enregistrer un magasin ne lui invente pas un override');
assert.equal(neuf.V.credit({id:'n1'}),2,'le Darty reste à deux visites après ré-enregistrement');

/* À l'inverse, un magasin qui porte un override se rouvre sur sa valeur. */
const deja=env({stores:[{id:'x1',enseigne:'Darty',ville:'Ville-Test',visitCreditOverride:1}],plan:{}});
deja.ctx.openStore('x1');
assert.equal(deja.select.value,'1','un override explicite est bien reflété dans la fiche');

console.log('V229 comptage réel : 10 magasins physiques = 17 visites comptabilisées même avec un state.plan réduit aux identifiants, moteur unique, Automatique sans override fantôme');
