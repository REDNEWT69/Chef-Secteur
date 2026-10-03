/* r38 : les vues de la semaine active ne réutilisent aucune date d'une autre semaine.
   Les magasins et coordonnées sont une fixture inventée ; V189 reste le seul décideur. */
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const {createFakeDom}=require('./helpers/fake-dom.cjs');
const read=file=>fs.readFileSync(__dirname+'/../'+file,'utf8');
const ARCHIVE='chef_sector_plan_archive_v1',RANGE='chef_sector_range_v1';
const empty=()=>({Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]});
const at=Date.parse('2026-10-03T09:00:00');
class LocalDate extends Date{constructor(...args){super(...(args.length?args:[at]))}static now(){return at}}
function fixture(shown='2026-09-28'){
  const dom=createFakeDom(),doc=dom.document,frames=[];
  const panel=doc.createElement('section');panel.id='planPanel';panel.classList.add('active');
  const hero=doc.createElement('div');hero.id='planningHeroV2';panel.appendChild(hero);
  for(const id of ['planningHeroDay','planningHeroFull','planningHeroWeek']){const el=doc.createElement('div');el.id=id;hero.appendChild(el)}
  const tabs=doc.createElement('div');tabs.id='dayTabs';panel.appendChild(tabs);
  const box=doc.createElement('div');box.id='overnightBox';panel.appendChild(box);
  const week=doc.createElement('input');week.id='weekDate';week.value=shown;
  const selectAll=doc.querySelectorAll.bind(doc);
  doc.querySelectorAll=selector=>selector.startsWith('#')?selectAll(selector):panel.querySelectorAll(selector);
  doc.querySelector=selector=>doc.querySelectorAll(selector)[0]||null;
  const a={id:'a',enseigne:'Test A',ville:'Zone distante',lat:48.6,lon:1},b={id:'b',enseigne:'Test B',ville:'Zone distante',lat:48.62,lon:1.02};
  const future=empty();future.Mardi=[a];future.Mercredi=[b];
  const past=empty();past.Lundi=[{id:'past',ville:'Historique'}];
  const state={settings:{weekDate:shown,days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi']},profile:{overnightMode:'auto',overnightMinSaving:40},stores:[a,b],plan:shown==='2026-10-05'?future:past,locks:{},included:{},excluded:{},appointments:[]};
  const data={[RANGE]:JSON.stringify({start:'2026-09-28',end:'2026-10-16',workDays:state.settings.days}),[ARCHIVE]:JSON.stringify({'2026-09-28':{weekMonday:'2026-09-28',plan:past},'2026-10-05':{weekMonday:'2026-10-05',plan:future}})};
  const storage={getItem:key=>data[key]||null,setItem(key,value){data[key]=String(value)},removeItem(key){delete data[key]}};
  doc.dispatchEvent=event=>{dom.dispatchDocumentEvent(event.type,event);return true};
  const ctx={console,window:null,state,document:doc,Date:LocalDate,Intl,CustomEvent:function(type,options){return{type,detail:options&&options.detail}},__chefStorage:storage,setTimeout(){return 0},requestAnimationFrame(fn){frames.push(fn)},addEventListener(){},save(){},selectPlanningDay(){},baseObj(){return{lat:47,lon:1}},hav(a,b){return Math.hypot(a.lat-b.lat,a.lon-b.lon)*111}};
  ctx.window=ctx;
  vm.runInNewContext(read('auto-planning-fix.js'),ctx);
  vm.runInNewContext(read('period-day-slider.js').replace(/\}\)\(\);\s*$/,'window.__test={renderTabs,loadDate};})();'),ctx);
  dom.dispatchDocumentEvent('DOMContentLoaded');
  return{ctx,dom,doc,state,data,tabs,box,hero,flush(){while(frames.length)frames.shift()()}};
}

// D : le 03/10, la semaine du 28/09 ne doit porter aucun bandeau 06/10 → 07/10.
{
  const f=fixture();f.ctx.StoreRunnerPeriodDaySlider.openDate('2026-09-28');f.flush();
  assert.equal(f.state.settings.weekDate,'2026-09-28');
  assert.match(f.doc.getElementById('planningHeroWeek').textContent,/28 septembre.*3 octobre 2026/);
  assert.equal(!!f.doc.getElementById('planningOvernightCueV206'),false,'ROUGE r38 : le bandeau du héros doit se limiter à la semaine réellement affichée');
  assert.doesNotMatch(f.box.innerHTML,/6 octobre|7 octobre|Nuit sur place/,'V189 ne rend aucune nuit de la semaine suivante dans la semaine historique');
  const futureTab=f.tabs.querySelector('.dayTab[data-date="2026-10-06"]');
  assert(futureTab.querySelector('.hotelDayBadge'),'la bande de la période conserve son indicateur daté de la nuit future');
  f.ctx.StoreRunnerPeriodDaySlider.openDate('2026-10-06');f.flush();
  assert.match(f.doc.getElementById('planningOvernightCueV206').getAttribute('aria-label'),/6\/10 → 7\/10/);
  assert.match(f.box.innerHTML,/Nuit sur place/);
  f.ctx.StoreRunnerPeriodDaySlider.openDate('2026-09-28');f.flush();
  const cue=f.doc.getElementById('planningOvernightCueV206');
  assert(!cue||!cue.parentNode,'revenir en historique retire immédiatement le bandeau dérivé de la semaine suivante');
  assert.doesNotMatch(f.box.innerHTML,/Nuit sur place/,'l’événement propriétaire recalcule aussi le rendu V189');
}

// L'état canonique possède la semaine : un rendu ne choisit pas le premier onglet du cycle.
{
  const f=fixture('2026-10-05');f.ctx.selectedPlanningDay='Mardi';f.ctx.__test.renderTabs();
  assert.equal(f.tabs.querySelector('.periodDayTab.active').dataset.date,'2026-10-06','ROUGE r38 : la date active doit suivre state.settings.weekDate et le jour sélectionné');
  assert.match(f.doc.getElementById('planningHeroWeek').textContent,/5 octobre.*10 octobre 2026/);
  f.state.settings.weekDate='2026-09-28';f.ctx.selectedPlanningDay='Lundi';
  f.dom.dispatchDocumentEvent('store-runner:planning-updated');f.flush();
  assert.equal(f.tabs.querySelector('.periodDayTab.active').dataset.date,'2026-09-28','un changement canonique invalide la date active précédente');
}

// Changer de jour dans la même semaine ne recharge pas une archive éventuellement ancienne.
{
  const f=fixture('2026-10-05');f.state.plan.Jeudi=[{id:'manual-new'}];
  f.ctx.StoreRunnerPeriodDaySlider.openDate('2026-10-08');f.flush();
  assert.equal(f.state.plan.Jeudi[0].id,'manual-new','la navigation conserve les retouches présentes dans le plan actif');
  f.ctx.StoreRunnerPeriodDaySlider.openDate('2026-09-28');f.flush();
  assert.equal(JSON.parse(f.data[ARCHIVE])['2026-10-05'].plan.Jeudi[0].id,'manual-new','la semaine quittée est archivée avant de charger un autre plan');
}
// Le champ Semaine utilise le même chargeur qu'Accueil/mois ; lire les réglages ne
// réétiquette jamais le plan courant en conservant les visites d'une autre semaine.
{
  const f=fixture(),readControls=read('src/chef-secteur.html').split(/\r?\n/).find(line=>line.startsWith('function readPlanningControls(){'));
  f.ctx.todayISO=()=>'2026-10-03';
  const target=f.doc.createElement('input');target.id='target';target.value='20';
  const strategy=f.doc.createElement('input');strategy.id='strategy';strategy.value='balanced';
  for(const day of f.state.settings.days){const checkbox=f.doc.createElement('input');checkbox.dataset.day='1';checkbox.value=day;checkbox.checked=true;f.hero.appendChild(checkbox)}
  vm.runInNewContext(readControls,f.ctx);
  f.doc.getElementById('weekDate').value='2026-10-05';f.ctx.readPlanningControls();f.flush();
  assert.equal(f.state.plan.Mardi[0]&&f.state.plan.Mardi[0].id,'a','ROUGE r38 : readPlanningControls charge le plan de la semaine choisie plutôt que réétiqueter le précédent');
  f.doc.getElementById('weekDate').value='2026-09-28';
  f.dom.dispatchDocumentEvent('change',{target:f.doc.getElementById('weekDate')});f.flush();
  assert.equal(f.state.settings.weekDate,'2026-09-28','le champ Semaine charge immédiatement sa semaine par openDate');
  assert.equal(f.state.plan.Lundi[0].id,'past');
  assert.doesNotMatch(f.box.innerHTML,/Nuit sur place/);
}
// Une ancienne date de réglage située au milieu de la semaine s'archive sous son
// lundi canonique, afin que la navigation puisse retrouver ses visites.
{
  const f=fixture('2026-10-03');f.ctx.StoreRunnerPeriodDaySlider.openDate('2026-10-06');f.flush();
  assert.equal(JSON.parse(f.data[ARCHIVE])['2026-09-28'].plan.Lundi[0].id,'past');
  assert.equal(Object.hasOwn(JSON.parse(f.data[ARCHIVE]),'2026-10-03'),false,'aucune archive concurrente indexée par un samedi');
}
console.log('planning active week r38 : D + source canonique + invalidation + retouches : OK');
