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
/* V277 — mémoire locale, dérivée et traçable. Pas de résumé génératif : chaque texte
   est un extrait intégral ou une référence explicitement citée. Le cache facultatif
   voyage avec la visite ; les sources restent l'autorité (anciens exports compris). */
const MEMORY_LABELS={action:'Action réalisée',followup:'Sujet à suivre',training:'Formation',merchandising:'Merchandising / exposition',product:'Référence citée',problem:'Problème / blocage',priority:'Prochain passage',objection:'Objection / concurrence',contact:'Interlocuteur / terrain'};
const memoryKey=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function reportSourceEntries(v){
 const report=reportOf(v),out=[],add=(text,source,family='')=>{if(typeof text==='string'&&text.trim())out.push({source,family,text})};
 for(const family of FAMILIES)for(const key of Object.keys(REPORT_FIELDS))add(report[family][key],'report.'+family+'.'+key,family);
 add(report.shared.context,'report.shared.context','');add(v&&v.conclusion,'conclusion','');
 const arrival=v&&v.arrival||{};add(arrival.positives,'arrival.positives','');add(arrival.opportunities,'arrival.opportunities','');
 for(const [i,a] of (Array.isArray(arrival.anomalies)?arrival.anomalies:[]).entries())if(a)add(a.text,'arrival.anomalies.'+i+'.text',a.family||'');
 for(const [p,section] of Object.entries(SIX_P)){const rows=v&&v.sixP&&v.sixP[p];if(!Array.isArray(rows))continue;rows.forEach((row,i)=>{if(!row)return;add(row.comment,'sixP.'+p+'.'+i+'.comment',row.family||'');add(row.action,'sixP.'+p+'.'+i+'.action',row.family||'')})}
 return out;
}
function reportSourceSignature(v){
 const raw=JSON.stringify(reportSourceEntries(v));let h=2166136261;
 for(let i=0;i<raw.length;i++){h^=raw.charCodeAt(i);h=Math.imul(h,16777619)}
 return 'v1-'+(h>>>0).toString(36);
}
function aiMemoryOf(v){
 const cache=v&&v.runnerAI;if(!v||v.status!=='completed'||!object(cache)||cache.version!==1||cache.status!=='done'||cache.sourceSignature!==reportSourceSignature(v)||!Array.isArray(cache.items))return[];
 const bySource=new Map(reportSourceEntries(v).map(x=>[x.source,x])),out=[],seen=new Set(),statuses=new Set(['recorded','planned','done','cancelled']);
 for(const item of cache.items){if(!object(item)||!Object.hasOwn(MEMORY_LABELS,item.kind)||!statuses.has(item.status)||typeof item.source!=='string'||typeof item.text!=='string')continue;
  const src=bySource.get(item.source),quote=item.text.replace(/\s+/g,' ').trim();if(!src||quote.length<4||quote.length>600)continue;
  const hay=src.text.replace(/\s+/g,' ').trim();if(!memoryKey(hay).includes(memoryKey(quote)))continue;
  const key=item.kind+'|'+item.source+'|'+memoryKey(quote);if(seen.has(key))continue;seen.add(key);
  out.push({kind:item.kind,topic:item.topic||item.kind,text:quote,source:item.source,family:src.family||'',status:item.status});
 }
 return out;
}
function analyzeReport(v){
 if(!v||v.status!=='completed')return{version:1,items:[]};
 const items=[],seen=new Set(),report=reportOf(v);
 function add(kind,text,source,family,status){
  const key=kind+'|'+family+'|'+memoryKey(text);if(seen.has(key)||items.length>=48)return;
  const n=memoryKey(text),topic=kind==='problem'?(/\bsav\b|service apres.vente/.test(n)?'sav':/\bstock[s]?\b|\brupture[s]?\b/.test(n)?'stock':'blocker'):kind;
  seen.add(key);items.push({kind,topic,text,source,family,status});
 }
 function read(value,source,family,hint){
  if(typeof value!=='string'||value.length>20000)return;
  // Garder une phrase entière : couper à 180 caractères pourrait effacer une négation.
  for(const part of value.split(/\n+|(?<=[.!?;])\s+/).slice(0,80)){
   const text=part.trim();if(text.length<4||text.length>600)continue;
   if(source==='conclusion'&&FAMILIES.some(f=>Object.values(report[f]).some(note=>note.includes(text))))continue;
   const n=memoryKey(text);
   const uncertain=/\?|\b(pas|non|jamais|aucun|aucune|sans|peut|pourrait|pourraient|semble|semblerait|si|souhaite|souhaiterait|envisage|envisagee)\b/.test(n);
   const future=/\ba (prevoir|faire|suivre|revoir|relancer|terminer|finaliser|organiser|former|verifier|installer|corriger|reparer|remplacer|envoyer|commander)\b|\b(prochain[e]? (passage|visite)|prevu[e]?|planifie[e]?|reste a|relancer|revoir|prevoir)\b|^(former|verifier|suivre|installer|organiser|reparer|remplacer|envoyer|commander)\b/.test(n);
   const done=/\b(realise[e]?s?|effectue[e]?s?|termine[e]?s?|corrige[e]?s?|resolu[e]?s?|installe[e]?s?|forme[e]?s?|nettoye[e]?s?|mis[e]? a jour|fait[e]?s?)\b/.test(n);
   const status=!uncertain&&!future&&/\bannule[e]?s?\b/.test(n)?'cancelled':!uncertain&&!future&&done?'done':!uncertain&&future?'planned':'recorded';
   let kind='';
   if(/\b(formation|forme[e]?s?|former|pedagogie)\b/.test(n))kind='training';
   else if(/\b(probleme[s]?|blocage[s]?|bloque[e]?s?|rupture[s]?|panne[s]?|anomalie[s]?|sav)\b|\bstock[s]?\s+(insuffisant[s]?|manquant[s]?|nul[s]?|indisponible[s]?)\b/.test(n))kind='problem';
   else if(/\b(objection[s]?|concurren(?:ce|t[e]?s?)|comparaison|compare)\b/.test(n))kind='objection';
   else if(/\b(interlocuteur|responsable|directeur|directrice|manager|vendeur|vendeuse)\b/.test(n))kind='contact';
   else if(/\b(engagement[s]?|priorite[s]?|prochain[e]? (visite|passage))\b/.test(n))kind='priority';
   else if(/\b(merchandising|merch|exposition|expo|mural|facing|lineaire|plv|ldu|massification)\b/.test(n))kind='merchandising';
   else if(future)kind='followup';
   else if(status==='done')kind='action';
   else if(hint)kind=hint;
   if(kind==='problem'&&/\b(aucun[e]?|pas de|sans)\s+(probleme[s]?|blocage[s]?|rupture[s]?|panne[s]?|anomalie[s]?)\b/.test(n))kind='';
   if(kind)add(kind,text,source,family,status);
   // Aucune résolution catalogue : ni modèle, ni vente, ni disponibilité déduits.
   const refs=text.match(/\b(?:QE|UE|TQ|TU|GU|LS|HW|WW|WD|DV|RB|RS|RF|RT|NV|NZ|NK|DW|VR|VS)[-]?[A-Z0-9]{3,}(?:[-/][A-Z0-9]+)*\b/g)||[];
   for(const m of text.matchAll(/\b(?:r[ée]f[ée]rence|r[ée]f\.?|mod[èe]le)\s*[:：]?\s*([A-Z0-9][A-Z0-9/-]{3,39})\b/gi))refs.push(m[1]);
   for(const ref of refs)if(ref.length<=40&&/[A-Za-z]/.test(ref)&&/\d/.test(ref))add('product',ref,source,family,'recorded');
  }
 }
 for(const family of FAMILIES){const block=report[family];
  read(block.team,'report.'+family+'.team',family,'');
  read(block.training,'report.'+family+'.training',family,'priority');
  read(block.actions,'report.'+family+'.actions',family,'action');
  read(block.massification,'report.'+family+'.massification',family,'merchandising');
  read(block.omni,'report.'+family+'.omni',family,'followup');
 }
 read(report.shared.context,'report.shared.context','','');
 // Le carnet copie parfois une note en conclusion. Après correction de cette note,
 // l'ancien texte reste conservé dans le rapport mais ne doit plus fabriquer un rappel.
 if(!/^report\.(blanc|brun|shared)\.[a-z]+$/.test(String(v.runnerConclusionSource||'')))read(v.conclusion,'conclusion','','');
 const arrival=v&&v.arrival||{};
 read(arrival.positives,'arrival.positives','','');read(arrival.opportunities,'arrival.opportunities','','followup');
 for(const [i,a] of (Array.isArray(arrival.anomalies)?arrival.anomalies:[]).entries())if(a&&!a.actionId)read(a.text,'arrival.anomalies.'+i+'.text',a.family||'','problem');
 for(const [p,section] of Object.entries(SIX_P)){
  const rows=v&&v.sixP&&v.sixP[p];if(!Array.isArray(rows))continue;
  rows.forEach((row,i)=>{if(!row)return;read(row.comment,'sixP.'+p+'.'+i+'.comment',row.family||'',row.status==='correct'?'problem':'');
   // Les statuts seuls restent chez insightsFor (V276) qui sait comparer leur historique.
  });
 }
 return{version:1,items};
}
function reportMemoryOf(v){
 if(!v||v.status!=='completed')return{version:1,items:[]};
 const derived=analyzeReport(v);
 // Un import modifié, une ancienne version ou un cache altéré ne peut fabriquer un fait.
 return object(v.runnerMemory)&&JSON.stringify(v.runnerMemory)===JSON.stringify(derived)?clone(v.runnerMemory):derived;
}
function reportMemoryFor(s,storeId,options){
 const o=options||{},key=String(storeId==null?'':storeId),b=s&&s.businessV2||{},all=Array.isArray(b.visits)?b.visits:[];
 const order=(a,c)=>String(c.completedDate||'').localeCompare(String(a.completedDate||''))||String(c.completedAt||'').localeCompare(String(a.completedAt||''))||String(c.id).localeCompare(String(a.id));
 let visits=all.filter(v=>v&&String(v.storeId)===key&&v.status==='completed'&&v.id!==o.excludeVisitId).slice().sort(order);
 if(o.onlyVisitId)visits=visits.filter(v=>v.id===o.onlyVisitId);
 if(o.beforeVisitId){const at=visits.findIndex(v=>v.id===o.beforeVisitId);if(at>=0)visits=visits.slice(at+1);else visits=[]}
 const byId=new Map(visits.map(v=>[v.id,v])),items=[],seen=new Set();
 const actionQuotes=new Set();
 const familyFits=f=>!o.family||!f||f==='both'||f===o.family;
 const fingerprint=i=>memoryKey(i.text).replace(/[.!?;]+$/,'');
 function keep(i){const k=fingerprint(i);if(!k||seen.has(k)||!familyFits(i.family))return;seen.add(k);items.push(i)}
 // Les statuts d'Action sont vivants : aucune copie du cache ne les remplace.
 const actions=(Array.isArray(b.actions)?b.actions:[]).filter(a=>a&&String(a.storeId)===key&&byId.has(a.visitId)).slice().sort((a,c)=>Number(['done','cancelled'].includes(a.status))-Number(['done','cancelled'].includes(c.status))||order(byId.get(a.visitId),byId.get(c.visitId)));
 for(const a of actions){const v=byId.get(a.visitId),parts=String(a.source||'').split(':');let row;
  if(parts[0]==='6p')row=v.sixP&&v.sixP[parts[1]]&&v.sixP[parts[1]][Number(parts[2])];
  else row=(v.arrival&&v.arrival.anomalies||[]).find(x=>x.id===parts.slice(1).join(':'));
  if(!familyFits(row&&row.family||''))continue;
  for(const part of String(a.description||'').split(/\n+|(?<=[.!?;])\s+/))actionQuotes.add((row&&row.family||'')+'|'+fingerprint({text:part}));
  if(a.status==='cancelled'){seen.add(fingerprint({text:a.description}));continue}
  if(!['open','in_progress','done'].includes(a.status))continue;
  keep({kind:a.status==='done'?'action':'followup',text:a.description,source:'actions.'+a.id,family:row&&row.family||'',status:a.status,actionId:a.id,visitId:v.id,date:v.completedDate,label:'Action '+(a.status==='done'?'terminée':a.status==='in_progress'?'en cours':'ouverte'),dueDate:a.dueDate||''});
 }
 // Trois derniers rapports pour les rappels ; l'historique conserve tous les autres.
 // Un sujet textuel n'est jamais déclaré « encore ouvert » sans Action liée.
 const recent=visits.slice(0,o.history===true?visits.length:3);
 for(const v of recent){
  for(const i of reportMemoryOf(v).items){
   if(actionQuotes.has(i.family+'|'+fingerprint(i)))continue;
   if(i.source==='conclusion'&&items.some(x=>fingerprint(x)===fingerprint(i)))continue;
   keep({...i,visitId:v.id,date:v.completedDate,label:i.topic==='sav'?'SAV':i.topic==='stock'?'Stock / rupture':i.kind==='action'&&i.status!=='done'?'Action notée':MEMORY_LABELS[i.kind]||'Note'});
  }
  for(const i of aiMemoryOf(v)){
   keep({...i,visitId:v.id,date:v.completedDate,label:i.topic==='sav'?'SAV':i.topic==='stock'?'Stock / rupture':MEMORY_LABELS[i.kind]||'Note'});
  }
 }
 const score=i=>i.actionId&&i.status!=='done'?100:i.status==='planned'?80:i.kind==='problem'&&i.status!=='done'?70:i.kind==='priority'||i.kind==='followup'?60:i.kind==='training'?40:i.kind==='merchandising'?30:i.kind==='action'?20:10;
 items.sort((a,c)=>score(c)-score(a)||String(c.date).localeCompare(String(a.date)));
 return{storeId:key,items:items.slice(0,Number.isInteger(o.limit)?Math.max(0,o.limit):48)};
}
function reportMemoryLines(s,storeId,options){
 const o=options||{},data=reportMemoryFor(s,storeId,{...o,limit:48});
 return data.items.filter(i=>!['done','cancelled'].includes(i.status)&&(i.actionId||i.kind!=='product'&&i.kind!=='action')).slice(0,Number.isInteger(o.limit)?o.limit:2).map(i=>({
  id:'memory:'+i.visitId+':'+i.source,kind:'report-memory',severity:i.actionId?3:i.status==='planned'||i.kind==='problem'?2:1,tone:i.actionId?'attention':'neutral',
  text:(i.actionId?i.label+' · ':i.label+' · noté le ')+i.date+' : « '+i.text+' »'
 }));
}
function familyOf(v){return FAMILIES.includes(v&&v.activeFamily)?v.activeFamily:'brun'}
function data(s){return s.businessV2===undefined?(s.businessV2=empty()):s.businessV2}
function getVisit(s,visitId,edit=false){const v=data(s).visits.find(x=>x.id===visitId);if(!v)fail('Visite introuvable.');if(edit&&v.status!=='draft')fail('Cette visite est terminée.');return v}
function start(s,storeId){const store=s.stores.find(x=>String(x.id)===String(storeId));if(!store)fail('Magasin absent du secteur.');const b=data(s),key=String(store.id),existing=b.visits.find(v=>v.storeId===key&&v.status==='draft');if(existing)return existing.id;
 b.storeSnapshots[key]={id:key,enseigne:store.enseigne,ville:store.ville,adresse:store.adresse||''};
 const sixP={};for(const [p,section] of Object.entries(SIX_P))sixP[p]=section.items.map(()=>({status:'',comment:'',action:'',owner:'',dueDate:'',actionId:null,family:''}));
 const v={id:id(),storeId:key,status:'draft',createdAt:now(),updatedAt:now(),completedAt:null,completedDate:null,step:0,preparation:Object.fromEntries(Object.keys(PREP).map(k=>[k,''])),arrival:{checks:CHECKS.map(()=>false),positives:'',opportunities:'',anomalies:[]},sixP,conclusion:'',activeFamily:'brun',report:emptyReport()};b.visits.push(v);return v.id;
}
function touch(v){v.updatedAt=now()}
function editVisit(s,visitId,section,key,value){const v=getVisit(s,visitId,true);preserveReportSource(v);if(section==='preparation'&&Object.hasOwn(PREP,key)&&typeof value==='string')v.preparation[key]=value;
 else if(section==='arrival'&&['positives','opportunities'].includes(key)&&typeof value==='string')v.arrival[key]=value;
 else if(section==='check'&&Number.isInteger(key)&&key>=0&&key<CHECKS.length&&typeof value==='boolean')v.arrival.checks[key]=value;
 else if(section==='conclusion'&&typeof value==='string'){v.conclusion=value;delete v.runnerConclusionSource}
 else if(section==='activeFamily'){if(!FAMILIES.includes(value))fail('Famille invalide.');v.activeFamily=value}
 else if(section==='step'&&Number.isInteger(value)&&value>=0&&value<=5)v.step=value;
 else fail('Champ visite inconnu.');touch(v)}
function getAction(s,actionId){const a=data(s).actions.find(x=>x.id===actionId);if(!a)fail('Action introuvable.');return a}
function item(s,visitId,p,index,edit=false){const v=getVisit(s,visitId,edit);if(!Object.hasOwn(SIX_P,p)||!Number.isInteger(index)||!v.sixP[p][index])fail('Élément 6P inconnu.');return {v,row:v.sixP[p][index]}}
function edit6P(s,visitId,p,index,key,value){const {v,row}=item(s,visitId,p,index,true);preserveReportSource(v);if(!['status','comment','action','owner','dueDate','family'].includes(key)||typeof value!=='string')fail('Champ 6P inconnu.');if(key==='family'&&!FAMILY_VALUES.includes(value))fail('Famille invalide.');if(key==='dueDate'&&value&&!dateValid(value))fail('Échéance invalide.');if(key==='status'&&!['','ok','correct','opportunity'].includes(value))fail('Statut 6P invalide.');if(key==='action'&&row.actionId&&!value.trim())fail('La description d’une action liée ne peut pas être vide.');row[key]=value;
 /* Étiquetage automatique : sur le terrain, renseigner une ligne suffit à la rattacher à la
    famille en cours. Zéro tap supplémentaire, et une ligne déjà étiquetée n'est jamais
    réécrite — y compris quand on repasse sur l'autre famille pour la compléter. */
 if(['status','comment','action'].includes(key)&&value&&!row.family)row.family=familyOf(v);
 if(row.actionId&&['action','owner','dueDate'].includes(key)){const a=getAction(s,row.actionId);a[key==='action'?'description':key]=value;a.updatedAt=now()}touch(v)}
function createAction(s,v,source,category,description,owner='',dueDate=''){if(!description.trim())fail('Décris le constat ou l’action avant de convertir.');const b=data(s);const existing=b.actions.find(a=>a.visitId===v.id&&a.source===source);if(existing)return existing.id;const a={id:id(),storeId:v.storeId,visitId:v.id,source,category,description,owner,dueDate,status:'open',completedAt:null,createdAt:now(),updatedAt:now()};b.actions.push(a);return a.id}
function actionFrom6P(s,visitId,p,index){const {v,row}=item(s,visitId,p,index,true);if(!row.actionId)row.actionId=createAction(s,v,'6p:'+p+':'+index,SIX_P[p].label,row.action,row.owner,row.dueDate);touch(v);return row.actionId}
function addAnomaly(s,visitId){const v=getVisit(s,visitId,true),a={id:id(),text:'',actionId:null,family:familyOf(v)};preserveReportSource(v);v.arrival.anomalies.push(a);touch(v);return a.id}
function anomaly(s,visitId,anomalyId){const v=getVisit(s,visitId,true),row=v.arrival.anomalies.find(a=>a.id===anomalyId);if(!row)fail('Anomalie introuvable.');return {v,row}}
function setAnomalyFamily(s,visitId,anomalyId,family){const {v,row}=anomaly(s,visitId,anomalyId);if(!FAMILY_VALUES.includes(family))fail('Famille invalide.');preserveReportSource(v);row.family=family;touch(v)}
function editAnomaly(s,visitId,anomalyId,text){const {v,row}=anomaly(s,visitId,anomalyId);if(typeof text!=='string'||(row.actionId&&!text.trim()))fail('La description d’une action liée ne peut pas être vide.');preserveReportSource(v);row.text=text;if(row.actionId){const a=getAction(s,row.actionId);a.description=text;a.updatedAt=now()}touch(v)}
function actionFromAnomaly(s,visitId,anomalyId){const {v,row}=anomaly(s,visitId,anomalyId);if(!row.actionId)row.actionId=createAction(s,v,'360:'+row.id,'360°',row.text);touch(v);return row.actionId}
function editReport(s,visitId,scope,key,value){const v=getVisit(s,visitId,true);
 const allowed=scope==='shared'?REPORT_SHARED:(scope==='blanc'||scope==='brun')?REPORT_FIELDS:null;
 if(!allowed||!Object.hasOwn(allowed,key)||typeof value!=='string')fail('Champ compte rendu inconnu.');
 preserveReportSource(v);
 const report=v.report=reportOf(v);
 // Migration paresseuse des conclusions copiées avant V277, sans effacer leur texte.
 const previous=report[scope][key].trim();if(previous&&v.conclusion.trim()===previous.slice(0,500))v.runnerConclusionSource='report.'+scope+'.'+key;
 report[scope][key]=value;touch(v)}
function editAction(s,actionId,key,value){const a=getAction(s,actionId);if(!['owner','dueDate','status'].includes(key)||typeof value!=='string')fail('Champ action inconnu.');if(key==='dueDate'&&value&&!dateValid(value))fail('Échéance invalide.');if(key==='status'&&!['open','in_progress','done','cancelled'].includes(value))fail('Statut action invalide.');a[key]=value;a.updatedAt=now();if(key==='status')a.completedAt=value==='done'?(a.completedAt||now()):null;
 const v=getVisit(s,a.visitId);if(['owner','dueDate'].includes(key))for(const rows of Object.values(v.sixP))for(const row of rows)if(row.actionId===a.id)row[key]=value;
}
/* Le carnet terrain reste la source. Le texte professionnel et le travail distant
   sont facultatifs, sauvegardés avec la visite et ne sont jamais écrits dans report. */
const REPORT_TYPES=['brun','blanc','cuisiniste','buying-groups'];
const JOB_STATUSES=['pending','processing','done','failed'];
function professionalRevision(v){return object(v&&v.professionalReport)&&Number.isSafeInteger(v.professionalReport.revision)?v.professionalReport.revision:0}
function reportTypes(s,v){
 const store=(s.stores||[]).find(x=>String(x.id)===String(v.storeId))||(s.businessV2&&s.businessV2.storeSnapshots||{})[v.storeId]||{};
 const brand=memoryKey(store.enseigne);
 if(store.channel==='cuisiniste'||['schmidt','cuisinella'].includes(brand))return['cuisiniste'];
 if(['gitem','pro&cie','pro et cie','procie','pro cie'].includes(brand))return['buying-groups'];
 const selected=(store.products||[]).map(x=>String(x||'').trim().toLowerCase()).filter(x=>FAMILIES.includes(x)),r=reportOf(v);
 const supplied=FAMILIES.filter(f=>Object.values(r[f]).some(x=>x.trim()));
 return FAMILIES.filter(f=>selected.includes(f)||supplied.includes(f)).length?FAMILIES.filter(f=>selected.includes(f)||supplied.includes(f)):[familyOf(v)];
}
function frozenReportSource(s,v){
 const store=(s.stores||[]).find(x=>String(x.id)===String(v.storeId))||(s.businessV2&&s.businessV2.storeSnapshots||{})[v.storeId]||{},r=reportOf(v);
 const entries=reportSourceEntries(v).filter(e=>e.source!=='conclusion'||(!v.runnerConclusionSource&&e.text!=='Visite terrain enregistrée'&&!r.shared.context.includes(e.text)&&!FAMILIES.some(f=>Object.values(r[f]).some(x=>x.trim()&&x.includes(e.text)))));
 return{version:1,visitId:v.id,storeId:String(v.storeId),completedDate:v.completedDate,store:{enseigne:String(store.enseigne||''),ville:String(store.ville||''),channel:String(store.channel||'')},reports:reportTypes(s,v).map(reportType=>({reportType,entries:clone(entries.filter(e=>!FAMILIES.includes(reportType)||!e.family||e.family==='both'||e.family===reportType))}))};
}
function compactReportSource(source){return{...source,compact:true,reports:source.reports.map(r=>({reportType:r.reportType,entries:r.entries.map(e=>({source:e.source,family:e.family}))}))}}
function sourceForReportJob(v){
 const j=v&&v.reportJob;if(!j||!object(j.source))return null;
 if(!j.source.compact)return clone(j.source);
 if(j.localSourceSignature!==reportSourceSignature(v))return null;
 const bySource=new Map(reportSourceEntries(v).map(e=>[e.source,e])),out=clone(j.source);delete out.compact;
 for(const r of out.reports)for(const e of r.entries){const entry=bySource.get(e.source);if(!entry||entry.family!==e.family)return null;e.text=entry.text}
 return out;
}
function preserveReportSource(v){
 const j=v&&v.reportJob;if(!j)return;
 if(Array.isArray(v.reportSourceHistory)&&v.reportSourceHistory.some(x=>x.generation===j.generation))return;
 const source=sourceForReportJob(v);if(!source)return;
 if(!Array.isArray(v.reportSourceHistory))v.reportSourceHistory=[];
 v.reportSourceHistory.push({generation:j.generation,capturedAt:j.createdAt,source});
}
function secureReportCapability(){
 if(!(root.crypto&&typeof root.crypto.getRandomValues==='function'))return'';
 try{const bytes=new Uint8Array(32);root.crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}catch(e){return''}
}
function createReportJob(s,visitId,force=false){
 const v=getVisit(s,visitId);if(v.status!=='completed')fail('Termine la visite avant de générer son compte rendu.');
 const localSourceSignature=reportSourceSignature(v),previous=v.reportJob,revision=professionalRevision(v);
 if(object(previous)&&!previous.obsolete&&previous.localSourceSignature===localSourceSignature&&previous.completedDate===v.completedDate&&previous.finalRevision===revision&&(!force||['pending','processing'].includes(previous.status)))return previous;
 const generation=object(previous)&&Number.isSafeInteger(previous.generation)?previous.generation+1:0,source=frozenReportSource(s,v),at=now();
 // Les notes clôturées sont déjà immuables : le manifeste référence leur texte
 // sans le doubler pour chaque historique. Une réouverture préserve l'ancien cliché.
 if(object(previous)&&previous.localSourceSignature!==localSourceSignature)preserveReportSource(v);
 v.reportJob={version:1,status:'pending',visitId:v.id,storeId:String(v.storeId),completedDate:v.completedDate,localSourceSignature,sourceSignature:'',generation,finalRevision:revision,accessToken:secureReportCapability(),jobId:'',createdAt:at,updatedAt:at,source:compactReportSource(source)};
 v.runnerAI={version:1,status:'pending',sourceSignature:localSourceSignature,items:[]};
 return v.reportJob;
}
function reportJobGuard(v,expected){
 const j=v&&v.reportJob;
 return !!(v&&v.status==='completed'&&object(j)&&!j.obsolete&&object(expected)&&j.generation===expected.generation&&j.completedDate===expected.completedDate&&v.completedDate===j.completedDate&&j.localSourceSignature===reportSourceSignature(v)&&j.finalRevision===professionalRevision(v)&&(!expected.sourceSignature||j.sourceSignature===expected.sourceSignature));
}
function updateReportJob(s,visitId,expected,patch){
 const v=getVisit(s,visitId);if(!reportJobGuard(v,expected))return false;const j=v.reportJob;
 for(const key of ['status','sourceSignature','accessToken','jobId','error','retryAt'])if(Object.hasOwn(patch,key))j[key]=clone(patch[key]);
 if(j.status==='failed'&&v.runnerAI&&v.runnerAI.status==='pending')v.runnerAI.status='failed';
 j.updatedAt=now();return true;
}
function professionalReportOf(v,family){
 const p=v&&v.professionalReport,reports=object(p)&&object(p.reports)?p.reports:{},key=Object.hasOwn(reports,'cuisiniste')?'cuisiniste':Object.hasOwn(reports,'buying-groups')?'buying-groups':family||v&&v.activeFamily||'brun';
 return object(reports[key])?clone(reports[key]):null;
}
function editProfessionalReport(s,visitId,family,value){
 const v=getVisit(s,visitId);if(v.status!=='completed')fail('Termine la visite avant de modifier son compte rendu.');if(typeof value!=='string'||!REPORT_TYPES.includes(family))fail('Compte rendu professionnel invalide.');
 const p=object(v.professionalReport)?v.professionalReport:{version:1,revision:0,reports:{}};v.professionalReport=p;p.revision++;
 const previous=p.reports[family]||{},at=now();p.reports[family]={...previous,text:value,manual:true,reportType:family,sourceSignature:v.reportJob&&v.reportJob.sourceSignature||previous.sourceSignature||'',revision:p.revision,generatedAt:previous.generatedAt||at,updatedAt:at};
 if(object(v.reportJob))v.reportJob.obsolete=true;if(v.runnerAI&&v.runnerAI.status==='pending')v.runnerAI.status='failed';touch(v);return p.reports[family];
}
function applyProfessionalReport(s,visitId,expected,validated,reports,memory){
 const v=getVisit(s,visitId);if(!reportJobGuard(v,expected))return false;
 const p=object(v.professionalReport)?v.professionalReport:{version:1,revision:0,reports:{}};p.revision++;const at=now();
 for(const [reportType,text] of Object.entries(reports))p.reports[reportType]={text,reportType,manual:false,sourceSignature:v.reportJob.sourceSignature,generation:v.reportJob.generation,revision:p.revision,generatedAt:at,updatedAt:at};
 p.data=clone(validated);v.professionalReport=p;v.reportJob.status='done';v.reportJob.finalRevision=p.revision;v.reportJob.updatedAt=at;delete v.reportJob.error;delete v.reportJob.retryAt;
 v.runnerAI={version:1,status:'done',sourceSignature:reportSourceSignature(v),generatedAt:at,items:clone(memory&&Array.isArray(memory.items)?memory.items:[])};touch(v);return true;
}
function complete(s,visitId,day){const v=getVisit(s,visitId);if(v.status==='completed')return v.id;if(!dateValid(day))fail('Date de visite invalide.');if(!v.conclusion.trim())fail('Ajoute une conclusion avant de terminer.');for(const [p,rows] of Object.entries(v.sixP))rows.forEach((row,i)=>{if(row.action.trim())actionFrom6P(s,visitId,p,i)});
 v.status='completed';v.completedDate=day;v.completedAt=now();touch(v);delete v.runnerAI;v.runnerMemory=analyzeReport(v);
 createReportJob(s,visitId);
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
function optionalReportSource(src){
 if(!object(src)||src.version!==1||typeof src.visitId!=='string'||typeof src.storeId!=='string'||!dateValid(src.completedDate)||!object(src.store)||!Array.isArray(src.reports)||!src.reports.length||src.reports.length>2)fail('Sources du compte rendu invalides.');
 if(src.compact!==undefined&&src.compact!==true)fail('Manifeste source invalide.');strings(src.store,['enseigne','ville','channel']);const types=new Set();
 for(const report of src.reports){if(!object(report)||!REPORT_TYPES.includes(report.reportType)||types.has(report.reportType)||!Array.isArray(report.entries))fail('Sources du compte rendu invalides.');types.add(report.reportType);
  for(const entry of report.entries){strings(entry,src.compact?['source','family']:['source','family','text']);if(!entry.source||(!src.compact&&!entry.text.trim())||!FAMILY_VALUES.includes(entry.family))fail('Source terrain invalide.')}}
}
function optionalProfessionalReport(v){
 const p=v.professionalReport;if(p!==undefined){if(!object(p)||p.version!==1||!Number.isSafeInteger(p.revision)||p.revision<0||!object(p.reports))fail('Compte rendu professionnel invalide.');
  for(const [key,row] of Object.entries(p.reports)){if(!REPORT_TYPES.includes(key)||!object(row)||typeof row.text!=='string'||typeof row.manual!=='boolean'||typeof row.sourceSignature!=='string'||!Number.isSafeInteger(row.revision)||row.revision<0||!Number.isFinite(Date.parse(row.generatedAt)))fail('Compte rendu professionnel invalide.');}}
 const j=v.reportJob;if(j!==undefined){if(!object(j)||j.version!==1||!JOB_STATUSES.includes(j.status)||j.visitId!==v.id||j.storeId!==v.storeId||!dateValid(j.completedDate)||typeof j.localSourceSignature!=='string'||typeof j.sourceSignature!=='string'||(j.sourceSignature&&!/^sha256-[a-f0-9]{64}$/.test(j.sourceSignature))||!Number.isSafeInteger(j.generation)||j.generation<0||!Number.isSafeInteger(j.finalRevision)||j.finalRevision<0||typeof j.jobId!=='string'||typeof j.accessToken!=='string'||(j.accessToken&&!/^[a-f0-9]{64}$/.test(j.accessToken))||!Number.isFinite(Date.parse(j.createdAt))||!Number.isFinite(Date.parse(j.updatedAt)))fail('Tâche de compte rendu invalide.');optionalReportSource(j.source);if(j.source.visitId!==v.id||j.source.storeId!==v.storeId||j.source.completedDate!==j.completedDate)fail('Tâche de compte rendu incohérente.');}
 if(v.reportSourceHistory!==undefined){if(!Array.isArray(v.reportSourceHistory))fail('Historique des sources invalide.');for(const snap of v.reportSourceHistory){if(!object(snap)||!Number.isSafeInteger(snap.generation)||!Number.isFinite(Date.parse(snap.capturedAt)))fail('Historique des sources invalide.');optionalReportSource(snap.source);}}
}
function validate(s){const b=s.businessV2;if(b===undefined)return s;if(!object(b)||b.version!==2||!Number.isSafeInteger(b.revision)||b.revision<0||!object(b.storeSnapshots)||!Array.isArray(b.visits)||!Array.isArray(b.actions))fail('Données Visit/Action V2 invalides.');
 const stores=new Set(s.stores.map(x=>String(x.id)));for(const [key,snap] of Object.entries(b.storeSnapshots)){strings(snap,['id','enseigne','ville','adresse']);if(key!==snap.id)fail('Instantané magasin incohérent.');stores.add(key)}
 const visits=new Map(),actions=new Map(),drafts=new Set(),sources=new Set();for(const [rows,map] of [[b.visits,visits],[b.actions,actions]])for(const x of rows){if(!object(x)||typeof x.id!=='string'||!x.id||map.has(x.id)||!stores.has(x.storeId))fail('Identifiant métier ou magasin invalide.');strings(x,['createdAt','updatedAt']);if(!Number.isFinite(Date.parse(x.createdAt))||!Number.isFinite(Date.parse(x.updatedAt)))fail('Horodatage invalide.');map.set(x.id,x)}
 for(const v of b.visits){if(!['draft','completed'].includes(v.status)||!Number.isInteger(v.step)||v.step<0||v.step>5)fail('État visite invalide.');strings(v,['conclusion']);if(v.activeFamily!==undefined&&!FAMILIES.includes(v.activeFamily))fail('Famille invalide.');optionalReport(v.report);optionalProfessionalReport(v);strings(v.preparation,Object.keys(PREP));strings(v.arrival,['positives','opportunities']);if(!Array.isArray(v.arrival.checks)||v.arrival.checks.length!==CHECKS.length||v.arrival.checks.some(x=>typeof x!=='boolean')||!Array.isArray(v.arrival.anomalies))fail('Relevé 360° invalide.');
  if(v.status==='draft'){if(drafts.has(v.storeId)||v.completedAt!==null||v.completedDate!==null)fail('Brouillon incohérent ou dupliqué.');drafts.add(v.storeId)}else if(!dateValid(v.completedDate)||!v.conclusion.trim()||!Number.isFinite(Date.parse(v.completedAt)))fail('Clôture invalide.');
  function link(row,source,description){if(row.actionId===null)return;const a=actions.get(row.actionId);if(!a||a.visitId!==v.id||a.source!==source||a.description!==description)fail('Action liée incohérente.');if(source.startsWith('6p:')&&(a.owner!==row.owner||a.dueDate!==row.dueDate))fail('Responsable ou échéance désynchronisé.')}
  const anomalyIds=new Set();for(const row of v.arrival.anomalies){strings(row,['id','text']);optionalFamily(row);if(!row.id||anomalyIds.has(row.id))fail('Anomalie dupliquée.');anomalyIds.add(row.id);link(row,'360:'+row.id,row.text)}
  if(!object(v.sixP)||Object.keys(v.sixP).length!==6)fail('Exactement six P sont requis.');for(const [p,section] of Object.entries(SIX_P)){const rows=v.sixP[p];if(!Array.isArray(rows)||rows.length!==section.items.length)fail('Section 6P invalide.');rows.forEach((row,i)=>{strings(row,['status','comment','action','owner','dueDate']);optionalFamily(row);if(!['','ok','correct','opportunity'].includes(row.status)||(row.dueDate&&!dateValid(row.dueDate)))fail('Statut ou échéance 6P invalide.');link(row,'6p:'+p+':'+i,row.action)})}
 }
 for(const a of b.actions){const v=visits.get(a.visitId);strings(a,['source','category','description','owner','dueDate','status']);if(!v||v.storeId!==a.storeId||!a.description.trim()||(a.dueDate&&!dateValid(a.dueDate))||!['open','in_progress','done','cancelled'].includes(a.status))fail('Action invalide.');if(a.status==='done'?!Number.isFinite(Date.parse(a.completedAt)):a.completedAt!==null)fail('Réalisation incohérente.');const unique=a.visitId+'|'+a.source;if(sources.has(unique))fail('Action source dupliquée.');sources.add(unique);
  const parts=a.source.split(':');if(parts[0]==='6p'){const rows=v.sixP[parts[1]],row=rows&&rows[Number(parts[2])];if(!row||row.actionId!==a.id||a.category!==SIX_P[parts[1]].label)fail('Source 6P invalide.')}else if(parts[0]==='360'){if(!v.arrival.anomalies.some(x=>x.id===parts.slice(1).join(':')&&x.actionId===a.id)||a.category!=='360°')fail('Source anomalie invalide.')}else fail('Source action inconnue.');
 }return s;
}
const api={SIX_P,CHECKS,PREP,FAMILIES,FAMILY_LABELS,FAMILY_VALUES,REPORT_SHARED,REPORT_FIELDS,MEMORY_LABELS,REPORT_TYPES,JOB_STATUSES,professionalRevision,reportTypes,frozenReportSource,sourceForReportJob,preserveReportSource,createReportJob,reportJobGuard,updateReportJob,professionalReportOf,editProfessionalReport,applyProfessionalReport,reportSourceEntries,reportSourceSignature,aiMemoryOf,analyzeReport,reportMemoryOf,reportMemoryFor,reportMemoryLines,clone,empty,data,start,getVisit,editVisit,edit6P,addAnomaly,editAnomaly,setAnomalyFamily,editReport,reportOf,actionFrom6P,actionFromAnomaly,editAction,complete,removeVisit,validate,dateValid};
root.StoreRunnerVisitModel=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
