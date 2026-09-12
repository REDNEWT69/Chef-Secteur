const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let source=fs.readFileSync(__dirname+'/../period-day-slider.js','utf8');
assert.doesNotMatch(source,/localStorage\.getItem/,'le slider ne doit plus contourner le stockage actif de Store Runner');
assert.match(source,/window\.__chefStorage\|\|window\.localStorage/,'le slider doit utiliser __chefStorage avant localStorage');
assert.doesNotMatch(source,/scheduleBoot|\[0,80,220,500,1000,1800\]/,'les retries temporisés de boot doivent rester supprimés');
assert.doesNotMatch(source,/addEventListener\(['"](?:load|focus)['"]/,'le slider ne doit plus se réveiller sur load/focus');
assert.doesNotMatch(source,/visibilitychange/,'le slider ne doit plus se réveiller à chaque retour de visibilité');
assert.match(source,/new MutationObserver/,'un rattrapage ciblé doit rester disponible si le rendu historique remplace les onglets');
assert.match(source,/tabObserver\.observe\(box,\{childList:true\}\)/,'l’observer doit rester limité à #dayTabs');
assert.match(source,/store-runner:data-restored/,'une restauration de données doit rafraîchir la période');
assert.match(source,/addEventListener\('touchmove',[\s\S]*?\{passive:false\}\)/,'Android doit avoir un drag horizontal tactile non-passif explicite');
assert.match(source,/box\.scrollLeft=startScroll-dx/,'le drag tactile doit déplacer réellement le bandeau des jours');
assert.match(source,/Math\.abs\(dx\)>=42/,'un swipe franc doit déclencher la navigation jour précédent/suivant');
assert.match(source,/navigateAdjacent\(box,dx<0\?1:-1\)/,'le sens du swipe doit choisir le jour adjacent');
assert.match(source,/touch-action:pan-y!important/,'le bandeau doit réserver le geste horizontal tout en laissant le scroll vertical à la page');
assert.match(source,/suppressClickUntil=Date\.now\(\)\+350/,'le clic fantôme après drag doit être neutralisé');
assert.match(source,/function bindListSwipe\(container\)/,'un swipe doit aussi fonctionner sur toute la liste du planning, pas seulement sur la bande des jours');
assert.match(source,/bindListSwipe\(document\.getElementById\('planPanel'\)\)/,'le swipe de liste doit être activé sur le panneau planning');
assert.match(source,/isInteractiveTarget\(e\.target\)/,'le swipe de liste ne doit pas se déclencher en interagissant avec un bouton ou un lien');
assert.match(source,/Math\.abs\(dx\)>=60/,'le swipe de liste doit exiger un geste franc avant de changer de jour');
assert.match(source,/if\(dragging&&e\.cancelable\)e\.preventDefault\(\)/,'le scroll vertical doit rester libre tant que le geste n’est pas verrouillé horizontal');

// Garde-fous statiques sur la correction de la saccade (#127) : la bande ne doit plus
// jamais être vidée/reconstruite pour le seul changement de jour actif, et le
// recentrage automatique ne doit plus être systématiquement animé.
assert.doesNotMatch(source,/setTimeout\(\(\)=>active\.scrollIntoView/,'le recentrage ne doit plus être différé par un setTimeout arbitraire');
assert.doesNotMatch(source,/behavior:\s*['"]smooth['"]/,'le recentrage automatique sur une mise à jour métier ne doit plus être systématiquement animé');
assert.match(source,/function tabsSignature\(entries\)/,'une signature de structure doit permettre de détecter un vrai changement de période/jours travaillés');
assert.match(source,/function updateActiveTab\(box\)/,'le jour actif doit être mis à jour sur les onglets existants, sans reconstruction');
// La signature seule ne suffit pas : si #dayTabs a été remplacé entretemps par autre
// chose que les onglets slider attendus (le noyau historique reconstruit parfois la
// bande avec ses propres .dayTab, sans .periodDayTab), il faut reconstruire même si
// la signature de période/jours travaillés n'a pas changé.
assert.match(source,/function boxMatchesEntries\(box,entries\)/,'la bande doit vérifier qu’elle contient déjà réellement les onglets slider attendus, pas seulement comparer une signature');
assert.match(source,/signature!==lastTabsSignature\|\|!box\.firstElementChild\|\|!boxMatchesEntries\(box,entries\)/,'la bande ne doit être reconstruite que si la structure affichée a réellement changé OU si #dayTabs ne contient plus les onglets slider attendus');

source=source.replace(/\}\)\(\);\s*$/,'window.__periodTest={loadDate,range,load,renderTabs,getActiveDate:()=>activeDate};})();');

// --- Faux DOM minimal, écrit à la main (pas de jsdom) --------------------------------
// Seulement les primitives réellement utilisées par period-day-slider.js :
// createElement/createDocumentFragment, appendChild, classList, dataset, innerHTML,
// scrollLeft, getBoundingClientRect/scrollIntoView, et un querySelector limité aux
// sélecteurs effectivement employés dans ce fichier (classes, présence d'attribut,
// et un unique niveau de descendance préfixé par un id, ex. "#dayTabs .foo.bar[baz]").
function parseCompound(token){
  const compound={id:null,classes:[],attrs:[]};
  const re=/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g;
  let m;
  while((m=re.exec(token))){
    if(m[1])compound.id=m[1];
    else if(m[2])compound.classes.push(m[2]);
    else if(m[3])compound.attrs.push({name:m[3],value:m[4]!==undefined?m[4]:null});
  }
  return compound;
}
function matchesCompound(el,compound){
  for(const c of compound.classes)if(!el.classList.contains(c))return false;
  for(const a of compound.attrs){
    const val=el.getAttribute(a.name);
    if(a.value!==null){if(val!==a.value)return false}
    else if(val===null)return false;
  }
  return true;
}
function subtreeElements(root){
  const out=[];
  (function walk(node){for(const child of (node.children||[])){out.push(child);walk(child)}})(root);
  return out;
}
function createFakeDom(){
  const registry=new Map();
  function makeFragment(){
    const frag={_isFragment:true,children:[]};
    frag.appendChild=function(child){child.parentNode=frag;frag.children.push(child);return child};
    return frag;
  }
  function makeElement(tag){
    const classes=new Set();
    let id='';
    const el={tagName:String(tag).toUpperCase(),children:[],parentNode:null,dataset:{},style:{},_attrs:{},_listeners:{},_text:'',_html:'',scrollLeft:0,onclick:null,type:''};
    Object.defineProperty(el,'className',{get:()=>Array.from(classes).join(' '),set(v){classes.clear();String(v||'').split(/\s+/).filter(Boolean).forEach(c=>classes.add(c))}});
    Object.defineProperty(el,'innerHTML',{get:()=>el._html,set(v){el._html=v;if(v==='')el.children=[]}});
    Object.defineProperty(el,'textContent',{get:()=>el._text,set(v){el._text=String(v)}});
    Object.defineProperty(el,'firstElementChild',{get:()=>el.children[0]||null});
    Object.defineProperty(el,'id',{get:()=>id,set(v){if(id)registry.delete(id);id=String(v);if(id)registry.set(id,el)}});
    el.classList={add:(...n)=>n.forEach(x=>classes.add(x)),remove:(...n)=>n.forEach(x=>classes.delete(x)),contains:n=>classes.has(n),toggle(n,force){const has=classes.has(n);const next=force===undefined?!has:Boolean(force);if(next)classes.add(n);else classes.delete(n);return next}};
    el.appendChild=function(child){
      if(child&&child._isFragment){for(const c of child.children){c.parentNode=el;el.children.push(c)}child.children=[];return child}
      child.parentNode=el;el.children.push(child);return child;
    };
    el.setAttribute=function(name,value){el._attrs[name]=String(value)};
    el.getAttribute=function(name){
      if(name.indexOf('data-')===0){const key=name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return Object.prototype.hasOwnProperty.call(el.dataset,key)?el.dataset[key]:null}
      return Object.prototype.hasOwnProperty.call(el._attrs,name)?el._attrs[name]:null;
    };
    el.addEventListener=function(type,fn){(el._listeners[type]=el._listeners[type]||[]).push(fn)};
    el.removeEventListener=function(type,fn){const l=el._listeners[type]||[];const i=l.indexOf(fn);if(i!==-1)l.splice(i,1)};
    el.querySelector=function(sel){return runSelector(el,sel)[0]||null};
    el.querySelectorAll=function(sel){return runSelector(el,sel)};
    el.getBoundingClientRect=function(){return el._rect||{left:0,right:0,top:0,bottom:0,width:0,height:0}};
    return el;
  }
  function runSelector(scopeEl,selectorStr){
    const tokens=selectorStr.trim().split(/\s+/);
    const first=parseCompound(tokens[0]);
    let pool,startIdx;
    if(first.id){const resolved=registry.get(first.id);if(!resolved)return[];pool=[resolved];startIdx=1}
    else{pool=subtreeElements(scopeEl);startIdx=0}
    for(let i=startIdx;i<tokens.length;i++){
      const compound=parseCompound(tokens[i]);
      const searchSpace=(i===startIdx&&first.id)?subtreeElements(pool[0]):pool;
      pool=searchSpace.filter(el=>matchesCompound(el,compound));
    }
    return pool;
  }
  const documentListeners={};
  const document={
    createElement:makeElement,
    createDocumentFragment:makeFragment,
    getElementById:id=>registry.get(id)||null,
    head:makeElement('head'),
    readyState:'loading',
    addEventListener(type,fn){(documentListeners[type]=documentListeners[type]||[]).push(fn)},
    removeEventListener(){},
    querySelector(sel){return runSelector(null,sel)[0]||null},
    querySelectorAll(sel){return runSelector(null,sel)},
  };
  return {
    document,
    registry,
    dispatchDocumentEvent(type){(documentListeners[type]||[]).slice().forEach(fn=>fn({}))},
  };
}

// --- Scénario de test --------------------------------------------------------------
const RANGE='chef_sector_range_v1',ARCHIVE='chef_sector_plan_archive_v1';
const localData={
  [RANGE]:JSON.stringify({start:'2026-01-05',end:'2026-01-09',workDays:['Lundi']}),
  [ARCHIVE]:JSON.stringify({})
};
const activeData={
  [RANGE]:JSON.stringify({start:'2026-09-14',end:'2026-09-18',workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']}),
  [ARCHIVE]:JSON.stringify({
    '2026-09-14':{weekMonday:'2026-09-14',plan:{Lundi:[{id:'new',enseigne:'Darty',ville:'Lyon'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}}
  })
};
const makeStorage=data=>({getItem:key=>Object.prototype.hasOwnProperty.call(data,key)?data[key]:null,setItem(key,value){data[key]=String(value)},removeItem(key){delete data[key]}});
const state={settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-07'},stores:[{id:'new',enseigne:'Darty',ville:'Lyon'}],plan:{Lundi:[{id:'old'}],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}};
let scheduled=null;
const weekInput={value:'2026-09-07'};
const dom=createFakeDom();
dom.registry.set('weekDate',weekInput);
const dayTabsBox=dom.document.createElement('div');
dayTabsBox.id='dayTabs';
const ctx={state,console,Date,JSON,Object,Array,String,Number,Math,Map,Set,setTimeout,requestAnimationFrame:fn=>{scheduled=fn},localStorage:makeStorage(localData),__chefStorage:makeStorage(activeData),save(){},selectPlanningDay(){},addEventListener(){},document:dom.document,window:null};
ctx.window=ctx;
vm.runInNewContext(source,ctx);
const T=ctx.__periodTest;
assert(T,'le test doit pouvoir accéder au cœur du slider');
let r=T.range();
assert.equal(r.start.getFullYear(),2026);assert.equal(r.start.getMonth(),8);assert.equal(r.start.getDate(),14,'la période doit venir de __chefStorage et non du localStorage natif');
const beforePlan=JSON.stringify(state.plan),beforeWeek=state.settings.weekDate;
/* Un jour affiché dans la bande doit toujours être sélectionnable : une semaine sans
   planning s'ouvre vide et annoncée, jamais par un échec silencieux. Le plan courant
   ne doit pour autant jamais être réétiqueté sur cette autre semaine. */
assert.equal(T.loadDate(new Date('2026-09-21T12:00:00')),true,'un jour affiché doit rester sélectionnable même sans planning archivé');
assert.equal(state.settings.weekDate,'2026-09-21','la semaine visée doit devenir la semaine affichée');
assert.equal(weekInput.value,'2026-09-21');
assert.equal(JSON.stringify(state.plan),JSON.stringify({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]}),'une semaine sans planning doit s’ouvrir vide, sans hériter du plan courant');
const archived=JSON.parse(activeData[ARCHIVE]);
assert.equal(JSON.stringify(archived[beforeWeek].plan),beforePlan,'la semaine quittée doit être archivée avant le changement, pour ne rien perdre');
assert.match(source,/Semaine du/,'le slider doit annoncer une semaine non générée au lieu d’échouer en silence');
state.plan=JSON.parse(beforePlan);state.settings.weekDate=beforeWeek;weekInput.value=beforeWeek;
assert.equal(T.loadDate(new Date('2026-09-14T12:00:00')),true,'une semaine archivée doit rester navigable');
assert.equal(state.settings.weekDate,'2026-09-14');
assert.equal(weekInput.value,'2026-09-14');
assert.equal(state.plan.Lundi[0].id,'new');
assert.equal(typeof scheduled,'function','le rafraîchissement visuel doit être regroupé au prochain frame');

// --- Comportement de la bande des jours (#127) --------------------------------------
// Ce qui suit exécute réellement renderTabs()/updateActiveTab()/centerIfOffscreen() via
// le faux DOM ci-dessus, et vérifie le contrat, pas une impression visuelle.

scheduled(); // exécute le premier rendu réel, en file depuis le loadDate ci-dessus
const box=dom.document.getElementById('dayTabs');
assert(box,'la bande #dayTabs doit exister');
assert.equal(box.children.length,5,'5 jours travaillés (Lundi à Vendredi) doivent être affichés');
const tab14=box.children[0];
assert.equal(tab14.dataset.date,'2026-09-14');
assert.equal(tab14.classList.contains('active'),true,'le jour actif doit être marqué dès le premier rendu');
box.scrollLeft=304; // position que l'utilisateur vient de donner à la bande

// 1/2/3. changement de jour actif seul (même période, mêmes jours travaillés) :
// aucune reconstruction, la position de défilement est conservée, le jour actif est
// mis à jour sur les onglets existants.
assert.equal(T.loadDate(new Date('2026-09-15T12:00:00')),true);
scheduled();
assert.equal(box.children.length,5,'toujours 5 onglets, pas de doublon ni de perte');
assert.equal(box.children[0],tab14,'l’onglet du 14 doit rester le même nœud DOM, jamais recréé pour un simple changement de jour');
assert.equal(tab14.classList.contains('active'),false,'l’ancien jour actif doit être désactivé sur le nœud existant');
const tab15=box.children[1];
assert.equal(tab15.dataset.date,'2026-09-15');
assert.equal(tab15.classList.contains('active'),true,'le nouveau jour actif doit être marqué sur le nœud existant');
assert.equal(box.scrollLeft,304,'changer de jour ne doit jamais réinitialiser le défilement horizontal de la bande');

// 2 bis. même si un second rendu est déclenché pour ce même changement de jour (par
// exemple par un second événement métier), aucune deuxième reconstruction structurelle
// ne doit se produire : les nœuds restent rigoureusement les mêmes.
const afterFirstRender=box.children.slice();
assert.equal(T.renderTabs(),true);
box.children.forEach((c,i)=>assert.equal(c,afterFirstRender[i],'un second rendu pour le même jour ne doit reconstruire aucun nœud'));

// 4. un événement 'store-runner:planning-updated' sans changement structurel (émis par
// n'importe quel autre module métier, pas seulement par un changement de jour) ne doit
// jamais recréer les onglets.
const beforeDispatch=box.children.slice();
dom.dispatchDocumentEvent('store-runner:planning-updated');
assert.equal(typeof scheduled,'function');
scheduled();
assert.equal(box.children.length,beforeDispatch.length);
box.children.forEach((c,i)=>assert.equal(c,beforeDispatch[i],'un update métier sans changement structurel ne doit pas recréer les onglets'));

// 5. recentrage uniquement si l'onglet actif est réellement hors de vue, et jamais animé.
// Cas déjà couvert ci-dessus : le changement de jour vers le 15 (onglet visible par
// défaut, rects à zéro) n'a déclenché aucun scrollIntoView - sinon box.scrollLeft
// n'aurait plus été 304. On vérifie maintenant le cas explicitement hors de vue :
box._rect={left:0,right:200,top:0,bottom:0,width:200,height:0};
const tab18=box.children[4];
assert.equal(tab18.dataset.date,'2026-09-18');
tab18._rect={left:500,right:600,top:0,bottom:0,width:100,height:0};
const scrollCalls=[];
tab18.scrollIntoView=function(opts){scrollCalls.push(opts)};
assert.equal(T.loadDate(new Date('2026-09-18T12:00:00')),true);
scheduled();
assert.equal(scrollCalls.length,1,'un onglet réellement hors de vue doit être recentré');
assert.notEqual(scrollCalls[0]&&scrollCalls[0].behavior,'smooth','le recentrage sur une mise à jour métier ne doit jamais être animé');

// changement structurel réel (période/jours travaillés différents) : la reconstruction
// complète reste légitime et doit se produire.
activeData[RANGE]=JSON.stringify({start:'2026-09-14',end:'2026-09-16',workDays:['Lundi','Mardi','Mercredi']});
assert.equal(T.renderTabs(),true);
assert.equal(box.children.length,3,'un changement réel de période/jours travaillés doit reconstruire la bande');
assert.notEqual(box.children[0],tab14,'les anciens nœuds doivent être remplacés quand la structure affichée change réellement');

// --- Régression : le noyau historique remplace #dayTabs par ses propres onglets ------
// (bug signalé sur la PR #128) : la signature de période/jours travaillés seule ne
// suffit pas à décider qu'il n'y a rien à faire - il faut aussi que la bande contienne
// déjà réellement les .periodDayTab attendus.
// 1. onglets slider rendus normalement (état hérité de l'étape précédente : 3 jours,
//    Lundi 14 à Mercredi 16 septembre 2026).
assert.equal(box.children.length,3);
assert(box.children.every(el=>el.classList.contains('periodDayTab')));

// 2. le noyau historique remplace le contenu de #dayTabs par ses propres onglets
//    (classe .dayTab historique, jamais .periodDayTab).
box.innerHTML='';
const foreignMon=dom.document.createElement('button');foreignMon.className='dayTab';foreignMon.textContent='Lun';
const foreignTue=dom.document.createElement('button');foreignTue.className='dayTab';foreignTue.textContent='Mar';
box.appendChild(foreignMon);box.appendChild(foreignTue);
assert.equal(box.querySelectorAll('.periodDayTab').length,0,'la bande doit être passée sous le contrôle d’onglets étrangers');

// 3. un nouveau rendu est déclenché (le même événement métier qu’en toute circonstance).
assert.equal(T.renderTabs(),true);

// 4/5. les .periodDayTab doivent être recréés, en nombre et data-date conformes à la
// période attendue - même si la signature de période/jours travaillés n'a pas changé.
const rebuiltTabs=box.querySelectorAll('.periodDayTab[data-date]');
assert.equal(rebuiltTabs.length,3,'les onglets slider doivent être recréés après un remplacement par des nœuds étrangers');
assert.deepEqual(rebuiltTabs.map(el=>el.dataset.date),['2026-09-14','2026-09-15','2026-09-16'],'les onglets recréés doivent correspondre exactement à la période affichée');
assert.equal(box.children.includes(foreignMon),false,'les nœuds étrangers ne doivent plus faire partie de la bande après reconstruction');

// 6. un rendu normal ultérieur, sans changement structurel, ne doit toujours pas
// reconstruire la bande et doit conserver scrollLeft.
box.scrollLeft=77;
const afterForeignRebuild=box.children.slice();
assert.equal(T.renderTabs(),true);
box.children.forEach((c,i)=>assert.equal(c,afterForeignRebuild[i],'un rendu normal après reconstruction ne doit plus recréer les onglets'));
assert.equal(box.scrollLeft,77,'la position de défilement doit rester intacte une fois la bande légitime restaurée');

// 10. aucun doublon de listener après plusieurs updates/renders : la bande #dayTabs
// elle-même n'est jamais recréée, bindTouchSwipe reste donc lié une seule fois.
assert.equal(box._listeners.touchstart.length,1,'bindTouchSwipe ne doit jamais être réappliqué en double sur la bande');
assert.equal(box._listeners.touchmove.length,1);
assert.equal(box._listeners.touchend.length,1);

console.log('PASS: le slider de période utilise le stockage actif, ouvre une semaine non générée sans échec silencieux, gère explicitement le swipe tactile Android, ne reconstruit/recentre plus la bande des jours que lorsque c’est réellement nécessaire, et reconstruit bien ses onglets si le noyau historique a remplacé #dayTabs par d’autres nœuds.');
