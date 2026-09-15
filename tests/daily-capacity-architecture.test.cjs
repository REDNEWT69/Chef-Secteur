const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(process.cwd(),'daily-capacity.js'),'utf8');

if(/scheduleBoot/.test(source)||/\[0,80,250,700,1500\]/.test(source))throw new Error('Capacité journalière: boots temporisés répétés interdits.');
if(/addEventListener\(['"]load['"],\s*boot/.test(source))throw new Error('Capacité journalière: boot supplémentaire au load interdit.');
if(/addEventListener\(['"]focus['"],\s*boot/.test(source))throw new Error('Capacité journalière: boot au focus interdit.');
if(!/DOMContentLoaded['"],\s*boot,\s*\{once:true\}/.test(source)&&!/else\s+boot\(\)/.test(source))throw new Error('Capacité journalière: initialisation unique au DOM prêt absente.');
if(!/store-runner:data-restored/.test(source)||!/syncField/.test(source))throw new Error('Capacité journalière: resynchronisation après restauration absente.');
if(!/store-runner:planning-updated/.test(source))throw new Error('Capacité journalière: récupération événementielle du champ absente.');
if(/state\.plan/.test(source)||/capPlan\s*\(/.test(source)||/route\.slice\s*\(\s*0\s*,\s*max\s*\)/.test(source))throw new Error('Capacité journalière: le réglage ne doit jamais tronquer ni muter le planning existant.');
if(!/planning déjà généré est conservé/.test(source))throw new Error('Capacité journalière: l’interface doit préciser que le planning existant est conservé.');
if(!/target\.addEventListener\('input'/.test(source)||!/state\.settings\.target/.test(source))throw new Error('Objectif hebdomadaire: persistance immédiate absente.');

function capacityEnv(explicitMax){
  const targetListeners={},docListeners={};let saves=0;
  const target={value:'20',addEventListener(type,fn){targetListeners[type]=fn}};
  const max={value:''};
  const settings={target:20};
  if(explicitMax!==undefined)settings.maxVisitsPerDay=explicitMax;
  const context={
    console,
    state:{settings},
    document:{
      readyState:'complete',activeElement:null,
      getElementById(id){return id==='target'?target:id==='maxVisitsPerDay'?max:null},
      addEventListener(type,fn){docListeners[type]=fn}
    },
    save(){saves++}
  };
  context.window=context;
  vm.runInNewContext(source,context);
  return{context,target,max,targetListeners,docListeners,get saves(){return saves}};
}

// V179 : le réglage métier par défaut est 4, mais une valeur explicite existante
// (notamment 3) reste un choix utilisateur et ne doit pas être migrée silencieusement.
{
  const fresh=capacityEnv(undefined);
  assert.equal(fresh.context.state.settings.maxVisitsPerDay,4,'une configuration sans maximum doit démarrer à 4 crédits');
  assert.equal(fresh.max.value,'4','le champ Réglages doit refléter le défaut à 4');

  const explicit=capacityEnv(3);
  assert.equal(explicit.context.state.settings.maxVisitsPerDay,3,'une valeur utilisateur explicite à 3 doit rester à 3');
  assert.equal(explicit.max.value,'3','le champ Réglages ne doit jamais remplacer un 3 explicite par 4');
}

// Régression V178 : 20 -> 15 doit être sauvegardé au premier input. Un rerender du
// planning doit ensuite relire 15 depuis state.settings au lieu de restaurer 20.
{
  const t=capacityEnv(4);
  assert.equal(typeof t.targetListeners.input,'function','le champ objectif doit écouter la saisie');
  t.target.value='15';t.targetListeners.input.call(t.target);
  assert.equal(t.context.state.settings.target,15,'15 doit devenir immédiatement la valeur sauvegardée');
  assert.ok(t.saves>0,'la saisie doit appeler save()');
  t.target.value='20';t.docListeners['store-runner:planning-updated']();
  assert.equal(t.target.value,'15','un rerender ne doit plus remettre 20');
  t.target.value='18';t.targetListeners.change.call(t.target);
  assert.equal(t.context.state.settings.target,18,'un changement confirmé doit rester la nouvelle source de vérité');
}

console.log('Daily capacity architecture guards + default 4 + explicit 3 + weekly target persistence: OK');
