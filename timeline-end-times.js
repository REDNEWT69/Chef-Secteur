(function(){
  'use strict';
  let observer=null,scheduled=false;
  const STYLE_ID='timeline-hours-clarity-css';
  const LEGEND_ID='planningHoursLegend';
  const TRAVEL_CLASS='tlTravelHint';
  const MANUAL_CLASS='tlManualHint';
  const SECONDARY_CLASS='tlSecondary';
  const IMPOSED_CLASS='tlTimeImposed';
  const ORIGIN_ID='planningDayOrigin';

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
      '.'+MANUAL_CLASS+'.tlManualImpossible{color:#b42318}'+
      '#'+ORIGIN_ID+'[hidden]{display:none!important}'+
      '#'+ORIGIN_ID+'.srOriginSet{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:8px 2px 0;padding:8px 11px;border:1px solid #e4e8f0;border-radius:13px;background:#fafbfe;color:#475467;font-size:11.5px;font-weight:700}'+
      '#'+ORIGIN_ID+' .srOriginChange{min-height:34px;padding:0 10px;border:0;border-radius:10px;background:rgba(20,40,160,.08);color:#1428a0;font-size:11px;font-weight:800}'+
      '#'+ORIGIN_ID+'.srOriginAsk{display:block;margin:8px 2px 0;padding:11px 12px;border:1px solid #f3d9a8;border-radius:15px;background:#fffaf1;color:#7a4b00;font-size:12px;line-height:1.45}'+
      '#'+ORIGIN_ID+'.srOriginAsk b{display:block;font-size:13px;color:#5c3800}'+
      '#'+ORIGIN_ID+' .srOriginActions{display:grid;gap:7px;margin-top:9px}'+
      '#'+ORIGIN_ID+' .srOriginActions button{min-height:46px;border:1px solid #e6d3ae;border-radius:13px;background:#fff;color:#5c3800;font-size:13px;font-weight:800}'+
      '#'+ORIGIN_ID+' .srOriginActions .srOriginPrimary{border:0;background:#1428a0;color:#fff}';
    document.head.appendChild(style);
  }

  /* Sur mobile, ce pavé explicatif mangeait la moitié de l'écran avant la première visite.
     Le texte long reste disponible sur grand écran ; le téléphone n'affiche qu'un rappel
     compact. La légende appartient à ce module : personne d'autre ne réécrit son contenu. */
  const LEGEND_LONG='<b>Heure affichée : arrivée estimée au magasin.</b> Elle part de ton heure de début de journée et ajoute le trajet depuis le départ, puis le trajet entre chaque magasin. La durée indiquée est le temps prévu sur place, réglable dans Mon activité.';
  const LEGEND_COMPACT='<b>ⓘ Horaires</b> · arrivée estimée au magasin, trajet compris. Touchez l’heure pour la modifier.';
  function compactViewport(){
    try{return typeof window.matchMedia==='function'&&window.matchMedia('(max-width:700px)').matches}catch(e){return false}
  }
  function legendMarkup(){return compactViewport()?LEGEND_COMPACT:LEGEND_LONG}
  function ensureLegend(week){
    const host=week&&week.parentNode;
    if(!host)return null;
    let legend=document.getElementById(LEGEND_ID);
    if(!legend){
      legend=document.createElement('div');
      legend.id=LEGEND_ID;
      legend.setAttribute('role','note');
      host.insertBefore(legend,week);
    }
    const markup=legendMarkup();
    if(legend.innerHTML!==markup)legend.innerHTML=markup;
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
  function currentSchedule(){
    try{
      const api=window.StoreOpeningHoursV1;
      if(!api||typeof api.scheduleRoute!=='function')return null;
      const day=typeof api.dayNow==='function'?api.dayNow():null;
      const plan=window.state&&window.state.plan;
      const route=day&&plan?plan[day]:null;
      if(!route||!route.length)return null;
      return api.scheduleRoute(route,day,window.state);
    }catch(e){return null}
  }

  /* Point de départ réel de la journée. Après une nuit sur place sans position exacte,
     on pose la question plutôt que de repartir silencieusement de la base. */
  function renderOrigin(week,schedule){
    const host=week&&week.parentNode;
    if(!host)return;
    const api=window.StoreRunnerDayOrigin;
    const origin=schedule&&schedule.origin;
    let box=document.getElementById(ORIGIN_ID);
    /* Une journée qui part de la base est la normale : on ne l'annonce pas. Le bandeau
       ne sert qu'à dire que le départ a changé, ou à poser la question. */
    if(!origin||!api||(!origin.pending&&origin.type==='base')){if(box)box.hidden=true;return}
    if(!box){
      box=document.createElement('div');
      box.id=ORIGIN_ID;
      box.setAttribute('role','status');
      host.insertBefore(box,week);
    }
    box.hidden=false;
    const pending=!!origin.pending;
    const wanted=pending?'srOriginAsk':'srOriginSet';
    if(box.className!==wanted)box.className=wanted;
    if(!pending){
      const text='Départ : '+api.label(origin);
      if(box.dataset.state!=='set:'+text){
        box.dataset.state='set:'+text;
        box.replaceChildren();
        const line=document.createElement('span');
        line.textContent=text;
        box.appendChild(line);
        const change=document.createElement('button');
        change.type='button';
        change.className='srOriginChange';
        change.textContent='Modifier';
        change.addEventListener('click',()=>askOrigin(schedule.date,origin,true));
        box.appendChild(change);
      }
      return;
    }
    const key='ask:'+schedule.date+':'+(origin.suggestion||'');
    if(box.dataset.state===key)return;
    box.dataset.state=key;
    box.replaceChildren();
    const title=document.createElement('b');
    title.textContent='🌙 Nuit sur place';
    const question=document.createElement('span');
    question.textContent='Cette journée démarre depuis quel endroit ?';
    const actions=document.createElement('div');
    actions.className='srOriginActions';
    if(origin.suggestion){
      const use=document.createElement('button');
      use.type='button';
      use.className='srOriginPrimary';
      use.textContent='Utiliser '+origin.suggestion;
      use.addEventListener('click',()=>chooseOrigin(schedule.date,origin.suggestion,'zone'));
      actions.appendChild(use);
    }
    const other=document.createElement('button');
    other.type='button';
    other.textContent='Autre point de départ';
    other.addEventListener('click',()=>askOrigin(schedule.date,origin,false));
    actions.appendChild(other);
    box.append(title,question,actions);
  }

  function askOrigin(date,origin,isChange){
    const suggested=isChange?'':(origin&&origin.suggestion)||'';
    const answer=window.prompt('Ville ou adresse de départ pour cette journée :',suggested);
    if(answer===null)return;
    const text=String(answer).trim();
    if(!text)return;
    chooseOrigin(date,text,'custom');
  }

  /* Géocodage : on réutilise celui du profil, aucun second fournisseur. L'utilisateur ne
     voit jamais de coordonnées techniques. */
  async function chooseOrigin(date,query,type){
    const api=window.StoreRunnerDayOrigin,geo=window.StoreRunnerGeocode;
    if(!api||!geo||typeof geo.forward!=='function'){
      if(typeof window.showError==='function')window.showError('Recherche d’adresse indisponible.');
      return;
    }
    try{
      const hit=await geo.forward(query);
      api.confirmOrigin(window.state,date,{type,label:hit.city||query,ville:hit.city||query,
        adresse:hit.address||'',lat:hit.lat,lon:hit.lon});
      if(typeof window.save==='function')window.save();
      if(typeof window.renderAll==='function')window.renderAll();
      else if(typeof window.renderWeek==='function')window.renderWeek();
      document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
    }catch(error){
      if(typeof window.showError==='function')window.showError(error&&error.message?error.message:String(error));
    }
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
    const schedule=currentSchedule();
    if(week)renderOrigin(week,schedule);
    const rowsSchedule=schedule&&Array.isArray(schedule.rows)?schedule.rows:null;
    storeRows.forEach(function(row,index){
      const item=rowsSchedule?rowsSchedule[index]:null;
      const t=row.querySelector('.tlTime'),d=row.querySelector('.tlDuration');
      if(t&&d){
        // La durée réellement ordonnancée peut différer du rendu historique (horaire
        // imposé avec départ). Elle vient du même moteur que l'ouverture et l'arrivée.
        const start=item?item.arrival:mins(t.textContent),dm=String(item?item.duration+' min':d.dataset.baseDuration||d.textContent||'').match(/(\d+)\s*min/i);
        if(start!=null&&dm){
          const duration=+dm[1],end=clock(start+duration);
          d.dataset.baseDuration=duration+' min';
          const label=d.dataset.baseDuration+' sur place · fin '+end;
          if(d.textContent!==label)d.textContent=label;
        }
      }
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
