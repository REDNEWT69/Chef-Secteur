const fs=require('fs');
const vm=require('vm');
const assert=require('assert/strict');

// V253 — benchmark d'acceptation du moteur actuel.
// La fixture de 58 magasins est représentative du parc de référence du benchmark V241 ;
// ce n'est pas un export des données locales du téléphone. Aucun accès réseau ici : la
// matrice V248 est simulée de façon déterministe à partir de la géographie de la fixture.

const ROOT=__dirname+'/..';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
const ALL_DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const START='2026-09-07';
const END='2026-11-06'; // 9 semaines complètes
const TARGET=15;
const MAX_CREDITS=4;
const BASE={id:'BASE',lat:45.75,lon:4.85};

function hav(a,b){
  const R=6371,dla=(b.lat-a.lat)*Math.PI/180,dlo=(b.lon-a.lon)*Math.PI/180;
  const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180;
  const x=Math.sin(dla/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function roadKm(a,b){return hav(a,b)*1.22}
function roadMinutes(a,b){return roadKm(a,b)/55*60}
function routeKm(route){
  if(!route.length)return 0;let km=roadKm(BASE,route[0]);
  for(let i=1;i<route.length;i++)km+=roadKm(route[i-1],route[i]);
  km+=roadKm(route[route.length-1],BASE);return km;
}
function bearingDeg(a,b){
  const la1=a.lat*Math.PI/180,la2=b.lat*Math.PI/180,dlo=(b.lon-a.lon)*Math.PI/180;
  const y=Math.sin(dlo)*Math.cos(la2),x=Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dlo);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function octant(deg){return Math.floor(((deg+22.5)%360)/45)}
function zoneChanges(route){
  if(route.length<2)return 0;let prev=octant(bearingDeg(BASE,route[0])),n=0;
  for(let i=1;i<route.length;i++){const z=octant(bearingDeg(BASE,route[i]));if(z!==prev)n++;prev=z}
  return n;
}
function makeFixture(){
  const lobes=[{bearing:15,count:20},{bearing:140,count:20},{bearing:250,count:18}];
  const brands=['Fnac','Carrefour','Darty','Fnac','Boulanger'];
  const stores=[];let id=1;
  for(const lobe of lobes)for(let k=0;k<lobe.count;k++){
    const frac=k/Math.max(1,lobe.count-1),distance=4+frac*66,jitter=((id*37)%25)-12;
    const rad=(lobe.bearing+jitter)*Math.PI/180;
    const dLat=(distance/111)*Math.cos(rad),dLon=(distance/(111*Math.cos(BASE.lat*Math.PI/180)))*Math.sin(rad);
    const enseigne=brands[id%brands.length];
    stores.push({id:'s'+id,enseigne,ville:'Ville '+id,adresse:id+' rue Test',dept:'69',lat:BASE.lat+dLat,lon:BASE.lon+dLon,priority:1+(id%5),intervalDays:[7,15,30,30,30,90][id%6],visitMinutes:45,active:true});
    id++;
  }
  return stores;
}
function credit(store){return /^(Darty|Boulanger)$/i.test(String(store&&store.enseigne||''))?2:1}
function memberSig(route){return route.map(s=>String(s.id)).sort().join('|')}

const source=fs.readFileSync(ROOT+'/range-planner-v2.js','utf8')
  .replace('window.generatePlanningRange=generateRange;', 'window.__v253={generateRange,routeCredits};window.generatePlanningRange=generateRange;');

function makeRangeEnv(stores){
  const els={weekDate:{value:START},rangeStart:{value:START},rangeEnd:{value:END},endTime:{value:'18:00'},maxVisitsPerDay:{value:String(MAX_CREDITS)},generateRangeBtn:{disabled:false},rangePlanStatus:{style:{}},statusText:{textContent:''}};
  const proposals=[];
  const state={settings:{days:DAYS.slice(),target:TARGET,weekDate:START,startTime:'08:30',endTime:'18:00',visitMinutes:45,maxVisitsPerDay:MAX_CREDITS},profile:{baseLat:BASE.lat,baseLon:BASE.lon},stores:stores.map(s=>({...s})),plan:{Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},included:{},excluded:{},locks:{},appointments:[],calendarEvents:[]};
  const ctx={
    state,console,Date,Map,Set,JSON,Object,Array,String,Number,Math,RegExp,
    CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    document:{readyState:'loading',hidden:false,head:{appendChild(){}},body:{appendChild(){}},addEventListener(){},removeEventListener(){},createElement:()=>({style:{},classList:{add(){},remove(){},contains:()=>false,toggle(){}},dataset:{},appendChild(){},addEventListener(){},insertAdjacentElement(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[]}),getElementById:id=>els[id]||null,querySelector:()=>null,querySelectorAll:selector=>selector==='[data-brand]'?[]:DAYS.map(value=>({value,checked:true}))},
    addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout,clearTimeout,
    confirm:()=>true,readPlanningControls(){},save(){},renderAll(){},initControls(){},includedByFilters:()=>true,
    hav,havBase:s=>hav(BASE,s),baseObj:()=>BASE,
    // L'ordre est volontairement laissé tel que produit par l'affectation. V251 est la
    // couche qui doit ensuite démontrer le gain d'ordre routier.
    nearestRoute:r=>r.slice(),twoOpt:r=>r.slice(),
    MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>fn(),
    ChefReliability:{checkpoint(){},propose:async candidate=>{proposals.push(candidate);return false}},
    syncGoogleCalendar:async()=>({ok:true}),calendarEventsForDate:()=>[],
    storeVisitCredit:credit,
    StoreRunnerRoadMatrixV248:{distanceKm:(a,b)=>roadKm(a,b),durationMinutes:(a,b)=>roadMinutes(a,b)}
  };
  ctx.window=ctx;vm.runInNewContext(source,ctx,{filename:'range-planner-v2.js'});return{ctx,state,proposals};
}
function snapshots(proposal){return Object.values((proposal&&proposal.archive)||{}).filter(x=>x&&x.plan).sort((a,b)=>String(a.weekMonday).localeCompare(String(b.weekMonday)))}

(async()=>{
  const stores=makeFixture();assert.equal(stores.length,58);
  const env=makeRangeEnv(stores);await env.ctx.__v253.generateRange();
  assert.equal(env.proposals.length,1,'le benchmark doit produire une proposition de période');
  const weeks=snapshots(env.proposals[0]);
  assert.equal(weeks.length,9,'la période de référence doit couvrir 9 semaines');

  // Configure la même matrice déterministe pour le vrai optimiseur V251.
  global.baseObj=()=>BASE;global.hav=hav;
  global.StoreRunnerRoadMatrixV248={distanceKm:(a,b)=>roadKm(a,b),durationMinutes:(a,b)=>roadMinutes(a,b)};
  delete global.StoreOpeningHoursV1;
  const optimizer=require('../planning-route-optimizer-v251.js');
  const state={profile:{baseLat:BASE.lat,baseLon:BASE.lon},settings:{weekDate:START,startTime:'08:30',endTime:'18:00',visitMinutes:45},appointments:[],stores,manualWeekEdits:{}};

  const seen=new Map();let placements=0,rawKm=0,optKm=0,rawDrive=0,optDrive=0,changedDays=0,rawZones=0,optZones=0,rawInfeasible=0,optInfeasible=0;
  for(const week of weeks){
    for(const day of DAYS){
      const route=week.plan[day]||[];for(const s of route){seen.set(s.id,(seen.get(s.id)||0)+1);placements++}
      const beforeMembers=memberSig(route),b=optimizer.explainOptimization(route,day,state,{weekMonday:week.weekMonday}),after=b.route;
      assert.equal(memberSig(after),beforeMembers,week.weekMonday+' '+day+' : V251 ne doit ni ajouter ni retirer de magasin');
      rawKm+=routeKm(route);optKm+=routeKm(after);rawZones+=zoneChanges(route);optZones+=zoneChanges(after);
      if(Number.isFinite(b.before.driveMinutes))rawDrive+=b.before.driveMinutes;
      if(Number.isFinite(b.after.driveMinutes))optDrive+=b.after.driveMinutes;
      if(!b.before.feasible&&route.length)rawInfeasible++;
      if(!b.after.feasible&&route.length)optInfeasible++;
      if(b.changed)changedDays++;
      if(b.before.feasible&&b.after.feasible)assert.ok(b.after.driveMinutes<=b.before.driveMinutes+0.11,week.weekMonday+' '+day+' : l’optimisation ne doit pas augmenter la conduite');
    }
  }

  const unique=seen.size,coverage=Math.round(unique/stores.length*1000)/10,neverVisited=stores.length-unique;
  const result={weeks:weeks.length,stores:stores.length,placements,uniqueCoverage:unique,coveragePct:coverage,neverVisited,changedDays,rawKm:Math.round(rawKm),optimizedKm:Math.round(optKm),kmGain:Math.round(rawKm-optKm),rawDriveMinutes:Math.round(rawDrive),optimizedDriveMinutes:Math.round(optDrive),driveGainMinutes:Math.round(rawDrive-optDrive),rawZoneChanges:rawZones,optimizedZoneChanges:optZones,rawInfeasibleDays:rawInfeasible,optimizedInfeasibleDays:optInfeasible};

  assert.ok(coverage>=95,'la rotation actuelle doit couvrir au moins 95% du parc représentatif : '+coverage+'%');
  assert.equal(neverVisited,0,'aucun des 58 magasins ne doit rester hors rotation sur 9 semaines');
  assert.ok(optDrive<=rawDrive+0.11,'V251 ne doit pas augmenter le temps de conduite total');
  assert.ok(optKm<=rawKm+0.11,'V251 ne doit pas augmenter le kilométrage total sur la matrice déterministe');
  assert.ok(optInfeasible<=rawInfeasible,'V251 ne doit pas créer de nouvelle journée infaisable');
  assert.ok(changedDays>0,'le benchmark doit contenir au moins une journée où V251 démontre un gain');

  console.log('=== V253 benchmark moteur planning · 58 magasins · 9 semaines ===');
  console.table([result]);
  console.log('planning-engine-benchmark-v253: OK — '+JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1});
