(function(){
  'use strict';
  let observer=null,scheduled=false;
  const STYLE_ID='timeline-hours-clarity-css';
  const LEGEND_ID='planningHoursLegend';
  const TRAVEL_CLASS='tlTravelHint';
  const MANUAL_CLASS='tlManualHint';

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
      '#week .timelineRow:not(.calendarEvent) .tlTime{padding-top:11px}'+
      '#week .timelineRow:not(.calendarEvent) .tlTime::before{content:"Arrivée";display:block;margin-bottom:1px;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#98a1ae}'+
      '#'+LEGEND_ID+'{margin:8px 2px 10px;padding:9px 11px;border:1px solid #e4e8f0;border-radius:14px;background:#fafbfe;color:#5c6470;font-size:11.5px;line-height:1.45}'+
      '#'+LEGEND_ID+' b{color:#1d2939;font-weight:750}'+
      '.'+TRAVEL_CLASS+'{margin-top:5px;font-size:10.5px;line-height:1.3;color:#8a919d;font-weight:650}'+
      '@media(max-width:700px){#week .timelineRow:not(.calendarEvent) .tlTime{padding-top:6px}}';
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
    /* L'heure réellement tenable est celle que l'ordonnanceur a retenue : elle tient
       compte du trajet, mais aussi de l'ouverture et de l'Agenda, là où nominalArrival
       ne couvre que le trajet. */
    const nominal=Number(row.nominalArrival),planned=Number(row.arrival);
    const earliest=Number.isFinite(planned)?Math.max(Number.isFinite(nominal)?nominal:planned,planned):nominal;
    const wanted=api.minutes(appointment.time);
    if(Number.isFinite(earliest)&&wanted!=null&&wanted<Math.round(earliest)){
      return {text:parts.join(' · ')+' — impossible : au plus tôt '+api.clock(earliest),impossible:true};
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
      if(!rowsSchedule)return;
      const target=row.querySelector('.tlMain>div:first-child')||row.querySelector('.tlMain');
      if(!target)return;
      const item=rowsSchedule[index];

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
