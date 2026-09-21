const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const hours=require('../store-opening-hours.js');
const legacy=require('../boulanger-default-hours.js');
const R=require('../reliability-core.js');
const rows=text=>hours.parseDayHours(text);
const clone=value=>JSON.parse(JSON.stringify(value));
const model={Lundi:rows('09:30-19:30'),Mardi:[],Mercredi:rows('09:00-12:30,14:00-19:00'),Dimanche:[]};
const stores=Array.from({length:15},(_,i)=>({id:'test-'+i,enseigne:i%2?' DÁR-TY. ':'Darty',ville:'Ville Test '+(i+1),adresse:'1 rue Fictive'}));
const state={schemaVersion:5,profile:{},settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:10,weekDate:'2026-09-21',startTime:'08:30',endTime:'18:00',visitMinutes:60},stores,plan:{Lundi:[{id:stores[0].id}]},appointments:[]};
hours.setBrandModel('Darty',model,state);
const opts={base:{},date:'2026-09-21',blocks:[],travelMinutes:()=>20,appointmentFor:()=>null};

assert.deepEqual(hours.intervalsFor(stores[0],'Lundi',state),model.Lundi,'sans override, héritage du modèle');
for(const brand of ['DARTY',' dárty ','D.a-r t’y','Darty'])assert.equal(hours.brandKey(brand),'darty');
assert.deepEqual(hours.intervalsFor(stores[1],'Lundi',state),model.Lundi);
assert.equal(hours.intervalsFor({type:'Darty',enseigne:'Magasin Test'},'Lundi',state),undefined,'store.type ne définit jamais une enseigne');
const custom={id:'custom',enseigne:'Darty',ville:'Ville Test B',openingHoursSource:'manual',openingHours:{Lundi:rows('10:00-18:00'),Mardi:[]}};
state.stores.push(custom);
assert.deepEqual(hours.intervalsFor(custom,'Lundi',state),custom.openingHours.Lundi,'priorité magasin');
assert.deepEqual(hours.intervalsFor(custom,'Mercredi',state),model.Mercredi,'priorité résolue jour par jour');
assert.deepEqual(hours.intervalsFor(custom,'Mardi',state),[],'fermeture explicite conservée');
assert.equal(hours.intervalsFor(stores[0],'Jeudi',state),undefined,'jour absent = inconnu');
assert.equal(hours.openingLabel(stores[0],'Jeudi',state),'Horaire à vérifier');
assert.equal(hours.openingLabel(stores[0],'Mardi',state),'Fermé');
assert.equal(hours.fitOpening(stores[0],'Mardi',540,60,state).closed,true);
assert.equal(hours.fitOpening(stores[0],'Mercredi',720,60,state).arrival,840,'deux créneaux : attendre la réouverture');
assert.equal(hours.fitWithBlocks(stores[0],'Mercredi',540,60,[{startMin:540,endMin:740}],state).arrival,840);

const scheduled=hours.scheduleRoute([{id:stores[0].id}],'Lundi',state,opts);
assert.equal(scheduled.rows[0].status,'wait-opening');
assert.equal(scheduled.rows[0].arrival,570);
assert.equal(scheduled.recommendedDeparture,550);
assert.equal(scheduled.estimatedEnd,650);
assert.equal(scheduled.unknownCount,0);
assert.deepEqual(scheduled.rows[0].opening,model.Lundi);
assert.equal(hours.routeFits([stores[0]],'Lundi',state,opts),true);
assert.equal(hours.routeFits([stores[0]],'Mardi',state,opts),false);
assert.equal(hours.scheduleRoute([stores[0]],'Mardi',state,opts).rows[0].status,'closed');
assert.equal(hours.scheduleRoute([stores[0]],'Lundi',state,{...opts,appointmentFor:()=>({time:'09:00',duration:60})}).appointmentConflicts,1);
assert.equal(hours.routeFits([stores[0]],'Lundi',{...state,settings:{...state.settings,endTime:'10:00'}},opts),false);

const beforeStores=JSON.stringify(state.stores),beforeSettings=JSON.stringify(state.settings),beforePlan=JSON.stringify(state.plan);
hours.setBrandModel('Darty',{...model,Lundi:rows('11:00-19:00')},state);
for(const store of stores.filter(s=>s!==custom))assert.deepEqual(hours.intervalsFor(store,'Lundi',state),rows('11:00-19:00'));
assert.equal(JSON.stringify(state.stores),beforeStores,'modification du modèle sans écriture dans les magasins');
assert.deepEqual(hours.intervalsFor(custom,'Lundi',state),rows('10:00-18:00'),'override individuel inchangé');
for(const store of stores.filter(s=>s!==custom))assert.equal(Object.hasOwn(store,'openingHours'),false,'aucune duplication');
const overrideSnapshot=clone(custom);hours.clearStoreOverride(custom);
assert.deepEqual(custom,{id:'custom',enseigne:'Darty',ville:'Ville Test B'});
assert.deepEqual(hours.intervalsFor(custom,'Lundi',state),rows('11:00-19:00'),'retour immédiat au modèle');
assert.equal(state.stores.length,16,'aucun magasin supprimé');
assert.equal(JSON.stringify(state.settings),beforeSettings,'ni dimanche travaillé ni target modifié');
assert.equal(JSON.stringify(state.plan),beforePlan,'aucune visite créée');
assert.deepEqual(state.brandOpeningHours.darty.Dimanche,[],'dimanche stocké');

// Modèle volontairement vide : inconnu, y compris face aux anciens défauts.
const historical={id:'old',enseigne:'Darty',ville:'Ville Test A'};legacy.applyStore(historical,{});
hours.setBrandModel('Darty',{},state);
assert.equal(hours.intervalsFor(historical,'Lundi',state),undefined);
assert.equal(legacy.applyStore(stores[0],state),false,'le module historique ne remplit aucun héritier V230');
assert.equal(hours.intervalsFor({enseigne:'Darty',openingHoursSource:'manual'},'Lundi',state),undefined);
hours.setBrandModel('Darty',model,state);
assert.deepEqual(hours.intervalsFor(historical,'Lundi',state),model.Lundi,'ancien brand-default = fallback, pas override');
assert.deepEqual(hours.intervalsFor({enseigne:'Darty',openingHoursSource:'manual'},'Lundi',state),model.Lundi,'absence de jour manuel = héritage');
const legacyExplicit={enseigne:'Darty',openTime:'08:00',closeTime:'18:00'};
assert.deepEqual(hours.intervalsFor(legacyExplicit,'Lundi',state),rows('08:00-18:00'));
hours.clearStoreOverride(legacyExplicit);
assert.deepEqual(hours.intervalsFor(legacyExplicit,'Lundi',state),model.Lundi,'retour enseigne retire aussi les anciens champs spécifiques');
const returned=hours.intervalsFor(stores[0],'Lundi',state);returned[0].open='00:00';assert.deepEqual(state.brandOpeningHours.darty.Lundi,model.Lundi);

// Oracle V229 figé : tous les états sans modèle conservent exactement leur résolution.
function v229(store,day){
  if(!store)return undefined;
  if(store.openingHours&&typeof store.openingHours==='object'){
    const value=store.openingHours[day];return typeof value==='string'?rows(value):value;
  }
  if(store.openingHoursSource==='manual')return undefined;
  return store.openTime&&store.closeTime?rows(store.openTime+'-'+store.closeTime):undefined;
}
for(const store of [null,{},overrideSnapshot,historical,{openingHours:{}},{openingHours:{Mardi:[]},openTime:'08:00',closeTime:'19:00'},{openingHoursSource:'manual',openTime:'08:00',closeTime:'19:00'},{openTime:'08:00',closeTime:'19:00'}]){
  for(const day of hours.MODEL_DAYS)assert.deepEqual(hours.intervalsFor(store,day,{stores:[]}),v229(store,day));
}
for(const enseigne of ['Darty','Boulanger']){
  const store={enseigne};assert.equal(legacy.applyStore(store,{}),true);assert.deepEqual(hours.intervalsFor(store,'Lundi',{}),rows('09:30-19:30'));assert.equal(hours.intervalsFor(store,'Dimanche',{}),undefined);
  const st={brandOpeningHours:{[hours.brandKey(enseigne)]:{Lundi:[]}}};assert.equal(legacy.applyStore(store,st),false);assert.deepEqual(hours.intervalsFor(store,'Lundi',st),[]);
}

class DB{constructor(){this.map=new Map()}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
const db=new DB();global.state=state;global.localStorage=db;
R.save(state,db);const bundle=R.capture(state,db);const clean=new DB();R.persist(R.decode(JSON.stringify(bundle),{}),clean);
assert.deepEqual(R.load(clean),state,'sauvegarde/restauration complète');
const restored=R.restore(bundle,db);assert.deepEqual(restored.brandOpeningHours,state.brandOpeningHours);
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../store-opening-hours.js'),'utf8'),ctx);ctx.state=JSON.parse(db.getItem(R.keys.MAIN));
assert.equal(JSON.stringify(ctx.StoreOpeningHoursV1.intervalsFor(ctx.state.stores[0],'Lundi')),JSON.stringify(model.Lundi),'module rechargé sans registre caché');
ctx.state={...ctx.state,brandOpeningHours:{darty:{Lundi:[]}}};assert.equal(JSON.stringify(ctx.StoreOpeningHoursV1.intervalsFor(ctx.state.stores[0],'Lundi')),'[]','nouvel objet restauré consulté immédiatement');
const old=clone(state);delete old.brandOpeningHours;R.persist(R.capture(old,db),clean);assert.equal(Object.hasOwn(R.load(clean),'brandOpeningHours'),false,'ancienne sauvegarde sans migration');
for(const invalid of [[],null,{Darty:{}},{darty:{Lundi:'fermé'}},{darty:{Lundi:[{open:'19:00',close:'09:00'}]}},{darty:{Inconnu:[]}},JSON.parse('{"__proto__":{}}')])assert.throws(()=>R.validateState({...state,brandOpeningHours:invalid}));

// Ownership : une seule définition du parseur et de l'ordonnanceur dans le runtime.
const index=fs.readFileSync('index.html','utf8'),source=fs.readFileSync('store-opening-hours.js','utf8'),adapter=fs.readFileSync('boulanger-default-hours.js','utf8');
const files=[...new Set([...index.matchAll(/['"]\.\/([A-Za-z0-9_./-]+\.js)['"]/g)].map(m=>m[1]))];
for(const name of ['parseDayHours','intervalsFor','fitOpening','fitWithBlocks','scheduleRoute']){
  const owners=files.filter(file=>new RegExp('function '+name+'\\(').test(fs.readFileSync(file,'utf8')));assert.deepEqual(owners,['store-opening-hours.js'],name+' : propriétaire unique');
}
for(const file of ['planning-cascade-v181.js','priority-campaign-v187.js'])assert.match(fs.readFileSync(file,'utf8'),/api\.routeFits\(/,'les helpers historiques routeFits délèguent au moteur');
assert.deepEqual(files.filter(file=>/function routeFits\(/.test(fs.readFileSync(file,'utf8'))).sort(),['planning-cascade-v181.js','priority-campaign-v187.js','store-opening-hours.js'],'aucun nouveau routeFits concurrent');
assert.match(fs.readFileSync('calendar-enhancements.js','utf8'),/if\(window\.StoreOpeningHoursV1\)return;/,'le décorateur historique reste désactivé quand le moteur unique est chargé');
assert.match(adapter,/hours\.legacyBrandDefaults/);assert.doesNotMatch(adapter,/function (defaultHours|shouldApply|applyStore)|09:30.*19:30.*const/);
assert.doesNotMatch(source,/store\.type|setInterval\s*\(|root\.(generateWeek|renderAll|syncGoogleCalendar)\s*=(?!=)/);
assert.match(index,/'\.\/store-opening-hours.js','\.\/boulanger-default-hours.js'/,'ordre de chargement historique conservé');
console.log('V230: hiérarchie, héritage dynamique, planning, dimanches, V229, Darty/Boulanger, sauvegarde/restauration/reload et ownership OK');
