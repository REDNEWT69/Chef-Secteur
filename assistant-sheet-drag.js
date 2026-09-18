(function(){
  'use strict';
  let startY=0,lastY=0,startTime=0,dragging=false;
  let perfStartY=0,perfLastY=0,perfStartTime=0,perfDragging=false;
  function panel(){return document.getElementById('assistantPanel')}
  function performanceSheet(){return document.getElementById('srPerfSheet')}
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

  function ensurePerformanceDragStyle(){
    if(document.getElementById('sr-perf-drag-v213-style'))return;
    const style=document.createElement('style');style.id='sr-perf-drag-v213-style';
    style.textContent='.srPerfDragHandleV213{display:none}@media(max-width:700px){#srPerfSheet{padding-top:4px!important;overscroll-behavior:contain;transition:transform .18s ease}.srPerfDragHandleV213{position:sticky;top:-4px;z-index:20;display:flex;align-items:center;justify-content:center;width:100%;height:36px;min-height:36px;margin:0 0 4px;padding:0;border:0;border-radius:18px;background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(255,255,255,.9));touch-action:none;cursor:grab}.srPerfDragHandleV213 span{display:block;width:44px;height:5px;border-radius:999px;background:#c7ccd4}.srPerfDragHandleV213:active span{background:#9299a5}#srPerfSheet.srPerfDraggingV213{transition:none!important;user-select:none}}';
    document.head.appendChild(style);
  }
  function applyPerformanceY(p,y){p.style.setProperty('transform','translateY('+Math.max(0,y)+'px)','important')}
  function resetPerformance(p){if(!p)return;p.style.removeProperty('transform');p.classList.remove('srPerfDraggingV213')}
  function closePerformance(p){resetPerformance(p);if(!p)return;if(p.open&&typeof p.close==='function')p.close();else p.removeAttribute('open')}
  function installPerformanceDrag(){
    const p=performanceSheet();if(!p||p.dataset.dragSheetV213==='1')return false;
    ensurePerformanceDragStyle();p.dataset.dragSheetV213='1';
    const handle=document.createElement('button');handle.type='button';handle.className='srPerfDragHandleV213';handle.setAttribute('aria-label','Faire glisser Pilotage Performance vers le bas pour fermer');handle.innerHTML='<span></span>';p.insertBefore(handle,p.firstChild);
    function isOpen(){return !!(p.open||p.hasAttribute('open'))}
    function begin(y){if(!isOpen())return;perfDragging=true;perfStartY=perfLastY=y;perfStartTime=Date.now();p.classList.add('srPerfDraggingV213')}
    function move(y){if(!perfDragging)return;perfLastY=y;applyPerformanceY(p,Math.max(0,perfLastY-perfStartY))}
    function finish(e){
      if(!perfDragging)return;perfDragging=false;p.classList.remove('srPerfDraggingV213');
      const y=Math.max(0,perfLastY-perfStartY),elapsed=Math.max(1,Date.now()-perfStartTime),speed=y/elapsed;
      if(y>150||(y>48&&speed>.68))closePerformance(p);else resetPerformance(p);
      if(e)e.preventDefault();
    }
    handle.addEventListener('pointerdown',function(e){if(e.pointerType==='touch')return;begin(e.clientY);try{handle.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault()});
    handle.addEventListener('pointermove',function(e){if(e.pointerType==='touch'||!perfDragging)return;move(e.clientY);e.preventDefault()});
    handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    handle.addEventListener('touchstart',function(e){if(!e.touches.length)return;begin(e.touches[0].clientY);e.preventDefault()},{passive:false});
    handle.addEventListener('touchmove',function(e){if(!perfDragging||!e.touches.length)return;move(e.touches[0].clientY);e.preventDefault()},{passive:false});
    handle.addEventListener('touchend',finish,{passive:false});handle.addEventListener('touchcancel',finish,{passive:false});
    p.addEventListener('close',function(){perfDragging=false;resetPerformance(p)});
    return true;
  }
  function watchPerformanceSheet(){
    if(installPerformanceDrag())return;
    const target=document.body||document.documentElement;if(!target)return;
    const observer=new MutationObserver(function(){if(installPerformanceDrag())observer.disconnect()});
    observer.observe(target,{childList:true,subtree:true});
  }
  function boot(){install();watchPerformanceSheet()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
