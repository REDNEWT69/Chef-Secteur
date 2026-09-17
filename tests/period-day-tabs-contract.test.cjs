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
    state,console,Date,JSON,Object,Array,String,Number,Math,Map,Set,Intl,RegExp,Boolean,
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

console.log('PASS: #dayTabs a quatre écrivains et un seul propriétaire · le message de semaine vide suit la bande, l’étoile hôtel suit la date de l’onglet sans réécrire le DOM, la lune du découché reste unique et à sa date, masquer un jour ne retire pas son onglet, et rien de tout cela ne reconstruit la bande.');
