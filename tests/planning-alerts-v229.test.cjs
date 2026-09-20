/* V229 — Planning : plus de « 9992 jours de retard », alertes mobile bornées, bouton
   « Réoptimiser », vue mensuelle repliée et indice de swipe masqué sur mobile.

   Fixtures entièrement synthétiques : enseignes et villes inventées, aucune donnée métier. */
const fs=require('fs');
const assert=require('assert');

const SRC=fs.readFileSync(__dirname+'/../planning-pro-plus.js','utf8');

/* Le module est une IIFE sans export : on le rejoue dans un bac à sable minimal pour
   exercer sa logique réelle, sans dupliquer une deuxième implémentation dans le test. */
function load(){
  const body=SRC.replace(/^\(function\(\)\{/,'').replace(/\}\)\(\);\s*$/,'');
  const noop=()=>{};
  const env={compact:false};
  const doc={
    readyState:'complete',hidden:false,
    getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
    addEventListener:noop,createElement:()=>({style:{},setAttribute:noop,addEventListener:noop}),
    head:{appendChild:noop},body:{},createTreeWalker(){throw new Error('pas de DOM')}
  };
  const win={addEventListener:noop,matchMedia:()=>({matches:env.compact})};
  const store={};
  const storage={getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=String(v)}};
  const state={stores:[],plan:{},settings:{},awayRanges:[]};
  const factory=new Function('window','document','state','localStorage','setTimeout','clearTimeout','MutationObserver','NodeFilter',
    body+'\nreturn{alerts,daysSince,visitDelay,renderAlerts,isCompact,syncOptimizeLabel,quality,storeLabel};');
  const api=factory(win,doc,state,storage,()=>0,noop,function(){this.observe=noop},{SHOW_TEXT:4});
  return{api,state,env,doc};
}

const {api,state,env,doc}=load();

// --- 4. Un magasin jamais visité n'a pas un retard calculable -------------------------
assert.strictEqual(api.daysSince(null),null,'aucune date : aucune sentinelle');
assert.strictEqual(api.daysSince(''),null,'chaîne vide : aucune sentinelle');
assert.strictEqual(api.daysSince('pas une date'),null,'date illisible : aucune sentinelle');
assert(!/return\s*9999/.test(SRC),'la sentinelle 9999 ne doit plus exister dans le Planning');
assert(!/daysSince\([^)]*\)\s*-\s*intervalDays/.test(SRC),
  'on ne soustrait plus un intervalle à une valeur potentiellement inventée');

const jamais={id:'never-1',enseigne:'Enseigne Test',ville:'Ville Test',intervalDays:30};
const vu=api.visitDelay(jamais);
assert.strictEqual(vu.never,true,'sans lastVisit, le magasin est « jamais visité »');
assert.strictEqual(vu.days,null);
assert.strictEqual(vu.late,null,'aucun retard n’est calculé à partir de rien');

function ilYA(jours){const d=new Date();d.setDate(d.getDate()-jours);return d.toISOString().slice(0,10)}
const enRetard={id:'late-1',enseigne:'Enseigne Test',ville:'Ville Deux',intervalDays:30,lastVisit:ilYA(75)};
const retard=api.visitDelay(enRetard);
assert.strictEqual(retard.never,false,'un magasin déjà visité garde un vrai retard');
assert(retard.late>=44&&retard.late<=46,'le retard réel reste calculé · '+retard.late);

// --- 4. L'écran ne peut plus afficher « 9992 jours de retard » ------------------------
state.settings={days:['Lundi'],startTime:'08:30',endTime:'18:00',visitMinutes:60};
state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
state.stores=[jamais,enRetard];
let liste=api.alerts();
const textes=liste.map(x=>x.text).join(' | ');
assert(!/\b\d{3,}\s*jours/.test(textes),'aucune alerte ne doit annoncer un nombre de jours aberrant · '+textes);
const info=liste.find(x=>x.type==='info');
assert(info,'un magasin jamais visité produit une information secondaire');
assert(/Jamais visité/.test(info.text)&&/hors planning cette semaine/.test(info.text),
  'le libellé « jamais visité » remplace le faux retard · '+info.text);
assert(liste.some(x=>x.type==='warn'&&/est en retard d’environ 4[456] jours/.test(x.text)),
  'le vrai retard reste affiché · '+textes);

/* Non-régression côté runtime : les deux seuls endroits qui écrivent un nombre de jours
   de retard à l'écran le font à partir d'une vraie dernière visite, jamais d'une sentinelle. */
const RUNTIME=fs.readFileSync(__dirname+'/../src/chef-secteur.html','utf8');
assert(/late=v\.lastVisit\?\(daysSince\(v\.lastVisit\)-Number\(s\.intervalDays\|\|30\)\):null/.test(RUNTIME),
  'l’accueil ne calcule un retard que pour un magasin réellement visité');
assert(/late=visit\.lastVisit\?Math\.max\(0,since-interval\):interval/.test(RUNTIME),
  'la reco du samedi ne dérive jamais un retard de la sentinelle daysSince');
assert(!/-\s*9999|9999\s*-/.test(RUNTIME),'aucune arithmétique sur la sentinelle du runtime');

// --- 5. Ordre de priorité -------------------------------------------------------------
/* Journée volontairement trop chargée pour la limite horaire : le dépassement est réel. */
state.settings={days:['Lundi'],startTime:'08:30',endTime:'12:00',visitMinutes:60};
state.stores=[jamais,enRetard];
state.plan={Lundi:[{id:'p1',enseigne:'Enseigne Test',ville:'Ville Trois'},{id:'p2',enseigne:'Enseigne Test',ville:'Ville Quatre'},
  {id:'p3',enseigne:'Enseigne Test',ville:'Ville Cinq'},{id:'p4',enseigne:'Enseigne Test',ville:'Ville Six'},
  {id:'p5',enseigne:'Enseigne Test',ville:'Ville Sept'},{id:'p6',enseigne:'Enseigne Test',ville:'Ville Huit'},
  {id:'p7',enseigne:'Enseigne Test',ville:'Ville Neuf'},{id:'p8',enseigne:'Enseigne Test',ville:'Ville Dix'}],
  Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
liste=api.alerts();
const rangs=liste.map(x=>x.rank);
assert.deepEqual(rangs.slice().sort((a,b)=>a-b),rangs,'les alertes sortent triées par priorité · '+rangs.join(','));
assert.strictEqual(liste[0].rank,1,'un dépassement horaire réel passe en premier · '+JSON.stringify(liste[0]));
assert.strictEqual(liste[liste.length-1].rank,4,'l’information secondaire reste en dernier');

// --- 5. Sur mobile, deux alertes puis « + N autres » ----------------------------------
function fakeZone(){
  const zone={hidden:false,_html:'',_button:null};
  Object.defineProperty(zone,'innerHTML',{get:()=>zone._html,set(v){
    zone._html=v;
    zone._button=/class="proAlertMore"/.test(v)?{onclick:null,textContent:(v.match(/proAlertMore"[^>]*>([^<]*)</)||[])[1]||''}:null;
  }});
  zone.querySelector=sel=>sel==='.proAlertMore'?zone._button:null;
  return zone;
}
const cinq=[1,2,3,4,5].map(n=>({type:'warn',rank:3,text:'Alerte '+n}));
const planAvant=JSON.stringify(state.plan);
env.compact=true;
assert.strictEqual(api.isCompact(),true);
const zone=fakeZone();
api.renderAlerts(zone,cinq);
assert.strictEqual((zone.innerHTML.match(/class="proAlert /g)||[]).length,2,'deux alertes au maximum sur mobile');
assert(/\+ 3 autres/.test(zone.innerHTML),'un contrôle compact annonce le reste · '+zone.innerHTML);
assert(/aria-expanded="false"/.test(zone.innerHTML),'le contrôle indique son état replié');
zone.querySelector('.proAlertMore').onclick();
assert.strictEqual((zone.innerHTML.match(/class="proAlert /g)||[]).length,5,'déplié, tout est visible');
assert(/Replier/.test(zone.innerHTML),'le contrôle permet de replier');
zone.querySelector('.proAlertMore').onclick();
assert.strictEqual((zone.innerHTML.match(/class="proAlert /g)||[]).length,2,'replié, on revient à deux alertes');
assert.strictEqual(JSON.stringify(state.plan),planAvant,'l’affichage des alertes ne touche jamais state.plan');

// --- 5. Sur desktop, l'information reste complète -------------------------------------
env.compact=false;
const zoneDesktop=fakeZone();
api.renderAlerts(zoneDesktop,cinq);
assert.strictEqual((zoneDesktop.innerHTML.match(/class="proAlert /g)||[]).length,5,'desktop garde le détail');
assert(!/proAlertMore/.test(zoneDesktop.innerHTML),'aucun repli inutile sur desktop');

// --- 5. Aucune carte verte quand il n'y a rien à signaler ------------------------------
const vide=fakeZone();
api.renderAlerts(vide,[]);
assert.strictEqual(vide.innerHTML,'','la zone d’alertes est vidée');
assert.strictEqual(vide.hidden,true,'la zone d’alertes est masquée');
assert(!/Aucune alerte importante/.test(SRC),'la grosse carte verte ne doit plus exister');
assert(!/proAlert ok/.test(SRC),'plus de style d’alerte « ok » à afficher pour rien');

// --- 6. Bouton d'optimisation ---------------------------------------------------------
let bouton={textContent:'Optimiser cette journée'};
doc.getElementById=id=>id==='proOptimizeDay'?bouton:null;
env.compact=true;api.syncOptimizeLabel();
assert.strictEqual(bouton.textContent,'Réoptimiser','sur mobile, le bouton devient « Réoptimiser »');
env.compact=false;api.syncOptimizeLabel();
assert.strictEqual(bouton.textContent,'Optimiser cette journée','desktop garde le libellé long');
doc.getElementById=()=>null;
assert(/function optimizeDay\(\)\{const day=selectedDay\(\);/.test(SRC),
  'le bouton continue d’appeler exactement la même action : aucun changement de moteur');

// --- 7. Vue mensuelle présente, fonctionnelle, repliée par défaut ----------------------
assert(/month\.open=false/.test(SRC),'la vue mensuelle est repliée par défaut');
assert(!/month\.open=true/.test(SRC),'plus aucune ouverture automatique');
assert(/id="planningProMonth"|month\.id='planningProMonth'/.test(SRC),'la vue mensuelle reste présente');
for(const garde of ['proMonthPrev','proMonthNext','data-pro-date','loadMonthDay','printMonth','ontouchend'])
  assert(SRC.includes(garde),'la vue mensuelle garde sa fonction : '+garde);
assert(/@media\(max-width:700px\)\{\.proSwipeHint\{display:none\}/.test(SRC),
  'le texte permanent de swipe est masqué sur mobile, le geste reste actif');
assert(/box\.ontouchend=function/.test(SRC),'le geste de changement de mois reste branché');

// --- Carte d'alertes identifiable et observateurs inchangés ---------------------------
assert(/class="proCard proAlertCard" id="proAlertCard"/.test(SRC),'la carte d’alertes est identifiable');
for(const garde of ['refreshObserver','observedRefreshTargets','scheduleInstall'])
  assert(SRC.includes(garde),'le contrat d’architecture du planning pro reste en place : '+garde);

console.log('planning V229: jamais visité au lieu de 9992 jours, 2 alertes + « + N autres » sur mobile, Réoptimiser, vue mensuelle repliée, swipe hint masqué');
