(function(){
  'use strict';
  const APP_NAME='Store Runner';
  const SIGNATURE='S-RUNNER By Red①';
  const LOGO='./app-icon.svg';
  let observer=null,observerHost=null,retry=0;

  function ensureCss(){
    if(document.getElementById('store-runner-branding-css'))return;
    const s=document.createElement('style');
    s.id='store-runner-branding-css';
    s.textContent=`
      .srBrandLogo{display:block;width:112px;height:112px;max-width:28vw;max-height:28vw;aspect-ratio:1/1;border-radius:24px;object-fit:contain;object-position:center;box-shadow:0 10px 28px rgba(30,45,70,.08);flex:0 0 auto}
      .srBrandName{font-size:14px;font-weight:850;letter-spacing:-.02em;color:#0b1530}
      .srBrandSignature{font-size:10.5px;color:#7b8089;margin-top:1px}
      #premiumHomeV2 .phBrand{display:grid!important;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto auto;column-gap:14px;align-items:center}
      #premiumHomeV2 .phBrand .srBrandLogo{grid-row:1/4;align-self:center;justify-self:start}
      #premiumHomeV2 .phBrand .phSector{grid-column:2;font-size:11.5px!important;margin-top:2px}
      .top .srTopBrand{display:flex;align-items:center;gap:10px}
      .top .srTopBrand img{width:46px;height:46px;aspect-ratio:1/1;object-fit:contain;object-position:center;border-radius:12px;box-shadow:0 6px 18px rgba(30,45,70,.08);flex:0 0 46px}
      .top .srTopBrandText{min-width:0}
      #planPanel #iosDayHero{display:none!important}
      @media(max-width:700px){
        .srBrandLogo{width:88px;height:88px;max-width:24vw;max-height:24vw;border-radius:20px}
        #premiumHomeV2 .phBrand{column-gap:12px}
        .top .srTopBrand img{width:40px;height:40px;flex-basis:40px}
      }
    `;
    document.head.appendChild(s);
  }

  function applyMeta(){
    document.title=APP_NAME;
    const apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(apple)apple.setAttribute('content',APP_NAME);
    const app=document.querySelector('meta[name="application-name"]');
    if(app)app.setAttribute('content',APP_NAME);
  }

  function applyTop(){
    const first=document.querySelector('.toprow>div:first-child');
    if(!first)return false;
    let brand=first.querySelector('.srTopBrand');
    if(!brand){
      brand=document.createElement('div');
      brand.className='srTopBrand';
      brand.innerHTML='<img src="'+LOGO+'" alt="S-RUNNER"><div class="srTopBrandText"><h1 id="appContextTitle">'+APP_NAME+'</h1><p id="titleSub">'+SIGNATURE+'</p></div>';
      first.replaceChildren(brand);
    }else{
      const img=brand.querySelector('img');if(img&&img.getAttribute('src')!==LOGO)img.setAttribute('src',LOGO);
      let h=brand.querySelector('#appContextTitle')||brand.querySelector('h1');
      if(!h){h=document.createElement('h1');const box=brand.querySelector('.srTopBrandText');if(box)box.prepend(h)}
      if(h){h.id='appContextTitle';h.textContent=APP_NAME}
      let p=brand.querySelector('#titleSub')||brand.querySelector('p');
      if(!p){p=document.createElement('p');const box=brand.querySelector('.srTopBrandText');if(box)box.appendChild(p)}
      if(p){p.id='titleSub';p.textContent=SIGNATURE}
    }
    return true;
  }

  function applyHome(){
    const brand=document.querySelector('#premiumHomeV2 .phBrand');
    if(!brand)return false;
    const sector=brand.querySelector('.phSector');
    const sectorText=sector?sector.textContent:'';
    const oldWordmark=brand.querySelector('img[src*="samsung-wordmark"]');
    if(oldWordmark)oldWordmark.remove();
    let logo=brand.querySelector('.srBrandLogo');
    if(!logo){logo=document.createElement('img');logo.className='srBrandLogo';logo.alt='S-RUNNER';brand.insertBefore(logo,brand.firstChild)}
    if(logo.getAttribute('src')!==LOGO)logo.setAttribute('src',LOGO);
    let name=brand.querySelector('.srBrandName');
    if(!name){name=document.createElement('span');name.className='srBrandName';brand.insertBefore(name,sector||null)}
    name.textContent=APP_NAME;
    let signature=brand.querySelector('.srBrandSignature');
    if(!signature){signature=document.createElement('span');signature.className='srBrandSignature';brand.insertBefore(signature,sector||null)}
    signature.textContent=SIGNATURE;
    Array.from(brand.children).forEach(function(el){
      if(el===logo||el===name||el===signature||el.classList.contains('phSector'))return;
      if(el.tagName==='SPAN')el.remove();
    });
    if(sector&&sectorText)sector.textContent=sectorText;
    return true;
  }

  function installDepartureReturn(){
    if(!window.__srDepartureOpenWrapped&&typeof window.openDepartureSettings==='function'){
      const baseOpen=window.openDepartureSettings;
      window.openDepartureSettings=function(){
        const plan=document.getElementById('planPanel');
        window.__srReturnToPlanningAfterProfileSave=!!(plan&&plan.classList.contains('active'));
        return baseOpen.apply(this,arguments);
      };
      window.__srDepartureOpenWrapped=true;
    }
    if(!window.__srProfileSaveWrapped&&typeof window.saveProfile==='function'){
      const baseSave=window.saveProfile;
      window.saveProfile=function(){
        const shouldReturn=!!window.__srReturnToPlanningAfterProfileSave;
        const out=baseSave.apply(this,arguments);
        if(shouldReturn){
          window.__srReturnToPlanningAfterProfileSave=false;
          setTimeout(function(){
            if(typeof window.goTab==='function')window.goTab('planPanel');
            if(typeof window.syncBottomNav==='function')try{window.syncBottomNav('planPanel')}catch(e){}
            window.scrollTo({top:0,behavior:'smooth'});
          },120);
        }
        return out;
      };
      window.__srProfileSaveWrapped=true;
    }
  }

  function apply(){ensureCss();applyMeta();const top=applyTop();const home=applyHome();installDepartureReturn();return top&&home}

  function observe(){
    const host=document.getElementById('homePanel')||document.body;
    if(observer&&observerHost===host)return;
    if(observer)observer.disconnect();
    observerHost=host;
    observer=new MutationObserver(function(){requestAnimationFrame(function(){apply();observe()})});
    observer.observe(host,{childList:true,subtree:true});
  }

  function boot(){
    const ready=apply();
    observe();
    if(!ready&&retry<20){retry++;setTimeout(boot,150)}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('focus',function(){setTimeout(function(){apply();observe()},30)});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(function(){apply();observe()},30)});
})();
