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

(function safetyAndCanonicalHours(){
  const store={id:'a',openingHours:{Lundi:[{open:'10:00',close:'19:00'}]}};
  const state={stores:[store],settings:{startTime:'08:30',endTime:'18:00',visitMinutes:60},appointments:[]};
  const opts={base:{},date:'2026-09-14',blocks:[],travelMinutes:()=>30,appointmentFor:()=>null};
  assert.equal(hours.scheduleRoute([{id:'a'}],'Lundi',state,opts).rows[0].arrival,600,'les copies du planning utilisent les horaires canoniques');
  for(const invalid of ['invalide',[{open:'oops',close:'18:00'}],[{open:'10:00',close:'15:00'},{open:'14:00',close:'19:00'}]]){
    assert.equal(hours.intervalsFor({openingHours:{Lundi:invalid}},'Lundi'),undefined,'donnée invalide = inconnue');
  }
  assert.deepEqual(hours.intervalsFor({openTime:'09:00',closeTime:'18:00'},'Lundi'),[{open:'09:00',close:'18:00'}],'horaires historiques explicites conservés');
  assert.equal(hours.intervalsFor({openTime:'09:00',closeTime:'18:00',openingHoursSource:'manual'},'Lundi'),undefined,'effacer un horaire ne ressuscite pas un horaire historique');
  const conflict=hours.scheduleRoute([store],'Lundi',state,{...opts,appointmentFor:()=>({time:'09:00',duration:60})});
  assert.equal(conflict.rows[0].arrival,540,'le RDV conserve son heure');
  assert.equal(conflict.appointmentConflicts,1);
  assert.equal(conflict.estimatedEnd,null);
  const agenda=hours.scheduleRoute([store],'Lundi',state,{...opts,blocks:[{startMin:600,endMin:660}],appointmentFor:()=>({time:'10:00',duration:60})});
  assert.equal(agenda.rows[0].arrival,600,'ne pas déplacer silencieusement un RDV Agenda');
  assert.equal(agenda.appointmentConflicts,1);
  const many=Array.from({length:25},(_,i)=>({startMin:600+i*10,endMin:610+i*10}));
  assert.equal(hours.fitWithBlocks(store,'Lundi',600,15,many).arrival,850,'tous les blocs sont vérifiés, même au-delà de 20');
})();

console.log('opening-hours-schedule: OK');
