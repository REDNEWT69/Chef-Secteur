(function(){
  'use strict';

  function ensure(){
    try{
      if(!state.settings)state.settings={};
      if(!Number(state.settings.maxVisitsPerDay))state.settings.maxVisitsPerDay=4;
      if(!Number(state.settings.target))state.settings.target=20;
      return true;
    }catch(e){return false}
  }

  function persistMaxVisits(value){
    if(!ensure())return;
    state.settings.maxVisitsPerDay=Math.max(1,Math.min(8,Number(value)||4));
    try{if(typeof save==='function')save()}catch(e){}
  }

  function persistWeeklyTarget(value){
    if(!ensure())return;
    const n=parseInt(value,10);
    state.settings.target=Number.isFinite(n)&&n>0?n:1;
    try{if(typeof save==='function')save()}catch(e){}
  }

  function syncField(){
    if(!ensure())return false;
    const input=document.getElementById('maxVisitsPerDay');
    if(input)input.value=String(state.settings.maxVisitsPerDay||4);
    const target=document.getElementById('target');
    // Ne jamais écraser la valeur pendant la saisie : l'ancien comportement pouvait
    // remettre 20 avant que le générateur ne lise la nouvelle valeur.
    if(target&&document.activeElement!==target)target.value=String(state.settings.target||20);
    return !!(input||target);
  }

  function bindWeeklyTarget(){
    if(!ensure())return false;
    const target=document.getElementById('target');
    if(!target)return false;
    if(!target.__weeklyTargetBound){
      target.addEventListener('input',function(){persistWeeklyTarget(this.value)});
      target.addEventListener('change',function(){persistWeeklyTarget(this.value);syncField()});
      target.__weeklyTargetBound=true;
    }
    if(document.activeElement!==target)target.value=String(state.settings.target||20);
    return true;
  }

  function installField(){
    if(!ensure())return false;
    bindWeeklyTarget();
    if(document.getElementById('maxVisitsPerDay'))return syncField();
    const target=document.getElementById('target');
    if(!target)return false;

    const label=document.createElement('label');
    label.textContent='Maximum de visites par jour';

    const input=document.createElement('input');
    input.id='maxVisitsPerDay';
    input.type='number';
    input.min='1';
    input.max='8';
    input.value=String(state.settings.maxVisitsPerDay||4);

    const hint=document.createElement('p');
    hint.className='tiny';
    hint.textContent='La limite s’applique aux prochaines générations. Le planning déjà généré est conservé.';

    target.insertAdjacentElement('afterend',hint);
    hint.insertAdjacentElement('beforebegin',input);
    input.insertAdjacentElement('beforebegin',label);

    input.addEventListener('input',function(){persistMaxVisits(this.value)});
    input.addEventListener('change',function(){persistMaxVisits(this.value);syncField()});
    return true;
  }

  function recover(){if(!document.getElementById('maxVisitsPerDay'))installField();else{bindWeeklyTarget();syncField()}}
  function boot(){installField()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  document.addEventListener('store-runner:data-restored',recover);
  document.addEventListener('store-runner:planning-updated',recover);
})();
