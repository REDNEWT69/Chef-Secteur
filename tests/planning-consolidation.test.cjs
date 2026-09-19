const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const Manual=require('../planning-manual-visits.js');
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE='chef_sector_plan_archive_v1',MAIN='sector_planner_universal_v1';
const copy=x=>JSON.parse(JSON.stringify(x));
const empty=()=>Object.fromEntries(DAYS.map(d=>[d,[]]));
const store=(id,extra={})=>({id,enseigne:'Fnac',ville:id,active:true,lat:45,lon:4,...extra});
function env(){
  const mem=new Map(),db={getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k),flush:async()=>{}};
  const state={schemaVersion:5,profile:{},settings:{weekDate:'2026-09-21',days:DAYS.slice(0,5),maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00',visitMinutes:60},stores:[],plan:empty(),locks:{},appointments:[],visits:{},manualWeekEdits:{}};
  const RealDate=Date;class Clock extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-21T07:00:00']))}static now(){return new RealDate('2026-09-21T07:00:00').getTime()}}
  const ctx={state,console,Date:Clock,document:{readyState:'loading',addEventListener(){},dispatchEvent(){},getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null},addEventListener(){},localStorage:db,__chefStorage:db,CustomEvent:class{},save(){db.setItem(MAIN,JSON.stringify(state))},renderAll(){},setTimeout,clearTimeout};
  ctx.window=ctx;
  for(const name of ['visit-counting.js','store-opening-hours.js','planning-cascade-v181.js'])vm.runInNewContext(fs.readFileSync(__dirname+'/../'+name,'utf8'),ctx);
  // The cascade exposes its entry points at DOMContentLoaded.
  vm.runInNewContext(fs.readFileSync(__dirname+'/../planning-cascade-v181.js','utf8').replace("if(document.readyState==='loading')","if(false)"),ctx);
  return{ctx,state,db,mem,build:()=>ctx.__storeRunnerBuildRemainingWeekPlan()};
}
test('cascade respects current store hours even when archived snapshots omit them',()=>{
  const t=env(),a=store('closed',{openingHours:{Lundi:[],Mardi:[{open:'10:00',close:'12:00'}]}});
  t.state.stores=[a];t.state.plan.Lundi=[store('closed')];
  const r=t.build();assert.equal(r.ok,true,r.error);assert.equal(r.plan.Lundi.length,0);assert.equal(r.plan.Mardi[0].id,'closed');
});
test('cascade keeps two one-credit Boulanger on distinct days',()=>{
  const t=env();t.state.stores=[store('b1',{enseigne:'Boulanger',visitCreditOverride:1}),store('b2',{enseigne:'Boulanger',visitCreditOverride:1})];t.state.plan.Lundi=t.state.stores;
  const r=t.build();assert.equal(r.ok,true,r.error);assert.equal(r.plan.Lundi.length,1);assert.equal(r.plan.Mardi.length,1);
});
test('spillover preserves recurring occurrences without repeating a store within a week',()=>{
  const t=env(),a=store('repeat');t.state.settings.days=['Jeudi','Vendredi'];t.state.settings.maxVisitsPerDay=1;t.state.stores=[a,store('fixed')];t.state.plan.Vendredi=[t.state.stores[1],a];t.state.locks.fixed={day:'Vendredi',week:'2026-09-21'};
  const next=empty();next.Jeudi=[a];t.db.setItem(ARCHIVE,JSON.stringify({'2026-09-28':{plan:next}}));
  const r=t.build();assert.equal(r.ok,true,r.error);
  for(const plan of Object.values(r.weeks)){const ids=Object.values(plan).flat().map(s=>s.id);assert.equal(ids.length,new Set(ids).size)}
  assert.equal(Object.values(r.weeks).flatMap(p=>Object.values(p).flat()).length,3);
});
test('invalid duplicate input is rejected without silently deleting a visit',()=>{
  const t=env(),a=store('a');t.state.stores=[a];t.state.plan.Lundi=[a];t.state.plan.Mardi=[a];const before=JSON.stringify(t.state);
  const r=t.build();assert.equal(r.ok,false);assert.match(r.error,/double|doublon/i);assert.equal(JSON.stringify(t.state),before);
});
test('manual move supersedes the old recurring lock and survives storage reload',async()=>{
  const t=env(),a=store('a');t.state.stores=[a];t.state.plan.Lundi=[a];t.state.locks.a='Lundi';t.ctx.storeRunnerLockInfo=()=>({day:'Lundi',recurring:true});
  assert.equal((await Manual.addStore(t.ctx,'a','Mardi')).ok,true);
  assert.deepEqual(copy(t.state.locks.a),{day:'Mardi',week:'2026-09-21'});
  const restored=JSON.parse(t.db.getItem(MAIN));assert.equal(restored.plan.Mardi[0].id,'a');assert.equal(t.build().plan.Mardi[0].id,'a');
});
test('manual storage failure never reports a successful edit',async()=>{
  const t=env(),a=store('a');t.state.stores=[a];t.state.plan.Lundi=[a];t.ctx.save=()=>{throw Error('quota')};const before=JSON.stringify(t.state.plan);
  const result=await Manual.addStore(t.ctx,'a','Mardi');assert.equal(result.ok,false);assert.match(result.error,/quota/);assert.equal(JSON.stringify(t.state.plan),before);
});

