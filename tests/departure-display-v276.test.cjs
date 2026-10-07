'use strict';

const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

const profile=read('profile-controller.js');
const home=read('home-refresh-v2.js');
const branding=read('store-runner-branding.js');
const glass=read('glass-theme.css');
const core=read('src/chef-secteur.html');

assert.match(profile,/departureDisplay:departureDisplay/,'le propriétaire profil expose le libellé de départ');
assert.match(profile,/Position précise/,'le GPS courant a un libellé humain sans coordonnées');
assert.match(profile,/store-runner-departure-display-v1/,'le reverse geocode de présentation reste hors state');
assert.match(profile,/store-runner:departure-display-updated/,'la ville résolue rafraîchit les surfaces');
assert.match(core,/StoreRunnerProfile\.departureDisplay/,'le Planning délègue son libellé au propriétaire du départ');
assert.match(home,/phDepartureTitle/,'l’Accueil possède une ligne de départ dédiée');
assert.doesNotMatch(home,/<span class="phSector">/,'le secteur/count ne doit plus être affiché dans ce bloc Accueil');
assert.match(branding,/departureDisplay\.kind==='gps'/,'le branding sait rendre le GPS courant');
assert.match(branding,/store-runner:departure-display-updated/,'le branding suit la résolution asynchrone de la ville');
assert.match(glass,/@media\(max-width:700px\)[\s\S]*\.phHeaderContext\{gap:0\}/,'sur mobile, départ et agenda sont visuellement rapprochés sans réduire les cibles');
assert.match(glass,/\.phHeaderContext \.phBase\{min-height:44px;padding:8px 0 0;align-items:flex-end\}/,'le départ reste tactile à 44 px tout en rapprochant son contenu');
assert.match(glass,/#calendarHomeStatus\{min-height:44px;align-items:flex-start\}/,'le statut Google reste tactile à 44 px et rapproche son contenu');
assert.match(branding,/display&&display\.kind==='saved'&&generic/,'les noms génériques de base enregistrée conservent l’adresse utile');
assert.match(branding,/display&&display\.kind==='gps'[\s\S]*display\.address/,'le tooltip GPS utilise le libellé résolu, pas baseAddress brut');
assert.match(profile,/store-runner:data-restored'[\s\S]*refreshDepartureDisplay/,'une restauration redéclenche la résolution du départ');

const renderHeader=core.slice(core.indexOf('function renderHeader()'),core.indexOf('function openDepartureSettings()'));
assert.match(renderHeader,/display\.title\+\(display\.detail/,'le Planning rend ville/position précise quand disponible');
assert.doesNotMatch(renderHeader,/Position GPS ·/,'le Planning ne doit pas reconstruire de coordonnées visibles');

function runtime(profile,{online=false,response=null,fetchImpl=null}={}){
  const values=new Map(),events=[];
  let fetches=0;
  const state={profile:structuredClone(profile)};
  const context={
    state,navigator:{onLine:online,geolocation:null},console,setTimeout,clearTimeout,AbortController,
    sessionStorage:{getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value))},
    fetch:async(...args)=>{fetches++;return fetchImpl?fetchImpl(...args):(response||{ok:false,json:async()=>({})})},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options&&options.detail}},
    document:{readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null},dispatchEvent(event){events.push(event)}},
    addEventListener(){},renderHeader(){}
  };
  context.window=context;
  vm.runInNewContext(profileSource,context,{filename:'profile-controller.js'});
  return{context,state,values,events,fetches:()=>fetches};
}

const profileSource=profile;
(async()=>{
  const gps={baseName:'Ma position actuelle',baseAddress:'Position GPS · 45.76400, 4.83570',baseLat:45.764,baseLon:4.8357};
  const offline=runtime(gps);
  const before=JSON.stringify(offline.state);
  assert.deepEqual(JSON.parse(JSON.stringify(offline.context.StoreRunnerProfile.departureDisplay())),{
    kind:'gps',title:'Position actuelle',detail:'Position précise',address:''
  },'hors ligne sans cache : fallback humain, sans coordonnées');
  assert.equal(JSON.stringify(offline.state),before,'le libellé de présentation ne modifie jamais state');
  assert.equal(offline.fetches(),0,'hors ligne : aucun reverse geocoding');

  const online=runtime(gps,{online:true,response:{ok:true,json:async()=>({display_name:'Place Bellecour, Lyon, France',address:{city:'Lyon'}})}});
  const onlineBefore=JSON.stringify(online.state);
  const resolved=await online.context.StoreRunnerProfile.refreshDepartureDisplay();
  assert.equal(resolved.title,'Lyon');
  assert.equal(resolved.detail,'Position précise');
  assert.equal(resolved.address,'Place Bellecour, Lyon, France');
  assert.equal(online.fetches(),1,'un seul reverse geocoding remplit le cache de présentation');
  assert.equal(JSON.stringify(online.state),onlineBefore,'le reverse geocoding ne convertit pas le GPS courant en base enregistrée');
  assert.ok(online.values.has('store-runner-departure-display-v1'),'le cache reste hors state');
  await online.context.StoreRunnerProfile.refreshDepartureDisplay();
  assert.equal(online.fetches(),1,'la ville en cache évite une seconde requête');
  assert.ok(online.events.some(event=>event.type==='store-runner:departure-display-updated'),'les surfaces sont rafraîchies après résolution');

  const saved={baseName:'Domicile',baseAddress:'12 rue Test, Lyon',baseLat:45.75,baseLon:4.85};
  const savedRuntime=runtime(saved,{online:true,response:{ok:true,json:async()=>({})}});
  assert.deepEqual(JSON.parse(JSON.stringify(savedRuntime.context.StoreRunnerProfile.departureDisplay())),{
    kind:'saved',title:'Domicile',detail:'12 rue Test, Lyon',address:'12 rue Test, Lyon'
  },'une base explicite conserve son libellé et son adresse');
  await savedRuntime.context.StoreRunnerProfile.refreshDepartureDisplay();
  assert.equal(savedRuntime.fetches(),0,'une base enregistrée ne déclenche aucun reverse geocoding de présentation');

  let releaseLookup;
  const race=runtime(gps,{online:true,fetchImpl:()=>new Promise(resolve=>{releaseLookup=resolve})});
  const pending=race.context.StoreRunnerProfile.refreshDepartureDisplay();
  while(!releaseLookup)await new Promise(resolve=>setImmediate(resolve));
  race.state.profile.baseLat=46.1956;
  race.state.profile.baseLon=6.2364;
  race.state.profile.baseAddress='Position GPS · 46.19560, 6.23640';
  releaseLookup({ok:true,json:async()=>({display_name:'Place Bellecour, Lyon, France',address:{city:'Lyon'}})});
  const afterRace=await pending;
  assert.equal(afterRace.title,'Position actuelle','une réponse obsolète ne doit pas étiqueter la nouvelle position');
  assert.equal(race.values.has('store-runner-departure-display-v1'),false,'une réponse obsolète ne doit jamais contaminer le cache de la nouvelle position');

  console.log('departure-display-v276: OK · rendu, cache, restauration/race et absence de mutation');
})().catch(error=>{console.error(error);process.exitCode=1});
