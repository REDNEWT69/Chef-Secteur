const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'ui-polish.js'),'utf8');

const ctx={
  state:{profile:{}},
  console,
  setTimeout(){return 0},
  addEventListener(){},
  sessionStorage:{getItem(){return null}},
  CustomEvent:function(type,opts){this.type=type;this.detail=opts&&opts.detail},
  document:{
    readyState:'loading',
    addEventListener(){},
    dispatchEvent(){},
    getElementById(){return null},
    querySelector(){return null},
    querySelectorAll(){return[]},
    hidden:false
  }
};
ctx.window=ctx;
vm.runInNewContext(source,ctx);

assert.equal(typeof ctx.storeRunnerApplyAssistantOvernightIntent,'function','Le garde-fou assistant doit être exposé');
assert.equal(ctx.storeRunnerApplyAssistantOvernightIntent('Fais-moi le planning de la semaine sans découcher'),'never');
assert.equal(ctx.state.profile.overnightMode,'never','Sans découcher doit forcer le mode never');
ctx.state.profile.overnightMode='auto';
assert.equal(ctx.storeRunnerApplyAssistantOvernightIntent("Fais une semaine sans nuit d'hôtel"),'never');
assert.equal(ctx.state.profile.overnightMode,'never','Sans nuit d’hôtel doit désactiver le découché');
ctx.state.profile.overnightMode='auto';
assert.equal(ctx.storeRunnerApplyAssistantOvernightIntent('Découché obligatoire cette semaine'),'mandatory');
assert.equal(ctx.state.profile.overnightMode,'mandatory','Découché obligatoire doit rester explicite');
ctx.state.profile.overnightMode='auto';
assert.equal(ctx.storeRunnerApplyAssistantOvernightIntent('Fais-moi une semaine équilibrée'),null);
assert.equal(ctx.state.profile.overnightMode,'auto','Une demande sans rapport ne doit pas modifier le réglage');

assert(source.includes("hasHotel?'🌙 hôtel':away?'🚗 déplacement':overnight?'🌙 découché':''"),'Les badges doivent distinguer hôtel, déplacement et découché');
assert(!source.includes("'✈ déplacement'"),'L’icône avion générique est interdite');
assert(source.includes("'🌙 Nuit d’hôtel conseillée'"),'Le bandeau doit nommer clairement une suggestion de découché');
assert(source.includes("'🚗 Déplacement professionnel'"),'Un vrai déplacement doit utiliser une voiture, pas un avion');
assert(source.includes("overnightMode==='never'"),'Le rendu doit respecter explicitement le mode sans découcher');

console.log('Overnight intent/UI guards: OK · online prompt respects no-overnight and mobility badges are explicit');