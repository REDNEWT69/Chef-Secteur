/* Durable application data only. OAuth tokens are never exported. */
(function(root){
'use strict';
const MAIN='sector_planner_universal_v1', ARCHIVE='chef_sector_plan_archive_v1', RANGE='chef_sector_range_v1';
const BACKUPS='chef_recovery_backups_v1', JOURNAL='chef_recovery_transaction_v1', EXPORT='chef_last_export_v1';
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
let blocked=false;
const copy=x=>JSON.parse(JSON.stringify(x));
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function safeKeys(x){if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Clé de données interdite.');safeKeys(x[k])}}
function validateState(s){
 if(!object(s)||![3,4,5].includes(Number(s.schemaVersion))||!Array.isArray(s.stores)||!object(s.profile)||!object(s.settings))throw Error('Sauvegarde incomplète ou version non prise en charge.');
 safeKeys(s);const ids=new Set();
 for(const x of s.stores){if(!object(x)||!['string','number'].includes(typeof x.id)||!String(x.id)||ids.has(String(x.id))||typeof x.enseigne!=='string'||typeof x.ville!=='string')throw Error('Magasin invalide ou identifiant en double.');ids.add(String(x.id))}
 for(const k of ['visits','notes','included','excluded','locks','plan'])if(s[k]!==undefined&&!object(s[k]))throw Error('Données invalides : '+k);
 if(s.appointments!==undefined&&(!Array.isArray(s.appointments)||s.appointments.some(a=>!object(a)||!ids.has(String(a.storeId))||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!/^\d{2}:\d{2}$/.test(a.time))))throw Error('Rendez-vous invalides.');
 if(s.calendarEvents!==undefined&&(!Array.isArray(s.calendarEvents)||s.calendarEvents.some(e=>!object(e)||typeof e.date!=='string')))throw Error('Agenda invalide.');
 validatePlanShape(s.plan||{},ids);return s;
}
function validatePlanShape(plan,ids){if(!object(plan))throw Error('Planning invalide.');for(const [day,list] of Object.entries(plan)){if(!DAYS.includes(day)||!Array.isArray(list)||list.some(s=>!object(s)||!ids.has(String(s.id))))throw Error('Planning contenant un jour ou un magasin inconnu.')}}
function validate(bundle){
 if(!object(bundle)||bundle.format!=='ChefSecteurBackup'||bundle.version!==1)throw Error('Format de sauvegarde non reconnu.');
 validateState(bundle.state);safeKeys(bundle);
 if(!object(bundle.archive)||(bundle.range!==null&&!object(bundle.range)))throw Error('Archives invalides.');
 for(const [date,snap] of Object.entries(bundle.archive)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!object(snap))throw Error('Semaine archivée invalide.');
 // Archived stores may have been removed from the current sector; their snapshots remain restorable.
 if(!object(snap.plan))throw Error('Planning archivé invalide.');for(const [day,rows] of Object.entries(snap.plan))if(!DAYS.includes(day)||!Array.isArray(rows)||rows.some(x=>!object(x)||!x.id))throw Error('Visites archivées invalides.');}
 return bundle;
}
function capture(s=root.state,db=root.localStorage){return validate({format:'ChefSecteurBackup',version:1,createdAt:new Date().toISOString(),state:copy(s),archive:JSON.parse(db.getItem(ARCHIVE)||'{}'),range:JSON.parse(db.getItem(RANGE)||'null')})}
function backups(db=root.localStorage){const rows=JSON.parse(db.getItem(BACKUPS)||'[]');if(!Array.isArray(rows))throw Error('Historique de sauvegardes illisible.');return rows}
function checkpoint(reason,db=root.localStorage,bundle=capture(root.state,db)){
 if(blocked)throw Error('Restaure une sauvegarde avant de modifier les données.');
 const row={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),reason,date:new Date().toISOString(),bundle:copy(bundle)};
 let rows=backups(db);rows.unshift(row);rows=rows.slice(0,8);
 while(true){try{db.setItem(BACKUPS,JSON.stringify(rows));break}catch(e){if(rows.length<=2)throw Error('Espace insuffisant : exporte une sauvegarde avant de continuer.');rows.pop()}}
 return row;
}
function recover(db=root.localStorage){const raw=db.getItem(JOURNAL);if(!raw)return;const before=JSON.parse(raw);for(const k of [MAIN,ARCHIVE,RANGE]){if(before[k]===null)db.removeItem(k);else if(typeof before[k]==='string')db.setItem(k,before[k]);else throw Error('Journal de récupération invalide.')}db.removeItem(JOURNAL)}
function persist(bundle,db=root.localStorage){
 validate(bundle);const before=Object.fromEntries([MAIN,ARCHIVE,RANGE].map(k=>[k,db.getItem(k)]));
 db.setItem(JOURNAL,JSON.stringify(before));
 try{db.setItem(ARCHIVE,JSON.stringify(bundle.archive));if(bundle.range===null)db.removeItem(RANGE);else db.setItem(RANGE,JSON.stringify(bundle.range));db.setItem(MAIN,JSON.stringify(bundle.state));db.removeItem(JOURNAL)}catch(e){try{recover(db)}catch(_){blocked=true}throw Error('Enregistrement interrompu : données précédentes conservées ou récupération requise. '+e.message)}
}
function load(db=root.localStorage){try{recover(db);const raw=db.getItem(MAIN);return raw?validateState(JSON.parse(raw)):null}catch(e){blocked=true;throw Error('Données locales illisibles. Elles ne seront pas écrasées. Ouvre Plus → Données → Sauvegardes. '+e.message)}}
function save(s,db=root.localStorage){if(blocked)throw Error('Écriture bloquée pour protéger les données : utilise la restauration.');validateState(s);const previous=db.getItem(MAIN);if(previous&&previous!==JSON.stringify(s)){
 const rows=backups(db),last=rows[0];if(!last||Date.now()-Date.parse(last.date)>15*60*1000)checkpoint('Avant les dernières modifications',db,capture(JSON.parse(previous),db));
 }db.setItem(MAIN,JSON.stringify(s));return true}
function decode(text,current){
 if(text.length>20*1024*1024)throw Error('Fichier trop volumineux (20 Mo maximum).');const data=JSON.parse(text);safeKeys(data);
 if(data.format==='ChefSecteurBackup')return validate(data);
 if([3,4,5].includes(Number(data.schemaVersion))){const s=copy(data);s.schemaVersion=5;return validate({format:'ChefSecteurBackup',version:1,state:s,archive:{},range:null})}
 if(data.format==='SectorPlanner'&&Array.isArray(data.stores)){const s=copy(current);Object.assign(s,{schemaVersion:5,profile:data.profile||s.profile,stores:data.stores,visits:data.visits||{},notes:data.notes||{},included:{},excluded:{},locks:{},plan:{},appointments:[],calendarEvents:[]});return validate({format:'ChefSecteurBackup',version:1,state:s,archive:{},range:null})}
 throw Error('Format non reconnu.');
}
function restore(bundle,db=root.localStorage){validate(bundle);if(!blocked)checkpoint('Avant restauration',db);persist(bundle,db);blocked=false;return copy(bundle.state)}
function planIssues(plan,s,date){
 const issues=[],seen=new Set(),validIds=new Set(s.stores.map(x=>String(x.id)));validatePlanShape(plan,validIds);
 for(const [day,rows] of Object.entries(plan)){
  if(rows.length&&!(s.settings.days||DAYS.slice(0,5)).includes(day))issues.push(day+' n’est pas travaillé.');
  let minutes=clock(day==='Samedi'?(s.settings.saturdayStart||'08:00'):(s.settings.startTime||'08:30'));const end=clock(day==='Samedi'?(s.settings.saturdayEnd||'12:00'):(s.settings.endTime||'18:00'));
  const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+DAYS.indexOf(day));const iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const events=(s.calendarEvents||[]).filter(e=>e.date===iso);
  const appointments=(s.appointments||[]).filter(a=>a.date===iso);
  for(let i=0;i<rows.length;i++){const x=rows[i],id=String(x.id);if(seen.has(id))issues.push('Magasin en double : '+x.enseigne+' '+x.ville);seen.add(id);
   if(x.lat==null||x.lon==null||x.lat===''||x.lon===''||!Number.isFinite(Number(x.lat))||!Number.isFinite(Number(x.lon)))issues.push('Coordonnées manquantes : '+x.ville);
   if(typeof root.hav==='function'&&typeof root.baseObj==='function')minutes+=root.hav(i?rows[i-1]:root.baseObj(),x)*1.22/55*60;
   const finish=minutes+Number(s.settings.visitMinutes||60);
   for(const e of events){const from=e.allDay?0:eventMinute(e.start),to=e.allDay?1440:eventMinute(e.end);if(e.allDay||(minutes<to&&finish>from))issues.push(day+' : conflit avec '+(e.title||'Google Agenda'));}
   for(const a of appointments){const from=clock(a.time),to=from+Number(a.duration||60);if(String(a.storeId)!==id&&minutes<to&&finish>from)issues.push(day+' : chevauchement avec un rendez-vous enregistré.');if(String(a.storeId)===id&&(minutes>from+5||finish<from))issues.push(day+' : horaire de visite incompatible avec le rendez-vous enregistré.')}
   minutes=finish;
  }
  if(rows.length&&typeof root.hav==='function')minutes+=root.hav(rows[rows.length-1],root.baseObj())*1.22/55*60;
  if(rows.length&&minutes>end)issues.push(day+' : dépassement des horaires estimé.');
 }
 return [...new Set(issues)];
}
function eventMinute(raw){const d=new Date(raw);return d.getHours()*60+d.getMinutes()}
function clock(s){const [h,m]=String(s).split(':').map(Number);return h*60+m}
const api={capture,validate,validateState,decode,backups,checkpoint,recover,persist,load,save,restore,planIssues,keys:{MAIN,ARCHIVE,RANGE,BACKUPS,JOURNAL,EXPORT}};
root.ChefReliability=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
