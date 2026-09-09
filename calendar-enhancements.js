(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  let decorating=false;
  let headerContextObserver=null,homeContextObserver=null;
  let weekObserver=null,observedWeek=null,weekRefreshTimer=null,suppressWeekObserver=false;
  let storeDialogObserver=null,observedStoreDialog=null;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function tmin(v){if(!v)return null;const p=String(v).split(':');if(p.length<2)return null;const h=Number(p[0]),m=Number(p[1]);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null}
  function fmt(m){m=Math.max(0,Math.round(m));return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
  function activeCount(){try{return typeof window.activeStores==='function'?window.activeStores().length:(window.state&&state.stores?state.stores.filter(s=>s.active!==false).length:83)}catch(e){return 83}}

  function cleanContextText(){
    const label='Samsung Rhône-Alpes · '+activeCount()+' magasins';
    const sub=document.getElementById('titleSub');if(sub&&sub.textContent!==label)sub.textContent=label;
    const home=document.getElementById('homeSub');if(home&&home.textContent!==label)home.textContent=label;
  }
  function observeContextText(){
    const top=document.querySelector('.top');
    if(top&&!headerContextObserver){
      headerContextObserver=new MutationObserver(function(){requestAnimationFrame(cleanContextText)});
      headerContextObserver.observe(top,{childList:true,subtree:true,characterData:true});
    }
    const home=document.getElementById('homePanel');
    if(home&&!homeContextObserver){
      homeContextObserver=new MutationObserver(function(){requestAnimationFrame(cleanContextText)});
      homeContextObserver.observe(home,{childList:true,subtree:true,characterData:true});
    }
  }

  function ensureOpeningFields(){
    const dlg=document.getElementById('storeDlg');if(!dlg||document.getElementById('fOpenTime'))return;
    const note=dlg.querySelector('#fNote');if(!note)return;
    const box=document.createElement('div');box.className='formgrid';box.id='storeOpeningFields';
    box.innerHTML='<div><label>Ouverture habituelle</label><input id="fOpenTime" type="time"><div class="tiny">Laisse vide si non vérifié.</div></div><div><label>Fermeture habituelle</label><input id="fCloseTime" type="time"><div class="tiny">Le planning n’invente aucun horaire.</div></div>';
    note.parentNode.insertBefore(box,note);
  }
  function hydrateOpeningFields(){
    ensureOpeningFields();
    try{
      const id=typeof window.currentEditId!=='undefined'?window.currentEditId:null;
      const s=id&&typeof window.byId==='function'?window.byId(id):null;
      const a=document.getElementById('fOpenTime'),b=document.getElementById('fCloseTime');
      if(a)a.value=s&&s.openTime?s.openTime:'';
      if(b)b.value=s&&s.closeTime?s.closeTime:'';
    }catch(e){}
  }
  function observeStoreDialog(){
    ensureOpeningFields();
    const dlg=document.getElementById('storeDlg');if(!dlg)return false;
    if(observedStoreDialog===dlg&&storeDialogObserver)return true;
    if(storeDialogObserver)storeDialogObserver.disconnect();
    storeDialogObserver=new MutationObserver(function(){if(dlg.open)requestAnimationFrame(hydrateOpeningFields)});
    storeDialogObserver.observe(dlg,{attributes:true,attributeFilter:['open']});
    observedStoreDialog=dlg;
    if(dlg.open)hydrateOpeningFields();
    return true;
  }
  function rememberOpeningSave(){
    const dlg=document.getElementById('storeDlg');if(!dlg)return;
    const open=(document.getElementById('fOpenTime')||{}).value||'';
    const close=(document.getElementById('fCloseTime')||{}).value||'';
    const before=window.state&&state.stores?state.stores.length:0;
    const editId=typeof window.currentEditId!=='undefined'?window.currentEditId:null;
    setTimeout(function(){
      if(dlg.open)return;
      try{
        let s=editId&&typeof window.byId==='function'?window.byId(editId):null;
        if(!s&&state.stores&&state.stores.length>before)s=state.stores[state.stores.length-1];
        if(!s)return;
        if(open)s.openTime=open;else delete s.openTime;
        if(close)s.closeTime=close;else delete s.closeTime;
        if(typeof window.save==='function')window.save();
      }catch(e){}
    },0);
  }

  function storeWindow(store,day){
    if(!store)return null;
    let open=store.openTime||'',close=store.closeTime||'';
    const h=store.openingHours||store.hours||store.horaires;
    if(h&&typeof h==='object'){
      const d=h[day]||h[norm(day)]||h[DAYS.indexOf(day)];
      if(typeof d==='string'){
        const m=d.match(/(\d{1,2}:\d{2}).*?(\d{1,2}:\d{2})/);if(m){open=m[1];close=m[2]}
      }else if(d&&typeof d==='object'){open=d.open||d.opens||d.start||open;close=d.close||d.closes||d.end||close}
    }
    const a=tmin(open),b=tmin(close);return a!=null&&b!=null&&b>a?{openMin:a,closeMin:b,open:fmt(a),close:fmt(b)}:null;
  }
  window.chefSecteurStoreOpeningWindow=storeWindow;

  function openingAwareRows(day){
    if(typeof window.daySchedule!=='function')return[];
    const baseRows=window.daySchedule(day)||[];
    const rows=baseRows.map(function(row){return Object.assign({},row)});
    let cursor=null;
    for(let i=0;i<rows.length;i++){
      const row=rows[i];if(row.kind!=='store'||!row.store)continue;
      const w=storeWindow(row.store,day);if(!w)continue;
      let arr=tmin(row.arrival);if(arr==null)continue;
      if(cursor!=null&&arr<cursor)arr=cursor;
      if(arr<w.openMin)arr=w.openMin;
      row.openingWindow=w;
      row.afterClose=arr+Number(row.duration||60)>w.closeMin;
      row.arrival=fmt(arr);row.sortMin=arr;
      cursor=arr+Number(row.duration||60);
    }
    rows.sort(function(a,b){return Number(a.sortMin||0)-Number(b.sortMin||0)});
    return rows;
  }

  function decorateOpeningHours(){
    try{
      const day=typeof window.selectedPlanningDay!=='undefined'?window.selectedPlanningDay:null;if(!day)return;
      const stores=openingAwareRows(day).filter(x=>x.kind==='store');
      const rows=Array.from(document.querySelectorAll('#week .timelineRow:not(.calendarEvent)'));
      rows.forEach((row,i)=>{
        const s=stores[i],existing=row.querySelector('.openingHint');
        if(!s||!s.openingWindow){if(existing)existing.remove();return}
        const time=row.querySelector('.tlTime');if(time&&time.textContent!==s.arrival)time.textContent=s.arrival;
        row.dataset.openingArrival=s.arrival;
        const text=s.afterClose?'⚠ Créneau hors horaires '+s.openingWindow.open+'–'+s.openingWindow.close:'Ouvert '+s.openingWindow.open+'–'+s.openingWindow.close;
        const color=s.afterClose?'#b42318':'#667085';
        let d=existing;
        if(!d){d=document.createElement('div');d.className='openingHint';const main=row.querySelector('.tlMain>div:first-child')||row.querySelector('.tlMain');if(main)main.appendChild(d)}
        if(d&&d.textContent!==text)d.textContent=text;
        if(d)d.style.cssText='font-size:10.5px;margin-top:6px;color:'+color;
      });
    }catch(e){}
  }

  function words(s){return Array.from(new Set(norm(s).replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=5)))}
  function dayCards(){return Array.from(document.querySelectorAll('#planPanel .day,.week .day'))}
  function dayName(card){const t=(card.querySelector('.dayhead')||card).textContent||'';return DAYS.find(d=>norm(t).includes(norm(d)))||''}
  function findDayForOvernight(src,cards){
    const text=src.textContent||'';const explicit=DAYS.find(d=>norm(text).includes(norm(d)));if(explicit){const c=cards.find(x=>dayName(x)===explicit);if(c)return c}
    const sw=words(text);let best=null,bestScore=0;cards.forEach(c=>{const ct=Array.from(c.querySelectorAll('.stop,.timelineRow')).map(x=>x.textContent||'').join(' '),cw=new Set(words(ct));let score=0;sw.forEach(w=>{if(cw.has(w))score++});if(score>bestScore){bestScore=score;best=c}});return bestScore>0?best:null;
  }
  function makeProminent(block){
    block.style.cssText+=(block.style.cssText?';':'')+'border:2px solid #f0c34e!important;background:linear-gradient(135deg,#fff8d9,#fffdf2)!important;box-shadow:0 8px 22px rgba(153,102,0,.12)!important;margin:10px 0 12px!important;';
    if(!block.querySelector('.overnight-prominent-title')){const t=document.createElement('div');t.className='overnight-prominent-title';t.innerHTML='<b style="font-size:15px">🌙 Découchage · Hôtel conseillé</b>';t.style.cssText='margin-bottom:8px;color:#7a4b00;';block.insertBefore(t,block.firstChild)}
  }
  function decorateOvernights(){
    if(decorating)return;decorating=true;try{
      document.querySelectorAll('.gcal-overnight-copy,.gcal-overnight-summary').forEach(x=>x.remove());
      const sources=Array.from(document.querySelectorAll('.overnight')).filter(x=>!x.classList.contains('gcal-overnight-copy'));const cards=dayCards();if(!sources.length)return;
      sources.forEach(src=>{const inside=src.closest('.day');if(inside){makeProminent(src);return}const target=findDayForOvernight(src,cards);if(target){const body=target.querySelector('.daybody')||target,clone=src.cloneNode(true);clone.classList.add('gcal-overnight-copy');makeProminent(clone);body.appendChild(clone)}else makeProminent(src)});
    }finally{decorating=false}
  }

  function scheduleWeekDecorations(){
    clearTimeout(weekRefreshTimer);
    weekRefreshTimer=setTimeout(function(){
      suppressWeekObserver=true;
      try{cleanContextText();decorateOpeningHours();decorateOvernights()}
      finally{setTimeout(function(){suppressWeekObserver=false},0)}
    },25);
  }
  function observeWeek(){
    const week=document.getElementById('week');
    if(!week)return false;
    if(observedWeek===week&&weekObserver)return true;
    if(weekObserver)weekObserver.disconnect();
    weekObserver=new MutationObserver(function(){if(!suppressWeekObserver)scheduleWeekDecorations()});
    weekObserver.observe(week,{childList:true,subtree:true});
    observedWeek=week;
    return true;
  }

  function refresh(){observeContextText();observeStoreDialog();observeWeek();cleanContextText();scheduleWeekDecorations()}
  function installEvents(){
    if(window.__calendarEnhancementEvents)return;
    document.addEventListener('click',function(e){
      if(e.target&&e.target.closest&&e.target.closest('#dayTabs .dayTab'))setTimeout(refresh,40);
      const saveBtn=e.target&&e.target.closest?e.target.closest('[onclick*="saveStore"]'):null;
      if(saveBtn)rememberOpeningSave();
    },true);
    window.addEventListener('focus',refresh);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(refresh,0)});
    window.addEventListener('chef-range-generated',function(){setTimeout(refresh,40)});
    window.__calendarEnhancementEvents=true;
  }
  function boot(){installEvents();refresh();[80,180,350,700,1400,2600].forEach(delay=>setTimeout(refresh,delay))}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('load',refresh,{once:true});
})();