/* Store Runner V1 — Explorer Terrain : « Mes magasins » et fiche Magasin 360.

   Ce module LIT, il ne possède aucune donnée et n'écrit jamais `state`. Chaque information vient
   de son propriétaire :
   - besoin de visite, dernière visite, prochaine échéance, prochaine date planifiée → `visit-coverage.js`
     (V263), seule définition du besoin ; ses statuts sont ceux du Pilotage secteur ;
   - rendez-vous et heures d'arrivée imposées → `state.appointments` (noyau, `planning-manual-hours.js`) ;
   - poses (verrous) → `storeRunnerLockInfo` (`range-planner-v2.js`) ; Imposé / Exclu → `state.included` /
     `state.excluded` ; actif → `store.active` ;
   - visites, actions, opportunités → `state.businessV2` ; visites cochées → `state.visits` (via V263) ;
   - contacts → `state.storeContacts` ; photos → `StorePhotosV1` (IndexedDB) ;
   - navigation vers une date → `StoreRunnerPeriodDaySlider.openDate`.
   Il ne choisit aucun magasin, ne déplace aucune visite et n'ouvre aucun second registre : les liens
   (Planning, Visite, Photos, Pilotage, Rendez-vous) rouvrent l'écran du propriétaire.

   « Pourquoi ce jour » (V274) : `placementFor` explique, a posteriori et en lecture seule, le placement d'un magasin
   à une date — ce qui fixe le jour (rendez-vous, arrivée imposée, pose, « Imposé ») puis ce que dit le besoin de visite
   à cette date. Ce sont des FAITS déjà produits par leurs propriétaires : aucun moteur n'est rejoué, aucune raison n'est
   déduite de l'optimisation (jamais « le plus court » ni « le meilleur »), aucune trace n'est écrite. Affiché en tête de
   la fiche 360 seulement quand elle est ouverte depuis une carte du planning (jour d'aujourd'hui ou à venir).

   Branchements : `renderStores` (noyau, seul propriétaire de #storeList) appelle `listContext`,
   `matches`, `compare`, `rowHtml` et `afterList` s'ils existent ; la fiche 360 est une section de
   `#storeQuickSheet`, remplie par un observateur borné à cette feuille (même schéma que V263). */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root){root.StoreRunnerStoreExplorer=api;if(root.document)api.install(root)}
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const SECTION_ID='srStore360';
const BAR_ID='srExplorerBar';
const STYLE_ID='srExplorerCss';
const MANUAL_HOURS_TYPE='Horaire manuel';
const TIMELINE_SHOWN=8;
const TIMELINE_MAX=60;
const PRIORITY_FILTERS=Object.freeze([['all','Tous'],['P1','P1'],['P2','P2'],['P3','P3 / autres']]);
const STATUS_FILTERS=Object.freeze([['all','Tout'],['watch','3 semaines'],['todo','À visiter'],['late','En retard'],['never','Jamais visité']]);
const filter={priority:'all',status:'all'};

function pad(n){return String(n).padStart(2,'0')}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parse(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return isNaN(d)?null:d}
function isoOf(v){if(v instanceof Date&&!isNaN(v))return iso(v);const d=parse(v);return d?iso(d):''}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function frDate(value,withWeekday){
  const d=parse(value);if(!d)return String(value||'');
  try{return new Intl.DateTimeFormat('fr-FR',withWeekday===false?{day:'numeric',month:'short'}:{weekday:'short',day:'numeric',month:'short'}).format(d)}catch(e){return iso(d)}
}
/* Jour local d'un horodatage (ISO complet) ; une date seule reste telle quelle. */
function localDay(v){const t=String(v||'');if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;const d=new Date(t);return t&&!isNaN(d)?iso(d):''}
function plural(n,one,many){return n+' '+(n>1?many:one)}
function find(state,id){return((state&&state.stores)||[]).find(s=>s&&String(s.id)===String(id))||null}
function storage(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function readArchive(){try{const s=storage();return s?JSON.parse(s.getItem(ARCHIVE_KEY)||'{}')||{}:{}}catch(e){return{}}}
function coverage(){return root.StoreRunnerVisitCoverage||null}
function manualHours(){return root.StoreRunnerManualHours||null}

/* Contexte de lecture partagé : une seule lecture des visites, des priorités et de l'archive par
   rendu, quel que soit le nombre de magasins affichés. */
function contextFor(state,options){
  const o=options||{},C=coverage(),today=isoOf(o.today)||iso(new Date()),archive=o.archive||readArchive();
  let needOf=null,planned=new Map();
  if(C){
    try{needOf=C.needOf(state,{today,priorities:o.priorities,visitDays:o.visitDays})}catch(e){needOf=null}
    try{planned=C.plannedDates(state,archive,today)}catch(e){planned=new Map()}
  }
  /* Priorité du parc : P1/P2 du dernier fichier performance, stable jusqu'au prochain import — « traité »
     n'en sort pas (revue #496). Même lecture que les moteurs (`visit-coverage.js`). */
  let park=o.priorities instanceof Map?o.priorities:new Map();
  if(!(o.priorities instanceof Map)&&C&&typeof C.performancePriorities==='function'){try{park=C.performancePriorities(state)}catch(e){park=new Map()}}
  let forecast=null,forecastById=new Map();
  if(C&&typeof C.forecastThreeWeeks==='function')try{
    forecast=C.forecastThreeWeeks(state,{today,archive,range:o.range,firstMonday:o.firstMonday,priorities:park,visitDays:o.visitDays,dayBlocked:o.dayBlocked,lockDayForWeek:o.lockDayForWeek});
    forecastById=new Map((forecast.rows||[]).map(row=>[String(row.id),row]));
  }catch(e){forecast=null;forecastById=new Map()}
  return{state:state||{},today,archive,C,needOf,planned,park,forecast,forecastById,cache:new Map()};
}
function needFor(ctx,store){try{return ctx.needOf?ctx.needOf(store):null}catch(e){return null}}

/* --- Contraintes actives ---------------------------------------------------------------- */
function lockOf(state,id){
  try{if(typeof root.storeRunnerLockInfo==='function'&&state===root.state){const info=root.storeRunnerLockInfo(id);if(info)return info}}catch(e){}
  const raw=state&&state.locks&&state.locks[String(id)];
  if(typeof raw==='string')return DAYS.includes(raw)?{day:raw,week:'',recurring:true}:null;
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&DAYS.includes(raw.day)&&/^\d{4}-\d{2}-\d{2}$/.test(String(raw.week||'')))return{day:raw.day,week:String(raw.week),recurring:false};
  return null;
}
function lockDate(info){const mon=parse(info&&info.week),i=DAYS.indexOf(info&&info.day);return mon&&i>=0?iso(addDays(monday(mon),i)):''}
function arrivalModeOf(entry){
  const M=manualHours();
  if(M&&typeof M.arrivalMode==='function')return M.arrivalMode(entry);
  return entry&&entry.manualHours===true?(entry.arrivalMode==='flexible'?'flexible':'strict'):'auto';
}
const MODE_LABEL=Object.freeze({strict:'Strict',flexible:'Flexible',auto:'Auto'});
/* Date jusqu'à laquelle la garde de V263 ne reproposera pas le magasin : moitié du cycle écoulée,
   ou 75 % quand deux passages ont déjà eu lieu dans le cycle. */
function guardUntil(need){
  if(!need||!need.lastVisit)return'';
  const rules=(coverage()&&coverage().RULES)||{recentRatio:.5,soonRatio:.75,enoughVisits:2};
  const ratio=need.visitsInCycle>=rules.enoughVisits?rules.soonRatio:rules.recentRatio;
  return iso(addDays(parse(need.lastVisit),Math.ceil(ratio*need.intervalDays)));
}
/* Liste ordonnée des contraintes qui s'appliquent AUJOURD'HUI ou plus tard à ce magasin. `strength` :
   `hard` = les moteurs ne la franchissent pas, `soft` = garde de couverture qu'une contrainte explicite
   dépasse. Chaque entrée dit quoi, jusqu'à quand et qui la possède, pour que le refus d'un
   placement puisse citer exactement la contrainte en cause. */
function constraintsFor(state,storeId,options,shared){
  const ctx=shared||contextFor(state,options),id=String(storeId),store=find(state,id),out=[];
  if(!store)return out;
  if(store.active===false)out.push({kind:'inactive',strength:'hard',title:'Désactivé du secteur',detail:'Aucun moteur ne le programme tant qu’il est désactivé (fiche magasin › Actif).',source:'store'});
  if(state.excluded&&state.excluded[id])out.push({kind:'excluded',strength:'hard',title:'Exclu du planning',detail:'Jamais programmé automatiquement. « Réactiver » dans Mes magasins le remet en jeu.',source:'excluded'});
  if(state.included&&state.included[id])out.push({kind:'included',strength:'hard',title:'Imposé',detail:'Le planning cherche toujours à le placer, même hors cadence.',source:'included'});
  const lock=lockOf(state,id);
  if(lock){
    if(lock.recurring)out.push({kind:'lock_recurring',strength:'hard',title:'Posé tous les '+lock.day.toLowerCase()+'s',detail:'Verrou récurrent : replacé le même jour chaque semaine.',day:lock.day,source:'locks'});
    else{
      const date=lockDate(lock);
      if(!date||date>=ctx.today)out.push({kind:'lock_dated',strength:'hard',title:'Pose manuelle '+(date?frDate(date):lock.day.toLowerCase()),detail:'Posé à la main pour la semaine du '+frDate(lock.week,false)+' ; l’optimiseur de tournée ne le déplace pas.',day:lock.day,date,week:lock.week,source:'locks'});
    }
  }
  const appts=((state&&state.appointments)||[]).filter(a=>a&&String(a.storeId)===id&&isoOf(a.date)>=ctx.today).sort((a,b)=>(String(a.date)+String(a.time)).localeCompare(String(b.date)+String(b.time)));
  for(const a of appts){
    const date=isoOf(a.date),time=String(a.time||'');
    if(a.manualHours===true||a.type===MANUAL_HOURS_TYPE){
      const mode=arrivalModeOf(a.manualHours===true?a:Object.assign({},a,{manualHours:true}));
      out.push({kind:'arrival',strength:'hard',title:'Arrivée imposée '+(time||'')+' · '+frDate(date),detail:MODE_LABEL[mode]+' : '+(mode==='flexible'?'heure souhaitée, appliquée comme stricte tant que le moteur ne distingue pas les modes.':'le planning garde cette heure d’arrivée.'),mode,date,time,appointmentId:String(a.id||''),source:'appointments'});
    }else out.push({kind:'appointment',strength:'hard',title:'Rendez-vous '+frDate(date)+(time?' · '+time:''),detail:[a.type,a.duration?a.duration+' min':''].filter(Boolean).join(' · ')||'Rendez-vous',date,time,appointmentId:String(a.id||''),source:'appointments'});
  }
  const need=needFor(ctx,store);
  if(need&&need.secondVisit)out.push({kind:'second_visit',strength:'soft',title:'2e passage P1 attendu',detail:'Le SEF demande au moins 2 visites pour un P1 : la garde « visité récemment » est levée jusqu’à 2 passages depuis l’import du fichier performance.',source:'coverage'});
  if(need&&need.blocked){
    const until=guardUntil(need);
    out.push({kind:'guard',strength:'soft',title:'Visité récemment',detail:'Non reproposé automatiquement'+(until?' avant le '+frDate(until):'')+' ; un rendez-vous, une pose ou « Imposé » passent outre.',date:until,source:'coverage'});
  }
  return out;
}

/* --- Pourquoi ce jour -------------------------------------------------------------------- */
const FIXED_RANK=Object.freeze({appointment:0,arrival:1,lock_dated:2,lock_recurring:3,included:4});
/* Les contraintes explicites qui tiennent CE jour-là : celles d'une autre date ne comptent pas. */
function fixedFor(constraints,date,day){
  return constraints.filter(c=>{
    if(c.kind==='appointment'||c.kind==='arrival')return c.date===date;
    if(c.kind==='lock_dated')return c.date?c.date===date:c.day===day;
    if(c.kind==='lock_recurring')return c.day===day;
    return c.kind==='included';
  }).sort((a,b)=>FIXED_RANK[a.kind]-FIXED_RANK[b.kind]);
}
function fixedHeadline(c){
  if(c.kind==='appointment')return'Rendez-vous ce jour-là'+(c.time?' à '+c.time:'');
  if(c.kind==='arrival')return'Arrivée imposée'+(c.time?' à '+c.time:'');
  if(c.kind==='lock_dated')return'Posé à la main sur ce jour';
  if(c.kind==='lock_recurring')return'Posé tous les '+String(c.day||'').toLowerCase()+'s';
  return'Imposé : le planning cherche toujours à le placer';
}
/* Le besoin de visite LU à la date de la carte (même évaluateur que les moteurs, visites réelles seulement). */
function needLine(need,date){
  if(!need)return null;
  const every=need.intervalDays?'fréquence '+need.intervalDays+' j':'';
  const tail=[need.lastVisit?'dernière visite le '+frDate(need.lastVisit,false):'',every].filter(Boolean);
  const prio=need.priority?need.priority+(need.secondVisit?' · 2e passage attendu':''):'';
  if(!need.lastVisit)return{status:'never',title:'Jamais visité',detail:[every,prio].filter(Boolean).join(' · ')};
  const veryLate=need.ratio>=((coverage()&&coverage().RULES&&coverage().RULES.veryLateRatio)||1.5);
  if(need.status==='late')return{status:'late',title:veryLate?'Très en retard à cette date':'En retard à cette date',detail:[plural(need.overdueDays||0,'jour','jours')+' de retard'].concat(tail,prio?[prio]:[]).join(' · ')};
  if(need.status==='soon')return{status:'soon',title:'À visiter bientôt',detail:['échéance le '+frDate(need.nextDue,false)].concat(tail,prio?[prio]:[]).join(' · ')};
  if(need.status==='ok')return{status:'ok',title:'À jour à cette date',detail:['échéance le '+frDate(need.nextDue,false)].concat(tail,prio?[prio]:[]).join(' · ')};
  return{status:need.status,title:need.label||'Déjà visité récemment',detail:tail.concat(prio?[prio]:[]).join(' · ')};
}
/* `opts` : { date (AAAA-MM-JJ, obligatoire), day (nom du jour), + options de contextFor }. `null` quand il n'y a rien
   d'honnête à dire : magasin inconnu, date invalide ou jour déjà passé (pas de conseil sur le passé). */
function placementFor(state,storeId,opts){
  const o=opts||{},date=isoOf(o.date),id=String(storeId),store=find(state,id);
  if(!store||!date)return null;
  const ctx=o.shared||contextFor(state,o);
  if(date<ctx.today)return null;
  const dayName=DAYS.includes(o.day)?o.day:DAYS[(parse(date).getDay()+6)%7];
  const fixed=fixedFor(constraintsFor(state,id,o,ctx),date,dayName);
  let need=null;try{need=ctx.needOf?ctx.needOf(store,date):null}catch(e){need=null}
  const line=needLine(need,date),facts=[];
  fixed.forEach(c=>facts.push({kind:c.kind,title:c.title,detail:c.detail}));
  if(line)facts.push({kind:'need',status:line.status,title:'Besoin de visite : '+line.title,detail:line.detail});
  /* La garde « visité récemment » est une garde de couverture : une contrainte explicite passe outre. On le dit tel quel. */
  if(need&&need.blocked){
    const until=guardUntil(need);
    facts.push({kind:'guard',title:'Visité récemment',detail:'Non reproposé automatiquement'+(until?' avant le '+frDate(until,false):'')+(fixed.length?' ; ce jour est fixé par la contrainte ci-dessus, qui passe outre.':'.')});
  }
  const headline=fixed.length?fixedHeadline(fixed[0]):'Aucune contrainte ne fixe ce jour'+(line?' · '+line.title.toLowerCase():'');
  return{storeId:id,date,day:dayName,kind:fixed.length?'fixed':'none',headline,facts};
}
function placementHtml(pl){
  if(!pl)return'';
  const items=pl.facts.map(f=>'<li class="srXItem" data-kind="'+esc(f.kind)+'"><b>'+esc(f.title)+'</b><span>'+esc(f.detail)+'</span></li>').join('');
  return'<h3>Pourquoi ce jour ?</h3><p class="srXLead" data-sr-x-why="'+esc(pl.kind)+'">'+esc(pl.headline)+'</p>'+(items?'<ul class="srXList">'+items+'</ul>':'');
}
/* Date de la carte ouverte : même calcul que `dateForDay` du noyau (lundi de la semaine affichée + rang du jour). */
function placementFromQuick(win,state,id){
  /* Le noyau publie le jour de la carte ouverte à côté de l'identifiant du magasin (`srQuickStart`) ; sans carte du
     planning (liste « Mes magasins », indicateurs), il est vide et aucun bloc n'est affiché. */
  const doc=win&&win.document,anchor=doc&&doc.getElementById('srQuickStart'),day=String(anchor&&anchor.dataset&&anchor.dataset.srDay||'');
  if(!DAYS.includes(day))return null;
  const base=parse(state&&state.settings&&state.settings.weekDate)||parse(iso(new Date()));
  return placementFor(state,id,{date:iso(addDays(monday(base),DAYS.indexOf(day))),day});
}

/* --- Frise du magasin -------------------------------------------------------------------- */
const FAMILY={blanc:'Blanc',brun:'Brun',both:'Blanc + Brun'};
function excerpt(text,max){const t=String(text||'').replace(/\s+/g,' ').trim();return t.length>max?t.slice(0,max-1)+'…':t}
/* Événements du magasin, du plus lointain à venir au plus ancien. Photos : voir `photoEvents`
   (IndexedDB, asynchrone, ajoutées par l'écran). Aucune donnée n'est copiée : chaque ligne renvoie
   à son enregistrement (visitId, appointmentId, date). */
function timelineFor(state,storeId,options,shared){
  const ctx=shared||contextFor(state,options),id=String(storeId),b=(state&&state.businessV2)||{},up=[],past=[];
  const push=e=>(e.date>=ctx.today&&e.future!==false?up:past).push(e);
  const completedByDay=new Map();
  for(const v of (b.visits||[])){
    if(!v||String(v.storeId)!==id)continue;
    if(v.status==='completed'&&v.completedDate){completedByDay.set(v.completedDate,v);push({kind:'visit',date:v.completedDate,title:'Visite réalisée',detail:[FAMILY[v.activeFamily]||'',excerpt(v.conclusion,90)].filter(Boolean).join(' · '),visitId:String(v.id)})}
    else if(v.status==='draft')push({kind:'visit_draft',date:localDay(v.createdAt)||ctx.today,future:false,title:'Visite en cours',detail:'Brouillon à reprendre',visitId:String(v.id)});
  }
  const C=ctx.C;let days=[];try{days=C?(C.visitDays(state).get(id)||[]):[]}catch(e){days=[]}
  for(const day of days)if(!completedByDay.has(day))push({kind:'visit_marked',date:day,title:'Visité',detail:'Visite cochée dans le planning'});
  for(const a of ((state&&state.appointments)||[])){
    if(!a||String(a.storeId)!==id||!isoOf(a.date))continue;
    const date=isoOf(a.date),manual=a.manualHours===true||a.type===MANUAL_HOURS_TYPE;
    push({kind:manual?'arrival':'appointment',date,time:String(a.time||''),title:(manual?'Arrivée imposée ':'Rendez-vous ')+(a.time||''),detail:manual?MODE_LABEL[arrivalModeOf(a.manualHours===true?a:Object.assign({},a,{manualHours:true}))]:[a.type,a.note?excerpt(a.note,70):''].filter(Boolean).join(' · '),appointmentId:String(a.id||'')});
  }
  const planned=ctx.planned.get(id);
  if(planned)push({kind:'planned',date:planned,title:'Planifiée',detail:'Dans le planning',planDate:planned});
  for(const a of (b.actions||[])){
    if(!a||String(a.storeId)!==id)continue;
    push({kind:'action',date:localDay(a.createdAt),future:false,title:'Action'+(a.status==='done'?' terminée':a.status==='cancelled'?' annulée':' ouverte'),detail:excerpt(a.description,90)+(a.dueDate&&a.status!=='done'?' · échéance '+frDate(a.dueDate,false):''),visitId:String(a.visitId||'')});
  }
  for(const o of (b.opportunities||[])){
    if(!o||String(o.storeId)!==id)continue;
    push({kind:'opportunity',date:localDay(o.createdAt),future:false,title:'Opportunité',detail:excerpt(o.description,90),visitId:String(o.visitId||'')});
  }
  const order=kind=>({planned:0,appointment:1,arrival:1}[kind]??2);
  up.sort((a,c)=>a.date.localeCompare(c.date)||order(a.kind)-order(c.kind)||String(a.time||'').localeCompare(String(c.time||'')));
  past.sort((a,c)=>c.date.localeCompare(a.date)||String(c.time||'').localeCompare(String(a.time||'')));
  return{upcoming:up.filter(e=>e.date),past:past.filter(e=>e.date).slice(0,TIMELINE_MAX)};
}
function photoEvents(rows){
  const days=new Map();
  for(const r of (rows||[])){const day=localDay(r&&r.createdAt);if(!day)continue;days.set(day,(days.get(day)||0)+1)}
  return[...days].map(([date,n])=>({kind:'photos',date,future:false,title:plural(n,'photo','photos'),detail:'Galerie du magasin',photos:true}));
}
function mergePhotos(timeline,rows){
  const past=timeline.past.concat(photoEvents(rows)).sort((a,c)=>c.date.localeCompare(a.date)).slice(0,TIMELINE_MAX);
  return{upcoming:timeline.upcoming,past};
}

/* --- Fiche 360 (données) ------------------------------------------------------------------- */
function contactsOf(state,id){
  const rows=state&&state.storeContacts&&Array.isArray(state.storeContacts[String(id)])?state.storeContacts[String(id)]:[];
  return rows.map(r=>({name:String(r&&r.name||'').trim(),role:String(r&&r.role||'').trim(),email:String(r&&r.email||'').trim()})).filter(r=>r.name||r.role||r.email);
}
function validEmail(v){return/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim())}
function profileFor(state,storeId,options,shared){
  const ctx=shared||contextFor(state,options),store=find(state,storeId);if(!store)return null;
  const id=String(store.id),need=needFor(ctx,store),forecast=ctx.forecastById.get(id)||null,b=(state&&state.businessV2)||{};
  const appts=((state&&state.appointments)||[]).filter(a=>a&&String(a.storeId)===id&&isoOf(a.date)>=ctx.today&&!(a.manualHours===true||a.type===MANUAL_HOURS_TYPE)).sort((a,c)=>(String(a.date)+String(a.time)).localeCompare(String(c.date)+String(c.time)));
  const planned=ctx.planned.get(id)||'',nextAppt=appts[0]?{date:isoOf(appts[0].date),time:String(appts[0].time||''),type:String(appts[0].type||''),id:String(appts[0].id||'')}:null;
  const openActions=(b.actions||[]).filter(a=>a&&String(a.storeId)===id&&!['done','cancelled'].includes(a.status)).length;
  const openOpportunities=(b.opportunities||[]).filter(o=>o&&String(o.storeId)===id&&['open','in_progress'].includes(o.status)).length;
  const next=[planned&&{kind:'planned',date:planned},nextAppt&&{kind:'appointment',date:nextAppt.date}].filter(Boolean).sort((a,c)=>a.date.localeCompare(c.date))[0]||null;
  return{
    store,id,need,forecast,
    cadence:{label:String(store.freq||'Mensuel'),intervalDays:need?need.intervalDays:null},
    lastVisit:need&&need.lastVisit||'',
    nextVisit:next?{date:next.date,kind:next.kind}:null,
    nextDue:need&&need.nextDue||'',
    plannedDate:planned,nextAppointment:nextAppt,
    priority:ctx.park.get(id)||'',
    contacts:contactsOf(state,id),
    note:String((state&&state.notes&&state.notes[id])||''),
    constraints:constraintsFor(state,id,options,ctx),
    openActions,openOpportunities,
    timeline:timelineFor(state,id,options,ctx)
  };
}

/* --- Mes magasins (liste) ------------------------------------------------------------------- */
function listContext(options){
  const state=(options&&options.state)||root.state,ctx=contextFor(state,options);
  return{ctx,filter:Object.assign({},filter),active:filter.priority!=='all'||filter.status!=='all',
    compare:filter.status!=='all'?function(a,c){const A=rowOf(ctx,a),B=rowOf(ctx,c);return((B.need&&B.need.tier)||0)-((A.need&&A.need.tier)||0)||(String(a.enseigne)+' '+String(a.ville)).localeCompare(String(c.enseigne)+' '+String(c.ville),'fr')}:null};
}
function rowOf(ctx,store){
  const id=String(store&&store.id);let row=ctx.cache.get(id);
  if(!row){const need=needFor(ctx,store);row={need,forecast:ctx.forecastById.get(id)||null,planned:ctx.planned.get(id)||'',priority:ctx.park.get(id)||'',constraints:null};ctx.cache.set(id,row)}
  return row;
}
function priorityKey(row){return row.priority==='P1'||row.priority==='P2'?row.priority:'P3'}
function matches(store,lc){
  const f=(lc&&lc.filter)||filter;if(f.priority==='all'&&f.status==='all')return true;
  const row=rowOf(lc.ctx,store);
  if(f.priority!=='all'&&priorityKey(row)!==f.priority)return false;
  if(f.status==='watch')return !!(row.forecast&&row.forecast.watch);
  if(f.status==='todo')return !!(row.need&&row.need.group==='catchup');
  if(f.status==='late')return !!(row.need&&row.need.status==='late');
  if(f.status==='never')return !!(row.need&&row.need.status==='never');
  return true;
}
function constraintCount(lc,store){
  const row=rowOf(lc.ctx,store);
  if(row.constraints===null)row.constraints=constraintsFor(lc.ctx.state,store.id,null,lc.ctx).filter(c=>c.strength==='hard');
  return row.constraints.length;
}
const STATUS_CLASS=Object.freeze({never:'never',late:'late',soon:'soon',ok:'ok',enough:'covered',over:'covered'});
function statusChip(need){return need?'<span class="srXChip srXs-'+(STATUS_CLASS[need.status]||'ok')+'">'+esc(need.label)+'</span>':''}
/* Ligne ajoutée sous chaque magasin de la liste : statut, priorité, dernière et prochaine visite,
   contraintes, et l'entrée vers la fiche 360. Texte échappé, aucune donnée du magasin n'est écrite. */
function rowHtml(store,lc){
  const row=rowOf(lc.ctx,store),need=row.need,forecast=row.forecast,cons=constraintCount(lc,store);
  const last=need&&need.lastVisit?'Dernière '+frDate(need.lastVisit)+(need.daysSinceToday!=null?' ('+(need.daysSinceToday===0?'aujourd’hui':'il y a '+need.daysSinceToday+' j')+')':''):'Jamais visité';
  const nextDate=row.planned||'',next=nextDate?'Prochaine '+frDate(nextDate):(need&&need.nextDue?'À planifier · échéance '+frDate(need.nextDue,false):'À planifier');
  const prio=row.priority?'<span class="srXChip srXp">'+esc(row.priority)+'</span>':'';
  const risk=forecast&&forecast.watch?'<span class="srXForecast">'+esc(forecast.forecastReason)+(forecast.forecastWeek?' · semaine '+forecast.forecastWeek:'')+'</span>':'';
  return'<small class="srXRow">'+statusChip(need)+prio+risk+'<span>'+esc(last)+'</span><span>'+esc(next)+'</span>'+(cons?'<span class="srXCons">🔒 '+plural(cons,'contrainte','contraintes')+'</span>':'')+'</small>'
    +'<button type="button" class="srXOpen" data-sr-store-360="'+esc(store.id)+'">Fiche 360</button>';
}
function counts(ctx){
  const state=ctx.state,out={priority:{all:0,P1:0,P2:0,P3:0},status:{all:0,watch:0,todo:0,late:0,never:0}};
  for(const s of (state.stores||[])){
    if(!s||s.active===false||(state.excluded&&state.excluded[s.id]))continue;
    const row=rowOf(ctx,s),need=row.need;
    out.priority.all++;out.priority[priorityKey(row)]++;out.status.all++;
    if(row.forecast&&row.forecast.watch)out.status.watch++;
    if(need){if(need.group==='catchup')out.status.todo++;if(need.status==='late')out.status.late++;if(need.status==='never')out.status.never++}
  }
  return out;
}
/* --- Interface ------------------------------------------------------------------------------ */
function ensureCss(doc){
  if(doc.getElementById(STYLE_ID))return;
  const s=doc.createElement('style');s.id=STYLE_ID;
  s.textContent='#srExplorerHead h2{margin:0 0 2px}#srExplorerHead p{margin:0 0 8px;color:#667085;font-size:12px}'
    +'#srExplorerBar{display:grid;gap:6px;margin:6px 0 10px}.srXChips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:1px 1px 3px}.srXChips::-webkit-scrollbar{display:none}'
    +'.srXFilter{flex:0 0 auto;min-height:44px;padding:0 14px;border:1px solid #e1e5ed;border-radius:999px;background:#fff;color:#1d2939;font:inherit;font-size:13px;font-weight:700}.srXFilter[aria-pressed="true"]{background:#111318;color:#fff;border-color:#111318}.srXFilter small{opacity:.7;margin-left:4px;font-weight:600}'
    +'#storeList .srXRow{display:flex!important;flex-wrap:wrap;gap:4px 8px;align-items:center;margin-top:5px;font-size:11px;color:#475467}.srXChip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:#eef1f5;color:#344054}'
    +'.srXs-late{background:#fee4e2;color:#b42318}.srXs-never{background:#eaecf0;color:#475467}.srXs-soon{background:#fef0c7;color:#93370d}.srXs-ok{background:#d1fadf;color:#05603a}.srXs-covered{background:#d1e9ff;color:#175cd3}.srXp{background:#111318;color:#fff}.srXCons{font-weight:700;color:#9a6200}'
    +'.srXOpen{margin-top:6px;min-height:44px;padding:0 14px;border:1px solid #e1e5ed;border-radius:12px;background:#fff;color:#0a6dd9;font:inherit;font-size:13px;font-weight:800}'
    +'.srXForecast{flex-basis:100%;font-weight:750;color:#344054}'
    +'#srStore360{margin:12px 0 4px;padding:14px;border:1px solid #e5e7eb;border-radius:18px;background:#f8fafc}#srStore360 h3{margin:14px 0 6px;font-size:13px;color:#344054}#srStore360 h3:first-child{margin-top:0}'
    +'.srXFacts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.srXFact{padding:9px 10px;border:1px solid #e5e7eb;border-radius:12px;background:#fff}.srXFact small{display:block;font-size:10px;color:#667085}.srXFact b{display:block;font-size:13px;margin-top:2px}'
    +'.srXList{display:grid;gap:6px;margin:0;padding:0;list-style:none}.srXItem{padding:9px 10px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-size:12px;line-height:1.35}.srXItem b{display:block;font-size:13px}.srXItem span{color:#667085}.srXItem[data-strength="hard"]{border-left:4px solid #9a6200}.srXItem[data-strength="soft"]{border-left:4px solid #98a2b3}'
    +'.srXLead{margin:0 0 8px;font-size:15px;font-weight:800;line-height:1.3;color:#101828}'
    +'.srXEmpty{font-size:12px;color:#667085}.srXLinks{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.srXItem button.srXGo{display:block;margin-top:8px;padding:0 14px}.srXLinks button,.srXItem button.srXGo{min-height:44px;border:1px solid #e1e5ed;border-radius:12px;background:#fff;color:#0a6dd9;font:inherit;font-size:13px;font-weight:800}.srXLinks button[disabled]{opacity:.45}'
    +'.srXTl{display:grid;gap:6px}.srXTl button,.srXTl div{display:block;width:100%;min-height:44px;box-sizing:border-box;text-align:left;padding:8px 10px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font:inherit;font-size:12px;color:#1d2939}.srXTl div{min-height:0;background:#f8fafc}.srXTl b{display:block}.srXTl span{color:#667085}.srXTl [data-future="1"]{border-left:4px solid #0a6dd9}'
    +'.srXMore{margin-top:6px;min-height:44px;border:0;background:transparent;color:#0a6dd9;font:inherit;font-weight:800}';
  doc.head.appendChild(s);
}
function chipsHtml(kind,list,current,countMap){
  return list.map(([key,label])=>'<button type="button" class="srXFilter" data-sr-x-'+kind+'="'+key+'" aria-pressed="'+(current===key?'true':'false')+'">'+esc(label)+(countMap&&countMap[key]!=null?'<small>'+countMap[key]+'</small>':'')+'</button>').join('');
}
function ensureBar(win,lc){
  const doc=win.document,list=doc.getElementById('storeList');if(!list||!list.parentNode)return false;
  ensureCss(doc);
  let bar=doc.getElementById(BAR_ID);
  if(!bar){
    bar=doc.createElement('div');bar.id=BAR_ID;
    bar.innerHTML='<div id="srExplorerHead"><h2>Mes magasins</h2><p data-sr-x-count></p></div><div class="srXChips" role="group" aria-label="Priorité" data-sr-x-group="priority"></div><div class="srXChips" role="group" aria-label="À visiter" data-sr-x-group="status"></div>';
    bar.addEventListener('click',e=>{
      const b=e.target&&e.target.closest?e.target.closest('[data-sr-x-priority],[data-sr-x-status]'):null;if(!b)return;
      if(b.hasAttribute('data-sr-x-priority'))filter.priority=b.getAttribute('data-sr-x-priority');else filter.status=b.getAttribute('data-sr-x-status');
      if(typeof win.renderStores==='function')win.renderStores();
    });
  }
  if(bar.nextElementSibling!==list)list.insertAdjacentElement('beforebegin',bar);
  const c=counts(lc.ctx),shown=list.querySelectorAll('.storeline').length;
  const head=bar.querySelector('[data-sr-x-count]');
  if(head)head.textContent=(lc.active?plural(shown,'magasin affiché','magasins affichés')+' · ':'')+plural(c.status.all,'magasin actif','magasins actifs')+' · '+c.status.todo+' à visiter · '+c.status.late+' en retard · '+c.status.watch+' à surveiller sur 3 semaines';
  const p=bar.querySelector('[data-sr-x-group="priority"]'),s=bar.querySelector('[data-sr-x-group="status"]');
  const ph=chipsHtml('priority',PRIORITY_FILTERS,filter.priority,c.priority),sh=chipsHtml('status',STATUS_FILTERS,filter.status,c.status);
  if(p&&p.__html!==ph){p.innerHTML=ph;p.__html=ph}
  if(s&&s.__html!==sh){s.innerHTML=sh;s.__html=sh}
  return true;
}
function afterList(lc,win){try{ensureBar(win||root,lc)}catch(e){}}

function constraintHtml(c){
  const go=c.appointmentId&&(c.kind==='appointment'||c.kind==='arrival')?' <button type="button" class="srXGo" data-sr-x-appt="'+esc(c.appointmentId)+'">Modifier</button>':(c.date&&c.kind!=='guard'?' <button type="button" class="srXGo" data-sr-x-plan="'+esc(c.date)+'">Voir au planning</button>':'');
  return'<li class="srXItem" data-strength="'+esc(c.strength)+'" data-kind="'+esc(c.kind)+'"><b>'+esc(c.title)+'</b><span>'+esc(c.detail)+'</span>'+go+'</li>';
}
function eventHtml(e){
  /* Un événement s'ouvre sur l'écran de son propriétaire quand il en a un ; sinon c'est un simple
     repère, pas un bouton. */
  const attr=e.visitId?' data-sr-x-visit="'+esc(e.visitId)+'"':e.planDate?' data-sr-x-plan="'+esc(e.planDate)+'"':(e.appointmentId?' data-sr-x-appt="'+esc(e.appointmentId)+'"':(e.photos?' data-sr-x-photos="1"':''));
  const when=frDate(e.date)+(e.time?' · '+e.time:''),tag=attr?'button':'div';
  const future=e.date>=todayNow()&&e.kind!=='action'&&e.kind!=='opportunity'&&e.kind!=='visit_draft';
  return'<'+tag+(attr?' type="button"':'')+attr+' data-kind="'+esc(e.kind)+'"'+(future?' data-future="1"':'')+'><b>'+esc(e.title)+'</b><span>'+esc(when)+(e.detail?' · '+esc(e.detail):'')+'</span></'+tag+'>';
}
function todayNow(){return iso(new Date())}
function forecastSummary(row,need){
  if(!row)return need?need.label:'—';
  if(row.forecastKind==='late_today')return'En retard '+(row.lateDays?'depuis '+row.lateDays+' jour'+(row.lateDays>1?'s':''):'depuis aujourd’hui');
  if(row.forecastKind==='becomes_late')return(need&&need.label||'À jour')+' · deviendra en retard dans '+row.forecastInDays+' jour'+(row.forecastInDays>1?'s':'');
  return row.forecastKind==='never'?'Jamais visité':(need?need.label:'—')
}
function sectionHtml(p,opts){
  const o=opts||{},need=p.need,tl=o.timeline||p.timeline,expanded=!!o.expanded;
  const last=p.lastVisit?frDate(p.lastVisit)+(need&&need.daysSinceToday!=null?' · '+(need.daysSinceToday===0?'aujourd’hui':'il y a '+need.daysSinceToday+' j'):''):'Jamais';
  const next=p.nextVisit?frDate(p.nextVisit.date)+(p.nextVisit.kind==='planned'?' · planifiée':' · rendez-vous'):(p.nextDue?'À planifier · échéance '+frDate(p.nextDue,false):'À planifier');
  const cad=p.cadence.label+(p.cadence.intervalDays?' · '+p.cadence.intervalDays+' j':'');
  const facts='<div class="srXFacts"><div class="srXFact"><small>Statut</small><b>'+esc(forecastSummary(p.forecast,need))+(p.priority?' · '+esc(p.priority):'')+'</b></div><div class="srXFact"><small>Cadence</small><b>'+esc(cad)+'</b></div><div class="srXFact"><small>Dernière visite</small><b>'+esc(last)+'</b></div><div class="srXFact"><small>Prochaine visite</small><b>'+esc(next)+'</b></div></div>';
  const contacts=p.contacts.length?'<ul class="srXList">'+p.contacts.map(c=>'<li class="srXItem"><b>'+esc(c.name||c.role||c.email)+'</b><span>'+esc([c.name?c.role:'',c.email&&!validEmail(c.email)?c.email:''].filter(Boolean).join(' · '))+'</span>'+(validEmail(c.email)?' <a href="mailto:'+esc(c.email)+'">'+esc(c.email)+'</a>':'')+'</li>').join('')+'</ul>':'<p class="srXEmpty">Aucun contact. Ajoute-les dans « Voir la fiche › Contacts ».</p>';
  const cons=p.constraints.length?'<ul class="srXList">'+p.constraints.map(constraintHtml).join('')+'</ul>':'<p class="srXEmpty">Aucune contrainte : Store Runner décide seul de la date et de l’heure.</p>';
  const ev=tl.upcoming.concat(tl.past),shown=expanded?ev:ev.slice(0,TIMELINE_SHOWN);
  const timeline=ev.length?'<div class="srXTl">'+shown.map(eventHtml).join('')+'</div>'+(ev.length>TIMELINE_SHOWN?'<button type="button" class="srXMore" data-sr-x-more>'+(expanded?'Réduire':'Voir les '+ev.length+' événements')+'</button>':''):'<p class="srXEmpty">Rien à afficher pour le moment.</p>';
  const counts='<p class="srXEmpty" data-sr-x-counts>'+plural(p.openActions,'action ouverte','actions ouvertes')+' · '+plural(p.openOpportunities,'opportunité ouverte','opportunités ouvertes')+(o.photoCount!=null?' · '+plural(o.photoCount,'photo','photos'):'')+'</p>';
  const lastVisit=(p.timeline.past.find(e=>e.kind==='visit')||{}).visitId||'';
  const group=need?(need.status==='enough'||need.status==='over'?'covered':need.status):'';
  const links='<div class="srXLinks"><button type="button" data-sr-x-plan="'+esc(p.nextVisit&&p.nextVisit.date||'')+'"'+(p.nextVisit?'':' disabled')+'>📅 Voir au planning</button><button type="button" data-sr-x-visit="'+esc(lastVisit)+'"'+(lastVisit?'':' disabled')+'>🧾 Dernière visite</button><button type="button" data-sr-x-photos="1">📷 Photos</button><button type="button" data-sr-x-pilotage="'+esc(group)+'">📊 Pilotage</button></div>';
  return placementHtml(o.placement)+'<h3>Magasin 360</h3>'+facts+counts+links+'<h3>Contraintes actives</h3>'+cons+'<h3>Contacts</h3>'+contacts+'<h3>Frise du magasin</h3>'+timeline;
}
function quickStoreId(doc){const b=doc.getElementById('srQuickStart');return b&&b.dataset?String(b.dataset.srStart||''):''}
/* Feuille fermée : les photos lues ne valent plus. Une photo ajoutée ou supprimée entre deux ouvertures
   (galerie, visite) doit apparaître à la réouverture du même magasin ; une lecture encore en vol est ignorée. */
function invalidatePhotos(doc){
  const old=doc&&doc.getElementById(SECTION_ID);
  if(old){old.__photoGen=(old.__photoGen||0)+1;old.__photoRows=null;old.__photos=null;old.__photoLoading=''}
}
function renderSection(win,extra){
  const doc=win&&win.document;if(!doc||!win.state)return false;
  const sheet=doc.getElementById('storeQuickSheet');
  if(!sheet||!sheet.classList.contains('open')){invalidatePhotos(doc);return false}
  const id=quickStoreId(doc);if(!id)return false;
  const p=profileFor(win.state,id);if(!p)return false;
  ensureCss(doc);
  let sec=doc.getElementById(SECTION_ID);
  if(!sec){sec=doc.createElement('section');sec.id=SECTION_ID;sec.setAttribute('aria-label','Fiche magasin 360')}
  const grid=sheet.querySelector('.sheetGrid');
  if(grid&&sec.previousElementSibling!==grid)grid.insertAdjacentElement('afterend',sec);else if(!sec.parentNode)sheet.appendChild(sec);
  if(sec.dataset.store!==id){sec.dataset.store=id;sec.__expanded=false;sec.__photos=null;sec.__photoRows=null;sec.__photoGen=(sec.__photoGen||0)+1;sec.__photoLoading=''}
  const timeline=sec.__photoRows?mergePhotos(p.timeline,sec.__photoRows):p.timeline;
  const html=sectionHtml(p,{expanded:sec.__expanded,timeline,photoCount:sec.__photos,placement:placementFromQuick(win,win.state,id)});
  if(sec.__html!==html){sec.innerHTML=html;sec.__html=html}
  /* Photos : IndexedDB, asynchrone. Relues à l'ouverture d'un magasin seulement ; le résultat est
     ignoré si la feuille est passée à un autre magasin entre-temps. */
  const P=win.StorePhotosV1;
  if(P&&typeof P.list==='function'&&sec.__photoLoading!==id&&sec.__photoRows==null){
    const gen=sec.__photoGen||0;sec.__photoLoading=id;
    Promise.resolve().then(()=>P.list(id)).then(rows=>{if(sec.dataset.store!==id||(sec.__photoGen||0)!==gen)return;sec.__photoRows=rows;sec.__photos=rows.length;renderSection(win)}).catch(()=>{if(sec.dataset.store===id&&(sec.__photoGen||0)===gen){sec.__photoRows=[];sec.__photos=null}});
  }
  return true;
}
function go(win){try{if(typeof win.closeStoreQuick==='function')win.closeStoreQuick()}catch(e){}}
function onAction(win,e){
  const doc=win.document,target=e.target&&e.target.closest?e.target.closest('[data-sr-store-360],[data-sr-x-plan],[data-sr-x-visit],[data-sr-x-photos],[data-sr-x-pilotage],[data-sr-x-appt],[data-sr-x-more]'):null;if(!target||target.disabled)return;
  if(target.hasAttribute('data-sr-store-360')){e.preventDefault();if(typeof win.openStoreQuick==='function')win.openStoreQuick(target.getAttribute('data-sr-store-360'));return}
  const sec=doc.getElementById(SECTION_ID);if(!sec||!sec.contains(target))return;
  const id=sec.dataset.store||'';
  if(target.hasAttribute('data-sr-x-more')){sec.__expanded=!sec.__expanded;renderSection(win);return}
  if(target.hasAttribute('data-sr-x-plan')){
    const date=target.getAttribute('data-sr-x-plan');if(!date)return;go(win);
    try{if(typeof win.goTab==='function')win.goTab('planPanel')}catch(err){}
    try{if(win.StoreRunnerPeriodDaySlider&&typeof win.StoreRunnerPeriodDaySlider.openDate==='function')win.StoreRunnerPeriodDaySlider.openDate(date)}catch(err){}
    return;
  }
  if(target.hasAttribute('data-sr-x-visit')){const v=target.getAttribute('data-sr-x-visit');if(!v||!win.StoreRunnerVisits||typeof win.StoreRunnerVisits.openVisit!=='function')return;go(win);win.StoreRunnerVisits.openVisit(v);return}
  if(target.hasAttribute('data-sr-x-photos')){if(!win.StorePhotosV1||typeof win.StorePhotosV1.open!=='function')return;go(win);win.StorePhotosV1.open(id);return}
  if(target.hasAttribute('data-sr-x-pilotage')){
    go(win);const key=target.getAttribute('data-sr-x-pilotage')||'';
    if(win.StoreRunnerSectorPilotage&&typeof win.StoreRunnerSectorPilotage.open==='function')win.StoreRunnerSectorPilotage.open(win,{coverage:key});
    return;
  }
  if(target.hasAttribute('data-sr-x-appt')){const a=target.getAttribute('data-sr-x-appt');go(win);if(typeof win.openAppointment==='function')win.openAppointment(a,id)}
}
function install(win){
  const doc=win&&win.document;if(!doc||win.__storeRunnerExplorerInstalled)return;
  win.__storeRunnerExplorerInstalled=true;
  let queued=false,observer=null;
  const schedule=()=>{if(queued)return;queued=true;const run=()=>{queued=false;try{renderSection(win)}catch(e){console.warn('Fiche 360 non affichée',e)}};if(typeof win.requestAnimationFrame==='function')win.requestAnimationFrame(run);else win.setTimeout(run,0)};
  const observe=()=>{
    if(observer||typeof win.MutationObserver!=='function')return;
    const sheet=doc.getElementById('storeQuickSheet');if(!sheet)return;
    /* Borné à la feuille et aux seuls attributs qui signalent ouverture ou changement de magasin :
       l'écriture de la section elle-même ne relance rien. */
    observer=new win.MutationObserver(()=>{
      /* Invalidation immédiate, sans attendre l'image suivante : la réouverture ne doit jamais lire un cache périmé. */
      if(!sheet.classList.contains('open'))invalidatePhotos(doc);
      schedule();
    });
    observer.observe(sheet,{subtree:true,attributes:true,attributeFilter:['class','data-sr-start']});
  };
  doc.addEventListener('click',e=>onAction(win,e));
  /* Zone d'information de la ligne magasin : ouvre la fiche, sans toucher aux boutons ni au sélecteur. */
  doc.addEventListener('click',e=>{
    const line=e.target&&e.target.closest?e.target.closest('#storeList .storeline[data-store-id]'):null;if(!line)return;
    if(e.target.closest('button,select,a,input,textarea,.flags'))return;
    if(typeof win.openStoreQuick==='function')win.openStoreQuick(line.getAttribute('data-store-id'));
  });
  ['store-runner:planning-updated','store-runner:data-restored','store-runner:visit-deleted','store-runner:opportunities-updated'].forEach(n=>doc.addEventListener(n,()=>{observe();schedule()}));
  const boot=()=>{observe();schedule()};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else win.setTimeout(boot,0);
}
function resetFilters(){filter.priority='all';filter.status='all'}

return{VERSION:1,DAYS,MODE_LABEL,filter,contextFor,constraintsFor,placementFor,placementHtml,timelineFor,photoEvents,mergePhotos,profileFor,contactsOf,guardUntil,listContext,matches,rowHtml,afterList,counts,rowOf,renderSection,sectionHtml,resetFilters,install};
});
