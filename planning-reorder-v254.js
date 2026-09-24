/* Store Runner V254.3 — réordonner une journée au doigt (issue #426).

   Geste : un appui long d'environ 350 ms, doigt immobile, directement sur une carte
   magasin (hors boutons et liens) soulève cette carte. Elle suit alors le doigt
   verticalement et les autres cartes se décalent pour montrer où elle sera posée.
   Relâcher enregistre le nouvel ordre ; heures, trajets et kilomètres de la journée sont
   ceux du rendu habituel, recalculés sur ce nouvel ordre, sans changer ses magasins.

   Défilement : tant que l'appui long n'est pas reconnu, ce module n'empêche rien. Un
   glissement ordinaire reste un défilement natif, ne soulève jamais une carte et annule
   l'appui en cours. Aucun retour visuel avant l'activation, aucune poignée ajoutée.

   Propriété : ce module ne possède que le geste et son retour visuel. Les règles et
   l'écriture appartiennent à planning-manual-visits.js (StoreRunnerManualPlanning :
   reorderStore, undoEdit). Aucun setInterval, aucun observer : les écouteurs globaux
   n'existent que pendant un glissement actif. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.document){root.StoreRunnerPlanningReorder=api;api.install(root)}
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
/* ~350 ms : assez long pour qu'un doigt posé en lisant ne soulève rien, et reconnu avant
   la sélection de texte et le menu contextuel des systèmes (~500 ms). */
const LONG_PRESS_MS=350;
/* Un doigt « immobile » bouge encore de quelques pixels. Au-delà de 8 px, c'est un
   défilement ou un balayage : l'appui est abandonné. 8 px reste sous le seuil (9-10 px)
   des balayages horizontaux existants, qui ne peuvent donc jamais démarrer en même temps. */
const TOUCH_SLOP=8;
const MOUSE_SLOP=6;
const EDGE_ZONE=72;
const MAX_SCROLL_STEP=16;
const CLICK_GUARD_MS=450;
const SETTLE_MS=170;
const SNACK_MS=6500;
const WARNING_SNACK_MS=11000;
const STYLE_ID='planning-reorder-css';
/* Le bloc « Arrivée » (éditeur d'horaires) et la flèche restent des boutons : un appui
   long n'y soulève rien. */
const INTERACTIVE='button,a,input,select,textarea,label,[role="button"],.tlChevron';

let win=null,doc=null,installed=false,boundWeek=null;
let pending=null,drag=null,busy=false,clickGuardUntil=0,snack=null,snackTimer=0;

/* ---------- fonctions pures (testées sans navigateur) ---------- */
function pad(n){return String(n).padStart(2,'0')}
function clock(m){if(m==null||m===''||!Number.isFinite(Number(m)))return'';m=Math.round(Number(m));return pad(Math.floor((((m%1440)+1440)%1440)/60))+':'+pad(((m%60)+60)%60)}
function iso(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function todayISO(){return iso(new Date())}
/* Le magasin et le jour se lisent dans le onclick écrit par renderWeek : c'est la seule
   source qui ne peut pas diverger de la ligne affichée (même règle que timeline-end-times.js). */
function rowInfoFromAttr(attr){const m=String(attr||'').match(/openStoreQuick\('([^']*)','([^']*)'/);if(!m||!m[1]||!DAYS.includes(m[2]))return null;return{id:m[1],day:m[2]}}
/* Place d'arrivée = nombre d'autres visites dont le centre d'origine est au-dessus du
   centre de la carte soulevée. Les positions d'origine évitent tout va-et-vient. */
function dropIndex(centers,y){let k=0;for(const c of centers||[])if(Number(c)<y)k++;return k}
function ordinal(index,total){if(index<=0)return'1re visite';if(total>1&&index>=total-1)return'dernière visite';return (index+1)+'e visite'}
/* Éléments de la timeline qui se décalent pour la place `target` : ceux compris entre la
   place d'origine et la place d'arrivée, d'une hauteur de carte vers le bas si la visite
   monte, vers le haut si elle descend. `positions` : index, dans le flux de la timeline,
   des autres visites (dans l'ordre) ; `dragged` : index de la carte soulevée. */
function shiftRange(positions,dragged,sourceIndex,target){
  if(target===sourceIndex||!positions||!positions.length)return null;
  if(target<sourceIndex)return{from:positions[target],to:dragged-1,dir:1};
  return{from:dragged+1,to:positions[target-1],dir:-1};
}
/* Décalage final de la carte posée, dans la mise en page d'origine. */
function settleOffset(top,height,others,sourceIndex,target){
  if(target===sourceIndex||!others||!others.length)return 0;
  if(target<sourceIndex)return others[target].top-top;
  return others[target-1].bottom-height-top;
}
/* Vitesse de défilement automatique près des bords : nulle au centre, croissante vers le
   bord, maximale au-delà (en-tête collant en haut, barre de navigation en bas). */
function edgeSpeed(y,top,bottom,zone,max){
  if(!(bottom>top)||!Number.isFinite(y))return 0;
  const z=Math.max(1,Math.min(zone,(bottom-top)/3));
  if(y<top+z){const k=Math.min(1,(top+z-y)/z);return -Math.max(1,Math.round(max*k*k))}
  if(y>bottom-z){const k=Math.min(1,(y-(bottom-z))/z);return Math.max(1,Math.round(max*k*k))}
  return 0;
}

/* ---------- lecture du runtime ---------- */
function appState(){return win&&win.state}
function manual(){const api=win&&win.StoreRunnerManualPlanning;return api&&typeof api.reorderStore==='function'?api:null}
function weekEl(){return doc&&doc.getElementById('week')}
function storeRows(){const w=weekEl();return w?Array.from(w.querySelectorAll('.timelineRow:not(.calendarEvent)')):[]}
function storeById(id){return ((appState()&&appState().stores)||[]).find(s=>String(s&&s.id)===String(id))||null}
function label(store){return ((store&&store.enseigne)||'Magasin')+(store&&store.ville?' '+store.ville:'')}
function rowOf(target){
  const row=target&&target.closest?target.closest('.timelineRow'):null;
  if(!row||row.classList.contains('calendarEvent'))return null;
  const w=weekEl();return w&&w.contains(row)?row:null;
}
function rowInfo(row){const main=row&&row.querySelector?row.querySelector('.tlMain[onclick]'):null;return main?rowInfoFromAttr(main.getAttribute('onclick')):null}
function dayDate(day){try{const api=manual();return api&&typeof api.weekDayDate==='function'?api.weekDayDate(appState(),day):''}catch(e){return''}}
function rowTarget(row){
  if(busy||drag||!row||!manual())return null;
  const info=rowInfo(row),s=appState();if(!info||!s)return null;
  const date=dayDate(info.day);if(!date)return null;
  if(!((s.plan&&s.plan[info.day])||[]).some(x=>String(x&&x.id)===info.id))return null;
  return Object.assign(info,{date,past:date<todayISO()});
}
/* Seule une journée à venir (aujourd'hui compris) se réorganise : le passé reste tel quel. */
function canStartOn(row){const target=rowTarget(row);return target&&!target.past?target:null}
/* L'écran doit refléter exactement la journée enregistrée, sinon on ne soulève rien. */
function dragContext(row,info){
  if(!row||!row.isConnected)return null;
  const rows=storeRows(),ids=[];
  for(const r of rows){const i=rowInfo(r);if(!i||i.day!==info.day)return null;ids.push(i.id)}
  const saved=(((appState()||{}).plan||{})[info.day]||[]).map(s=>String(s&&s.id));
  if(ids.length!==saved.length||ids.some((id,i)=>id!==saved[i]))return null;
  const sourceIndex=rows.indexOf(row);if(sourceIndex<0)return null;
  return{row,rows,ids,id:info.id,day:info.day,date:info.date,sourceIndex};
}
function scheduleOf(day){
  try{
    const api=win.StoreOpeningHoursV1,s=appState(),list=s&&s.plan&&s.plan[day];
    return api&&typeof api.scheduleRoute==='function'&&list&&list.length?api.scheduleRoute(list,day,s):null;
  }catch(e){return null}
}
function findTouch(list,id){if(!list)return null;for(let i=0;i<list.length;i++)if(list[i].identifier===id)return list[i];return null}
function vibrate(ms){try{if(win.navigator&&typeof win.navigator.vibrate==='function')win.navigator.vibrate(ms)}catch(e){}}
/* L'en-tête collant (.top) et la barre de navigation fixe couvrent les bords de l'écran :
   le défilement automatique se déclenche là où la liste est réellement visible. */
function topInset(){
  try{
    const el=doc.querySelector('.top');if(!el)return 0;
    const position=win.getComputedStyle(el).position;if(position!=='sticky'&&position!=='fixed')return 0;
    const r=el.getBoundingClientRect();
    return r.top<=1&&r.bottom>0&&r.bottom<(win.innerHeight||0)/3?Math.round(r.bottom):0;
  }catch(e){return 0}
}
function bottomInset(){
  const vh=win.innerHeight||0;
  try{
    const nav=doc.getElementById('bottomAppNav');if(!nav)return vh;
    const cs=win.getComputedStyle(nav);if(cs.position!=='fixed'||cs.display==='none'||cs.visibility==='hidden')return vh;
    const r=nav.getBoundingClientRect();
    return r.height>0&&r.top>vh*2/3&&r.top<vh?Math.round(r.top):vh;
  }catch(e){return vh}
}

/* ---------- appui en attente ---------- */
function onTouchStart(e){
  if(pending)cancelPending();
  if(!e.touches||e.touches.length!==1)return;
  if(e.target&&e.target.closest&&e.target.closest(INTERACTIVE))return;
  const row=rowOf(e.target),info=rowTarget(row);if(!info)return;
  const t=e.touches[0];
  pending={kind:'touch',row,info,x:t.clientX,y:t.clientY,lastX:t.clientX,lastY:t.clientY,touchId:t.identifier};
  pending.timer=win.setTimeout(activatePending,LONG_PRESS_MS);
  win.addEventListener('scroll',onPendingScroll,{passive:true,capture:true});
}
/* Écouteur non passif volontaire : il garantit que la zone du planning reçoit des
   touchmove annulables (iOS classe la zone au premier contact). Il n'empêche jamais
   rien pendant l'attente : bouger de plus de TOUCH_SLOP rend simplement la main. */
function onWeekTouchMove(e){
  const p=pending;if(!p||p.kind!=='touch')return;
  const t=findTouch(e.touches,p.touchId);if(!t){cancelPending();return}
  p.lastX=t.clientX;p.lastY=t.clientY;
  if(Math.hypot(t.clientX-p.x,t.clientY-p.y)>TOUCH_SLOP)cancelPending();
}
function onWeekTouchEnd(){if(pending)cancelPending()}
function onPendingScroll(){if(pending)cancelPending()}
function onMouseDown(e){
  if(e.button!==0)return;
  /* Événement souris de compatibilité après un toucher : le toucher a déjà son geste. */
  if(e.sourceCapabilities&&e.sourceCapabilities.firesTouchEvents)return;
  if(pending)cancelPending();
  if(e.target&&e.target.closest&&e.target.closest(INTERACTIVE))return;
  const row=rowOf(e.target),info=canStartOn(row);if(!info)return;
  pending={kind:'mouse',row,info,x:e.clientX,y:e.clientY};
  doc.addEventListener('mousemove',onPendingMouseMove,true);
  doc.addEventListener('mouseup',onPendingMouseUp,true);
}
function onPendingMouseMove(e){
  const p=pending;if(!p||p.kind!=='mouse')return;
  if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<=MOUSE_SLOP)return;
  cancelPending();
  const info=canStartOn(p.row),ctx=info&&dragContext(p.row,info);
  if(!ctx)return;
  e.preventDefault();startDrag(ctx,p.x,p.y,'mouse',null);
  if(drag){drag.x=e.clientX;drag.y=e.clientY;drag.dirty=true}
}
function onPendingMouseUp(){if(pending&&pending.kind==='mouse')cancelPending()}
function onContextMenu(e){if(pending||drag)e.preventDefault()}
function cancelPending(){
  const p=pending;pending=null;if(!p)return;
  win.clearTimeout(p.timer);
  win.removeEventListener('scroll',onPendingScroll,{capture:true});
  if(p.kind==='mouse'){doc.removeEventListener('mousemove',onPendingMouseMove,true);doc.removeEventListener('mouseup',onPendingMouseUp,true)}
}
function activatePending(){
  const p=pending;if(!p||p.kind!=='touch')return;
  cancelPending();
  /* Un appui long sur une journée passée dit pourquoi rien ne se soulève. */
  if(p.info.past){showSnack({text:'Une journée passée ne se réorganise plus.'});return}
  const info=canStartOn(p.row),ctx=info&&dragContext(p.row,info);
  if(ctx)startDrag(ctx,p.lastX,p.lastY,'touch',p.touchId);
}

/* ---------- carte soulevée ---------- */
function startDrag(ctx,x,y,kind,touchId){
  hideSnack();
  const week=weekEl(),flow=Array.from(week.children),scroll=win.scrollY||0,rect=ctx.row.getBoundingClientRect();
  const others=ctx.rows.filter(r=>r!==ctx.row);
  const otherRects=others.map(r=>{const b=r.getBoundingClientRect();return{top:b.top+scroll,bottom:b.bottom+scroll,center:(b.top+b.bottom)/2+scroll}});
  const gap=parseFloat(win.getComputedStyle(ctx.row).marginBottom)||14;
  drag=Object.assign(ctx,{kind,touchId,x,y,startY:y,startScroll:scroll,week,flow,others,otherRects,
    positions:others.map(r=>flow.indexOf(r)),draggedPos:flow.indexOf(ctx.row),top:rect.top+scroll,height:rect.height,slot:rect.height+gap,
    target:ctx.sourceIndex,shifted:new Map(),raf:0,dirty:true,topEdge:topInset(),bottomEdge:bottomInset()});
  week.classList.add('srReorderActive');ctx.row.classList.add('srReorderLifted');
  doc.documentElement.classList.add('srReorderDragging');
  addDragListeners(kind);
  vibrate(12);
  render();
  if(drag)drag.raf=win.requestAnimationFrame(frame);
}
function applyShift(d){
  const range=shiftRange(d.positions,d.draggedPos,d.sourceIndex,d.target),wanted=new Map();
  if(range)for(let p=range.from;p<=range.to;p++){const el=d.flow[p];if(el&&el!==d.row)wanted.set(el,range.dir*d.slot)}
  for(const el of d.flow){
    if(el===d.row)continue;
    const offset=wanted.get(el)||0;if((d.shifted.get(el)||0)===offset)continue;
    el.style.transform=offset?'translate3d(0,'+Math.round(offset)+'px,0)':'';d.shifted.set(el,offset);
  }
}
function place(d){
  const dy=(d.y-d.startY)+((win.scrollY||0)-d.startScroll);
  const target=dropIndex(d.otherRects.map(r=>r.center),d.top+dy+d.height/2);
  if(target!==d.target){d.target=target;applyShift(d)}
  return dy;
}
function render(){
  const d=drag;if(!d)return;
  if(!d.row.isConnected){cancelDrag();return}
  const dy=place(d);
  d.row.style.transform='translate3d(0,'+Math.round(dy)+'px,0) scale(1.02)';
}
function frame(){
  const d=drag;if(!d)return;
  d.raf=win.requestAnimationFrame(frame);
  const speed=edgeSpeed(d.y,d.topEdge,d.bottomEdge,EDGE_ZONE,MAX_SCROLL_STEP);
  if(speed){const before=win.scrollY;win.scrollBy(0,speed);if(win.scrollY!==before)d.dirty=true}
  if(d.dirty){d.dirty=false;render()}
}
function onDragTouchMove(e){
  const d=drag;if(!d||d.kind!=='touch')return;
  /* Un touchmove non annulable signifie que le navigateur défile déjà : on repose la
     carte proprement plutôt que de lutter contre lui. */
  if(!e.cancelable){cancelDrag();return}
  e.preventDefault();e.stopPropagation();
  const t=findTouch(e.touches,d.touchId);if(!t)return;
  d.x=t.clientX;d.y=t.clientY;d.dirty=true;
}
function onDragTouchEnd(e){
  const d=drag;if(!d||d.kind!=='touch')return;
  if(findTouch(e.touches,d.touchId))return;
  /* Pas de clic fantôme sur la fiche magasin après un dépôt. */
  if(e.cancelable)e.preventDefault();
  const t=findTouch(e.changedTouches,d.touchId);
  if(t){d.x=t.clientX;d.y=t.clientY}
  drop();
}
function onDragTouchCancel(){if(drag&&drag.kind==='touch')cancelDrag()}
function onDragMouseMove(e){const d=drag;if(!d||d.kind!=='mouse')return;e.preventDefault();d.x=e.clientX;d.y=e.clientY;d.dirty=true}
function onDragMouseUp(e){const d=drag;if(!d||d.kind!=='mouse')return;d.x=e.clientX;d.y=e.clientY;drop()}
function onDragKey(e){if(drag&&e.key==='Escape'){e.preventDefault();cancelDrag()}}
function onDragScroll(){if(drag)drag.dirty=true}
function preventDuringDrag(e){if(drag)e.preventDefault()}
const TOUCH_OPTIONS={capture:true,passive:false};
function addDragListeners(kind){
  if(kind==='touch'){
    win.addEventListener('touchmove',onDragTouchMove,TOUCH_OPTIONS);
    win.addEventListener('touchend',onDragTouchEnd,TOUCH_OPTIONS);
    win.addEventListener('touchcancel',onDragTouchCancel,true);
  }else{
    win.addEventListener('mousemove',onDragMouseMove,true);
    win.addEventListener('mouseup',onDragMouseUp,true);
  }
  win.addEventListener('keydown',onDragKey,true);
  win.addEventListener('scroll',onDragScroll,{passive:true,capture:true});
  doc.addEventListener('contextmenu',preventDuringDrag,true);
  doc.addEventListener('selectstart',preventDuringDrag,true);
}
function removeDragListeners(){
  win.removeEventListener('touchmove',onDragTouchMove,TOUCH_OPTIONS);
  win.removeEventListener('touchend',onDragTouchEnd,TOUCH_OPTIONS);
  win.removeEventListener('touchcancel',onDragTouchCancel,true);
  win.removeEventListener('mousemove',onDragMouseMove,true);
  win.removeEventListener('mouseup',onDragMouseUp,true);
  win.removeEventListener('keydown',onDragKey,true);
  win.removeEventListener('scroll',onDragScroll,{capture:true});
  doc.removeEventListener('contextmenu',preventDuringDrag,true);
  doc.removeEventListener('selectstart',preventDuringDrag,true);
}
/* Fin du geste : plus d'écouteurs globaux, mais la carte garde sa place visuelle le temps
   d'être posée. */
function release(){
  const d=drag;drag=null;if(!d)return null;
  if(d.raf)win.cancelAnimationFrame(d.raf);
  removeDragListeners();
  doc.documentElement.classList.remove('srReorderDragging');
  clickGuardUntil=Date.now()+CLICK_GUARD_MS;
  return d;
}
/* Tout reprend sa place d'origine, en douceur quand la carte est encore affichée. */
function restore(d,animate){
  if(!d)return;
  const smooth=animate&&d.row.isConnected;
  d.row.classList.remove('srReorderLifted');
  if(smooth)d.row.classList.add('srReorderSettling');
  for(const [el] of d.shifted)el.style.transform='';
  d.shifted.clear();d.row.style.transform='';
  const done=()=>{d.row.classList.remove('srReorderSettling');if(!drag)d.week.classList.remove('srReorderActive')};
  if(smooth)win.setTimeout(done,SETTLE_MS+60);else done();
}
function cancelDrag(){restore(release(),true)}
function drop(){
  const d=release();if(!d)return;
  if(!d.row.isConnected){restore(d,false);return}
  const target=(place(d),d.target);
  if(target===d.sourceIndex){restore(d,true);return}
  /* La carte se pose à sa nouvelle place avant l'écriture : le rendu qui suit affiche
     alors les cartes exactement là où l'œil les attend. */
  busy=true;
  d.row.classList.remove('srReorderLifted');d.row.classList.add('srReorderSettling');
  d.row.style.transform='translate3d(0,'+Math.round(settleOffset(d.top,d.height,d.otherRects,d.sourceIndex,target))+'px,0)';
  win.setTimeout(()=>{commitReorder(d,target)},SETTLE_MS);
}

/* ---------- écriture (déléguée au propriétaire) ---------- */
async function commitReorder(d,index){
  const api=manual();let result;
  busy=true;
  try{result=api?await api.reorderStore(win,d.id,d.day,index,{expected:d.ids}):{ok:false,error:'Réorganisation indisponible.'}}
  catch(e){result={ok:false,error:e&&e.message?e.message:String(e)}}
  finally{busy=false;restore(d,!(result&&result.ok&&!result.unchanged))}
  if(!result||!result.ok){showSnack({text:(result&&result.error)||'Nouvel ordre non enregistré.',tone:'bad'});return result}
  if(result.unchanged)return result;
  const after=scheduleOf(d.day),row=after&&after.rows&&after.rows[result.to],arrival=row&&row.arrival!=null?clock(row.arrival):'';
  showSnack({text:label(storeById(d.id))+' passe en '+ordinal(result.to,d.ids.length)+(arrival?' · arrivée '+arrival:'')+'.',warning:result.warning&&result.warning.reason,undo:result.undo});
  return result;
}
function hideSnack(){if(win)win.clearTimeout(snackTimer);if(snack&&snack.parentNode)snack.parentNode.removeChild(snack);snack=null}
function showSnack(options){
  hideSnack();
  const el=doc.createElement('div');el.className='srReorderSnack'+(options.tone==='bad'?' is-bad':'');
  el.setAttribute('role','status');el.setAttribute('aria-live','polite');
  const text=doc.createElement('span');text.className='srReorderSnackText';text.textContent=options.text;
  /* Ordre infaisable : il est enregistré tel quel, et l'avertissement le dit clairement. */
  if(options.warning){const w=doc.createElement('small');w.className='srReorderWarning';w.textContent='⚠ '+options.warning;text.appendChild(w)}
  el.appendChild(text);
  if(options.undo){
    const b=doc.createElement('button');b.type='button';b.className='srReorderUndo';b.textContent='Annuler';
    b.addEventListener('click',()=>undo(options.undo,b));el.appendChild(b);
  }
  doc.body.appendChild(el);snack=el;
  snackTimer=win.setTimeout(hideSnack,options.warning?WARNING_SNACK_MS:SNACK_MS);
  return el;
}
async function undo(token,button){
  const api=manual();if(!api||busy)return null;
  if(button)button.disabled=true;
  let result;busy=true;
  try{result=await api.undoEdit(win,token)}
  catch(e){result={ok:false,error:e&&e.message?e.message:String(e)}}
  finally{busy=false}
  showSnack(result&&result.ok?{text:'Ordre précédent rétabli.'}:{text:(result&&result.error)||'Annulation impossible.',tone:'bad'});
  return result;
}

/* ---------- installation ---------- */
function onClickCapture(e){
  if(Date.now()>=clickGuardUntil)return;
  const inPlanning=e.target&&e.target.closest&&e.target.closest('#planPanel');
  if(!inPlanning)return;
  e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
}
function ensureCss(){
  if(!doc||doc.getElementById(STYLE_ID))return;
  const s=doc.createElement('style');s.id=STYLE_ID;
  s.textContent=
    /* Pas de sélection de texte ni de menu système sur une carte que l'on peut soulever. */
    '#week .timelineRow:not(.calendarEvent){-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}'+
    '#week.srReorderActive>*{transition:transform .2s ease}'+
    /* Soulevée : la carte suit le doigt, légèrement agrandie, au-dessus des autres. Le fond
       vitré du thème (blanc à 78 % + flou) laisserait lire la carte survolée au travers :
       elle devient opaque, et sans flou d'arrière-plan à recalculer à chaque image. */
    '#week .timelineRow.srReorderLifted,#week .timelineRow.srReorderSettling{position:relative;z-index:30;background:#fff!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'+
    '#week .timelineRow.srReorderLifted{transition:none!important;box-shadow:0 22px 46px rgba(17,24,39,.24),0 3px 10px rgba(17,24,39,.10)!important;will-change:transform}'+
    '#week .timelineRow.srReorderSettling{transition:transform .17s ease!important}'+
    /* Le noyau déclare html{scroll-behavior:smooth} : sans cette exception, chaque pas du
       défilement automatique deviendrait une animation interrompue au pas suivant. */
    'html.srReorderDragging{scroll-behavior:auto!important}'+
    'html.srReorderDragging,html.srReorderDragging body{-webkit-user-select:none;user-select:none;cursor:grabbing}'+
    '.srReorderSnack{position:fixed;z-index:10000;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%);box-sizing:border-box;width:min(520px,calc(100vw - 24px));display:flex;align-items:center;gap:10px;padding:10px 10px 10px 15px;border-radius:18px;background:#111827;color:#fff;box-shadow:0 14px 34px rgba(17,24,39,.28);font-size:13px;font-weight:700;line-height:1.35}'+
    '.srReorderSnack.is-bad{background:#7a1c14}'+
    '.srReorderSnackText{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}'+
    '.srReorderWarning{display:block;margin-top:4px;font-size:12px;font-weight:700;color:#ffd58a}'+
    '.srReorderUndo{flex:0 0 auto;min-height:44px;min-width:44px;padding:0 14px;border:0;border-radius:12px;background:rgba(255,255,255,.14);color:#9cc3ff;font-size:13px;font-weight:800}'+
    '@media(prefers-reduced-motion:reduce){#week.srReorderActive>*,#week .timelineRow.srReorderSettling{transition:none!important}}';
  doc.head.appendChild(s);
}
function bind(){
  const week=weekEl();if(!week||week===boundWeek)return false;
  boundWeek=week;
  week.addEventListener('touchstart',onTouchStart,{passive:true});
  week.addEventListener('touchmove',onWeekTouchMove,{passive:false});
  week.addEventListener('touchend',onWeekTouchEnd,{passive:true});
  week.addEventListener('touchcancel',onWeekTouchEnd,{passive:true});
  week.addEventListener('mousedown',onMouseDown);
  week.addEventListener('contextmenu',onContextMenu);
  return true;
}
function stopAll(){cancelPending();cancelDrag()}
function install(w){
  if(installed||!w||!w.document)return false;
  installed=true;win=w;doc=w.document;
  const boot=()=>{ensureCss();bind()};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  doc.addEventListener('store-runner:planning-updated',bind);
  doc.addEventListener('store-runner:data-restored',()=>{stopAll();hideSnack();bind()});
  doc.addEventListener('click',onClickCapture,true);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stopAll()});
  w.addEventListener('pagehide',stopAll);
  /* Souris relâchée hors de la fenêtre, application passée en arrière-plan : rien ne reste soulevé. */
  w.addEventListener('blur',stopAll);
  w.addEventListener('orientationchange',stopAll);
  return true;
}
function isDragging(){return !!drag}

return{LONG_PRESS_MS,TOUCH_SLOP,MOUSE_SLOP,CLICK_GUARD_MS,INTERACTIVE,rowInfoFromAttr,dropIndex,ordinal,shiftRange,settleOffset,edgeSpeed,clock,install,bind,isDragging,commitReorder,undo};
});
