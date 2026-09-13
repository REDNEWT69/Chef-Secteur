const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// L'onglet Magasins annonçait « 55 actifs » pendant que la génération travaillait sur 41
// magasins : activeStores() ne compte que active!==false, ni state.excluded ni le filtre
// Enseignes. Et la ligne d'un magasin exclu était strictement identique à celle d'un
// magasin normal, la seule différence étant le libellé d'un bouton.

const core=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');

// --- Garde-fous statiques -----------------------------------------------------------
// Le marqueur doit porter un texte : la couleur seule ne suffit pas, et les deux états
// doivent rester distinguables l'un de l'autre.
assert.match(core,/⊘ Exclu du planning/,'un magasin exclu doit être marqué sur sa ligne');
assert.match(core,/✕ Désactivé du secteur/,'un magasin désactivé doit rester distinguable d’un magasin exclu');
assert.match(core,/\.storeTagExcluded\{/,'le marqueur d’exclusion doit être stylé');
assert.match(core,/\.storeTagOff\{/,'le marqueur de désactivation doit être stylé');
assert.match(core,/\.inactive\{opacity:\.5\}/,'l’affichage existant d’un magasin désactivé ne doit pas être cassé');
assert.match(core,/\(horsSecteur\?'inactive ':''\)\+\(exclu\?'excluded':''\)/,'les deux états doivent produire deux classes distinctes sur la ligne');
// Le comptage consomme la règle de filtrage, il ne la réécrit pas.
assert.match(core,/function storeReach\(\)/,'le comptage réel doit exister en un seul endroit');
assert.match(core,/if\(!includedByFilters\(s\)\)\{out\.filtered\+\+;continue\}/,'le comptage doit passer par includedByFilters, sans réimplémenter la règle');
assert.match(core,/<span>planifiables<\/span>/,'la tuile doit annoncer les magasins réellement planifiables');
assert.match(core,/'<div class="kpiNote">'\+esc\(note\)\+'<\/div>'/,'l’écart doit être annoncé sous les tuiles');
assert.match(core,/r\.active\+' actif'/,'le nombre d’actifs et le total du secteur doivent rester lisibles');
// Contraintes de propriété : un seul propriétaire, aucun réveil global ajouté.
assert.equal((core.match(/getElementById\('storeKpis'\)/g)||[]).length,1,'renderStoreKpis doit rester seul propriétaire de #storeKpis');
assert.equal((core.match(/getElementById\('storeList'\)/g)||[]).length,1,'renderStores doit rester seul propriétaire de #storeList');
// Le menu de jour récemment corrigé ne doit pas être cassé au passage.
assert.match(core,/Posé ce '\+esc\(posee\.day\.toLowerCase\(\)\)\+' \(semaine du /,'le menu de jour doit continuer d’annoncer une pose datée');
assert.match(core,/Tous les '\+DAYS\[d\]\.toLowerCase\(\)\+'s<\/option>/,'et un verrou récurrent');

// --- La règle de comptage, exécutée pour de vrai --------------------------------------
// On extrait du noyau les deux fonctions concernées et on les exécute telles quelles :
// pas de réécriture de la règle dans le test.
function bodyOf(name){
  const start=core.indexOf('function '+name+'(');
  assert(start>=0,'la fonction '+name+' doit exister dans le noyau');
  let i=core.indexOf('{',start),depth=0;
  for(let j=i;j<core.length;j++){
    if(core[j]==='{')depth++;
    else if(core[j]==='}'){depth--;if(!depth)return core.slice(start,j+1)}
  }
  throw new Error('corps de '+name+' introuvable');
}
function makeReach(stores,excluded,brands){
  const state={stores:stores.map(s=>Object.assign({},s)),excluded:Object.assign({},excluded),settings:{brands:brands.slice(),products:[]}};
  const ctx={state,console,Number,String,Array,Object};
  ctx.window=ctx;
  vm.runInNewContext(bodyOf('includedByFilters')+'\n'+bodyOf('storeReach')+'\nthis.__reach=storeReach;this.__filters=includedByFilters;',ctx);
  return {reach:()=>ctx.__reach(),state};
}

// Secteur du ticket : 56 magasins, 11 enseignes, 1 désactivé, 1 exclu, 5 enseignes cochées.
const BRANDS=['Boulanger','Carrefour','Conforama','Darty','Fnac','BUT','Electro Dépôt','Schmidt','Gitem','E.Leclerc','Pro&Cie'];
// Répartition choisie pour retomber exactement sur les chiffres mesurés : 13 magasins
// actifs appartiennent aux 6 enseignes non cochées (4 BUT, 3 Electro Dépôt, 3 Schmidt,
// 1 Gitem, 1 E.Leclerc, 1 Pro&Cie).
const HORS_FILTRE={'BUT':4,'Electro Dépôt':3,'Schmidt':3,'Gitem':1,'E.Leclerc':1,'Pro&Cie':1};
const COCHEES=['Boulanger','Carrefour','Conforama','Darty','Fnac'];
const SECTEUR=[];
let n=0;
for(const [brand,count] of Object.entries(HORS_FILTRE))
  for(let i=0;i<count;i++)SECTEUR.push({id:'x'+(n++),enseigne:brand,products:[],active:true});
// 43 magasins des enseignes cochées : 42 actifs + 1 désactivé = 56 au total.
for(let i=0;i<42;i++)SECTEUR.push({id:'c'+(n++),enseigne:COCHEES[i%COCHEES.length],products:[],active:true});
SECTEUR.push({id:'off',enseigne:'Darty',products:[],active:false});
assert.equal(SECTEUR.length,56,'le secteur de test doit compter 56 magasins');
assert.equal(new Set(SECTEUR.map(s=>s.enseigne)).size,11,'et 11 enseignes distinctes');

const EXCLU={c13:true};
assert(SECTEUR.some(s=>s.id==='c13'&&s.active!==false),'le magasin exclu doit être un magasin actif');

// --- AVANT : ce qu'annonçait la tuile « actifs » -------------------------------------
const avant=SECTEUR.filter(s=>s.active!==false).length;
assert.equal(avant,55,'AVANT : la tuile annonçait le nombre de magasins actifs');

// --- APRÈS : ce que la génération voit réellement ------------------------------------
let r=makeReach(SECTEUR,EXCLU,COCHEES).reach();
assert.equal(r.total,56,'le total du secteur reste lisible');
assert.equal(r.active,55,'le nombre d’actifs reste lisible');
assert.equal(r.planifiables,41,'APRÈS : 41 magasins iront réellement à la génération');
assert.equal(r.excluded,1,'1 exclu doit être signalé');
assert.equal(r.filtered,13,'13 écartés par le filtre Enseignes doivent être signalés');
assert.equal(r.planifiables+r.excluded+r.filtered,r.active,'les trois catégories doivent couvrir exactement les actifs');

console.error('  AVANT, tuile « actifs »      : '+avant);
console.error('  APRÈS, tuile « planifiables » : '+r.planifiables+' · '+r.excluded+' exclu · '+r.filtered+' écartés par le filtre · '+r.active+' actifs sur '+r.total);

// --- Réactiver le magasin exclu porte le compteur à 42 -------------------------------
r=makeReach(SECTEUR,{},COCHEES).reach();
assert.equal(r.planifiables,42,'lever l’exclusion doit porter le compteur à 42');
assert.equal(r.excluded,0,'et faire disparaître la mention d’exclusion');

// --- Cocher toutes les enseignes porte le compteur à 55 ------------------------------
r=makeReach(SECTEUR,{},[]).reach();
assert.equal(r.planifiables,55,'sans filtre d’enseignes, tous les actifs sont planifiables');
assert.equal(r.filtered,0);
r=makeReach(SECTEUR,{},BRANDS).reach();
assert.equal(r.planifiables,55,'cocher les 11 enseignes revient au même');

// --- Réactiver le magasin désactivé porte le compteur à 56 ---------------------------
const rallume=SECTEUR.map(s=>s.id==='off'?Object.assign({},s,{active:true}):s);
r=makeReach(rallume,{},BRANDS).reach();
assert.equal(r.total,56);
assert.equal(r.active,56,'le magasin réactivé rejoint les actifs');
assert.equal(r.planifiables,56,'et les planifiables');

// --- Un magasin désactivé n’est jamais compté deux fois ------------------------------
// includedByFilters renvoie déjà false pour active===false : sans le continue, il serait
// compté à la fois comme désactivé et comme écarté par le filtre.
const avecDeuxOff=SECTEUR.concat([{id:'off2',enseigne:'BUT',products:[],active:false}]);
r=makeReach(avecDeuxOff,EXCLU,COCHEES).reach();
assert.equal(r.total,57);
assert.equal(r.active,55,'un second magasin désactivé ne change pas le nombre d’actifs');
assert.equal(r.filtered,13,'et n’est pas compté comme écarté par le filtre');
assert.equal(r.planifiables+r.excluded+r.filtered,r.active);

// --- Le filtre Produits compte aussi, par la même règle ------------------------------
const avecProduits=[
  {id:'p1',enseigne:'Darty',products:['Blanc'],active:true},
  {id:'p2',enseigne:'Darty',products:['Brun'],active:true},
  {id:'p3',enseigne:'Darty',products:['Blanc','Brun'],active:true}
];
const ctxP=makeReach(avecProduits,{},[]);
ctxP.state.settings.products=['Blanc'];
r=ctxP.reach();
assert.equal(r.planifiables,2,'le filtre Produits passe par la même règle qu’includedByFilters');
assert.equal(r.filtered,1);

// --- Un secteur vide ne casse rien ---------------------------------------------------
r=makeReach([],{},[]).reach();
assert.deepEqual({total:r.total,active:r.active,excluded:r.excluded,filtered:r.filtered,planifiables:r.planifiables},
  {total:0,active:0,excluded:0,filtered:0,planifiables:0},'un secteur vide doit donner des compteurs à zéro');

console.log('PASS: la tuile annonce les magasins réellement planifiables, l’écart est détaillé par cause, un magasin désactivé n’est jamais compté deux fois, et la ligne d’un magasin exclu porte un marqueur distinct de celui d’un magasin désactivé.');
