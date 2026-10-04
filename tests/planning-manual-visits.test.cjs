const fs=require('fs'),assert=require('assert/strict');
const Manual=require('../planning-manual-visits.js');
const source=fs.readFileSync(__dirname+'/../planning-manual-visits.js','utf8');

function store(id,enseigne,ville){return{id,enseigne,ville,active:true}}
const a=store('a','Auchan','Ville-Test C'),b=store('b','Boulanger','Ville-Test C'),c=store('c','Darty','Ville-Test B');
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
// Explorer Terrain V1 : chaque refus nomme la contrainte en cause et comment la lever.
{
  const refused=Manual.addToPlan(excluded,'a','Lundi');
  assert.equal(refused.code,'excluded_store');assert.equal(refused.constraint,'excluded');
  assert.match(refused.error,/exclu du planning.*Réactiver.*Mes magasins/);
  const inactive=JSON.parse(JSON.stringify(excluded));inactive.excluded={};inactive.stores[0].active=false;
  const off=Manual.addToPlan(inactive,'a','Lundi');
  assert.equal(off.code,'inactive_store');assert.match(off.error,/désactivé du secteur.*Actif/);
  const unknown=Manual.addToPlan(inactive,'absent','Lundi');
  assert.equal(unknown.code,'unknown_store');assert.match(unknown.error,/n’existe plus/);
  assert.equal(Manual.refusalFor(excluded,{id:'a',active:true},'a').short,'Exclu du planning');
  assert.equal(Manual.refusalFor({excluded:{}},{id:'a',active:true},'a'),null,'un magasin disponible n’est pas refusé');
  assert.deepEqual(excluded.plan&&Object.values(excluded.plan).flat().filter(s=>s&&s.id==='a'),[],'un refus n’écrit rien dans le planning');
}

assert.match(source,/glisse une visite à gauche ou à droite/i,'le geste doit être découvrable');
assert.match(source,/Math\.abs\(dx\)<68/,'un swipe court ne doit rien supprimer');
assert.match(source,/confirm\('Retirer /,'la suppression doit demander confirmation');
assert.match(source,/\.timelineRow:not\(\.calendarEvent\)/,'les événements Agenda ne doivent jamais recevoir le geste de suppression');
assert.match(source,/manualWeekEdits/,'une modification manuelle garde son instantané durable');
assert.match(source,/manualEdited:true/,'l’archive de période doit porter la modification manuelle');
assert.match(source,/manualAdaptive:true/,'une modification magasin doit marquer la semaine comme adaptative plutôt que totalement figée');
assert.match(source,/manualRemovedIds/,'un retrait manuel doit rester exclu de sa semaine lors de la prochaine génération');
assert.match(source,/＋ Ajouter/,'le planning doit exposer un bouton d’ajout explicite');
assert.match(source,/Déplacer de /,'un magasin déjà prévu ailleurs doit être présenté comme déplaçable');
assert.match(source,/e\.stopPropagation\(\)/,'le swipe de ligne doit empêcher le swipe global de changer de jour en même temps');

console.log('planning-manual-visits: OK');
