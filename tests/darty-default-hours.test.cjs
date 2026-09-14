const assert=require('node:assert/strict');
const hours=require('../store-opening-hours.js');
const brands=require('../boulanger-default-hours.js');

(function dartyGetsSameTerrainDefault(){
  const store={id:'d',enseigne:'Darty'};
  assert.equal(brands.isDarty(store),true);
  assert.equal(brands.applyStore(store),true,'un Darty sans horaire reçoit le défaut enseigne');
  assert.equal(store.openingHoursSource,'brand-default');
  assert.deepEqual(store.openingHours.Lundi,[{open:'09:30',close:'19:30'}]);
  assert.deepEqual(store.openingHours.Samedi,[{open:'09:30',close:'19:30'}]);
  assert.deepEqual(hours.intervalsFor(store,'Lundi'),[{open:'09:30',close:'19:30'}]);
  assert.equal(hours.intervalsFor(store,'Dimanche'),undefined,'aucun dimanche n’est inventé');
})();

(function dartyManualAndExplicitStillWin(){
  const manual={id:'m',enseigne:'Darty',openingHoursSource:'manual'};
  assert.equal(brands.applyStore(manual),false,'un horaire manuel effacé reste volontairement inconnu');
  assert.equal(hours.intervalsFor(manual,'Lundi'),undefined);
  const explicit={id:'e',enseigne:'Darty',openingHours:{Lundi:[{open:'10:00',close:'20:00'}]}};
  assert.equal(brands.applyStore(explicit),false);
  assert.deepEqual(explicit.openingHours.Lundi,[{open:'10:00',close:'20:00'}]);
  const legacy={id:'l',enseigne:'Darty',openTime:'09:00',closeTime:'19:00'};
  assert.equal(brands.applyStore(legacy),false);
  assert.deepEqual(hours.intervalsFor(legacy,'Lundi'),[{open:'09:00',close:'19:00'}]);
})();

(function unrelatedBrandsStayUnknown(){
  const other={id:'x',enseigne:'Fnac'};
  assert.equal(brands.applyStore(other),false);
  assert.equal(hours.intervalsFor(other,'Lundi'),undefined);
})();

console.log('darty-default-hours: OK');
