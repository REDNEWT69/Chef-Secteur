// V237 — la carte « Prio / Performance » de la fiche magasin doit se lire en cinq
// secondes. Ce test fixe la synthèse déterministe qui la remplit : quel est le problème
// principal, sur quoi agir, quel est le point positif, et quels chiffres le justifient.
//
// Aucune IA n'intervient : la mission du classeur est lue par motifs. Ce test protège
// donc deux choses à la fois — la lecture de la mission, et la retenue de l'affichage.
const assert = require('assert/strict');

require('../performance-data-v190.js');
const UI = require('../performance-ui-v190.js');

const CIBLE = 42.5;
function ligne(extra) {
  return Object.assign({
    prio: 'P1', pdmYtd: 23.9, deltaYtd: -18.6, evolYtd: -28.9,
    weeks: {}, deltaWeeks: {}, sellOutWeeks: {}, sellOutYtd: null, comment: ''
  }, extra || {});
}

// --- 1. Le cas réel : poids OLED sous le plancher, QLED qui recule, Neo QLED qui monte ---
{
  const s = UI.prioritySummary(ligne({
    comment: 'ALERTE OLED: Décroissance OLED | ALERTE OLED: Poids OLED <40% | '
      + 'Reprise requise sur QLED (-58.1% vs N-1) | Capitaliser sur Neo QLED (+138.2%)',
    weeks: { W32: -34.7, W33: -23.4, W34: -24.8 }
  }), CIBLE);

  assert.equal(s.headline, 'Relancer OLED / QLED', 'le titre dit quoi relancer, pas le nom de la colonne');
  assert.match(s.situation, /très sous l’objectif/, 'un écart de 18,6 pt est une situation très dégradée');
  assert.match(s.situation, /23,9 %/);
  assert.match(s.situation, /42,5 % cible/);
  assert.match(s.focus, /OLED sous 40 %/, 'le plancher de poids est le signal le plus fort');
  assert.match(s.focus, /QLED/);
  assert.equal(s.positive, 'Neo QLED +138,2 % progresse fortement.');
  assert.deepEqual(s.actions, [
    'Renforcer la présence et le discours OLED.',
    'Identifier les freins à la vente QLED.'
  ], 'les alertes du classeur deviennent des gestes de visite');
  assert.ok(s.figures.length >= 2 && s.figures.length <= 3, 'deux ou trois chiffres, pas la ligne entière');

  // Le détail du classeur reste disponible, mais il ne remonte pas dans les phrases.
  assert.ok(!/ALERTE/.test(s.situation + s.focus + s.positive + s.actions.join(' ')),
    'aucune phrase ne recopie une alerte brute du classeur');
}

// --- 2. Cinq catégories négatives : seules les deux plus fortes sont retenues ----------
{
  const s = UI.prioritySummary(ligne({
    comment: 'Reprise requise sur QLED (-58.1%) | Reprise requise sur UHD (-53.4%) | '
      + 'Reprise requise sur Crystal (-12.2%) | Reprise requise sur The Frame (-8.1%) | '
      + 'Reprise requise sur Soundbar (-4.5%)'
  }), CIBLE);

  assert.equal(s.signals.families.length, 2, 'jamais plus de deux familles dans la synthèse');
  assert.deepEqual(s.signals.families.map(f => f.label), ['QLED', 'UHD'], 'les deux plus fortes baisses');
  assert.equal(s.headline, 'Relancer QLED / UHD');
  for (const absente of ['Crystal', 'The Frame', 'Soundbar'])
    assert.ok(!s.focus.includes(absente), absente + ' ne doit pas alourdir la carte');
  assert.ok(s.actions.length <= 2, 'une ou deux actions, pas une liste de courses');

  // Le classeur les porte toutes : c'est l'affichage qui trie, pas la lecture.
  assert.equal(s.signals.declines.length, 5, 'aucune donnée du classeur n’est perdue en chemin');
}

// --- 3. Aucune croissance : pas de point positif inventé ------------------------------
{
  const s = UI.prioritySummary(ligne({
    comment: 'Reprise requise sur QLED (-58.1%) | Reprise requise sur UHD (-53.4%)'
  }), CIBLE);
  assert.equal(s.positive, '', 'sans croissance réelle, le bloc positif reste vide');
  assert.equal(s.signals.growth, null);
}

// --- 4. Groupes de tailles en recul ---------------------------------------------------
{
  const s = UI.prioritySummary(ligne({
    comment: 'ALERTE OLED: Poids OLED <40% | baisse 37~43 | baisse 80~85 | baisse 55~65'
  }), CIBLE);

  assert.equal(s.signals.sizes.length, 2, 'deux groupes de tailles au maximum');
  assert.deepEqual(s.signals.sizes.map(t => t.label), ['37–43"', '80–85"']);
  assert.match(s.focus, /faiblesse particulière sur les 37–43" et 80–85"/);
  assert.ok(!s.focus.includes('55–65'), 'le troisième groupe est écarté, pas affiché');

  // Petites et très grandes tailles ne se travaillent pas de la même façon.
  const petites = UI.prioritySummary(ligne({ comment: 'baisse 37~43' }), CIBLE);
  assert.deepEqual(petites.actions, ['Travailler les petites tailles 37–43".']);
  const grandes = UI.prioritySummary(ligne({ comment: 'baisse 80~85' }), CIBLE);
  assert.deepEqual(grandes.actions, ['Vérifier l’exposition et la proposition sur les très grandes tailles.']);
}

// --- 5. Semaine négative qui s'améliore : jamais « hausse » tout court -----------------
{
  const s = UI.prioritySummary(ligne({ weeks: { W32: -34.7, W33: -23.4, W34: -24.8 } }), CIBLE);
  assert.equal(s.weekly.week, 'W34', 'seule la dernière semaine est montrée');
  assert.equal(s.weekly.reading, 'amélioration récente mais toujours en recul');
  assert.ok(!/^hausse$|\bhausse\b/.test(s.weekly.reading),
    'un magasin encore à −24,8 % ne « monte » pas : le mot induirait en erreur');

  // Les autres combinaisons gardent chacune leur mot juste.
  const pire = UI.prioritySummary(ligne({ weeks: { W32: -10, W33: -20, W34: -30 } }), CIBLE);
  assert.equal(pire.weekly.reading, 'dégradation qui se poursuit');
  const plat = UI.prioritySummary(ligne({ weeks: { W32: -20, W33: -25, W34: -20 } }), CIBLE);
  assert.equal(plat.weekly.reading, 'stable, toujours en recul');
  const bon = UI.prioritySummary(ligne({ weeks: { W32: 10, W33: 15, W34: 20 } }), CIBLE);
  assert.equal(bon.weekly.reading, 'en progression');
  const tasse = UI.prioritySummary(ligne({ weeks: { W32: 30, W33: 25, W34: 20 } }), CIBLE);
  assert.equal(tasse.weekly.reading, 'en repli, mais toujours positif');

  // Une seule semaine connue ne permet aucune interprétation : on ne la fabrique pas.
  const seule = UI.prioritySummary(ligne({ weeks: { W34: -24.8 } }), CIBLE);
  assert.equal(seule.weekly.reading, '');
}

// --- 6. Aucune donnée performance -----------------------------------------------------
{
  assert.equal(UI.prioritySummary(null, CIBLE), null, 'sans ligne, aucune synthèse');

  const vide = UI.prioritySummary(ligne({ pdmYtd: null, deltaYtd: null, evolYtd: null }), null);
  assert.equal(vide.focus, '', 'rien à travailler tant que le classeur ne dit rien');
  assert.equal(vide.positive, '');
  assert.deepEqual(vide.actions, []);
  assert.equal(vide.weekly, null);
  assert.match(vide.situation, /Pas de part de marché dans le fichier/);
  assert.equal(vide.headline, 'Performance à regarder', 'aucun titre alarmiste sans données');

  // Une PDM au-dessus de la cible ne doit pas produire un titre de crise.
  const bon = UI.prioritySummary(ligne({ pdmYtd: 48, deltaYtd: 5.5, evolYtd: 3 }), CIBLE);
  assert.equal(bon.headline, 'Tenir le niveau atteint');
  assert.match(bon.situation, /au-dessus de l’objectif/);
}

// --- 7. Encodage : rien de cassé ne doit atteindre l'écran ----------------------------
{
  // Le classeur portait une puce hors BMP. `String.fromCharCode` la tronquait vers la
  // zone privée, ce que le terrain voyait comme un losange noir avant « ALERTE OLED ».
  const tronque = String.fromCharCode(0xF6A8);
  const remplacement = String.fromCharCode(0xFFFD);
  const surrogateSeul = String.fromCharCode(0xD83D);
  const controle = String.fromCharCode(7);

  const sale = tronque + remplacement + surrogateSeul + controle
    + 'ALERTE OLED: Poids OLED <40% | Reprise requise sur QLED (-58.1%)';
  const s = UI.prioritySummary(ligne({ comment: sale }), CIBLE);

  const rendu = [s.headline, s.situation, s.focus, s.positive, s.actions.join(' '),
    s.figures.join(' '), s.signals.mission].join(' ');
  for (const interdit of [tronque, remplacement, surrogateSeul, controle, '|'])
    assert.ok(!rendu.includes(interdit),
      'le rendu ne doit porter ni caractère cassé ni séparateur technique : ' +
      JSON.stringify(interdit));

  assert.ok(s.signals.mission.startsWith('ALERTE OLED'), 'la mission nettoyée commence par son texte');
  assert.equal(s.headline, 'Relancer OLED / QLED', 'le nettoyage ne casse pas la lecture');

  // Et la source du défaut est corrigée à la lecture du classeur : une référence XML
  // hors BMP se décode entière au lieu d'être tronquée vers la zone privée.
  const P = require('../performance-data-v190.js');
  const puce = String.fromCodePoint(0x1F6A8);
  assert.equal(P.unescapeXml('&#128680;ALERTE OLED'), puce + 'ALERTE OLED',
    'une référence décimale hors BMP doit rendre le caractère réel');
  assert.equal(P.unescapeXml('&#x1F6A8;ALERTE OLED'), puce + 'ALERTE OLED',
    'même chose pour la forme hexadécimale');
  assert.ok(!P.unescapeXml('&#128680;x').includes(tronque),
    'la troncature modulo 0x10000 ne doit plus se produire');
  assert.equal(P.unescapeXml('&#55296;OK'), 'OK',
    'un demi-surrogate isolé est ignoré plutôt que rendu');
  assert.equal(P.unescapeXml('&#1114112;OK'), 'OK',
    'une référence hors plage Unicode est ignorée');
  assert.equal(P.unescapeXml('&#65;&amp;&lt;B&gt;'), 'A&<B>',
    'les références classiques restent décodées');
}

// --- La synthèse est pure : mêmes entrées, même sortie -------------------------------
{
  const entree = ligne({ comment: 'ALERTE OLED: Poids OLED <40% | Capitaliser sur Neo QLED (+138.2%)',
    weeks: { W32: -34.7, W34: -24.8 } });
  const a = UI.prioritySummary(entree, CIBLE), b = UI.prioritySummary(entree, CIBLE);
  assert.deepEqual(a, b, 'aucune part d’aléatoire ni d’horloge dans la synthèse');
}

console.log('PASS: synthèse V237 — problème principal, action terrain, point positif, chiffres clés, encodage propre.');
