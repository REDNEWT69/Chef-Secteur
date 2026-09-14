const assert=require('node:assert/strict');
const M=require('../store-runner-visit-model.js');
const R=require('../visit-report-slack.js');

// Deux comptes rendus à publier à chaque sortie de magasin, sur deux groupes Slack. Ce
// module n'écrit rien : il assemble les données déjà saisies dans le squelette attendu.
// Fixtures entièrement inventées — enseignes génériques, villes fictives, aucun nom de
// personne, aucune coordonnée. Le dépôt est public.

const PH='[Non renseigné par le FMT]';
function sector(enseigne){
  return {schemaVersion:5,profile:{baseName:'Ville-Base'},settings:{days:['Lundi']},
    stores:[{id:'m1',enseigne,ville:'Villeneuve-Fictive'}],notes:{},visits:{},plan:{Lundi:[]},
    appointments:[],calendarEvents:[]};
}
function freshVisit(enseigne){
  const s=M.clone(sector(enseigne||'Darty')),id=M.start(s,'m1');
  // Date figée : le texte doit être reproductible d'une exécution à l'autre.
  M.getVisit(s,id).createdAt='2026-09-15T08:00:00.000Z';
  return {s,id};
}

// --- 1. Choix du squelette ------------------------------------------------------------
for(const [enseigne,attendu] of [['Darty','grands-magasins'],['BOULANGER','grands-magasins'],['But','grands-magasins'],
  ['Schmidt','cuisinistes'],['Cuisinella','cuisinistes'],['Gitem','buying-groups'],['Pro&Cie','buying-groups'],
  ['pro et cie','buying-groups'],['Enseigne Inconnue','grands-magasins'],['','grands-magasins']])
  assert.equal(R.skeletonFor(enseigne),attendu,enseigne+' → '+attendu);

// --- 2. Une visite vide : un marqueur par champ, jamais un trou -----------------------
(function vide(){
  const {s,id}=freshVisit('Darty');
  const txt=R.build(s,id,'brun');
  const n=(txt.match(/\[Non renseigné par le FMT\]/g)||[]).length;
  // Contexte, équipe, actions, photos, massifications, OMNI, blocages, prochaine étape.
  // Le ticket annonçait sept mais en énumérait huit : c'est huit, figé ici.
  assert.equal(n,8,'huit champs vides, huit marqueurs');
  assert.ok(!/\n\s*\n\s*\n/.test(txt),'jamais deux lignes vides consécutives');
  assert.ok(!/Notes 6P/.test(txt),'sans aucune ligne 6P renseignée, le bloc Notes 6P disparaît');
  console.error('  Visite vide, squelette grands-magasins : '+n+' marqueurs « '+PH+' »');
})();

// --- 3 à 5. Étanchéité des familles ---------------------------------------------------
(function familles(){
  const {s,id}=freshVisit('Darty');
  M.edit6P(s,id,'prix',0,'comment','Étiquette lave-linge absente');
  M.edit6P(s,id,'prix',0,'family','blanc');
  M.edit6P(s,id,'produit',0,'comment','Démo commune aux deux rayons');
  M.edit6P(s,id,'produit',0,'family','both');
  M.edit6P(s,id,'place',0,'comment','Ligne laissée sans étiquette');
  M.edit6P(s,id,'place',0,'family','');
  const blanc=R.build(s,id,'blanc'),brun=R.build(s,id,'brun');
  assert.ok(blanc.includes('Étiquette lave-linge absente'),'la ligne blanc est dans le compte rendu BLANC');
  assert.ok(!brun.includes('Étiquette lave-linge absente'),'et pas dans le BRUN');
  assert.ok(blanc.includes('Démo commune aux deux rayons')&&brun.includes('Démo commune aux deux rayons'),'une ligne « both » est dans les deux');
  assert.ok(blanc.includes('Ligne laissée sans étiquette')&&brun.includes('Ligne laissée sans étiquette'),'une ligne non étiquetée aussi');
})();

// --- 6. Une anomalie ne franchit pas la frontière -------------------------------------
(function anomalie(){
  const {s,id}=freshVisit('Darty');
  const a=M.addAnomaly(s,id);                       // famille active : brun
  M.editAnomaly(s,id,a,'Téléviseur de démonstration éteint');
  const brun=R.build(s,id,'brun'),blanc=R.build(s,id,'blanc');
  const section=brun.split('### 5. Points de blocage / À suivre')[1].split('###')[0];
  assert.ok(section.includes('- Téléviseur de démonstration éteint'),'l’anomalie brun est en section 5 du BRUN');
  assert.ok(!blanc.includes('Téléviseur de démonstration éteint'),'et absente du BLANC');
})();

// --- 7. Une opportunité est à la fois un blocage et une note 6P -----------------------
(function opportunite(){
  const {s,id}=freshVisit('Darty');
  M.edit6P(s,id,'place',1,'status','opportunity');
  M.edit6P(s,id,'place',1,'comment','Deux facings à gagner en tête de gondole');
  const txt=R.build(s,id,'brun');
  const blocs=txt.split('### 5. Points de blocage / À suivre')[1].split('###')[0];
  const notes=txt.split('**Notes 6P — famille BRUN**')[1];
  assert.ok(blocs.includes('PLACE · Emplacement : Deux facings à gagner en tête de gondole'),'en section 5');
  assert.ok(notes.includes('PLACE · Emplacement · Opportunité : Deux facings à gagner en tête de gondole'),'et dans les Notes 6P, avec son statut lisible');
})();

// --- Les actions ouvertes de la visite remontent en blocages --------------------------
(function actions(){
  const {s,id}=freshVisit('Darty');
  M.edit6P(s,id,'prix',0,'action','Refaire l’étiquetage du rayon');
  M.actionFrom6P(s,id,'prix',0);
  const txt=R.build(s,id,'brun');
  assert.ok(txt.includes('- À suivre : Refaire l’étiquetage du rayon · responsable à définir · sans échéance'),
    'une action sans responsable ni échéance le dit, au lieu de laisser un vide');
})();

// --- 8. Comptage des photos -----------------------------------------------------------
(function photos(){
  const {s,id}=freshVisit('Darty');
  const rows=[{family:'blanc',moment:'avant'},{family:'blanc',moment:'avant'},{family:'',moment:'avant'},{family:'blanc',moment:'apres'}];
  const txt=R.build(s,id,'blanc',rows);
  assert.ok(txt.includes('> **Photos :** 3 avant / 1 après jointes à ce message.'),'trois avant et un après');
  const count=txt.match(/\*\*Photos :\*\* (\d+) avant \/ (\d+) après/);
  assert(count,'la ligne photo doit rester lisible et comptable');
  assert.equal(Number(count[1])+Number(count[2]),rows.length,'le texte annonce exactement le nombre de fichiers transmis au bouton de partage');
  assert.ok(R.build(s,id,'blanc',[]).includes('> **Photos :** '+PH),'aucune photo → le marqueur, pas une ligne « 0 avant / 0 après »');
  assert.ok(R.build(s,id,'brun',[{family:'blanc',moment:'avant'}]).includes('> **Photos :** '+PH),'une photo BLANC ne compte pas pour BRUN');
  console.error('  Photos BLANC (3 avant, 1 après, 1 non étiquetée) : ligne « 3 avant / 1 après »');
})();

// --- 9. build est pure : ni window, ni global.state ------------------------------------
(function pure(){
  const {s,id}=freshVisit('Darty');
  const avantState=global.state,avantWindow=global.window;
  global.state=undefined;global.window=undefined;
  try{
    const txt=R.build(s,id,'brun');
    assert.ok(txt.startsWith('# COMPTE RENDU DE VISITE'),'build réussit sans aucun global');
    assert.equal(JSON.stringify(s),JSON.stringify(s),'et ne mute pas l’état');
  }finally{global.state=avantState;global.window=avantWindow}
})();

// --- 10. Mise en forme : pas de ligne vide double, un seul \n final -------------------
(function forme(){
  const {s,id}=freshVisit('Darty');
  M.editReport(s,id,'shared','context','Magasin en travaux.\n\n\nFlux dévié.');
  M.editReport(s,id,'brun','team','Équipe réduite.   ');
  const txt=R.build(s,id,'brun');
  assert.ok(!/\n{3,}/.test(txt),'jamais trois sauts de ligne d’affilée');
  assert.ok(!/[ \t]+\n/.test(txt),'aucun espace en fin de ligne');
  assert.ok(txt.endsWith('\n')&&!txt.endsWith('\n\n'),'le texte finit par un \\n unique');
})();

// --- 11. Cuisinistes : un seul compte rendu, blanc puis brun --------------------------
(function cuisiniste(){
  const {s,id}=freshVisit('Schmidt');
  M.editReport(s,id,'blanc','team','Côté électroménager intégré.');
  M.editReport(s,id,'brun','team','Côté image et son.');
  M.editReport(s,id,'blanc','massification','Îlot cuisine réimplanté.');
  const txt=R.build(s,id,'brun');
  assert.ok(txt.startsWith('# COMPTE RENDU DE VISITE — CUISINISTE'),'le squelette cuisiniste');
  assert.ok(!txt.includes('Famille '),'pas de mention de famille sur un compte rendu unique');
  assert.ok(!txt.includes('**Photos :**'),'pas de ligne photos sur ce squelette');
  const i=txt.indexOf('Côté électroménager intégré.'),j=txt.indexOf('Côté image et son.');
  assert.ok(i>=0&&j>i,'les deux blocs sont concaténés, blanc puis brun');
  assert.ok(txt.slice(i,j).includes('\n\n'),'séparés par une ligne vide');
  assert.equal(R.build(s,id,'blanc'),txt,'la famille demandée est ignorée sur ce squelette');
  assert.ok(txt.includes('### 2. Point Produits & Concurrence\nÎlot cuisine réimplanté.'),'un seul bloc non vide suffit');
})();

// --- Buying group : les six sections attendues ----------------------------------------
(function buyingGroup(){
  const {s,id}=freshVisit('Gitem');
  const txt=R.build(s,id,'brun');
  assert.ok(txt.startsWith('# COMPTE RENDU DE VISITE — BUYING GROUP'));
  for(const titre of ['### 1. Suivi Magasin & Profil','### 2. Point Produits & Concurrence','### 3. Formation & Newsletter',
    '### 4. Écosystème SAV & Technique','### 5. Contexte Marché',"### 6. Plan d'Action"])
    assert.ok(txt.includes(titre),'section attendue : '+titre);
})();

// --- Une visite d'avant le ticket 1 ne fait pas tomber le générateur ------------------
(function ancienne(){
  const {s,id}=freshVisit('Darty'),v=M.getVisit(s,id);
  delete v.activeFamily;delete v.report;
  for(const rows of Object.values(v.sixP))for(const row of rows)delete row.family;
  const empreinte=JSON.stringify(s);
  const txt=R.build(s,id,'blanc');
  assert.ok(txt.includes('Famille BLANC'),'le compte rendu se produit quand même');
  assert.equal(JSON.stringify(s),empreinte,'et build ne réécrit pas la visite');
})();

// --- Le module ne s'approprie rien qui ne lui appartienne -----------------------------
(function proprete(){
  const src=require('fs').readFileSync(__dirname+'/../visit-report-slack.js','utf8');
  assert.ok(!/new MutationObserver/.test(src),'aucun MutationObserver');
  assert.ok(!/setInterval\s*\(/.test(src),'aucun setInterval');
  assert.ok(!/addEventListener\(['"](focus|visibilitychange)['"]/.test(src),'aucune réinstallation sur focus ni visibilitychange');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest/.test(src),'aucun appel réseau : tout doit marcher hors ligne');
  assert.ok(/store-runner:data-restored/.test(src)&&/store-runner:planning-updated/.test(src),'réinstallation sur les seuls événements publics');
  assert.equal((src.match(/srReportSheet/g)||[]).length>0,true,'la feuille porte bien son identifiant');
  assert.ok(src.includes("api.listByFamily(v.storeId,activeTab)"),'le bouton relit les photos de la famille active');
  assert.ok(src.includes("api.shareRecords(rows)"),'le bouton transmet exactement ces lignes à StorePhotosV1');
  assert.ok(src.includes("Aucune photo pour cette famille."),'zéro photo donne un état explicite et désactivé');
  assert.ok(src.includes("Partage annulé."),'une annulation du partage n’est pas traitée comme une panne');
  for(const nom of ['window.renderAll','window.state=','window.StoreRunnerVisits='])
    assert.ok(!src.includes(nom+'='),'ne redéfinit pas '+nom);
})();

console.log('PASS: trois squelettes, familles étanches, marqueurs sur tout champ vide, comptage photos, partage par famille et build pure — sans DOM, sans réseau, sans global.');
