/* Durable application data only. OAuth tokens are never exported. */
(function(root){
'use strict';
const VisitModel=root.StoreRunnerVisitModel||(typeof require==='function'?require('./store-runner-visit-model.js'):null);
const MAIN='sector_planner_universal_v1', ARCHIVE='chef_sector_plan_archive_v1', RANGE='chef_sector_range_v1';
const BACKUPS='chef_recovery_backups_v1', JOURNAL='chef_recovery_transaction_v1', EXPORT='chef_last_export_v1';
const CATALOG='chef-secteur-official-catalog-local-v1', CUISINISTE='store-runner-cuisiniste-contracts-v193';
/* V256 — trois clés de travail utilisateur vivaient hors de la sauvegarde : les imports
   performance (et leur appariement magasin saisi à la main), les crédits de visite
   forcés et le profil de secteur national. Elles voyagent désormais avec l'export,
   comme champs FACULTATIFS : une sauvegarde plus ancienne qui ne les porte pas laisse
   intactes les valeurs déjà présentes sur l'appareil. */
const PERFORMANCE='store-runner-performance-v190', CREDITS='store-runner-visit-credit-overrides-v189', NATIONAL='chef-national-sector-profile-v1';
const AUX=[['catalog',CATALOG],['cuisinisteContracts',CUISINISTE],['performance',PERFORMANCE],['creditOverrides',CREDITS],['nationalProfile',NATIONAL]];
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
/* V240 — budgets de stockage, mesurés sur un secteur réel de 58 magasins
   (tests/recovery-journal-quota-v240.test.cjs rejoue la mesure) :

     sources MAIN+ARCHIVE+RANGE+CATALOG+CUISINISTE .... 524 Ko
     journal recopiant TOUTES les clés ................ 602 Ko  (1,15x les sources :
       une chaîne JSON re-sérialisée voit chacun de ses guillemets échappé)
     8 sauvegardes complètes ......................... 4195 Ko  (82 % du quota)
     ------------------------------------------------------------
     pic pendant une génération de planning .......... 5321 Ko  > ~5120 Ko de quota

   D'où l'échec terrain « Setting the value of 'chef_recovery_transaction_v1' exceeded
   the quota ». Deux corrections indépendantes ci-dessous : le journal ne recopie plus
   que les clés réellement modifiées, et l'historique de sauvegardes cesse de manger
   la quasi-totalité du quota. */
const JOURNAL_MAX_BYTES=1536*1024;
const BACKUPS_MAX_BYTES=1536*1024;
/* V256 — sur le moteur IndexedDB (`db.atomic`), toutes les écritures d'une même tâche
   forment UNE transaction : le disque passe de l'ancien état au nouveau d'un bloc, sans
   journal. Le quota se compte en centaines de Mo : l'historique peut garder ses huit
   versions bien au-delà du Mo, borné pour rester raisonnable en mémoire sur iPhone. */
const ATOMIC_BACKUPS_MAX_BYTES=24*1024*1024;
/* Un export compact d'un an de terrain pèse ~12 Mo ; la limite laisse une marge large
   sans accepter n'importe quoi. */
const IMPORT_MAX_BYTES=100*1024*1024;
const atomic=db=>!!(db&&db.atomic===true);
let blocked=false;
const copy=x=>JSON.parse(JSON.stringify(x));
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function safeKeys(x){if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Clé de données interdite.');safeKeys(x[k])}}
/* `trusted` : état produit par l'application elle-même (sauvegarde courante). Le
   balayage des clés interdites ne sert qu'aux données venues de l'extérieur (import,
   restauration, lecture disque) ; sur un an de terrain il coûtait ~75 ms par sauvegarde. */
function validateState(s,trusted){
 if(!object(s)||![3,4,5].includes(Number(s.schemaVersion))||!Array.isArray(s.stores)||!object(s.profile)||!object(s.settings))throw Error('Sauvegarde incomplète ou version non prise en charge.');
 if(!trusted)safeKeys(s);if(s.brandOpeningHours!==undefined){const hours=root.StoreOpeningHoursV1||(typeof require==='function'?require('./store-opening-hours.js'):null);if(!object(s.brandOpeningHours))throw Error('Modèles enseigne invalides.');if(hours)hours.validateBrandModels(s.brandOpeningHours)}if(s.weeklyBriefs!==undefined){const briefs=root.StoreRunnerWeeklyBriefV246||(typeof require==='function'?require('./weekly-brief-v246.js'):null);if(!object(s.weeklyBriefs))throw Error('Briefs hebdomadaires invalides.');if(briefs)briefs.validate(s.weeklyBriefs)}const ids=new Set();
 for(const x of s.stores){if(!object(x)||!['string','number'].includes(typeof x.id)||!String(x.id)||ids.has(String(x.id))||typeof x.enseigne!=='string'||typeof x.ville!=='string')throw Error('Magasin invalide ou identifiant en double.');ids.add(String(x.id))}
 for(const k of ['visits','notes','included','excluded','locks','plan'])if(s[k]!==undefined&&!object(s[k]))throw Error('Données invalides : '+k);
 if(s.appointments!==undefined&&(!Array.isArray(s.appointments)||s.appointments.some(a=>!object(a)||!ids.has(String(a.storeId))||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!/^\d{2}:\d{2}$/.test(a.time))))throw Error('Rendez-vous invalides.');
 if(s.calendarEvents!==undefined&&(!Array.isArray(s.calendarEvents)||s.calendarEvents.some(e=>!object(e)||typeof e.date!=='string')))throw Error('Agenda invalide.');
 validatePlanShape(s.plan||{},ids);if(s.businessV2!==undefined){if(!VisitModel)throw Error('Module Visit/Action indisponible.');VisitModel.validate(s)}return s;
}
function validatePlanShape(plan,ids){if(!object(plan))throw Error('Planning invalide.');for(const [day,list] of Object.entries(plan)){if(!DAYS.includes(day)||!Array.isArray(list)||list.some(s=>!object(s)||!ids.has(String(s.id))))throw Error('Planning contenant un jour ou un magasin inconnu.')}}
function validate(bundle){
 if(!object(bundle)||bundle.format!=='ChefSecteurBackup'||bundle.version!==1)throw Error('Format de sauvegarde non reconnu.');
 validateState(bundle.state);safeKeys(bundle);
 if(!object(bundle.archive)||(bundle.range!==null&&!object(bundle.range)))throw Error('Archives invalides.');
 if(bundle.catalog!==undefined&&(!Array.isArray(bundle.catalog)||bundle.catalog.some(x=>!object(x))))throw Error('Carnet officiel local invalide.');
 if(bundle.cuisinisteContracts!==undefined){const c=bundle.cuisinisteContracts;if(!object(c)||Number(c.schema)!==1||!Array.isArray(c.trackingImports)||!Array.isArray(c.tariffImports)||!object(c.mapping))throw Error('Données contrats expo cuisinistes invalides.');}
 if(bundle.performance!==undefined){const p=bundle.performance;if(!object(p)||!Array.isArray(p.imports)||p.imports.some(x=>!object(x)||typeof x.week!=='string'||!Array.isArray(x.rows))||(p.mapping!==undefined&&!object(p.mapping))||(p.treated!==undefined&&!object(p.treated)))throw Error('Données performance invalides.');}
 if(bundle.creditOverrides!==undefined&&(!object(bundle.creditOverrides)||Object.values(bundle.creditOverrides).some(v=>v!==1&&v!==2)))throw Error('Crédits de visite invalides.');
 if(bundle.nationalProfile!==undefined&&bundle.nationalProfile!==null&&!object(bundle.nationalProfile))throw Error('Profil national invalide.');
 for(const [date,snap] of Object.entries(bundle.archive)){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!object(snap))throw Error('Semaine archivée invalide.');
 // Archived stores may have been removed from the current sector; their snapshots remain restorable.
 if(!object(snap.plan))throw Error('Planning archivé invalide.');for(const [day,rows] of Object.entries(snap.plan))if(!DAYS.includes(day)||!Array.isArray(rows)||rows.some(x=>!object(x)||!x.id))throw Error('Visites archivées invalides.');}
 return bundle;
}
/* Les données auxiliaires sont lues une à une : une clé illisible ou mal formée est
   écartée (et nommée dans `skipped`) au lieu d'empêcher l'export de tout le reste. Une
   clé écartée n'est jamais effacée à la restauration, puisque le champ est absent. */
function auxiliary(db){
 const out={},skipped=[];
 for(const [field,key] of AUX){
  const raw=db.getItem(key);
  if(raw===null){if(field==='catalog')out.catalog=[];continue}
  try{const value=JSON.parse(raw);validate({format:'ChefSecteurBackup',version:1,state:{schemaVersion:5,profile:{},settings:{},stores:[]},archive:{},range:null,[field]:value});out[field]=value}
  catch(e){skipped.push(field)}
 }
 return{out,skipped};
}
function capture(s=root.state,db=(root.__chefStorage||root.localStorage)){const aux=auxiliary(db);const bundle={format:'ChefSecteurBackup',version:1,createdAt:new Date().toISOString(),state:copy(s),archive:JSON.parse(db.getItem(ARCHIVE)||'{}'),range:JSON.parse(db.getItem(RANGE)||'null'),...aux.out};if(aux.skipped.length)bundle.skipped=aux.skipped;return validate(bundle)}
/* V256 — ce que contient une sauvegarde, compté. Sert à l'aperçu avant restauration,
   au sceau d'intégrité de l'export et à la vérification après écriture. */
function summary(bundle){
 const st=(bundle&&bundle.state)||{},b=st.businessV2||{},visits=Array.isArray(b.visits)?b.visits:[];
 return{stores:(st.stores||[]).length,visits:visits.length,completedVisits:visits.filter(v=>v&&v.status==='completed').length,actions:(b.actions||[]).length,
  opportunities:(b.opportunities||[]).length,appointments:(st.appointments||[]).length,archivedWeeks:Object.keys(bundle&&bundle.archive||{}).length,
  performanceImports:bundle&&bundle.performance&&Array.isArray(bundle.performance.imports)?bundle.performance.imports.length:0}
}
/* Empreinte FNV-1a 32 bits de l'état sérialisé : détecte un fichier modifié ou abîmé qui
   resterait du JSON valide. Ce n'est pas une signature : aucune sécurité n'en dépend. */
function fingerprint(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return text.length+':'+h.toString(16)}
function seal(bundle){const out=Object.assign({},bundle);delete out.integrity;out.integrity={algorithm:'fnv1a32',state:fingerprint(JSON.stringify(bundle.state)),archive:fingerprint(JSON.stringify(bundle.archive)),counts:summary(bundle)};return out}
function checkSeal(bundle){
 const i=bundle.integrity;if(i===undefined)return bundle;
 if(!object(i)||i.algorithm!=='fnv1a32')throw Error('Sceau d’intégrité inconnu.');
 if(i.state!==fingerprint(JSON.stringify(bundle.state))||i.archive!==fingerprint(JSON.stringify(bundle.archive)))throw Error('Fichier altéré : son contenu ne correspond plus à son sceau d’intégrité. Utilise une autre sauvegarde.');
 return bundle;
}
let backupsMemo={raw:null,rows:null};
function backups(db=(root.__chefStorage||root.localStorage)){const raw=db.getItem(BACKUPS)||'[]';if(backupsMemo.raw===raw)return backupsMemo.rows.slice();const rows=JSON.parse(raw);if(!Array.isArray(rows))throw Error('Historique de sauvegardes illisible.');backupsMemo={raw,rows};return rows.slice()}
function checkpoint(reason,db=(root.__chefStorage||root.localStorage),bundle=capture(root.state,db)){
 if(blocked)throw Error('Restaure une sauvegarde avant de modifier les données.');
 /* Pas de copie : la ligne est sérialisée tout de suite ci-dessous, et `capture` rend
    déjà une copie. Sur un an de terrain la copie défensive coûtait une seconde. */
 const row={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),reason,date:new Date().toISOString(),bundle};
 let rows=backups(db);rows.unshift(row);rows=rows.slice(0,8);
 /* V240 — l'historique se bornait au NOMBRE de sauvegardes et ne rétrécissait qu'en
    réaction à son propre échec d'écriture. Huit bundles d'un secteur chargé pèsent
    4,2 Mo : il ne restait plus de place pour le journal de la transaction suivante.
    On le borne donc aussi en octets, avant d'écrire, en gardant toujours la plus
    récente. Le rétrécissement réactif reste le filet de sécurité final. */
 const budget=atomic(db)?ATOMIC_BACKUPS_MAX_BYTES:BACKUPS_MAX_BYTES;
 /* V256 — chaque version est mesurée une fois (`bytes`), au lieu de resérialiser tout
    l'historique à chaque retrait : sur un an de terrain, c'était des dizaines de Mo. */
 const sizes=rows.map(r=>Number(r.bytes)||JSON.stringify(r).length);rows.forEach((r,i)=>{r.bytes=sizes[i]});
 let total=sizes.reduce((a,b)=>a+b+1,1);
 while(rows.length>1&&total>budget){total-=sizes.pop()+1;rows.pop()}
 while(true){try{db.setItem(BACKUPS,JSON.stringify(rows));break}catch(e){if(rows.length<=1)throw Error('Espace insuffisant : exporte une sauvegarde avant de continuer.');rows.pop()}}
 return row;
}
function recover(db=(root.__chefStorage||root.localStorage)){const raw=db.getItem(JOURNAL);if(!raw)return;const before=JSON.parse(raw);for(const k of [MAIN,ARCHIVE,RANGE,CATALOG,CUISINISTE,PERFORMANCE,CREDITS,NATIONAL]){if(!Object.prototype.hasOwnProperty.call(before,k))continue;if(before[k]===null)db.removeItem(k);else if(typeof before[k]==='string')db.setItem(k,before[k]);else throw Error('Journal de récupération invalide.')}db.removeItem(JOURNAL)}
/* Les écritures d'une transaction, dans l'ordre. `null` vaut suppression de la clé, ce
   qui est aussi ce que rend `getItem` pour une clé absente : une valeur identique se
   compare donc directement, sans cas particulier. MAIN reste écrit en dernier. */
function plannedWrites(bundle){
 const writes=[[ARCHIVE,JSON.stringify(bundle.archive)],[RANGE,bundle.range===null?null:JSON.stringify(bundle.range)]];
 for(const [field,key] of AUX)if(bundle[field]!==undefined)writes.push([key,bundle[field]===null?null:JSON.stringify(bundle[field])]);
 writes.push([MAIN,JSON.stringify(bundle.state)]);
 return writes;
}
/* Libère la sauvegarde la plus ancienne. Elles existent pour dépanner ; les données
   vivantes, non. En céder une vaut mieux que refuser d'enregistrer. Rend false quand
   il n'y a plus rien à céder. */
function dropOldestBackup(db){
 let rows;
 try{rows=backups(db)}catch(e){db.removeItem(BACKUPS);return true}
 if(!rows.length)return false;
 rows.pop();
 try{db.setItem(BACKUPS,JSON.stringify(rows))}catch(e){db.removeItem(BACKUPS)}
 return true;
}
/* V240 — ouvre le journal de retour arrière pour les seules clés qui changent.
   Il recopiait les cinq clés à chaque fois, y compris le carnet officiel et les
   imports cuisinistes, pourtant inchangés pendant une génération de planning : 602 Ko
   recopiés là où 165 Ko suffisent, soit le dépassement de quota constaté.
   Repli, du moins destructif au plus :
     1. une seule clé change -> `setItem` est atomique, il n'y a rien à annuler ;
     2. écrire le journal ; s'il ne passe pas, céder une sauvegarde et réessayer ;
     3. plus aucune sauvegarde à céder -> refuser AVANT d'avoir touché une donnée.
   Rend true si un journal a été ouvert. */
function openJournal(changed,db){
 if(changed.length<=1||atomic(db))return false;
 const payload=JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,db.getItem(k)])));
 if(payload.length>JOURNAL_MAX_BYTES)throw Error('Données locales trop volumineuses pour être enregistrées en sécurité : exporte une sauvegarde depuis Plus → Données, puis allège l’historique.');
 for(;;){
  try{db.setItem(JOURNAL,payload);return true}
  catch(e){if(!dropOldestBackup(db))throw Error('Espace insuffisant : exporte une sauvegarde avant de continuer.')}
 }
}
function persist(bundle,db=(root.__chefStorage||root.localStorage)){
 validate(bundle);
 /* Un journal resté en place signale une écriture précédente interrompue. On la
    termine avant d'en ouvrir une autre : l'écraser détruirait son retour arrière. */
 if(db.getItem(JOURNAL)!==null)recover(db);
 const changed=plannedWrites(bundle).filter(([k,next])=>db.getItem(k)!==next);
 if(!changed.length)return;
 const journaled=openJournal(changed,db);
 try{
  for(const [k,next] of changed){if(next===null)db.removeItem(k);else db.setItem(k,next)}
  if(journaled)db.removeItem(JOURNAL);
 }catch(e){try{recover(db)}catch(_){blocked=true}throw Error('Enregistrement interrompu : données précédentes conservées ou récupération requise. '+e.message)}
}
function load(db=(root.__chefStorage||root.localStorage)){try{recover(db);const raw=db.getItem(MAIN);return raw?validateState(JSON.parse(raw)):null}catch(e){blocked=true;throw Error('Données locales illisibles. Elles ne seront pas écrasées. Ouvre Plus → Données → Sauvegardes. '+e.message)}}
function save(s,db=(root.__chefStorage||root.localStorage)){if(blocked)throw Error('Écriture bloquée pour protéger les données : utilise la restauration.');validateState(s,true);const previous=db.getItem(MAIN),next=JSON.stringify(s);if(previous===next)return true;if(previous){
 const rows=backups(db),last=rows[0];if(!last||Date.now()-Date.parse(last.date)>15*60*1000)checkpoint('Avant les dernières modifications',db,capture(JSON.parse(previous),db));
 }db.setItem(MAIN,next);return true}
function decode(text,current){
 if(text.length>IMPORT_MAX_BYTES)throw Error('Fichier trop volumineux (100 Mo maximum).');const data=JSON.parse(text);safeKeys(data);
 if(data.format==='ChefSecteurBackup')return checkSeal(validate(data));
 if([3,4,5].includes(Number(data.schemaVersion))){const s=copy(data);s.schemaVersion=5;return validate({format:'ChefSecteurBackup',version:1,state:s,archive:{},range:null})}
 if(data.format==='SectorPlanner'&&Array.isArray(data.stores)){const s=copy(current);Object.assign(s,{schemaVersion:5,profile:data.profile||s.profile,stores:data.stores,visits:data.visits||{},notes:data.notes||{},included:{},excluded:{},locks:{},plan:{},appointments:[],calendarEvents:[]});return validate({format:'ChefSecteurBackup',version:1,state:s,archive:{},range:null})}
 throw Error('Format non reconnu.');
}
function restore(bundle,db=(root.__chefStorage||root.localStorage)){validate(bundle);if(!blocked)checkpoint('Avant restauration',db);persist(bundle,db);blocked=false;return copy(bundle.state)}
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
   let visitMinutes=Math.max(15,Number(s.settings.visitMinutes)||60);try{if(typeof root.storeVisitDuration==='function')visitMinutes=root.storeVisitDuration(x,s)}catch(e){}const finish=minutes+visitMinutes;
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
const api={capture,validate,validateState,decode,backups,checkpoint,recover,persist,load,save,restore,planIssues,plannedWrites,summary,seal,checkSeal,fingerprint,keys:{MAIN,ARCHIVE,RANGE,BACKUPS,JOURNAL,EXPORT,CATALOG,CUISINISTE,PERFORMANCE,CREDITS,NATIONAL},limits:{JOURNAL_MAX_BYTES,BACKUPS_MAX_BYTES,ATOMIC_BACKUPS_MAX_BYTES,IMPORT_MAX_BYTES}};
root.ChefReliability=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
