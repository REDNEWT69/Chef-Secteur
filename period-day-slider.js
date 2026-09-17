(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  const RANGE_KEY='chef_sector_range_v1';
  let activeDate='',tabObserver=null,renderScheduled=false,lastTabsSignature=null,overnightCuePulseRequested=false;
  function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
  function storage(){try{return window.__chefStorage||window.localStorage||null}catch(e){try{return window.__chefStorage||null}catch(_){return null}}}
  function load(key){const db=storage();if(!db)return{};try{return JSON.parse(db.getItem(key)||'{}')||{}}catch(e){return{}}}
  function dayName(d){const i=d.getDay();return i===0?'Dimanche':DAYS[i-1]}
  function shortDay(d){return ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()]}
  function currentWorkDays(){try{return ((window.state&&window.state.settings&&window.state.settings.days)||DAYS.slice(0,5)).slice()}catch(e){return DAYS.slice(0,5)}}
  function range(){const r=load(RANGE_KEY);let start=parse(r.start),end=parse(r.end);if(!start||!end){let w=null;try{w=parse(window.state&&window.state.settings&&window.state.settings.weekDate)}catch(e){};w=monday(w||new Date());start=w;end=addDays(w,5)}return{start,end,workDays:Array.isArray(r.workDays)&&r.workDays.length?r.workDays.slice():currentWorkDays()}}
  function resolveStore(x){try{return (state.stores||[]).find(s=>String(s.id)===String(x.id))||x}catch(e){return x}}
  function scheduleRender(){if(renderScheduled)return;renderScheduled=true;const run=()=>{renderScheduled=false;renderTabs()};if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0)}
  function syncPlanningHero(){
    const active=document.querySelector('#dayTabs .periodDayTab.active[data-date]');if(!active)return false;
    const date=parse(active.dataset.date);if(!date)return false;
    const dayLabel=document.getElementById('planningHeroDay'),fullLabel=document.getElementById('planningHeroFull');
    if(dayLabel){const day=new Intl.DateTimeFormat('fr-FR',{weekday:'long'}).format(date);dayLabel.textContent=day.charAt(0).toUpperCase()+day.slice(1)+' '+date.getDate()}
    if(fullLabel)fullLabel.textContent=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(date);
    return true;
  }
  function humanDate(d){try{return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(d)}catch(e){return iso(d)}}
  function emptyPlan(){const p={};for(const d of DAYS)p[d]=[];return p}
  function planHasVisits(plan){try{return DAYS.some(d=>Array.isArray(plan&&plan[d])&&plan[d].length>0)}catch(e){return false}}
  function archiveCurrentWeek(){
    try{
      const db=storage();if(!db)return false;
      const key=String((state.settings&&state.settings.weekDate)||'').slice(0,10);
      if(!key||!planHasVisits(state.plan))return false;
      const a=load(ARCHIVE_KEY);
      a[key]=Object.assign({},a[key],{weekMonday:key,plan:state.plan});
      db.setItem(ARCHIVE_KEY,JSON.stringify(a));
      return true;
    }catch(e){return false}
  }
  function notice(message){
    const box=document.getElementById('dayTabs');if(!box||!box.parentNode)return false;
    let el=document.getElementById('periodDayNotice');
    if(!el){
      if(!message)return false;
      el=document.createElement('div');el.id='periodDayNotice';el.setAttribute('role','status');el.setAttribute('aria-live','polite');
      el.style.cssText='margin:6px 2px 0;font-size:12px;line-height:1.4;color:#667085;font-weight:500';
      box.insertAdjacentElement('afterend',el);
    }
    el.textContent=message||'';el.hidden=!message;
    return true;
  }
  function loadDate(date){
    const a=load(ARCHIVE_KEY),mon=monday(date),key=iso(mon),snap=a[key],name=dayName(date),r=range();
    if(name==='Dimanche'||!r.workDays.includes(name))return false;
    let currentWeek='';try{currentWeek=String((state.settings&&state.settings.weekDate)||'').slice(0,10)}catch(e){}
    const missing=(!snap||!snap.plan)&&key!==currentWeek;
    if(missing){archiveCurrentWeek();state.plan=emptyPlan()}
    if(snap&&snap.plan){state.plan={};for(const d of DAYS)state.plan[d]=(snap.plan[d]||[]).map(resolveStore)}
    try{if(!state.settings)state.settings={};state.settings.weekDate=key;const week=document.getElementById('weekDate');if(week)week.value=key}catch(e){}
    activeDate=iso(date);
    window.selectedPlanningDay=name;
    try{if(typeof save==='function')save()}catch(e){}
    try{
      if(typeof window.selectPlanningDay==='function')window.selectPlanningDay(name);
      else if(typeof window.renderWeek==='function')window.renderWeek();
      else if(typeof renderAll==='function')renderAll();
    }catch(e){}
    try{notice(missing?'Semaine du '+humanDate(mon)+' non générée. Utilise « Générer ma semaine » pour la remplir.':'')}catch(e){}
    scheduleRender();
    return true;
  }
  function navigateAdjacent(box,step){
    const tabs=[...box.querySelectorAll('.periodDayTab[data-date]')];if(!tabs.length)return false;
    let idx=tabs.findIndex(x=>x.classList.contains('active'));if(idx<0)idx=0;
    const target=tabs[idx+step];if(!target)return false;
    const date=parse(target.dataset.date);if(!date)return false;
    return loadDate(date);
  }
  function isInteractiveTarget(el){return !!(el&&el.closest&&el.closest('button,a,input,select,textarea,[role="button"],#dayTabs,.periodDayTab,.dayTab,.assist-fab,#assistFab,.bottomNavBtn'))}
  function bindListSwipe(container){
    if(!container||container.dataset.listSwipeBound==='1')return false;
    container.dataset.listSwipeBound='1';
    let startX=0,startY=0,lastX=0,armed=false,dragging=false,suppressClickUntil=0,suppressTarget=null,startTarget=null;
    container.addEventListener('touchstart',function(e){
      const t=e.touches&&e.touches[0];if(!t)return;
      if(isInteractiveTarget(e.target)){armed=false;return}
      startX=lastX=t.clientX;startY=t.clientY;armed=true;dragging=false;
      startTarget=(e.target&&e.target.closest&&e.target.closest('.tlMain'))||e.target;
    },{passive:true});
    container.addEventListener('touchmove',function(e){
      if(!armed)return;
      const t=e.touches&&e.touches[0];if(!t)return;
      const dx=t.clientX-startX,dy=t.clientY-startY;lastX=t.clientX;
      if(!dragging&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2)dragging=true;
      if(dragging&&e.cancelable)e.preventDefault();
    },{passive:false});
    container.addEventListener('touchend',function(){
      if(!armed)return;
      armed=false;
      if(!dragging)return;
      dragging=false;
      const dx=lastX-startX;
      suppressClickUntil=Date.now()+400;suppressTarget=startTarget;
      if(Math.abs(dx)>=60){const box=document.getElementById('dayTabs');if(box)navigateAdjacent(box,dx<0?1:-1)}
    },{passive:true});
    container.addEventListener('touchcancel',function(){armed=false;dragging=false},{passive:true});
    container.addEventListener('click',function(e){
      if(Date.now()<suppressClickUntil&&suppressTarget&&(e.target===suppressTarget||(suppressTarget.contains&&suppressTarget.contains(e.target)))){
        e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation()
      }
    },true);
    return true;
  }
  function buildEntries(r){
    const entries=[];let d=new Date(r.start),count=0;
    while(d<=r.end&&count<100){const name=dayName(d);if(name!=='Dimanche'&&r.workDays.includes(name))entries.push(new Date(d));d=addDays(d,1);count++}
    return entries;
  }
  function focusTodayIfVisible(now){
    const panel=document.getElementById('planPanel');
    if(!panel||!panel.classList.contains('active'))return false;
    const today=now instanceof Date?new Date(now):new Date();today.setHours(12,0,0,0);
    const key=iso(today),entries=buildEntries(range());
    if(!entries.some(d=>iso(d)===key))return false;
    return loadDate(today);
  }
  function currentOvernightCandidate(){try{return typeof window.overnightCandidate==='function'?window.overnightCandidate():null}catch(e){return null}}
  function analyzeArchivedWeek(plan,weekDate){
    const api=window.StoreRunnerStoreControlsV189;
    if(!api||typeof api.futureOvernightAnalysis!=='function')return null;
    try{const analysis=api.futureOvernightAnalysis(plan||{},String(weekDate||'').slice(0,10));return analysis&&analysis.candidate||null}catch(e){return null}
  }
  function periodOvernightCandidate(){
    const r=range(),today=iso(new Date()),start=iso(r.start),end=iso(r.end),currentWeek=String(window.state&&state.settings&&state.settings.weekDate||'').slice(0,10),out=[];
    const current=currentOvernightCandidate();
    if(current&&current.fromDate>=today&&current.fromDate>=start&&current.fromDate<=end)out.push(current);
    const archive=load(ARCHIVE_KEY);
    for(const [key,snap] of Object.entries(archive||{})){
      const weekDate=String(snap&&snap.weekMonday||key||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(weekDate)||weekDate===currentWeek||!snap||!snap.plan)continue;
      const mon=parse(weekDate);if(!mon)continue;
      const weekEnd=iso(addDays(mon,6));
      if(weekEnd<today||weekDate>end||weekEnd<start)continue;
      const candidate=analyzeArchivedWeek(snap.plan,weekDate);
      if(candidate&&candidate.fromDate>=today&&candidate.fromDate>=start&&candidate.fromDate<=end)out.push(candidate)
    }
    out.sort((a,b)=>String(a.fromDate||'').localeCompare(String(b.fromDate||''))||Number(b.saving||0)-Number(a.saving||0));
    return out[0]||null
  }
  function overnightCandidateSafe(){try{return periodOvernightCandidate()}catch(e){return currentOvernightCandidate()}}
  function overnightLabel(candidate){
    if(!candidate)return'';
    const from=parse(candidate.fromDate),to=parse(candidate.toDate),fromDay=candidate.fromDay||(from?dayName(from):''),toDay=candidate.toDay||(to?dayName(to):'');
    const dates=from&&to?' · '+from.getDate()+'/'+String(from.getMonth()+1).padStart(2,'0')+' → '+to.getDate()+'/'+String(to.getMonth()+1).padStart(2,'0'):'';
    return(fromDay&&toDay?fromDay+' → '+toDay:'Découché')+dates;
  }
  function cueHost(){return document.getElementById('planningHeroV2')||document.getElementById('planningToolsV2')}
  function focusHotel(candidate){
    const date=parse(candidate&&candidate.fromDate);if(date)loadDate(date);
    try{if(typeof window.renderOvernight==='function')window.renderOvernight()}catch(e){}
    const reveal=()=>{
      const box=document.getElementById('overnightBox');if(!box)return;
      box.classList.remove('srHotelFocusV206');void box.offsetWidth;box.classList.add('srHotelFocusV206');
      box.addEventListener('animationend',()=>box.classList.remove('srHotelFocusV206'),{once:true});
      if(typeof box.scrollIntoView==='function')box.scrollIntoView({block:'center'});
    };
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(reveal));else reveal();
  }
  function syncOvernightVisibility(){
    const box=document.getElementById('dayTabs');if(!box)return false;
    const candidate=overnightCandidateSafe(),animate=overnightCuePulseRequested,candidateDate=String(candidate&&candidate.fromDate||'');
    box.querySelectorAll('.hotelDayBadge').forEach(b=>{const tab=b.closest('.dayTab');if(!candidate||!tab||tab.dataset.date!==candidateDate)b.remove()});
    box.querySelectorAll('.srOvernightDayV207').forEach(tab=>{if(!candidate||tab.dataset.date!==candidateDate)tab.classList.remove('srOvernightDayV207')});
    box.querySelectorAll('.srOvernightRingV207').forEach(tab=>{if(!candidate||tab.dataset.date!==candidateDate||animate)tab.classList.remove('srOvernightRingV207')});
    if(candidate&&candidate.fromDate){
      const tab=box.querySelector('.dayTab[data-date="'+candidateDate.replace(/"/g,'')+'"]');
      if(tab){
        tab.classList.add('srOvernightDayV207');
        let badge=tab.querySelector('.hotelDayBadge');
        if(!badge){badge=document.createElement('span');badge.className='hotelDayBadge';tab.appendChild(badge)}
        badge.textContent='🌙 découché';
        badge.setAttribute('aria-label','Découché '+overnightLabel(candidate));
        badge.title='Découché '+overnightLabel(candidate);
        if(animate){void tab.offsetWidth;tab.classList.add('srOvernightRingV207')}
      }
    }
    let cue=document.getElementById('planningOvernightCueV206');
    if(!candidate){if(cue)cue.remove();overnightCuePulseRequested=false;return true}
    const host=cueHost();if(!host)return false;
    if(!cue){
      cue=document.createElement('button');cue.id='planningOvernightCueV206';cue.type='button';cue.className='planningOvernightCueV206';
      cue.innerHTML='<span class="planningOvernightCueIcon">🌙</span><span class="planningOvernightCueCopy"><b data-overnight-title></b><small>Hôtel conseillé · toucher pour afficher</small></span><span class="planningOvernightCueArrow" aria-hidden="true">›</span>';
      cue.addEventListener('click',function(){focusHotel(overnightCandidateSafe()||candidate)});
    }
    if(cue.parentNode!==host)host.appendChild(cue);
    const title=cue.querySelector('[data-overnight-title]');if(title)title.textContent='Découché '+overnightLabel(candidate);
    cue.dataset.date=candidateDate;
    cue.setAttribute('aria-label','Découché '+overnightLabel(candidate)+'. Afficher l’hôtel conseillé.');
    if(animate){cue.classList.remove('is-pulsing');void cue.offsetWidth;cue.classList.add('is-pulsing');cue.addEventListener('animationend',()=>cue.classList.remove('is-pulsing'),{once:true})}
    overnightCuePulseRequested=false;
    return true;
  }
  function tabsSignature(entries){return entries.map(iso).join(',')}
  function boxMatchesEntries(box,entries){
    const tabs=[...box.querySelectorAll('.periodDayTab[data-date]')];
    if(tabs.length!==entries.length)return false;
    for(let i=0;i<entries.length;i++)if(tabs[i].dataset.date!==iso(entries[i]))return false;
    return true;
  }
  function updateActiveTab(box){
    const tabs=[...box.querySelectorAll('.periodDayTab[data-date]')];let found=false;
    for(const tab of tabs){const isActive=tab.dataset.date===activeDate;tab.classList.toggle('active',isActive);if(isActive)found=true}
    if(!found){const first=box.firstElementChild;if(first){first.classList.add('active');activeDate=first.dataset.date||''}}
    return box.querySelector('.periodDayTab.active');
  }
  function centerIfOffscreen(box,active){
    if(!box||!active)return;
    if(typeof box.getBoundingClientRect!=='function'||typeof active.getBoundingClientRect!=='function')return;
    const boxRect=box.getBoundingClientRect(),tabRect=active.getBoundingClientRect();
    const visible=tabRect.left>=boxRect.left-0.5&&tabRect.right<=boxRect.right+0.5;
    if(!visible&&typeof active.scrollIntoView==='function')active.scrollIntoView({block:'nearest',inline:'center'});
  }
  function renderTabs(){
    const box=document.getElementById('dayTabs');if(!box)return false;
    const r=range(),entries=buildEntries(r),signature=tabsSignature(entries);
    box.classList.add('periodDayTabs');
    if(signature!==lastTabsSignature||!box.firstElementChild||!boxMatchesEntries(box,entries)){
      const frag=document.createDocumentFragment();
      for(const d of entries){
        const b=document.createElement('button');b.type='button';b.className='dayTab periodDayTab';b.dataset.date=iso(d);
        b.innerHTML='<span>'+shortDay(d)+'</span><b>'+d.getDate()+'</b><small>'+d.toLocaleDateString('fr-FR',{month:'short'}).replace('.','')+'</small>';
        const copy=new Date(d);b.onclick=function(){loadDate(copy)};frag.appendChild(b);
      }
      box.innerHTML='';box.appendChild(frag);lastTabsSignature=signature;
      if(box.querySelector('.periodDayTab'))box.dataset.periodSliderOwner='1';
      else delete box.dataset.periodSliderOwner;
    }
    const active=updateActiveTab(box);
    if(active){syncPlanningHero();centerIfOffscreen(box,active)}
    syncOvernightVisibility();
    return true;
  }
  function css(){if(document.getElementById('periodDaySliderCss'))return;const s=document.createElement('style');s.id='periodDaySliderCss';s.textContent='.periodDayTabs{display:flex!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;grid-template-columns:none!important;-webkit-overflow-scrolling:touch;touch-action:auto!important;overscroll-behavior-x:contain;padding:4px 1px 8px!important;scrollbar-width:none}.periodDayTabs::-webkit-scrollbar{display:none}.periodDayTab{position:relative;flex:1 1 0!important;min-width:56px!important;max-width:96px!important;touch-action:auto!important;border:1px solid #e1e5ed;background:#fff;border-radius:16px;padding:8px 6px!important;text-align:center;color:#667085;min-height:66px}.periodDayTab span,.periodDayTab small{display:block;font-size:10px;line-height:1.1}.periodDayTab b{display:block;font-size:18px;line-height:1.2;color:#1d2939;margin:2px 0}.periodDayTab.active{background:#111318!important;color:#fff!important;border-color:#111318!important}.periodDayTab.active b{color:#fff!important}.periodDayTab .hotelDayBadge{position:absolute;top:4px;right:4px;display:flex!important;align-items:center;justify-content:center;width:18px;height:18px;margin:0!important;padding:0!important;overflow:hidden;border-radius:999px;background:#fff4c2;border:1px solid rgba(154,98,0,.16);font-size:0!important;line-height:1!important;box-shadow:0 2px 7px rgba(91,64,0,.10);z-index:2}.periodDayTab .hotelDayBadge:before{content:"🌙";font-size:11px;line-height:1}.periodDayTab.active .hotelDayBadge{position:static;width:auto;height:auto;display:inline-flex!important;margin:4px auto 0!important;padding:3px 5px!important;font-size:9px!important;font-weight:850;white-space:nowrap;color:#ffe08a;background:rgba(255,224,138,.12);border-color:rgba(255,224,138,.26);box-shadow:none}.periodDayTab.active .hotelDayBadge:before{content:"";font-size:0}.planningOvernightCueV206{width:100%;display:flex;align-items:center;gap:10px;margin:10px 0 2px;padding:11px 12px;border:1px solid rgba(154,98,0,.18);border-radius:16px;background:linear-gradient(135deg,rgba(255,248,219,.98),rgba(255,255,255,.92));box-shadow:0 6px 18px rgba(91,64,0,.08);color:#3f3212;text-align:left;min-height:54px}.planningOvernightCueIcon{font-size:20px!important;line-height:1!important;flex:0 0 auto}.planningOvernightCueCopy{display:flex!important;flex:1 1 auto;min-width:0;flex-direction:column;gap:2px}.planningOvernightCueCopy b{font-size:12px;line-height:1.2;color:#3f3212;white-space:normal}.planningOvernightCueCopy small{font-size:10px;color:#806b32;white-space:normal}.planningOvernightCueArrow{font-size:23px!important;line-height:1!important;color:#9a6200;flex:0 0 auto}.planningOvernightCueV206.is-pulsing{animation:srOvernightCuePulseV206 .62s ease-in-out 2}.srHotelFocusV206{animation:srHotelFocusV206 .8s ease-out 1}@keyframes srOvernightCuePulseV206{0%,100%{transform:scale(1);box-shadow:0 6px 18px rgba(91,64,0,.08)}50%{transform:scale(1.018);box-shadow:0 8px 25px rgba(184,132,0,.20)}}@keyframes srHotelFocusV206{0%{outline:0 solid rgba(242,201,76,0)}35%{outline:5px solid rgba(242,201,76,.28);outline-offset:4px}100%{outline:0 solid rgba(242,201,76,0);outline-offset:8px}}.periodDayTab.srOvernightDayV207:not(:has(.hotelDayBadge))::before{content:"🌙";position:absolute;top:4px;right:4px;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:#fff4c2;border:1px solid rgba(154,98,0,.16);font-size:11px;line-height:1;box-shadow:0 2px 7px rgba(91,64,0,.10);z-index:3}.periodDayTab.active.srOvernightDayV207:not(:has(.hotelDayBadge))::before{content:"🌙 découché";position:static;width:auto;height:auto;display:inline-flex;margin:4px auto 0;padding:3px 5px;font-size:9px;font-weight:850;white-space:nowrap;color:#ffe08a;background:rgba(255,224,138,.12);border-color:rgba(255,224,138,.26);box-shadow:none}.periodDayTab.srOvernightRingV207::after{content:"";position:absolute;inset:-4px;border-radius:20px;padding:2px;background:conic-gradient(from 0deg,rgba(255,205,64,0) 0 15%,rgba(255,205,64,.98) 28%,rgba(255,244,174,.42) 42%,rgba(255,205,64,0) 58% 100%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:4;opacity:0;animation:srOvernightRingV207 1.05s linear 2}.periodDayTab.srOvernightRingV207{box-shadow:0 0 0 1px rgba(242,201,76,.28),0 0 20px rgba(242,201,76,.22)}@keyframes srOvernightRingV207{0%{transform:rotate(0deg);opacity:0}12%{opacity:1}88%{opacity:1}100%{transform:rotate(360deg);opacity:0}}@media(prefers-reduced-motion:reduce){.planningOvernightCueV206.is-pulsing,.srHotelFocusV206,.periodDayTab.srOvernightRingV207::after{animation:none!important}.periodDayTab.srOvernightRingV207::after{opacity:0!important}}';document.head.appendChild(s)}
  function observeTabs(){if(tabObserver||typeof MutationObserver==='undefined')return;const box=document.getElementById('dayTabs');if(!box)return;tabObserver=new MutationObserver(()=>{if(!box.querySelector('.periodDayTab'))scheduleRender()});tabObserver.observe(box,{childList:true})}
  function boot(){css();observeTabs();renderTabs();bindListSwipe(document.getElementById('planPanel'))}
  window.addEventListener('chef-range-generated',function(){activeDate='';scheduleRender()});
  document.addEventListener('store-runner:planning-updated',scheduleRender);
  document.addEventListener('store-runner:data-restored',function(){activeDate='';scheduleRender()});
  document.addEventListener('store-runner:planning-user-opened',function(){overnightCuePulseRequested=true;focusTodayIfVisible();scheduleRender()});
  window.StoreRunnerPeriodDaySlider={focusToday:focusTodayIfVisible,syncOvernight:syncOvernightVisibility};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();