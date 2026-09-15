(function(){
'use strict';
let installed=false;

function targetValue(value){
  const n=parseInt(value,10);
  return Number.isFinite(n)&&n>0?n:1;
}
function ensureTarget(){
  try{
    if(!window.state)return 20;
    if(!state.settings)state.settings={};
    const current=parseInt(state.settings.target,10);
    if(Number.isFinite(current)&&current>0)return current;
    state.settings.target=20;
    return 20;
  }catch(e){return 20}
}
function persistTarget(value){
  if(!window.state)return false;
  const next=targetValue(value);
  if(!state.settings)state.settings={};
  state.settings.target=next;
  try{if(typeof window.save==='function')window.save()}catch(e){console.warn('Objectif hebdomadaire non persisté',e)}
  return true;
}
function syncTarget(){
  const input=document.getElementById('target');
  if(!input)return false;
  const value=ensureTarget();
  /* Ne jamais réécrire le champ pendant que l’utilisateur le saisit. Le problème V177
     venait précisément d’un rendu qui pouvait remettre l’ancienne valeur (souvent 20)
     avant que la génération ne lise le nouveau nombre. */
  if(document.activeElement!==input&&String(input.value)!==String(value))input.value=String(value);
  return true;
}
function install(){
  const input=document.getElementById('target');
  if(!input)return false;
  if(!input.__weeklyTargetBound){
    input.addEventListener('input',function(){persistTarget(this.value)});
    input.addEventListener('change',function(){persistTarget(this.value);syncTarget()});
    input.__weeklyTargetBound=true;
  }
  installed=true;
  syncTarget();
  return true;
}
function recover(){if(!installed||!document.getElementById('target')){installed=false;install();return}syncTarget()}

window.StoreRunnerWeeklyTarget={persist:persistTarget,sync:syncTarget};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
document.addEventListener('store-runner:data-restored',recover);
document.addEventListener('store-runner:planning-updated',recover);
})();