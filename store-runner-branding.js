(function(){
  'use strict';
  const APP_NAME='Store Runner';
  const SIGNATURE='S-RUNNER By Red①';
  const LOGO='./store-runner-logo.jpg';
  let observer=null,observerHost=null,retry=0;

  function ensureCss(){
    if(document.getElementById('store-runner-branding-css'))return;
    const s=document.createElement('style');
    s.id='store-runner-branding-css';
    s.textContent=`
      .srBrandLogo{display:block;width:122px;max-width:34vw;height:auto;border-radius:14px;object-fit:contain;box-shadow:0 10px 28px rgba(30,45,70,.08)}
      .srBrandName{font-size:14px;font-weight:850;letter-spacing:-.02em;color:#0b1530}
      .srBrandSignature{font-size:10.5px;color:#7b8089;margin-top:1px}
      #premiumHomeV2 .phBrand{display:grid!important;grid-template-columns:auto 1fr;grid-template-rows:auto auto auto;column-gap:12px;align-items:center}
      #premiumHomeV2 .phBrand .srBrandLogo{grid-row:1/4;width:112px;max-width:28vw}
      #premiumHomeV2 .phBrand .phSector{grid-column:2;font-size:11.5px!important;margin-top:2px}
      .top .srTopBrand{display:flex;align-items:center;gap:10px}
      .top .srTopBrand img{width:46px;height:46px;object-fit:cover;border-radius:12px;box-shadow:0 6px 18px rgba(30,45,70,.08)}
      .top .srTopBrandText{min-width:0}
      @media(max-width:700px){.srBrandLogo{width:96px}#premiumHomeV2 .phBrand .srBrandLogo{width:88px}.top .srTopBrand img{width:40px;height:40px}}
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
      brand.innerHTML='<img src="'+LOGO+'" alt="S-RUNNER"><div class="srTopBrandText"><h1>'+APP_NAME+'</h1><p>'+SIGNATURE+'</p></div>';
      first.replaceChildren(brand);
    }else{
      const h=brand.querySelector('h1');if(h)h.textContent=APP_NAME;
      const p=brand.querySelector('p');if(p)p.textContent=SIGNATURE;
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
    if(!logo){logo=document.createElement('img');logo.className='srBrandLogo';logo.src=LOGO;logo.alt='S-RUNNER';brand.insertBefore(logo,brand.firstChild)}
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

  function apply(){ensureCss();applyMeta();const top=applyTop();const home=applyHome();return top&&home}

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
