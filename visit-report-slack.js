/* Store Runner V1 — Sortie magasin : rapport local hors ligne + génération IA optionnelle.
   La saisie terrain reste simple. Rien n'est envoyé à l'IA tant que l'utilisateur n'appuie pas sur le bouton dédié. */
(function(root){
'use strict';
const SHEET_ID='srReportSheet',VISIT_BTN_ID='srReportBtn',QUICK_BTN_ID='srReportQuickBtn',SHARE_BTN_ID='srReportSharePhotos',AI_BTN_ID='srReportAI',EDIT_BTN_ID='srReportEdit';
const PLACEHOLDER='[Non renseigné par le FMT]';
const PRIMARY_BRAND='Sam'+'sung';
const FAMILY_OF_BRAND={
  'grands-magasins':['boulanger','darty','fnac','conforama','but'],
  'cuisinistes':['schmidt','cuisinella'],
  'buying-groups':['gitem','pro&cie','pro et cie','procie','pro cie']
};
const MERGED={cuisinistes:1,'buying-groups':1};
const GRAND_SAMPLE={
  brun:`⚫ Résumé BRUN – [Enseigne Ville]

Rédiger 3 à 6 paragraphes courts et naturels. Regrouper les informations qui parlent du même sujet : équipe et retours vendeurs, TV / OLED / Neo QLED / Lifestyle, audio, concurrence, merchandising, massifications et OMNI lorsqu'ils sont réellement renseignés. Les références, prix, volumes et verbatims utiles restent visibles dans le texte.

Ne pas réciter une checklist. Chaque paragraphe doit apporter un constat terrain utile au business ou au merchandising.

### 🎯 Plan d’action / prochain passage
- [action factuelle directement liée à un constat ou à un suivi saisi]
- [autre action uniquement si elle découle réellement des notes]

**Photos : X au total – Y avant / Z après / N autres.**`,
  blanc:`⚪ Résumé BLANC – [Enseigne Ville]

Rédiger 3 à 6 paragraphes courts et naturels. Regrouper les informations par sujet ou famille réellement présente dans les notes : aspiration, cuisson, froid, lavage, petit électroménager, concurrence, visibilité, massification et retours vendeurs. Les références, prix, volumes et verbatims utiles restent visibles dans le texte.

Ne pas réciter une checklist. Chaque paragraphe doit faire ressortir un constat terrain utile et le positionnement observé de la marque, sans extrapolation.

### 🎯 Plan d’action / prochain passage
- [action factuelle directement liée à un constat ou à un suivi saisi]
- [autre action uniquement si elle découle réellement des notes]

**Photos : X au total – Y avant / Z après / N autres.**`
};
function norm(v){return String(v==null?'':v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim()}
function skeletonFor(enseigne){const n=norm(enseigne);for(const key of Object.keys(FAMILY_OF_BRAND))if(FAMILY_OF_BRAND[key].indexOf(n)>=0)return key;return 'grands-magasins'}
function model(){if(root.StoreRunnerVisitModel)return root.StoreRunnerVisitModel;try{if(typeof module!=='undefined'&&module.exports&&typeof require==='function')return require('./store-runner-visit-model.js')}catch(e){}return null}
function text(v){return String(v==null?'':v).trim()}
function orPlaceholder(v){return text(v)||PLACEHOLDER}
function keeper(families){if(families.length>1)return()=>true;const target=families[0];return f=>{const x=text(f);return !x||x==='both'||x===target}}
function sixPRows(M,v,keep){const out=[];for(const p of Object.keys(M.SIX_P)){const section=M.SIX_P[p],rows=(v.sixP&&v.sixP[p])||[];rows.forEach((row,i)=>{if(keep(row.family))out.push({label:section.label,item:section.items[i]||('Ligne '+(i+1)),row})})}return out}
function blockers(M,state,v,keep){const lines=[];for(const a of (v.arrival&&v.arrival.anomalies)||[])if(keep(a.family)&&text(a.text))lines.push('- '+text(a.text));for(const e of sixPRows(M,v,keep))if(e.row.status==='correct'||e.row.status==='opportunity')lines.push('- '+e.label+' · '+e.item+(text(e.row.comment)?' : '+text(e.row.comment):''));const actions=((state.businessV2&&state.businessV2.actions)||[]).filter(a=>a.visitId===v.id&&['done','cancelled'].indexOf(a.status)<0);for(const a of actions)lines.push('- À suivre : '+text(a.description)+' · '+(text(a.owner)||'responsable à définir')+' · '+(text(a.dueDate)||'sans échéance'));return lines.join('\n')}
function photoStats(photos,families){const keep=keeper(families),rows=(photos||[]).filter(r=>keep(r&&r.family));const before=rows.filter(r=>r&&r.moment==='avant').length,after=rows.filter(r=>r&&r.moment==='apres').length,other=rows.length-before-after;return{total:rows.length,before,after,other}}
function photoLine(photos,families){const s=photoStats(photos,families);if(!s.total)return '> **Photos :** '+PLACEHOLDER;let bits=[];if(s.before)bits.push(s.before+' avant');if(s.after)bits.push(s.after+' après');if(s.other)bits.push(s.other+' sans moment');return '> **Photos :** '+bits.join(' / ')+' jointe'+(s.total>1?'s':'')+' à ce message.'}
function tidy(body){return body.split('\n').map(l=>l.replace(/[ \t]+$/,'')).join('\n').replace(/\n{3,}/g,'\n\n').replace(/\s+$/,'')+'\n'}
function visitDate(v){return text(v.completedDate)||text(v.createdAt).slice(0,10)}
function storeOf(state,v){const b=state.businessV2||{};return (b.storeSnapshots&&b.storeSnapshots[v.storeId])||(state.stores||[]).find(s=>String(s.id)===String(v.storeId))||{}}
function merge(report,key,families){return families.map(f=>text(report[f]&&report[f][key])).filter(Boolean).join('\n\n')}
function appendLegacy(out,label,value){const v=text(value);return v?out+'\n### '+label+'\n'+v+'\n':out}
function build(state,visitId,family,photos){
 const M=model();if(!M)throw new Error('Modèle de visite indisponible.');const b=(state&&state.businessV2)||{},v=(b.visits||[]).find(x=>x.id===visitId);if(!v)throw new Error('Visite introuvable.');const store=storeOf(state,v),skeleton=skeletonFor(store.enseigne),report=M.reportOf(v);const families=MERGED[skeleton]?['blanc','brun']:[M.FAMILIES.indexOf(family)>=0?family:'brun'],keep=keeper(families);const merged=!!MERGED[skeleton];const value=key=>merged?merge(report,key,families):text(report[families[0]][key]);const title=skeleton==='cuisinistes'?'# COMPTE RENDU DE VISITE — CUISINISTE':skeleton==='buying-groups'?'# COMPTE RENDU DE VISITE — BUYING GROUP':'# COMPTE RENDU DE VISITE';const head='**Magasin :** '+text(store.enseigne)+' '+text(store.ville)+' — '+visitDate(v)+(merged?'':' — Famille '+families[0].toUpperCase());
 let out=title+'\n'+head+'\n\n### Contexte magasin\n'+orPlaceholder(report.shared&&report.shared.context)+'\n\n### Note terrain\n'+orPlaceholder(value('team'))+'\n';
 out+='\n'+photoLine(photos,families)+'\n';
 out=appendLegacy(out,'Actions réalisées',value('actions'));
 out=appendLegacy(out,'Massification / exposition',value('massification'));
 out=appendLegacy(out,'Suivi OMNI',value('omni'));
 out=appendLegacy(out,'À suivre / points de blocage',blockers(M,state,v,keep));
 out+='\n### Formation / prochain passage\n'+orPlaceholder(value('training'))+'\n';
 return tidy(out)
}
function buildAIPayload(state,visitId,family,photos){
 const M=model();if(!M)throw new Error('Modèle de visite indisponible.');const b=(state&&state.businessV2)||{},v=(b.visits||[]).find(x=>x.id===visitId);if(!v)throw new Error('Visite introuvable.');const store=storeOf(state,v),skeleton=skeletonFor(store.enseigne),report=M.reportOf(v),families=MERGED[skeleton]?['blanc','brun']:[M.FAMILIES.indexOf(family)>=0?family:'brun'],keep=keeper(families),merged=!!MERGED[skeleton],value=key=>merged?merge(report,key,families):text(report[families[0]][key]);
 const anomalies=((v.arrival&&v.arrival.anomalies)||[]).filter(a=>keep(a.family)&&text(a.text)).map(a=>text(a.text));
 const legacyObservations=sixPRows(M,v,keep).filter(e=>text(e.row.comment)||text(e.row.action)||e.row.status==='correct'||e.row.status==='opportunity').map(e=>({theme:e.label,item:e.item,status:text(e.row.status),comment:text(e.row.comment),action:text(e.row.action)}));
 const openActions=((b.actions)||[]).filter(a=>a.visitId===v.id&&['done','cancelled'].indexOf(a.status)<0).map(a=>({description:text(a.description),owner:text(a.owner),dueDate:text(a.dueDate),status:text(a.status)}));
 return{
  skeleton,merged,family:merged?'mixte':families[0],date:visitDate(v),
  store:{id:text(store.id||v.storeId),enseigne:text(store.enseigne),ville:text(store.ville),adresse:text(store.adresse)},
  context:text(report.shared&&report.shared.context),noteTerrain:value('team'),actionsRealisees:value('actions'),massification:value('massification'),omni:value('omni'),formationProchainPassage:value('training'),
  anomalies,legacyObservations,openActions,photos:photoStats(photos,families)
 }
}
function officialStructure(skeleton){
 if(skeleton==='cuisinistes')return 'Suivi Magasin ; Point Produits & Concurrence ; Formation ; Contrats d’exposition ; SAV / ADV ; Plan d’Action & Prochaines Étapes.';
 if(skeleton==='buying-groups')return 'Suivi Magasin & Profil ; Point Produits & Concurrence ; Formation & Newsletter ; Écosystème SAV & Technique ; Contexte Marché / Findis ; Plan d’Action.';
 return 'Contexte magasin (rayon/merch, équipe, news, tendances) ; Actions réalisées ; Massifications ; Suivi OMNI ; Points de blocage / à suivre ; Prochaine étape.'
}
function aiPrompt(data){
 const source=JSON.stringify(data,null,2);
 if(data.skeleton==='grands-magasins'){
  const fam=String(data.family||'brun').toUpperCase(),emoji=fam==='BLANC'?'⚪':'⚫',sample=GRAND_SAMPLE[data.family]||GRAND_SAMPLE.brun,storeName=[text(data.store&&data.store.enseigne),text(data.store&&data.store.ville)].filter(Boolean).join(' ');
  return `Tu es un Field Merchandising Trainer (FMT) d’excellence. Tu rédiges le résumé de fin de visite destiné à une direction commerciale. Le résultat doit ressembler à un compte rendu écrit par un chef de secteur expérimenté : naturel, précis, synthétique, hiérarchisé et immédiatement exploitable.

RÈGLES DE FOND — PRIORITÉ ABSOLUE :
1. Utilise UNIQUEMENT les faits présents dans DONNEES_SOURCE. N’invente jamais un nom, un chiffre, une référence, un prix, un volume, une tendance, une cause, une action réalisée, une promesse, une formation ou une conclusion.
2. Conserve exactement les références produit, prix, volumes, noms de concurrents, prénoms et verbatims utiles lorsqu’ils sont présents. Ne corrige jamais une référence produit de toi-même.
3. Ne retranscris pas les notes ligne par ligne. Regroupe les informations proches par sujet ou univers produit et hiérarchise-les selon leur intérêt terrain : visibilité / merchandising, performance ou tendance observée, retour vendeur, concurrence, action réalisée, massification, OMNI et point de blocage.
4. Fais des liens uniquement lorsque le lien est explicitement présent dans les notes. Ne transforme jamais deux constats séparés en relation de cause à effet supposée.
5. Corrige orthographe, grammaire et syntaxe. Supprime les répétitions et les formulations vagues ou génériques. Préfère des phrases courtes, concrètes et professionnelles.
6. Ne montre JAMAIS les libellés techniques 6P (PROMOTION, PRIX, PRODUIT, PLACE, PROPRETÉ, PÉDAGOGIE). Intègre seulement leur contenu utile dans le texte naturel.
7. Couvre, uniquement lorsqu’ils sont renseignés, les sujets métier suivants : ${officialStructure(data.skeleton)}
8. Dans le corps du résumé, n’affiche pas de rubrique vide et n’ajoute pas ${PLACEHOLDER} à chaque information absente. Omet simplement les thèmes non renseignés.
9. Le plan d’action doit contenir uniquement des actions explicitement prévues dans la source OU des suivis opérationnels évidents et conservateurs qui découlent directement d’un constat réel. Exemple autorisé : un meuble de marque explicitement absent peut conduire à « suivre la possibilité de mise en place du meuble ». Exemple interdit : inventer une négociation, un accord magasin, une commande ou une formation non mentionnée.
10. Si une formation / un prochain passage est explicitement saisi, il doit apparaître dans le plan d’action. N’invente jamais une formation.
11. Si aucune action sûre ne peut être formulée, écris uniquement ${PLACEHOLDER} sous le titre du plan d’action.
12. Si photos.total > 0, termine par une seule ligne photos avec le total et les compteurs disponibles avant / après / autres. Si photos.total = 0, n’ajoute aucune ligne Photos.
13. Le résultat est destiné à Slack : aucun préambule, aucune explication de méthode, aucun bloc de code, aucune phrase du type « voici le résumé ».

FORMAT STRICT :
${emoji} Résumé ${fam} – ${storeName||'[Enseigne Ville]'}

[3 à 6 paragraphes courts, naturels et regroupés intelligemment. Utilise si pertinent des amorces comme « Sur l’aspiration », « Sur la cuisson », « Sur le froid », « Côté TV » ou « Sur l’audio », mais seulement pour les thèmes réellement présents.]

### 🎯 Plan d’action / prochain passage
- [2 à 5 actions maximum, uniquement si elles sont sûres et directement reliées aux faits]

[Si photos.total > 0 : **Photos : X au total – Y avant / Z après / N autres.**]

DONNEES_SOURCE :
${source}

EXEMPLE_DE_STYLE_VALIDÉ — STYLE ET ORGANISATION UNIQUEMENT, JAMAIS UNE SOURCE FACTUELLE :
${sample}`;
 }
 if(data.skeleton==='cuisinistes'){
  return `Tu es un Field Merchandising Trainer (FMT) expert des enseignes cuisinistes. Transforme DONNEES_SOURCE en un compte rendu professionnel, analytique mais factuel, destiné à la direction.

RÈGLES ABSOLUES :
- utilise uniquement les faits présents dans DONNEES_SOURCE ;
- N’invente aucun fait, même plausible ;
- n’invente aucun chiffre, contact, cause, performance, marque partenaire, contrat, litige, rendez-vous ou action ;
- corrige la forme, regroupe les informations proches, supprime les doublons et conserve les références / montants / dates exacts ;
- rédige naturellement : ne récite pas les notes et ne montre pas les libellés techniques 6P ;
- pour chaque information attendue mais absente, écris exactement ${PLACEHOLDER} ;
- le plan d’action ne contient que les actions ou suivis réellement saisis ;
- aucun préambule ni bloc de code.

FORMAT STRICT :
# COMPTE RENDU DE VISITE CUISINISTE
**Enseigne :** [Schmidt / Cuisinella] | **Magasin :** [Ville / Point de vente]

### 1. Suivi Magasin
- **Chiffre d’Affaires 2025 / 2026 :** [montants exacts ou ${PLACEHOLDER}]
- **Groupement :** [statut + nombre de magasins ou ${PLACEHOLDER}]
- **Équipe du Magasin :** [propriétaire / directeur / nombre de concepteurs-vendeurs ou ${PLACEHOLDER}]

### 2. Point Produits & Concurrence
- **Performance de la marque :** [faits de vente vs concurrence uniquement]
- **Typologie de produits porteurs :** [familles réellement citées]
- **Marques Partenaires :** [marques + raisons réellement citées]

### 3. Formation
- **Historique Classroom :** [Oui / Non + date + nombre de personnes si disponibles]

### 4. Contrats d’Exposition (Expo)
- **Contrat d’Expo ${PRIMARY_BRAND} :** [Oui avec montant / nombre de produits / temps restant, ou Non avec points bloquants]
- **Contrat Concurrent :** [marque et produits]

### 5. SAV / ADV
- **Litiges en cours :** [détails + statut de résolution FMT / SEF]

### 6. Plan d’Action & Prochaines Étapes
- **Suivi Opérationnel :** [RDV point chiffre / Classroom / accompagnement technique réellement saisi]
- **Statut Négociation Contrat d’Expo :** [RDV programmé + date / RDV effectué en attente retour / signé en attente livraison]

DONNEES_SOURCE :
${source}`;
 }
 return `Tu es un Field Merchandising Trainer (FMT) expert des Buying Groups Gitem et Pro&Cie. Transforme DONNEES_SOURCE en un compte rendu structuré, clair, analytique mais strictement factuel pour la direction.

RÈGLES ABSOLUES :
- utilise uniquement les faits présents dans DONNEES_SOURCE ;
- N’invente aucun fait, même plausible ;
- n’invente aucun chiffre, ancienneté, effectif, performance, motif d’absence, partenaire, formation, litige, perception de Findis ou action ;
- corrige la forme, regroupe les informations proches, supprime les doublons et conserve les références / dates / chiffres exacts ;
- ne récite pas les notes et ne montre pas les libellés techniques 6P ;
- pour chaque information attendue mais absente, écris exactement ${PLACEHOLDER} ;
- le plan d’action ne contient que les engagements ou suivis réellement présents dans la source ;
- aucun préambule ni bloc de code.

FORMAT STRICT :
# COMPTE RENDU DE VISITE BUYING GROUP
**Enseigne :** [Gitem / Pro&Cie] | **Magasin :** [Ville / Point de vente]

### 1. Suivi Magasin & Profil
- **Ancienneté & Effectif :** [temps de détention / nombre de personnes]
- **Santé du magasin :** [faits réellement saisis sur la dynamique commerciale]

### 2. Point Produits & Concurrence
- **Performance SEF & Présence :** [ventes vs concurrence / présence par famille et motifs réellement cités]
- **Typologie & Partenaires :** [familles porteuses / marques partenaires et leviers réellement cités]

### 3. Formation & Newsletter
- **Statut Formation :** [session prévue + date / non + raison réellement citée]
- **Newsletter SEF :** [réception + avis du magasin]

### 4. Écosystème SAV & Technique
- **Système Protechneed :** [magasin informé Oui/Non + formation éventuelle]
- **Valise Haas & SAV :** [utilisation / fonctionnement / relation SAV]
- **Litiges SAV :** [litiges + suivi FMT ou Marc]

### 5. Contexte Marché : Rachat par Findis
- **Perception Terrain :** [assortiment / stock / livraison uniquement si réellement renseignés]

### 6. Plan d’Action
- **PDL & Linéaire :** [suivi réellement prévu]
- **Accompagnement :** [formations produits / Haas / SAV / technique réellement prévues]

DONNEES_SOURCE :
${source}`
}
function cleanAIText(value){let s=text(value);s=s.replace(/^```(?:markdown|md|text)?\s*/i,'').replace(/\s*```$/,'').trim();s=s.replace(/^(?:Voici|Voilà)\s+(?:le|ton|votre)\s+(?:compte rendu|résumé)[^\n]*\n+/i,'').trim();return s}
let sheet=null,activeVisit='',activeTab='blanc',aiDrafts=Object.create(null),generating=false;
function el(tag,txt,cls){const n=root.document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}
function btn(txt,fn,cls){const b=el('button',txt,cls||'sr-reportBtn');b.type='button';b.addEventListener('click',fn);return b}
function state(){return root.state||{}}
function visitById(id){return (((state().businessV2||{}).visits)||[]).find(v=>v.id===id)||null}
function draftFor(storeId){const rows=((state().businessV2||{}).visits)||[];return rows.filter(v=>String(v.storeId)===String(storeId)&&v.status==='draft').sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null}
function say(msg,error){const box=sheet&&sheet.querySelector('#srReportStatus');if(box){box.textContent=msg||'';box.classList.toggle('sr-reportError',!!error)}}
function draftKey(v,skeleton){return v.id+':'+(MERGED[skeleton]?'merged':activeTab)}
function currentDraftKey(){const v=visitById(activeVisit);if(!v)return'';return draftKey(v,skeletonFor(storeOf(state(),v).enseigne))}
function ensureStyle(){if(!root.document||root.document.getElementById('sr-report-style'))return;const s=el('style');s.id='sr-report-style';s.textContent='#'+SHEET_ID+'{box-sizing:border-box;width:min(720px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px;border:1px solid #d9dce3;background:#fff;color:#1d1d1f}#'+SHEET_ID+'::backdrop{background:rgba(17,24,39,.45)}.sr-reportHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.sr-reportHead h2{margin:0;font-size:20px}.sr-reportHead p{margin:4px 0 0;color:#667085;font-size:12px}.sr-reportTabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0 8px}.sr-reportTab{min-height:44px;border:1px solid #d3d9e3;border-radius:13px;background:#f4f6fa;color:#454b56;font-weight:800;font-size:12px}.sr-reportTab[aria-selected=true]{background:#1428a0;border-color:#1428a0;color:#fff}#srReportText{width:100%;box-sizing:border-box;min-height:300px;border:1px solid #d9dee8;border-radius:14px;padding:10px;font:400 12px ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.45;background:#fbfcff;color:#1d1d1f;-webkit-text-fill-color:#1d1d1f;resize:vertical}#srReportText:not([readonly]){background:#fff;border-color:#8eb6ff;box-shadow:0 0 0 3px rgba(20,40,160,.08)}.sr-reportStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.sr-reportStatus.sr-reportError{color:#b42318}.sr-reportActions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px}.sr-reportBtn{min-height:48px;border-radius:14px;font-weight:800}.sr-reportAI{background:linear-gradient(180deg,#1428a0,#0f1f7d);color:#fff;border:0}.sr-reportAI:disabled{opacity:.62}.sr-reportEdit{background:#fff;color:#1428a0;border:1px solid #ccd4ef}.sr-reportCopy{background:#1428a0;color:#fff;border:0}.sr-reportPhotos{background:#eef0f4;color:#1d1d1f;border:0}.sr-reportPhotos:disabled{opacity:.55}.sr-reportClose{background:#eef0f4;color:#1d1d1f;border:0}#'+VISIT_BTN_ID+',#'+QUICK_BTN_ID+'{min-height:44px}';root.document.head.appendChild(s)}
function ensureSheet(){if(sheet)return sheet;if(!root.document)return null;ensureStyle();sheet=el('dialog');sheet.id=SHEET_ID;sheet.setAttribute('aria-labelledby','srReportTitle');sheet.innerHTML='<div class="sr-reportHead"><div><h2 id="srReportTitle">Sortie magasin</h2><p id="srReportSubtitle"></p></div></div><div id="srReportTabs" class="sr-reportTabs"></div><textarea id="srReportText" rows="18" readonly aria-label="Compte rendu à copier"></textarea><p id="srReportStatus" class="sr-reportStatus" role="status"></p><div class="sr-reportActions"></div>';const actions=sheet.querySelector('.sr-reportActions'),ai=btn('✨ Générer avec l’IA',generateAI,'sr-reportBtn sr-reportAI'),edit=btn('Modifier le texte',toggleEdit,'sr-reportBtn sr-reportEdit'),copyBtn=btn('Copier le compte rendu',copy,'sr-reportBtn sr-reportCopy'),share=btn('Aucune photo pour ce magasin.',sharePhotos,'sr-reportBtn sr-reportPhotos');ai.id=AI_BTN_ID;edit.id=EDIT_BTN_ID;share.id=SHARE_BTN_ID;share.disabled=true;actions.append(ai,edit,copyBtn,share,btn('Fermer',close,'sr-reportBtn sr-reportClose'));const area=sheet.querySelector('#srReportText');area.addEventListener('input',()=>{const k=area.dataset.draftKey;if(k&&!area.readOnly)aiDrafts[k]=area.value});sheet.addEventListener('cancel',e=>{e.preventDefault();close()});root.document.body.appendChild(sheet);return sheet}
async function photosFor(storeId,family,merged){const api=root.StorePhotosV1;if(!api)return [];try{if(merged&&typeof api.list==='function')return await api.list(storeId);if(typeof api.listByFamily==='function')return await api.listByFamily(storeId,family);return []}catch(e){return []}}
function updatePhotoButton(photos,merged){const b=sheet&&sheet.querySelector('#'+SHARE_BTN_ID);if(!b)return;b.hidden=false;const n=Array.isArray(photos)?photos.length:0;b.disabled=!n;if(merged){b.textContent=n?(n===1?'Partager la photo':'Partager les '+n+' photos'):'Aucune photo pour ce magasin.';return}const FAM=activeTab.toUpperCase();b.textContent=n?(n===1?'Partager la photo '+FAM:'Partager les '+n+' photos '+FAM):'Aucune photo pour cette famille.'}
function updateAIButton(merged){const b=sheet&&sheet.querySelector('#'+AI_BTN_ID);if(!b)return;b.textContent=merged?'✨ Générer le compte rendu':'✨ Générer le résumé '+activeTab.toUpperCase()}
function updateEditButton(){const area=sheet&&sheet.querySelector('#srReportText'),b=sheet&&sheet.querySelector('#'+EDIT_BTN_ID);if(!area||!b)return;b.textContent=area.readOnly?'Modifier le texte':'Terminer la modification'}
async function refresh(){const v=visitById(activeVisit);if(!v){say('Visite introuvable.',true);return}const store=storeOf(state(),v),skeleton=skeletonFor(store.enseigne),merged=!!MERGED[skeleton];sheet.querySelector('#srReportSubtitle').textContent=text(store.enseigne)+' '+text(store.ville)+' · '+visitDate(v)+(merged?' · un seul compte rendu':' · deux comptes rendus');const tabs=sheet.querySelector('#srReportTabs');tabs.replaceChildren();tabs.hidden=merged;if(!merged){const M=model();for(const family of M.FAMILIES){const b=btn(family.toUpperCase(),()=>{activeTab=family;say('');refresh()},'sr-reportTab');b.setAttribute('role','tab');b.setAttribute('aria-selected',activeTab===family?'true':'false');b.dataset.family=family;tabs.append(b)}}const photos=await photosFor(v.storeId,activeTab,merged),key=draftKey(v,skeleton),area=sheet.querySelector('#srReportText');area.dataset.draftKey=key;area.readOnly=true;area.value=Object.prototype.hasOwnProperty.call(aiDrafts,key)?aiDrafts[key]:build(state(),v.id,activeTab,photos);updatePhotoButton(photos,merged);updateAIButton(merged);updateEditButton()}
function toggleEdit(){const area=sheet&&sheet.querySelector('#srReportText');if(!area)return false;area.readOnly=!area.readOnly;updateEditButton();if(!area.readOnly){area.focus();area.setSelectionRange(area.value.length,area.value.length);say('Tu peux corriger le texte avant de le copier dans Slack.')}else{const k=area.dataset.draftKey;if(k)aiDrafts[k]=area.value;say('Modifications conservées pour cette sortie magasin.')}return true}
/* V232 — un tap répété sur mobile ne doit jamais lancer deux générations : le second appel
   partirait en parallèle du premier, brûlerait du quota et écraserait son résultat.
   Le verrou se pose AVANT le premier `await` de la fonction. Posé après la lecture des
   photos, il laissait passer deux taps rapprochés : les deux franchissaient le contrôle
   pendant que la première lecture IndexedDB était encore en vol. Tout ce qui suit le
   verrou — lecture des photos, construction de la charge utile, appel IA — vit dans le
   même `try`, et le `finally` rend toujours le bouton et libère le verrou. */
async function generateAI(){const v=visitById(activeVisit);if(!v){say('Visite introuvable.',true);return false}
 if(generating){say('Génération déjà en cours, patiente quelques secondes.');return false}const store=storeOf(state(),v),skeleton=skeletonFor(store.enseigne),merged=!!MERGED[skeleton],button=sheet&&sheet.querySelector('#'+AI_BTN_ID),area=sheet&&sheet.querySelector('#srReportText');if(typeof root.callAIGateway!=='function'||!root.aiConfig||!root.aiConfig.gateway){say('IA en ligne indisponible. Le rapport local reste utilisable et modifiable.',true);return false}const oldLabel=button&&button.textContent;generating=true;if(button){button.disabled=true;button.textContent='✨ Génération en cours…'}say('Génération du compte rendu à partir de tes seules notes terrain…');try{const photos=await photosFor(v.storeId,activeTab,merged),payload=buildAIPayload(state(),v.id,activeTab,photos),key=draftKey(v,skeleton);const response=await root.callAIGateway({mode:'assistant',message:aiPrompt(payload),context:{task:'visit_report',visit:payload}}),generated=cleanAIText(response&&response.text);if(!generated||generated.length<80)throw new Error('réponse trop courte');if(skeleton==='grands-magasins'&&!/^(?:⚫|⚪)?\s*Résumé\s+(BRUN|BLANC)\b/i.test(generated))throw new Error('format de résumé inattendu');if(skeleton==='grands-magasins'&&!/(?:Formation|Plan d[’']action)\s*\/\s*prochain passage/i.test(generated))throw new Error('bloc plan d’action / prochain passage manquant');aiDrafts[key]=generated;if(area){area.dataset.draftKey=key;area.value=generated;area.readOnly=true}updateEditButton();say((merged?'Compte rendu':'Résumé '+activeTab.toUpperCase())+(response&&response.repaired?' généré après une réparation automatique.':' généré.')+' Relis-le, corrige si besoin, puis copie-le dans Slack.');return true}catch(e){say('IA indisponible ou réponse incomplète : '+(e&&e.message?e.message:String(e))+'. Le rapport local est conservé.',true);return false}finally{generating=false;if(button){button.disabled=false;button.textContent=oldLabel||'✨ Générer avec l’IA';updateAIButton(merged)}}}
async function copy(){const area=sheet&&sheet.querySelector('#srReportText');if(!area)return false;try{if(root.navigator&&root.navigator.clipboard&&root.navigator.clipboard.writeText){await root.navigator.clipboard.writeText(area.value);say('Compte rendu copié.');return true}}catch(e){}const wasReadonly=area.readOnly;try{area.readOnly=false;area.select();const ok=root.document.execCommand&&root.document.execCommand('copy');area.readOnly=wasReadonly;if(ok){say('Compte rendu copié.');return true}}catch(e){area.readOnly=wasReadonly}say('Copie impossible ici. Sélectionne le texte et copie-le à la main.',true);return false}
async function sharePhotos(){const v=visitById(activeVisit);if(!v){say('Visite introuvable.',true);return false}const store=storeOf(state(),v),skeleton=skeletonFor(store.enseigne),merged=!!MERGED[skeleton],api=root.StorePhotosV1;if(!api||typeof api.shareRecords!=='function'||(!merged&&typeof api.listByFamily!=='function')||(merged&&typeof api.list!=='function')){say('Partage photo indisponible ici. Ouvre Photos magasin pour les télécharger une par une.',true);return false}const rows=await photosFor(v.storeId,activeTab,merged);updatePhotoButton(rows,merged);const area=sheet&&sheet.querySelector('#srReportText'),key=currentDraftKey();if(area&&!Object.prototype.hasOwnProperty.call(aiDrafts,key))area.value=build(state(),v.id,activeTab,rows);if(!rows.length){say(merged?'Aucune photo pour ce magasin.':'Aucune photo pour cette famille.');return false}try{const result=await api.shareRecords(rows);if(result==='shared'){say(rows.length+' photo'+(rows.length>1?'s':'')+(merged?'':' '+activeTab.toUpperCase())+' partagée'+(rows.length>1?'s':'')+'.');return true}if(result==='downloaded'){say('Photo téléchargée.');return true}say('Partage de plusieurs fichiers indisponible ici. Ouvre Photos magasin pour les télécharger une par une.',true);return false}catch(e){if(e&&e.name==='AbortError'){say('Partage annulé.');return false}say('Partage impossible : '+(e.message||String(e))+'. Ouvre Photos magasin pour les télécharger une par une.',true);return false}}
function close(){if(sheet&&sheet.open)sheet.close()}
async function open(visitId){const v=visitById(String(visitId||''));if(!v)return false;ensureSheet();activeVisit=v.id;const M=model();activeTab=M&&M.FAMILIES.indexOf(v.activeFamily)>=0?v.activeFamily:'brun';say('');if(typeof sheet.showModal==='function'&&!sheet.open)sheet.showModal();else sheet.setAttribute('open','');await refresh();return true}
function fromVisitDialog(){const api=root.StoreRunnerVisits,id=api&&typeof api.activeVisitId==='function'?api.activeVisitId():'';if(!id)return false;open(id);return true}
function fromQuickSheet(){const start=root.document&&root.document.getElementById('srQuickStart'),storeId=start&&start.dataset?start.dataset.srStart:'',draft=storeId?draftFor(storeId):null;if(!draft){ensureSheet();say('Démarre la visite avant de générer le compte rendu.',true);if(typeof root.alert==='function')root.alert('Démarre la visite avant de générer le compte rendu.');return false}open(draft.id);return true}
function installButtons(){if(!root.document)return false;ensureStyle();let done=0;const head=root.document.querySelector('#srVisitDialog .sr-head');if(head&&!root.document.getElementById(VISIT_BTN_ID)){const b=btn('📤 Sortie magasin',fromVisitDialog,'secondary');b.id=VISIT_BTN_ID;const fermer=[...head.querySelectorAll('button')].find(x=>x.textContent==='Fermer');if(fermer)head.insertBefore(b,fermer);else head.appendChild(b);done++}const actions=root.document.querySelector('#storeQuickSheet .sheetActions');if(actions&&!root.document.getElementById(QUICK_BTN_ID)){const b=btn('📤 Sortie magasin',fromQuickSheet,'secondary');b.id=QUICK_BTN_ID;const photo=root.document.getElementById('storePhotosQuickBtn');if(photo&&photo.parentNode===actions)photo.insertAdjacentElement('afterend',b);else actions.appendChild(b);done++}return done>0}
function boot(){ensureSheet();installButtons()}
const api={FAMILY_OF_BRAND,skeletonFor,build,buildAIPayload,aiPrompt,cleanAIText,open,installButtons};root.StoreRunnerVisitReport=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();root.document.addEventListener('store-runner:data-restored',installButtons);root.document.addEventListener('store-runner:planning-updated',installButtons)}
})(typeof window!=='undefined'?window:globalThis);
