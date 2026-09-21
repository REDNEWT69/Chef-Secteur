/* Pure Visit + Action domain. Technical schema 5 and historical keys are unchanged. */
(function(root){
'use strict';
const SIX_P={
 promotion:{label:'PROMOTION',items:['Visibilité PLV','Dates validées','Mécanisme promotionnel expliqué','Opération locale possible','Opérations concurrentes','Challenges concurrents','Perception vendeurs des promotions']},
 prix:{label:'PRIX',items:['Relevé prix','Veille concurrentielle','Ajustement nécessaire','Présence étiquette prix']},
 produit:{label:'PRODUIT',items:['LDU / factice','Stocks','Disponibilité','Gamme','Assortiment','Nouveautés','Concurrence','Ventes']},
 place:{label:'PLACE',items:['Part de linéaire','Emplacement','Respect des accords','Opportunité de gain PDL','Relevé concurrence']},
 proprete:{label:'PROPRETÉ',items:['Nettoyage LDU','Expérience client','Vérification des démonstrations','Mise à jour LDU','Mise à jour PLV','Anomalies']},
 pedagogie:{label:'PÉDAGOGIE',items:['Interlocuteurs identifiés','Problématiques identifiées','Objectifs de formation','Connaissances vendeurs','Préférence de marque','Potentiel de recommandation']}
};
const CHECKS=['Procédure d’entrée respectée','Personnel salué','Autorisation avant relevé','Part de linéaire / PDL','PLV','LDU','Merchandising','Facing','Ruptures','ODR','Perfect Merch','Concurrence','Incentive / guelte','Parcours client réalisé','Échange informel vendeur'];
const PREP={mainGoal:'Objectif principal',secondaryGoals:'Objectifs secondaires',expectedContact:'Interlocuteur prévu',news:'Actualité magasin',previousWork:'Travail réalisé précédemment',satisfaction:'Points de satisfaction',friction:'Points de friction',sellOut:'Sell-out',stocks:'Stocks',automaticReplenishment:'Réapprovisionnement automatique',assortment:'Assortiment',storeStatus:'Statut magasin',marketShare:'Part de marché',operations:'Opérations en cours',notes:'Notes de préparation'};
const FAMILIES=['blanc','brun'];
const FAMILY_LABELS={blanc:'Blanc · GEM / PEM',brun:'Brun · TV / Barres de son'};
const FAMILY_VALUES=['','blanc','brun','both'];
const REPORT_SHARED={context:'Contexte magasin (commun aux deux comptes rendus)'};
const REPORT_FIELDS={team:'Équipe rencontrée et verbatims vendeurs',actions:'Actions réalisées en magasin',massification:'Massification / exposition',omni:'Suivi OMNI',training:'Formation et prochain passage'};
const REPORT_SCOPES=['shared','blanc','brun'];
const clone=x=>JSON.parse(JSON.stringify(x));
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const now=()=>new Date().toISOString();
function id(){return 'visit-'+(root.crypto&&root.crypto.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2))}
function fail(text){throw Error(text)}
function dateValid(x){if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const d=new Date(x+'T12:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===x}
function strings(o,keys){if(!object(o))fail('Objet métier invalide.');for(const key of keys)if(typeof o[key]!=='string')fail('Champ métier invalide : '+key)}
function empty(){return {version:2,revision:0,storeSnapshots:{},visits:[],actions:[]}}
function blankScope(labels){return Object.fromEntries(Object.keys(labels).map(k=>[k,'']))}
function emptyReport(){return{shared:blankScope(REPORT_SHARED),blanc:blankScope(REPORT_FIELDS),brun:blankScope(REPORT_FIELDS)}}
/* Lecture seule : une visite enregistrée avant l'introduction du compte rendu n'a pas de
   bloc `report`, et on ne la réécrit pas pour autant. reportOf reconstruit le bloc complet
   à la volée, en conservant ce qui existe déjà, sans jamais toucher la visite stockée. */
function reportOf(v){const src=object(v&&v.report)?v.report:{},out=emptyReport();
 for(const scope of REPORT_SCOPES){const from=object(src[scope])?src[scope]:{};for(const key of Object.keys(out[scope]))if(typeof from[key]==='string')out[scope][key]=from[key]}
 return out}
function familyOf(v){return FAMILIES.includes(v&&v.activeFamily)?v.activeFamily:'brun'}
function data(s){return s.businessV2===undefined?(s.businessV2=empty()):s.businessV2}
function getVisit(s,visitId,edit=false){const v=data(s).visits.find(x=>x.id===visitId);if(!v)fail('Visite introuvable.');if(edit&&v.status!=='draft')fail('Cette visite est terminée.');return v}
function start(s,storeId){const store=s.stores.find(x=>String(x.id)===String(storeId));if(!store)fail('Magasin absent du secteur.');const b=data(s),key=String(store.id),existing=b.visits.find(v=>v.storeId===key&&v.status==='draft');if(existing)return existing.id;
 b.storeSnapshots[key]={id:key,enseigne:store.enseigne,ville:store.ville,adresse:store.adresse||''};
 const sixP={};for(const [p,section] of Object.entries(SIX_P))sixP[p]=section.items.map(()=>({status:'',comment:'',action:'',owner:'',dueDate:'',actionId:null,family:''}));
 const v={id:id(),storeId:key,status:'draft',createdAt:now(),updatedAt:now(),completedAt:null,completedDate:null,step:0,preparation:Object.fromEntries(Object.keys(PREP).map(k=>[k,''])),arrival:{checks:CHECKS.map(()=>false),positives:'',opportunities:'',anomalies:[]},sixP,conclusion:'',activeFamily:'brun',report:emptyReport()};b.visits.push(v);return v.id;
}
function touch(v){v.updatedAt=now()}
function editVisit(s,visitId,section,key,value){const v=getVisit(s,visitId,true);if(section==='preparation'&&Object.hasOwn(PREP,key)&&typeof value==='string')v.preparation[key]=value;
 else if(section==='arrival'&&['positives','opportunities'].includes(key)&&typeof value==='string')v.arrival[key]=value;
 else if(section==='check'&&Number.isInteger(key)&&key>=0&&key<CHECKS.length&&typeof value==='boolean')v.arrival.checks[key]=value;
 else if(section==='conclusion'&&typeof value==='string')v.conclusion=value;
 else if(section==='activeFamily'){if(!FAMILIES.includes(value))fail('Famille invalide.');v.activeFamily=value}
 else if(section==='step'&&Number.isInteger(value)&&value>=0&&value<=5)v.step=value;
 else fail('Champ visite inconnu.');touch(v)}
function getAction(s,actionId){const a=data(s).actions.find(x=>x.id===actionId);if(!a)fail('Action introuvable.');return a}
function item(s,visitId,p,index,edit=false){const v=getVisit(s,visitId,edit);if(!Object.hasOwn(SIX_P,p)||!Number.isInteger(index)||!v.sixP[p][index])fail('Élément 6P inconnu.');return {v,row:v.sixP[p][index]}}
function edit6P(s,visitId,p,index,key,value){const {v,row}=item(s,visitId,p,index,true);if(!['status','comment','action','owner','dueDate','family'].includes(key)||typeof value!=='string')fail('Champ 6P inconnu.');if(key==='family'&&!FAMILY_VALUES.includes(value))fail('Famille invalide.');if(key==='dueDate'&&value&&!dateValid(value))fail('Échéance invalide.');if(key==='status'&&!['','ok','correct','opportunity'].includes(value))fail('Statut 6P invalide.');if(key==='action'&&row.actionId&&!value.trim())fail('La description d’une action liée ne peut pas être vide.');row[key]=value;
 /* Étiquetage automatique : sur le terrain, renseigner une ligne suffit à la rattacher à la
    famille en cours. Zéro tap supplémentaire, et une ligne déjà étiquetée n'est jamais
    réécrite — y compris quand on repasse sur l'autre famille pour la compléter. */
 if(['status','comment','action'].includes(key)&&value&&!row.family)row.family=familyOf(v);
 if(row.actionId&&['action','owner','dueDate'].includes(key)){const a=getAction(s,row.actionId);a[key==='action'?'description':key]=value;a.updatedAt=now()}touch(v)}
function createAction(s,v,source,category,description,owner='',dueDate=''){if(!description.trim())fail('Décris le constat ou l’action avant de convertir.');const b=data(s);const existing=b.actions.find(a=>a.visitId===v.id&&a.source===source);if(existing)return existing.id;const a={id:id(),storeId:v.storeId,visitId:v.id,source,category,description,owner,dueDate,status:'open',completedAt:null,createdAt:now(),updatedAt:now()};b.actions.push(a);return a.id}
function actionFrom6P(s,visitId,p,index){const {v,row}=item(s,visitId,p,index,true);if(!row.actionId)row.actionId=createAction(s,v,'6p:'+p+':'+index,SIX_P[p].label,row.action,row.owner,row.dueDate);touch(v);return row.actionId}
function addAnomaly(s,visitId){const v=getVisit(s,visitId,true),a={id:id(),text:'',actionId:null,family:familyOf(v)};v.arrival.anomalies.push(a);touch(v);return a.id}
function anomaly(s,visitId,anomalyId){const v=getVisit(s,visitId,true),row=v.arrival.anomalies.find(a=>a.id===anomalyId);if(!row)fail('Anomalie introuvable.');return {v,row}}
function setAnomalyFamily(s,visitId,anomalyId,family){const {v,row}=anomaly(s,visitId,anomalyId);if(!FAMILY_VALUES.includes(family))fail('Famille invalide.');row.family=family;touch(v)}
function editAnomaly(s,visitId,anomalyId,text){const {v,row}=anomaly(s,visitId,anomalyId);if(typeof text!=='string'||(row.actionId&&!text.trim()))fail('La description d’une action liée ne peut pas être vide.');row.text=text;if(row.actionId){const a=getAction(s,row.actionId);a.description=text;a.updatedAt=now()}touch(v)}
function actionFromAnomaly(s,visitId,anomalyId){const {v,row}=anomaly(s,visitId,anomalyId);if(!row.actionId)row.actionId=createAction(s,v,'360:'+row.id,'360°',row.text);touch(v);return row.actionId}
function editReport(s,visitId,scope,key,value){const v=getVisit(s,visitId,true);
 const allowed=scope==='shared'?REPORT_SHARED:(scope==='blanc'||scope==='brun')?REPORT_FIELDS:null;
 if(!allowed||!Object.hasOwn(allowed,key)||typeof value!=='string')fail('Champ compte rendu inconnu.');
 const report=v.report=reportOf(v);report[scope][key]=value;touch(v)}
function editAction(s,actionId,key,value){const a=getAction(s,actionId);if(!['owner','dueDate','status'].includes(key)||typeof value!=='string')fail('Champ action inconnu.');if(key==='dueDate'&&value&&!dateValid(value))fail('Échéance invalide.');if(key==='status'&&!['open','in_progress','done','cancelled'].includes(value))fail('Statut action invalide.');a[key]=value;a.updatedAt=now();if(key==='status')a.completedAt=value==='done'?(a.completedAt||now()):null;
 const v=getVisit(s,a.visitId);if(['owner','dueDate'].includes(key))for(const rows of Object.values(v.sixP))for(const row of rows)if(row.actionId===a.id)row[key]=value;
}
function complete(s,visitId,day){const v=getVisit(s,visitId);if(v.status==='completed')return v.id;if(!dateValid(day))fail('Date de visite invalide.');if(!v.conclusion.trim())fail('Ajoute une conclusion avant de terminer.');for(const [p,rows] of Object.entries(v.sixP))rows.forEach((row,i)=>{if(row.action.trim())actionFrom6P(s,visitId,p,i)});
 v.status='completed';v.completedDate=day;v.completedAt=now();touch(v);
 if(s.stores.some(x=>String(x.id)===v.storeId)){if(!s.visits)s.visits={};const history=s.visits[v.storeId]||(s.visits[v.storeId]={lastVisit:'',history:[]});if(!Array.isArray(history.history))history.history=[];if(!history.history.includes(day))history.history.push(day);history.history.sort();history.lastVisit=history.history[history.history.length-1]||''}return v.id;
}
/* V231 — suppression d'une visite enregistrée par erreur.
   Propriétaire unique de l'opération : aucun autre module ne retire une visite de
   `businessV2`. La cible est toujours un `visitId`, jamais une date.

   Objets liés, et pourquoi :
   - Les actions appartiennent structurellement à leur visite. validate() exige que
     chaque action pointe une visite existante ET la ligne 6P / 360° qui l'a créée :
     une action orpheline est invalide par construction, et la ligne qui la décrit
     disparaît avec la visite. Elles sont donc supprimées avec elle. Une action
     indépendante d'un autre magasin ou d'une autre visite n'est jamais touchée.
   - Les opportunités survivent au magasin : elles décrivent un potentiel commercial,
     pas le passage. Leur propriétaire (`store-runner-opportunities.js`) les détache
     — `visitId = null`, `source = 'store'`. Si ce propriétaire est introuvable alors
     qu'une opportunité est rattachée, on échoue plutôt que de laisser un identifiant
     orphelin qui ferait échouer la validation métier.
   - L'historique legacy `state.visits[storeId]` est recalculé de façon ciblée : le jour
     n'est retiré que si plus aucune visite terminée du même magasin ne le porte. Un
     historique importé avant `businessV2` n'est donc jamais réécrit. */
function opportunityOwner(){
 if(root.StoreRunnerOpportunities)return root.StoreRunnerOpportunities;
 try{return typeof require==='function'?require('./store-runner-opportunities.js'):null}catch(e){return null}
}
function removeVisit(s,visitId,options){
 options=options||{};const b=data(s),key=String(visitId==null?'':visitId);
 const index=b.visits.findIndex(x=>x.id===key);if(index<0)fail('Visite introuvable.');
 const v=b.visits[index],storeId=String(v.storeId),day=v.status==='completed'?v.completedDate:'';
 const opportunities=Array.isArray(b.opportunities)?b.opportunities:[];
 const linked=opportunities.filter(o=>o&&o.visitId!=null&&String(o.visitId)===key);
 const owner=options.opportunities!==undefined?options.opportunities:opportunityOwner();
 if(linked.length&&!(owner&&typeof owner.detachVisit==='function'))fail('Module Opportunité indisponible : suppression annulée.');
 const detached=linked.length?owner.detachVisit(s,key):0;
 const actions=b.actions.filter(a=>String(a.visitId)===key).map(a=>a.id);
 b.actions=b.actions.filter(a=>String(a.visitId)!==key);
 b.visits.splice(index,1);
 if(day){
  const stillUsed=b.visits.some(x=>x.status==='completed'&&String(x.storeId)===storeId&&x.completedDate===day);
  const legacy=s.visits&&s.visits[storeId];
  if(legacy&&Array.isArray(legacy.history)&&!stillUsed){
   legacy.history=legacy.history.filter(x=>String(x)!==String(day));legacy.history.sort();
   legacy.lastVisit=legacy.history[legacy.history.length-1]||'';
  }
 }
 return {visitId:key,storeId,completedDate:day,actions:actions.length,opportunities:detached};
}
/* Compatibilité ascendante : ces clés sont arrivées après des visites déjà enregistrées en
   production. Aucune n'est obligatoire — on ne contrôle que ce qui est présent, et on ne
   réécrit jamais une visite à la lecture. */
function optionalFamily(x){if(x&&x.family!==undefined&&!FAMILY_VALUES.includes(x.family))fail('Famille invalide.')}
function optionalReport(r){if(r===undefined)return;if(!object(r))fail('Compte rendu invalide.');
 for(const scope of Object.keys(r)){if(!REPORT_SCOPES.includes(scope))fail('Champ compte rendu inconnu.');
  const allowed=scope==='shared'?REPORT_SHARED:REPORT_FIELDS,block=r[scope];if(!object(block))fail('Compte rendu invalide.');
  for(const key of Object.keys(block)){if(!Object.hasOwn(allowed,key))fail('Champ compte rendu inconnu.');if(typeof block[key]!=='string')fail('Compte rendu invalide.')}}}
function validate(s){const b=s.businessV2;if(b===undefined)return s;if(!object(b)||b.version!==2||!Number.isSafeInteger(b.revision)||b.revision<0||!object(b.storeSnapshots)||!Array.isArray(b.visits)||!Array.isArray(b.actions))fail('Données Visit/Action V2 invalides.');
 const stores=new Set(s.stores.map(x=>String(x.id)));for(const [key,snap] of Object.entries(b.storeSnapshots)){strings(snap,['id','enseigne','ville','adresse']);if(key!==snap.id)fail('Instantané magasin incohérent.');stores.add(key)}
 const visits=new Map(),actions=new Map(),drafts=new Set(),sources=new Set();for(const [rows,map] of [[b.visits,visits],[b.actions,actions]])for(const x of rows){if(!object(x)||typeof x.id!=='string'||!x.id||map.has(x.id)||!stores.has(x.storeId))fail('Identifiant métier ou magasin invalide.');strings(x,['createdAt','updatedAt']);if(!Number.isFinite(Date.parse(x.createdAt))||!Number.isFinite(Date.parse(x.updatedAt)))fail('Horodatage invalide.');map.set(x.id,x)}
 for(const v of b.visits){if(!['draft','completed'].includes(v.status)||!Number.isInteger(v.step)||v.step<0||v.step>5)fail('État visite invalide.');strings(v,['conclusion']);if(v.activeFamily!==undefined&&!FAMILIES.includes(v.activeFamily))fail('Famille invalide.');optionalReport(v.report);strings(v.preparation,Object.keys(PREP));strings(v.arrival,['positives','opportunities']);if(!Array.isArray(v.arrival.checks)||v.arrival.checks.length!==CHECKS.length||v.arrival.checks.some(x=>typeof x!=='boolean')||!Array.isArray(v.arrival.anomalies))fail('Relevé 360° invalide.');
  if(v.status==='draft'){if(drafts.has(v.storeId)||v.completedAt!==null||v.completedDate!==null)fail('Brouillon incohérent ou dupliqué.');drafts.add(v.storeId)}else if(!dateValid(v.completedDate)||!v.conclusion.trim()||!Number.isFinite(Date.parse(v.completedAt)))fail('Clôture invalide.');
  function link(row,source,description){if(row.actionId===null)return;const a=actions.get(row.actionId);if(!a||a.visitId!==v.id||a.source!==source||a.description!==description)fail('Action liée incohérente.');if(source.startsWith('6p:')&&(a.owner!==row.owner||a.dueDate!==row.dueDate))fail('Responsable ou échéance désynchronisé.')}
  const anomalyIds=new Set();for(const row of v.arrival.anomalies){strings(row,['id','text']);optionalFamily(row);if(!row.id||anomalyIds.has(row.id))fail('Anomalie dupliquée.');anomalyIds.add(row.id);link(row,'360:'+row.id,row.text)}
  if(!object(v.sixP)||Object.keys(v.sixP).length!==6)fail('Exactement six P sont requis.');for(const [p,section] of Object.entries(SIX_P)){const rows=v.sixP[p];if(!Array.isArray(rows)||rows.length!==section.items.length)fail('Section 6P invalide.');rows.forEach((row,i)=>{strings(row,['status','comment','action','owner','dueDate']);optionalFamily(row);if(!['','ok','correct','opportunity'].includes(row.status)||(row.dueDate&&!dateValid(row.dueDate)))fail('Statut ou échéance 6P invalide.');link(row,'6p:'+p+':'+i,row.action)})}
 }
 for(const a of b.actions){const v=visits.get(a.visitId);strings(a,['source','category','description','owner','dueDate','status']);if(!v||v.storeId!==a.storeId||!a.description.trim()||(a.dueDate&&!dateValid(a.dueDate))||!['open','in_progress','done','cancelled'].includes(a.status))fail('Action invalide.');if(a.status==='done'?!Number.isFinite(Date.parse(a.completedAt)):a.completedAt!==null)fail('Réalisation incohérente.');const unique=a.visitId+'|'+a.source;if(sources.has(unique))fail('Action source dupliquée.');sources.add(unique);
  const parts=a.source.split(':');if(parts[0]==='6p'){const rows=v.sixP[parts[1]],row=rows&&rows[Number(parts[2])];if(!row||row.actionId!==a.id||a.category!==SIX_P[parts[1]].label)fail('Source 6P invalide.')}else if(parts[0]==='360'){if(!v.arrival.anomalies.some(x=>x.id===parts.slice(1).join(':')&&x.actionId===a.id)||a.category!=='360°')fail('Source anomalie invalide.')}else fail('Source action inconnue.');
 }return s;
}
const api={SIX_P,CHECKS,PREP,FAMILIES,FAMILY_LABELS,FAMILY_VALUES,REPORT_SHARED,REPORT_FIELDS,clone,empty,data,start,getVisit,editVisit,edit6P,addAnomaly,editAnomaly,setAnomalyFamily,editReport,reportOf,actionFrom6P,actionFromAnomaly,editAction,complete,removeVisit,validate,dateValid};
root.StoreRunnerVisitModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
