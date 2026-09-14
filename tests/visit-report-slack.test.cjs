const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../store-runner-visit-model.js');
const R=require('../visit-report-slack.js');

const PH='[Non renseigné par le FMT]';
function sector(enseigne){return {schemaVersion:5,profile:{baseName:'Ville-Base'},settings:{days:['Lundi']},stores:[{id:'m1',enseigne,ville:'Villeneuve-Fictive'}],notes:{},visits:{},plan:{Lundi:[]},appointments:[],calendarEvents:[]}}
function freshVisit(enseigne){const s=M.clone(sector(enseigne||'Darty')),id=M.start(s,'m1');M.getVisit(s,id).createdAt='2026-09-15T08:00:00.000Z';return {s,id}}

// Le choix d'enseigne reste inchangé : seule la saisie terrain est simplifiée.
for(const [enseigne,attendu] of [['Darty','grands-magasins'],['BOULANGER','grands-magasins'],['But','grands-magasins'],['Schmidt','cuisinistes'],['Cuisinella','cuisinistes'],['Gitem','buying-groups'],['Pro&Cie','buying-groups'],['Enseigne Inconnue','grands-magasins']])assert.equal(R.skeletonFor(enseigne),attendu);

// Une visite neuve n'impose plus cinq sous-formulaires : contexte, note, photos, à suivre, prochain passage.
(function vide(){const {s,id}=freshVisit('Darty'),txt=R.build(s,id,'brun',[]),n=(txt.match(/\[Non renseigné par le FMT\]/g)||[]).length;assert.equal(n,5,'le CR vide ne doit exposer que cinq zones utiles');assert.ok(txt.includes('### Note terrain'));assert.ok(txt.includes('### Formation / prochain passage'));assert.ok(!txt.includes('Notes 6P'),'les 6P restent une aide legacy invisible');assert.ok(!txt.includes('### Actions réalisées'),'un ancien bloc vide ne pollue pas le CR');assert.ok(!/\n{3,}/.test(txt))})();

// Une seule grande note par famille, avec contexte commun et prochain passage séparé.
(function carnet(){const {s,id}=freshVisit('Boulanger');M.editReport(s,id,'shared','context','Magasin récent, équipe demandeuse.');M.editReport(s,id,'brun','team','Sandrine : Glare Free est un argument fort face à LG.');M.editReport(s,id,'brun','training','Prévoir une formation nouveautés 2026.');M.editReport(s,id,'blanc','team','Retour SAV à approfondir sur le froid.');const brun=R.build(s,id,'brun',[]),blanc=R.build(s,id,'blanc',[]);assert.ok(brun.includes('Glare Free est un argument fort'));assert.ok(!blanc.includes('Glare Free est un argument fort'));assert.ok(blanc.includes('Retour SAV à approfondir'));assert.ok(brun.includes('Prévoir une formation nouveautés 2026.'));assert.ok(brun.includes('Magasin récent')&&blanc.includes('Magasin récent'))})();

// Les anciennes données détaillées ne sont jamais perdues : elles réapparaissent seulement si elles existent.
(function legacyReport(){const {s,id}=freshVisit('Darty');M.editReport(s,id,'brun','actions','Mise à jour démo effectuée.');M.editReport(s,id,'brun','massification','Entrée magasin uniquement.');M.editReport(s,id,'brun','omni','PLV manquante.');const txt=R.build(s,id,'brun',[]);assert.ok(txt.includes('### Actions réalisées\nMise à jour démo effectuée.'));assert.ok(txt.includes('### Massification / exposition\nEntrée magasin uniquement.'));assert.ok(txt.includes('### Suivi OMNI\nPLV manquante.'))})();

// Les 6P anciens peuvent toujours alimenter « à suivre », sans redevenir un formulaire visible.
(function sixPLegacy(){const {s,id}=freshVisit('Darty');M.edit6P(s,id,'place',1,'status','opportunity');M.edit6P(s,id,'place',1,'comment','Deux facings à gagner en tête de gondole');const txt=R.build(s,id,'brun',[]),section=txt.split('### À suivre / points de blocage')[1].split('###')[0];assert.ok(section.includes('PLACE · Emplacement : Deux facings à gagner en tête de gondole'));assert.ok(!txt.includes('Notes 6P'))})();

(function famillesLegacy(){const {s,id}=freshVisit('Darty');M.edit6P(s,id,'prix',0,'status','correct');M.edit6P(s,id,'prix',0,'comment','Étiquette lave-linge absente');M.edit6P(s,id,'prix',0,'family','blanc');const blanc=R.build(s,id,'blanc',[]),brun=R.build(s,id,'brun',[]);assert.ok(blanc.includes('Étiquette lave-linge absente'));assert.ok(!brun.includes('Étiquette lave-linge absente'))})();

(function anomalie(){const {s,id}=freshVisit('Darty'),a=M.addAnomaly(s,id);M.editAnomaly(s,id,a,'Téléviseur de démonstration éteint');const brun=R.build(s,id,'brun',[]),blanc=R.build(s,id,'blanc',[]);assert.ok(brun.includes('Téléviseur de démonstration éteint'));assert.ok(!blanc.includes('Téléviseur de démonstration éteint'))})();

(function actions(){const {s,id}=freshVisit('Darty');M.edit6P(s,id,'prix',0,'action','Refaire l’étiquetage du rayon');M.actionFrom6P(s,id,'prix',0);const txt=R.build(s,id,'brun',[]);assert.ok(txt.includes('- À suivre : Refaire l’étiquetage du rayon · responsable à définir · sans échéance'))})();

(function photos(){const {s,id}=freshVisit('Darty'),rows=[{family:'blanc',moment:'avant'},{family:'blanc',moment:'avant'},{family:'',moment:'avant'},{family:'blanc',moment:'apres'}],txt=R.build(s,id,'blanc',rows);assert.ok(txt.includes('> **Photos :** 3 avant / 1 après jointes à ce message.'));const count=txt.match(/\*\*Photos :\*\* (\d+) avant \/ (\d+) après/);assert(count);assert.equal(Number(count[1])+Number(count[2]),rows.length);assert.ok(R.build(s,id,'brun',[{family:'blanc',moment:'avant'}]).includes('> **Photos :** '+PH))})();

// Cuisinistes / buying groups gardent un CR unique, mais utilisent eux aussi le carnet simple.
(function merged(){for(const [enseigne,titre] of [['Schmidt','# COMPTE RENDU DE VISITE — CUISINISTE'],['Gitem','# COMPTE RENDU DE VISITE — BUYING GROUP']]){const {s,id}=freshVisit(enseigne);M.editReport(s,id,'blanc','team','Note blanc.');M.editReport(s,id,'brun','team','Note brun.');const txt=R.build(s,id,'brun');assert.ok(txt.startsWith(titre));assert.ok(!txt.includes('Famille '));assert.ok(txt.includes('Note blanc.\n\nNote brun.'));assert.ok(!txt.includes('**Photos :**'));assert.equal(R.build(s,id,'blanc'),txt)}})();

(function ancienne(){const {s,id}=freshVisit('Darty'),v=M.getVisit(s,id);delete v.activeFamily;delete v.report;for(const rows of Object.values(v.sixP))for(const row of rows)delete row.family;const empreinte=JSON.stringify(s),txt=R.build(s,id,'blanc',[]);assert.ok(txt.includes('Famille BLANC'));assert.equal(JSON.stringify(s),empreinte)})();

(function pure(){const {s,id}=freshVisit('Darty'),avant=JSON.stringify(s),oldState=global.state,oldWindow=global.window;global.state=undefined;global.window=undefined;try{assert.ok(R.build(s,id,'brun',[]).startsWith('# COMPTE RENDU DE VISITE'));assert.equal(JSON.stringify(s),avant)}finally{global.state=oldState;global.window=oldWindow}})();

// Le parcours visible ne doit plus ressembler à TeamHaven.
(function uiSimple(){const src=fs.readFileSync(__dirname+'/../store-runner-visits.js','utf8');assert.ok(src.includes("const VISIBLE_STEPS=[3,5]"),'seuls Terrain et Suivi restent visibles');assert.ok(!src.includes('Méthode 6P'),'aucune étape 6P visible');assert.ok(!src.includes('function sixP('),'aucun formulaire 6P rendu');assert.ok(src.includes('Famille active : '),'la famille active est explicitement affichée');assert.ok(src.includes("'Note terrain '+family.toUpperCase()"));assert.ok(src.includes("'Prochain passage / formation '+family.toUpperCase()"));assert.ok(src.includes('api.open(v.storeId)'),'les photos sont accessibles directement depuis le carnet')})();

(function proprete(){const src=fs.readFileSync(__dirname+'/../visit-report-slack.js','utf8');assert.ok(!/new MutationObserver/.test(src));assert.ok(!/setInterval\s*\(/.test(src));assert.ok(!/\bfetch\s*\(|XMLHttpRequest/.test(src),'aucun appel réseau');assert.ok(/store-runner:data-restored/.test(src)&&/store-runner:planning-updated/.test(src));assert.ok(src.includes('api.listByFamily(v.storeId,activeTab)'));assert.ok(src.includes('api.shareRecords(rows)'));assert.ok(src.includes('Aucune photo pour cette famille.'));assert.ok(src.includes('Partage annulé.'))})();

console.log('PASS: carnet terrain simple BLANC/BRUN, 6P legacy invisible, CR Slack concis et photos par famille.');