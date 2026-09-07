(function(){
  'use strict';
  let startY=0,lastY=0,startTime=0,dragging=false;
  function panel(){return document.getElementById('assistantPanel')}
  function applyY(p,y){p.style.setProperty('--assistant-sheet-y',y+'px');p.style.setProperty('transform',matchMedia('(max-width:700px)').matches?'translateY('+y+'px)':'translate(-50%,'+y+'px)','important')}
  function reset(p){p.style.removeProperty('--assistant-sheet-y');p.style.removeProperty('transform');p.classList.remove('dragging','peek')}
  function close(p){reset(p);if(p.classList.contains('open')){if(typeof window.toggleAssistant==='function')window.toggleAssistant();else p.classList.remove('open')}}
  function install(){
    const p=panel();if(!p||p.dataset.dragSheet==='1')return false;
    p.dataset.dragSheet='1';
    const handle=document.createElement('button');
    handle.type='button';handle.className='assistantDragHandle';handle.setAttribute('aria-label','Faire glisser la fenêtre IA vers le bas');
    handle.innerHTML='<span></span>';
    p.insertBefore(handle,p.firstChild);
    handle.addEventListener('pointerdown',function(e){
      if(!p.classList.contains('open'))return;
      dragging=true;startY=lastY=e.clientY;startTime=Date.now();p.classList.add('dragging');p.classList.remove('peek');
      try{handle.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();
    });
    handle.addEventListener('pointermove',function(e){
      if(!dragging)return;lastY=e.clientY;const y=Math.max(0,lastY-startY);applyY(p,y);e.preventDefault();
    });
    function finish(e){
      if(!dragging)return;dragging=false;p.classList.remove('dragging');
      const y=Math.max(0,lastY-startY),elapsed=Math.max(1,Date.now()-startTime),speed=y/elapsed;
      if(y>190||speed>.75){close(p)}else if(y>42){applyY(p,118);p.classList.add('peek')}else{reset(p)}
      if(e)e.preventDefault();
    }
    handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    new MutationObserver(function(){if(!p.classList.contains('open'))reset(p)}).observe(p,{attributes:true,attributeFilter:['class']});
    return true;
  }
  function boot(){if(install())return;let tries=0;const timer=setInterval(function(){if(install()||++tries>60)clearInterval(timer)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
