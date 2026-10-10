const assert=require('node:assert/strict');
const events=require('../store-runner-professional-events.js');
const terrain=require('../terrain-planning-v1.js');
const state={schemaVersion:5,profile:{},stores:[{id:'s1',enseigne:'Test',ville:'Lyon'}],
  settings:{weekDate:'2026-11-16'},plan:{Lundi:[],Mardi:[],Mercredi:[{id:'s1'}],Jeudi:[],Vendredi:[],Samedi:[]},
  appointments:[{storeId:'s1',date:'2026-11-19',time:'10:00'}],
  calendarEvents:[]};
globalThis.state=state;
let saved=0;globalThis.save=()=>{saved++;return true};
assert.equal(events.coversDate('2026-11-18',state),false);
assert.equal(events.validDate('2026-02-29'),false,'calendar must reject nonexistent days');
assert.throws(()=>events.normalize({title:'Séminaire',startDate:'2026-11-19',endDate:'2026-11-18'}),/période/);
assert.throws(()=>events.normalize({title:'',startDate:'2026-11-18'}),/intitulé/);
const original=JSON.stringify({plan:state.plan,appointments:state.appointments});
const first=events.upsert({kind:'Séminaire',title:'Séminaire Samsung',
  startDate:'2026-11-18',endDate:'2026-11-19',location:'Paris',
  address:'10 rue du Séminaire, Paris',reminder:true});
assert.equal(saved,1);
assert.equal(first.event.title,'Séminaire Samsung');
assert.equal(first.conflicts.length,2,'already scheduled visits and fixed RDV must be reported');
assert.equal(JSON.stringify({plan:state.plan,appointments:state.appointments}),original,'do not silently change existing visits or appointments');
assert.deepEqual(['2026-11-17','2026-11-18','2026-11-19','2026-11-20'].map(x=>events.coversDate(x,state)),[false,true,true,false]);
assert.equal(terrain.dateBlocked('2026-11-18',state),true);
assert.equal(terrain.dateBlocked('2026-11-19',state),true);
assert.equal(terrain.dateBlocked('2026-11-20',state),false);
state.calendarEvents=[{date:'2026-11-18',title:'Événement Google'}];
state.calendarEvents=[]; // Simulate Google Calendar refresh/reconnection.
assert.equal(terrain.dateBlocked('2026-11-18',state),true,'Google sync must not erase locally owned blocking');
const moved=events.upsert({...first.event,endDate:'2026-11-20'});
assert.equal(moved.event.id,first.event.id);
assert.equal(events.rows(state).length,1,'editing never duplicates an event');
assert.equal(terrain.dateBlocked('2026-11-20',state),true);
const backup=JSON.parse(JSON.stringify(state));
assert.equal(events.coversDate('2026-11-20',backup),true,'all local professional events survive serialization/export');
assert.equal(events.remove(first.event.id),true);
assert.equal(events.coversDate('2026-11-18',state),false);
assert.equal(events.coversDate('2026-11-19',state),false);
assert.equal(events.remove(first.event.id),false);
assert.equal(JSON.stringify({plan:state.plan,appointments:state.appointments}),original);
assert.equal(saved,3,'creation, edit and removal must each persist');
console.log('PASS: V289 local professional events block every inclusive date, preserve plans, survive Google refresh and backup, edit/delete safely.');
