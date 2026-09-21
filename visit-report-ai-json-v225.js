/* Store Runner V225 — sortie magasin BRUN / BLANC via JSON structuré.
   V232 : chaîne appel initial → extraction robuste → validation → réparation unique → repli local.
   Le modèle structure, Store Runner rend le texte Slack localement. Deux appels IA au maximum. */
(function(root){
'use strict';

const MODE='visit_report';
const REPAIR_INSTRUCTION='Répare cette réponse pour produire exactement le JSON attendu. N’ajoute aucune information.';
/* Champs par lesquels une passerelle ou un provider peut livrer le texte. Le Worker Store
   Runner renvoie `text` et duplique dans reply/answer/message ; les enveloppes providers
   connues passent par result.response ou choices[].message.content. On ne devine rien
   au-delà : un champ inconnu n'est pas lu. */
const TEXT_KEYS=['text','reply','answer','message','output_text','response'];

function text(value){return String(value==null?'':value).trim()}
/* Extraction d'un objet JSON par balayage d'accolades équilibré, en respectant les chaînes
   et les échappements. L'ancienne paire indexOf('{') / lastIndexOf('}') cassait dès qu'une
   accolade traînait dans la prose qui suit l'objet, et ne disait jamais si la réponse était
   simplement tronquée. On ne transforme jamais le contenu : on délimite, c'est tout. */
function jsonSpan(value){
  const raw=String(value==null?'':value);
  const start=raw.indexOf('{');
  if(start<0)return null;
  let depth=0,inString=false,escaped=false;
  for(let i=start;i<raw.length;i++){
    const c=raw[i];
    if(inString){
      if(escaped)escaped=false;
      else if(c==='\\')escaped=true;
      else if(c==='"')inString=false;
      continue;
    }
    if(c==='"'){inString=true;continue}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return{start,end:i+1,complete:true}}
  }
  return {start,end:raw.length,complete:false}
}
function cleanJsonText(value){
  const stripped=text(value).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  const span=jsonSpan(stripped);
  if(!span)return stripped;
  return stripped.slice(span.start,span.end).trim()
}
/* Une réponse coupée par le plafond de tokens n'a aucune accolade fermante : le schéma est
   plat. On le nomme au lieu de le confondre avec une réponse absurde — c'est cette
   distinction qui décide si une réparation a un sens. */
function looksTruncated(value){
  const stripped=text(value);if(!stripped)return false;
  const span=jsonSpan(stripped);
  return Boolean(span&&!span.complete)
}
/* Le texte utile d'une réponse passerelle, quelle que soit l'enveloppe connue. Si le
   provider a déjà livré un objet structuré, on le rend tel quel : il n'y a rien à parser. */
function responsePayload(response){
  if(response==null)return{text:'',doc:null};
  if(typeof response==='string')return{text:response,doc:null};
  if(typeof response!=='object')return{text:'',doc:null};
  for(const key of ['structuredVisitReport','structured','json','data']){
    const candidate=response[key];
    if(candidate&&typeof candidate==='object'&&!Array.isArray(candidate))return{text:'',doc:candidate};
  }
  for(const key of TEXT_KEYS){
    const value=response[key];
    if(typeof value==='string'&&value.trim())return{text:value,doc:null};
    if(value&&typeof value==='object'&&!Array.isArray(value)){
      const nested=responsePayload(value);
      if(nested.doc||nested.text)return nested;
    }
  }
  if(response.result)return responsePayload(response.result);
  const choice=Array.isArray(response.choices)&&response.choices[0]?response.choices[0]:null;
  if(choice){
    const content=choice.message?choice.message.content:choice.text;
    if(typeof content==='string')return{text:content,doc:null};
    if(Array.isArray(content))return{text:content.map(part=>part&&typeof part.text==='string'?part.text:'').filter(Boolean).join('\n'),doc:null};
  }
  return{text:'',doc:null}
}
function parseStructured(value){
  const raw=cleanJsonText(value);if(!raw)throw new Error('réponse JSON vide');
  let parsed;try{parsed=JSON.parse(raw)}catch(e){throw new Error(looksTruncated(value)?'JSON de compte rendu tronqué':'JSON de compte rendu invalide')}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('JSON de compte rendu invalide');
  return parsed
}
function list(value){
  if(Array.isArray(value))return value.map(text).filter(Boolean);
  const one=text(value);return one?[one]:[]
}
function scalar(value){
  if(value==null)return'';
  if(typeof value==='string'||typeof value==='number')return text(value);
  if(Array.isArray(value))return list(value).join(' ');
  if(typeof value==='object')return Object.values(value).map(scalar).filter(Boolean).join(' ');
  return''
}
function pushSection(lines,label,value){const v=scalar(value);if(v)lines.push(label+' : '+v)}
function pushListSection(lines,label,value){const rows=list(value);if(rows.length)lines.push(label+' : '+rows.join(' '))}
function photoLine(photos){
  const p=photos&&typeof photos==='object'?photos:{},total=Math.max(0,Number(p.total)||0);if(!total)return'';
  const bits=[];const before=Math.max(0,Number(p.before)||0),after=Math.max(0,Number(p.after)||0),other=Math.max(0,Number(p.other)||0);
  if(before)bits.push(before+' avant');if(after)bits.push(after+' après');if(other)bits.push(other+' autres');
  return '**Photos : '+total+' au total'+(bits.length?' – '+bits.join(' / '):'')+'.**'
}
function familyOf(visit){return text(visit&&visit.family).toLowerCase()==='blanc'?'blanc':'brun'}
function storeName(visit){return [text(visit&&visit.store&&visit.store.enseigne),text(visit&&visit.store&&visit.store.ville)].filter(Boolean).join(' ')||'[Enseigne Ville]'}

function schemaFor(family){
  if(family==='blanc')return `{
  "famille": "BLANC",
  "contexte": "",
  "lavage": "",
  "froid": "",
  "cuisson": "",
  "entretien_sols": "",
  "retours_vendeurs": [],
  "retours_clients": [],
  "concurrence": [],
  "points_positifs": [],
  "blocages": [],
  "actions_realisees": [],
  "formation": [],
  "prochain_passage": [],
  "priorite": "",
  "synthese": ""
}`;
  return `{
  "famille": "BRUN",
  "contexte": "",
  "merchandising": "",
  "retours_vendeurs": [],
  "retours_clients": [],
  "concurrence": [],
  "audio": "",
  "points_positifs": [],
  "blocages": [],
  "actions_realisees": [],
  "formation": [],
  "prochain_passage": [],
  "priorite": "",
  "synthese": ""
}`
}

function buildPrompt(visit){
  const family=familyOf(visit),source=JSON.stringify(visit||{},null,2),schema=schemaFor(family);
  return `Tu es un assistant spécialisé dans les comptes rendus de visites terrain d'un chef de secteur Samsung.
Ta seule mission ici est de STRUCTURER les notes de la visite. Store Runner fera lui-même la mise en page finale.

RÈGLES ABSOLUES :
1. Réponds UNIQUEMENT par un objet JSON valide. Aucun markdown, aucun commentaire, aucun préambule.
2. Utilise uniquement les informations présentes dans DONNEES_SOURCE.
3. N'invente jamais un fait, un chiffre, une référence produit, un prix, un nom, une date, une quantité, une cause, une action, une formation, une promesse ou un rendez-vous.
4. Ne modifie jamais le sens d'un retour vendeur ou client.
5. Une opinion vendeur doit rester explicitement attribuée au vendeur. Exemple : « le vendeur juge la gamme Mini LED moins lumineuse ». N'écris jamais cette opinion comme un fait établi sur le produit.
6. Si une information est incertaine, garde une formulation prudente et attribuée à sa source.
7. Corrige orthographe, grammaire et phrases issues de dictée vocale, mais conserve exactement les références produits, prix, chiffres, noms, marques et termes métier.
8. Supprime les répétitions sans supprimer de fait utile.
9. N'ajoute aucune formulation marketing ou conclusion non soutenue par les notes.
10. Pour toute donnée absente : utilise une chaîne vide "" ou un tableau vide []. Ne remplis jamais un manque par une supposition.
11. actions_realisees contient uniquement ce qui a réellement été fait pendant la visite.
12. formation contient uniquement une formation réalisée ou un besoin de formation explicitement mentionné.
13. prochain_passage contient uniquement un suivi ou une action future explicitement prévue dans les notes.
14. priorite doit être vide si aucune priorité future n'est explicitement déductible des informations déjà formulées sans inventer d'action.
15. synthese doit faire 1 à 3 phrases maximum, sans répéter toutes les rubriques. Elle résume seulement la situation Samsung, le principal point de blocage ou levier et la prochaine priorité lorsqu'ils sont réellement présents.
16. Reste concis : listes de 1 à 4 éléments maximum par champ.

FAMILLE ATTENDUE : ${family.toUpperCase()}
SCHÉMA JSON STRICT :
${schema}

DONNEES_SOURCE :
${source}`
}

function renderBrun(doc,visit){
  const lines=['⚫ Résumé BRUN – '+storeName(visit),''];
  pushSection(lines,'Contexte magasin',doc.contexte);
  pushSection(lines,'TV / Merchandising',doc.merchandising);
  pushListSection(lines,'Retours vendeurs',doc.retours_vendeurs);
  pushListSection(lines,'Retours clientèle',doc.retours_clients);
  pushListSection(lines,'Concurrence',doc.concurrence);
  pushSection(lines,'Audio / Barres de son',doc.audio);
  pushListSection(lines,'Points positifs',doc.points_positifs);
  pushListSection(lines,'Points de blocage',doc.blocages);
  pushListSection(lines,'Actions réalisées',doc.actions_realisees);
  pushListSection(lines,'Formation',doc.formation);
  pushSection(lines,'Synthèse',doc.synthese);
  lines.push('','### 🎯 Plan d’action / prochain passage');
  const next=[...list(doc.prochain_passage),...list(doc.priorite)];
  if(next.length)next.slice(0,5).forEach(v=>lines.push('- '+v));else lines.push('- [Non renseigné par le FMT]');
  const photos=photoLine(visit&&visit.photos);if(photos)lines.push('',photos);
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim()
}
function renderBlanc(doc,visit){
  const lines=['⚪ Résumé BLANC – '+storeName(visit),''];
  pushSection(lines,'Contexte magasin',doc.contexte);
  pushSection(lines,'Lavage',doc.lavage);
  pushSection(lines,'Froid',doc.froid);
  pushSection(lines,'Cuisson',doc.cuisson);
  pushSection(lines,'Entretien des sols',doc.entretien_sols);
  pushListSection(lines,'Retours vendeurs',doc.retours_vendeurs);
  pushListSection(lines,'Retours clientèle',doc.retours_clients);
  pushListSection(lines,'Concurrence',doc.concurrence);
  pushListSection(lines,'Points positifs',doc.points_positifs);
  pushListSection(lines,'Points de blocage',doc.blocages);
  pushListSection(lines,'Actions réalisées',doc.actions_realisees);
  pushListSection(lines,'Formation',doc.formation);
  pushSection(lines,'Synthèse',doc.synthese);
  lines.push('','### 🎯 Plan d’action / prochain passage');
  const next=[...list(doc.prochain_passage),...list(doc.priorite)];
  if(next.length)next.slice(0,5).forEach(v=>lines.push('- '+v));else lines.push('- [Non renseigné par le FMT]');
  const photos=photoLine(visit&&visit.photos);if(photos)lines.push('',photos);
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim()
}
function renderStructured(doc,visit){return familyOf(visit)==='blanc'?renderBlanc(doc,visit):renderBrun(doc,visit)}
function hasUsefulContent(doc,family){
  const keys=family==='blanc'?['contexte','lavage','froid','cuisson','entretien_sols','retours_vendeurs','retours_clients','concurrence','points_positifs','blocages','actions_realisees','formation','prochain_passage','priorite','synthese']:['contexte','merchandising','retours_vendeurs','retours_clients','concurrence','audio','points_positifs','blocages','actions_realisees','formation','prochain_passage','priorite','synthese'];
  return keys.some(k=>scalar(doc&&doc[k]))
}

/* Une panne de transport — réseau coupé, HTTP 5xx, délai dépassé — ne se répare pas en
   redemandant la même chose : le second appel repartirait dans le même mur et brûlerait du
   quota. Seule une réponse qui EST revenue, mais mal formée, mérite une réparation. */
function transportFailure(error){
  const message=text(error&&error.message||error);
  if(!message)return true;
  return /HTTP\s*\d{3}|passerelle ia|abort|timeout|délai|network|networkerror|failed to fetch|charge utile|origine non autorisée|moteur ia|indisponible|réponse ia invalide/i.test(message)
}
function repairPrompt(visit,faulty){
  return REPAIR_INSTRUCTION+'\n\nSCHÉMA JSON STRICT ATTENDU :\n'+schemaFor(familyOf(visit))+
    '\n\nRÉPONSE À RÉPARER :\n'+text(faulty).slice(0,8000)
}
/* Validation métier de la structure, indépendante du transport : famille annoncée cohérente
   et contenu réellement exploitable. Une réponse d'une autre famille n'est jamais rendue. */
function validateDoc(doc,visit){
  const family=familyOf(visit),declared=text(doc&&doc.famille).toLowerCase();
  if(declared&&declared!==family)throw new Error('famille JSON inattendue');
  if(!hasUsefulContent(doc,family))throw new Error('JSON de compte rendu vide');
  return doc
}
function wrapGateway(original){
  if(typeof original!=='function')return original;
  if(original.__visitReportJsonV225)return original;
  const wrapped=async function(options){
    const opts=options&&typeof options==='object'?options:{},context=opts.context&&typeof opts.context==='object'?opts.context:{},visit=context.visit;
    if(context.task!=='visit_report'||!visit||visit.skeleton!=='grands-magasins')return original.apply(this,arguments);
    const base={...opts,mode:MODE,context:{...context,outputFormat:'visit_report_json_v225'}};
    /* Appel initial. Une erreur ici est une erreur de transport : elle remonte telle quelle,
       sans consommer le second appel. */
    const response=await original.call(this,{...base,message:buildPrompt(visit)});
    const payload=responsePayload(response);
    let doc=null,firstError=null;
    if(payload.doc){try{doc=validateDoc(payload.doc,visit)}catch(e){firstError=e}}
    else{try{doc=validateDoc(parseStructured(payload.text),visit)}catch(e){firstError=e}}
    if(doc)return {...response,text:renderStructured(doc,visit),structuredVisitReport:doc,outputFormat:'visit_report_json_v225',repaired:false};
    /* Réparation : un seul second appel, jamais plus, et seulement si du contenu est revenu.
       Une réponse vide n'a rien à réparer, un échec de transport non plus. */
    if(!text(payload.text))throw firstError||new Error('réponse JSON vide');
    let repairResponse;
    try{repairResponse=await original.call(this,{...base,message:repairPrompt(visit,payload.text)})}
    catch(e){throw transportFailure(e)?e:(firstError||e)}
    const repaired=responsePayload(repairResponse);
    const repairedDoc=validateDoc(repaired.doc||parseStructured(repaired.text),visit);
    return {...repairResponse,text:renderStructured(repairedDoc,visit),structuredVisitReport:repairedDoc,outputFormat:'visit_report_json_v225',repaired:true}
  };
  wrapped.__visitReportJsonV225=true;wrapped.__original=original;return wrapped
}
function install(){
  if(!root||typeof root.callAIGateway!=='function')return false;
  root.callAIGateway=wrapGateway(root.callAIGateway);return Boolean(root.callAIGateway&&root.callAIGateway.__visitReportJsonV225)
}
function installEventually(attempt){
  attempt=Math.max(0,Number(attempt)||0);
  if(install())return true;
  if(root&&root.document&&attempt<80)root.setTimeout(function(){installEventually(attempt+1)},100);
  return false
}

const api={MODE,REPAIR_INSTRUCTION,cleanJsonText,jsonSpan,looksTruncated,responsePayload,parseStructured,list,scalar,schemaFor,buildPrompt,repairPrompt,transportFailure,validateDoc,renderStructured,renderBrun,renderBlanc,hasUsefulContent,wrapGateway,install,installEventually};
root.StoreRunnerVisitReportJSONV225=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root&&root.document)installEventually(0);else if(root&&typeof root.callAIGateway==='function')install();
})(typeof window!=='undefined'?window:globalThis);
