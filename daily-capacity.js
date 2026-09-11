(function(){
  'use strict';

  function ensure(){
    try{
      if(!state.settings)state.settings={};
      if(!Number(state.settings.maxVisitsPerDay))state.settings.maxVisitsPerDay=4;
      return true;
    }catch(e){return false}
  }

  function persistMaxVisits(value){
    if(!ensure())return;
    state.settings.maxVisitsPerDay=Math.max(1,Math.min(8,Number(value)||4));
    try{if(typeof save==='function')save()}catch(e){}
  }

  function syncField(){
    if(!ensure())return false;
    const input=document.getElementById('maxVisitsPerDay');
    if(!input)return false;
    input.value=String(state.settings.maxVisitsPerDay||4);
    return true;
  }

  function installField(){
    if(!ensure())return false;
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

  function boot(){installField()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();

  document.addEventListener('store-runner:data-restored',syncField);
  document.addEventListener('store-runner:planning-updated',function(){if(!document.getElementById('maxVisitsPerDay'))installField()});
})();
