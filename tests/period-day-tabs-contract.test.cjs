/* Contrat de la bande des jours : qui a le droit d'écrire dans #dayTabs, et à quelles
   conditions.

   La régression corrigée par la PR #128 venait d'un remplacement de nœuds : le rendu
   historique réécrivait #dayTabs avec ses propres .dayTab, la bande de période ne
   reconnaissait plus ses onglets et se reconstruisait. tests/period-day-slider.test.cjs
   verrouille ce couple-là.

   Mais le noyau historique n'est pas le seul module à écrire dans #dayTabs. Quatre
   modules y touchent en même temps sur une vraie page :
     · period-day-slider.js  : construit les onglets, pose la pastille de découché ;
     · ui-polish.js          : pose l'hôtel réservé et le déplacement professionnel ;
     · planning-ui-fixes.js  : pose l'étoile hôtel, et déplace la bande dans le panneau ;
     · workdays-enforcer.js  : masque les jours non travaillés.
   Ce test les fait cohabiter dans un seul DOM et vérifie le comportement observable :
   aucun d'eux ne doit détruire ce qu'un autre vient d'écrire, et aucun ne doit forcer la
   bande à se reconstruire. Une période de trois semaines est utilisée partout, parce que
   c'est là que la position d'un onglet cesse de valoir sa date. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {createFakeDom}=require('./helpers/fake-dom.cjs');

const ROOT=__dirname+'/..';
const RANGE='chef_sector_range_v1',ARCHIVE='chef_sector_plan_archive_v1';
const EMPTY_PLAN=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});

/* La bande ne retient qu'un découché encore à venir : le test se place donc au premier
   jour de la période affichée, sinon son résultat dépendrait du jour où il est joué. */
const TODAY=Date.parse('2026-09-14T09:00:00');
class FrozenDate extends Date{
  constructor(...args){super(...(args.length?args:[TODAY]))}
  static now(){return TODAY}
}

/* Les modules sont des IIFE sans export : on leur ajoute une porte de sortie, comme le
   fait déjà tests/period-day-slider.test.cjs, plutôt que de recopier leurs fonctions. */
function expose(file,exportsLine){
  const src=fs.readFileSync(ROOT+'/'+file,'utf8'),out=src.replace(/\}\)\(\);\s*$/,exportsLine+'})();');
  assert.notEqual(out,src,file+' doit rester une IIFE dans laquelle le test peut exposer ses fonctions');
  return out;
}

function makeWorld(){
  const data={
    /* Trois semaines pleines : 15 onglets, donc trois lundis affichés. */
    [RANGE]:JSON.stringify({start:'2026-09-14',end:'2026-10-02',workDays:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']}),
    [ARCHIVE]:JSON.stringify({'2026-09-14':{weekMonday:'2026-09-14',plan:EMPTY_PLAN()}})
  };
  const storage=d=>({getItem:k=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:null,setItem(k,v){d[k]=String(v)},removeItem(k){delete d[k]}});
  const state={
    profile:{overnightMode:'auto',overnightMinSaving:40},
    settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],weekDate:'2026-09-14',brands:[]},
    stores:[],plan:EMPTY_PLAN(),calendarEvents:[],appointments:[],excluded:{},included:{},locks:{}
  };
  const dom=createFakeDom(),doc=dom.document;
  const plan=doc.createElement('section');plan.className='applePlan';
  const panel=doc.createElement('div');panel.id='planPanel';panel.classList.add('active');panel.appendChild(plan);
  const box=doc.createElement('div');box.id='dayTabs';plan.appendChild(box);
  const timeline=doc.createElement('div');timeline.className='timelineShell';plan.appendChild(timeline);

  const frames=[];
  const ctx={
    state,console,Date:FrozenDate,JSON,Object,Array,String,Number,Math,Map,Set,Intl,RegExp,Boolean,
    setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(fn){frames.push(fn);return frames.length},
    localStorage:storage(data),__chefStorage:storage(data),sessionStorage:storage({}),
    save(){},renderAll(){},renderWeek(){},selectPlanningDay(){},
    addEventListener(){},removeEventListener(){},getComputedStyle:()=>({}),
    MutationObserver:function(){this.observe=()=>{};this.disconnect=()=>{}},
    CustomEvent:function(type,opts){return{type,detail:opts&&opts.detail}},
    document:doc,window:null
  };
  ctx.window=ctx;

  vm.runInNewContext(expose('period-day-slider.js','window.__periodTest={renderTabs,loadDate,syncOvernightVisibility};'),ctx);
  vm.runInNewContext(expose('planning-ui-fixes.js','window.__planningFixTest={restoreHotelStars,reorderPlanning};'),ctx);
  vm.runInNewContext(expose('ui-polish.js','window.__uiPolishTest={markHotelDayTab};'),ctx);
  vm.runInNewContext(expose('workdays-enforcer.js','window.__workdaysTest={filterTabs};'),ctx);

  return {dom,doc,ctx,state,data,box,plan,panel,timeline,frames,
    slider:ctx.__periodTest,planningFix:ctx.__planningFixTest,uiPolish:ctx.__uiPolishTest,workdays:ctx.__workdaysTest,
    tabs:()=>box.children.filter(el=>el.classList.contains('periodDayTab')),
    dates:()=>box.children.map(el=>el.dataset.date)};
}

const world=makeWorld();
const {doc,ctx,state,box,plan,slider,planningFix,uiPolish,workdays}=world;

// --- La bande de départ --------------------------------------------------------------
assert.equal(slider.renderTabs(),true);
assert.equal(world.tabs().length,15,'trois semaines de cinq jours travaillés doivent donner quinze onglets');
assert.deepEqual(world.dates().filter(d=>d.endsWith('-14')||d.endsWith('-21')||d.endsWith('-28')),
  ['2026-09-14','2026-09-21','2026-09-28'],'les trois lundis de la période doivent être affichés');
assert.equal(box.dataset.periodSliderOwner,'1','la bande doit être prise en charge par le slider');
const initialTabs=world.tabs();

// --- 1. Le message « semaine non générée » vit à côté de la bande ---------------------
// Jusqu'ici ce message n'était vérifié que par une recherche de texte dans la source :
// rien ne disait où il s'affichait, ni ce qu'il devenait quand la bande était reconstruite
// ou quand le panneau était réorganisé.
assert.equal(doc.getElementById('periodDayNotice'),null,'aucun message tant qu’aucune semaine vide n’est ouverte');
assert.equal(slider.loadDate(new Date('2026-09-28T12:00:00')),true);
const notice=doc.getElementById('periodDayNotice');
assert(notice,'ouvrir une semaine sans planning doit annoncer la semaine, pas échouer en silence');
assert.match(notice.textContent,/^Semaine du 28 septembre non générée/,'le message doit nommer la semaine réellement ouverte');
assert.equal(notice.hidden,false);
assert.equal(box.nextElementSibling,notice,'le message doit suivre immédiatement la bande qu’il explique');

// Une reconstruction complète de la bande ne doit ni détruire ni dupliquer ce message :
// il est posé à côté de #dayTabs, pas dedans.
assert.equal(slider.renderTabs(),true);
assert.equal(doc.querySelectorAll('#planPanel [role="status"]').length,1,'un seul message, jamais un doublon par rendu');
assert.equal(box.nextElementSibling,notice,'le message doit rester accroché à la bande après un rendu');

// Revenir sur une semaine réellement planifiée vide le message au lieu de le laisser mentir.
assert.equal(slider.loadDate(new Date('2026-09-14T12:00:00')),true);
assert.equal(notice.textContent,'','revenir sur une semaine générée doit effacer l’annonce');
assert.equal(notice.hidden,true,'un message vide ne doit pas occuper la place sous la bande');

// --- 2. La réorganisation du panneau emmène la bande ET son message ------------------
assert.equal(slider.loadDate(new Date('2026-09-21T12:00:00')),true);
assert.match(notice.textContent,/^Semaine du 21 septembre non générée/);
planningFix.reorderPlanning();
assert.equal(box.nextElementSibling,notice,'réorganiser le panneau ne doit pas laisser le message loin de la bande');
const order=plan.children.map(el=>el.id||el.className);
assert.equal(order.indexOf('planningHeroV2')+1,order.indexOf('dayTabs'),'la bande doit rester juste sous l’en-tête du jour');
assert.equal(order.indexOf('dayTabs')+1,order.indexOf('periodDayNotice'),'puis le message de la bande');
assert.equal(order.indexOf('periodDayNotice')+1,order.indexOf('planningToolsV2'),'puis seulement les actions du planning');
assert.equal(box.dataset.periodSliderOwner,'1','un simple déplacement ne doit pas faire perdre la prise en charge');
world.tabs().forEach((tab,i)=>assert.equal(tab,initialTabs[i],'déplacer #dayTabs ne doit recréer aucun onglet'));

// --- 3. L'étoile hôtel se pose sur la date de l'onglet, pas sur sa position ----------
// Sur une période de trois semaines, l'index de l'onglet ne vaut plus le décalage depuis
// le lundi de la semaine affichée : l'étoile atterrissait deux jours à côté.
state.settings.weekDate='2026-09-14';
state.calendarEvents=[{title:'Hôtel Ibis',location:'Ville-Test',date:'2026-09-21',allDay:true}];
planningFix.restoreHotelStars();
assert.deepEqual(box.children.filter(t=>t.querySelector('.hotelStarBadge')).map(t=>t.dataset.date),
  ['2026-09-21'],'l’étoile hôtel doit se poser sur l’onglet qui porte la date de l’événement');

// Idempotence : cette fonction tourne sous l'observateur de #dayTabs (childList + subtree).
// Retirer puis reposer une étoile identique relance un rendu au frame suivant, donc sans
// fin. Deux passages sans changement métier ne doivent produire aucune écriture.
const starTab=box.children.find(t=>t.querySelector('.hotelStarBadge'));
const starNode=starTab.querySelector('.hotelStarBadge');
planningFix.restoreHotelStars();
assert.equal(starTab.querySelector('.hotelStarBadge'),starNode,'un second passage sans changement ne doit pas recréer l’étoile');
assert.equal(starTab.querySelectorAll('.hotelStarBadge').length,1,'jamais deux étoiles sur le même onglet');
world.tabs().forEach((tab,i)=>assert.equal(tab,initialTabs[i],'l’étoile hôtel ne doit jamais remplacer les onglets eux-mêmes'));

// L'événement disparaît : l'étoile aussi, et uniquement elle.
state.calendarEvents=[];
planningFix.restoreHotelStars();
assert.equal(box.querySelectorAll('.hotelStarBadge').length,0,'sans événement hôtel, plus aucune étoile');
assert.equal(world.tabs().length,15,'retirer une étoile ne doit pas toucher aux onglets');

// --- 4. Une seule pastille de découché, sur la date du candidat ----------------------
// ui-polish.js et period-day-slider.js écrivent tous deux la classe .hotelDayBadge sur les
// mêmes onglets. Le slider la pose sur la date de départ du découché ; ui-polish la
// recalculait depuis la semaine affichée, donc la déplaçait d'une semaine dès qu'un autre
// lundi de la période était sélectionné, et lui faisait perdre son libellé accessible.
ctx.overnightCandidate=()=>({night:'Nuit Lundi → Mardi',fromDay:'Lundi',toDay:'Mardi',fromDate:'2026-09-14',toDate:'2026-09-15',
  last:{enseigne:'Darty',ville:'Ville-Test A'},first:{enseigne:'Boulanger',ville:'Ville-Test B'},saving:120});
state.settings.weekDate='2026-09-28'; // l'utilisateur regarde la troisième semaine
assert.equal(slider.renderTabs(),true);
function overnightBadges(){
  return box.children.filter(t=>t.querySelector('.hotelDayBadge')).map(t=>{
    const badge=t.querySelector('.hotelDayBadge');
    return {date:t.dataset.date,text:badge.textContent,label:badge.getAttribute('aria-label'),count:t.querySelectorAll('.hotelDayBadge').length};
  });
}
assert.deepEqual(overnightBadges(),[{date:'2026-09-14',text:'🌙 découché',label:'Découché Lundi → Mardi · 14/09 → 15/09',count:1}],
  'la bande doit poser la lune sur la date de départ du découché');
uiPolish.markHotelDayTab();
assert.deepEqual(overnightBadges(),[{date:'2026-09-14',text:'🌙 découché',label:'Découché Lundi → Mardi · 14/09 → 15/09',count:1}],
  'un passage d’ui-polish ne doit ni déplacer la lune sur la semaine affichée ni lui retirer son libellé accessible');
slider.renderTabs();uiPolish.markHotelDayTab();slider.renderTabs();
assert.deepEqual(overnightBadges(),[{date:'2026-09-14',text:'🌙 découché',label:'Découché Lundi → Mardi · 14/09 → 15/09',count:1}],
  'quel que soit l’ordre des deux modules, il ne doit rester qu’une seule lune, au même endroit');

// Un hôtel réservé sur un autre jour cohabite avec le découché : chacun garde sa pastille,
// et le rendu de la bande ne doit plus effacer celle qu'elle n'a pas écrite.
state.calendarEvents=[{title:'Hôtel Ibis',location:'Ville-Test',date:'2026-09-30',allDay:true}];
state.settings.weekDate='2026-09-28';
uiPolish.markHotelDayTab();
assert.deepEqual(box.children.filter(t=>t.querySelector('.hotelDayBadge')).map(t=>t.dataset.date+' '+t.querySelector('.hotelDayBadge').textContent),
  ['2026-09-14 🌙 découché','2026-09-30 🌙 hôtel'],'la lune du découché et l’hôtel réservé doivent coexister');
assert.equal(slider.renderTabs(),true);
assert.deepEqual(box.children.filter(t=>t.querySelector('.hotelDayBadge')).map(t=>t.dataset.date+' '+t.querySelector('.hotelDayBadge').textContent),
  ['2026-09-14 🌙 découché','2026-09-30 🌙 hôtel'],'un rendu de la bande ne doit pas supprimer la pastille posée par ui-polish');

// Un hôtel réellement réservé le jour même du découché : une seule pastille sur l'onglet,
// et c'est la réservation qui gagne - un découché n'est qu'une suggestion.
state.settings.weekDate='2026-09-14';
state.calendarEvents=[{title:'Hôtel Ibis',location:'Ville-Test',date:'2026-09-14',allDay:true}];
assert.equal(slider.renderTabs(),true);
uiPolish.markHotelDayTab();
assert.deepEqual(box.children.filter(t=>t.querySelector('.hotelDayBadge')).map(t=>t.dataset.date+' '+t.querySelector('.hotelDayBadge').textContent+' x'+t.querySelectorAll('.hotelDayBadge').length),
  ['2026-09-14 🌙 hôtel x1'],'un hôtel réservé le jour du découché doit laisser une seule pastille, la réservation');
state.calendarEvents=[{title:'Hôtel Ibis',location:'Ville-Test',date:'2026-09-30',allDay:true}];
state.settings.weekDate='2026-09-28';
assert.equal(slider.renderTabs(),true);
uiPolish.markHotelDayTab();

// Découché désactivé : la lune disparaît, l'hôtel réservé reste.
state.profile.overnightMode='never';
ctx.overnightCandidate=()=>null;
assert.equal(slider.renderTabs(),true);
uiPolish.markHotelDayTab();
assert.deepEqual(box.children.filter(t=>t.querySelector('.hotelDayBadge')).map(t=>t.dataset.date+' '+t.querySelector('.hotelDayBadge').textContent),
  ['2026-09-30 🌙 hôtel'],'désactiver le découché ne doit retirer que la lune');
state.calendarEvents=[];uiPolish.markHotelDayTab();

// --- 5. Masquer un jour non travaillé n'enlève jamais son onglet ---------------------
// workdays-enforcer.js n'a le droit que de cacher : retirer le nœud ferait perdre à la
// bande les onglets que le rendu historique guette pour reprendre la main.
state.settings.days=['Mardi','Mercredi'];
workdays.filterTabs();
assert.equal(world.tabs().length,15,'masquer des jours ne doit supprimer aucun onglet');
world.tabs().forEach((tab,i)=>assert.equal(tab,initialTabs[i],'les onglets masqués doivent rester les mêmes nœuds'));
assert.equal(box.children.filter(t=>t.style.display!=='none').length,6,'seuls les mardis et mercredis de la période restent visibles');
assert.equal(box.dataset.periodSliderOwner,'1','masquer des jours ne doit pas rendre la bande au rendu historique');
state.settings.days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
workdays.filterTabs();
assert.equal(box.children.filter(t=>t.style.display!=='none').length,15,'revenir sur les cinq jours doit tout réafficher');

// --- 6. Après tous les autres modules, la bande ne se reconstruit toujours pas -------
// C'est le contrat de la PR #128, étendu à tous ceux qui écrivent dans #dayTabs : passer
// derrière eux ne doit produire aucune reconstruction, ni remettre le défilement à zéro.
state.calendarEvents=[{title:'Hôtel Ibis',date:'2026-09-16',allDay:true}];
state.settings.weekDate='2026-09-14';
box.scrollLeft=412; // position horizontale donnée par l'utilisateur
planningFix.restoreHotelStars();planningFix.reorderPlanning();uiPolish.markHotelDayTab();workdays.filterTabs();
assert.equal(slider.renderTabs(),true);
world.tabs().forEach((tab,i)=>assert.equal(tab,initialTabs[i],'aucun module ne doit forcer la bande à se reconstruire'));
assert.equal(box.scrollLeft,412,'aucun module ne doit remettre le défilement horizontal de la bande à zéro');

// Et le rendu historique doit toujours rendre la main : c'est la régression de la PR #128.
const coreHtml=fs.readFileSync(ROOT+'/src/chef-secteur.html','utf8');
const renderDayTabsSrc=(coreHtml.match(/\n  function renderDayTabs\(\)\{[\s\S]*?\n  \}\n/)||[])[0];
assert(renderDayTabsSrc,'renderDayTabs() doit rester identifiable dans le noyau historique');
const coreCtx={state,console,Date,JSON,Object,Array,String,Number,Math,
  DAYS:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],selectedPlanningDay:'Lundi',
  esc:v=>String(v),shortDate:()=>'14/09',document:doc};
vm.runInNewContext(renderDayTabsSrc+'\nthis.__renderDayTabs=renderDayTabs;',coreCtx);
const ownedHtml=box.innerHTML;
coreCtx.__renderDayTabs();
assert.equal(box.innerHTML,ownedHtml,'le rendu historique ne doit pas réécrire une bande prise en charge');
world.tabs().forEach((tab,i)=>assert.equal(tab,initialTabs[i],'le rendu historique ne doit détruire aucun onglet'));
assert.equal(box.scrollLeft,412,'le rendu historique ne doit pas remettre le défilement à zéro');

// --- 7. Un jour décoché qui porte encore des visites (P0.4-B1.1) ---------------------
// Décocher un jour le retire des prochaines générations (state.settings.days), pas de
// l'affichage : tant qu'il porte des visites dans sa semaine, son onglet reste dans la
// bande, s'ouvre, et le noyau affiche bien sa journée. Un jour décoché vide disparaît.
// Monde neuf, sur les vrais modules : la bande (period-day-slider.js), le masquage
// (workdays-enforcer.js) et le bloc planning du noyau (renderDayTabs, selectPlanningDay,
// renderWeek, daySchedule). Qu'aucun moteur ne pose de visite libre un jour décoché reste
// prouvé par F1 de tests/planning-engine-final-p04.test.cjs ; ici, rien ne touche à
// state.settings.days, que ces moteurs lisent.
{
  const W1='2026-11-09',W2='2026-11-16',WORK=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],NO_WED=['Lundi','Mardi','Jeudi','Vendredi'];
  const shop=id=>({id,enseigne:'Fnac',ville:'Ville-'+id,adresse:'',lat:45.75,lon:4.85});
  const weekPlan=o=>Object.assign(EMPTY_PLAN(),o);
  const w1=weekPlan({Lundi:[shop('a')],Mercredi:[shop('c'),shop('d')],Jeudi:[shop('e')]}),w2=weekPlan({Mercredi:[shop('f')],Vendredi:[shop('b')]});
  const data={
    /* Période de trois semaines générée quand le mercredi était encore travaillé ; la
       semaine du 23/11 n'a aucune visite le mercredi. */
    [RANGE]:JSON.stringify({start:W1,end:'2026-11-27',workDays:WORK}),
    [ARCHIVE]:JSON.stringify({[W1]:{weekMonday:W1,plan:w1},[W2]:{weekMonday:W2,plan:w2}})
  };
  const storage=d=>({getItem:k=>Object.prototype.hasOwnProperty.call(d,k)?d[k]:null,setItem(k,v){d[k]=String(v)},removeItem(k){delete d[k]}});
  const st={profile:{overnightMode:'never'},settings:{days:WORK.slice(),weekDate:W1,brands:[],visitMinutes:45},
    stores:['a','b','c','d','e','f'].map(shop),plan:JSON.parse(JSON.stringify(w1)),calendarEvents:[],appointments:[],excluded:{},included:{},locks:{}};
  const dom2=createFakeDom(),doc2=dom2.document,weekInput={value:W1};
  const panel2=doc2.createElement('div');panel2.id='planPanel';panel2.classList.add('active');
  const band=doc2.createElement('div');band.id='dayTabs';panel2.appendChild(band);
  const timeline2=doc2.createElement('div');timeline2.id='week';panel2.appendChild(timeline2);
  dom2.registry.set('weekDate',weekInput);
  const c2={
    state:st,console,Date:FrozenDate,JSON,Object,Array,String,Number,Math,Map,Set,Intl,RegExp,Boolean,
    setTimeout(){return 0},clearTimeout(){},requestAnimationFrame(){return 0},
    localStorage:storage(data),__chefStorage:storage(data),sessionStorage:storage({}),
    save(){},renderAll(){},addEventListener(){},removeEventListener(){},getComputedStyle:()=>({}),
    MutationObserver:function(){this.observe=()=>{};this.disconnect=()=>{}},
    CustomEvent:function(type,opts){return{type,detail:opts&&opts.detail}},
    /* Dépendances globales du bloc planning, hors de ce qui est éprouvé ici. */
    DAYS:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],esc:v=>String(v),hav:()=>8,baseObj:()=>({lat:45.76,lon:4.84}),
    todayISO:()=>W1,dayStartTime:()=>'08:30',calendarEventsForDate:()=>[],brandClass:()=>'brandFnac',lockDayNow:()=>'',goTab(){},
    document:doc2,window:null
  };
  c2.window=c2;
  const coreBlock=fs.readFileSync(ROOT+'/src/chef-secteur.html','utf8').match(/<script id="v37-apple-planning-js">\n([\s\S]*?)<\/script>/);
  assert(coreBlock,'le bloc planning du noyau (v37-apple-planning-js) doit rester identifiable');
  const coreSrc=coreBlock[1].replace(/\}\)\(\);\s*$/,'window.__corePlanning={get selectedPlanningDay(){return selectedPlanningDay}};})();');
  assert.notEqual(coreSrc,coreBlock[1],'le bloc planning doit rester une IIFE dont le test peut lire le jour sélectionné');
  vm.runInNewContext(coreSrc,c2);
  vm.runInNewContext(expose('period-day-slider.js','window.__periodTest={renderTabs,loadDate};'),c2);
  vm.runInNewContext(expose('workdays-enforcer.js','window.__workdaysTest={filterTabs};'),c2);
  const bandSlider=c2.__periodTest,bandMask=c2.__workdaysTest,corePlanning=c2.__corePlanning;
  const tabs=()=>band.children.filter(t=>t.classList.contains('periodDayTab'));
  const shown=()=>tabs().filter(t=>t.style.display!=='none');
  const wednesdays=list=>list.map(t=>t.dataset.date).filter(d=>new Date(d+'T12:00:00').getDay()===3);

  // A. Avant le décochage, la période compte trois mercredis.
  assert.equal(bandSlider.renderTabs(),true);
  assert.deepEqual(wednesdays(tabs()),['2026-11-11','2026-11-18','2026-11-25'],'avant le décochage, la bande compte trois mercredis');
  // L'utilisateur décoche le mercredi : le masquage cache aussitôt le seul mercredi vide…
  st.settings.days=NO_WED.slice();
  bandMask.filterTabs();
  assert.deepEqual(wednesdays(shown()),['2026-11-11','2026-11-18'],'après décochage, les mercredis qui portent des visites restent visibles et le 25/11 vide est masqué');
  // … et la bande reconstruite ne recrée que les mercredis qui portent des visites.
  assert.equal(bandSlider.renderTabs(),true);
  assert.deepEqual(wednesdays(tabs()),['2026-11-11','2026-11-18'],'la bande reconstruite garde le 11/11 (c, d) et le 18/11 (f) sans réintroduire le 25/11 vide');
  assert.equal(tabs().length,14,'trois semaines de quatre jours travaillés, plus les deux mercredis planifiés');
  assert.equal(shown().length,14,'aucun onglet de la bande reconstruite n’est masqué');
  // Même chose quand la période a été régénérée sans le mercredi : ses jours travaillés ne le
  // comptent plus, mais les mercredis encore planifiés gardent leur onglet.
  data[RANGE]=JSON.stringify({start:W1,end:'2026-11-27',workDays:NO_WED});
  const period=data[RANGE];
  assert.equal(bandSlider.renderTabs(),true);
  assert.deepEqual(wednesdays(tabs()),['2026-11-11','2026-11-18'],'après une génération sans le mercredi, les mercredis planifiés restent dans la bande');
  assert.equal(tabs().length,14);

  // B. Ouvrir le mercredi 11/11 : le noyau garde Mercredi et affiche c et d.
  assert.equal(bandSlider.loadDate(new Date('2026-11-11T12:00:00')),true,'un mercredi décoché qui porte des visites doit s’ouvrir');
  assert.equal(corePlanning.selectedPlanningDay,'Mercredi','le noyau doit garder le mercredi sélectionné au lieu de revenir au lundi');
  assert.equal(c2.selectedPlanningDay,'Mercredi');
  assert.match(timeline2.innerHTML,/openStoreQuick\('c','Mercredi'/,'la journée affichée doit être celle du mercredi : c');
  assert.match(timeline2.innerHTML,/openStoreQuick\('d','Mercredi'/,'la journée affichée doit être celle du mercredi : d');
  assert.doesNotMatch(timeline2.innerHTML,/openStoreQuick\('a'/,'la journée du lundi ne doit pas s’afficher à la place du mercredi');

  // C. Ouvrir le mercredi 18/11 : semaine suivante, f affiché.
  assert.equal(bandSlider.loadDate(new Date('2026-11-18T12:00:00')),true,'le mercredi 18/11, planifié dans l’archive, doit s’ouvrir');
  assert.equal(st.settings.weekDate,W2);
  assert.equal(corePlanning.selectedPlanningDay,'Mercredi');
  assert.match(timeline2.innerHTML,/openStoreQuick\('f','Mercredi'/,'la journée du 18/11 doit afficher f');

  // D. Le mercredi 25/11, décoché et vide : ni onglet, ni ouverture, rien de modifié.
  const kept=JSON.stringify({plan:st.plan,week:st.settings.weekDate});
  assert.equal(bandSlider.loadDate(new Date('2026-11-25T12:00:00')),false,'un mercredi décoché et vide doit être refusé');
  assert.equal(JSON.stringify({plan:st.plan,week:st.settings.weekDate}),kept,'un refus ne doit rien changer');
  assert.equal(tabs().some(t=>t.dataset.date==='2026-11-25'),false,'aucun onglet pour le mercredi 25/11 vide');
  // Une sélection restée sur un mercredi décoché et vide (semaine du 23/11) revient au
  // premier jour travaillé, comme avant.
  assert.equal(bandSlider.loadDate(new Date('2026-11-23T12:00:00')),true);
  c2.selectPlanningDay('Mercredi');
  assert.equal(corePlanning.selectedPlanningDay,'Lundi','décoché et vide, le mercredi rend la main au premier jour travaillé');
  assert.match(timeline2.innerHTML,/Aucune visite pour Lundi/);
  // Onglets historiques du noyau, sans bande de période : même règle d'affichage.
  band.innerHTML='';delete band.dataset.periodSliderOwner;
  c2.renderWeek();
  assert.doesNotMatch(band.innerHTML,/selectPlanningDay\('Mercredi'\)/,'semaine du 23/11 : pas d’onglet pour un mercredi décoché vide');
  st.plan=JSON.parse(JSON.stringify(w1));st.settings.weekDate=W1;weekInput.value=W1;
  c2.selectPlanningDay('Mercredi');
  assert.deepEqual((band.innerHTML.match(/selectPlanningDay\('\w+'\)/g)||[]).map(x=>x.slice(19,-2)),['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],'semaine du 09/11 : le mercredi planifié garde sa place dans l’ordre naturel');
  assert.equal(corePlanning.selectedPlanningDay,'Mercredi');

  // E. Rien de tout cela ne rend le mercredi à la génération.
  assert.deepEqual(st.settings.days,NO_WED,'state.settings.days reste sans Mercredi');
  assert.equal(data[RANGE],period,'la bande n’écrit jamais la période');
}

console.log('PASS: #dayTabs a quatre écrivains et un seul propriétaire · le message de semaine vide suit la bande, l’étoile hôtel suit la date de l’onglet sans réécrire le DOM, la lune du découché reste unique et à sa date, masquer un jour ne retire pas son onglet, et rien de tout cela ne reconstruit la bande · un jour décoché qui porte des visites garde son onglet, s’ouvre et s’affiche, un jour décoché vide disparaît (B1.1).');
