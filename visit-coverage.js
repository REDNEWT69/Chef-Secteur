/* Store Runner V263 — couverture réelle du secteur et besoin de visite commun.

   Une seule question, posée par tous les moteurs du planning (cycle 3 semaines, semaine et
   période V211, recalcul en cascade, recentrage d'une journée, régénération d'un jour) et
   par la vue Couverture : « au vu de ce que j'ai RÉELLEMENT visité, ce magasin a-t-il
   besoin d'une visite à cette date ? »

   - Visite réalisée = visite 6P terminée (`businessV2.visits`, statut `completed`) ou
     « Visité » coché (`state.visits`), dédupliquée par magasin et par jour. C'est la lecture
     de `StoreRunnerActivityMetrics.completedVisitDays` (visit-counting.js), propriétaire des
     compteurs d'accueil. Un brouillon, une visite planifiée ou une archive de planning ne
     comptent jamais comme une visite faite.
   - Le besoin est relatif à la fréquence du magasin (`intervalDays`), jamais à un nombre
     fixe : trois passages dans le mois sont normaux pour un hebdomadaire, pas pour un mensuel.
   - Ce module ne choisit aucun magasin et n'écrit jamais `state` : il décrit. Les moteurs
     restent propriétaires de leur placement ; ils lisent ici le palier de besoin (`tier`)
     et la garde anti-sur-visite (`blocked`). Seules les contraintes explicites — rendez-vous,
     magasin posé/verrouillé, magasin imposé — passent outre la garde. */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root){root.StoreRunnerVisitCoverage=api;if(root.document)api.install(root)}
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAY_MS=86400000;
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
const BLOCK_ID='planningCoverageV263';
const QUICK_ID='sqCoverageV263';

/* Règles du besoin de visite. `ratio` = jours depuis la dernière visite réelle / fréquence.
   - trop tôt : moins de la moitié du cycle écoulé → pas reproposé automatiquement ;
   - deux passages dans un même cycle et moins de 75 % écoulés → pas reproposé non plus ;
   - à partir de 75 % : « à visiter bientôt » ; à 100 % : « en retard » ; à 150 % : urgent.
   V263.3 — paliers (`tier`), du plus au moins prioritaire : très en retard (4) › jamais
   visité (3,5) › en retard (3) › bientôt dû (2) › à jour (1) ; garde (0). Un magasin jamais
   visité passe donc devant un retard normal, jamais devant un magasin très en retard.
   - P1 (fichier performance) départage à l'intérieur de son palier (+0,25, moins de la
     moitié de l'écart entre deux paliers) : il ne change jamais de palier et ne lève
     jamais la garde. */
const RULES=Object.freeze({recentRatio:.5,soonRatio:.75,veryLateRatio:1.5,enoughVisits:2,overVisits:4,
  tiers:Object.freeze({veryLate:4,never:3.5,late:3,soon:2,ok:1,blocked:0}),priorityTierBonus:Object.freeze({P1:.25})});
const STATUS=Object.freeze({
  never:{label:'Jamais visité',group:'catchup'},
  late:{label:'En retard',group:'catchup'},
  soon:{label:'À visiter bientôt',group:'catchup'},
  ok:{label:'À jour',group:'ok'},
  enough:{label:'Déjà suffisamment visité',group:'covered'},
  over:{label:'Sur-visité',group:'covered'}
});

function pad(n){return String(n).padStart(2,'0')}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function parse(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return isNaN(d)?null:d}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
function diffDays(from,to){const a=parse(from),b=parse(to);return a&&b?Math.round((b-a)/DAY_MS):null}
function isoOf(v){if(v instanceof Date&&!isNaN(v))return iso(v);const d=parse(v);return d?iso(d):''}
function todayIso(options){return isoOf(options&&options.today)||iso(new Date())}
function norm(v){try{return String(v||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return String(v||'').toLowerCase().trim()}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function storage(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function storeName(s){return ((s&&s.enseigne)||'Magasin')+(s&&s.ville?' '+s.ville:'')}

/* Même conversion fréquence → jours que le noyau (`freqDays`) et V211. */
function intervalDays(store){
  const direct=Number(store&&store.intervalDays);if(Number.isFinite(direct)&&direct>0)return Math.round(direct);
  const f=norm(store&&store.freq);if(f.includes('hebdo'))return 7;if(f.includes('bi'))return 15;if(f.includes('trimes'))return 90;return 30;
}

/* Lecture de repli, identique à visit-counting.js, pour les contextes sans ce module
   (tests en bac à sable). Le test V263 vérifie que les deux lectures restent égales. */
function fallbackCompletedVisitDays(state){
  const out=new Map(),add=(id,date)=>{const key=String(id==null?'':id),day=String(date||'').slice(0,10);if(!key||!/^\d{4}-\d{2}-\d{2}$/.test(day))return;if(!out.has(key))out.set(key,new Set());out.get(key).add(day)};
  for(const v of ((state&&state.businessV2&&Array.isArray(state.businessV2.visits))?state.businessV2.visits:[]))if(v&&v.status==='completed')add(v.storeId,v.completedDate);
  for(const [id,h] of Object.entries((state&&state.visits)||{})){if(!h)continue;if(h.lastVisit)add(id,h.lastVisit);if(Array.isArray(h.history))for(const d of h.history)add(id,d)}
  return out;
}
function visitDays(state){
  let map=null;
  try{const M=root&&root.StoreRunnerActivityMetrics;if(M&&typeof M.completedVisitDays==='function')map=M.completedVisitDays(state)}catch(e){map=null}
  if(!map)map=fallbackCompletedVisitDays(state);
  const out=new Map();for(const [id,days] of map)out.set(String(id),Array.from(days).sort());return out;
}
/* P1/P2 du dernier fichier performance importé, hors magasins déjà « traités » cette
   semaine — même lecture que V211 et que les suggestions du planning manuel. */
/* `includeTreated` (Explorer Terrain V1) : priorité du PARC, telle que le fichier performance la donne, même
   pour un magasin « traité » cette semaine. Les moteurs gardent le défaut : un magasin traité ne se reprogramme pas. */
function performancePriorities(state,options){
  const out=new Map(),keepTreated=!!(options&&options.includeTreated===true);
  try{
    const P=root&&root.StoreRunnerPerformanceV190,db=storage();
    if(!P||!db||typeof P.latestSnapshot!=='function'||typeof P.matchRows!=='function'||typeof P.readStore!=='function')return out;
    const snap=P.latestSnapshot(db);if(!snap)return out;
    const data=P.readStore(db)||{},rows=((P.matchRows(snap.rows,(state&&state.stores)||[],data.mapping||{})||{}).rows)||[];
    for(const r of rows){
      if(!r||r.storeId==null)continue;const prio=String(r.prio||'');if(prio!=='P1'&&prio!=='P2')continue;
      try{if(!keepTreated&&typeof P.isTreated==='function'&&P.isTreated(db,snap.week,r.storeId))continue}catch(e){}
      out.set(String(r.storeId),prio);
    }
  }catch(e){}
  return out;
}

function context(state,options){
  const o=options||{};
  return{
    state:state||{},
    today:todayIso(o),
    days:o.visitDays instanceof Map?o.visitDays:visitDays(state),
    priorities:o.priorities instanceof Map?o.priorities:performancePriorities(state)
  };
}
function countBetween(days,from,to){let n=0;for(const d of days)if(d>=from&&d<=to)n++;return n}

/* Besoin de visite d'un magasin à une date de référence (par défaut aujourd'hui). La date
   de référence est celle de la journée ou de la semaine construite : un magasin visité
   vendredi est « trop tôt » lundi, mais peut redevenir dû trois semaines plus tard. */
function evaluate(store,ref,ctx){
  const id=String(store&&store.id),days=ctx.days.get(id)||[],today=ctx.today,refIso=isoOf(ref)||today;
  const interval=intervalDays(store),priority=ctx.priorities.get(id)||'';
  const upTo=refIso>today?refIso:today,todayD=parse(today),refD=parse(refIso);
  const known=days.filter(d=>d<=upTo),last=known.length?known[known.length-1]:'';
  const row={
    id,store,name:storeName(store),intervalDays:interval,priority,ref:refIso,today,
    lastVisit:last,ageDays:null,daysSinceToday:last?Math.max(0,diffDays(last,today)):null,
    visits7:countBetween(known,iso(addDays(todayD,-6)),today),
    visits14:countBetween(known,iso(addDays(todayD,-13)),today),
    visits30:countBetween(known,iso(addDays(todayD,-29)),today),
    visitsMonth:known.filter(d=>d.slice(0,7)===today.slice(0,7)).length,
    visitsInCycle:countBetween(known,iso(addDays(refD,-(interval-1))),upTo),
    ratio:null,nextDue:'',dueInDays:null,overdueDays:null,status:'never',tier:RULES.tiers.never,blocked:false
  };
  if(!last)return decorate(row);
  row.ageDays=Math.max(0,diffDays(last,refIso));
  row.ratio=row.ageDays/Math.max(1,interval);
  row.nextDue=iso(addDays(parse(last),interval));
  row.dueInDays=diffDays(refIso,row.nextDue);
  row.overdueDays=Math.max(0,row.ageDays-interval);
  row.blocked=row.ratio<RULES.recentRatio||(row.visitsInCycle>=RULES.enoughVisits&&row.ratio<RULES.soonRatio);
  if(row.blocked){row.status=row.visitsInCycle>=RULES.overVisits?'over':'enough';row.tier=RULES.tiers.blocked}
  else if(row.ratio>=1){row.status='late';row.tier=row.ratio>=RULES.veryLateRatio?RULES.tiers.veryLate:RULES.tiers.late}
  else if(row.ratio>=RULES.soonRatio){row.status='soon';row.tier=RULES.tiers.soon}
  else{row.status='ok';row.tier=RULES.tiers.ok}
  return decorate(row);
}
function decorate(row){
  if(!row.blocked)row.tier=Math.min(RULES.tiers.veryLate,row.tier+(RULES.priorityTierBonus[row.priority]||0));
  row.label=STATUS[row.status].label;row.group=STATUS[row.status].group;
  return row;
}
function need(state,store,options){const o=options||{};return evaluate(store,o.ref,context(state,o))}
/* Fabrique pour les moteurs : une seule lecture des visites et des priorités par génération. */
function needOf(state,options){
  const ctx=context(state,options),cache=new Map(),projectionCache=new Map();
  const fn=function(store,ref){
    const key=String(store&&store.id)+'|'+(isoOf(ref)||ctx.today);
    if(!cache.has(key))cache.set(key,evaluate(store,ref,ctx));
    return cache.get(key);
  };
  /* Projection unitaire destinée aux gardes bornées des moteurs : même évaluateur,
     mêmes seuils et mêmes visites réelles, avec une seule visite hypothétique ajoutée.
     Ce n'est pas un second forecast et rien n'est écrit dans state. */
  fn.projectedAfterVisit=function(store,visitDate,ref){
    const id=String(store&&store.id),day=isoOf(visitDate),at=isoOf(ref)||ctx.today,key=id+'|'+day+'|'+at;
    if(!projectionCache.has(key)){
      const days=new Map(ctx.days),own=(days.get(id)||[]).slice();if(day&&!own.includes(day)){own.push(day);own.sort()}days.set(id,own);
      projectionCache.set(key,evaluate(store,at,Object.assign({},ctx,{days})))
    }
    return projectionCache.get(key)
  };
  fn.today=ctx.today;return fn;
}
function blocked(state,store,ref,options){return need(state,store,Object.assign({},options,{ref})).blocked}

function statusLabel(status){return (STATUS[status]||STATUS.ok).label}
function plural(n,one,many){return n+' '+(n>1?many:one)}
function agoText(days){return days===0?'aujourd’hui':'il y a '+days+' j'}
/* Explication compacte, lisible sur téléphone : les faits, pas un roman. */
function explain(row){
  if(!row)return'';
  const parts=[];
  if(!row.lastVisit){parts.push('Jamais visité','fréquence '+row.intervalDays+' j')}
  else if(row.blocked){
    parts.push(plural(row.visitsMonth,'visite','visites')+' ce mois','dernière visite '+agoText(row.daysSinceToday),'fréquence '+row.intervalDays+' j');
  }else{
    parts.push('dernière visite '+agoText(row.daysSinceToday),'fréquence '+row.intervalDays+' j');
    const late=Math.max(0,row.daysSinceToday-row.intervalDays),due=row.intervalDays-row.daysSinceToday;
    if(late>0)parts.push('retard '+late+' j');else if(due>0&&row.status==='soon')parts.push('échéance dans '+due+' j');
    parts.push(plural(row.visitsMonth,'visite','visites')+' ce mois');
  }
  if(row.priority)parts.push(row.priority);
  const text=parts.join(' · ');return text.charAt(0).toUpperCase()+text.slice(1);
}

/* Prochaine date planifiée (aujourd'hui ou plus tard) : semaine affichée + archive. */
function plannedDates(state,archive,today){
  const out=new Map(),t=today||iso(new Date());
  const add=(weekKey,plan)=>{const mon=parse(weekKey);if(!mon||!plan)return;for(let i=0;i<DAYS.length;i++){const date=iso(addDays(monday(mon),i));if(date<t)continue;for(const s of (plan[DAYS[i]]||[])){const id=String(s&&s.id);if(!id)continue;const prev=out.get(id);if(!prev||date<prev)out.set(id,date)}}};
  /* V263.1 : la semaine affichée vit dans `state.plan` ; son instantané archivé peut garder un
     magasin déjà remplacé (regenerateDay, retrait manuel). Le plan live prime donc sur lui. */
  const wk=parse(state&&state.settings&&state.settings.weekDate),shown=wk?iso(monday(wk)):'';
  for(const [key,snap] of Object.entries(archive||{})){if(!snap||!snap.plan)continue;const mon=parse(snap.weekMonday||key);if(shown&&mon&&iso(monday(mon))===shown)continue;add(snap.weekMonday||key,snap.plan)}
  if(wk)add(shown,state.plan);
  return out;
}
const CATCHUP_ORDER={never:1,late:0,soon:2};
function compute(state,options){
  const o=options||{},ctx=context(state,o),excluded=(state&&state.excluded)||{},planned=o.plannedDates instanceof Map?o.plannedDates:new Map();
  const rows=((state&&state.stores)||[]).filter(s=>s&&s.active!==false&&!excluded[s.id]).map(s=>{const r=evaluate(s,ctx.today,ctx);r.plannedDate=planned.get(r.id)||'';return r});
  const counts={never:0,late:0,soon:0,ok:0,enough:0,over:0,total:rows.length};
  let monthVisits=0,monthStores=0;
  for(const r of rows){counts[r.status]++;monthVisits+=r.visitsMonth;if(r.visitsMonth)monthStores++}
  const byName=(a,b)=>a.name.localeCompare(b.name,'fr');
  const catchUp=rows.filter(r=>r.group==='catchup').sort((a,b)=>b.tier-a.tier||(CATCHUP_ORDER[a.status]-CATCHUP_ORDER[b.status])||(Number(b.overdueDays)||0)-(Number(a.overdueDays)||0)||byName(a,b));
  const covered=rows.filter(r=>r.group==='covered').sort((a,b)=>b.visitsInCycle-a.visitsInCycle||(a.daysSinceToday-b.daysSinceToday)||byName(a,b));
  const upToDate=rows.filter(r=>r.group==='ok').sort(byName);
  return{today:ctx.today,month:ctx.today.slice(0,7),rows,counts,monthVisits,monthStores,catchUp,covered,upToDate,
    unplannedCatchUp:catchUp.filter(r=>!r.plannedDate).length};
}

/* V263.6 — forecast pur sur les 3 semaines déjà calculées par le moteur terrain.
   Aucun second moteur n'est créé ici : on relit le plan courant + l'archive du cycle,
   les diagnostics `range.coverage` produits par terrain-planning-v1.js et la même source
   de besoin `VisitCoverage`. Une visite ou un rendez-vous modifie donc le résultat au
   prochain calcul, sans écrire `state`, l'archive ni le range. */
function forecastWeekKey(value){const d=parse(value);return d?iso(monday(d)):''}
function forecastRange(state,options){
  const o=options||{};if(o.range&&typeof o.range==='object')return o.range;
  try{const s=storage();return s?JSON.parse(s.getItem(RANGE_KEY)||'null'):null}catch(e){return null}
}
function forecastArchive(options){if(options&&options.archive&&typeof options.archive==='object')return options.archive;return readArchive()}
function forecastFirstMonday(state,range,options,today){
  const asked=parse(options&&options.firstMonday),fromRange=parse(range&&range.start),fromWeek=parse(state&&state.settings&&state.settings.weekDate),fromToday=parse(today);
  return monday(asked||fromRange||fromWeek||fromToday||new Date())
}
function forecastWorkDays(state,range,options){
  const raw=(options&&Array.isArray(options.workDays)&&options.workDays.length?options.workDays:(range&&Array.isArray(range.workDays)&&range.workDays.length?range.workDays:(state&&state.settings&&Array.isArray(state.settings.days)&&state.settings.days.length?state.settings.days:DAYS.slice(0,5))));
  return raw.filter((d,i)=>DAYS.includes(d)&&raw.indexOf(d)===i)
}
function forecastUnavailableDates(range,state,first,end,options){
  const out=new Set();for(const week of ((range&&range.planningDiagnostics)||[]))for(const day of ((week&&week.days)||[]))if(day&&day.date&&day.status==='blocked')out.add(String(day.date));
  const blocked=options&&typeof options.dayBlocked==='function'?options.dayBlocked:null;
  if(blocked)for(let cursor=new Date(first);iso(cursor)<end;cursor=addDays(cursor,1)){const date=iso(cursor);try{if(blocked(date,state))out.add(date)}catch(e){}}
  return out
}
function forecastPlanDates(state,archive,first,today){
  const out=new Map(),end=iso(addDays(first,21)),shown=forecastWeekKey(state&&state.settings&&state.settings.weekDate);
  for(let wi=0;wi<3;wi++){
    const mon=addDays(first,wi*7),key=iso(mon),snap=archive&&archive[key],plan=(shown===key&&state&&state.plan)?state.plan:((snap&&snap.plan)||{});
    for(const day of DAYS){const idx=DAYS.indexOf(day),date=iso(addDays(mon,idx));if(date<today||date>=end)continue;for(const raw of ((plan&&plan[day])||[])){const id=String(raw&&raw.id||'');if(!id)continue;const dates=out.get(id)||[];if(!dates.includes(date)){dates.push(date);dates.sort();out.set(id,dates)}}}
  }
  return out
}
function forecastLockDay(state,id,weekKey,options){
  try{if(options&&typeof options.lockDayForWeek==='function'){const x=options.lockDayForWeek(id,weekKey);if(DAYS.includes(x))return x}}catch(e){}
  try{if(root&&typeof root.storeRunnerLockDayForWeek==='function'){const x=root.storeRunnerLockDayForWeek(id,weekKey);if(DAYS.includes(x))return x}}catch(e){}
  const raw=state&&state.locks&&state.locks[String(id)];if(typeof raw==='string')return DAYS.includes(raw)?raw:'';
  if(raw&&typeof raw==='object'&&DAYS.includes(raw.day)&&(!raw.week||String(raw.week)===String(weekKey)))return raw.day;return''
}
function forecastConstraintItem(type,date,workDays,unavailable,extra){
  const d=parse(date),day=d?DAYS[(d.getDay()||7)-1]||'':'';
  return Object.assign({type,date,week:forecastWeekKey(date),day,compatible:!!day&&workDays.includes(day)&&!unavailable.has(date)},extra||{})
}
function forecastConstraints(state,store,first,today,end,workDays,unavailable,options){
  const id=String(store&&store.id||''),appointments=[];
  ((state&&state.appointments)||[]).forEach((appointment,index)=>{
    if(String(appointment&&appointment.storeId)!==id)return;const date=isoOf(appointment&&appointment.date);if(!date||date<today||date>=end)return;
    appointments.push(Object.assign(forecastConstraintItem('appointment',date,workDays,unavailable,{appointmentId:String(appointment.id||''),time:String(appointment.time||'')}),{sourceIndex:index}))
  });
  appointments.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)||a.appointmentId.localeCompare(b.appointmentId)||a.sourceIndex-b.sourceIndex);
  const items=appointments.map(({sourceIndex,...item})=>item);
  for(let wi=0;wi<3;wi++){
    const mon=addDays(first,wi*7),key=iso(mon),day=forecastLockDay(state,id,key,options);if(!day)continue;
    const date=iso(addDays(mon,DAYS.indexOf(day)));if(date<today||date>=end)continue;
    items.push(forecastConstraintItem('lock',date,workDays,unavailable))
  }
  if(state&&state.included&&state.included[store.id])items.push({type:'imposed',date:'',week:'',day:'',compatible:true});
  return items
}
function cloneVisitDaysMap(map){const out=new Map();for(const [id,days] of map||[])out.set(String(id),Array.from(days||[]).map(String).sort());return out}
function addProjectedVisit(map,id,date){if(!date)return;const key=String(id),rows=map.get(key)||[];if(!rows.includes(date)){rows.push(date);rows.sort();map.set(key,rows)}}
function lastAcceptableDate(workDates,firstAuto,dueDate){
  if(!workDates.length)return'';if(!dueDate)return workDates[workDates.length-1];
  const atOrBefore=workDates.filter(d=>d<=dueDate);if(atOrBefore.length)return atOrBefore[atOrBefore.length-1];
  return firstAuto||workDates[0]
}
function forecastThreeWeeks(state,options){
  const app=state||{},o=options||{},today=todayIso(o),range=forecastRange(app,o),archive=forecastArchive(o),first=forecastFirstMonday(app,range,o,today),start=iso(first),end=iso(addDays(first,21)),workDays=forecastWorkDays(app,range,o),unavailable=forecastUnavailableDates(range,app,first,end,o),planned=forecastPlanDates(app,archive,first,today),visitMap=o.visitDays instanceof Map?cloneVisitDaysMap(o.visitDays):visitDays(app),priorities=o.priorities instanceof Map?o.priorities:performancePriorities(app),needFn=needOf(app,{today,visitDays:visitMap,priorities});
  const workDates=[];
  for(let wi=0;wi<3;wi++){const mon=addDays(first,wi*7);for(const day of workDays){const date=iso(addDays(mon,DAYS.indexOf(day)));if(date<today||date>=end||unavailable.has(date))continue;workDates.push(date)}}
  workDates.sort();const workDateSet=new Set(workDates);
  const coverage=range&&range.coverage||{},lateCapacity=new Set((coverage.uncoveredLate||[]).map(norm)),neverCapacity=new Set((coverage.uncoveredNever||[]).map(norm)),recentEngine=new Set((coverage.recentlyVisited||[]).map(norm)),excluded=app.excluded||{},stores=(app.stores||[]).filter(s=>s&&s.active!==false&&!excluded[s.id]);
  const rows=[];
  for(const store of stores){
    const id=String(store.id),now=needFn(store,today),endNeed=needFn(store,workDates[workDates.length-1]||iso(addDays(first,20))),constraints=forecastConstraints(app,store,first,today,end,workDays,unavailable,o),datedConstraints=constraints.filter(c=>c.date),compatibleConstraints=datedConstraints.filter(c=>c.compatible),incompatibleConstraints=datedConstraints.filter(c=>!c.compatible),primaryConstraint=compatibleConstraints[0]||constraints[0]||{type:'',date:'',week:'',day:'',compatible:true},autoDates=workDates.filter(date=>!needFn(store,date).blocked),firstAuto=autoDates[0]||'',constraintDate=compatibleConstraints.length?compatibleConstraints[0].date:'',firstAcceptable=(constraintDate&&(!firstAuto||constraintDate<firstAuto))?constraintDate:(constraints.some(c=>c.type==='imposed')&&!firstAuto?(workDates[0]||''):firstAuto),dueDate=now.nextDue||'',lastAcceptable=lastAcceptableDate(workDates,firstAcceptable,dueDate),planDates=(planned.get(id)||[]).slice(),planDate=planDates[0]||'',projectedDates=Array.from(new Set(planDates.concat(compatibleConstraints.map(c=>c.date)))).sort(),recommendedDates=Array.from(new Set(planDates.filter(date=>workDateSet.has(date)).concat(compatibleConstraints.map(c=>c.date)))).sort();
    let recommendedDate=recommendedDates[0]||'';
    const atRecommendation=recommendedDate?needFn(store,recommendedDate):now;
    let reasonCode='',reason='';
    const recommendationConstraint=compatibleConstraints.find(c=>c.date===recommendedDate)||null;
    if(recommendationConstraint&&recommendationConstraint.type==='appointment'){reasonCode='appointment';reason='Rendez-vous explicite'}
    else if(recommendationConstraint&&recommendationConstraint.type==='lock'){reasonCode='lock';reason='Jour verrouillé '+recommendationConstraint.day}
    else if(primaryConstraint.type==='imposed'){reasonCode='imposed';reason=recommendedDate?'Magasin imposé':'Magasin imposé non placé par le cycle courant'}
    else if(recommendedDate){reasonCode='engine';reason=(atRecommendation.ratio!=null&&atRecommendation.ratio>=RULES.veryLateRatio?'Très en retard':atRecommendation.label)+(atRecommendation.priority?' · '+atRecommendation.priority:'')}
    const keyName=norm(storeName(store));let uncoveredCode='',uncoveredReason='';
    if(!recommendedDate){
      if(incompatibleConstraints.length&&!compatibleConstraints.length){uncoveredCode='constraint-unavailable';uncoveredReason='Contrainte explicite incompatible avec les jours disponibles'}
      else if(recentEngine.has(keyName)){uncoveredCode='too-recent';uncoveredReason='Écarté par le moteur car visité trop récemment'}
      else if(lateCapacity.has(keyName)||neverCapacity.has(keyName)){uncoveredCode='capacity';uncoveredReason='Reste hors des 3 semaines faute de capacité du cycle'}
      else if(!firstAcceptable){uncoveredCode='too-recent';uncoveredReason='Pas encore reproposable automatiquement dans cet horizon'}
      else if(!workDates.length){uncoveredCode='no-workday';uncoveredReason='Aucun jour travaillé disponible dans cet horizon'}
      else if(endNeed.status==='late'||endNeed.status==='never'||endNeed.status==='soon'){uncoveredCode='not-selected';uncoveredReason='Aucun créneau retenu par le moteur sur ces 3 semaines'}
      else{uncoveredCode='not-needed';uncoveredReason='Aucune visite nécessaire sur cet horizon'}
    }
    rows.push({id,name:storeName(store),store,lastVisit:now.lastVisit||'',intervalDays:now.intervalDays,dueDate,status:now.status,statusLabel:now.label,tier:now.tier,priority:now.priority||'',firstAcceptableDate:firstAcceptable,firstAcceptableWeek:forecastWeekKey(firstAcceptable),lastAcceptableDate:lastAcceptable,lastAcceptableWeek:forecastWeekKey(lastAcceptable),dueWeek:forecastWeekKey(dueDate),plannedDate:planDate,plannedDates:planDates,plannedWeek:forecastWeekKey(planDate),plannedWeeks:Array.from(new Set(planDates.map(forecastWeekKey))),constraints,constraintType:primaryConstraint.type,constraintDate:primaryConstraint.date,constraintWeek:primaryConstraint.week,constraintCompatible:primaryConstraint.compatible,appointmentDates:datedConstraints.filter(c=>c.type==='appointment').map(c=>c.date),lockDates:datedConstraints.filter(c=>c.type==='lock').map(c=>c.date),compatibleConstraintDates:compatibleConstraints.map(c=>c.date),incompatibleConstraintDates:incompatibleConstraints.map(c=>c.date),projectedDates,recommendedDate,recommendedDates,recommendedWeek:forecastWeekKey(recommendedDate),recommendedWeeks:Array.from(new Set(recommendedDates.map(forecastWeekKey))),reasonCode,reason,uncoveredCode,uncoveredReason,willNeedVisitByHorizon:endNeed.status==='late'||endNeed.status==='never'||endNeed.status==='soon'})
  }
  const projectedDays=cloneVisitDaysMap(visitMap);for(const row of rows)for(const date of row.projectedDates)addProjectedVisit(projectedDays,row.id,date);
  const projectedNeed=needOf(app,{today,visitDays:projectedDays,priorities}),horizonRef=workDates[workDates.length-1]||iso(addDays(first,20));
  for(const row of rows){const p=projectedNeed(row.store,horizonRef);row.projectedStatus=p.status;row.projectedStatusLabel=p.label;row.projectedTier=p.tier;row.projectedLastVisit=p.lastVisit||'';row.willBecomeLate=row.status!=='late'&&row.status!=='never'&&p.status==='late';row.remainsNever=p.status==='never'}
  rows.sort((a,b)=>b.tier-a.tier||a.name.localeCompare(b.name,'fr')||a.id.localeCompare(b.id));
  const currentCounts={never:0,late:0,soon:0,ok:0,enough:0,over:0},projectedCounts={never:0,late:0,soon:0,ok:0,enough:0,over:0};for(const row of rows){currentCounts[row.status]=(currentCounts[row.status]||0)+1;projectedCounts[row.projectedStatus]=(projectedCounts[row.projectedStatus]||0)+1}
  const engineCoverageKnown=!!(coverage&&coverage.needAware),engineUncovered=(coverage.uncoveredLate||[]).length+(coverage.uncoveredNever||[]).length;
  return{version:2636,today,start,end:iso(addDays(first,20)),workDays:workDays.slice(),availableWorkDates:workDates.slice(),rows,counts:{total:rows.length,recommended:rows.filter(r=>!!r.recommendedDate).length,recommendedVisits:rows.reduce((n,r)=>n+r.recommendedDates.length,0),projectedVisits:rows.reduce((n,r)=>n+r.projectedDates.length,0),constraintIssues:rows.reduce((n,r)=>n+r.incompatibleConstraintDates.length,0),uncovered:rows.filter(r=>r.uncoveredCode&&!['not-needed','too-recent'].includes(r.uncoveredCode)).length,becomesLate:rows.filter(r=>r.willBecomeLate).length,remainsNever:rows.filter(r=>r.remainsNever).length,current:currentCounts,projected:projectedCounts},engine:{rangeKnown:!!range,coverageKnown:engineCoverageKnown,capacitySufficient:engineCoverageKnown?engineUncovered===0:null,uncoveredLate:(coverage.uncoveredLate||[]).length,uncoveredNever:(coverage.uncoveredNever||[]).length}}
}

/* ------------------------------------------------------------------- interface ---- */
function readArchive(){try{const s=storage();return s?JSON.parse(s.getItem(ARCHIVE_KEY)||'{}')||{}:{}}catch(e){return{}}}
function shortDate(value){const d=parse(value);return d?pad(d.getDate())+'/'+pad(d.getMonth()+1):''}
function ensureCss(doc){
  if(doc.getElementById('visit-coverage-v263-css'))return;
  const s=doc.createElement('style');s.id='visit-coverage-v263-css';
  s.textContent=`#${BLOCK_ID}{background:#fff;border:1px solid #e1e5ed;border-radius:18px;margin:0 0 12px;box-shadow:0 4px 14px rgba(25,42,80,.045);overflow:hidden}
#${BLOCK_ID}>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;min-height:44px;box-sizing:border-box}
#${BLOCK_ID}>summary::-webkit-details-marker{display:none}
#${BLOCK_ID}>summary::after{content:'›';margin-left:auto;font-size:20px;color:#98a2b3;transition:transform .15s}
#${BLOCK_ID}[open]>summary::after{transform:rotate(90deg)}
.cov263Title{min-width:0}.cov263Title b{display:block;font-size:14px;color:#1d2939}
.cov263Chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
.cov263Chip{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:750;line-height:1.3;white-space:nowrap}
.cov263Chip.catchup{background:#fff1f0;color:#b42318}.cov263Chip.ok{background:#ecfdf3;color:#067647}.cov263Chip.covered{background:#eff4ff;color:#1849a9}
.cov263Body{padding:0 14px 14px}
.cov263Month{margin:0;padding:9px 10px;border-radius:12px;background:#f7f9fc;font-size:12px;line-height:1.45;color:#475467}.cov263Month b{color:#1d2939}
.cov263Link{display:block;width:100%;min-height:44px;margin-top:10px;border:1px solid #d0d5dd;border-radius:12px;background:#fff;color:#1849a9;font:inherit;font-size:13px;font-weight:800}
.cov263Section{margin-top:12px}.cov263Section h4{margin:0 0 6px;font-size:13px;color:#344054}.cov263Section h4 small{font-weight:600;color:#98a2b3}
.cov263Hint{margin:-2px 0 6px;font-size:11px;color:#667085;line-height:1.35}
.cov263Row{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;text-align:left;border:1px solid #eaecf0;background:#fff;border-radius:12px;padding:9px 10px;margin:0 0 6px;font:inherit;color:inherit;min-height:44px}
.cov263Row>span:first-child{flex:1;min-width:0}.cov263Row b{display:block;font-size:13px;color:#1d2939;overflow-wrap:anywhere}
.cov263Row small{display:block;font-size:11px;color:#667085;line-height:1.35;margin-top:2px;overflow-wrap:anywhere}
.cov263Row .cov263Chip{flex:0 0 auto;margin-top:1px}
.cov263Chip.never,.cov263Chip.late{background:#fff1f0;color:#b42318}.cov263Chip.soon{background:#fffaeb;color:#b54708}
.cov263Chip.enough,.cov263Chip.over{background:#eff4ff;color:#1849a9}
.cov263More{font-size:11.5px;color:#667085;margin:2px 2px 0}
#${QUICK_ID}{margin-top:6px;font-size:12px;line-height:1.4;color:#475467}
#${QUICK_ID} .cov263Chip{margin-right:6px}
@media(max-width:700px){.cov263Row{padding:9px}}`;
  doc.head.appendChild(s);
}
function chip(status,text){return '<span class="cov263Chip '+esc(status)+'">'+esc(text||statusLabel(status))+'</span>'}
function rowHtml(r){
  const planned=r.plannedDate?' · prévu le '+shortDate(r.plannedDate):(r.group==='catchup'?' · hors planning':'');
  return '<button type="button" class="cov263Row" data-cov-store="'+esc(r.id)+'"><span><b>'+esc(r.name)+'</b><small>'+esc(explain(r)+planned)+'</small></span>'+chip(r.status)+'</button>';
}
function listHtml(rows,limit){
  const shown=rows.slice(0,limit),rest=rows.length-shown.length;
  return shown.map(rowHtml).join('')+(rest>0?'<p class="cov263More">et '+plural(rest,'autre magasin','autres magasins')+'</p>':'');
}
function blockHtml(data){
  const c=data.counts,catchUp=c.never+c.late+c.soon,covered=c.enough+c.over;
  const summary='<summary><span class="cov263Title"><b>Couverture du secteur</b><span class="cov263Chips">'+
    '<span class="cov263Chip catchup">'+plural(catchUp,'à rattraper','à rattraper')+'</span>'+
    '<span class="cov263Chip ok">'+c.ok+' à jour</span>'+
    '<span class="cov263Chip covered">'+plural(covered,'déjà bien couvert','déjà bien couverts')+'</span></span></span></summary>';
  /* Le résumé visuel (anneau, taux, semaine, filtres) est le graphique du Pilotage
     secteur : ce bloc reste une ligne de faits et les deux listes utiles au planning. */
  let body='<div class="cov263Body"><p class="cov263Month"><b>Ce mois-ci</b> · '+plural(data.monthStores,'magasin visité','magasins visités')+' · '+plural(data.monthVisits,'visite','visites')+' · '+plural(c.never,'jamais visité','jamais visités')+' · '+c.late+' en retard · '+c.ok+' à jour · '+plural(covered,'déjà beaucoup visité','déjà beaucoup visités')+'</p>';
  body+='<div class="cov263Section"><h4>À rattraper <small>('+catchUp+')</small></h4>'+(catchUp?'<p class="cov263Hint">Passent en priorité à la prochaine génération ou au prochain recalcul.</p>'+listHtml(data.catchUp,8):'<p class="cov263Hint">Aucun magasin en retard : le secteur est à jour.</p>')+'</div>';
  if(covered)body+='<div class="cov263Section"><h4>Déjà bien couverts <small>('+covered+')</small></h4><p class="cov263Hint">Pas reproposés automatiquement tant que leur fréquence n’est pas revenue. Un rendez-vous ou un magasin posé reste toujours prioritaire.</p>'+listHtml(data.covered,6)+'</div>';
  body+='<button type="button" class="cov263Link" data-pilotage="1" data-sp-cov="todo">Voir le suivi magasins ›</button>';
  return summary+body+'</div>';
}
function computeForWin(win,today){
  const state=win.state||{},t=today||iso(new Date());
  return compute(state,{today:t,plannedDates:plannedDates(state,readArchive(),t)});
}
function placeBlock(doc,block){
  if(block.parentNode)return;
  const tools=doc.getElementById('planningToolsV2');
  if(tools&&tools.parentNode){tools.insertAdjacentElement('afterend',block);return}
  const plan=doc.querySelector('#planPanel .applePlan')||doc.getElementById('planPanel');
  if(plan)plan.insertBefore(block,plan.firstChild);
}
function renderBlock(win){
  const doc=win&&win.document;if(!doc||!win.state||!doc.getElementById('planPanel'))return false;
  ensureCss(doc);
  let block=doc.getElementById(BLOCK_ID);
  if(!block){block=doc.createElement('details');block.id=BLOCK_ID;block.className='cov263Card'}
  placeBlock(doc,block);if(!block.parentNode)return false;
  const html=blockHtml(computeForWin(win));
  if(block.__cov263Markup!==html){block.innerHTML=html;block.__cov263Markup=html}
  return true;
}
function renderQuick(win){
  const doc=win&&win.document;if(!doc||!win.state)return false;
  const sheet=doc.getElementById('storeQuickSheet'),start=doc.getElementById('srQuickStart'),id=start&&start.dataset&&start.dataset.srStart;
  if(!sheet||!id)return false;
  const store=((win.state.stores)||[]).find(s=>String(s&&s.id)===String(id));if(!store)return false;
  const anchor=doc.getElementById('sqVisitCredit')||doc.getElementById('sqAddress');if(!anchor||!anchor.parentNode)return false;
  ensureCss(doc);
  let line=doc.getElementById(QUICK_ID);
  if(!line){line=doc.createElement('div');line.id=QUICK_ID;line.setAttribute('aria-live','polite')}
  if(line.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',line);
  const r=need(win.state,store,{});const html=chip(r.status)+esc(explain(r));
  if(line.__cov263Markup!==html){line.innerHTML=html;line.__cov263Markup=html}
  return true;
}
/* Garde du noyau historique (`regenerateDay`) : une journée nommée de la semaine affichée. */
function blockedOnPlanningDay(store,day){
  try{
    const state=root.state;if(!state||!store)return false;
    const idx=DAYS.indexOf(day),wk=parse(state.settings&&state.settings.weekDate)||new Date();
    const date=idx>=0?iso(addDays(monday(wk),idx)):iso(new Date());
    return blocked(state,store,date<iso(new Date())?iso(new Date()):date);
  }catch(e){return false}
}

function install(win){
  const doc=win&&win.document;if(!doc||win.__storeRunnerCoverageV263Installed)return;
  win.__storeRunnerCoverageV263Installed=true;
  let queued=false,quickObserver=null;
  const schedule=()=>{if(queued)return;queued=true;const run=()=>{queued=false;try{renderBlock(win)}catch(e){console.warn('Couverture V263 non affichée',e)}try{renderQuick(win)}catch(e){}};if(typeof win.requestAnimationFrame==='function')win.requestAnimationFrame(run);else win.setTimeout(run,0)};
  const observeQuick=()=>{
    if(quickObserver||typeof win.MutationObserver!=='function')return;
    const sheet=doc.getElementById('storeQuickSheet');if(!sheet)return;
    /* Borné à la fiche magasin, et aux seuls attributs qui signalent un changement de
       magasin : l'écriture de la ligne elle-même ne relance rien. */
    quickObserver=new win.MutationObserver(()=>{try{renderQuick(win)}catch(e){}});
    quickObserver.observe(sheet,{subtree:true,attributes:true,attributeFilter:['class','data-sr-start']});
  };
  doc.addEventListener('click',e=>{
    const row=e.target&&e.target.closest?e.target.closest('[data-cov-store]'):null;if(!row)return;
    if(typeof win.openStoreQuick==='function'){e.preventDefault();win.openStoreQuick(row.getAttribute('data-cov-store'))}
  });
  ['store-runner:planning-updated','store-runner:data-restored','store-runner:home-rendered','store-runner:planning-user-opened','store-runner:visit-deleted','chef-range-generated'].forEach(name=>{
    doc.addEventListener(name,()=>{observeQuick();schedule()});
  });
  const boot=()=>{observeQuick();schedule()};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else win.setTimeout(boot,0);
  win.storeRunnerCoverageBlockedOnDay=blockedOnPlanningDay;
}

return{VERSION:263,RULES,STATUS,intervalDays,visitDays,performancePriorities,need,needOf,blocked,blockedOnPlanningDay,statusLabel,explain,plannedDates,compute,forecastThreeWeeks,renderBlock,renderQuick,install};
});
