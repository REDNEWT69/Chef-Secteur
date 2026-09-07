(function(){
'use strict';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const RANGE_KEY='chef_sector_range_v1';
function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function load(k){try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(e){return{}}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function resolveStore(x){try{return (state.stores||[]).find(s=>String(s.id)===String(x.id))||x}catch(e){return x}}
function blocked(date){try{const rows=typeof window.calendarEventsForDate==='function'?window.calendarEventsForDate(date):[];return rows.some(e=>e.allDay||e.planningBlock)}catch(e){return false}}
function optimize(route){try{if(typeof window.nearestRoute==='function'&&typeof window.twoOpt==='function')return window.twoOpt(window.nearestRoute(route));if(typeof window.nearestRoute==='function')return window.nearestRoute(route)}catch(e){}return route}
function rebalanceWeek(key,snap,range){if(!snap||!snap.plan)return false;const mon=parse(snap.weekMonday||key);if(!mon)return false;const start=parse(range.start),end=parse(range.end),workDays=(range.workDays||((state.settings&&state.settings.days)||DAYS.slice(0,5))).slice();const usable=[];for(let i=0;i<DAYS.length;i++){const day=DAYS[i],dt=addDays(mon,i);if(start&&dt<start)continue;if(end&&dt>end)continue;if(!workDays.includes(day))continue;if(blocked(iso(dt)))continue;usable.push(day)}if(!usable.length)return false;let total=0;for(const d of usable)total+=(snap.plan[d]||[]).length;if(total<usable.length)return false;let changed=false;for(const empty of usable.filter(d=>!(snap.plan[d]||[]).length)){let donor=null;for(const d of usable){if((snap.plan[d]||[]).length>1&&(!donor||(snap.plan[d]||[]).length>(snap.plan[donor]||[]).length))donor=d}if(!donor)break;const moved=snap.plan[donor].pop();snap.plan[empty]=[moved];snap.plan[donor]=optimize((snap.plan[donor]||[]).map(resolveStore)).map(s=>({id:s.id,enseigne:s.enseigne,ville:s.ville,adresse:s.adresse,dept:s.dept,lat:s.lat,lon:s.lon,freq:s.freq,priority:s.priority,lastVisit:s.lastVisit,intervalDays:s.intervalDays}));changed=true}return changed}
function apply(){const range=load(RANGE_KEY),archive=load(ARCHIVE_KEY);if(!range.start||!range.end)return false;let changed=false;for(const k of Object.keys(archive))if(rebalanceWeek(k,archive[k],range))changed=true;if(changed){save(ARCHIVE_KEY,archive);try{const wk=(state.settings&&state.settings.weekDate)||'';const snap=archive[wk];if(snap&&snap.plan){state.plan={};for(const d of DAYS)state.plan[d]=(snap.plan[d]||[]).map(resolveStore);if(typeof window.save==='function')window.save();if(typeof window.renderAll==='function')window.renderAll()}}catch(e){}}return changed}
function filterWeekNumberEvents(){if(window.__weekNumberEventFilter||typeof window.calendarEventsForDate!=='function')return;const base=window.calendarEventsForDate;window.calendarEventsForDate=function(date){const rows=base.apply(this,arguments)||[];return rows.filter(e=>!/^(semaine\s+\d+\s+de\s+\d{4})$/i.test(String((e&&e.title)||'').trim()))};window.__weekNumberEventFilter=true}
function boot(){filterWeekNumberEvents();apply()}
window.addEventListener('chef-range-generated',()=>setTimeout(apply,80));
let n=0,t=setInterval(()=>{n++;filterWeekNumberEvents();if(apply()||n>80)clearInterval(t)},120);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();