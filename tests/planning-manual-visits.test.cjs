const fs=require('fs'),assert=require('assert/strict');
const Manual=require('../planning-manual-visits.js');
const source=fs.readFileSync(__dirname+'/../planning-manual-visits.js','utf8');

function store(id,enseigne,ville){return{id,enseigne,ville,active:true}}
const a=store('a','Auchan','Saint-Priest'),b=store('b','Boulanger','Saint-Priest'),c=store('c','Darty','Bron');
const state={stores:[a,b,c],excluded:{},plan:{Lundi:[a,b],Mardi:[c],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},settings:{weekDate:'2026-09-15'}};

assert.equal(Manual.currentWeekKey(state),'2026-09-14');
assert.equal(Manual.plannedDay(state,'a'),'Lundi');
let moved=Manual.addToPlan(state,'a','Mardi');
assert.equal(moved.ok,true);assert.equal(moved.sourceDay,'Lundi');
assert.deepEqual(state.plan.Lundi.map(x=>x.id),['b'],'le déplacement retire l’ancien jour');
assert.deepEqual(state.plan.Mardi.map(x=>x.id),['c','a'],'le déplacement ajoute au nouveau jour sans doublon');
assert.equal(Manual.addToPlan(state,'a','Mardi').already,true,'ajouter deux fois le même magasin est idempotent');
let removed=Manual.removeFromPlan(state,'a','Mardi');
assert.equal(removed.ok,true);assert.equal(Manual.plannedDay(state,'a'),'');
assert.equal(Manual.removeFromPlan(state,'a','Mardi').ok,false,'une suppression répétée ne fabrique rien');

const excluded={stores:[a],excluded:{a:true},plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}};
assert.equal(Manual.addToPlan(excluded,'a','Lundi').ok,false,'un magasin exclu ne doit pas être ajouté');

assert.match(source,/glisse une visite à gauche ou à droite/i,'le geste doit être découvrable');
assert.match(source,/Math\.abs\(dx\)<68/,'un swipe court ne doit rien supprimer');
assert.match(source,/confirm\('Retirer /,'la suppression doit demander confirmation');
assert.match(source,/\.timelineRow:not\(\.calendarEvent\)/,'les événements Agenda ne doivent jamais recevoir le geste de suppression');
assert.match(source,/manualWeekEdits/,'une modification manuelle doit protéger la semaine contre une régénération');
assert.match(source,/manualEdited:true/,'l’archive de période doit porter la modification manuelle');
assert.match(source,/＋ Ajouter/,'le planning doit exposer un bouton d’ajout explicite');
assert.match(source,/Déplacer de /,'un magasin déjà prévu ailleurs doit être présenté comme déplaçable');
assert.match(source,/e\.stopPropagation\(\)/,'le swipe de ligne doit empêcher le swipe global de changer de jour en même temps');

console.log('planning-manual-visits: OK');
