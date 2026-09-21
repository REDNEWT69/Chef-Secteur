/* V231-E — suppression fiable d'une visite erronée.
   Cas réel : une visite saisie sur le mauvais magasin doit disparaître entièrement,
   sans laisser de visite fantôme dans la mémoire magasin, l'historique ou les rapports,
   et sans emporter une donnée indépendante. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../store-runner-visit-model.js');
const O=require('../store-runner-opportunities.js');
const R=require('../reliability-core.js');
const S=require('../store-runner-visit-store.js');

const ROOT=path.join(__dirname,'..');
class DB{constructor(){this.map=new Map();this.flushed=0}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}async flush(){this.flushed++}}

function base(){
 return {schemaVersion:5,profile:{baseName:'Ville-Test A'},settings:{days:['Lundi']},
  stores:[
   {id:'ste',enseigne:'Boulanger',ville:'Saint-Étienne Villard'},
   {id:'autre',enseigne:'Darty',ville:'Ville-Test B'}
  ],
  notes:{ste:'À conserver'},
  /* Jour importé avant businessV2 : aucune visite détaillée ne le porte, il ne doit
     jamais être réécrit par une suppression ciblée. */
  visits:{ste:{history:['2026-08-01'],lastVisit:'2026-08-01'},autre:{history:[],lastVisit:''}},
  plan:{},appointments:[],calendarEvents:[]};
}
function record(s,storeId,day,conclusion,action){
 const id=M.start(s,storeId);
 M.editVisit(s,id,'conclusion',null,conclusion);
 if(action)withAction(s,id,action);
 M.complete(s,id,day);
 return id;
}
function withAction(s,visitId,text){
 M.edit6P(s,visitId,'prix',0,'action',text);
 return M.actionFrom6P(s,visitId,'prix',0);
}

/* ------------------------------------------------------------------ 1. cas nominal */
{
 const s=base();
 const mauvais=M.start(s,'ste');
 M.editVisit(s,mauvais,'conclusion',null,'Saisie sur le mauvais magasin');
 const actionErronee=withAction(s,mauvais,'Corriger l’étiquette prix');
 M.complete(s,mauvais,'2026-09-15');
 const opportunite=O.createOpportunity(s,{storeId:'ste',visitId:mauvais,category:'pdl',description:'Gagner deux facings sur le mural'}).id;

 const voisine=record(s,'autre','2026-09-15','Visite légitime du même jour','Suivi indépendant');
 const actionVoisine=s.businessV2.actions.find(a=>a.visitId===voisine).id;
 const gardee=record(s,'ste','2026-09-16','Vrai passage Saint-Étienne Villard');

 assert.deepEqual(s.visits.ste.history,['2026-08-01','2026-09-15','2026-09-16']);
 const avant=M.clone(s);

 const bilan=M.removeVisit(s,mauvais);
 assert.deepEqual(bilan,{visitId:mauvais,storeId:'ste',completedDate:'2026-09-15',actions:1,opportunities:1});

 // Suppression simple : la visite et son action ont disparu.
 assert.equal(s.businessV2.visits.some(v=>v.id===mauvais),false,'la visite supprimée ne doit plus exister');
 assert.equal(s.businessV2.actions.some(a=>a.id===actionErronee),false,'l’action issue de la visite part avec elle');

 // Aucune autre visite ni action indépendante n'est touchée.
 assert.equal(s.businessV2.visits.length,2);
 assert.deepEqual(avant.businessV2.visits.find(v=>v.id===voisine),s.businessV2.visits.find(v=>v.id===voisine));
 assert.deepEqual(avant.businessV2.visits.find(v=>v.id===gardee),s.businessV2.visits.find(v=>v.id===gardee));
 assert.equal(s.businessV2.actions.some(a=>a.id===actionVoisine),true,'une action d’un autre magasin ne doit pas bouger');
 assert.deepEqual(s.notes,avant.notes);
 assert.deepEqual(s.visits.autre,avant.visits.autre,'l’historique d’un autre magasin ne bouge pas');

 // Opportunité liée : elle survit, rattachée au seul magasin.
 const survivante=O.rows(s).find(x=>x.id===opportunite);
 assert(survivante,'l’opportunité doit survivre à la suppression de sa visite');
 assert.equal(survivante.visitId,null,'plus aucun visitId orphelin');
 assert.equal(survivante.source,'store');
 assert.equal(survivante.storeId,'ste');

 // Historique legacy recalculé de façon ciblée.
 assert.deepEqual(s.visits.ste.history,['2026-08-01','2026-09-16'],'seul le jour de la visite supprimée disparaît');
 assert.equal(s.visits.ste.lastVisit,'2026-09-16');

 // Validation métier complète après suppression.
 R.validateState(s);O.validate(s);
 console.log('PASS 1 · suppression simple, voisines intactes, action liée supprimée, opportunité conservée, historique recalculé');
}

/* ------------------------------------------- 2. deux visites du même magasin le même jour */
{
 const s=base();
 const premiere=record(s,'ste','2026-09-16','Premier passage');
 const seconde=record(s,'ste','2026-09-16','Second passage le même jour');
 assert.deepEqual(s.visits.ste.history,['2026-08-01','2026-09-16']);

 M.removeVisit(s,seconde);
 assert.deepEqual(s.visits.ste.history,['2026-08-01','2026-09-16'],'le jour reste tant qu’une autre visite terminée le porte');
 assert.equal(s.visits.ste.lastVisit,'2026-09-16');
 assert.equal(s.businessV2.visits.length,1);

 M.removeVisit(s,premiere);
 assert.deepEqual(s.visits.ste.history,['2026-08-01'],'le jour ne disparaît qu’avec la dernière visite qui le portait');
 assert.equal(s.visits.ste.lastVisit,'2026-08-01','l’import antérieur à businessV2 reste la dernière visite connue');
 R.validateState(s);O.validate(s);
 console.log('PASS 2 · deux visites le même jour, jour conservé puis libéré, historique importé préservé');
}

/* --------------------------------------------------------- 3. garde-fous de la cible */
{
 const s=base();
 const id=record(s,'ste','2026-09-16','Passage');
 assert.throws(()=>M.removeVisit(s,'visit-inconnue'),/Visite introuvable/);
 assert.throws(()=>M.removeVisit(s,''),/Visite introuvable/);
 assert.equal(s.businessV2.visits.length,1,'une cible inconnue ne supprime rien');

 O.createOpportunity(s,{storeId:'ste',visitId:id,category:'training',description:'Former l’équipe TV'});
 assert.throws(()=>M.removeVisit(M.clone(s),id,{opportunities:null}),/Opportunité indisponible/,
  'sans son propriétaire, on refuse plutôt que de laisser un visitId orphelin');

 // Un brouillon est supprimable sans toucher à l'historique, qui ne le contient pas.
 const brouillon=M.start(s,'autre');
 M.removeVisit(s,brouillon);
 assert.deepEqual(s.visits.autre.history,[]);
 R.validateState(s);O.validate(s);
 console.log('PASS 3 · cible obligatoire par visitId, refus sans propriétaire d’opportunités');
}

/* ------------------------------------------ 4. persistance, checkpoint, rechargement */
(async()=>{
 let state=base();const db=new DB();global.state=state;global.__chefStorage=db;
 const session=S.create({model:M,reliability:R,db,getState:()=>state,setState:s=>{state=s;global.state=s},onStatus:()=>{}});

 let cible=null;
 await session.edit(s=>{
  cible=M.start(s,'ste');
  M.editVisit(s,cible,'conclusion',null,'Visite à supprimer');
  M.edit6P(s,cible,'prix',0,'action','Action de la visite erronée');
  M.actionFrom6P(s,cible,'prix',0);
  M.complete(s,cible,'2026-09-15');
  O.createOpportunity(s,{storeId:'ste',visitId:cible,category:'pdl',description:'Mural TV'});
 });
 await session.edit(s=>{const autre=M.start(s,'autre');M.editVisit(s,autre,'conclusion',null,'Visite voisine');M.complete(s,autre,'2026-09-15')});

 const sauvegardesAvant=R.backups(db).length;
 assert.equal(M.getVisit(state,cible).status,'completed');

 await session.edit(s=>M.removeVisit(s,cible),{checkpoint:'Avant suppression d’une visite'});

 // Checkpoint réellement antérieur à la suppression.
 const sauvegardes=R.backups(db);
 assert(sauvegardes.length>sauvegardesAvant,'une suppression doit poser un point de restauration');
 assert.equal(sauvegardes[0].reason,'Avant suppression d’une visite');
 assert(sauvegardes[0].bundle.state.businessV2.visits.some(v=>v.id===cible),'le checkpoint doit contenir la visite encore présente');

 // Remplacement de window.state uniquement après succès, et flush IndexedDB effectué.
 assert(db.flushed>0,'la suppression doit être flushée sur IndexedDB');
 assert.equal(state.businessV2.visits.some(v=>v.id===cible),false);
 assert.equal(state.businessV2.actions.length,0);
 assert.deepEqual(state.visits.ste.history,['2026-08-01']);
 assert.equal(state.visits.autre.history.length,1,'la visite voisine garde son jour');

 // Persistance + rechargement.
 const recharge=R.load(db);
 assert.deepEqual(recharge,state,'le disque doit refléter exactement l’état après suppression');
 assert.equal(recharge.businessV2.visits.some(v=>v.id===cible),false);
 assert.equal(O.rows(recharge).length,1);
 assert.equal(O.rows(recharge)[0].visitId,null);
 assert.equal(O.rows(recharge)[0].source,'store');
 R.validateState(recharge);O.validate(recharge);

 // La restauration du checkpoint ramène la visite : la suppression est réversible.
 const restaure=R.restore(sauvegardes[0].bundle,db);
 assert(restaure.businessV2.visits.some(v=>v.id===cible),'le point de restauration doit ramener la visite supprimée');
 console.log('PASS 4 · checkpoint antérieur, sauvegarde atomique, flush, persistance et rechargement');

 /* ------------------------------------- 5. architecture : un seul moteur de suppression */
 const historique=fs.readFileSync(path.join(ROOT,'visit-history-delete.js'),'utf8');
 const ui=fs.readFileSync(path.join(ROOT,'store-runner-visits.js'),'utf8');
 const modele=fs.readFileSync(path.join(ROOT,'store-runner-visit-model.js'),'utf8');
 const css=fs.readFileSync(path.join(ROOT,'store-runner-visits.css'),'utf8');
 const sw=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');

 assert(historique.includes('owner.deleteHistoryEntry(storeId,date)'),'l’écran Historique doit déléguer au propriétaire central');
 assert(!/state\.visits\[[^\]]+\]\s*=/.test(historique),'l’écran Historique ne doit plus écrire dans state.visits');
 assert(!/\.history\s*=/.test(historique),'l’écran Historique ne doit plus recalculer l’historique lui-même');
 assert(!historique.includes('businessV2'),'l’écran Historique ne doit pas manipuler businessV2 en direct');
 assert(!/window\.(renderAll|renderWeek|save|renderHistory)\s*=(?!=)/.test(historique),'aucun propriétaire runtime contourné');

 assert(ui.includes('window.StoreRunnerVisits={start,openVisit,openHub,memoryFor,renderQuickMemory,deleteVisit,deleteHistoryEntry,activeVisitId:()=>activeId}'),
  'le module Visit doit publier la suppression et rien de plus');
 assert(ui.includes('M.removeVisit(s,key)'),'la suppression doit passer par le modèle métier, jamais par une écriture locale');
 assert(!/businessV2\.visits\.splice|visits\.filter\([^)]*id!==/.test(ui),'l’interface ne doit pas retirer une visite elle-même');
 assert(ui.includes("{checkpoint:'Avant suppression d’une visite'}"),'la suppression doit poser un checkpoint explicite');
 assert(ui.includes('sr-dangerZone'),'le bouton destructif doit vivre dans un repli dédié');
 assert(ui.includes("element('summary','Cette visite est une erreur ?')"),'le repli protège d’un mauvais tap');
 assert(ui.includes('Supprimer définitivement cette visite ?'),'la suppression doit être confirmée explicitement');
 assert(/confirm\('Supprimer définitivement cette visite \?[\s\S]{0,200}?\+label\+/.test(ui),'la confirmation doit nommer l’enseigne et la ville');
 assert(ui.includes("'\\nVisite du '+(who.date||"),'la confirmation doit nommer la date');
 assert(ui.includes('deleteLegacyDay'),'un jour d’historique sans visite détaillée reste supprimable');
 assert(ui.includes("announceDeletion"),'la suppression doit être annoncée pour rafraîchir les écrans');
 assert(ui.includes('window.renderAll()'),'KPI, historique et fiche magasin doivent être rafraîchis');
 assert(ui.includes('renderQuickMemory()'),'la mémoire magasin doit être rafraîchie');

 assert(modele.includes('function removeVisit('),'le propriétaire métier porte la suppression');
 assert(modele.includes("owner.detachVisit(s,key)"),'le détachement des opportunités reste chez leur propriétaire');

 assert(css.includes('.sr-dangerBtn{width:100%;min-height:48px'),'la cible tactile destructive doit rester confortable');
 assert(css.includes('.sr-dangerZone>summary')&&css.includes('min-height:44px'),'le repli doit rester atteignable au doigt');
 for(const asset of ['store-runner-visit-model.js','store-runner-visits.js','store-runner-visits.css','store-runner-opportunities.js','visit-history-delete.js'])
  assert(sw.includes('"./'+asset+'"'),'ressource absente du cache hors ligne : '+asset);
 console.log('PASS 5 · un seul moteur de suppression, délégation de l’écran Historique, cible tactile mobile');
})().catch(e=>{console.error(e);process.exitCode=1});
