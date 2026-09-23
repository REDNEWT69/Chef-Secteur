/* Store Runner V246 — brief hebdomadaire et priorité effective.

   Couche pure : aucun DOM, aucun réseau, aucune IA. Elle possède `state.weeklyBriefs`
   et rien d'autre.

   Trois sources restent séparées et ne s'écrivent jamais l'une dans l'autre :
     1. `store.priority` (1 à 5)      — priorité structurelle de la fiche, permanente ;
     2. la priorité performance P1/P2 — lue dans le snapshot V190 de la semaine ;
     3. le brief de la semaine Wxx    — règles temporaires, datées, conservées.

   Un brief ne modifie ni la fiche magasin, ni le fichier performance, ni le planning.
   Neutraliser une contribution (« Prios Co BRUN annulées ») la met à zéro dans le calcul
   de la semaine concernée : la donnée source reste intacte et redevient active dès que la
   règle n'est plus valable.

   Le calcul est déterministe : mêmes données, même semaine, même résultat. */
(function(root){
'use strict';

const SCHEMA=1;
const RULE_TYPES=['boost','suspend','deadline','note'];
const SUSPEND_TARGETS=['performance','structural'];
const FAMILIES=['all','brun','blanc'];
const BASE_PRIOS=['P1','P2'];
const CONFIDENCE=['confirmed','ambiguous'];
const ORIGINS=['manual','parsed','ai'];
const SOURCE_KINDS=['manual','text','file'];
const BOOST_LIMIT=100;
/* Même poids que le besoin V211 « équilibré » (range-planner-v2.js : p*12). Le score
   n'est qu'un ordre de lecture ; le futur planning consommera `weekBoost`, pas `score`. */
const STRUCTURAL_WEIGHT=12;
const EXCERPT_MAX=4000;
/* Budget de stockage (précédent V240 : le quota localStorage est partagé avec tout le
   reste). Chaque semaine garde son brief courant pour toujours. Seules les révisions
   d'une même semaine sont bornées : 8 au plus, sur les 6 semaines les plus récentes, et
   seul le texte collé juste avant la version courante est conservé. */
const HISTORY_MAX=8;
const HISTORY_WEEKS=6;
const RULES_MAX=60;
const LABEL_MAX=160;
const WEEK_RE=/^(\d{4})-W(\d{2})$/;
const DAY_MS=86400000;
/* Un snapshot performance ne porte que « W39 », sans année. Au-delà d'un semestre
   d'écart entre sa date d'import et la semaine demandée, c'est la W39 d'une autre année. */
const SNAPSHOT_YEAR_GUARD_DAYS=183;
const TYPE_LABELS={boost:'Priorité renforcée',suspend:'Contribution neutralisée',deadline:'Échéance',note:'Consigne'};
const TARGET_LABELS={performance:'priorité performance',structural:'priorité structurelle'};
const FAMILY_LABELS={all:'Toutes familles',brun:'BRUN',blanc:'BLANC'};
const PRIO_LABELS={P1:'Prio 1',P2:'Prio 2',watch:'À surveiller',nodata:'Pas de data'};

/* ------------------------------------------------------------------ utilitaires ---- */
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function text(v,max){const s=String(v==null?'':v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();return max&&s.length>max?s.slice(0,max):s}
function norm(v){try{return text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return text(v).toLowerCase()}}
function clamp(n,limit){const v=Number(n);if(!Number.isFinite(v))return 0;return Math.max(-limit,Math.min(limit,Math.round(v)))}
function parseDay(v){
  if(v instanceof Date)return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate(),12);
  const m=String(v||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3],12);
  return isNaN(d)?null:d;
}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function dateLabel(v){const d=parseDay(v);return d?String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'):text(v)}
function isoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&parseDay(v)?String(v):null}

/* ------------------------------------------------------------- semaines ISO -------- */
function week1Monday(year){const jan4=new Date(year,0,4,12);return addDays(jan4,-((jan4.getDay()+6)%7))}
function isoWeek(value){
  const d=parseDay(value===undefined?new Date():value);
  if(!d)return'';
  const thursday=addDays(d,3-((d.getDay()+6)%7)),year=thursday.getFullYear();
  const n=1+Math.round((addDays(thursday,-3)-week1Monday(year))/(7*DAY_MS));
  return year+'-W'+String(n).padStart(2,'0');
}
function weeksInYear(year){return Number(isoWeek(year+'-12-28').slice(6))}
function validWeek(week){
  const m=WEEK_RE.exec(String(week||''));
  if(!m)return false;
  const n=Number(m[2]);
  return n>=1&&n<=weeksInYear(Number(m[1]));
}
function weekMonday(week){
  if(!validWeek(week))return'';
  const m=WEEK_RE.exec(week);
  return iso(addDays(week1Monday(Number(m[1])),(Number(m[2])-1)*7));
}
function weekSunday(week){const mon=parseDay(weekMonday(week));return mon?iso(addDays(mon,6)):''}
function shiftWeek(week,delta){const mon=parseDay(weekMonday(week));return mon?isoWeek(addDays(mon,7*(Number(delta)||0))):''}
function weekNumber(week){const m=WEEK_RE.exec(String(week||''));return m?Number(m[2]):null}
function shortWeek(week){const n=weekNumber(week);return n==null?text(week):'W'+String(n).padStart(2,'0')}
/* « W5 » et « W05 » désignent la même semaine dans un nom de fichier. */
function snapshotWeekNumber(label){const m=String(label||'').match(/^W(\d{1,2})$/i);return m?Number(m[1]):null}

/* ------------------------------------------------------------ normalisation -------- */
function emptyData(){return{schema:SCHEMA,briefs:{}}}
function list(v,max,each){
  const out=[];
  for(const x of Array.isArray(v)?v:[]){const t=each(x);if(t&&!out.includes(t))out.push(t);if(out.length>=max)break}
  return out;
}
function normScope(raw){
  const s=object(raw)?raw:{};
  return{
    family:FAMILIES.includes(s.family)?s.family:'all',
    brands:list(s.brands,20,x=>text(x,60)),
    storeIds:list(s.storeIds,300,x=>text(x,80)),
    basePrio:BASE_PRIOS.includes(s.basePrio)?s.basePrio:null
  };
}
function normRule(raw,week,index){
  const r=object(raw)?raw:{};
  const type=RULE_TYPES.includes(r.type)?r.type:'note';
  const validFrom=validWeek(r.validFrom)?r.validFrom:week;
  const validTo=validWeek(r.validTo)&&r.validTo>=validFrom?r.validTo:validFrom;
  return{
    id:text(r.id,60)||('r'+(index+1)),
    type,
    label:text(r.label,LABEL_MAX)||TYPE_LABELS[type],
    scope:normScope(r.scope),
    target:type==='suspend'?(SUSPEND_TARGETS.includes(r.target)?r.target:'performance'):null,
    boost:type==='boost'||type==='deadline'?clamp(r.boost,BOOST_LIMIT):0,
    dueDate:type==='deadline'?isoDate(r.dueDate):null,
    validFrom,validTo,
    confidence:CONFIDENCE.includes(r.confidence)?r.confidence:'ambiguous',
    origin:ORIGINS.includes(r.origin)?r.origin:'manual',
    pending:text(r.pending,120)||null,
    note:text(r.note,400)
  };
}
function normRules(rules,week){
  const out=[],ids=new Set();
  (Array.isArray(rules)?rules:[]).slice(0,RULES_MAX).forEach((raw,i)=>{
    const r=normRule(raw,week,i);
    let id=r.id,n=2;
    while(ids.has(id))id=r.id+'-'+(n++);
    r.id=id;ids.add(id);out.push(r);
  });
  return out;
}
function normSource(raw){
  const s=object(raw)?raw:{};
  return{
    kind:SOURCE_KINDS.includes(s.kind)?s.kind:'manual',
    fileName:text(s.fileName,160),
    importedAt:text(s.importedAt,40),
    excerpt:text(s.excerpt,EXCERPT_MAX)
  };
}
function normHistoryEntry(raw,week){
  const h=object(raw)?raw:{};
  const out={revision:Math.max(1,Math.floor(Number(h.revision))||1),savedAt:text(h.savedAt,40),title:text(h.title,120),rules:normRules(h.rules,week)};
  if(typeof h.excerpt==='string')out.excerpt=text(h.excerpt,EXCERPT_MAX);
  return out;
}
function normBrief(raw,week){
  const b=object(raw)?raw:{};
  return{
    week,weekMonday:weekMonday(week),
    title:text(b.title,120)||('Brief '+shortWeek(week)),
    source:normSource(b.source),
    rules:normRules(b.rules,week),
    revision:Math.max(1,Math.floor(Number(b.revision))||1),
    createdAt:text(b.createdAt,40),
    updatedAt:text(b.updatedAt,40),
    history:(Array.isArray(b.history)?b.history:[]).slice(0,HISTORY_MAX).map(h=>normHistoryEntry(h,week))
  };
}
/* Lecture tolérante : une clé de semaine illisible est ignorée à l'affichage, jamais
   réécrite en silence. `validate` la refuse de toute façon avant l'enregistrement. */
function normalize(raw){
  const out=emptyData();
  if(!object(raw)||!object(raw.briefs))return out;
  for(const week of Object.keys(raw.briefs).sort())if(validWeek(week)&&object(raw.briefs[week]))out.briefs[week]=normBrief(raw.briefs[week],week);
  return out;
}
/* Garde-fou de `ChefReliability.validateState`, appelé à chaque enregistrement : il ne
   vérifie que la structure, que ce module écrit toujours correctement. */
function validate(raw){
  const fail=m=>{throw Error('Briefs hebdomadaires invalides : '+m)};
  if(!object(raw))fail('objet attendu.');
  if(Number(raw.schema)!==SCHEMA)fail('version '+raw.schema+' non prise en charge.');
  if(!object(raw.briefs))fail('liste des semaines absente.');
  for(const [week,b] of Object.entries(raw.briefs)){
    if(!validWeek(week))fail('semaine « '+week+' » illisible.');
    if(!object(b)||b.week!==week)fail('semaine '+week+' incohérente.');
    for(const key of ['rules','history'])if(b[key]!==undefined&&!Array.isArray(b[key]))fail(key+' de '+week+' invalide.');
    for(const r of b.rules||[])if(!object(r)||!RULE_TYPES.includes(r.type))fail('règle de '+week+' invalide.');
  }
  return raw;
}

/* ------------------------------------------------------------------ lecture -------- */
function data(state){return normalize(state&&state.weeklyBriefs)}
function briefForWeek(state,week){return data(state).briefs[week]||null}
function listBriefs(state){
  return Object.values(data(state).briefs).sort((a,b)=>b.week.localeCompare(a.week)).map(b=>({
    week:b.week,weekMonday:b.weekMonday,title:b.title,revision:b.revision,updatedAt:b.updatedAt,
    rules:b.rules.length,ambiguous:b.rules.filter(r=>r.confidence!=='confirmed').length,
    fileName:b.source.fileName,revisions:b.history.length+1
  }));
}
/* Règles valables pour une semaine : celles de son brief, et celles des briefs plus
   anciens dont la fenêtre de validité la couvre encore (« maintenu semaine suivante »). */
function rulesForWeek(state,week,options){
  const o=options||{},out=[];
  if(!validWeek(week))return out;
  for(const b of Object.values(data(state).briefs).sort((x,y)=>x.week.localeCompare(y.week))){
    if(b.week>week)continue;
    for(const r of b.rules){
      if(r.validFrom>week||r.validTo<week)continue;
      if(r.confidence!=='confirmed'&&!o.includeAmbiguous)continue;
      out.push(Object.assign({},r,{briefWeek:b.week,inherited:b.week!==week}));
    }
  }
  return out;
}

/* ---------------------------------------------------------------- écritures -------- */
function sameContent(a,b){
  return a.title===b.title&&a.source.excerpt===b.source.excerpt&&a.source.fileName===b.source.fileName
    &&a.source.kind===b.source.kind&&JSON.stringify(a.rules)===JSON.stringify(b.rules);
}
/* Enregistre le brief d'une semaine. Les autres semaines ne sont jamais touchées ; la
   version précédente de la même semaine passe dans son historique. Un texte collé n'est
   recopié dans l'historique que s'il a changé, pour ne pas multiplier le poids stocké. */
function saveBrief(state,week,patch,options){
  if(!state||typeof state!=='object')throw Error('État indisponible.');
  if(!validWeek(week))throw Error('Semaine invalide : '+week);
  const o=options||{},now=text(o.now,40)||new Date().toISOString();
  const d=data(state),prev=d.briefs[week]||null,p=object(patch)?patch:{};
  const merged=Object.assign({},prev||{},{
    title:p.title!==undefined?p.title:prev&&prev.title,
    source:p.source!==undefined?Object.assign({},prev&&prev.source,p.source):prev&&prev.source,
    rules:p.rules!==undefined?p.rules:prev&&prev.rules
  });
  const next=normBrief(merged,week);
  if(prev){
    if(sameContent(prev,next))return prev;
    const entry={revision:prev.revision,savedAt:prev.updatedAt,title:prev.title,rules:prev.rules};
    if(prev.source.excerpt!==next.source.excerpt)entry.excerpt=prev.source.excerpt;
    next.history=[entry].concat(prev.history).slice(0,HISTORY_MAX);
    next.revision=prev.revision+1;
    next.createdAt=prev.createdAt||now;
  }else{
    next.history=[];next.revision=1;next.createdAt=now;
  }
  next.updatedAt=now;
  d.briefs[week]=next;
  compact(d);
  state.weeklyBriefs=d;
  return next;
}
function compact(d){
  Object.keys(d.briefs).sort().reverse().forEach((week,i)=>{
    const b=d.briefs[week];
    if(i>=HISTORY_WEEKS){b.history=[];return}
    b.history.forEach((h,j)=>{if(j>0)delete h.excerpt});
  });
  return d;
}
function nextRuleId(rules){let n=rules.length+1;const ids=new Set(rules.map(r=>r.id));while(ids.has('r'+n))n++;return'r'+n}
function addRule(state,week,rule,options){
  const prev=briefForWeek(state,week),rules=prev?prev.rules.slice():[];
  if(rules.length>=RULES_MAX)throw Error('Trop de règles pour '+shortWeek(week)+' ('+RULES_MAX+' au maximum).');
  const r=Object.assign({},rule,{id:text(rule&&rule.id,60)||nextRuleId(rules)});
  rules.push(r);
  return saveBrief(state,week,{rules},options);
}
function updateRule(state,week,ruleId,patch,options){
  const prev=briefForWeek(state,week);
  if(!prev||!prev.rules.some(r=>r.id===ruleId))throw Error('Règle introuvable.');
  return saveBrief(state,week,{rules:prev.rules.map(r=>r.id===ruleId?Object.assign({},r,patch,{id:r.id}):r)},options);
}
function removeRule(state,week,ruleId,options){
  const prev=briefForWeek(state,week);
  if(!prev||!prev.rules.some(r=>r.id===ruleId))throw Error('Règle introuvable.');
  return saveBrief(state,week,{rules:prev.rules.filter(r=>r.id!==ruleId)},options);
}
function confirmRule(state,week,ruleId,options){return updateRule(state,week,ruleId,{confidence:'confirmed'},options)}

/* ------------------------------------------------------------- appariement --------- */
/* Magasin sans famille renseignée (ou « À confirmer ») : il peut porter les deux. */
function storeFamilies(store){
  const p=(store&&Array.isArray(store.products)?store.products:[]).map(norm).filter(x=>x&&x!=='a confirmer');
  if(!p.length)return['brun','blanc'];
  const out=[];
  if(p.some(x=>/brun|tv|barre|audio/.test(x)))out.push('brun');
  if(p.some(x=>/blanc|gem|pem|encastr/.test(x)))out.push('blanc');
  return out.length?out:['brun','blanc'];
}
function brandKey(perf,v){try{if(perf&&typeof perf.brandKey==='function')return perf.brandKey(v)}catch(e){}return norm(v)}
function brandMatches(store,brand,perf){
  const have=brandKey(perf,store&&store.enseigne),want=brandKey(perf,brand);
  return !!(have&&want&&(have===want||have.includes(want)));
}
function scopeIsEmpty(scope){return scope.family==='all'&&!scope.brands.length&&!scope.storeIds.length&&!scope.basePrio}
/* Une consigne sans périmètre vaut pour tout le brief, pas pour chaque magasin. Les
   autres règles sans filtre s'appliquent à tout le secteur. */
function ruleApplies(rule,store,perfPrio,perf){
  if(!rule||!store)return false;
  const s=rule.scope||normScope();
  if(rule.type==='note'&&scopeIsEmpty(s))return false;
  if(s.storeIds.length&&!s.storeIds.includes(String(store.id)))return false;
  if(s.brands.length&&!s.brands.some(b=>brandMatches(store,b,perf)))return false;
  if(s.family!=='all'&&!storeFamilies(store).includes(s.family))return false;
  if(s.basePrio&&perfPrio!==s.basePrio)return false;
  return true;
}

/* --------------------------------------------------- performance de la semaine ----- */
function context(options){
  const o=options||{};
  let db=o.db;
  if(db===undefined){try{db=root.__chefStorage||root.localStorage||null}catch(e){db=null}}
  return{
    state:o.state||root.state||{},
    db,
    perf:o.perf!==undefined?o.perf:(root.StoreRunnerPerformanceV190||null),
    today:o.today||new Date()
  };
}
function emptyPerformance(){return{snapshot:null,week:'',source:null,rows:new Map(),treated:()=>null,boosts:{}}}
/* Snapshot « correspondant » à la semaine, dans cet ordre :
     1. un import de la même semaine (garde d'année par la date d'import) ;
     2. pour la semaine en cours ou une semaine à venir : le dernier snapshot, soit
        exactement ce que lit `planningBoost` aujourd'hui ;
     3. pour une semaine passée : le dernier import connu à la fin de cette semaine. */
function performanceForWeek(week,ctx){
  const P=ctx.perf,db=ctx.db;
  if(!P||!db||typeof P.readStore!=='function'||typeof P.matchRows!=='function')return emptyPerformance();
  try{
    const store=P.readStore(db),imports=store.imports||[],n=weekNumber(week);
    const mon=parseDay(weekMonday(week)),sun=parseDay(weekSunday(week));
    const near=imp=>{const at=parseDay(imp.importedAt);return !at||Math.abs(at-mon)<=SNAPSHOT_YEAR_GUARD_DAYS*DAY_MS};
    let snap=null,source=null;
    const exact=imports.filter(imp=>snapshotWeekNumber(imp.week)===n&&near(imp));
    if(exact.length){snap=exact[exact.length-1];source='exact'}
    else if(week>=isoWeek(ctx.today)){snap=typeof P.latestSnapshot==='function'?P.latestSnapshot(db):null;source=snap?'latest':null}
    else{
      const dated=imports.filter(imp=>{const at=parseDay(imp.importedAt);return at&&at<=sun&&near(imp)});
      if(dated.length){snap=dated[dated.length-1];source='dated'}
    }
    if(!snap)return emptyPerformance();
    const stores=(ctx.state&&ctx.state.stores)||[];
    const rows=new Map();
    for(const r of (P.matchRows(snap.rows||[],stores,store.mapping)||{}).rows||[])if(r&&r.storeId!=null&&!rows.has(String(r.storeId)))rows.set(String(r.storeId),r);
    const treated=id=>{try{return typeof P.isTreated==='function'?P.isTreated(db,snap.week,id):null}catch(e){return null}};
    return{snapshot:snap,week:text(snap.week),source,rows,treated,boosts:P.PLANNING_BOOST||{}};
  }catch(e){return emptyPerformance()}
}

/* --------------------------------------------------------------- visites ---------- */
function completedVisitDates(state,storeId){
  const out=[],id=String(storeId);
  try{
    const legacy=state&&state.visits&&state.visits[id];
    if(legacy){if(legacy.lastVisit)out.push(String(legacy.lastVisit).slice(0,10));(Array.isArray(legacy.history)?legacy.history:[]).forEach(d=>out.push(String(d||'').slice(0,10)))}
  }catch(e){}
  try{
    for(const v of (state&&state.businessV2&&Array.isArray(state.businessV2.visits)?state.businessV2.visits:[]))
      if(v&&String(v.storeId)===id&&v.status==='completed')out.push(String(v.completedDate||v.completedAt||'').slice(0,10));
  }catch(e){}
  return[...new Set(out.filter(d=>isoDate(d)))].sort();
}

/* ---------------------------------------------------------- priorité effective ----- */
function structuralValue(store){const p=Math.round(Number(store&&store.priority));return p>=1&&p<=5?p:3}
function evaluate(store,week,perfCtx,rules,ctx){
  const id=String(store.id),structural=structuralValue(store);
  const row=perfCtx.rows.get(id)||null,prio=row&&row.prio||null;
  const treated=prio?perfCtx.treated(id):null;
  const perfRaw=prio&&!treated?(Number(perfCtx.boosts[prio])||0):0;
  /* Neutraliser une priorité performance qui n'existe pas ne dit rien : la règle ne
     s'affiche que sur les magasins qui ont effectivement un P1/P2 dans le fichier. */
  const hasPerf=prio==='P1'||prio==='P2';
  const applied=rules.filter(r=>ruleApplies(r,store,prio,ctx.perf)&&!(r.type==='suspend'&&r.target==='performance'&&!hasPerf));
  const suspendedBy=target=>applied.filter(r=>r.type==='suspend'&&r.target===target);
  const perfOff=suspendedBy('performance'),structOff=suspendedBy('structural');
  const perfValue=perfOff.length?0:perfRaw;
  const structValue=structOff.length?0:structural*STRUCTURAL_WEIGHT;
  const briefRaw=applied.reduce((n,r)=>n+(r.type==='boost'||r.type==='deadline'?r.boost:0),0);
  const briefValue=clamp(briefRaw,BOOST_LIMIT);
  const weekBoost=perfValue+briefValue;

  const layers=[{
    source:'structural',label:'Priorité structurelle '+structural+'/5',value:structural,
    delta:structValue,permanent:true,suspendedBy:structOff.map(r=>({ruleId:r.id,label:r.label,briefWeek:r.briefWeek}))
  },{
    source:'performance',label:prio?(PRIO_LABELS[prio]||prio)+' · fichier '+perfCtx.week:'Aucune priorité performance',
    value:prio,week:perfCtx.week||null,snapshotSource:perfCtx.source,treated:treated?text(treated.at):null,
    raw:perfRaw,delta:perfValue,permanent:false,suspendedBy:perfOff.map(r=>({ruleId:r.id,label:r.label,briefWeek:r.briefWeek}))
  }];
  for(const r of applied)layers.push({
    source:'brief',ruleId:r.id,type:r.type,label:r.label,briefWeek:r.briefWeek,inherited:r.inherited,
    delta:r.type==='boost'||r.type==='deadline'?r.boost:0,target:r.target,family:r.scope.family,
    dueDate:r.dueDate,validFrom:r.validFrom,validTo:r.validTo,temporary:true,until:r.validTo,pending:r.pending
  });

  let deadline=null;
  const due=applied.filter(r=>r.type==='deadline'&&r.dueDate).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))[0];
  if(due){
    const from=weekMonday(due.validFrom),visits=completedVisitDates(ctx.state,id).filter(d=>d>=from&&d<=due.dueDate);
    const today=iso(parseDay(ctx.today)||new Date());
    deadline={dueDate:due.dueDate,label:due.label,ruleId:due.id,doneDate:visits[0]||null,overdue:!visits.length&&today>due.dueDate};
  }

  const wk=shortWeek(week),badges=[];
  if(prio==='P1'||prio==='P2')badges.push({kind:'performance',text:prio+(perfOff.length?' · neutralisée '+wk:''),muted:!!perfOff.length||!!treated});
  if(structural>=4)badges.push({kind:'structural',text:'Structurelle '+structural+'/5',muted:!!structOff.length});
  for(const r of applied)badges.push({kind:r.type,text:wk+' : '+r.label,ruleId:r.id,inherited:r.inherited});

  const explain=[];
  explain.push('Priorité structurelle '+structural+'/5 (fiche magasin, permanente)'+(structOff.length?' — neutralisée en '+wk+' par « '+structOff[0].label+' »':'')+'.');
  if(prio){
    let line=(PRIO_LABELS[prio]||prio)+' dans le fichier performance '+perfCtx.week;
    if(treated)line+=' — marqué traité le '+text(treated.at)+', plus de coup de pouce';
    else if(perfOff.length)line+=' — neutralisée en '+wk+' par « '+perfOff[0].label+' » (la donnée source reste '+(PRIO_LABELS[prio]||prio)+')';
    else if(perfRaw)line+=' (+'+perfRaw+')';
    explain.push(line+'.');
  }else if(perfCtx.week)explain.push('Aucune priorité P1/P2 dans le fichier performance '+perfCtx.week+'.');
  else explain.push('Aucun fichier performance pour cette semaine.');
  for(const r of applied){
    if(r.type==='suspend')continue;
    let line='Brief '+shortWeek(r.briefWeek)+' : '+r.label;
    if(r.boost)line+=' ('+(r.boost>0?'+':'')+r.boost+')';
    if(r.type==='deadline'&&r.dueDate)line+=' · avant le '+dateLabel(r.dueDate);
    line+=r.validTo>r.validFrom||r.inherited?' · valable jusqu’à '+shortWeek(r.validTo):' · cette semaine seulement';
    if(r.pending)line+=' · en attente : '+r.pending;
    explain.push(line+'.');
  }

  return{
    storeId:id,week,weekMonday:weekMonday(week),
    base:{structural,performance:prio,performanceWeek:perfCtx.week||null,performanceSource:perfCtx.source,treated:!!treated},
    contributions:{structural:structValue,performance:perfValue,brief:briefValue},
    suspended:{performance:perfOff.length>0,structural:structOff.length>0},
    weekBoost,score:structValue+weekBoost,
    deadline,layers,badges,explain,
    rules:applied.map(r=>r.id),
    touchedByBrief:applied.length>0
  };
}
function findStore(state,store){
  if(store&&typeof store==='object')return store;
  return ((state&&state.stores)||[]).find(s=>String(s&&s.id)===String(store))||null;
}
function effectivePriority(store,week,options){
  const ctx=context(options),w=validWeek(week)?week:isoWeek(ctx.today),s=findStore(ctx.state,store);
  if(!s||s.id==null)return null;
  return evaluate(s,w,performanceForWeek(w,ctx),rulesForWeek(ctx.state,w),ctx);
}
/* Calcul en lot : un seul appariement du fichier performance pour toute la semaine. */
function effectivePriorities(week,options){
  const ctx=context(options),w=validWeek(week)?week:isoWeek(ctx.today);
  const perfCtx=performanceForWeek(w,ctx),rules=rulesForWeek(ctx.state,w);
  const rows=((ctx.state&&ctx.state.stores)||[]).filter(s=>s&&s.id!=null&&s.active!==false).map(s=>Object.assign(evaluate(s,w,perfCtx,rules,ctx),{store:s}));
  rows.sort((a,b)=>b.score-a.score||String(a.store.enseigne||'').localeCompare(String(b.store.enseigne||''))||String(a.storeId).localeCompare(String(b.storeId)));
  return{week:w,weekMonday:weekMonday(w),performance:{week:perfCtx.week||null,source:perfCtx.source},rules,rows};
}
/* Le seul nombre qu'un planificateur aura à lire. Sans règle de brief pour la semaine,
   il vaut exactement `StoreRunnerPerformanceV190.planningBoost` sur le même snapshot. */
function weekBoost(store,week,options){const r=effectivePriority(store,week,options);return r?r.weekBoost:0}

const api={
  SCHEMA,RULE_TYPES,SUSPEND_TARGETS,FAMILIES,BOOST_LIMIT,STRUCTURAL_WEIGHT,EXCERPT_MAX,HISTORY_MAX,HISTORY_WEEKS,RULES_MAX,
  TYPE_LABELS,TARGET_LABELS,FAMILY_LABELS,
  isoWeek,validWeek,weekMonday,weekSunday,shiftWeek,shortWeek,dateLabel,
  emptyData,normalize,validate,data,briefForWeek,listBriefs,rulesForWeek,
  saveBrief,addRule,updateRule,removeRule,confirmRule,
  storeFamilies,ruleApplies,performanceForWeek,completedVisitDates,
  effectivePriority,effectivePriorities,weekBoost,
  activeWeek(today){return isoWeek(today===undefined?new Date():today)}
};
root.StoreRunnerWeeklyBriefV246=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
