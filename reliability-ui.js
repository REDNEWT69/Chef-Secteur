(function(){
'use strict';
const R=window.ChefReliability;let busy=false;
async function applyRestore(bundle){const restored=R.restore(bundle),db=window.__chefStorage||window.localStorage;if(typeof db.flush==='function')await db.flush();window.state=restored;document.dispatchEvent(new CustomEvent('store-runner:data-restored'));initControls();renderAll();refresh()}
function notice(message){const n=document.getElementById('backupFeedback');if(n)n.textContent=message;else if(typeof showError==='function')showError(message)}
function label(b){return b.state.stores.length+' magasins · '+Object.keys(b.archive).length+' semaines archivées'+(Array.isArray(b.catalog)?' · '+b.catalog.length+' ajout(s) carnet':'')}
function preview(title,message,accept){return new Promise(resolve=>{
 const d=document.createElement('dialog');d.className='recoveryDialog';
 const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=message;
 const yes=document.createElement('button');yes.className='primary';yes.textContent=accept;
 const no=document.createElement('button');no.className='secondary';no.textContent='Conserver mes données';
 function done(value){d.close();d.remove();resolve(value)}yes.onclick=()=>done(true);no.onclick=()=>done(false);d.addEventListener('cancel',e=>{e.preventDefault();done(false)});
 d.append(h,p,no,yes);document.body.appendChild(d);d.showModal();
})}
function refresh(){const meta=document.getElementById('backupMeta'),list=document.getElementById('backupVersions');if(!meta||!list)return;
 try{const exported=(window.__chefStorage||window.localStorage).getItem(R.keys.EXPORT);meta.textContent=exported?'Dernier export demandé : '+new Date(exported).toLocaleString('fr-FR'):'Aucun export demandé. Garde une copie hors de ce navigateur.';list.replaceChildren();
 for(const row of R.backups()){const b=document.createElement('button');b.className='secondary';b.textContent=new Date(row.date).toLocaleString('fr-FR')+' · '+row.reason;b.onclick=async()=>{
  try{R.validate(row.bundle);if(await preview('Restaurer cette version ?',label(row.bundle)+'\nLes données actuelles seront remplacées.','Restaurer')){await applyRestore(row.bundle);notice('Version restaurée. Reconnecte Google si nécessaire.')}}catch(e){notice(e.message)}
 };list.appendChild(b)}
 }catch(e){meta.textContent=e.message}
}
function install(){
 const host=document.getElementById('importPanel');if(!host||document.getElementById('backupTools'))return;
 const box=document.createElement('section');box.id='backupTools';box.className='card';box.innerHTML='<h2>Sauvegardes</h2><p>Les copies automatiques restent dans ce navigateur. Exporte aussi un fichier pour pouvoir récupérer tes données sur un autre appareil.</p><button class="primary" id="downloadBackup" type="button">Sauvegarder mes données</button><label>Restaurer un fichier JSON<input id="restoreBackupFile" type="file" accept=".json,application/json"></label><p id="backupMeta"></p><p id="backupFeedback" role="status"></p><details><summary>Versions automatiques (8 maximum)</summary><div id="backupVersions"></div></details>';
 host.insertBefore(box,host.firstChild);
 window.exportFull=function(){try{const bundle=R.capture();download('Chef-Secteur-sauvegarde-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',JSON.stringify(bundle,null,2),'application/json');(window.__chefStorage||window.localStorage).setItem(R.keys.EXPORT,new Date().toISOString());refresh();notice('Téléchargement demandé. Vérifie que le fichier est bien enregistré dans Fichiers.')}catch(e){notice(e.message)}};
 window.importJSONFile=async function(file){if(!file||busy)return;busy=true;try{if(file.size>20*1024*1024)throw Error('Fichier trop volumineux (20 Mo maximum).');const bundle=R.decode(await file.text(),state);if(await preview('Restaurer cette sauvegarde ?',label(bundle)+'\nUne copie des données actuelles sera conservée avant remplacement.','Restaurer')){await applyRestore(bundle);notice('Restauration terminée : '+label(bundle))}}catch(e){notice('Import refusé : '+e.message);showError('Import refusé : '+e.message)}finally{busy=false;const input=document.getElementById('restoreBackupFile');if(input)input.value=''}};
 document.getElementById('downloadBackup').onclick=window.exportFull;document.getElementById('restoreBackupFile').onchange=e=>window.importJSONFile(e.target.files[0]);
 const shortcut=document.createElement('button');shortcut.type='button';shortcut.className='secondary backupShortcut';shortcut.textContent='Sauvegardes et restauration';shortcut.onclick=()=>{goTab('importPanel');refresh()};document.getElementById('homePanel').appendChild(shortcut);
 R.propose=async function(candidate){
 const bundle=R.capture();bundle.state.plan=candidate.plan;bundle.state.settings.weekDate=candidate.weekDate;
 if(candidate.archive)bundle.archive=candidate.archive;if(candidate.range)bundle.range=candidate.range;
 const checkIssues=()=>{const issues=[];if(candidate.archive){for(const [date,snap] of Object.entries(candidate.archive)){if(date<candidate.range.start.slice(0,10)&&date!==candidate.weekDate)continue;if(date>candidate.range.end)continue;issues.push(...R.planIssues(snap.plan,state,date))}}else issues.push(...R.planIssues(candidate.plan,state,candidate.weekDate));return issues};const issues=checkIssues();
 if(issues.length){showError('Proposition non appliquée : '+[...new Set(issues)].slice(0,10).join(' · '));return false}
 const count=Object.values(candidate.plan).reduce((n,rows)=>n+rows.length,0),text=(candidate.range?candidate.range.totalVisits+' visites sur '+candidate.range.weeks+' semaines':count+' visites cette semaine')+'\nLe planning actuel reste conservé tant que tu ne valides pas.\nTrajets et horaires estimés, à vérifier selon la circulation.';
 if(!await preview('Valider ce nouveau planning ?',text,'Appliquer le planning'))return false;
 const latestIssues=checkIssues();if(latestIssues.length){showError('Les contraintes ont changé : '+[...new Set(latestIssues)].slice(0,10).join(' · '));return false}R.checkpoint('Avant remplacement du planning');bundle.state=JSON.parse(JSON.stringify(state));bundle.state.plan=candidate.plan;bundle.state.settings.weekDate=candidate.weekDate;R.persist(bundle);window.state=bundle.state;initControls();renderAll();refresh();return true;
 };
 document.dispatchEvent(new CustomEvent('store-runner:reliability-propose-ready'));
 const clearSector=window.loadEmptySector;if(typeof clearSector==='function')window.loadEmptySector=function(){try{R.checkpoint('Avant remise à zéro');return clearSector.apply(this,arguments)}catch(e){notice(e.message)}};
 refresh();window.addEventListener('focus',refresh);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
