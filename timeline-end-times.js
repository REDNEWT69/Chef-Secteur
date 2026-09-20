(function(){
  'use strict';
  let observer=null,scheduled=false;
  const STYLE_ID='timeline-hours-clarity-css';
  const LEGEND_ID='planningHoursLegend';
  const TRAVEL_CLASS='tlTravelHint';
  const MANUAL_CLASS='tlManualHint';
  const SECONDARY_CLASS='tlSecondary';
  const IMPOSED_CLASS='tlTimeImposed';

  function mins(t){const m=String(t||'').match(/(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):null}
  function clock(v){v=((Math.round(v)%1440)+1440)%1440;return String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0')}

  /* Le trajet EST compté par l'ordonnanceur, mais il est arrondi à la minute : deux
     magasins voisins produisent 0, et deux heures identiques à l'écran donnaient
     l'impression que le trajet avait été oublié. On le dit explicitement. */
  function travelLabel(minutes,isFirst){
    /* Seul un vrai nombre de minutes est annoncé. null, '' ou undefined valent zéro
       une fois passés dans Number() : les annoncer comme « moins d'une minute »
       inventerait un trajet que l'ordonnanceur n'a pas calculé. */
    if(typeof minutes!=='number'||!Number.isFinite(minutes)||minutes<0)return '';
    const from=isFirst?'depuis le départ':'depuis le magasin précédent';
    if(Math.round(minutes)<1)return '↓ trajet de moins d’une minute '+from;
    return '↓ '+Math.round(minutes)+' min de trajet '+from;
  }

  function css(){
    if(!document.getElementById||document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    /* L'étiquette « Arrivée » est posée en CSS, pas en texte : la cellule .tlTime
       appartient à l'ordonnanceur (store-opening-hours.js, calendar-enhancements.js)
       qui la réécrit par textContent. Un ::before survit à ces réécritures. */
    style.textContent=
      '#'+LEGEND_ID+'{margin:8px 2px 10px;padding:9px 11px;border:1px solid #e4e8f0;border-radius:14px;background:#fafbfe;color:#5c6470;font-size:11.5px;line-height:1.45}'+
      '#'+LEGEND_ID+' b{color:#1d2939;font-weight:750}'+
      /* Le bloc horaire est une vraie cible tactile : il ouvre l'éditeur d'horaires.
         Le reste de la carte, lui, continue d'ouvrir la fiche magasin. */
      /* position/z-index : planning-manual-visits.js pose un calque de balayage en
         ::before sur toute la ligne et ne remonte que .tlMain au-dessus. Sans cela, le
         bloc horaire reste sous ce calque et aucun doigt ne l'atteint. */
      '#week .timelineRow:not(.calendarEvent) .tlTime{position:relative;z-index:1;display:block;box-sizing:border-box;margin:10px 5px 0 0;padding:6px 3px 6px;min-height:48px;border-radius:13px;background:rgba(20,40,160,.055);border:1px solid rgba(20,40,160,.13);color:#1428a0;text-align:center;font-size:14px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
      '#week .timelineRow:not(.calendarEvent) .tlTime:active{background:rgba(20,40,160,.13)}'+
      '#week .timelineRow:not(.calendarEvent) .tlTime::before{content:"Arrivée";display:block;margin-bottom:2px;font-size:8.5px;font-weight:800;letter-spacing:.02em;line-height:1.15;text-transform:uppercase;color:#6b7280}'+
      '#week .timelineRow:not(.calendarEvent) .tlTime::after{content:"✎";display:block;margin-top:1px;font-size:9.5px;font-weight:700;color:#8a93a3}'+
      '#week .timelineRow:not(.calendarEvent) .tlTime.'+IMPOSED_CLASS+'{background:rgba(20,40,160,.10);border-color:rgba(20,40,160,.24)}'+
      '#week .timelineRow:not(.calendarEvent) .tlTime.'+IMPOSED_CLASS+'::before{content:"Arrivée imposée";color:#1428a0}'+
      /* Le nom du magasin est l'information principale : deux lignes, et aucune coupure
         au milieu d'un mot. word-break:break-word autorisait « Boula / nger ». */
      '#week .timelineRow:not(.calendarEvent) .tlName{word-break:normal;overflow-wrap:break-word;hyphens:none;-webkit-hyphens:none}'+
      /* Les informations secondaires passent sous la ligne principale, sur toute la
         largeur : le trajet n'est plus enfermé dans une colonne étroite. */
      '#week .timelineRow:not(.calendarEvent) .tlMain{align-items:start}'+
      '#week .timelineRow:not(.calendarEvent) .'+SECONDARY_CLASS+'{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:5px 10px;margin-top:7px;min-width:0}'+
      '#week .timelineRow:not(.calendarEvent) .'+SECONDARY_CLASS+':empty{display:none}'+
      '#week .timelineRow:not(.calendarEvent) .'+SECONDARY_CLASS+' .tlDuration{white-space:normal;font-size:11.5px}'+
      '#week .timelineRow:not(.calendarEvent) .'+SECONDARY_CLASS+' .tlPinned{margin-top:0;white-space:normal}'+
      '#week .timelineRow:not(.calendarEvent) .'+SECONDARY_CLASS+' .'+TRAVEL_CLASS+',#week .timelineRow:not(.calendarEvent) .'+SECONDARY_CLASS+' .'+MANUAL_CLASS+'{margin-top:0;white-space:normal;overflow-wrap:break-word}'+
      '@media(max-width:700px){#week .timelineRow:not(.calendarEvent){grid-template-columns:58px 14px 1fr}}'+
      '.'+TRAVEL_CLASS+'{margin-top:5px;font-size:10.5px;line-height:1.3;color:#8a919d;font-weight:650}'+
      '.'+MANUAL_CLASS+'{margin-top:5px;font-size:10.5px;line-height:1.35;font-weight:750;color:#1428a0}'+
      '.'+MANUAL_CLASS+'.tlManualImpossible{color:#b42318}';
    document.head.appendChild(style);
  }

  function ensureLegend(week){
    const host=week&&week.parentNode;
    if(!host)return null;
    let legend=document.getElementById(LEGEND_ID);
    if(!legend){
      legend=document.createElement('div');
      legend.id=LEGEND_ID;
      legend.setAttribute('role','note');
      legend.innerHTML='<b>Heure affichée : arrivée estimée au magasin.</b> Elle part de ton heure de début de journée et ajoute le trajet depuis le départ, puis le trajet entre chaque magasin. La durée indiquée est le temps prévu sur place, réglable dans Mon activité.';
      host.insertBefore(legend,week);
    }
    if(legend.hidden)legend.hidden=false;
    return legend;
  }

  /* Un horaire imposé est écrit dans state.appointments et appliqué par le même
     ordonnanceur : on ne fait que le nommer, avec l'heure au plus tôt quand il ne
     peut pas être tenu. */
  function manualLabel(row){
    const api=window.StoreRunnerManualHours;
    if(!api||!row||!api.isManual(row.appointment))return null;
    const appointment=row.appointment;
    const parts=['◷ Arrivée imposée '+appointment.time];
    if(appointment.endTime)parts.push('départ '+appointment.endTime);
    /* C'est l'ordonnanceur qui tranche : lui seul sait qu'un premier arrêt plus tôt que
       « début de journée + trajet » est un départ avancé, pas une impossibilité. On ne
       redéduit rien, on lit son statut. */
    if(row.status==='appointment-conflict'){
      const earliest=Number.isFinite(Number(row.arrival))?Number(row.arrival):Number(row.nominalArrival);
      return {text:parts.join(' · ')+(Number.isFinite(earliest)?' — impossible : au plus tôt '+api.clock(earliest):' — impossible à tenir'),impossible:true};
    }
    return {text:parts.join(' · '),impossible:false};
  }

  /* Lecture seule de l'ordonnanceur existant : aucun recalcul d'itinéraire ici. */
  function scheduleRows(){
    try{
      const api=window.StoreOpeningHoursV1;
      if(!api||typeof api.scheduleRoute!=='function')return null;
      const day=typeof api.dayNow==='function'?api.dayNow():null;
      const plan=window.state&&window.state.plan;
      const route=day&&plan?plan[day]:null;
      if(!route||!route.length)return null;
      const schedule=api.scheduleRoute(route,day,window.state);
      return schedule&&Array.isArray(schedule.rows)?schedule.rows:null;
    }catch(e){return null}
  }

  /* Le bloc ARRIVÉE devient une cible tactile distincte : il ouvre l'éditeur d'horaires
     existant, sans le dupliquer. La carte, elle, garde son propre geste vers la fiche
     magasin — y compris la flèche, qui vit dans .tlMain. Le magasin et le jour sont lus
     dans le onclick écrit par renderWeek, la seule source qui ne peut pas diverger de la
     ligne affichée. */
  function wireArrival(row,item){
    const time=row.querySelector('.tlTime');
    const main=row.querySelector('.tlMain[onclick]');
    if(!time||!main)return;
    const parsed=String(main.getAttribute('onclick')||'').match(/openStoreQuick\('([^']*)','([^']*)'/);
    if(!parsed)return;
    const hours=window.StoreRunnerManualHours;
    const imposed=!!(hours&&typeof hours.isManual==='function'&&item&&hours.isManual(item.appointment));
    time.dataset.tlStore=parsed[1];
    time.dataset.tlDay=parsed[2];
    if(time.classList.contains(IMPOSED_CLASS)!==imposed)time.classList.toggle(IMPOSED_CLASS,imposed);
    const label=imposed?'Modifier l’horaire imposé de cette visite':'Définir l’heure d’arrivée de cette visite';
    if(time.getAttribute('aria-label')!==label)time.setAttribute('aria-label',label);
    if(time.dataset.tlEditable==='1')return;
    time.dataset.tlEditable='1';
    time.setAttribute('role','button');
    time.setAttribute('tabindex','0');
    const openEditor=function(event){
      if(event){event.preventDefault();event.stopPropagation()}
      const api=window.StoreRunnerManualHours;
      if(api&&typeof api.open==='function')api.open(time.dataset.tlStore,time.dataset.tlDay);
    };
    time.addEventListener('click',openEditor);
    time.addEventListener('keydown',function(event){
      if(event&&(event.key==='Enter'||event.key===' '||event.key==='Spacebar'))openEditor(event);
    });
  }

  /* Durée, fin, trajet, horaire imposé et repère de pose descendent sous la ligne
     principale, sur toute la largeur de la carte. */
  function secondary(row){
    const main=row.querySelector('.tlMain');
    if(!main)return null;
    let box=main.querySelector('.'+SECONDARY_CLASS);
    if(!box){box=document.createElement('div');box.className=SECONDARY_CLASS;main.appendChild(box)}
    else if(box.parentNode!==main)main.appendChild(box);
    for(const selector of ['.tlDuration','.tlPinned']){
      const el=row.querySelector(selector);
      if(el&&el.parentNode!==box)box.appendChild(el);
    }
    return box;
  }

  function decorate(){
    const week=document.getElementById('week');
    const rows=Array.from(document.querySelectorAll('.timelineRow'));
    const storeRows=rows.filter(r=>!r.classList.contains('calendarEvent'));
    if(!storeRows.length){
      const legend=document.getElementById(LEGEND_ID);
      if(legend&&!legend.hidden)legend.hidden=true;
      return;
    }
    css();
    if(week)ensureLegend(week);
    const rowsSchedule=scheduleRows();
    storeRows.forEach(function(row,index){
      const t=row.querySelector('.tlTime'),d=row.querySelector('.tlDuration');
      if(t&&d){
        const start=mins(t.textContent),dm=String(d.dataset.baseDuration||d.textContent||'').match(/(\d+)\s*min/i);
        if(start!=null&&dm){
          const duration=+dm[1],end=clock(start+duration);
          if(!d.dataset.baseDuration)d.dataset.baseDuration=duration+' min';
          const label=d.dataset.baseDuration+' sur place · fin '+end;
          if(d.textContent!==label)d.textContent=label;
        }
      }
      const item=rowsSchedule?rowsSchedule[index]:null;
      wireArrival(row,item);
      const target=secondary(row);
      if(!target||!rowsSchedule)return;

      function line(className,text,impossible){
        let hint=row.querySelector('.'+className);
        if(!text){if(hint&&!hint.hidden)hint.hidden=true;return}
        if(!hint){hint=document.createElement('div');hint.className=className;target.appendChild(hint)}
        if(hint.textContent!==text)hint.textContent=text;
        if(hint.hidden)hint.hidden=false;
        const flagged=className+' tlManualImpossible';
        const wanted=impossible?flagged:className;
        if(hint.className!==wanted)hint.className=wanted;
      }

      const manual=manualLabel(item);
      line(MANUAL_CLASS,manual?manual.text:'',!!(manual&&manual.impossible));
      line(TRAVEL_CLASS,travelLabel(item&&item.travel,index===0),false);
    });
  }

  function schedule(){if(scheduled)return;scheduled=true;setTimeout(function(){scheduled=false;decorate()},40)}
  function observeTimeline(){if(observer)return true;const host=document.getElementById('planPanel')||document.querySelector('.timelineShell');if(!host)return false;observer=new MutationObserver(function(records){for(const r of records){if(r.type==='characterData'||(r.addedNodes&&r.addedNodes.length)){schedule();return}}});observer.observe(host,{childList:true,subtree:true,characterData:true});return true}
  function boot(){decorate();observeTimeline()}

  const publicApi={travelLabel:travelLabel,decorate:decorate};
  if(typeof module!=='undefined'&&module.exports)module.exports=publicApi;
  if(typeof window==='undefined'||typeof document==='undefined')return;
  window.StoreRunnerTimelineHours=publicApi;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('focus',schedule);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule()});
  document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('#dayTabs,.periodDayTab,.dayTab'))setTimeout(decorate,80)},true);
  window.addEventListener('chef-range-generated',schedule);
})();
