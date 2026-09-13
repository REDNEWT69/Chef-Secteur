const assert = require('node:assert/strict');
const hours = require('../store-opening-hours.js');

(function parsing(){
  assert.deepEqual(hours.parseDayHours('09:00-12:30,14:00-19:00'), [
    {open:'09:00',close:'12:30'},{open:'14:00',close:'19:00'}
  ]);
  assert.deepEqual(hours.parseDayHours('fermé'), []);
  assert.equal(hours.parseDayHours(''), undefined);
  assert.throws(()=>hours.parseDayHours('09:00-08:00'), /invalide/);
  assert.throws(()=>hours.parseDayHours('09:00-13:00,12:00-18:00'), /chevauchent/);
})();

(function firstStoreWaitsForOpeningAndDepartureMovesLater(){
  const state={settings:{weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:60},appointments:[]};
  const base={id:'base'},a={id:'a',openingHours:{Lundi:[{open:'10:00',close:'19:00'}]}};
  const result=hours.scheduleRoute([a],'Lundi',state,{
    base,date:'2026-09-14',blocks:[],travelMinutes:()=>30,appointmentFor:()=>null
  });
  assert.equal(result.rows[0].arrival, 600, 'la visite doit commencer à 10:00');
  assert.equal(result.rows[0].status, 'wait-opening');
  assert.equal(result.recommendedDeparture, 570, 'avec 30 min de route, départ conseillé 09:30');
  assert.equal(result.estimatedEnd, 690, '10:00 + 60 min + 30 min retour = 11:30');
})();

(function lunchClosurePushesVisitToAfternoon(){
  const state={settings:{weekDate:'2026-09-14',startTime:'11:00',endTime:'18:00',visitMinutes:60},appointments:[]};
  const store={id:'a',openingHours:{Lundi:[{open:'09:00',close:'12:00'},{open:'14:00',close:'19:00'}]}};
  const result=hours.scheduleRoute([store],'Lundi',state,{base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>30,appointmentFor:()=>null});
  assert.equal(result.rows[0].arrival, 840, '11:30 + 60 min ne tient pas avant midi : visite à 14:00');
})();

(function unknownHoursStayEstimatedAndExplicit(){
  const state={settings:{weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:45},appointments:[]};
  const store={id:'a'};
  const result=hours.scheduleRoute([store],'Lundi',state,{base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>20,appointmentFor:()=>null});
  assert.equal(result.rows[0].arrival, 530);
  assert.equal(result.rows[0].status, 'unknown');
  assert.equal(result.unknownCount, 1);
  assert.equal(result.closedCount, 0);
})();

(function closedStoreNeverGetsAFakeOpeningTime(){
  const state={settings:{weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:60},appointments:[]};
  const store={id:'a',openingHours:{Lundi:[]}};
  const result=hours.scheduleRoute([store],'Lundi',state,{base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>15,appointmentFor:()=>null});
  assert.equal(result.rows[0].arrival, null);
  assert.equal(result.rows[0].status, 'closed');
  assert.equal(result.closedCount, 1);
  assert.equal(result.estimatedEnd, null, 'une journée impossible ne doit pas afficher une fausse heure de fin précise');
  assert.equal(hours.routeFits([store],'Lundi',state,{base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>15,appointmentFor:()=>null}), false);
})();

(function calendarBlockThenOpeningIsRechecked(){
  const state={settings:{weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:60},appointments:[]};
  const store={id:'a',openingHours:{Lundi:[{open:'09:00',close:'12:00'},{open:'14:00',close:'19:00'}]}};
  const result=hours.scheduleRoute([store],'Lundi',state,{
    base:{},date:'2026-09-14',travelMinutes:()=>20,appointmentFor:()=>null,
    blocks:[{allDay:false,startMin:540,endMin:700}]
  });
  assert.equal(result.rows[0].arrival, 840, 'le bloc 09:00-11:40 pousse une visite de 60 min au créneau de 14:00');
})();

(function inputIsNeverMutated(){
  const store={id:'a',openingHours:{Lundi:[{open:'09:00',close:'19:00'}]}};
  const before=JSON.stringify(store);
  hours.scheduleRoute([store],'Lundi',{settings:{weekDate:'2026-09-14',startTime:'08:30',endTime:'18:00',visitMinutes:60},appointments:[]},{base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>10,appointmentFor:()=>null});
  assert.equal(JSON.stringify(store),before);
})();

console.log('opening-hours-schedule: OK');
