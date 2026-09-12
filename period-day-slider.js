(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  const RANGE_KEY='chef_sector_range_v1';
  let activeDate='',tabObserver=null,renderScheduled=false,lastTabsSignature=null;
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
    /* Avant de quitter la semaine affichée, on la conserve dans l'archive : revenir
       dessus doit retrouver le planning existant, jamais le perdre. */
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
    /* Message appartenant au slider : jamais d'échec silencieux quand une semaine
       affichée dans la bande n'a pas encore de planning. */
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
    if(missing){
      /* La semaine visée n'a pas encore de planning : on garde la semaine courante
         dans l'archive, on affiche la nouvelle semaine vide et on le dit clairement.
         Le plan courant n'est jamais réétiqueté sur une autre semaine. */
      archiveCurrentWeek();
      state.plan=emptyPlan();
    }
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
      // Only swallow the ghost click on the exact row/element that was just dragged - never
      // the whole panel, so a quick tap on the day tabs (or any other control) right after a
      // list swipe is never accidentally eaten.
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
    /* Liste des jours réellement affichables pour la période courante - la seule
       donnée dont dépend la structure de la bande. Un changement de jour actif ne
       fait jamais partie de cette liste : il ne doit donc jamais déclencher de
       reconstruction (voir renderTabs). */
    const entries=[];let d=new Date(r.start),count=0;
    while(d<=r.end&&count<100){const name=dayName(d);if(name!=='Dimanche'&&r.workDays.includes(name))entries.push(new Date(d));d=addDays(d,1);count++}
    return entries;
  }
  function tabsSignature(entries){return entries.map(iso).join(',')}
  function boxMatchesEntries(box,entries){
    /* La signature seule ne suffit pas : le noyau historique peut reconstruire
       #dayTabs avec ses propres onglets .dayTab (sans .periodDayTab) sans que la
       période/les jours travaillés n'aient changé. Il faut donc aussi vérifier que
       la bande contient déjà, réellement, exactement les onglets slider attendus -
       même nombre, mêmes data-date, dans le même ordre - sinon on reconstruit. */
    const tabs=[...box.querySelectorAll('.periodDayTab[data-date]')];
    if(tabs.length!==entries.length)return false;
    for(let i=0;i<entries.length;i++)if(tabs[i].dataset.date!==iso(entries[i]))return false;
    return true;
  }
  function updateActiveTab(box){
    /* Ne recrée jamais les onglets : bascule la classe active sur les nœuds
       existants, pour ne jamais perturber le scroll horizontal de #dayTabs. */
    const tabs=[...box.querySelectorAll('.periodDayTab[data-date]')];let found=false;
    for(const tab of tabs){const isActive=tab.dataset.date===activeDate;tab.classList.toggle('active',isActive);if(isActive)found=true}
    if(!found){const first=box.firstElementChild;if(first){first.classList.add('active');activeDate=first.dataset.date||''}}
    return box.querySelector('.periodDayTab.active');
  }
  function centerIfOffscreen(box,active){
    /* Ne jamais annuler un défilement que l'utilisateur vient de faire : on ne
       recentre l'onglet actif que s'il est réellement hors de vue, et jamais en
       animé - un simple changement de jour actif ne doit produire aucune saccade. */
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
      /* La liste des jours affichés a réellement changé (nouvelle période, jours
         travaillés modifiés), c'est le tout premier rendu, ou #dayTabs a été
         remplacé entretemps par autre chose que les onglets slider attendus (le
         noyau historique reconstruit parfois la bande avec ses propres .dayTab) :
         seules ces situations justifient une reconstruction complète. */
      const frag=document.createDocumentFragment();
      for(const d of entries){
        const b=document.createElement('button');b.type='button';b.className='dayTab periodDayTab';b.dataset.date=iso(d);
        b.innerHTML='<span>'+shortDay(d)+'</span><b>'+d.getDate()+'</b><small>'+d.toLocaleDateString('fr-FR',{month:'short'}).replace('.','')+'</small>';
        const copy=new Date(d);b.onclick=function(){loadDate(copy)};frag.appendChild(b);
      }
      box.innerHTML='';box.appendChild(frag);lastTabsSignature=signature;
      /* Marqueur de prise en charge posé seulement une fois les onglets réellement
         écrits, jamais au démarrage ni avant une reconstruction réussie : si le rendu
         n'a produit aucun onglet, le noyau historique doit reprendre la main sur la
         bande plutôt que de rester silencieux devant #dayTabs vide. */
      if(box.querySelector('.periodDayTab'))box.dataset.periodSliderOwner='1';
      else delete box.dataset.periodSliderOwner;
    }
    const active=updateActiveTab(box);
    if(active){syncPlanningHero();centerIfOffscreen(box,active)}
    return true;
  }
  /* Le défilement horizontal de la bande appartient au navigateur : pas de touch-action
     restrictif, pas de scroll-snap, aucun déplacement de scrollLeft en JavaScript. Sur
     iPhone, remplacer le défilement natif par un drag manuel supprimait l'inertie, faisait
     avancer la bande par événement et rendait la fin d'une période de plusieurs semaines
     inatteignable. Le auto!important est nécessaire pour neutraliser le touch-action:pan-x
     que planning-ui-fixes.js pose sur #planPanel #dayTabs, plus spécifique que .periodDayTabs :
     sans lui, un geste vertical parti de la bande ne ferait plus défiler la page.
     Le changement de jour reste au tap sur un onglet et au balayage franc de la liste. */
  function css(){if(document.getElementById('periodDaySliderCss'))return;const s=document.createElement('style');s.id='periodDaySliderCss';s.textContent='.periodDayTabs{display:flex!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;grid-template-columns:none!important;-webkit-overflow-scrolling:touch;touch-action:auto!important;overscroll-behavior-x:contain;padding:4px 1px 8px!important;scrollbar-width:none}.periodDayTabs::-webkit-scrollbar{display:none}.periodDayTab{flex:1 1 0!important;min-width:56px!important;max-width:96px!important;touch-action:auto!important;border:1px solid #e1e5ed;background:#fff;border-radius:16px;padding:8px 6px!important;text-align:center;color:#667085;min-height:66px}.periodDayTab span,.periodDayTab small{display:block;font-size:10px;line-height:1.1}.periodDayTab b{display:block;font-size:18px;line-height:1.2;color:#1d2939;margin:2px 0}.periodDayTab.active{background:#111318!important;color:#fff!important;border-color:#111318!important}.periodDayTab.active b{color:#fff!important}';document.head.appendChild(s)}
  function observeTabs(){if(tabObserver||typeof MutationObserver==='undefined')return;const box=document.getElementById('dayTabs');if(!box)return;tabObserver=new MutationObserver(()=>{if(!box.querySelector('.periodDayTab'))scheduleRender()});tabObserver.observe(box,{childList:true})}
  function boot(){css();observeTabs();renderTabs();bindListSwipe(document.getElementById('planPanel'))}
  window.addEventListener('chef-range-generated',function(){activeDate='';scheduleRender()});
  document.addEventListener('store-runner:planning-updated',scheduleRender);
  document.addEventListener('store-runner:data-restored',function(){activeDate='';scheduleRender()});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();