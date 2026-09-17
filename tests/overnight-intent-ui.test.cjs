const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');

const source=fs.readFileSync(path.join(process.cwd(),'ui-polish.js'),'utf8');
const controls=fs.readFileSync(path.join(process.cwd(),'auto-planning-fix.js'),'utf8');

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

// La pastille de découché appartient à la bande de période depuis V206 : elle seule
// connaît la date de départ du candidat, là où la semaine affichée se trompe de lundi dès
// qu'une période couvre plusieurs semaines. ui-polish.js garde l'hôtel réservé et le
// déplacement professionnel, et lui redonne la main pour la lune.
// Voir tests/period-day-tabs-contract.test.cjs pour le comportement des deux réunis.
assert(source.includes("hasHotel?'🌙 hôtel':away?'🚗 déplacement':''"),'Les badges doivent distinguer l’hôtel réservé du déplacement professionnel');
assert(source.includes('StoreRunnerPeriodDaySlider.syncOvernight()'),'le découché doit être délégué à la bande de période, pas recalculé en parallèle');
assert(!/overnight?'🌙 découché'/.test(source),'ui-polish ne doit plus poser de pastille de découché concurrente');
assert(!source.includes("'✈ déplacement'"),'L’icône avion générique est interdite');
assert(source.includes("'🌙 Nuit d’hôtel conseillée'"),'Le bandeau doit nommer clairement une suggestion de découché');
assert(source.includes("'🚗 Déplacement professionnel'"),'Un vrai déplacement doit utiliser une voiture, pas un avion');
assert(source.includes("overnightMode==='never'"),'Le rendu doit respecter explicitement le mode sans découcher');

assert.match(controls,/fromDate<today/,'V189 doit exclure toute nuit déjà passée');
assert.match(controls,/Math\.round\(\(parse\(toDate\)-parse\(fromDate\)\)\/86400000\)!==1/,'un découché doit relier deux dates réellement consécutives, pas vendredi à lundi');
assert.match(controls,/★ Nuit sur place/,'le jour où l’utilisateur dort doit porter une étoile visible');
assert.match(controls,/Zone hôtel conseillée/,'le bandeau doit indiquer clairement la zone où dormir');
assert.match(controls,/Voir les hôtels à proximité/,'un accès direct aux hôtels autour de la fin de tournée doit être proposé');
assert.match(controls,/data-fproduct value="Blanc"/,'la fiche magasin doit permettre de gérer Blanc');
assert.match(controls,/data-fproduct value="Brun"/,'la fiche magasin doit permettre de gérer Brun indépendamment');
assert.match(controls,/fVisitCreditOverride/,'la fiche magasin doit permettre de choisir 1 ou 2 visites');

console.log('Overnight intent/UI guards: OK · V189 ignore le passé, marque la nuit et donne accès aux hôtels proches.');
