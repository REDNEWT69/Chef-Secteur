(function(){
'use strict';
const R=window.ChefReliability;let busy=false;
const DAY_MS=86400000;
/* V256 — au-delà de ce délai sans export, l'écran Données le rappelle. */
const EXPORT_REMINDER_DAYS=14;
function db(){return window.__chefStorage||window.localStorage}
function health(){const s=window.__chefStorage;try{if(s&&typeof s.health==='function')return s.health()}catch(e){}return window.__chefStorageHealth||{engine:window.__chefStorageMode||'localStorage',failedKeys:[]}}
/* Écrit sur disque, puis RELIT le disque : une restauration n'est annoncée réussie que
   si ce qui est stocké est exactement ce qui a été restauré. */
async function commit(){const s=db();if(typeof s.flush==='function')await s.flush();if(typeof s.verify==='function'){const check=await s.verify(Object.values(R.keys).filter(k=>k!==R.keys.BACKUPS&&k!==R.keys.JOURNAL));if(!check.ok)throw Error('Vérification après écriture en échec : '+check.mismatched.join(', '))}}
async function applyRestore(bundle){const restored=R.restore(bundle);await commit();window.state=restored;document.dispatchEvent(new CustomEvent('store-runner:data-restored'));initControls();renderAll();refresh()}
function notice(message){const n=document.getElementById('backupFeedback');if(n)n.textContent=message;else if(typeof showError==='function')showError(message)}
function label(b){const c=R.summary(b);return c.stores+' magasins · '+c.completedVisits+' visites terminées · '+c.actions+' actions · '+c.opportunities+' opportunités · '+c.archivedWeeks+' semaines archivées'+(Array.isArray(b.catalog)?' · '+b.catalog.length+' ajout(s) carnet':'')+(c.performanceImports?' · '+c.performanceImports+' import(s) performance':'')}
function preview(title,message,accept){return new Promise(resolve=>{
 const d=document.createElement('dialog');d.className='recoveryDialog';
 const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=message;
 const yes=document.createElement('button');yes.className='primary';yes.textContent=accept;
 const no=document.createElement('button');no.className='secondary';no.textContent='Conserver mes données';
 function done(value){d.close();d.remove();resolve(value)}yes.onclick=()=>done(true);no.onclick=()=>done(false);d.addEventListener('cancel',e=>{e.preventDefault();done(false)});
 d.append(h,p,no,yes);document.body.appendChild(d);d.showModal();
})}
function mb(bytes){return (Math.round(bytes/1024/1024*10)/10).toLocaleString('fr-FR')+' Mo'}
function engineLabel(h){return h.engine==='indexedDB'?'base de l’appareil (IndexedDB)':h.engine==='localStorage'?'stockage navigateur limité (~5 Mo)':'mémoire seule — rien n’est conservé à la fermeture'}
/* Ancienne copie localStorage, figée au passage à V256. Proposée seulement si elle
   existe et diffère de l'état actuel : c'est un recours, jamais une écriture automatique. */
function legacyBundle(){
 const h=health();if(!h.legacyChanged&&!h.recoveredFromLegacy)return null;
 const s=window.__chefStorage;if(!s||typeof s.legacy!=='function')return null;const old=s.legacy();if(!old)return null;
 const raw=old.getItem(R.keys.MAIN);if(!raw||raw===db().getItem(R.keys.MAIN))return null;
 try{return R.capture(JSON.parse(raw),old)}catch(e){return null}
}
async function renderHealth(){
 const box=document.getElementById('storageHealth');if(!box)return;const h=health(),lines=[];
 lines.push('Stockage : '+engineLabel(h)+'.');
 try{const est=navigator.storage&&navigator.storage.estimate?await navigator.storage.estimate():null;if(est&&est.quota)lines.push('Utilisé : '+mb(est.usage||0)+' sur '+mb(est.quota)+' disponibles pour Store Runner.')}catch(e){}
 try{const p=navigator.storage&&navigator.storage.persisted?await navigator.storage.persisted():null;if(p!==null)lines.push(p?'Protégé contre l’effacement automatique du navigateur.':'Non protégé contre l’effacement automatique : garde des exports réguliers.')}catch(e){}
 try{const raw=db().getItem(R.keys.MAIN);if(raw)lines.push('Données de travail : '+mb(raw.length)+'.')}catch(e){}
 if(h.recoveredFromLegacy)lines.push('⚠️ La base de l’appareil a été retrouvée vide : les données ont été reprises de la copie du '+new Date(h.recoveredFromLegacy).toLocaleDateString('fr-FR')+'. Si tu as un export plus récent, restaure-le.');
 if(h.legacyChanged)lines.push('⚠️ Une ancienne version de Store Runner a écrit dans l’ancien stockage après la bascule. Ces données sont proposées dans les versions ci-dessous.');
 box.replaceChildren(...lines.map(t=>{const p=document.createElement('p');p.textContent=t;return p}));
}
function refresh(){const meta=document.getElementById('backupMeta'),list=document.getElementById('backupVersions');if(!meta||!list)return;
 try{const exported=db().getItem(R.keys.EXPORT),age=exported?Math.floor((Date.now()-Date.parse(exported))/DAY_MS):null;
 meta.textContent=exported?'Dernier export : '+new Date(exported).toLocaleString('fr-FR')+(age>=EXPORT_REMINDER_DAYS?' — il y a '+age+' jours, pense à en refaire un.':''):'Aucun export pour l’instant. Garde une copie hors de ce téléphone.';
 meta.classList.toggle('backupStale',!exported||age>=EXPORT_REMINDER_DAYS);list.replaceChildren();
 const add=(text,bundle,message)=>{const b=document.createElement('button');b.className='secondary';b.textContent=text;b.onclick=async()=>{
  try{R.validate(bundle);if(await preview('Restaurer cette version ?',label(bundle)+'\n'+message,'Restaurer')){await applyRestore(bundle);notice('Version restaurée. Reconnecte Google si nécessaire.')}}catch(e){notice(e.message)}
 };list.appendChild(b)};
 for(const row of R.backups())add(new Date(row.date).toLocaleString('fr-FR')+' · '+row.reason,row.bundle,'Les données actuelles seront remplacées.');
 const legacy=legacyBundle();if(legacy)add('Copie de l’ancien stockage (avant V256)',legacy,'Copie figée lors du passage à la base de l’appareil. Les données actuelles seront conservées dans les versions automatiques avant remplacement.');
 }catch(e){meta.textContent=e.message}
 renderHealth();
}
/* V256 — une écriture refusée par l'appareil n'est plus silencieuse. Le bandeau reste
   tant qu'une clé n'est pas sur disque et offre les deux gestes utiles : exporter (depuis
   la mémoire, qui a tout) et réessayer. */
function otherWindowAlert(h){
 let bar=document.getElementById('srStorageOtherWindow');if(!h.otherWindow||document.getElementById('srStorageAlert')){if(bar&&!h.otherWindow)bar.remove();return}
 if(bar)return;bar=document.createElement('div');bar.id='srStorageOtherWindow';bar.setAttribute('role','alert');
 const text=document.createElement('p');text.textContent='Store Runner a enregistré des modifications dans une autre fenêtre. Recharge celle-ci avant de continuer, sinon tes prochaines modifications pourraient les remplacer.';
 const reload=document.createElement('button');reload.type='button';reload.className='primary';reload.textContent='Recharger';reload.onclick=()=>location.reload();
 bar.append(text,reload);document.body.appendChild(bar);
}
function storageAlert(detail){
 const h=detail||health(),failing=(h.failedKeys||[]).length>0;let bar=document.getElementById('srStorageAlert');
 if(!failing){if(bar)bar.remove();otherWindowAlert(h);return}
 if(!bar){bar=document.createElement('div');bar.id='srStorageAlert';bar.setAttribute('role','alert');
  const text=document.createElement('p');text.id='srStorageAlertText';
  const exp=document.createElement('button');exp.type='button';exp.className='primary';exp.textContent='Sauvegarder mes données';exp.onclick=()=>window.exportFull&&window.exportFull();
  const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='Réessayer';retry.onclick=async()=>{try{await db().flush();storageAlert()}catch(e){storageAlert()}};
  bar.append(text,exp,retry);document.body.appendChild(bar)}
 const quota=/quota/i.test(String(h.lastErrorName||'')+' '+String(h.lastError||''));
 document.getElementById('srStorageAlertText').textContent=(quota?'Stockage de l’appareil plein : tes dernières modifications ne sont PAS enregistrées. ':'Enregistrement sur l’appareil impossible : tes dernières modifications ne sont PAS enregistrées. ')+'Exporte une sauvegarde maintenant, puis libère de l’espace (photos, autres apps).';
}
function ensureStyle(){if(document.getElementById('srStorageStyle'))return;const s=document.createElement('style');s.id='srStorageStyle';s.textContent='#srStorageAlert,#srStorageOtherWindow{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:400;box-sizing:border-box;background:#fff4f2;border:1px solid #f1b0a8;color:#8a1c12;border-radius:16px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.18);display:grid;grid-template-columns:1fr 1fr;gap:8px}#srStorageOtherWindow{grid-template-columns:1fr;background:#fffaeb;border-color:#fedf89;color:#7a2e0e}#srStorageAlert p,#srStorageOtherWindow p{grid-column:1/-1;margin:0;font-size:12.5px;font-weight:700;line-height:1.35}#srStorageAlert button,#srStorageOtherWindow button{min-height:44px;font-size:12.5px}#storageHealth p{margin:4px 0;font-size:12px;color:#475467;overflow-wrap:anywhere}#backupMeta.backupStale{color:#b54708;font-weight:700}';document.head.appendChild(s)}
function install(){
 const host=document.getElementById('importPanel');if(!host||document.getElementById('backupTools'))return;
 ensureStyle();
 const box=document.createElement('section');box.id='backupTools';box.className='card';box.innerHTML='<h2>Sauvegardes</h2><p>Les copies automatiques restent sur ce téléphone. Exporte aussi un fichier pour pouvoir récupérer tes données sur un autre appareil. Les photos s’exportent à part, dans la section Photos ci-dessous.</p><button class="primary" id="downloadBackup" type="button">Sauvegarder mes données</button><label>Restaurer un fichier JSON<input id="restoreBackupFile" type="file" accept=".json,application/json"></label><p id="backupMeta"></p><p id="backupFeedback" role="status"></p><div id="storageHealth"></div><details><summary>Versions automatiques (8 maximum)</summary><div id="backupVersions"></div></details>';
 host.insertBefore(box,host.firstChild);
 /* V256 — export COMPACT (l'indentation doublait la taille : un an de terrain aurait
    dépassé la limite d'import) et scellé. Le texte produit est relu et validé avant
    d'être proposé au téléchargement : on ne livre jamais un fichier qu'on ne saurait
    pas restaurer. */
 window.exportFull=function(){try{const bundle=R.seal(R.capture()),text=JSON.stringify(bundle);R.decode(text,window.state);download('Chef-Secteur-sauvegarde-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',text,'application/json');try{db().setItem(R.keys.EXPORT,new Date().toISOString())}catch(e){}refresh();notice('Téléchargement demandé ('+label(bundle)+'). Vérifie que le fichier est bien enregistré dans Fichiers.'+(bundle.skipped?' Données écartées car illisibles : '+bundle.skipped.join(', ')+'.':''))}catch(e){notice(e.message)}};
 window.importJSONFile=async function(file){if(!file||busy)return;busy=true;try{if(file.size>R.limits.IMPORT_MAX_BYTES)throw Error('Fichier trop volumineux (100 Mo maximum).');const bundle=R.decode(await file.text(),state);if(await preview('Restaurer cette sauvegarde ?',label(bundle)+'\nUne copie des données actuelles sera conservée avant remplacement.','Restaurer')){await applyRestore(bundle);notice('Restauration terminée et vérifiée : '+label(bundle))}}catch(e){notice('Import refusé : '+e.message);showError('Import refusé : '+e.message)}finally{busy=false;const input=document.getElementById('restoreBackupFile');if(input)input.value=''}};
 document.getElementById('downloadBackup').onclick=window.exportFull;document.getElementById('restoreBackupFile').onchange=e=>window.importJSONFile(e.target.files[0]);
 const shortcut=document.createElement('button');shortcut.type='button';shortcut.className='secondary backupShortcut';shortcut.textContent='Sauvegardes et restauration';shortcut.onclick=()=>{goTab('importPanel');refresh()};document.getElementById('homePanel').appendChild(shortcut);
 R.propose=async function(candidate){
 const bundle=R.capture();bundle.state.plan=candidate.plan;bundle.state.settings.weekDate=candidate.weekDate;
 if(candidate.archive)bundle.archive=candidate.archive;if(candidate.range)bundle.range=candidate.range;
 const checkIssues=()=>{const issues=[];if(candidate.archive&&candidate.range){for(const [date,snap] of Object.entries(candidate.archive)){if(date<candidate.range.start.slice(0,10)&&date!==candidate.weekDate)continue;if(date>candidate.range.end)continue;issues.push(...R.planIssues(snap.plan,state,date))}}else if(candidate.archive){const snap=candidate.archive[candidate.weekDate];issues.push(...R.planIssues((snap&&snap.plan)||candidate.plan,state,candidate.weekDate))}else issues.push(...R.planIssues(candidate.plan,state,candidate.weekDate));return issues};const issues=checkIssues();
 if(issues.length){showError('Proposition non appliquée : '+[...new Set(issues)].slice(0,10).join(' · '));return false}
 const stores=Number(candidate.storeCount)||Object.values(candidate.plan).reduce((n,rows)=>n+rows.length,0),visits=Number(candidate.visitCredits)||stores,text=(candidate.range?Number(candidate.range.totalVisits||visits)+' visites comptabilisées sur '+candidate.range.weeks+' semaines · '+Number(candidate.range.totalStores||stores)+' magasins':visits+' visites comptabilisées ('+stores+' magasins) cette semaine')+'\nLe planning actuel reste conservé tant que tu ne valides pas.\nTrajets et horaires estimés, à vérifier selon la circulation.';
 if(!await preview('Valider ce nouveau planning ?',text,'Appliquer le planning'))return false;
 const latestIssues=checkIssues();if(latestIssues.length){showError('Les contraintes ont changé : '+[...new Set(latestIssues)].slice(0,10).join(' · '));return false}R.checkpoint('Avant remplacement du planning');bundle.state=JSON.parse(JSON.stringify(state));bundle.state.plan=candidate.plan;bundle.state.settings.weekDate=candidate.weekDate;R.persist(bundle);window.state=bundle.state;initControls();renderAll();refresh();return true;
 };
 document.dispatchEvent(new CustomEvent('store-runner:reliability-propose-ready'));
 const clearSector=window.loadEmptySector;if(typeof clearSector==='function')window.loadEmptySector=function(){try{R.checkpoint('Avant remise à zéro');return clearSector.apply(this,arguments)}catch(e){notice(e.message)}};
 window.addEventListener('store-runner:storage-status',e=>{storageAlert(e.detail);renderHealth()});
 storageAlert();
 refresh();window.addEventListener('focus',refresh);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
