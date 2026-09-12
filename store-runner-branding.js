(function(){
  'use strict';
  const APP_NAME='Store Runner';
  const SIGNATURE='S-RUNNER By Red①';
  const LOGO='./app-icon.svg';
  let observer=null,observerHost=null,homeObserver=null,homeObserverHost=null,retry=0,applyScheduled=false;

  function text(v){return String(v==null?'':v).trim()}
  function cleanSector(v){
    const sector=text(v||'Rhône-Alpes').replace(/^samsung\s*[·:–—-]?\s*/i,'').trim();
    return sector||'Rhône-Alpes';
  }
  function profileContext(){
    let profile={};
    try{profile=(window.state&&state.profile)||{}}catch(e){}
    const sector=cleanSector(profile.sectorName);
    const name=text(profile.baseName);
    const address=text(profile.baseAddress);
    const generic=/^(ma position(?: actuelle)?|maison|départ|base)$/i.test(name);
    const place=(name&&!generic)?name:(address||name||'À définir');
    let label=sector+' · départ '+place;
    if(address&&address.toLocaleLowerCase('fr-FR')!==place.toLocaleLowerCase('fr-FR'))label+=' · '+address;
    return{sector:sector,name:name,address:address,place:place,label:label};
  }
  function storeCount(){
    try{
      if(typeof window.activeStores==='function')return window.activeStores().length;
      return Array.isArray(state.stores)?state.stores.filter(function(s){return s&&s.active!==false}).length:0;
    }catch(e){return 0}
  }
  function setText(el,value){if(el&&el.textContent!==value)el.textContent=value}
  function setAttr(el,name,value){if(el&&el.getAttribute(name)!==value)el.setAttribute(name,value)}

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
      .top .srTopBrand{display:flex;align-items:center;gap:10px;min-width:0}
      .top .srTopBrand img{width:46px;height:46px;aspect-ratio:1/1;object-fit:contain;object-position:center;border-radius:12px;box-shadow:0 6px 18px rgba(30,45,70,.08);flex:0 0 46px}
      .top .srTopBrandText{min-width:0;max-width:min(680px,72vw)}
      .top #titleSub{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      @media(max-width:700px){
        .srBrandLogo{width:88px;height:88px;max-width:24vw;max-height:24vw;border-radius:20px}
        #premiumHomeV2 .phBrand{column-gap:12px}
        .top .srTopBrand img{width:40px;height:40px;flex-basis:40px}
        .top .srTopBrandText{max-width:62vw}
      }
    `;
    document.head.appendChild(s);
  }

  function applyMeta(){
    if(document.title!==APP_NAME)document.title=APP_NAME;
    const apple=document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if(apple)setAttr(apple,'content',APP_NAME);
    const app=document.querySelector('meta[name="application-name"]');
    if(app)setAttr(app,'content',APP_NAME);
  }

  function applyTop(){
    const first=document.querySelector('.toprow>div:first-child');
    if(!first)return false;
    const context=profileContext();
    let brand=first.querySelector('.srTopBrand');
    if(!brand){
      brand=document.createElement('div');
      brand.className='srTopBrand';
      brand.innerHTML='<img src="'+LOGO+'" alt="S-RUNNER"><div class="srTopBrandText"><h1 id="appContextTitle">'+APP_NAME+'</h1><p id="titleSub"></p></div>';
      first.replaceChildren(brand);
    }
    const img=brand.querySelector('img');if(img)setAttr(img,'src',LOGO);
    let h=brand.querySelector('#appContextTitle')||brand.querySelector('h1');
    if(!h){h=document.createElement('h1');h.id='appContextTitle';const box=brand.querySelector('.srTopBrandText');if(box)box.prepend(h)}
    setText(h,APP_NAME);
    let p=brand.querySelector('#titleSub')||brand.querySelector('p');
    if(!p){p=document.createElement('p');p.id='titleSub';const box=brand.querySelector('.srTopBrandText');if(box)box.appendChild(p)}
    setText(p,context.label);setAttr(p,'title',context.label);
    const departure=document.getElementById('headerDeparture');
    if(departure){setText(departure,context.place);setAttr(departure,'title',context.address||context.place)}
    return true;
  }

  function applyHome(){
    const brand=document.querySelector('#premiumHomeV2 .phBrand');
    if(!brand)return false;
    const context=profileContext();
    const oldWordmark=brand.querySelector('img[src*="samsung-wordmark"]');
    if(oldWordmark)oldWordmark.remove();
    let logo=brand.querySelector('.srBrandLogo');
    if(!logo){logo=document.createElement('img');logo.className='srBrandLogo';logo.alt='S-RUNNER';brand.insertBefore(logo,brand.firstChild)}
    setAttr(logo,'src',LOGO);
    let sector=brand.querySelector('.phSector');
    if(!sector){sector=document.createElement('span');sector.className='phSector';brand.appendChild(sector)}
    let name=brand.querySelector('.srBrandName');
    if(!name){name=document.createElement('span');name.className='srBrandName';brand.insertBefore(name,sector)}
    setText(name,APP_NAME);
    let signature=brand.querySelector('.srBrandSignature');
    if(!signature){signature=document.createElement('span');signature.className='srBrandSignature';brand.insertBefore(signature,sector)}
    setText(signature,SIGNATURE);
    Array.from(brand.children).forEach(function(el){
      if(el===logo||el===name||el===signature||el===sector)return;
      if(el.tagName==='SPAN'||(el.tagName==='IMG'&&/samsung/i.test(el.getAttribute('alt')||'')))el.remove();
    });
    setText(sector,context.sector+' · '+storeCount()+' magasins');
    return true;
  }

  function applyInstallCard(){
    const installTitle=document.querySelector('#installCard b');
    if(installTitle)setText(installTitle,'Installer '+APP_NAME);
    return true;
  }

  function apply(){ensureCss();applyMeta();const top=applyTop();const home=applyHome();applyInstallCard();return top&&home}
  function scheduleApply(){
    if(applyScheduled)return;
    applyScheduled=true;
    const run=function(){applyScheduled=false;apply();observe()};
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
  }

  function observe(){
    const host=document.querySelector('.top');
    if(host&&observerHost!==host){
      if(observer)observer.disconnect();
      observerHost=host;
      observer=new MutationObserver(scheduleApply);
      observer.observe(host,{childList:true,subtree:true,characterData:true});
    }
    const home=document.getElementById('homePanel');
    if(home&&homeObserverHost!==home){
      if(homeObserver)homeObserver.disconnect();
      homeObserverHost=home;
      homeObserver=new MutationObserver(scheduleApply);
      homeObserver.observe(home,{childList:true,subtree:true,characterData:true});
    }
  }

  function boot(){
    const ready=apply();
    observe();
    if(!ready&&retry<20){retry++;setTimeout(boot,150)}
  }

  window.storeRunnerBrandingContext=profileContext;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  document.addEventListener('store-runner:profile-saved',scheduleApply);
  document.addEventListener('store-runner:data-restored',scheduleApply);
  document.addEventListener('store-runner:planning-updated',scheduleApply);
  window.addEventListener('focus',function(){setTimeout(scheduleApply,30)});
  document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(scheduleApply,30)});
})();
