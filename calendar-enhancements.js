(function(){
  'use strict';
  const TOKEN_KEY='chefSecteurGoogleTokenV1';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let decorating=false,decorateTimer=null;

  function getStoredToken(){
    try{
      const raw=sessionStorage.getItem(TOKEN_KEY); if(!raw)return null;
      const t=JSON.parse(raw); if(!t||!t.access_token||!t.expires_at||Date.now()>t.expires_at-30000){sessionStorage.removeItem(TOKEN_KEY);return null;}
      return t;
    }catch(e){return null;}
  }
  function saveCurrentToken(){
    try{
      if(!window.gapi||!gapi.client)return;
      const t=gapi.client.getToken&&gapi.client.getToken(); if(!t||!t.access_token)return;
      const expiresIn=Number(t.expires_in)||3600;
      sessionStorage.setItem(TOKEN_KEY,JSON.stringify(Object.assign({},t,{expires_at:Date.now()+expiresIn*1000})));
    }catch(e){}
  }
  function setConnectedUi(){
    const a=document.getElementById('gcalConnect'),b=document.getElementById('gcalSync');
    if(a)a.style.display='none'; if(b)b.style.display='';
  }
  function setDisconnectedUi(){
    const a=document.getElementById('gcalConnect'),b=document.getElementById('gcalSync');
    if(a)a.style.display=''; if(b)b.style.display='none';
  }
  async function waitForGoogle(){
    for(let i=0;i<60;i++){
      if(window.gapi&&gapi.client&&typeof window.syncGoogleCalendar==='function')return true;
      await new Promise(r=>setTimeout(r,100));
    }
    return false;
  }
  async function restoreAndSync(){
    const t=getStoredToken(); if(!t)return false;
    const ok=await waitForGoogle(); if(!ok)return false;
    try{
      gapi.client.setToken(t); setConnectedUi();
      await window.syncGoogleCalendar();
      return true;
    }catch(e){sessionStorage.removeItem(TOKEN_KEY);setDisconnectedUi();return false;}
  }
  function hookTokenPersistence(){
    if(window.__calendarEnhancementSyncHook||typeof window.syncGoogleCalendar!=='function')return;
    const original=window.syncGoogleCalendar;
    window.syncGoogleCalendar=async function(){
      const out=await original.apply(this,arguments);
      saveCurrentToken();
      decorateOvernights();
      return out;
    };
    window.__calendarEnhancementSyncHook=true;
  }
  function hookGenerate(){
    if(window.__calendarEnhancementGenerateHook||typeof window.generateWeek!=='function')return;
    const original=window.generateWeek;
    window.generateWeek=function(){
      const out=original.apply(this,arguments);
      setTimeout(async()=>{
        try{if(getStoredToken()&&typeof window.syncGoogleCalendar==='function')await window.syncGoogleCalendar();}catch(e){}
        decorateOvernights();
      },0);
      return out;
    };
    window.__calendarEnhancementGenerateHook=true;
  }
  function hookWeekDate(){
    if(window.__calendarEnhancementWeekHook)return;
    document.addEventListener('change',function(e){
      if(!e.target||e.target.type!=='date')return;
      setTimeout(async()=>{try{if(getStoredToken()&&typeof window.syncGoogleCalendar==='function')await window.syncGoogleCalendar();}catch(err){} decorateOvernights();},50);
    },true);
    window.__calendarEnhancementWeekHook=true;
  }

  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]+/g,' ');}
  function words(s){return Array.from(new Set(norm(s).split(/\s+/).filter(w=>w.length>=5)));}
  function dayCards(){return Array.from(document.querySelectorAll('#planPanel .day,.week .day'));}
  function dayName(card){const t=(card.querySelector('.dayhead')||card).textContent||'';return DAYS.find(d=>norm(t).includes(norm(d)))||'';}
  function findDayForOvernight(src,cards){
    const text=src.textContent||'';
    const explicit=DAYS.find(d=>norm(text).includes(norm(d)));
    if(explicit){const c=cards.find(x=>dayName(x)===explicit);if(c)return c;}
    const sw=words(text); let best=null,bestScore=0;
    cards.forEach(c=>{
      const ct=Array.from(c.querySelectorAll('.stop')).map(x=>x.textContent||'').join(' ');
      const cw=new Set(words(ct)); let score=0; sw.forEach(w=>{if(cw.has(w))score++;});
      if(score>bestScore){bestScore=score;best=c;}
    });
    return bestScore>0?best:null;
  }
  function addOvernightTitle(block){
    if(block.querySelector('.overnight-prominent-title'))return;
    const title=document.createElement('div');
    title.className='overnight-prominent-title';
    title.innerHTML='<b style="font-size:15px">🌙 Découchage · Hôtel conseillé</b>';
    title.style.cssText='margin-bottom:8px;color:#7a4b00;';
    block.insertBefore(title,block.firstChild);
  }
  function makeProminent(block){
    block.style.cssText+=(block.style.cssText?';':'')+'border:2px solid #f0c34e!important;background:linear-gradient(135deg,#fff8d9,#fffdf2)!important;box-shadow:0 8px 22px rgba(153,102,0,.12)!important;margin:10px 0 12px!important;';
    addOvernightTitle(block);
  }
  function decorateOvernights(){
    if(decorating)return; decorating=true;
    try{
      document.querySelectorAll('.gcal-overnight-copy,.gcal-overnight-summary').forEach(x=>x.remove());
      const sources=Array.from(document.querySelectorAll('.overnight')).filter(x=>!x.classList.contains('gcal-overnight-copy'));
      const cards=dayCards(); if(!sources.length||!cards.length)return;
      const unmapped=[];
      sources.forEach(src=>{
        const inside=src.closest('.day');
        if(inside){makeProminent(src);return;}
        const target=findDayForOvernight(src,cards);
        if(target){
          const body=target.querySelector('.daybody')||target;
          const clone=src.cloneNode(true); clone.classList.add('gcal-overnight-copy'); makeProminent(clone); body.appendChild(clone);
        }else unmapped.push(src);
      });
      if(unmapped.length){
        const week=document.querySelector('#planPanel .week,.week'); if(week){
          const box=document.createElement('div'); box.className='overnight gcal-overnight-summary'; makeProminent(box);
          const note=document.createElement('div');note.className='tiny';note.textContent='Découchage détecté, mais le jour exact n’a pas pu être identifié automatiquement.';box.appendChild(note);
          unmapped.forEach(src=>{const c=src.cloneNode(true);c.classList.remove('overnight');c.style.marginTop='10px';box.appendChild(c);});
          week.parentNode.insertBefore(box,week);
        }
      }
    }finally{decorating=false;}
  }
  function observePlan(){
    const plan=document.getElementById('planPanel');if(!plan||window.__overnightObserver)return;
    const obs=new MutationObserver(()=>{clearTimeout(decorateTimer);decorateTimer=setTimeout(decorateOvernights,80);});
    obs.observe(plan,{childList:true,subtree:true}); window.__overnightObserver=obs;
  }
  async function boot(){
    for(let i=0;i<40;i++){
      hookTokenPersistence();hookGenerate();hookWeekDate();observePlan();decorateOvernights();
      if(window.__calendarEnhancementSyncHook&&window.__calendarEnhancementGenerateHook)break;
      await new Promise(r=>setTimeout(r,150));
    }
    await restoreAndSync();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();
