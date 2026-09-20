const fs=require('fs');
const assert=require('assert/strict');

const OPENING_SRC=fs.readFileSync(__dirname+'/../store-opening-hours.js','utf8');
const TIMELINE_SRC=fs.readFileSync(__dirname+'/../timeline-end-times.js','utf8');
const RUNTIME=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');

// --- Le point de départ du bug, figé pour qu'il ne revienne pas ------------------------
// `selectedPlanningDay` est une variable privée de l'IIFE du planning : elle n'est pas
// exposée sur window. Tant que c'est le cas, aucun module de décoration ne doit fonder
// le jour affiché sur `root.selectedPlanningDay` seul — il retomberait sur le premier
// jour travaillé et réécrirait la timeline avec les heures du lundi.
assert(!/window\.selectedPlanningDay\s*=/.test(RUNTIME),
  'si le runtime exporte enfin selectedPlanningDay, ce test et la cascade de secours peuvent être simplifiés');
assert(/function dayFromRows\(\)/.test(OPENING_SRC),'le jour affiché doit pouvoir être lu sur les lignes rendues');
assert(/openStoreQuick/.test(OPENING_SRC),'la source du jour est le onclick écrit par renderWeek');
const dayNowBody=OPENING_SRC.slice(OPENING_SRC.indexOf('function dayNow()'),OPENING_SRC.indexOf('function hintText'));
assert(/dayFromRows\(\)/.test(dayNowBody)&&/dayFromTabs\(\)/.test(dayNowBody),
  'dayNow doit consulter les lignes rendues puis les onglets avant toute valeur par défaut');
assert(dayNowBody.indexOf('dayFromRows()')<dayNowBody.indexOf('days)||DAYS)[0]'),
  'le repli sur le premier jour travaillé doit rester le dernier recours');

// --- Aucun recalcul d'itinéraire dans la couche d'affichage ---------------------------
const TL=TIMELINE_SRC.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
assert.doesNotMatch(TL,/\bsetInterval\s*\(/,'aucune boucle de surveillance permanente');
for(const forbidden of ['hav(','roadMinutes(','optimize(','nearestRoute(','twoOpt(']) 
  assert(!TL.includes(forbidden),'la couche d’affichage ne doit pas recalculer la tournée: '+forbidden);
assert(/StoreOpeningHoursV1/.test(TL),'les minutes de trajet doivent venir de l’ordonnanceur existant');
assert(/scheduleRoute/.test(TL),'en lecture seule via scheduleRoute');
for(const owned of ['renderWeek','renderAll','daySchedule','generateWeek'])
  assert.doesNotMatch(TL,new RegExp('window\\.'+owned+'\\s*=(?!=)'),'propriétaire runtime contourné: '+owned);

// --- dayNow lit réellement le jour rendu ----------------------------------------------
function fakeDom(day){
  const main={getAttribute:name=>name==='onclick'?"openStoreQuick('s1','"+day+"','09:30')":null};
  return {
    querySelector(sel){
      if(sel.includes('.tlMain[onclick]'))return day?main:null;
      return null;
    },
    addEventListener(){},
    getElementById(){return null}
  };
}
// Le module ne démarre son interface que si un document existe : on le charge sans DOM,
// puis on lui présente une timeline de fortune au moment de l'appel.
const previousState=global.state;
global.state={settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']},plan:{},stores:[]};
const opening=require('../store-opening-hours.js');
assert.equal(typeof opening.dayNow,'function','dayNow doit être exposé pour les autres décorateurs');
global.document=fakeDom('Mardi');
assert.equal(opening.dayNow(),'Mardi','le jour doit venir des lignes réellement rendues');
global.document=fakeDom('Vendredi');
assert.equal(opening.dayNow(),'Vendredi','et suit le jour consulté, quel qu’il soit');
global.document=fakeDom(null);
assert.equal(opening.dayNow(),'Lundi','sans timeline rendue, le premier jour travaillé reste le repli');
delete global.document;global.state=previousState;

// --- Le trajet est nommé, y compris quand il s'arrondit à zéro ------------------------
delete require.cache[require.resolve('../timeline-end-times.js')];
const timeline=require('../timeline-end-times.js');
const {travelLabel}=timeline;
assert.equal(travelLabel(153,true),'↓ 153 min de trajet depuis le départ');
assert.equal(travelLabel(12,false),'↓ 12 min de trajet depuis le magasin précédent');
// Le cas qui a créé la confusion : 14:03 → 14:03 n'est pas un trajet oublié.
assert.equal(travelLabel(0,false),'↓ trajet de moins d’une minute depuis le magasin précédent');
assert.equal(travelLabel(0.4,false),'↓ trajet de moins d’une minute depuis le magasin précédent');
for(const absent of [null,undefined,'',' ','abc',NaN,Infinity])
  assert.equal(travelLabel(absent,false),'','une donnée absente n’invente aucun trajet: '+String(absent));
assert.equal(travelLabel(-3,false),'','une valeur aberrante n’invente aucun trajet');

// --- L'heure affichée est nommée, et la durée dit « sur place » -----------------------
assert(/content:"Arrivée"/.test(TIMELINE_SRC),'la colonne horaire doit être étiquetée « Arrivée »');
assert(/\.tlTime::before/.test(TIMELINE_SRC),'l’étiquette doit être posée en CSS, pas en texte');
assert(!/\.tlTime['"]?\)?\.textContent\s*=/.test(TL),'la cellule .tlTime appartient à l’ordonnanceur : ne pas la réécrire ici');
assert(/sur place · fin /.test(TIMELINE_SRC),'la durée doit dire qu’il s’agit du temps sur place');
assert(/arrivée estimée au magasin/i.test(TIMELINE_SRC),'la légende doit nommer l’arrivée estimée');

console.log('planning hours: jour rendu respecté, arrivée nommée, trajet explicite ok');
