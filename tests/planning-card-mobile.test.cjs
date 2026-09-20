const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = name => fs.readFileSync(__dirname + '/../' + name, 'utf8');
const TIMELINE = read('timeline-end-times.js');
const RUNTIME = read('src/chef-secteur.html');
const HOURS = read('store-opening-hours.js');
const EDITOR = read('planning-manual-hours.js');
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TL = strip(TIMELINE);

// --- Le bloc ARRIVÉE réutilise l'éditeur, il ne le refait pas -------------------------
assert(/StoreRunnerManualHours/.test(TL), 'le bloc horaire doit passer par l’éditeur existant');
assert(/api\.open\(time\.dataset\.tlStore,\s*time\.dataset\.tlDay\)/.test(TL),
  'il doit appeler StoreRunnerManualHours.open avec le magasin et le jour de la ligne');
assert(/openStoreQuick\\\('\(\[\^'\]\*\)','\(\[\^'\]\*\)'/.test(TL),
  'le magasin et le jour se lisent dans le onclick écrit par renderWeek');
assert(/setAttribute\('role','button'\)/.test(TL), 'le bloc horaire doit être annoncé comme un bouton');
assert(/tabindex/.test(TL) && /'keydown'/.test(TL), 'et rester atteignable au clavier');
// Aucune duplication de l'éditeur ni de sa logique de données.
for (const owned of ['deriveDuration', 'applyManual', 'clearManual', 'buildEntry', 'state.appointments']) {
  assert(!TL.includes(owned), 'le décorateur ne doit pas refaire l’éditeur horaire : ' + owned);
}

// --- La flèche continue d'ouvrir la fiche magasin ------------------------------------
// Elle vit dans .tlMain, qui porte le onclick openStoreQuick : la carte garde son geste.
const rowMarkup = RUNTIME.slice(RUNTIME.indexOf("h+='<div class=\"timelineRow'"), RUNTIME.indexOf("var el=document.getElementById('week')"));
assert(/<div class="tlMain" onclick="openStoreQuick\(/.test(rowMarkup),
  'la carte doit continuer d’ouvrir la fiche magasin');
const mainBlock = rowMarkup.slice(rowMarkup.indexOf('<div class="tlMain"'));
assert(mainBlock.includes('tlChevron'), 'la flèche doit rester dans la zone qui ouvre la fiche magasin');
assert(!/class="tlTime"[^>]*onclick/.test(rowMarkup), 'le bloc horaire ne doit pas ouvrir la fiche magasin');

// --- Mise en page mobile --------------------------------------------------------------
assert(/\.tlName\{word-break:normal;overflow-wrap:break-word/.test(TL),
  'le nom du magasin ne doit plus pouvoir se couper au milieu d’un mot');
assert(/\.'\+SECONDARY_CLASS\+'\{grid-column:1\/-1/.test(TL),
  'les informations secondaires doivent traverser toute la largeur de la carte');
// Le calque de balayage de planning-manual-visits.js couvre la ligne entière et ne
// remonte que .tlMain : sans position/z-index, le bloc horaire reste inatteignable.
assert(/\.tlTime\{position:relative;z-index:1/.test(TL),
  'le bloc horaire doit passer au-dessus du calque de balayage');
assert(/content:"Arrivée imposée"/.test(TIMELINE), 'le mode imposé doit être nommé dans le libellé');
assert(/content:"Arrivée"/.test(TIMELINE), 'le mode automatique garde son libellé');
assert(/content:"✎"/.test(TIMELINE), 'une affordance d’édition discrète doit être visible');

// --- Le repère de pose est clarifié, sa logique est intacte ---------------------------
assert(RUNTIME.includes('📌 Visite placée manuellement'),
  'le repère doit dire qu’il s’agit du placement de la visite, pas d’un horaire');
assert(!RUNTIME.includes('📌 Posé à la main'), 'l’ancien libellé ambigu ne doit plus subsister');
assert(/\(pinned\?' pinnedVisit':''\)/.test(RUNTIME), 'la logique de pose reste inchangée');
assert(/var pinned=lockDayNow\(st\.id\)===selectedPlanningDay/.test(RUNTIME),
  'le repère continue de venir de lockDayNow, rien d’autre');
assert(!/lockDayNow/.test(TL), 'le décorateur ne touche à aucune logique de pose');

// --- Le moteur horaire de #367 n'est pas modifié --------------------------------------
assert(HOURS.includes('arrival=unreachable&&a.manualHours===true?fitted.arrival:fixed;'),
  'la règle de propagation de #367 doit rester telle quelle');
assert(/requestedArrival:fixed/.test(HOURS), 'requestedArrival reste exposé');
assert(!/scheduleRoute\s*=/.test(TL), 'le décorateur ne redéfinit pas l’ordonnanceur');
assert(/manualHours: true/.test(EDITOR), 'le modèle state.appointments reste celui de #367');
assert(/endTime: endTime \? endTime : null/.test(EDITOR), 'et son champ endTime aussi');

console.log('carte planning mobile: bloc arrivée cliquable, flèche intacte, nom et trajet lisibles, moteur inchangé');
