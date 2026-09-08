const assert=require('assert/strict'),R=require(__dirname+'/../reliability-core.js');
class DB{constructor(){this.map=new Map();this.fail=null}getItem(k){return this.map.get(k)??null}setItem(k,v){if(this.fail===k){this.fail=null;throw Error('quota')}this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
const original={schemaVersion:5,profile:{sectorName:'Rhône-Alpes'},settings:{days:['Lundi'],endTime:'18:00'},stores:[{id:'x',enseigne:'Darty',ville:'Lyon',lat:45,lon:4}],notes:{x:'Note à conserver'},visits:{x:{history:['2026-09-01']}},included:{},excluded:{},locks:{},plan:{Lundi:[{id:'x'}]},appointments:[{id:'a',storeId:'x',date:'2026-09-08',time:'09:00'}],calendarEvents:[]};
const db=new DB();global.state=structuredClone(original);global.localStorage=db;
db.setItem(R.keys.MAIN,JSON.stringify(original));db.setItem(R.keys.ARCHIVE,JSON.stringify({'2026-09-07':{plan:original.plan}}));db.setItem(R.keys.RANGE,JSON.stringify({start:'2026-09-07',end:'2026-09-11'}));db.setItem('chef_secteur_google_token_v2','SECRET');
const bundle=R.capture(original,db);assert(!JSON.stringify(bundle).includes('SECRET'));
const clean=new DB();R.persist(R.decode(JSON.stringify(bundle),{}),clean);assert.deepEqual(R.load(clean),original);assert.deepEqual(JSON.parse(clean.getItem(R.keys.ARCHIVE)),bundle.archive);assert.deepEqual(JSON.parse(clean.getItem(R.keys.RANGE)),bundle.range);
assert.equal(R.decode(JSON.stringify(original),original).state.schemaVersion,5);
for(let i=0;i<10;i++)R.checkpoint('test '+i,db,bundle);assert.equal(R.backups(db).length,8);
const replacement=structuredClone(bundle);replacement.state.notes.x='Changed';const before=[R.keys.MAIN,R.keys.ARCHIVE,R.keys.RANGE].map(k=>db.getItem(k));db.fail=R.keys.MAIN;assert.throws(()=>R.persist(replacement,db));assert.deepEqual([R.keys.MAIN,R.keys.ARCHIVE,R.keys.RANGE].map(k=>db.getItem(k)),before);assert.equal(db.getItem(R.keys.JOURNAL),null);
const bad=structuredClone(bundle);bad.state.stores.push({...bad.state.stores[0]});assert.throws(()=>R.validate(bad));assert.throws(()=>R.decode('{"__proto__":{}}',original));assert.throws(()=>R.decode('{"schemaVersion":5}',original));
const old=structuredClone(original);old.schemaVersion=3;assert.equal(R.decode(JSON.stringify(old),original).state.schemaVersion,5);
const restored=R.restore(replacement,db);assert.equal(restored.notes.x,'Changed');assert(R.backups(db).some(x=>x.reason==='Avant restauration'));
const issues=R.planIssues({Lundi:[{id:'x'},{id:'x'}],Samedi:[{id:'x'}]},original,'2026-09-07');assert(issues.some(x=>x.includes('double')));assert(issues.some(x=>x.includes('pas travaillé')));
// Interrupted transaction recovered before load.
db.setItem(R.keys.JOURNAL,JSON.stringify(Object.fromEntries([R.keys.MAIN,R.keys.ARCHIVE,R.keys.RANGE].map((k,i)=>[k,before[i]]))));db.setItem(R.keys.MAIN,'{}');assert.deepEqual(R.load(db),original);
db.setItem(R.keys.MAIN,'BROKEN');assert.throws(()=>R.load(db));assert.throws(()=>R.save(original,db));assert.equal(db.getItem(R.keys.MAIN),'BROKEN');assert.deepEqual(R.restore(bundle,db),original);
console.log('PASS: complete restore to empty browser; v3/v5 imports; 8 versions; token exclusion; malformed imports; quota rollback; interrupted recovery; corrupt-data protection; plan checks.');
