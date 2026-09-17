const assert=require('node:assert/strict');
const P=require('../performance-data-v190.js');
const F=require('./helpers/xlsx-fixture.cjs');

// V191 — le classeur réel encode toutes ses cellules texte en
// `t="inlineStr"`. Le parseur V190 lisait le type avec /\st="([a-z]+)"/ : le S majuscule
// faisait échouer le motif, le type retombait sur numérique, aucun <v> n'existe pour ces
// cellules, et tout le texte devenait null — y compris la ligne d'en-tête. L'écran
// affichait alors « Colonnes Prios / Site name introuvables dans ce fichier. »
//
// La fixture ci-dessous reproduit la STRUCTURE du fichier réel. Le fichier lui-même n'est
// jamais copié dans le dépôt : seules sa forme et ses en-têtes sont reproduits, toutes les
// valeurs sont inventées.

(async function suite(){

const {bytes,expected}=F.sectorInlineStr();

// --- La fixture a bien la forme du fichier réel ---------------------------------------
const entrees=F.entryNames(bytes);
assert.ok(!entrees.includes('xl/sharedStrings.xml'),'aucun sharedStrings.xml, comme dans le classeur réel');
assert.ok(entrees.includes('xl/worksheets/sheet1.xml'),'la feuille est là');
assert.ok(entrees.includes('xl/_rels/workbook.xml.rels'),'les relations aussi');
const fichiers=await P.unzip(bytes);
assert.equal(fichiers['xl/sharedStrings.xml'],undefined,'le parseur ne trouve aucune table de chaînes partagées');
const feuilleXml=fichiers['xl/worksheets/sheet1.xml'];
const inline=(feuilleXml.match(/t="inlineStr"/g)||[]).length;
const partagees=(feuilleXml.match(/t="s"/g)||[]).length;
assert.equal(inline,expected.cellulesTexte,'les '+expected.cellulesTexte+' cellules texte sont toutes en inlineStr');
assert.equal(partagees,0,'et aucune en chaîne partagée');

// --- Les cellules exactes citées dans l'issue ----------------------------------------
assert.deepEqual(P.classify('Prios'),{kind:'prio'});
const cellules=[
  ['<c r="A1" t="inlineStr"><is><t>Target = 42.5%</t></is></c>','Target = 42.5%'],
  ['<c r="A14" s="9" t="inlineStr"><is><t>Prios</t></is></c>','Prios'],
  ['<c r="B14" s="9" t="inlineStr"><is><t>Retailer</t></is></c>','Retailer'],
  ['<c r="C14" s="9" t="inlineStr"><is><t>Site name</t></is></c>','Site name']
];
for(const [xml,attendu] of cellules){
  const type=(xml.match(/\st="([^"]+)"/)||[])[1];
  assert.equal(type,'inlineStr','le type se lit sans présumer de la casse : '+attendu);
  assert.ok(!/^[a-z]+$/.test(type),'et c’est bien la casse qui cassait l’ancien motif');
}

// --- La feuille se lit : en-tête en ligne 14, A1 en clair -----------------------------
const feuille=await P.readSheet(bytes);
assert.equal(feuille[0][0],'Target = 42.5%','A1 est lue comme du texte, plus comme null');
assert.deepEqual(feuille[13].slice(0,3),['Prios','Retailer','Site name'],'la ligne 14 porte les trois colonnes attendues');
assert.equal(feuille[1][0],'Bloc 2','le bloc de titre au-dessus de l’en-tête est lu lui aussi');

// --- Les chiffres de contrôle du fichier réel ----------------------------------------
const snap=await P.parseWorkbook(bytes,{week:'W34',now:'2026-09-16T10:00:00Z'});
assert.equal(snap.rows.length,expected.lignes,'51 lignes utiles');
const c=P.counts(snap.rows);
assert.equal(c.P1,expected.P1,'7 Prio 1');
assert.equal(c.P2,expected.P2,'25 Prio 2');
assert.equal(c.watch,expected.watch,'18 À surveiller');
assert.equal(c.nodata,expected.nodata,'1 sans data');
assert.equal(snap.targetPdm,expected.target,'cible 42,5 %');
assert.equal(snap.targetSource,'explicite','lue en A1, pas déduite');
const complets=snap.rows.filter(r=>r.pdmYtd!=null&&r.weeks.W32!=null&&r.weeks.W33!=null&&r.weeks.W34!=null);
assert.equal(complets.length,expected.avecPdm,'37 magasins avec PDM et les trois semaines');
const avecEuro=snap.rows.filter(r=>r.evolYtd!=null&&r.sellOutYtd!=null);
assert.equal(avecEuro.length,expected.avecEvolEtSellOut,'33 avec évolution YTD et sell-out €');
console.error('  Fichier inlineStr : '+snap.rows.length+' lignes · '+c.P1+' P1 · '+c.P2+' P2 · '+c.watch+' à surveiller · '+c.nodata+' sans data');
console.error('  '+complets.length+' avec PDM et W32-W34 · '+avecEuro.length+' avec évolution et sell-out · '+inline+' cellules inlineStr · '+partagees+' partagées · cible '+snap.targetPdm+' % ('+snap.targetSource+')');

// --- Les autres types de cellules restent lus ----------------------------------------
await (async function tousLesTypes(){
  const entete=['Prios','Retailer','Site name','YTD IHS W34'];
  /* Une feuille qui mélange les cinq encodages : chaîne partagée, inlineStr, formule
     texte, erreur, nombre brut et nombre en format pourcentage. */
  const mixte=F.build([entete,['Prio 1','Darty','Ville-Test',{percent:'0.4100'}]]);
  const lu=await P.readSheet(mixte);
  assert.deepEqual(lu[0],entete,'les chaînes partagées (t="s") restent lues');
  assert.equal(lu[1][3],41,'un nombre en format pourcentage ressort en points');
  const brut='<?xml version="1.0"?><worksheet><sheetData>'
    +'<row r="1"><c r="A1" t="str"><v>formule</v></c><c r="B1" t="e"><v>#N/A</v></c>'
    +'<c r="C1"><v>12.5</v></c><c r="D1" s="1"><v>0.425</v></c>'
    +'<c r="E1" t="inlineStr"><is><t>texte en ligne</t></is></c><c r="F1"/></row></sheetData></worksheet>';
  // On passe par la fabrique de la fixture pour rester sur du vrai .xlsx.
  const melange=F.zip([
    {name:'xl/styles.xml',data:'<?xml version="1.0"?><styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'},
    {name:'xl/worksheets/sheet1.xml',data:brut}
  ]);
  const ligne=(await P.readSheet(melange))[0];
  assert.equal(ligne[0],'formule','t="str" reste lu');
  assert.equal(ligne[1],'#N/A','t="e" reste lu');
  assert.equal(ligne[2],12.5,'un nombre brut reste un nombre');
  assert.equal(ligne[3],42.5,'un nombre en format pourcentage est ramené en points');
  assert.equal(ligne[4],'texte en ligne','et inlineStr est lu sans table de chaînes');
  assert.equal(ligne[5],null,'une cellule vide reste vide, jamais 0');
  console.error('  Types conservés : s · str · e · nombre · pourcentage · inlineStr · vide');
})();

// --- Le fichier réel n'est jamais dans le dépôt --------------------------------------
(function depotPropre(){
  const suivis=require('child_process').execSync('git ls-files',{cwd:__dirname+'/..',encoding:'utf8'}).split('\n').filter(Boolean);
  assert.deepEqual(suivis.filter(f=>/\.(xlsx|xlsm|xls)$/i.test(f)),[],'aucun classeur versionné');
  assert.ok(!suivis.some(f=>/rhone[- ]?alpes/i.test(f)),'le fichier réel n’entre jamais dans le dépôt');
  assert.ok(!suivis.some(f=>/^tests\/.*\.(xlsx|xls)$/i.test(f)),'et surtout pas copié dans tests/');
})();

// --- Aucune règle métier V190 n'a bougé ------------------------------------------------
(function metierIntact(){
  const src=require('fs').readFileSync(__dirname+'/../performance-data-v190.js','utf8');
  // Les invariants V190, vérifiés ici pour que le correctif de parseur ne les entame pas.
  assert.ok(/function statusOf\(/.test(src)&&/basedOn:'ytd'/.test(src),'le statut reste calculé sur le YTD');
  assert.ok(/usage:'tendance'/.test(src),'les semaines restent réservées à la tendance');
  assert.ok(/function completedVisitsFor\(/.test(src)&&/v\.status==='completed'/.test(src),'« déjà visité » reste une visite terminée');
  assert.ok(!/\.priority\s*=[^=]/.test(src),'store.priority n’est toujours pas écrit');
  assert.ok(!/removeItem\s*\(/.test(src),'rien n’est supprimé du stockage');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest/.test(src),'et rien ne part sur un serveur');
})();

console.log('PASS: le classeur réel en inlineStr est lu — 51 lignes, 7 P1, cible 42,5 % explicite, en-tête en ligne 14, sans sharedStrings — et les types s/str/e/nombre/pourcentage restent supportés.');
})().catch(e=>{console.error(e);process.exit(1)});
