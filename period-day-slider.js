(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  const RANGE_KEY='chef_sector_range_v1';
  let activeDate='';
  function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
  function load(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(e){return{}}}
  function dayName(d){const i=d.getDay();return i===0?'Dimanche':DAYS[i-1]}
  function shortDay(d){return ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()]}
  function range(){const r=load(RANGE_KEY);let start=parse(r.start),end=parse(r.end);if(!start||!end){let w=null;try{w=parse(state.settings&&state.settings.weekDate)}catch(e){};w=monday(w||new Date());start=w;end=addDays(w,5)}return{start,end}}
  function resolveStore(x){try{return (state.stores||[]).find(s=>String(s.id)===String(x.id))||x}catch(e){return x}}
  function loadDate(date){const a=load(ARCHIVE_KEY),mon=monday(date),key=iso(mon),snap=a[key],name=dayName(date);if(name==='Dimanche')return;
    if(snap&&snap.plan){state.plan={};for(const d of DAYS)state.plan[d]=(snap.plan[d]||[]).map(resolveStore)}
    try{if(!state.settings)state.settings={};state.settings.weekDate=key;const week=document.getElementById('weekDate');if(week)week.value=key}catch(e){}
    activeDate=iso(date);window.selectedPlanningDay=name;
    try{if(typeof save==='function')save()}catch(e){}
    try{if(typeof window.renderWeek==='function')window.renderWeek();else if(typeof renderAll==='function')renderAll()}catch(e){}
    setTimeout(renderTabs,60);
  }
  function renderTabs(){const box=document.getElementById('dayTabs');if(!box)return false;const r=range(),frag=document.createDocumentFragment();box.innerHTML='';box.classList.add('periodDayTabs');
    let d=new Date(r.start),count=0;while(d<=r.end&&count<100){if(d.getDay()!==0){const b=document.createElement('button');b.type='button';b.className='dayTab periodDayTab'+(iso(d)===activeDate?' active':'');b.dataset.date=iso(d);b.innerHTML='<span>'+shortDay(d)+'</span><b>'+d.getDate()+'</b><small>'+d.toLocaleDateString('fr-FR',{month:'short'}).replace('.','')+'</small>';const copy=new Date(d);b.onclick=function(){loadDate(copy)};frag.appendChild(b)}d=addDays(d,1);count++}
    box.appendChild(frag);
    if(!activeDate){let current=null;try{current=parse(state.settings&&state.settings.weekDate)}catch(e){};current=current||r.start;activeDate=iso(current);const first=box.querySelector('[data-date="'+activeDate+'"]')||box.firstElementChild;if(first)first.classList.add('active')}
    const active=box.querySelector('.periodDayTab.active');if(active)setTimeout(()=>active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}),30);return true
  }
  function css(){if(document.getElementById('periodDaySliderCss'))return;const s=document.createElement('style');s.id='periodDaySliderCss';s.textContent='.periodDayTabs{display:flex!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;grid-template-columns:none!important;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;padding:4px 1px 8px!important;scrollbar-width:none}.periodDayTabs::-webkit-scrollbar{display:none}.periodDayTab{flex:0 0 72px!important;min-width:72px!important;scroll-snap-align:center;border:1px solid #e1e5ed;background:#fff;border-radius:16px;padding:8px 6px!important;text-align:center;color:#667085;min-height:66px}.periodDayTab span,.periodDayTab small{display:block;font-size:10px;line-height:1.1}.periodDayTab b{display:block;font-size:18px;line-height:1.2;color:#1d2939;margin:2px 0}.periodDayTab.active{background:#111318!important;color:#fff!important;border-color:#111318!important}.periodDayTab.active b{color:#fff!important}';document.head.appendChild(s)}
  function hooks(){if(!window.__periodDaySliderRender&&typeof window.renderWeek==='function'){const base=window.renderWeek;window.renderWeek=function(){const r=base.apply(this,arguments);setTimeout(renderTabs,30);return r};window.__periodDaySliderRender=true}}
  let n=0,t=setInterval(function(){n++;css();hooks();if(renderTabs()&&window.__periodDaySliderRender&&n>10)clearInterval(t);if(n>120)clearInterval(t)},100);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){css();hooks();renderTabs()});else setTimeout(function(){css();hooks();renderTabs()},0);
})();
