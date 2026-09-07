(function(){
  'use strict';
  let startY=0,lastY=0,startTime=0,dragging=false;
  function panel(){return document.getElementById('assistantPanel')}
  function applyY(p,y){p.style.setProperty('--assistant-sheet-y',y+'px');p.style.setProperty('transform',matchMedia('(max-width:700px)').matches?'translateY('+y+'px)':'translate(-50%,'+y+'px)','important')}
  function reset(p){p.style.removeProperty('--assistant-sheet-y');p.style.removeProperty('transform');if(p.classList.contains('dragging')||p.classList.contains('peek'))p.classList.remove('dragging','peek')}
  function close(p){reset(p);if(p.classList.contains('open')){if(typeof window.toggleAssistant==='function')window.toggleAssistant();else p.classList.remove('open')}}
  function install(){
    const p=panel();if(!p||p.dataset.dragSheet==='1')return false;
    p.dataset.dragSheet='1';
    const handle=document.createElement('button');
    handle.type='button';handle.className='assistantDragHandle';handle.setAttribute('aria-label','Faire glisser la fenêtre IA vers le bas');
    handle.innerHTML='<span></span>';
    p.insertBefore(handle,p.firstChild);
    function begin(y){
      if(!p.classList.contains('open'))return;
      dragging=true;startY=lastY=y;startTime=Date.now();p.classList.add('dragging');p.classList.remove('peek');
    }
    function move(y){if(!dragging)return;lastY=y;applyY(p,Math.max(0,lastY-startY))}
    function finish(e){
      if(!dragging)return;dragging=false;p.classList.remove('dragging');
      const y=Math.max(0,lastY-startY),elapsed=Math.max(1,Date.now()-startTime),speed=y/elapsed;
      if(y>190||speed>.75){close(p)}else if(y>42){applyY(p,118);p.classList.add('peek')}else{reset(p)}
      if(e)e.preventDefault();
    }
    handle.addEventListener('pointerdown',function(e){if(e.pointerType==='touch')return;begin(e.clientY);try{handle.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault()});
    handle.addEventListener('pointermove',function(e){if(e.pointerType==='touch'||!dragging)return;move(e.clientY);e.preventDefault()});
    handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    handle.addEventListener('touchstart',function(e){if(!e.touches.length)return;begin(e.touches[0].clientY);e.preventDefault()},{passive:false});
    handle.addEventListener('touchmove',function(e){if(!dragging||!e.touches.length)return;move(e.touches[0].clientY);e.preventDefault()},{passive:false});
    handle.addEventListener('touchend',finish,{passive:false});handle.addEventListener('touchcancel',finish,{passive:false});
    let wasOpen=null;
    function syncOpen(){
      const open=p.classList.contains('open');
      if(open===wasOpen)return;
      wasOpen=open;
      document.documentElement.classList.toggle('assistantIsOpen',open);
      if(!open){dragging=false;reset(p)}
    }
    new MutationObserver(syncOpen).observe(p,{attributes:true,attributeFilter:['class']});syncOpen();
    return true;
  }
  function boot(){if(install())return;let tries=0;const timer=setInterval(function(){if(install()||++tries>60)clearInterval(timer)},100)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
