/* V259 — accueil « Votre activité » personnalisable.
   Verrouille : mode automatique inchangé sans préférence, épinglage et ordre, retrait,
   états vides explicites, préférences robustes (clé unique du moteur durable, aucune
   écriture dans state), « Cette semaine » depuis StoreRunnerActivityMetrics seulement,
   bandeau historique du noyau sans compteur concurrent. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Home=require('../home-refresh-v2.js');
const {StoreRunnerActivityMetrics:M}=require('../visit-counting.js');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const NOW=new Date('2026-09-17T12:00:00+02:00');
const results=[];const pass=m=>{results.push(m);console.log('PASS '+results.length+' · '+m)};

function baseState(){
  return{
    stores:[{id:'a',enseigne:'Boulanger',ville:'Alpha',active:true},{id:'b',enseigne:'Darty',ville:'Beta',active:true},{id:'c',enseigne:'But',ville:'Gamma',active:true}],
    plan:{Lundi:['a','a'],Mardi:['b'],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
    settings:{target:5},visits:{},appointments:[],
    businessV2:{visits:[],actions:[],opportunities:[],storeSnapshots:{}}
  }
}
function emptyEnv(){return{now:NOW,pilotage:{rows:[]},performance:{rows:[]},opportunities:[],recommended:null,appointment:null}}
function richEnv(state){
  state.businessV2.actions.push({id:'act-a',storeId:'a',status:'open',dueDate:'2026-09-10'});
  const env=emptyEnv();
  env.pilotage={rows:[
    {store:state.stores[0],priority:72,age:60,late:30,pdl:12,alerts:1,openActions:1,reasons:['Représentation marque faible']},
    {store:state.stores[1],priority:45,age:38,late:8,pdl:null,alerts:0,openActions:0,reasons:['Visite en retard de 8 j']}
  ]};
  env.performance={rows:[{storeId:'a',prio:'P1',status:{underTarget:true,gap:-4}},{storeId:'b',prio:'P1',status:{underTarget:true,gap:-1.5}}]};
  env.opportunities=[{id:'opp-c',storeId:'c',status:'open',dueDate:'2026-09-16',updatedAt:'2026-09-16T08:00:00Z'}];
  env.recommended=state.stores[1];
  env.appointment={a:{date:'2026-09-18',time:'10:30',storeId:'c'},d:new Date('2026-09-18T10:30:00+02:00')};
  return env;
}
class MemoryDB{constructor(){this.map=new Map();this.flushes=0}getItem(k){return this.map.has(k)?this.map.get(k):null}setItem(k,v){this.map.set(String(k),String(v))}removeItem(k){this.map.delete(k)}flush(){this.flushes++;return Promise.resolve()}}
const ids=cards=>cards.map(c=>c.id);

/* ------------------------------------------ 1. sans préférence : rien ne change */
{
  for(const [label,make] of [['vide',()=>{const s=baseState();return[s,emptyEnv()]}],['riche',()=>{const s=baseState();return[s,richEnv(s)]}]]){
    const [state,env]=make(),before=clone(state);
    const legacy=Home.buildActivityCards(state,env),catalog=Home.buildActivityCatalog(state,env);
    const composed=Home.composeHomeCards(catalog,Home.normalizePrefs(null));
    assert.deepEqual(ids(composed),ids(legacy),label+' : sans préférence, l’accueil garde exactement le classement automatique');
    for(let i=0;i<legacy.length;i++){assert.equal(composed[i].value,legacy[i].value);assert.equal(composed[i].sub,legacy[i].sub);assert.equal(composed[i].pinned,false)}
    assert.deepEqual(state,before,label+' : calcul strictement en lecture seule');
  }
  pass('sans préférence enregistrée, l’accueil est identique au classement automatique d’avant V259');
}

/* ------------------------------------------------------ 2. catalogue complet */
{
  const state=baseState(),env=richEnv(state),catalog=Home.buildActivityCatalog(state,env);
  assert.deepEqual(ids(catalog),['week','action-now','priority','opportunities','appointment','watch','actions','month']);
  assert.deepEqual(Home.CARD_IDS,ids(catalog));
  const by=Object.fromEntries(catalog.map(c=>[c.id,c]));
  assert.equal(by.watch.auto,false,'À surveiller n’entre pas dans le classement automatique');
  assert.equal(by.watch.value,'2 magasins en retard');
  assert.match(by.watch.sub,/1 magasin avec point terrain/);
  assert.equal(by.actions.auto,false);assert.equal(by.actions.value,'1 action ouverte');assert.equal(by.actions.sub,'1 échue');
  assert.equal(by.month.empty,true,'aucune visite ce mois : état vide explicite');
  for(const c of catalog){
    assert(c.label.trim()&&c.value.trim()&&c.sub.trim(),c.id+' : aucun texte vide');
    assert(!/NaN|undefined/.test(c.value+' '+c.sub),c.id+' : aucune valeur fabriquée');
  }
  const empty=Home.buildActivityCatalog(baseState(),emptyEnv()),e=Object.fromEntries(empty.map(c=>[c.id,c]));
  for(const id of ['action-now','priority','opportunities','appointment','watch','actions','month'])assert.equal(e[id].empty,true,id+' vide sans donnée');
  assert.equal(e.appointment.value,'Aucun prévu');assert.equal(e.opportunities.value,'Aucune ouverte');
  assert.equal(e.week.empty,false);
  pass('« Voir tout » dispose des 8 cartes (dont À surveiller, Actions ouvertes, Ce mois), états vides explicites');
}

/* ------------------------------------------------ 3. épingler, ordre, retrait */
{
  const state=baseState(),env=richEnv(state),catalog=Home.buildActivityCatalog(state,env),auto=ids(Home.buildActivityCards(state,env));
  assert(!auto.includes('week'),'référence : la semaine est hors des 4 cartes automatiques ici');
  let p=Home.prefsOps.pin(null,'week');
  let home=Home.composeHomeCards(catalog,p);
  assert.equal(home[0].id,'week');assert.equal(home[0].pinned,true);assert.equal(home.length,4);
  assert.deepEqual(ids(home).slice(1),auto.filter(id=>id!=='week').slice(0,3),'les places restantes suivent le classement automatique');
  p=Home.prefsOps.pin(p,'watch');
  home=Home.composeHomeCards(catalog,p);
  assert.deepEqual(ids(home).slice(0,2),['week','watch'],'ordre des épinglées = ordre choisi');
  p=Home.prefsOps.move(p,'watch',-1);
  assert.deepEqual(ids(Home.composeHomeCards(catalog,p)).slice(0,2),['watch','week'],'monter une carte change l’ordre');
  assert.deepEqual(Home.prefsOps.move(p,'watch',-1).pinned,['watch','week'],'déjà en tête : rien ne bouge');
  assert.deepEqual(Home.prefsOps.move(p,'week',1).pinned,['watch','week'],'déjà en dernier : rien ne bouge');
  const top=ids(Home.composeHomeCards(catalog,p))[2];
  p=Home.prefsOps.remove(p,top);
  home=Home.composeHomeCards(catalog,p);
  assert(!ids(home).includes(top),'une carte retirée ne revient pas par le classement automatique');
  assert(p.hidden.includes(top));
  p=Home.prefsOps.remove(p,'week');
  assert(!p.pinned.includes('week')&&p.hidden.includes('week'),'retirer une carte épinglée la désépingle et la masque');
  p=Home.prefsOps.add(p,'week');
  assert.equal(p.pinned[p.pinned.length-1],'week');assert(!p.hidden.includes('week'),'ajouter depuis « Voir tout » réaffiche et épingle');
  p=Home.prefsOps.unpin(p,'week');
  assert(!p.pinned.includes('week')&&!p.hidden.includes('week'),'désépingler rend la carte au mode automatique');
  /* Une carte épinglée sans donnée reste visible avec son état vide. */
  const emptyCatalog=Home.buildActivityCatalog(baseState(),emptyEnv());
  home=Home.composeHomeCards(emptyCatalog,Home.prefsOps.pin(null,'appointment'));
  assert.equal(home[0].id,'appointment');assert.equal(home[0].empty,true);assert.equal(home[0].value,'Aucun prévu');
  /* Plus de 4 épinglées : toutes restent visibles, dans l’ordre. */
  let many=null;for(const id of ['month','actions','watch','appointment','opportunities'])many=Home.prefsOps.pin(many,id);
  assert.deepEqual(ids(Home.composeHomeCards(catalog,many)),['month','actions','watch','appointment','opportunities']);
  assert.deepEqual(Home.prefsOps.reset(),{version:1,pinned:[],hidden:[]});
  pass('épingler, réordonner, retirer, ajouter, désépingler, réinitialiser — épinglées d’abord, auto pour compléter');
}

/* --------------------------------------------- 4. préférences robustes */
{
  assert.deepEqual(Home.normalizePrefs({pinned:['week','inconnue','week',3],hidden:['week','month','month']}),{version:1,pinned:['week'],hidden:['month']});
  assert.deepEqual(Home.normalizePrefs('n’importe quoi'),{version:1,pinned:[],hidden:[]});
  assert.equal(Home.isCustomPrefs(null),false);assert.equal(Home.isCustomPrefs({hidden:['week']}),true);
  const db=new MemoryDB();
  assert.deepEqual(Home.readPrefs(db),{version:1,pinned:[],hidden:[]},'clé absente : mode automatique (utilisateurs existants)');
  Home.writePrefs({pinned:['week','month'],hidden:['opportunities']},db);
  assert.equal(Home.PREFS_KEY,'store-runner-home-cards-v1');
  const stored=JSON.parse(db.getItem(Home.PREFS_KEY));
  assert.deepEqual(stored.pinned,['week','month']);assert.deepEqual(stored.hidden,['opportunities']);assert.match(stored.updatedAt,/^\d{4}-/);
  assert.equal(db.flushes,1,'l’écriture est poussée vers le moteur durable (flush)');
  assert.deepEqual(Home.readPrefs(db),{version:1,pinned:['week','month'],hidden:['opportunities']},'relecture après rechargement');
  assert.deepEqual([...db.map.keys()],[Home.PREFS_KEY],'une seule clé, aucune autre écriture');
  Home.writePrefs(Home.prefsOps.reset(),db);
  assert.equal(db.getItem(Home.PREFS_KEY),null,'réinitialiser efface la clé : retour exact au mode automatique');
  db.setItem(Home.PREFS_KEY,'{abîmé');
  assert.deepEqual(Home.readPrefs(db),{version:1,pinned:[],hidden:[]},'clé illisible : mode automatique, sans exception');
  const home=read('home-refresh-v2.js');
  assert.doesNotMatch(home.slice(home.indexOf('const PREFS_KEY'),home.indexOf('function composeHomeCards')),/state\.|localStorage\.setItem/,'les préférences ne touchent ni state ni localStorage directement');
  pass('préférences : une clé du moteur durable V256, normalisées, tolérantes, effacées au reset, jamais dans state');
}

/* ------------------------------------------ 5. Cette semaine : source unique */
{
  const m={completedVisitsWeek:17,plannedStoresWeek:12,plannedVisitCreditsWeek:18,target:15,completedVisitsMonth:17,completedUniqueStoresMonth:12,completedVisitsToday:5,openActions:0,overdueActions:0};
  assert.deepEqual(M.weekSummary(m),{value:'17 visites réalisées',bits:['12 magasins planifiés','18 crédits de visite','objectif 15 magasins']});
  assert.deepEqual(M.weekSummary(Object.assign({},m,{completedVisitsWeek:0})),{value:'12 magasins planifiés',bits:['18 crédits de visite','objectif 15 magasins']});
  assert.deepEqual(M.weekSummary({completedVisitsWeek:0,plannedStoresWeek:0,plannedVisitCreditsWeek:0,target:15}),{value:'Objectif 15 magasins',bits:[]});
  const env=Object.assign(emptyEnv(),{metrics:m}),week=Home.buildActivityCatalog(baseState(),env).find(c=>c.id==='week');
  assert.equal(week.value,'17 visites réalisées');assert.equal(week.sub,'12 magasins planifiés · 18 crédits de visite · objectif 15 magasins');
  const month=Home.buildActivityCatalog(baseState(),env).find(c=>c.id==='month');
  assert.equal(month.value,'17 visites réalisées');assert.equal(month.sub,'12 magasins distincts · 5 visites réalisées aujourd’hui');
  const core=read('src/chef-secteur.html'),brief=core.slice(core.indexOf('function renderSmartBrief'),core.indexOf('function renderAll'));
  assert(brief.length>200);
  assert.match(brief,/StoreRunnerActivityMetrics\.weekSummary\(StoreRunnerActivityMetrics\.compute\(state\)\)/,'le bandeau historique lit la source unique');
  assert.doesNotMatch(brief,/for\(var d in state\.plan\)|planned\+=|magasins planifiés/,'plus aucun compteur semaine concurrent depuis state.plan');
  assert.doesNotMatch(brief,/target\|\|20/,'plus d’objectif inventé');
  pass('« Cette semaine » : 17 visites réalisées · 12 magasins planifiés · 18 crédits · objectif 15, même formateur accueil et historique');
}

/* ---------------------------------------------------- 6. câblage et runtime */
{
  const home=read('home-refresh-v2.js'),index=read('index.html'),sw=read('sw.js');
  assert.match(home,/data-home-customize>Personnaliser</);
  assert.match(home,/data-home-all>Voir tout/);
  assert.doesNotMatch(home,/setInterval/,'aucune surveillance permanente');
  assert.match(home,/openStoreQuick/,'priorité / action ouvrent la fiche du magasin concerné');
  assert(index.includes("'./home-refresh-v2.js'")||index.includes('home-refresh-v2.js'),'module toujours chargé');
  assert(sw.includes('home-refresh-v2.js'),'module toujours en cache hors ligne');
  for(const f of fs.readdirSync(path.join(ROOT,'v2'),{recursive:true}).filter(f=>/\.(js|mjs|html)$/.test(String(f))))assert.doesNotMatch(read(path.join('v2',String(f))),/store-runner-home-cards-v1/,'v2 intact');
  pass('Personnaliser + Voir tout câblés, aucun setInterval, module toujours chargé et en cache');
}

console.log('home-cards-v259: OK ('+results.length+' blocs)');
