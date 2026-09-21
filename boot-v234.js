(function(){
  'use strict';

  let done=false;
  let observer=null;
  let probes=0;
  const MAX_PROBES=80;

  function boot(){return document.getElementById('storeRunnerBoot')}

  function modernHomeReady(){
    const nav=document.getElementById('bottomAppNav');
    return !!(
      document.querySelector('#homePanel .phTop') &&
      nav && nav.dataset && nav.dataset.v2==='1'
    );
  }

  function removeBoot(){
    if(done||!modernHomeReady())return false;
    const node=boot();
    if(!node){done=true;return true}
    done=true;
    if(observer)observer.disconnect();
    node.classList.add('srBootOut');
    window.setTimeout(function(){if(node.parentNode)node.parentNode.removeChild(node)},180);
    return true;
  }

  function afterPaint(){
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(removeBoot);
    });
  }

  function probe(){
    if(done||removeBoot())return;
    probes++;
    if(probes<MAX_PROBES)window.setTimeout(probe,50);
  }

  document.addEventListener('store-runner:home-rendered',afterPaint);
  document.addEventListener('store-runner:data-restored',function(){window.setTimeout(removeBoot,0)});

  if(typeof MutationObserver==='function'){
    observer=new MutationObserver(function(){removeBoot()});
    observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-v2','class']});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',function(){window.setTimeout(probe,0)},{once:true});
  }else{
    window.setTimeout(probe,0);
  }

  window.setTimeout(function(){
    if(done)return;
    const node=boot();
    const text=node&&node.querySelector('[data-boot-text]');
    if(text)text.textContent='Finalisation de Store Runner…';
  },4500);

  window.StoreRunnerBootV234={isReady:modernHomeReady,remove:removeBoot};
})();
