/* Runner Behavior V273 — FONDATION, non chargée par l'application (aucune activation runtime).
   Couche de décision pure et déterministe entre les écrans hôtes et Runner : personnalités (données),
   catalogue de réactions, arbitrage, anti-spam, registre borné et sérialisable.
   Contrat : RUNNER_PERSONALITY_V273.md. Ce module ne connaît ni le DOM, ni l'affichage de Runner, ni
   les données métier : l'hôte lui passe des faits primitifs et applique le descripteur qu'il reçoit.
   Aucun timer, écouteur, observateur, réseau, aléa ni lecture de l'horloge : `now` et la date locale
   (`facts.date`, AAAA-MM-JJ) sont fournis par l'hôte. Les fonctions publiques ne modifient jamais leurs
   arguments et ne lèvent jamais d'exception vers l'appelant. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.StoreRunnerBehavior=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';

const VERSION=1;
const STORAGE_KEY='store-runner-runner-v1';
const DEFAULT_PERSONALITY='copilote';
const STATES=Object.freeze(['neutral','analyzing','alert','success']);
const SURFACES=Object.freeze(['home','planning','assistant','sheet']);
const TRIGGERS=Object.freeze(['arrive','rerender','touch','personality']);
const GESTURES=Object.freeze(['acknowledge','nod','lookToward','settle']);
const ATTENTION_KINDS=Object.freeze(['action-overdue','late','visit-open']);
const MIN=60000,DAY=86400000;

/* Tous les seuils qui restent des décisions humaines vivent ici, et seulement ici. */
const CONFIG=Object.freeze({
  absenceDays:5,              // jours calendaires sans activité avant un « retour »
  textGapMs:10*MIN,           // écart minimal entre deux textes ambiants
  gestureGapMs:20000,         // écart minimal entre deux gestes ambiants
  arrivalGuardMs:3000,        // navigation rapide : pas de seconde réaction ambiante sur la même surface
  repeatWindowMs:DAY,         // un même texte n'est pas réaffiché dans cette fenêtre
  attentionRepeatDays:3,      // même magasin : au plus une fois tous les N jours
  attentionMaxPerDay:2,       // plafond global (la personnalité peut être plus basse)
  touchLadder:Object.freeze(['acknowledge','nod']), // réactions successives d'une même série de touchers
  touchChainMs:10000,         // écart maximal entre deux touchers d'une même série
  touchWindowMs:MIN,          // fenêtre de comptage des réactions au toucher
  touchMaxReactions:3,        // réactions au toucher par fenêtre
  touchLockoutMs:20000,       // silence après la dernière réaction permise
  returnBurstMax:3,           // retours animés par fenêtre avant placement direct
  returnBurstWindowMs:MIN,
  previewGapMs:2000,          // aperçu de personnalité : un par intervalle
  activeWriteGapMs:30*MIN,    // écriture de « dernière activité » au plus toutes les N minutes
  shownTtlDays:14,            // durée de vie des entrées du registre
  shownMax:24,                // nombre maximal d'entrées du registre
  registryMaxChars:2048,      // taille maximale du registre sérialisé
  labelMaxChars:32,           // longueur maximale d'un nom fourni par un propriétaire
  reasonMaxChars:40,
  messageMs:6000              // durée d'affichage d'un message ou d'un état de réaction
});
const NUMERIC_KEYS=Object.freeze(Object.keys(CONFIG).filter(k=>typeof CONFIG[k]==='number'));

/* ------------------------------------------------------------------ outils */
function deepFreeze(o){
  if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);for(const k of Object.keys(o))deepFreeze(o[k])}
  return o;
}
function has(o,k){return !!o&&Object.prototype.hasOwnProperty.call(o,k)}
function isObj(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}
function num(v){return typeof v==='number'&&isFinite(v)?v:null}
function int(v,min,max){const n=num(v);return n!==null&&Math.floor(n)===n&&n>=min&&n<=max?n:null}
function clean(v,max){
  if(typeof v!=='string')return '';
  const chars=Array.from(v.replace(/[\u0000-\u001f\u007f\s]+/g,' ').trim());
  return chars.length>max?chars.slice(0,max-1).join('').trimEnd()+'…':chars.join('');
}
/* Écart écoulé ; inconnu ou horloge revenue en arrière = « assez ancien » (jamais de blocage définitif). */
function elapsed(now,then){return then===null||then===undefined||!isFinite(then)||then>now?Infinity:now-then}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function isoDate(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
  const y=+v.slice(0,4),m=+v.slice(5,7),d=+v.slice(8,10);
  const dim=[31,(y%4===0&&y%100!==0)||y%400===0?29:28,31,30,31,30,31,31,30,31,30,31];
  return m>=1&&m<=12&&d>=1&&d<=dim[m-1]?v:null;
}
function dayNumber(v){return Date.UTC(+v.slice(0,4),+v.slice(5,7)-1,+v.slice(8,10))/DAY}
function daysBetween(a,b){return dayNumber(b)-dayNumber(a)}
function keyToken(v){return String(v==null?'':v).replace(/[^A-Za-z0-9._-]/g,'_').slice(0,40)}
function validKey(k){return typeof k==='string'&&/^[A-Za-z0-9._:-]{1,64}$/.test(k)&&k!=='__proto__'&&k!=='constructor'&&k!=='prototype'}

/* ------------------------------------------------------------ personnalités */
/* Données pures. Une réaction absente d'une personnalité lui est interdite ; `copy` vide = geste ou
   état seul. `{nom}` est un fait fourni par l'hôte, `{nom:mot}` ajoute le mot (pluriel en « s »).
   Les titres ne concernent que les états métier, par surface hôte : Copilote reprend les titres V271. */
const PERSONALITIES=deepFreeze({
  copilote:{id:'copilote',label:'Copilote',blurb:'Calme et factuel : l’essentiel, sans détour.',tone:'factuel',proactivity:1,textBudgetPerDay:2,idle:true,
    titles:{planning:{analyzing:'Génération en cours…',alert:'Contrainte détectée',success:'C’est fait !'},assistant:{analyzing:'Analyse en cours…',alert:'Attention !',success:'C’est fait !'}},
    reactions:{
      'tour.finished':{copy:['Tournée terminée. Magasins visités : {done}.','Tournée terminée : {done} sur {total}.']},
      'attention.notice':{copy:['Un point à regarder : {label}.','Un point à regarder chez {label}.','À regarder : {label}, {reason}.']},
      'welcome.back':{copy:['De retour. Dernière visite il y a {lastVisit:jour}.','Content de te revoir. Dernière visite il y a {lastVisit:jour}.','De retour dans ton secteur.','Content de te revoir.']},
      'day.ready':{copy:[]},
      'day.empty':{copy:['Rien de prévu aujourd’hui.','Aucune visite prévue aujourd’hui.']},
      'home.return':{copy:[]},'touch.runner':{copy:[]},
      'personality.changed':{copy:['Je reste sobre et factuel.','Je te dis l’essentiel.']}}},
  coequipier:{id:'coequipier',label:'Coéquipier',blurb:'Chaleureux : il t’accompagne et remarque ce qui compte.',tone:'chaleureux',proactivity:2,textBudgetPerDay:3,idle:true,
    titles:{planning:{analyzing:'Je prépare ça…',alert:'Un point à vérifier',success:'Voilà, c’est fait.'},assistant:{analyzing:'Je regarde ça…',alert:'Un point à vérifier',success:'Voilà, c’est fait.'}},
    reactions:{
      'tour.finished':{copy:['Belle tournée : {done} sur {total}.','Belle tournée. {done} sur {total}, c’est fait.']},
      'attention.notice':{copy:['Un point pour {label} : {reason}.','J’ai repéré un point chez {label}.','Un point à regarder chez {label}.']},
      'welcome.back':{copy:['Content de te retrouver. Dernière visite il y a {lastVisit:jour}.','Te revoilà. Dernière visite il y a {lastVisit:jour}.','Content de te retrouver.','Te revoilà.']},
      'day.ready':{copy:['Bonne journée. {total:visite} au programme.','Au programme aujourd’hui : {total:visite}.']},
      'day.empty':{copy:['Rien au programme aujourd’hui.','Journée sans visite prévue.']},
      'home.return':{copy:[]},'touch.runner':{copy:[]},
      'personality.changed':{copy:['Je suis là pour t’accompagner.','On fait la tournée ensemble.']}}},
  coach:{id:'coach',label:'Coach',blurb:'Énergique : il garde le rythme de ta tournée.',tone:'énergique',proactivity:2,textBudgetPerDay:3,idle:true,
    titles:{planning:{analyzing:'Je prépare le plan…',alert:'À régler',success:'Validé.'},assistant:{analyzing:'Analyse…',alert:'À régler',success:'Validé.'}},
    reactions:{
      'tour.finished':{copy:['Tournée bouclée : {done} sur {total}.','Tournée bouclée. {done} sur {total}, bien joué.']},
      'attention.notice':{copy:['À traiter : {reason}, {label}.','À traiter : {label}.','À traiter chez {label}.']},
      'welcome.back':{copy:['On reprend. Dernière visite il y a {lastVisit:jour}.','C’est reparti. Dernière visite il y a {lastVisit:jour}.','On reprend.','C’est reparti.']},
      'day.ready':{copy:['C’est parti : {total:visite} aujourd’hui.','En route : {total:visite} aujourd’hui.']},
      'day.empty':{copy:['Journée libre aujourd’hui.','Pas de visite prévue aujourd’hui.']},
      'home.return':{copy:[]},'touch.runner':{copy:[]},
      'personality.changed':{copy:['On garde le rythme.','Un magasin après l’autre.']}}},
  discret:{id:'discret',label:'Discret',blurb:'Presque muet : il ne réagit qu’à ce que tu fais.',tone:'minimal',proactivity:0,textBudgetPerDay:0,idle:false,
    titles:{planning:{analyzing:'En cours…',alert:'Contrainte',success:'Fait.'},assistant:{analyzing:'En cours…',alert:'Contrainte',success:'Fait.'}},
    reactions:{
      'tour.finished':{copy:[]},
      'personality.changed':{copy:['Je reste discret.']}}}
});

/* ---------------------------------------------------------------- réactions */
/* kind : ambient (parle ou regarde à l'arrivée), presence (geste de retour), social (toucher),
   user (action explicite de l'utilisateur : aucun budget). `weight` ordonne les gagnants ; l'ordre du
   tableau départage. `stateOnlyOk` : l'état visuel suffit si le texte est refusé par le budget. */
const REACTIONS=deepFreeze([
  {id:'personality.changed',kind:'user',weight:90,surfaces:['sheet'],triggers:['personality'],state:'neutral',gesture:'acknowledge',look:null,gestureMs:600},
  {id:'tour.finished',kind:'ambient',weight:70,surfaces:['home'],triggers:['arrive','rerender'],state:'success',gesture:null,look:null,gestureMs:0,stateOnlyOk:true},
  {id:'attention.notice',kind:'ambient',weight:60,surfaces:['home'],triggers:['arrive'],state:'neutral',gesture:'lookToward',look:'card',gestureMs:1400},
  {id:'welcome.back',kind:'ambient',weight:55,surfaces:['home'],triggers:['arrive'],state:'neutral',gesture:'acknowledge',look:'down',gestureMs:600,absorbs:['day.ready']},
  {id:'day.ready',kind:'ambient',weight:40,surfaces:['home'],triggers:['arrive'],state:'neutral',gesture:'lookToward',look:'card',gestureMs:1400},
  {id:'day.empty',kind:'ambient',weight:40,surfaces:['home'],triggers:['arrive'],state:'neutral',gesture:'lookToward',look:'down',gestureMs:1400},
  {id:'home.return',kind:'presence',weight:30,surfaces:['home'],triggers:['arrive'],state:'neutral',gesture:'settle',look:null,gestureMs:0},
  {id:'touch.runner',kind:'social',weight:20,surfaces:['home','sheet'],triggers:['touch'],state:'neutral',gesture:null,look:null,gestureMs:700}
]);
function reactionById(id){for(const r of REACTIONS)if(r.id===id)return r;return null}

/* ---------------------------------------------------------- options (config) */
const DEFAULT_OPTIONS=Object.freeze({cfg:CONFIG,personalities:PERSONALITIES});
function resolveOptions(options){
  if(!isObj(options))return DEFAULT_OPTIONS;
  let cfg=CONFIG,personalities=PERSONALITIES;
  if(isObj(options.config)){
    const merged=Object.assign({},CONFIG);
    for(const k of NUMERIC_KEYS){const n=num(options.config[k]);if(n!==null&&n>=0)merged[k]=n}
    const ladder=options.config.touchLadder;
    if(Array.isArray(ladder)&&ladder.length<=GESTURES.length&&ladder.every(g=>GESTURES.indexOf(g)!==-1))merged.touchLadder=Object.freeze(ladder.slice());
    cfg=Object.freeze(merged);
  }
  if(isObj(options.personalities)){
    const custom={};
    for(const id of Object.keys(options.personalities)){
      const p=options.personalities[id];
      if(validKey(id)&&isObj(p)&&p.id===id&&int(p.textBudgetPerDay,0,99)!==null&&int(p.proactivity,0,2)!==null&&typeof p.idle==='boolean'&&isObj(p.reactions))custom[id]=p;
    }
    if(has(custom,DEFAULT_PERSONALITY))personalities=custom;
  }
  return cfg===CONFIG&&personalities===PERSONALITIES?DEFAULT_OPTIONS:{cfg,personalities};
}

/* ------------------------------------------------------------------ registre */
function emptySession(){return{lastReaction:{},lastGestureAt:null,touches:[],touchLockUntil:null,returns:[],lastPreviewAt:null}}
function defaultRegistry(){
  return deepFreeze({v:VERSION,personality:DEFAULT_PERSONALITY,lastActiveDate:null,lastActiveAt:null,lastTextAt:null,textDay:{date:null,n:0},shown:{},variant:{},welcome:null,session:emptySession()});
}
function recent(list,now,windowMs){
  const out=[];
  if(Array.isArray(list))for(const t of list){const n=num(t);if(n!==null&&n>=0&&(now===null||(n<=now&&now-n<windowMs)))out.push(n)}
  return out.sort((a,b)=>a-b).slice(-8);
}
function parseSession(src,now,cfg){
  const s=emptySession();
  if(!isObj(src))return s;
  if(isObj(src.lastReaction))for(const k of SURFACES){const n=num(src.lastReaction[k]);if(n!==null&&n>=0)s.lastReaction[k]=n}
  s.lastGestureAt=num(src.lastGestureAt);
  s.lastPreviewAt=num(src.lastPreviewAt);
  s.touchLockUntil=num(src.touchLockUntil);
  s.touches=recent(src.touches,now,cfg.touchWindowMs);
  s.returns=recent(src.returns,now,cfg.returnBurstWindowMs);
  return s;
}
/* Lecture tolérante : champ par champ, sans jamais lever ; texte illisible, version future ou trop
   gros → valeurs par défaut. `ctx` : { now, date } pour purger ce qui a expiré. */
function normalizeRegistry(raw,ctx,o,keepSession){
  const c=isObj(ctx)?ctx:{},cfg=o.cfg,now=num(c.now),date=isoDate(c.date);
  let src=raw;
  if(typeof src==='string'){
    if(src.length>cfg.registryMaxChars*4)return defaultRegistry();
    try{src=JSON.parse(src)}catch(e){return defaultRegistry()}
  }
  if(!isObj(src)||(typeof src.v==='number'&&src.v>VERSION))return defaultRegistry();
  const out={v:VERSION,personality:typeof src.personality==='string'&&has(o.personalities,src.personality)?src.personality:DEFAULT_PERSONALITY,
    lastActiveDate:isoDate(src.lastActiveDate),lastActiveAt:num(src.lastActiveAt),lastTextAt:num(src.lastTextAt),
    textDay:{date:null,n:0},shown:{},variant:{},welcome:null};
  if(isObj(src.textDay)){const d=isoDate(src.textDay.date),n=int(src.textDay.n,0,99);if(d&&n!==null)out.textDay={date:d,n}}
  const entries=[];
  if(isObj(src.shown))for(const k of Object.keys(src.shown)){
    const e=src.shown[k],d=isObj(e)?isoDate(e.d):null,t=isObj(e)?num(e.t):null;
    if(!validKey(k)||!d||t===null||t<0)continue;
    if(date&&daysBetween(d,date)>cfg.shownTtlDays)continue;
    if(!date&&now!==null&&now-t>cfg.shownTtlDays*DAY)continue;
    entries.push([k,d,t]);
  }
  entries.sort((a,b)=>b[2]-a[2]||(a[0]<b[0]?-1:1));
  for(const e of entries.slice(0,cfg.shownMax).sort((a,b)=>a[0]<b[0]?-1:1))out.shown[e[0]]={d:e[1],t:e[2]};
  if(isObj(src.variant))for(const r of REACTIONS){
    const e=src.variant[r.id],i=isObj(e)?int(e.i,0,99):null,t=isObj(e)?num(e.t):null;
    if(i!==null&&t!==null&&t>=0)out.variant[r.id]={i,t};
  }
  if(isObj(src.welcome)){
    const d=isoDate(src.welcome.date),n=int(src.welcome.days,1,3650);
    if(d&&n!==null&&(!date||d>=date))out.welcome={date:d,days:n};
  }
  out.session=keepSession?parseSession(src.session,now,cfg):emptySession();
  return deepFreeze(out);
}
function persistedView(reg){
  return{v:VERSION,personality:reg.personality,lastActiveDate:reg.lastActiveDate,lastActiveAt:reg.lastActiveAt,lastTextAt:reg.lastTextAt,textDay:reg.textDay,shown:reg.shown,variant:reg.variant,welcome:reg.welcome};
}
/* Sérialisation bornée : si le registre dépasse la taille permise, les plus anciennes entrées sortent
   d'abord, puis les variantes, puis tout repart des valeurs par défaut. Le texte produit est du JSON
   sans la partie « session » (mémoire de la session, jamais persistée). */
function serializeRegistry(registry,ctx,options){
  try{
    const o=resolveOptions(options),max=o.cfg.registryMaxChars;
    const obj=JSON.parse(JSON.stringify(persistedView(normalizeRegistry(registry,ctx,o,false))));
    let s=JSON.stringify(obj);
    while(s.length>max&&Object.keys(obj.shown).length){
      const keys=Object.keys(obj.shown).sort((a,b)=>obj.shown[a].t-obj.shown[b].t||(a<b?-1:1));
      delete obj.shown[keys[0]];s=JSON.stringify(obj);
    }
    if(s.length>max&&Object.keys(obj.variant).length){obj.variant={};s=JSON.stringify(obj)}
    return s.length>max?JSON.stringify(persistedView(defaultRegistry())):s;
  }catch(e){return JSON.stringify(persistedView(defaultRegistry()))}
}
function parseRegistry(text,ctx,options){
  try{return normalizeRegistry(text,ctx,resolveOptions(options),false)}catch(e){return defaultRegistry()}
}
function isDefaultRegistry(reg){
  return reg.personality===DEFAULT_PERSONALITY&&reg.lastActiveDate===null&&reg.lastTextAt===null&&reg.welcome===null&&reg.textDay.date===null&&!Object.keys(reg.shown).length&&!Object.keys(reg.variant).length;
}
/* Persistance abstraite : `adapter` est fourni par l'hôte ({ getItem, setItem, removeItem }). Ce module
   n'en connaît aucun et ne lève jamais : une lecture ou une écriture refusée donne les valeurs par défaut. */
function loadRegistry(adapter,ctx,options){
  let raw=null;
  try{if(adapter&&typeof adapter.getItem==='function')raw=adapter.getItem(STORAGE_KEY)}catch(e){raw=null}
  return raw===null||raw===undefined?defaultRegistry():parseRegistry(raw,ctx,options);
}
function saveRegistry(adapter,registry,ctx,options){
  try{
    if(!adapter)return false;
    const reg=normalizeRegistry(registry,ctx,resolveOptions(options),false);
    if(isDefaultRegistry(reg)){if(typeof adapter.removeItem==='function')adapter.removeItem(STORAGE_KEY);return true}
    if(typeof adapter.setItem!=='function')return false;
    adapter.setItem(STORAGE_KEY,serializeRegistry(reg,ctx,options));
    return true;
  }catch(e){return false}
}

/* ------------------------------------------------------------------- entrées */
function normalizeInput(input,cfg){
  if(!isObj(input))return null;
  const surface=SURFACES.indexOf(input.surface)!==-1?input.surface:null,trigger=TRIGGERS.indexOf(input.trigger)!==-1?input.trigger:null,now=num(input.now);
  if(!surface||!trigger||now===null)return null;
  const v=isObj(input.view)?input.view:{},f=isObj(input.facts)?input.facts:{};
  const view={state:typeof v.state==='string'?v.state:null,keyboard:v.keyboard===true,overlay:v.overlay===true,firstRun:v.firstRun===true,updating:v.updating===true};
  let tour=null;
  if(isObj(f.tour)){const total=int(f.tour.total,0,999),done=int(f.tour.done,0,999);if(total!==null&&done!==null)tour={total,done,finished:f.tour.finished===true}}
  let attention=null;
  if(isObj(f.attention)&&ATTENTION_KINDS.indexOf(f.attention.kind)!==-1){
    const key=keyToken(f.attention.key),label=clean(f.attention.label,cfg.labelMaxChars);
    if(key&&label)attention={kind:f.attention.kind,key,label,reason:clean(f.attention.reason,cfg.reasonMaxChars)||null};
  }
  const facts={date:isoDate(f.date),workday:typeof f.workday==='boolean'?f.workday:null,afterHours:f.afterHours===true,
    mode:f.mode==='today'||f.mode==='next'?f.mode:null,busy:f.busy===true,tour,attention,
    lastVisitDaysAgo:int(f.lastVisitDaysAgo,0,9999),returnFrom:clean(f.returnFrom,32)||null};
  return{surface,trigger,now,view,facts};
}
function blocked(inp){
  const v=inp.view;
  return v.state!=='neutral'||v.keyboard||v.firstRun||v.updating||(v.overlay&&inp.surface!=='sheet');
}

/* ---------------------------------------------------------------- textes */
const PLACEHOLDER=/\{([A-Za-z]+)(?::([a-zà-ÿ]+))?\}/g;
function resolvable(tpl,vars){
  let ok=true;
  tpl.replace(PLACEHOLDER,(m,k)=>{const x=vars[k];if(x===undefined||x===null||x==='')ok=false;return m});
  return ok;
}
function render(tpl,vars){
  return tpl.replace(PLACEHOLDER,(m,k,w)=>{const x=vars[k];return w&&typeof x==='number'?x+' '+(x>1?w+'s':w):String(x)});
}
/* Rotation déterministe : première variante tirée d'un hachage (réaction + graine), puis variante suivante
   utilisable après la dernière affichée. Jamais deux fois la même d'affilée ; une variante unique n'est
   pas réaffichée dans `repeatWindowMs`. Retourne null si aucune variante n'est utilisable. */
function pickText(def,copy,vars,reg,seed,now,cfg,allowRepeat){
  const usable=[];
  for(let i=0;i<copy.length;i++)if(typeof copy[i]==='string'&&resolvable(copy[i],vars))usable.push(i);
  if(!usable.length)return null;
  const last=has(reg.variant,def.id)?reg.variant[def.id]:null,lastI=last&&last.i<copy.length?last.i:-1;
  let index=-1;
  if(lastI<0)index=usable[hash(def.id+'|'+seed)%usable.length];
  else for(let k=1;k<=copy.length;k++){const c=(lastI+k)%copy.length;if(usable.indexOf(c)!==-1){index=c;break}}
  if(index===lastI&&!allowRepeat&&elapsed(now,last.t)<cfg.repeatWindowMs)return null;
  return{index,text:render(copy[index],vars)};
}

/* ------------------------------------------------------ règles de déclenchement */
function shownToday(reg,key,date){return has(reg.shown,key)&&reg.shown[key].d===date}
function absence(reg,date,cfg){
  if(reg.welcome&&reg.welcome.date===date)return reg.welcome.days;
  if(reg.lastActiveDate){const gap=daysBetween(reg.lastActiveDate,date);if(gap>=cfg.absenceDays)return gap}
  return null;
}
function touchChain(now,touches,cfg){
  let n=0,ref=now;
  for(let i=touches.length-1;i>=0;i--){if(touches[i]>ref||ref-touches[i]>cfg.touchChainMs)break;n++;ref=touches[i]}
  return n;
}
/* Chaque règle renvoie null, ou { vars, key?, gesture? } : les faits utiles au texte et à la trace. */
const RULES={
  'personality.changed':(c)=>elapsed(c.inp.now,c.reg.session.lastPreviewAt)>=c.cfg.previewGapMs?{vars:{}}:null,
  'tour.finished':(c)=>{
    const t=c.inp.facts.tour;
    if(!t||t.total<1||!t.finished||shownToday(c.reg,'tour.finished',c.inp.facts.date))return null;
    return{vars:{done:t.done,total:t.total}};
  },
  'attention.notice':(c)=>{
    const a=c.inp.facts.attention,date=c.inp.facts.date,cap=Math.min(c.p.proactivity,c.cfg.attentionMaxPerDay);
    if(!a)return null;
    let today=0;
    for(const k of Object.keys(c.reg.shown))if(k.indexOf('attention:')===0&&c.reg.shown[k].d===date)today++;
    const key='attention:'+a.key;
    if(today>=cap||(has(c.reg.shown,key)&&daysBetween(c.reg.shown[key].d,date)<c.cfg.attentionRepeatDays))return null;
    return{vars:{label:a.label,reason:a.reason},key};
  },
  'welcome.back':(c)=>{
    const days=absence(c.reg,c.inp.facts.date,c.cfg);
    return days===null?null:{vars:{days,lastVisit:c.inp.facts.lastVisitDaysAgo}};
  },
  'day.ready':(c)=>{
    const f=c.inp.facts,t=f.tour;
    if(!t||t.total<1||t.done!==0||t.finished||f.workday!==true||f.afterHours||f.mode!=='today'||shownToday(c.reg,'day.ready',f.date))return null;
    return{vars:{total:t.total}};
  },
  'day.empty':(c)=>{
    const f=c.inp.facts;
    return f.workday===true&&!f.tour&&f.mode==='today'&&!f.busy&&!shownToday(c.reg,'day.empty',f.date)?{vars:{}}:null;
  },
  'home.return':(c)=>{
    if(!c.inp.facts.returnFrom||c.reg.session.returns.length>=c.cfg.returnBurstMax)return null;
    return{vars:{}};
  },
  'touch.runner':(c)=>{
    const s=c.reg.session,now=c.inp.now;
    if(s.touchLockUntil!==null&&now<s.touchLockUntil)return null;
    if(s.touches.filter(t=>t<=now&&now-t<c.cfg.touchWindowMs).length>=c.cfg.touchMaxReactions)return null;
    const gesture=c.cfg.touchLadder[touchChain(now,s.touches,c.cfg)];
    return gesture?{vars:{},gesture}:null;
  }
};

function build(def,entry,hit,c){
  const copy=Array.isArray(entry.copy)?entry.copy:[],f=c.inp.facts,now=c.inp.now,user=def.kind==='user';
  let text=null,index=null,counted=false;
  if(copy.length){
    const used=c.reg.textDay.date===f.date?c.reg.textDay.n:0;
    const allowed=user||(used<c.p.textBudgetPerDay&&elapsed(now,c.reg.lastTextAt)>=c.cfg.textGapMs);
    const seed=String(f.date||'')+'|'+(hit.key||'')+'|'+c.p.id;
    const pick=allowed?pickText(def,copy,hit.vars,c.reg,seed,now,c.cfg,user):null;
    if(pick){text=pick.text;index=pick.index;counted=!user}
    else if(!def.stateOnlyOk)return null;
  }
  let gesture=hit.gesture||(entry.gesture!==undefined?entry.gesture:def.gesture),look=gesture?def.look:null;
  if(def.kind==='ambient'&&gesture&&elapsed(now,c.reg.session.lastGestureAt)<c.cfg.gestureGapMs){gesture=null;look=null}
  if(!text&&!gesture&&def.state==='neutral')return null;
  return{id:def.id,kind:def.kind,weight:def.weight,surface:c.inp.surface,personality:c.p.id,state:def.state,gesture:gesture||null,
    gestureMs:gesture?def.gestureMs:0,look:look||null,text,messageMs:text||def.state!=='neutral'?c.cfg.messageMs:0,silent:true,
    meta:{variantIndex:index,key:hit.key||null,textCounted:counted,absorbs:def.absorbs?def.absorbs.slice():[]}};
}

/* decide : fonction pure de (entrée, registre, options). Renvoie le descripteur gelé de l'unique réaction
   gagnante, ou null. Ne modifie jamais ses arguments, ne lit aucune horloge, n'écrit nulle part :
   c'est `record`, appelé par l'hôte après affichage, qui produit le registre suivant. */
function decide(input,registry,options){
  try{
    const o=resolveOptions(options),inp=normalizeInput(input,o.cfg);
    if(!inp||blocked(inp))return null;
    const reg=normalizeRegistry(registry,{now:inp.now,date:inp.facts.date},o,true);
    const p=o.personalities[reg.personality],c={inp,reg,p,cfg:o.cfg};
    let best=null;
    for(const def of REACTIONS){
      if(def.surfaces.indexOf(inp.surface)===-1||def.triggers.indexOf(inp.trigger)===-1||!has(p.reactions,def.id))continue;
      if(def.kind==='ambient'&&(!inp.facts.date||elapsed(inp.now,reg.session.lastReaction[inp.surface])<o.cfg.arrivalGuardMs))continue;
      const hit=RULES[def.id](c);
      if(!hit)continue;
      const built=build(def,p.reactions[def.id],hit,c);
      if(built&&(!best||built.weight>best.weight))best=built;
    }
    return best?deepFreeze(best):null;
  }catch(e){return null}
}

/* record : à appeler par l'hôte quand la réaction est réellement montrée. Renvoie { registry, dirty } :
   `dirty` vaut true seulement si la partie persistée a changé (le toucher et le retour n'écrivent rien). */
function record(registry,reaction,input,options){
  const o=resolveOptions(options),cfg=o.cfg,i=isObj(input)?input:{},now=num(i.now),date=isoDate(i.date);
  const reg=normalizeRegistry(registry,{now,date},o,true),def=isObj(reaction)?reactionById(reaction.id):null;
  if(!def||now===null||(def.kind==='ambient'&&!date))return{registry:reg,dirty:false};
  const meta=isObj(reaction.meta)?reaction.meta:{},next=JSON.parse(JSON.stringify(reg));
  let dirty=false;
  if(def.kind==='ambient'){
    const key=validKey(meta.key)?meta.key:def.id;
    next.shown[key]={d:date,t:now};
    for(const a of def.absorbs||[])next.shown[a]={d:date,t:now};
    next.session.lastReaction[typeof reaction.surface==='string'&&SURFACES.indexOf(reaction.surface)!==-1?reaction.surface:'home']=now;
    if(reaction.gesture)next.session.lastGestureAt=now;
    dirty=true;
  }
  if(typeof reaction.text==='string'&&reaction.text){
    if(meta.textCounted===true){next.textDay={date,n:(reg.textDay.date===date?reg.textDay.n:0)+1};next.lastTextAt=now;dirty=true}
    const vi=int(meta.variantIndex,0,99);
    if(vi!==null){next.variant[def.id]={i:vi,t:now};dirty=true}
  }
  if(def.id==='welcome.back'){next.welcome=null;next.lastActiveDate=date;next.lastActiveAt=now;dirty=true}
  if(def.id==='touch.runner'){
    next.session.touches=recent(next.session.touches.concat(now),now,cfg.touchWindowMs);
    if(next.session.touches.length>=cfg.touchMaxReactions)next.session.touchLockUntil=now+cfg.touchLockoutMs;
  }
  if(def.id==='home.return')next.session.returns=recent(next.session.returns.concat(now),now,cfg.returnBurstWindowMs);
  if(def.id==='personality.changed')next.session.lastPreviewAt=now;
  return{registry:normalizeRegistry(next,{now,date},o,true),dirty};
}

/* touch : « l'utilisateur est actif aujourd'hui ». À appeler par chaque hôte à son affichage ; renvoie
   dirty=false tant qu'il n'y a rien à écrire (même jour, écriture récente, pas de nouveau retour). */
function touch(registry,input,options){
  const o=resolveOptions(options),i=isObj(input)?input:{},now=num(i.now),date=isoDate(i.date);
  const reg=normalizeRegistry(registry,{now,date},o,true);
  if(now===null||!date)return{registry:reg,dirty:false};
  let welcome=reg.welcome;
  if(reg.lastActiveDate&&!(welcome&&welcome.date===date)){
    const gap=daysBetween(reg.lastActiveDate,date);
    if(gap>=o.cfg.absenceDays)welcome={date,days:gap};
  }
  if(reg.lastActiveDate===date&&elapsed(now,reg.lastActiveAt)<o.cfg.activeWriteGapMs&&welcome===reg.welcome)return{registry:reg,dirty:false};
  return{registry:deepFreeze(Object.assign({},reg,{lastActiveDate:date,lastActiveAt:now,welcome})),dirty:true};
}

function setPersonality(registry,id,options){
  const o=resolveOptions(options),reg=normalizeRegistry(registry,null,o,true);
  if(typeof id!=='string'||!has(o.personalities,id)||reg.personality===id)return{registry:reg,dirty:false};
  return{registry:deepFreeze(Object.assign({},reg,{personality:id})),dirty:true};
}
/* Titre d'un état métier (analyzing, alert, success) pour une surface hôte ; null si non défini. */
function title(personalityId,surface,state,options){
  const o=resolveOptions(options),p=typeof personalityId==='string'&&has(o.personalities,personalityId)?o.personalities[personalityId]:o.personalities[DEFAULT_PERSONALITY];
  const t=p&&isObj(p.titles)&&has(p.titles,surface)&&isObj(p.titles[surface])?p.titles[surface][state]:null;
  return typeof t==='string'&&t?t:null;
}
function listPersonalities(options){
  const o=resolveOptions(options);
  return Object.freeze(Object.keys(o.personalities).map(id=>{const p=o.personalities[id];return Object.freeze({id:p.id,label:p.label,blurb:p.blurb,tone:p.tone,proactivity:p.proactivity,textBudgetPerDay:p.textBudgetPerDay,idle:p.idle})}));
}

return{
  VERSION,STORAGE_KEY,DEFAULT_PERSONALITY,STATES,SURFACES,TRIGGERS,GESTURES,ATTENTION_KINDS,
  CONFIG,PERSONALITIES,REACTIONS,
  defaultRegistry,normalizeRegistry:(raw,ctx,options)=>{try{return normalizeRegistry(raw,ctx,resolveOptions(options),true)}catch(e){return defaultRegistry()}},
  serializeRegistry,parseRegistry,loadRegistry,saveRegistry,
  decide,record,touch,setPersonality,title,listPersonalities
};
});
