const assert=require('node:assert/strict');
const P=require('../performance-data-v190.js');
const F=require('./helpers/xlsx-fixture.cjs');

// V190 : le fichier hebdomadaire de performance devient une donnée terrain exploitable,
// sans quitter l'appareil. Fixtures entièrement inventées — le dépôt est public, et aucun
// classeur réel ni aucune donnée commerciale n'y entre.

class DB{
  constructor(){this.map=new Map();this.writes=0;this.removed=[]}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  setItem(k,v){this.writes++;this.map.set(k,String(v))}
  removeItem(k){this.removed.push(k);this.map.delete(k)}
}
/* Quatre magasins : trois qui correspondent à une ligne du classeur, un qui n'y est pas
   et sert à vérifier l'appariement manuel. Les réglages V189 sont posés pour qu'on puisse
   prouver qu'aucun import ne les écrase. */
const secteur=()=>[
  {id:'s1',enseigne:'Auchan',ville:'Villeneuve-Fictive 1',adresse:'1 rue du Test',products:['Blanc'],visitCreditOverride:2},
  {id:'s2',enseigne:'Darty',ville:'Monts-Fictifs 1',adresse:'2 rue du Test',products:['Brun'],visitCreditOverride:1},
  {id:'s3',enseigne:'BUT',ville:'Roche-Feinte 1',adresse:'3 rue du Test',products:['Blanc','Brun']},
  {id:'s4',enseigne:'Boulanger',ville:'Ville-Sans-Ligne',adresse:'4 rue du Test',products:['Brun']}
];

(async function suite(){

// --- Le fichier type W34 ------------------------------------------------------------
const w34=await P.parseWorkbook(F.sectorW34('W34').bytes,{week:'W34',now:'2026-09-16T10:00:00Z'});
assert.equal(w34.rows.length,51,'51 lignes utiles');
const c=P.counts(w34.rows);
assert.equal(c.P1,7,'7 Prio 1 détectés');
assert.equal(c.P2,25,'25 Prio 2');
assert.equal(c.watch,18,'18 À surveiller');
assert.equal(c.nodata,1,'1 Pas de data');
assert.equal(w34.targetPdm,42.5,'cible 42,5 %');
assert.equal(w34.targetSource,'déduit','la cible est déduite de deux nombres présents, et la source est dite');
console.error('  W34 : '+w34.rows.length+' lignes · '+c.P1+' P1 · '+c.P2+' P2 · '+c.watch+' à surveiller · '+c.nodata+' sans data · cible '+w34.targetPdm+' %');

// --- Une PDM absente reste absente ---------------------------------------------------
const sansPdm=w34.rows.filter(r=>r.pdmYtd===null);
assert.ok(sansPdm.length>=2,'des lignes sans PDM existent');
for(const r of sansPdm){
  assert.equal(r.pdmYtd,null,r.retailer+' : la PDM reste vide');
  assert.equal(r.deltaYtd,null,'et son écart à la cible aussi');
  assert.notEqual(r.pdmYtd,0,'jamais un zéro fabriqué');
}
const auchan=w34.rows.find(r=>r.retailer==='Auchan'),but=w34.rows.find(r=>r.retailer==='BUT');
assert.equal(auchan.pdmYtd,null);assert.equal(but.pdmYtd,null);
assert.ok(Number.isFinite(auchan.sellOutYtd)&&auchan.sellOutYtd<0,'Auchan garde son écart sell-out');
assert.ok(Number.isFinite(but.sellOutWeek),'BUT garde son écart de la semaine');
console.error('  Sans PDM : '+sansPdm.map(r=>r.retailer).join(', ')+' — écarts sell-out conservés');

// --- Le format de nombre décide, pas la valeur ---------------------------------------
const avecPdm=w34.rows.find(r=>r.pdmYtd!=null);
assert.ok(avecPdm.pdmYtd>1&&avecPdm.pdmYtd<100,'une fraction en format pourcentage ressort en points, pas en 0,xx');

// --- W34 puis W35 coexistent ---------------------------------------------------------
const db=new DB();
P.saveSnapshot(db,w34);
const w35=await P.parseWorkbook(F.sectorW34('W35').bytes,{week:'W35',now:'2026-09-23T10:00:00Z'});
P.saveSnapshot(db,w35);
assert.deepEqual(P.weeks(db),['W34','W35'],'les deux semaines coexistent');
assert.equal(P.snapshot(db,'W34').rows.length,51,'W34 est intacte après l’import de W35');
assert.equal(P.latestSnapshot(db).week,'W35','la dernière semaine est la plus récente');
assert.deepEqual(db.removed,[],'aucun stockage supprimé');

// --- Appariement, et mapping conservé d'une semaine à l'autre -------------------------
const stores=secteur();
const m=P.matchRows(P.snapshot(db,'W34').rows,stores,P.readStore(db).mapping);
const parId=Object.fromEntries(m.rows.filter(r=>r.storeId).map(r=>[r.storeId,r]));
assert.ok(parId.s1&&parId.s1.retailer==='Auchan','Auchan apparié sur la ville');
assert.ok(parId.s3&&parId.s3.retailer==='BUT','BUT apparié');
for(const r of m.rows)if(r.storeId)assert.equal(r.matchedBy,'auto','apparié automatiquement');
assert.ok(m.ambiguous.every(a=>a.candidates.every(cand=>typeof cand.id==='string')),'les cas ambigus proposent des candidats, jamais un choix silencieux');

// Un appariement manuel est retenu et prime les semaines suivantes.
const orphelin=m.rows.find(r=>!r.storeId);
P.rememberMatch(db,orphelin.key,'s4');
const w35Matched=P.matchRows(P.snapshot(db,'W35').rows,stores,P.readStore(db).mapping);
const repris=w35Matched.rows.find(r=>r.key===orphelin.key);
assert.equal(repris.storeId,'s4','le mapping acquis est réutilisé la semaine suivante');
assert.equal(repris.matchedBy,'mapping','et il prime sur la détection automatique');

// --- Historique multi-semaines par magasin -------------------------------------------
const histo=P.historyForStore(db,'s2',stores);
assert.deepEqual(histo.map(h=>h.week),['W34','W35'],'un magasin affiche plusieurs semaines');
assert.ok(histo.every(h=>h.row&&h.row.key),'chaque semaine porte sa ligne');
assert.ok(histo.every(h=>h.targetPdm===42.5),'et la cible de sa semaine');

// --- Les réglages V189 ne sont jamais touchés ----------------------------------------
const avant=JSON.stringify(stores);
P.crossVisits(db,{stores});
P.dashboard(db,{stores});
P.historyForStore(db,'s1',stores);
assert.equal(JSON.stringify(stores),avant,'aucun magasin n’est muté : 1/2 visites et Blanc/Brun intacts');
assert.equal(stores[0].visitCreditOverride,2,'le crédit 2 de la fiche magasin est conservé');
assert.deepEqual(stores[2].products,['Blanc','Brun'],'les familles restent celles du magasin');

// --- P1 > P2 > À surveiller ----------------------------------------------------------
const vue=P.crossVisits(db,{stores,week:'W34'});
const ordre=vue.rows.map(r=>r.prio);
const rang=x=>P.PRIO_ORDER[x]===undefined?9:P.PRIO_ORDER[x];
for(let i=1;i<ordre.length;i++)assert.ok(rang(ordre[i-1])<=rang(ordre[i]),'l’ordre de pilotage est P1 puis P2 puis À surveiller');
assert.equal(ordre[0],'P1','un P1 vient toujours en tête');
assert.equal(ordre[ordre.length-1],'nodata','« pas de data » ferme la marche');

// --- Croisement avec les visites : une association datée, pas une causalité -----------
const visitsFor=id=>id==='s2'?{lastVisit:'2026-09-15',count:3,doneThisWeek:true}:null;
const croise=P.crossVisits(db,{stores,week:'W35',visitsFor});
const s2=croise.rows.find(r=>String(r.storeId)==='s2');
assert.ok(s2,'le magasin visité est dans la vue');
assert.equal(s2.visits.lastVisit,'2026-09-15','la dernière visite est rapprochée de la semaine');
assert.equal(s2.previousWeek,'W34','la semaine de comparaison est nommée');
assert.ok(s2.trend===null||Number.isFinite(s2.trend),'la tendance est un écart chiffré entre deux semaines');
for(const key of Object.keys(s2))assert.ok(!/cause|because|impact|grace|effet/i.test(key),'aucun champ ne prétend à une causalité');
assert.equal(croise.rows.find(r=>r.pdmYtd===null&&r.underTarget!==null),undefined,'sans PDM, « sous la cible » reste indéterminé — ni vrai ni faux');

// --- Dashboard ------------------------------------------------------------------------
const board=P.dashboard(db,{stores,week:'W34',visitsFor});
assert.equal(board.counts.P1,7);
assert.equal(board.week,'W34');
assert.ok(board.underTarget.every(r=>r.pdmYtd!=null),'« sous la cible » ne compte que des magasins qui ont une PDM');
assert.ok(board.visitedLowPdm.every(r=>r.visits&&r.visits.lastVisit),'« visités avec PDM faible » suppose une visite datée');
assert.ok(board.notVisitedGoodPdm.every(r=>!r.visits||!r.visits.lastVisit),'« non visités avec bonne PDM » suppose l’absence de visite');
console.error('  Pilotage W34 : '+board.underTarget.length+' sous la cible · '+board.visitedLowPdm.length+' visités à PDM faible · '+board.notVisitedGoodPdm.length+' non visités à bonne PDM');

// --- Stockage : additif, jamais destructif -------------------------------------------
const db2=new DB();
db2.setItem('sector_planner_universal_v1','{"stores":[]}');
db2.setItem(P.STORE_KEY,'donnée illisible {');
const recupere=P.readStore(db2);
assert.deepEqual(recupere,{version:2,imports:[],mapping:{},treated:{}},'un stockage illisible repart vide, sans lever');
P.saveSnapshot(db2,w34);
assert.equal(db2.getItem('sector_planner_universal_v1'),'{"stores":[]}','les données utilisateur ne sont pas touchées');
assert.deepEqual(db2.removed,[],'rien n’est supprimé du stockage');
assert.equal(P.weeks(db2).length,1);

// --- « Déjà traité » : une note de semaine, jamais une visite ni un planning ---------
(function traite(){
  // Une base écrite avant l'arrivée du champ se relit sans migration destructive.
  const vieux=new DB();
  vieux.setItem(P.STORE_KEY,JSON.stringify({version:1,snapshots:{W34:P.snapshot(db,'W34')},mapping:{'a|b':'s1'}}));
  const relu=P.readStore(vieux);
  assert.equal(relu.version,2,'la base v1 est relue en v2');
  assert.deepEqual(relu.treated,{},'la clé absente devient un objet vide');
  assert.deepEqual(relu.mapping,{'a|b':'s1'},'et le mapping existant survit');
  assert.equal(P.weeks(vieux).length,1,'les semaines déjà importées survivent');
  assert.equal(relu.imports[0].rows.length,51,'aucune ligne perdue à la migration');

  const avantPlan=JSON.stringify({stores,mapping:P.readStore(db).mapping});
  P.markTreated(db,'W34','s1','2026-09-15');
  assert.deepEqual(P.isTreated(db,'W34','s1'),{at:'2026-09-15',source:'manuel'},'la marque porte sa date');
  assert.equal(P.isTreated(db,'W35','s1'),null,'elle ne vaut que pour la semaine où elle est posée');
  assert.equal(JSON.stringify({stores,mapping:P.readStore(db).mapping}),avantPlan,'marquer ne touche ni les magasins ni le mapping');
  const marque=P.crossVisits(db,{stores,week:'W34',visitsFor:id=>id==='s1'?{lastVisit:'2026-09-15',count:1}:null});
  const ligne=marque.rows.find(r=>String(r.storeId)==='s1');
  assert.ok(ligne.treated,'la vue montre le magasin comme traité');
  assert.equal(ligne.qualifying,null,'et ne repropose pas de le marquer');
  P.markTreated(db,'W34','s1',null);
  assert.equal(P.isTreated(db,'W34','s1'),null,'la marque se retire');

  // Une visite datée dans la fenêtre de la semaine rend le magasin éligible — on propose.
  const snapW34=P.snapshot(db,'W34');
  assert.deepEqual(P.qualifyingVisit({lastVisit:'2026-09-15'},snapW34),{date:'2026-09-15',days:1},'visite récente : éligible');
  assert.equal(P.qualifyingVisit({lastVisit:'2026-07-01'},snapW34),null,'visite ancienne : pas éligible');
  assert.equal(P.qualifyingVisit(null,snapW34),null,'aucune visite : pas éligible');
})();

// --- Sans import, tout reste neutre ---------------------------------------------------
const vide=new DB();
assert.equal(P.latestSnapshot(vide),null);
assert.deepEqual(P.dashboard(vide,{stores}).counts,{P1:0,P2:0,watch:0,nodata:0,unmatched:0,total:0});
assert.equal(P.rowForStore(vide,'s1'),null,'une fiche magasin sans import n’affiche rien plutôt que des zéros');

// --- Semaine lue depuis le nom du fichier ---------------------------------------------
assert.equal(P.weekFromName('PILOTAGE SECTEUR W34.xlsx'),'W34');
assert.equal(P.weekFromName('export w7.xlsx'),'W7');
assert.equal(P.weekFromName('sans semaine.xlsx'),'');

// --- Le module ne parle à personne -----------------------------------------------------
const src=require('fs').readFileSync(__dirname+'/../performance-data-v190.js','utf8');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(src),'aucun appel réseau : le fichier ne quitte pas l’appareil');
assert.ok(!/new MutationObserver|setInterval\s*\(/.test(src),'aucun observateur global, aucun minuteur');
assert.ok(!/removeItem\s*\(/.test(src),'ce module ne supprime jamais rien du stockage');

// --- L'interface ne s'approprie rien et ne touche pas au planning ---------------------
const ui=require('fs').readFileSync(__dirname+'/../performance-ui-v190.js','utf8');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|FormData/.test(ui),'le classeur ne quitte pas l’appareil');
assert.ok(!/new MutationObserver|setInterval\s*\(/.test(ui),'aucun observateur global, aucun minuteur');
assert.ok(!/addEventListener\((?:'|\")(?:focus|visibilitychange)/.test(ui),'aucune réinstallation sur focus ni visibilitychange');
for(const globale of ['renderAll','generateWeek','save','state','openStore','renderWeek'])
  assert.ok(!new RegExp('root\\.'+globale+'\\s*=[^=]').test(ui)&&!new RegExp('window\\.'+globale+'\\s*=[^=]').test(ui),'ne redéfinit pas '+globale);
// Aucune écriture dans le planning ni dans l'état métier : le pilotage est une lecture.
for(const interdit of ['state.plan=','state.plan[','businessV2.visits.push','storeRunnerLockDayForWeek','saveArchive','chef_sector_plan_archive'])
  assert.ok(!ui.includes(interdit),'l’interface performance ne doit pas écrire dans le planning : '+interdit);
assert.ok(/store-runner:home-rendered/.test(ui)&&/store-runner:data-restored/.test(ui),'réinstallation sur les seuls événements publics');
assert.ok(/accept=\"\.xlsx/.test(ui),'l’import accepte bien un classeur .xlsx');
assert.ok(/srPerfSheet/.test(ui)&&/sqPerformance/.test(ui),'le module possède sa feuille et son bloc de fiche magasin');
// Les réglages V189 ne sont ni lus pour être réécrits, ni touchés.
for(const reglage of ['visitCreditOverride=','products=','visitCreditsByBrand='])
  assert.ok(!ui.includes(reglage),'l’interface ne réécrit jamais le réglage V189 '+reglage);

// =====================================================================================
// Revue sur le classeur réel (issue #253) : quatre écarts constatés.
// Les EN-TÊTES sont recopiés à l'identique du fichier réel ; les valeurs restent inventées.
// =====================================================================================
await (async function fichierReel(){
  const {expected}=F.sectorReel();
  const snap=await P.parseWorkbook(F.sectorReel().bytes,{week:'W34',now:'2026-09-16T10:00:00Z'});

  // Le fichier réel confirme la volumétrie annoncée.
  assert.equal(snap.rows.length,expected.lignes,'51 lignes utiles sur les en-têtes réels');
  const c=P.counts(snap.rows);
  assert.equal(c.P1,7);assert.equal(c.P2,25);assert.equal(c.watch,18);assert.equal(c.nodata,1);

  // --- Écart 1 : les colonnes sell-out ne contiennent pas « sell out » ---------------
  assert.deepEqual(P.classify('Ecart SO€  2026-2025 YTD'),{kind:'sellOutYtd'},'le cumul SO€ est reconnu');
  for(const [entete,semaine] of [['Ecart W32 2026-W32 2025','W32'],['Ecart W33 2026-W33 2025','W33'],['Ecart W34 2026-W34 2028','W34']])
    assert.deepEqual(P.classify(entete),{kind:'sellOutWeek',week:semaine},entete+' → '+semaine);
  // La coquille d'année du fichier livré (W34 2028) ne doit rien changer.
  assert.deepEqual(P.classify('Ecart W34 2026-W34 2028').week,'W34','l’année erronée n’influence pas la lecture');
  const ligne=snap.rows.find(r=>r.sellOutYtd!=null);
  assert.ok(Number.isFinite(ligne.sellOutYtd),'l’écart SO€ YTD est lu');
  assert.deepEqual(Object.keys(ligne.sellOutWeeks).sort(),['W32','W33','W34'],'les trois semaines sont conservées séparément');
  const valeurs=['W32','W33','W34'].map(w=>ligne.sellOutWeeks[w]);
  assert.equal(new Set(valeurs).size,3,'et gardent trois valeurs distinctes, sans agrégation');
  assert.equal(ligne.sellOutWeek,ligne.sellOutWeeks.W34,'le champ hérité pointe la dernière semaine connue');
  console.error('  Sell-out réel : '+ligne.sellOutYtd+' YTD · W32 '+valeurs[0]+' · W33 '+valeurs[1]+' · W34 '+valeurs[2]);

  // --- Écart 2 : « Target = 42.5% » est écrit en A1, au-dessus de l'en-tête ----------
  assert.equal(snap.targetPdm,42.5,'la cible réelle est lue');
  assert.equal(snap.targetSource,'explicite','elle est lue, pas déduite');
  assert.equal(P.explicitTarget([['Target = 42.5%'],[],['Prios','Retailer']],2),42.5);
  assert.equal(P.explicitTarget([['Target = 42,5 %']],1),42.5,'la virgule décimale est acceptée');
  assert.equal(P.explicitTarget([['Autre chose']],1),null,'aucune cible inventée quand la cellule n’en porte pas');
  // La déduction reste le dernier recours, et se déclare comme telle.
  const sansCible=await P.parseWorkbook(F.sectorW34('W34').bytes,{week:'W34'});
  assert.equal(sansCible.targetSource,'déduit','sans cible écrite, on déduit et on le dit');
  console.error('  Cible : ' + snap.targetPdm + ' % lue en A1 (' + snap.targetSource + ')');

  // --- Écart 3 : l'alias ED, et ce qui doit rester manuel ---------------------------
  assert.equal(P.brandKey('ED'),'electro depot','ED est l’abréviation d’Electro Dépôt');
  assert.equal(P.matchScore({retailer:'ED',site:'Ville-Test E'},{enseigne:'Electro Dépôt',ville:'Ville-Test E'}),100,'ED s’apparie sans intervention');
  assert.equal(P.matchScore({retailer:'CONFO',site:'Ville-Test G'},{enseigne:'Conforama',ville:'Ville-Test G'}),100,'CONFO passait déjà par l’inclusion');
  assert.equal(P.matchScore({retailer:'BTLEC EST',site:'Ville-Test G'},{enseigne:'Conforama',ville:'Ville-Test G'}),0,
    'BTLEC EST reste manuel : sans règle sûre, mieux vaut demander que se tromper');
  const magasins=[{id:'e1',enseigne:'Electro Dépôt',ville:'Villeneuve-Fictive 1',adresse:''}];
  const apparie=P.matchRows(snap.rows,magasins,{}).rows.find(r=>String(r.storeId)==='e1');
  assert.ok(apparie&&apparie.retailer==='ED','la ligne ED du classeur trouve son magasin toute seule');

  // --- Écart 4 : « % evol YTD vs LY » s'affiche en %, pas en points -----------------
  const ui=require('fs').readFileSync(__dirname+'/../performance-ui-v190.js','utf8');
  assert.ok(/function signedPct\(/.test(ui),'un formateur distinct existe pour les pourcentages');
  assert.ok(/'Évolution YTD vs N-1 : '\+signedPct\(r\.evolYtd\)/.test(ui),'la carte de pilotage affiche l’évolution en %');
  assert.ok(/line\('Évolution YTD vs N-1 : '\+signedPct\(r\.evolYtd\)\)/.test(ui),'la fiche magasin aussi');
  assert.ok(!/Évolution YTD vs N-1 : '\+signed\(/.test(ui),'plus aucune évolution affichée en points');
  // Les points restent réservés aux écarts de PDM.
  assert.ok(/écart cible '\+signed\(r\.deltaYtd\)/.test(ui),'l’écart de PDM reste en points');
  console.error('  Unités : évolution vs N-1 en %, écart de PDM en points');
})();

// --- Aucune donnée commerciale dans le dépôt ------------------------------------------
(function depotPropre(){
  const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..');
  const suivis=require('child_process').execSync('git ls-files',{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean);
  const classeurs=suivis.filter(f=>/\.(xlsx|xlsm|xls)$/i.test(f));
  assert.deepEqual(classeurs,[],'aucun classeur ne doit être versionné : '+classeurs.join(', '));
  assert.ok(!suivis.some(f=>/rhone[- ]?alpes/i.test(f)),'le fichier du secteur réel ne doit jamais entrer dans le dépôt');
  const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
  assert.ok(/^\*\.xlsx$/m.test(ignore),'.gitignore doit refuser les classeurs');
  // La fixture est fabriquée en mémoire : rien de binaire n'est stocké à côté du test.
  assert.ok(!fs.existsSync(path.join(__dirname,'helpers','sector.xlsx')),'la fixture reste générée, jamais déposée');
})();

// =====================================================================================
// Compléments V190 validés sur fichier réel et sauvegarde (issue #253)
// =====================================================================================

// --- « Déjà visité » : completed uniquement, jamais draft ----------------------------
(function jamaisDraft(){
  const etat={businessV2:{visits:[
    {id:'v1',storeId:'s1',status:'draft',completedDate:null,updatedAt:'2026-09-16T09:00:00Z'},
    {id:'v2',storeId:'s2',status:'completed',completedDate:'2026-09-15',updatedAt:'2026-09-15T18:00:00Z'},
    {id:'v3',storeId:'s2',status:'draft',completedDate:null,updatedAt:'2026-09-16T09:00:00Z'}
  ],actions:[]},visits:{}};
  assert.equal(P.completedVisitsFor(etat,'s1'),null,'un brouillon seul ne compte jamais comme magasin visité');
  const v2=P.completedVisitsFor(etat,'s2');
  assert.equal(v2.lastVisit,'2026-09-15','seule la visite terminée est retenue');
  assert.equal(v2.count,1,'et le brouillon ouvert à côté ne gonfle pas le compteur');
  // Le repli historique ne compte que des dates de visites terminées.
  assert.equal(P.completedVisitsFor({visits:{s3:{history:['2026-09-01'],lastVisit:'2026-09-01'}}},'s3').lastVisit,'2026-09-01');
  // Et le croisement s'appuie sur la même règle.
  const vue=P.crossVisits(db,{stores,week:'W34',state:etat});
  const s1=vue.rows.find(r=>String(r.storeId)==='s1');
  assert.ok(!s1.visits,'dans le pilotage non plus, un brouillon n’est pas une visite');
  console.error('  Déjà visité : brouillon ignoré, visite terminée retenue');
})();

// --- Statut et écart sur le YTD ; les semaines ne servent qu'à la tendance -----------
(function statutYtd(){
  const target=42.5;
  const ytdBas={pdmYtd:30,deltaYtd:-12.5,weeks:{W32:70,W33:71,W34:72}};
  const ytdHaut={pdmYtd:50,deltaYtd:7.5,weeks:{W32:5,W33:6,W34:7}};
  assert.equal(P.statusOf(ytdBas,target).underTarget,true,'des semaines brillantes ne sauvent pas un YTD sous la cible');
  assert.equal(P.statusOf(ytdHaut,target).underTarget,false,'des semaines faibles ne condamnent pas un YTD au-dessus');
  assert.equal(P.statusOf(ytdBas,target).basedOn,'ytd');
  assert.equal(P.statusOf({pdmYtd:null,deltaYtd:null,weeks:{W34:40}},target).underTarget,null,'sans PDM YTD, le statut reste indéterminé');
  // Le classement suit le YTD, pas la semaine.
  const tri=P.sortByPriority([
    {prio:'P1',deltaYtd:-2,weeks:{W34:10}},
    {prio:'P1',deltaYtd:-9,weeks:{W34:90}}
  ]);
  assert.equal(tri[0].deltaYtd,-9,'le plus mauvais YTD passe devant, quelle que soit sa semaine');
  // La tendance hebdomadaire est étiquetée comme telle.
  const t=P.weeklyTrend({weeks:{W32:31,W33:32,W34:33}});
  assert.equal(t.usage,'tendance');assert.equal(t.direction,'hausse');assert.equal(t.delta,2);
  const volatile=P.weeklyTrend({weeks:{W32:20,W33:55,W34:45}});
  assert.equal(volatile.volatile,true,'une amplitude de plus de 20 points est signalée comme volatile');
  assert.equal(P.weeklyTrend({weeks:{W34:33}}).delta,null,'une seule semaine ne fait pas une tendance');
  console.error('  Statut YTD : un YTD à 30 % reste sous la cible même avec W32-W34 à 70 %');
})();

// --- Comparaisons : seulement après plusieurs snapshots, avec effectif ---------------
(function comparaisons(){
  const une=new DB();
  P.saveSnapshot(une,w34);
  const seul=P.dashboard(une,{stores,visitsFor:id=>id==='s2'?{lastVisit:'2026-09-15',count:1}:null});
  assert.equal(seul.comparison.available,false,'une seule semaine : pas de comparaison');
  assert.deepEqual(seul.visitedLowPdm,[],'et rien n’est affiché');
  assert.deepEqual(seul.notVisitedGoodPdm,[]);
  assert.ok(/pas encore d’avant/.test(seul.comparison.reason),'la raison est dite à l’utilisateur');

  const deux=P.dashboard(db,{stores,week:'W35',visitsFor:id=>id==='s2'?{lastVisit:'2026-09-15',count:1}:null});
  assert.equal(deux.comparison.available,true,'deux semaines : la comparaison devient légitime');
  assert.equal(deux.comparison.weeksCompared,2,'le nombre de semaines comparées est annoncé');
  assert.ok(Number.isFinite(deux.comparison.sample.visited)&&Number.isFinite(deux.comparison.sample.notVisited),'l’effectif comparé est chiffré');
  /* Ce qui est interdit, c'est d'affirmer une causalité — pas de la démentir. « sans lien
     de cause établi » est justement le démenti attendu. */
  assert.ok(/association/.test(deux.comparison.wording),'la formulation annonce une association');
  assert.ok(/sans lien de cause/.test(deux.comparison.wording),'et dément explicitement la causalité');
  assert.ok(!/(grâce à|a fait (monter|baisser)|provoqu|entraîn|à cause de|permet de faire|augmente la pdm)/i.test(deux.comparison.wording),
    'aucune tournure n’attribue l’évolution à la visite');
  console.error('  Comparaison : indisponible à 1 semaine, disponible à 2 avec effectif '+JSON.stringify(deux.comparison.sample));
})();

// --- P1/P2/À surveiller ne touchent jamais store.priority ----------------------------
(function prioriteStructurelle(){
  const avec=secteur().map((s,i)=>Object.assign(s,{priority:i+1}));
  const empreinte=JSON.stringify(avec);
  P.crossVisits(db,{stores:avec,week:'W34'});
  P.dashboard(db,{stores:avec,week:'W34'});
  P.planningBoost(db,'s1',avec);
  P.historyForStore(db,'s1',avec);
  assert.equal(JSON.stringify(avec),empreinte,'aucun magasin n’est muté par le pilotage');
  for(let i=0;i<avec.length;i++)assert.equal(avec[i].priority,i+1,'store.priority reste la priorité structurelle');
  const src=require('fs').readFileSync(__dirname+'/../performance-data-v190.js','utf8');
  const ui=require('fs').readFileSync(__dirname+'/../performance-ui-v190.js','utf8');
  for(const fichier of [src,ui])assert.ok(!/\.priority\s*=[^=]/.test(fichier),'aucun module V190 n’écrit store.priority');
})();

// --- Influence planning : génération explicite, snapshot le plus récent seulement -----
(function influencePlanning(){
  assert.equal(P.planningBoost(new DB(),'s1',stores),0,'sans import, aucun coup de pouce');
  const boost=P.planningBoost(db,'s1',stores);
  const ligne=P.crossVisits(db,{stores}).rows.find(r=>String(r.storeId)==='s1');
  assert.equal(boost,P.PLANNING_BOOST[ligne.prio],'le coup de pouce suit la priorité du snapshot le plus récent');
  assert.ok(P.PLANNING_BOOST.P1>P.PLANNING_BOOST.P2,'P1 pèse plus que P2');
  assert.equal(P.PLANNING_BOOST.watch,0,'« à surveiller » reste informatif, sans effet sur le planning');
  assert.equal(P.PLANNING_BOOST.nodata,0);
  // Un P1 déjà traité cette semaine ne se fait plus pousser.
  P.markTreated(db,P.latestSnapshot(db).week,'s1','2026-09-22');
  assert.equal(P.planningBoost(db,'s1',stores),0,'un magasin déjà traité ne repasse pas devant');
  P.markTreated(db,P.latestSnapshot(db).week,'s1',null);
  // Le planificateur ne consulte cette valeur que dans son classement de génération.
  const planner=require('fs').readFileSync(__dirname+'/../range-planner-v2.js','utf8');
  assert.ok(/function performanceBoost\(/.test(planner)&&/scoreOf\(s\)\{[^}]*performanceBoost\(s\)/.test(planner),
    'le planificateur lit la performance dans scoreOf, son seul point de classement');
  assert.ok(!/performanceBoost/.test(planner.split('function scoreOf')[0].split('function performanceBoost')[0]),
    'et nulle part avant, donc pas au chargement');
  console.error('  Planning : coup de pouce '+boost+' pour un P1, 0 une fois traité, 0 sans import');
})();

// --- Semaines chevauchantes : tout gardé, une seule valeur affichée ------------------
(async function chevauchement(){
  const dbl=new DB();
  const premier=await P.parseWorkbook(F.sectorW34('W34').bytes,{week:'W34',now:'2026-09-16T08:00:00Z'});
  const corrige=await P.parseWorkbook(F.sectorW34('W34').bytes,{week:'W34',now:'2026-09-16T19:00:00Z'});
  corrige.targetPdm=43.1;
  P.saveSnapshot(dbl,premier);P.saveSnapshot(dbl,corrige);
  assert.deepEqual(P.weeks(dbl),['W34'],'une seule semaine à l’affichage, pas de doublon');
  assert.equal(P.importCount(dbl,'W34'),2,'les deux imports sont conservés pour l’audit');
  assert.equal(P.snapshot(dbl,'W34').targetPdm,43.1,'la dernière valeur connue est celle qui s’affiche');
  assert.equal(P.allImports(dbl,'W34')[0].targetPdm,42.5,'le premier import reste lisible tel quel');
  assert.deepEqual(dbl.removed,[],'rien n’est supprimé');
  const board=P.dashboard(dbl,{stores});
  assert.equal(board.importsThisWeek,2,'le tableau de bord dit qu’il y a eu deux imports');
  assert.equal(board.counts.total,51,'et ne compte les lignes qu’une fois');
  console.error('  Chevauchement W34 : 2 imports conservés, 1 semaine affichée, cible retenue 43,1 %');
})().then(()=>{

console.log('PASS: import .xlsx local, 51 lignes et 7 P1 sur le fichier type, PDM absente jamais fabriquée, W34 et W35 coexistent, mapping conservé, réglages V189 intacts, P1 > P2 > à surveiller, croisement visites sans causalité.');
});
})().catch(e=>{console.error(e);process.exit(1)});
