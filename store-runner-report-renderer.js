/* V278/V280 — shared renderer: legacy reports retain the original strict validation;
   new editorial reports prioritize professional prose, source provenance and figure safety.
   Raw dictated notes live in the immutable visit source, not the generated report. */
(function(root){
'use strict';
const VERSION=1,PROMPT_VERSION='visit-report-v280-editorial-autonomy',MAX_ITEMS=36;
const TYPES=['brun','blanc','cuisiniste','buying-groups'];
const LABELS={context:'🏬 Contexte magasin',tv:'📺 TV / Présence Samsung',challenge:'🏆 Challenge / Prime vendeur',competition:'🆚 Concurrence / Retour vendeur',offers:'🏷️ ODR / Offres Samsung',training:'🎓 Formation',blackFriday:'🛍️ Black Friday',audio:'🔊 Audio / Barres de son',merchandising:'🏬 Merchandising / Massification',omni:'📱 Suivi OMNI',laundry:'🧺 Lavage',cooking:'🍳 Cuisson',cold:'❄️ Froid',vacuum:'🧹 Aspiration',smallAppliances:'☕ Petit électroménager',showroom:'❄️ Point produits / Showroom',contract:'📑 Contrat d’exposition',service:'🛠️ SAV / ADV',products:'📦 Point produits',newsletter:'📰 Newsletter',market:'🏬 Contexte marché',actionsDone:'🛠️ Actions réalisées',positives:'✅ Points positifs',focus:'⚠️ Points à travailler',actions:'🎯 Plan d’action / prochain passage',summary:'📝 Synthèse',notes:'📝 Notes terrain'};
const ORDER={
 brun:['context','tv','challenge','competition','offers','training','blackFriday','audio','merchandising','omni','actionsDone','notes','positives','focus','actions','summary'],
 blanc:['context','laundry','cooking','cold','vacuum','smallAppliances','competition','offers','training','merchandising','omni','actionsDone','notes','positives','focus','actions','summary'],
 cuisiniste:['context','showroom','competition','training','contract','service','actionsDone','notes','positives','focus','actions','summary'],
 'buying-groups':['context','products','competition','training','newsletter','service','market','actionsDone','notes','positives','focus','actions','summary']
};
const LISTS=new Set(['positives','focus','actions']),APPENDIX=new Set(['positives','focus','actions','summary']);
const TOPICS={tv:/\b(tv|oled|qled|ecrans?|tele(?:s|vision|visions|viseur|viseurs)?|televis\w*|neo qled|vision ai|diagonales?)\b/i,challenge:/challenge|prime|guelte|incentive/i,competition:/concurr|\blg\b|hisense|haier|rowenta|\bbsh\b|tcl|bosch|siemens|miele/i,offers:/\bodr\b|offre|remise|promotion/i,training:/form[ea]|classroom|vision ai/i,blackFriday:/black friday/i,audio:/audio|barre[ -]de[ -]son|q[ -]symphony/i,merchandising:/massification|merch|lineaire|meuble|facing|exposition|mise[ -]en[ -]avant|visibilite/i,omni:/omni/i,laundry:/lavage|lav[ae]|sechante|seche[ -]linge/i,cooking:/cuisson|four|dual cook|plaque|hotte/i,cold:/froid|refriger|americain|multiportes|combine|congel/i,vacuum:/aspirat|robot|laveur|rowenta/i,smallAppliances:/petit electromenager|cafe|cafet|bouilloire|grille[ -]pain/i,showroom:/showroom|produit|refriger|americain|multiportes|four|dual cook|\b[a-z]*\d+[a-z]+\d*\b/i,contract:/contrat/i,service:/\bsav\b|\badv\b|litige|reparation|protechneed|haas/i,newsletter:/newsletter/i,market:/findis|marche|rachat/i,actions:/a faire|a revoir|a suivre|prevoir|prevu|suiv|reprendre|recontact|presenter|confirmer|preparer|renforcer|travailler|identifier|evaluer|maintenir|capitaliser|continuer|souhaite|prochain|a definir|a confirmer/i,actionsDone:/realise|effectue|fait|presente|forme|installe|termine/i};
const STOP=new Set(('a au aux avec ce cet cette ces d de des du dans en et est ete etait etaient etre l la le les leur leurs lui n ne nos notre on ou par pas pour qu que qui s sa se ses son sur un une vos votre y il ils elle elles je j tu nous vous c ca donc plus comme tres actuellement notamment ainsi egalement encore selon apres avant lors depuis entre chez afin autour jusqu hui aujourd deja seulement soit mais tandis lequel laquelle lesquels auxquelles dont si sous puis reste restent bien davantage plutot moins ni aucun aucune').split(' '));
const SPELL={tro:'trop',di:'dit',deja:'deja',pr:'pour',bcp:'beaucoup',vendeur:'vendeur',vendeurs:'vendeur',vendeuse:'vendeur',vendeuses:'vendeur',prix:'prix',models:'model',modeles:'model',modele:'model'};
const SEMANTIC_MARKERS=new Set(['n','ne','pas','aucun','aucune','jamais','plus','moins','si','sous','ou','et','par','pour','avec','chez','ete','eventuel','eventuelle','possible','souhaite','confirmer','reserve','estime','juge','trouve','selon','indique','dit','signale']);
function text(x){return String(x==null?'':x).trim()}
function plain(x){return text(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’']/g,' ').replace(/\s+/g,' ').trim()}
function fail(reason){throw new Error('Compte rendu IA rejeté : '+reason)}
function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x)}
function keysOnly(value,keys){return object(value)&&Object.keys(value).every(k=>keys.includes(k))}
function canonicalJSON(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(x=>canonicalJSON(x===undefined?null:x)).join(',')+']';
 return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonicalJSON(value[k])).join(',')+'}';
}
async function sourceSignature(source){
 const crypto=root.crypto;if(!crypto||!crypto.subtle)throw new Error('SHA-256 indisponible');
 const bytes=new TextEncoder().encode(canonicalJSON(source)),hash=await crypto.subtle.digest('SHA-256',bytes);
 return 'sha256-'+Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
function reportsFor(source){
 if(source&&Array.isArray(source.reports))return source.reports;
 const entries=source&&Array.isArray(source.entries)?source.entries:[],channel=plain(source&&source.store&&source.store.channel);
 if(channel==='cuisiniste'||channel==='cuisinistes')return[{reportType:'cuisiniste',entries}];
 if(channel==='buying-groups')return[{reportType:'buying-groups',entries}];
 if(source&&TYPES.includes(source.reportType))return[{reportType:source.reportType,entries}];
 return ['brun','blanc'].filter(f=>entries.some(e=>e&&(!e.family||e.family===f))).map(f=>({reportType:f,entries:entries.filter(e=>e&&(!e.family||e.family===f))}));
}
function reportFor(source,type){return reportsFor(source).find(r=>r.reportType===type)||{reportType:type,entries:[]}}
function expectedTypes(source){const rows=reportsFor(source);if(rows.some(r=>!r||!TYPES.includes(r.reportType)||!Array.isArray(r.entries)))fail('sources invalides');const types=rows.map(r=>r.reportType);if(new Set(types).size!==types.length)fail('familles source dupliquées');return types}
function sourceContext(source,report){return plain(JSON.stringify({store:source&&source.store,entries:report.entries}))}
function words(value){return plain(value).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)||[]}
function stem(word){word=SPELL[word]||word;if(word.length>5)return word.replace(/(?:aient|ant|ees|ee|es|e|s)$/,'');return word}
function meaningful(value){return words(value).map(x=>SPELL[x]||x).filter(x=>!STOP.has(x)).map(stem)}
function semanticSequence(value){return words(value).filter(x=>!STOP.has(x)||SEMANTIC_MARKERS.has(x)).map(x=>x==='n'?'ne':stem(x))}
/* References, numbers and amounts are checked on the quotation itself: citing an
   unrelated sentence from the same large note is not evidence for a different price. */
function exactTokens(value){return text(value).match(/\b(?:[A-Za-z]*\d+[A-Za-z]+[A-Za-z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*)\b|\d+(?:[.,]\d+)?(?:ᵉ|ᵐᵉ|ème|er|e)?(?:[ \u00a0\u202f]*[€%])?/g)||[]}
function tokenKey(x){return x.replace(/[ \u00a0\u202f]/g,'')}
function completeEvidence(quote,sourceText){
 /* An exact substring is not enough: "contrat validé" is a substring of
    "aucun contrat validé". Evidence must retain the entire enclosing sentence,
    including its attribution and its commercial uncertainty. */
 const chunks=text(sourceText).replace(/\s+/g,' ').split(/(?<=[.!?;])\s+/).map(s=>s.trim()).filter(Boolean),source=chunks.join(' '),q=text(quote).replace(/\s+/g,' '),starts=new Set(),ends=new Set();
 let offset=0;for(const chunk of chunks){starts.add(offset);offset+=chunk.length;ends.add(offset);offset++}
 let from=0;while(from<=source.length){const start=source.indexOf(q,from);if(start<0)return false;const end=start+q.length;
  const after=source.slice(end).trimStart(),finishes=ends.has(end)||/^[.!?;]/.test(after);
  if(starts.has(start)&&finishes)return true;from=start+1;
 }return false;
}
// Dictated notes can be one long sentence without punctuation. Allow an exact
// interior quote only when it starts/ends on word boundaries and nearby omitted
// context cannot change its commercial meaning. Keep the strict complete-sentence
// proof for all conventional sentence quotations.
function spokenEvidence(quote,sourceText){
 const source=text(sourceText).replace(/\s+/g,' '),q=text(quote).replace(/\s+/g,' ');
 if(words(q).length<3||q.length>1400)return false;
 const risk=new Set(('aucun aucune non pas jamais ni ne n selon si sous seulement malgre peut pourrait souhaite envisage refuse refusee refus prevu prevue prevoit annule annulee incertain incertaine condition reserve reserves attente estime indique affirme dit signale mais sauf apres apre dapres retour').split(' '));
 let pos=0;
 while(pos<source.length){
  const start=source.indexOf(q,pos);if(start<0)return false;const end=start+q.length;pos=start+1;
  if(start>0&&/[\p{L}\p{N}]/u.test(source[start-1]))continue;
  if(end<source.length&&/[\p{L}\p{N}]/u.test(source[end]))continue;
  // Never cut through an already punctuated sentence.
  if(/[.!?;]/.test(q)||/[.!?;]/.test(source.slice(Math.max(0,start-110),start).split(/(?<=[.!?;])/).pop()||''))continue;
  const before=source.slice(Math.max(0,start-95),start).split(/[.!?;]/).pop();
  const after=source.slice(end,end+65).split(/[.!?;]/)[0];
  const preceding=words(before).slice(-6),following=words(after).slice(0,2);
  if(preceding.some(x=>risk.has(x))||following.some(x=>risk.has(x)))continue;
  return true;
 }
 return false;
}
const PARAPHRASE_RISK=new Set(('pas aucun aucune non ne n jamais ni moins plus si sous ou par pour avec chez ete peut peux pouvait pourrait doivent doit possible souhaite confirmer confirme confirmee reserve eventuel eventuelle refuse refusee refus acceptee accepte valide validee annule annulee realise realisee prevu prevue selon estime juge trouve indique signale seulement forcement').split(' '));
const REPORT_BRANDS=new Set(('samsung lg hisense haier rowenta bosch siemens miele tcl bsh darty boulanger schmidt electrolux whirlpool').split(' '));
const REPORT_ROLES=new Set(('vendeur vendeuse vendeurs vendeuses client clients responsable directeur directrice gerant gerante concepteur').split(' '));
function professionalRewrite(proposed,quote,context){
 const output=text(proposed),q=text(quote);
 if(!output||output.length>1400||/[\r\n]|``|⸻|\p{Extended_Pictographic}|(?:^|\s)(?:#{1,6}\s|\*\s|>\s|-\s)|\*\*|__|---/u.test(output))return false;
 const numberWords={deux:'2',trois:'3',quatre:'4',cinq:'5',six:'6',sept:'7',huit:'8',neuf:'9',dix:'10',onze:'11',douze:'12',treize:'13',quatorze:'14',quinze:'15',seize:'16',vingt:'20',trente:'30',quarante:'40',cinquante:'50',soixante:'60',cent:'100',mille:'1000'};
 const factTokens=v=>[...exactTokens(v).map(tokenKey),...words(v).filter(x=>numberWords[x]).map(x=>numberWords[x])];
 const sourceNumbers=factTokens(q),outputNumbers=factTokens(output);
 if(outputNumbers.some(x=>!sourceNumbers.includes(x)))return false;
 // A short quotation is one atomic claim: preserve all its references/prices.
 if(q.length<160&&sourceNumbers.some(x=>!outputNumbers.includes(x)))return false;
 const qwords=words(q),pwords=words(output);
 const qplain=plain(q),pplain=plain(output);
 if(/americain\s+(?:de|chez)\s+samsung/.test(pplain)&&!/americain\s+(?:de|chez)\s+samsung/.test(qplain))return false;
 // Do not turn an ambiguous American/combiné appliance into a confirmed refrigerator without a cold-category context.
 if(/\brefrigerateur\b/.test(pplain)&&!/\brefrigerateur\b/.test(qplain)&&/\b(?:americain|combine)\b/.test(qplain)&&!/cuisiniste|froid|showroom|refriger|congel|multiportes/.test(context))return false;
 // Never erase a specific appliance or contract type from a short observation.
 const factNouns=['refrigerateur','four','contrat','formation','micro-ondes','porte','lavage','seche-linge','aspirateur'];
 if(factNouns.some(noun=>new RegExp('\\b'+noun+'\\b').test(qplain)&&!new RegExp('\\b'+noun+'\\b').test(pplain)))return false;
 // Brand identity, merchant attribution and uncertainty must not drift.
 const anchors=seq=>seq.map(x=>SPELL[x]||x).filter(x=>REPORT_BRANDS.has(x)||REPORT_ROLES.has(x)||PARAPHRASE_RISK.has(x));
 const qAnchors=anchors(qwords),pAnchors=anchors(pwords);
 if(JSON.stringify(qAnchors)!==JSON.stringify(pAnchors))return false;
 // Preserve explicit product names and people; never introduce a new proper name.
 const names=v=>(v.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{N}-]+/gu)||[]).map(plain).filter(x=>!STOP.has(x)&&!REPORT_BRANDS.has(x));
 const qNames=new Set([...names(q),...qwords]);if(names(output).some(x=>!qNames.has(x)))return false;
 // An actual paraphrase must still visibly overlap its source. Grammatical
 // connectors and neutral description may differ; new figures or identities may not.
 const originals=new Set(meaningful(q)),content=meaningful(output);
 const overlap=content.filter(x=>originals.has(x));
 if(overlap.length<Math.min(2,originals.size)||overlap.length/Math.max(1,content.length)<0.35)return false;
 // Negation can be moved by changing punctuation even without changing words.
 if(qAnchors.some(x=>PARAPHRASE_RISK.has(x))){
  const clauses=v=>text(v).split(/[,;.!?:]+/).map(c=>anchors(words(c))).filter(x=>x.length);
  if(JSON.stringify(clauses(q))!==JSON.stringify(clauses(output)))return false;
 }
 return true;
}
function validCleanup(proposed,quote,context){
 const output=text(proposed),q=text(quote),qplain=plain(q),pplain=plain(output);
 if(/[\r\n]|```|⸻|\p{Extended_Pictographic}|(?:^|\s)(?:#{1,6}\s|\*\s|>\s|-\s)|\*\*|__|---/u.test(output))return false;
 const qTokens=exactTokens(q).map(tokenKey),pTokens=exactTokens(output).map(tokenKey);
 if(qTokens.some(x=>!pTokens.includes(x))||pTokens.some(x=>!qTokens.includes(x)))return false;
 const inputWords=meaningful(q),input=new Set(inputWords),allowed=new Set(input),extensions=new Set();
 if(/\bamericain\b/.test(qplain)&&(/cuisiniste|froid|showroom|refriger|multiportes|congel/.test(context)))extensions.add(stem('refrigerateur'));
 if(/\bcombine\b/.test(qplain)&&/froid|refriger|congel/.test(context))extensions.add(stem('refrigerateur'));
 for(const word of extensions)allowed.add(word);
 /* Converting a showroom appliance into a person employed by the brand is unsafe. */
 if(/americain\s+(?:de|chez)\s+samsung/.test(pplain)&&!/americain\s+(?:de|chez)\s+samsung/.test(qplain))return false;
 if(meaningful(output).some(x=>!allowed.has(x)))return false;
 const outputWords=new Set(meaningful(output));if(inputWords.some(x=>!outputWords.has(x)))return false;
 /* Preserve subject/product/comparison order. A bag of allowed words alone would
    accept "LG moins représenté que Samsung" from the inverse observation. */
 let cursor=0;for(const word of meaningful(output)){if(extensions.has(word)&&!input.has(word))continue;const next=inputWords.indexOf(word,cursor);if(next<0)return false;cursor=next+1}
 /* Counts alone do not establish which product a negation qualifies. Preserve its
    position among business words, and the connectors that determine alternatives,
    responsibility or passive voice ("formé pour" is not "formé par"). */
 const quotedSequence=semanticSequence(q),proposedSequence=semanticSequence(output).filter(x=>!(extensions.has(x)&&!input.has(x)));
 if(quotedSequence.length!==proposedSequence.length||quotedSequence.some((word,index)=>word!==proposedSequence[index]))return false;
 /* Existing clause boundaries attach "pas"/"selon"/"si" to their subject.
    Moving a comma around the same words can also reverse the observation. */
 if(words(q).some(x=>SEMANTIC_MARKERS.has(SPELL[x]||x))){
  const clauses=value=>text(value).split(/[,;.!?:]+/).map(c=>semanticSequence(c).filter(x=>!(extensions.has(x)&&!input.has(x)))).filter(c=>c.length);
  if(JSON.stringify(clauses(q))!==JSON.stringify(clauses(output)))return false;
 }
 /* Negation, possibility and uncertainty carry commercial meaning, not punctuation. */
 for(const marker of SEMANTIC_MARKERS){
  const count=value=>words(value).map(x=>SPELL[x]||x).filter(x=>marker==='n'||marker==='ne'?x==='n'||x==='ne':x===marker).length;
  if(count(q)!==count(output))return false;
 }
 for(const name of (q.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{N}-]+/gu)||[])){if(!STOP.has(plain(name))&&!words(output).includes(plain(name)))return false}
 if(/pas ferme|aucun.*valide|a l idee/.test(qplain)&&/accord valide|collaboration acceptee|contrat accepte|contrat refuse/.test(pplain))return false;
 const role=qplain.match(/\b(vendeur|vendeuse|vendeurs|vendeuses|client|clients|responsable|directeur|directrice|gerant|gerante|concepteur)\b/);
 if(role&&/estime|juge|trouve|selon|apres|indique|dit|signale|retour/.test(qplain)){
  if(!words(output).some(x=>stem(x)===stem(role[1])))return false;
  if(!/estime|juge|trouve|selon|apres|indique|dit|signale|retour/.test(pplain))return false;
 }
 return Boolean(output)&&output.length<=1400;
}
function validTopic(section,quote){
 const q=plain(quote),test=TOPICS[section];if(test&&!test.test(q)&&!(section==='actions'&&/^(?:mieux )?(revoir|relancer|recontacter|organiser|valoriser)\b/.test(q)))return false;
 if(section==='actionsDone'&&(!/\b(realise|realisee|effectue|effectuee|fait|faite|forme|formee|installe|installee|termine|terminee)\b/.test(q)||/\b(pas|aucun|aucune|non|prevu|prevoir|confirmer)\b/.test(q)))return false;
 if(section==='positives'&&/\b(faible|limite|manque|absent|aucun|aucune|peu|refuse|sous represente)\b/.test(q))return false;
 if(section==='focus'&&!/faible|limite|manque|absent|aucun|aucune|peu|seulement|refuse|concurr|\blg\b|confirmer|definir|renforcer|travailler|preparer|opportun|a suivre|a revoir/.test(q))return false;
 return true;
}
function parse(raw){
 if(typeof raw!=='string')return raw;
 const value=text(raw).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');if(!value)fail('réponse vide');
 try{return JSON.parse(value)}catch(e){fail('JSON vide ou tronqué')}
}
function validate(raw,source){
 const doc=parse(raw),types=expectedTypes(source);
 if(!keysOnly(doc,['version','reports'])||doc.version!==VERSION||!Array.isArray(doc.reports)||doc.reports.length!==types.length)fail('schéma ou familles inattendus');
 const seen=new Set(),reports=[];let count=0;
 for(const report of doc.reports){
  if(!keysOnly(report,['reportType','items'])||!types.includes(report.reportType)||seen.has(report.reportType)||!Array.isArray(report.items))fail('rapport dupliqué ou inconnu');
  seen.add(report.reportType);const inputs=reportFor(source,report.reportType),bySource=new Map(inputs.entries.map(e=>[e.source,e])),context=sourceContext(source,inputs),items=[],duplicates=new Set();
  for(const item of report.items){
   if(++count>MAX_ITEMS)fail('trop de faits');
   if(!keysOnly(item,['section','text','source','quote'])||!ORDER[report.reportType].includes(item.section)||['text','source','quote'].some(k=>typeof item[k]!=='string'))fail('fait non conforme');
   const src=bySource.get(item.source),quote=text(item.quote),proposed=text(item.text);
   if(!src||quote.length<4||quote.length>1400||!text(src.text).replace(/\s+/g,' ').includes(quote.replace(/\s+/g,' ')))fail('citation absente des notes');
   if(!completeEvidence(quote,src.text)&&!spokenEvidence(quote,src.text))fail('citation privée de son contexte');
   if(!validCleanup(proposed,quote,context)&&!professionalRewrite(proposed,quote,context))fail('faits, attribution ou nuance modifiés');
   if(!validTopic(item.section,quote))fail('rubrique sans preuve métier');
   const key=item.section+'|'+item.source+'|'+plain(quote);if(duplicates.has(key))continue;duplicates.add(key);
   items.push({section:item.section,text:proposed,source:item.source,quote});
  }
  if(inputs.entries.some(e=>text(e.text))&&!items.length)fail('rapport vide');
  reports.push({reportType:report.reportType,items});
 }
 return{version:VERSION,reports};
}
// A provider may compose a clean but unsupported sentence. Keep it only when
// its factual relations can be checked; otherwise preserve its *exact* evidence
// under Notes terrain. Never treat unsafe AI prose as a validated statement.
function safeBusinessRelations(proposed,quote){
 const original=text(quote),output=text(proposed);
 const norm=v=>plain(v).replace(/[^a-z0-9€%]+/g,' ').trim();
 if(norm(original)===norm(output))return true;
 const o=words(original),p=words(output);
 const riskWords=new Set(('absence absent absente absents presentes present presente disponibles disponible indisponible rupture stock refuse refusee accepte acceptee confirme confirmee valide validee prevu prevue realise realisee annule annulee hausse baisse augmente diminue remplace remplacee remplacees forme formee paye prime gratuit gratuite gratuité moins plus meilleur pire avant apres').split(' '));
 const risk=v=>v.filter(w=>riskWords.has(w)).map(stem);
 if(JSON.stringify(risk(o))!==JSON.stringify(risk(p)))return false;
 const qNums=exactTokens(original).map(tokenKey),pNums=exactTokens(output).map(tokenKey);
 if(qNums.length!==pNums.length||qNums.some((x,i)=>x!==pNums[i]))return false;
 // Multiple commercial actors or persons permit changes of responsibility if
 // reordered. Require their ordered names rather than just a bag of words.
 const names=v=>v.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{N}-]+/gu)||[];
 const participants=v=>words(v).filter(w=>REPORT_BRANDS.has(w)||REPORT_ROLES.has(w));
 if(JSON.stringify(participants(original))!==JSON.stringify(participants(output)))return false;
 const people=names(original).map(plain).filter(x=>!REPORT_BRANDS.has(x)&&!STOP.has(x));
 const outputPeople=names(output).map(plain).filter(x=>!REPORT_BRANDS.has(x)&&!STOP.has(x));
 if(people.length>1&&JSON.stringify(people)!==JSON.stringify(outputPeople))return false;
 return true;
}
// Professional French can legitimately replace field vocabulary without
// altering a business claim. This bounded path requires exact-source evidence,
// ordered numeric/brand/person anchors, unchanged modality and enough overlap.
function naturalRewrite(proposed,quote,context){
 const q=text(quote),p=text(proposed),qw=words(q),pw=words(p);
 if(!q||!p||p.length>1400||/[\r\n]|⸻|\p{Extended_Pictographic}|(?:^|\s)(?:#{1,6}\s|\*\s|>\s|-\s)|\*\*|__|---/u.test(p))return false;
 if(JSON.stringify(exactTokens(q).map(tokenKey))!==JSON.stringify(exactTokens(p).map(tokenKey)))return false;
 const brands=w=>w.filter(x=>REPORT_BRANDS.has(x));
 if(JSON.stringify(brands(qw))!==JSON.stringify(brands(pw)))return false;
 const person=v=>(v.match(/(?<![\p{L}\p{N}])[\p{Lu}][\p{L}\p{N}-]+/gu)||[])
   .map(plain).filter(x=>!STOP.has(x)&&!REPORT_BRANDS.has(x));
 const noNames=new Set(['visite','premiere','formation','baisse','ventes','magasin','rayon','technologie','point','suivi','le','la','les','des','une','un','absence','presence','television','televiseurs','refrigerateur']);
 const names=person(q),appearing=person(p).filter(x=>names.includes(x));
 if(names.length>1&&JSON.stringify(names)!==JSON.stringify(appearing))return false;
 if(person(p).some(x=>!qw.includes(x)&&!noNames.has(x)&&!((x==='dual'||x==='cook')&&qw.includes('dualcook'))))return false;
 const roles=w=>w.map(x=>SPELL[x]||x).filter(x=>REPORT_ROLES.has(x));
 if(JSON.stringify(roles(qw))!==JSON.stringify(roles(pw)))return false;
 const neg=w=>w.filter(x=>/^(?:pas|aucun|aucune|jamais|sans|non|ni)$/.test(x)).length;
 if(neg(qw)!==neg(pw))return false;
 // Compare commercial status in order, not just a count: switched actors,
 // missing uncertainty or a new confirmed outcome must be rejected.
 const state=v=>words(v).map(x=>{
  if(/^(?:absence|abscence|absent|absente|absents|absentes)$/.test(x))return 'absent';
  if(/^(?:present|presente|presents|presentes|presence|expose|exposee)$/.test(x))return 'present';
  if(/^(?:moins|moin|baisse|diminue|diminution|recul|recule|reculent)$/.test(x))return 'down';
  if(/^(?:hausse|augmente|augmentation|croissance|progression)$/.test(x))return 'up';
  if(/^(?:disponible|disponibles|stock)$/.test(x))return 'available';
  if(/^(?:rupture|indisponible)$/.test(x))return 'unavailable';
  if(/^(?:valide|validee|accepte|acceptee|confirme|confirmee|accord|signe)$/.test(x))return 'confirmed';
  if(/^(?:refuse|refusee|oppose|opposee)$/.test(x))return 'refused';
  if(/^(?:prevu|prevue|prevoir|planifie|planifiee|programme|programmee|envisage)$/.test(x))return 'planned';
  if(/^(?:realise|realisee|effectue|effectuee|termine|terminee|acheve|achevee)$/.test(x))return 'done';
  return '';
 }).filter(Boolean);
 if(JSON.stringify(state(q))!==JSON.stringify(state(p)))return false;
 const qp=plain(q),pp=plain(p);
 // Commercial alternatives, conditionality and attributions may not turn
 // into unconditional, agreed or completed actions.
 if(/\bou\b/.test(qp)!==/\bou\b/.test(pp))return false;
 if(/\b(?:par|pour)\b/.test(qp)&&/\b(?:par|pour)\b/.test(pp)&&
    /\bpar\b/.test(qp)!==/\bpar\b/.test(pp)&&/\b(?:form|formation|remplac)/.test(qp))return false;
 const attribution=v=>/\b(?:selon|apres|indique|estime|affirme|signale|avis|retour)\b/.test(v);
 if(attribution(qp)&&!attribution(pp)&&/\b(?:vendeur|vendeuse|responsable|gerant|gerante|client)\b/.test(qp))return false;
 const conditional=v=>/\b(?:si|peut|pourrait|condition|reserve|eventuel|eventuelle|envisage|forcement)\b/.test(v);
 if(conditional(qp)&&!conditional(pp))return false;
 const inflation=v=>/\b(?:exceptionnel|exceptionnelle|massif|massive|total|totale|garanti|garantie|certain|certaine)\b/.test(v);
 if(inflation(pp)&&!inflation(qp))return false;
 if(/\b(?:forme|formee|remplace|remplacee)\b/.test(qp+ ' '+ pp)&&
   (/\b(?:ete|etait)\s+(?:forme|formee|remplace|remplacee)\s+par\b/.test(pp)!==
    /\b(?:ete|etait)\s+(?:forme|formee|remplace|remplacee)\s+par\b/.test(qp)))return false;
 if(/americain\s+(?:de|chez)\s+samsung/.test(pp)&&!/americain\s+(?:de|chez)\s+samsung/.test(qp))return false;
 if(/\brefrigerateur\b/.test(pp)&&!/\brefrigerateur\b/.test(qp)&&/\b(?:americain|combine)\b/.test(qp)&&!/cuisiniste|froid|showroom|refriger|congel|multiportes/.test(context))return false;
 const aliases={vend:'vente',vends:'vente',ventes:'vente',tele:'tv',teles:'tv',televiseur:'tv',televiseurs:'tv',television:'tv',televisions:'tv',an:'annee',annees:'annee',annee:'annee',precedente:'dernier',derniere:'dernier',technologie:'partie',parti:'partie',moin:'baisse',moins:'baisse',diminue:'baisse',diminution:'baisse',recul:'baisse',recule:'baisse',reculent:'baisse',formation:'formation',forme:'formation',presente:'present',expose:'present',exposee:'present',offres:'offre',communiquees:'communication',abscence:'absence'};
 const normalize=w=>aliases[w]||stem(w);
 const from=new Set(meaningful(q).map(normalize)),to=meaningful(p).map(normalize);
 const overlap=to.filter(x=>from.has(x));
 if(overlap.length<Math.min(2,from.size)||overlap.length/Math.max(1,to.length)<0.25)return false;
 return true;
}

// V280. New reports use editorial freedom, not word-by-word proof.
// A source ID and immutable dictation remain mandatory. Only invented
// figures/references, malformed JSON and unsafe markup are blocked.
function editorialFigures(proposed,sourceText){
 const sourceTokens=exactTokens(sourceText).map(tokenKey);
 const proposedTokens=exactTokens(proposed).map(tokenKey);
 const available=new Map();
 for(const t of sourceTokens)available.set(t,(available.get(t)||0)+1);
 for(const t of proposedTokens){const n=available.get(t)||0;if(!n)return false;available.set(t,n-1)}
 return true;
}
function editorialCommercialGuard(item,sourceText){
 // This checks a high-risk explicitly negated contractual outcome in ANY
 // section: the model may legitimately choose another heading.
 // 'Aucun contrat validé' must never become 'contrat validé'.
 {
  const q=plain(sourceText),p=plain(item.text);
  const barred=/\b(?:aucun|pas|non|sans|ni|absence|jamais)\b.{0,45}\b(?:contrat|accord)\b.{0,50}\b(?:valide|signe|accepte|conclu)\b/.test(q)
   || /\b(?:contrat|accord)\b.{0,45}\b(?:non|pas|jamais|ni)\b.{0,25}\b(?:valide|signe|accepte|conclu)\b/.test(q)
   || /\b(?:contrat|accord)\b.{0,40}\b(?:a confirmer|a signer|en attente)\b/.test(q);
  const affirmed=/\b(?:contrat|accord)\b.{0,50}\b(?:valide|signe|accepte|conclu)\b/.test(p);
  if(barred&&affirmed&&!/\b(?:aucun|pas|non|sans|ni|absence)\b/.test(p))return false;
 }
 return true;
}
// A punctuation/case/diacritic-only transcription is not an editorial rewrite.
// This equality check does not require any overlap for real paraphrases.
function editorialVerbatim(value){
 return plain(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}
function editorialSentence(value){
 const v=text(value);
 if(!v||v.length>1800||/<[^>]*>|[\r\n]|\x60{3}|⸻|\p{Extended_Pictographic}|(?:^|\s)(?:#{1,6}\s|\*\s|>\s|-\s)|\*\*|__|---/u.test(v))return '';
 return v;
}
function validateEditorial(raw,source){
 const doc=parse(raw),types=expectedTypes(source);
 if(!keysOnly(doc,['version','reports'])||doc.version!==VERSION||!Array.isArray(doc.reports)||doc.reports.length!==types.length)fail('schéma ou familles inattendus');
 const seen=new Set(),reports=[];let accepted=0,sourceOnly=0,omitted=0,allCount=0;
 for(const report of doc.reports){
  if(!keysOnly(report,['reportType','items'])||!types.includes(report.reportType)||seen.has(report.reportType)||!Array.isArray(report.items))fail('rapport dupliqué ou inconnu');
  seen.add(report.reportType);
  const entries=reportFor(source,report.reportType).entries;
  const bySource=new Map(entries.map(x=>[x.source,x]));
  const items=[],duplicate=new Set(),attemptedSources=new Set();let skipped=0,rawCount=0,cleanCount=0;
  for(const item of report.items){
   if(++allCount>MAX_ITEMS){skipped++;continue}
   if(!keysOnly(item,['section','text','source','quote'])||!ORDER[report.reportType].includes(item.section)||
      typeof item.text!=='string'||typeof item.source!=='string'||typeof item.quote!=='string'){skipped++;continue}
   const src=bySource.get(item.source),sentence=editorialSentence(item.text);
   if(src)attemptedSources.add(item.source);
   if(!src||!sentence||!editorialFigures(sentence,src.text)||!editorialCommercialGuard(item,src.text)){skipped++;continue}
   const key=item.source+'|'+plain(sentence);if(duplicate.has(key))continue;duplicate.add(key);
   // Inexact quotations are not grounds for rejecting fluent prose.
   // Replace their provenance with the untouched source entry.
   const quoted=text(item.quote),original=text(src.text);
   const quote=quoted&&original.replace(/\s+/g,' ').includes(quoted.replace(/\s+/g,' '))?quoted:original;
   const isRaw=editorialVerbatim(sentence)===editorialVerbatim(quote)||
    editorialVerbatim(sentence)===editorialVerbatim(original);
   // A provider must not make a verbatim dictation look like a completed report.
   // Keep the original note in the visit source and request manual review instead.
   if(isRaw){skipped++;continue}
   items.push({section:item.section,text:sentence,source:item.source,quote});
   cleanCount++;
  }
  // Flag sources not represented in the model output; never inject their raw
  // dictation back into the formatted report. This is an accounting check,
  // not a lexical or semantic restriction on Gemini's prose.
  skipped+=entries.filter(entry=>text(entry.text)&&!attemptedSources.has(entry.source)).length;
  // A completely unusable generation fails cleanly instead of presenting the
  // entire unedited dictation as a 'successful' AI report.
  if(!items.length&&entries.some(x=>text(x.text)))fail('rapport vide');
  accepted+=cleanCount;sourceOnly+=rawCount;omitted+=skipped;
  reports.push({reportType:report.reportType,items,
   ...(rawCount||skipped?{review:{sourceOnly:rawCount,omitted:skipped}}:{})});
 }
 return {version:VERSION,reports,quality:{mode:'editorial',
  status:sourceOnly||omitted?(accepted?'partial':'source-only'):'complete',
  acceptedItems:accepted,sourceOnlyItems:sourceOnly,omittedItems:omitted}};
}
function validateEditorialDelivered(doc,source){
 const types=expectedTypes(source);
 if(!keysOnly(doc,['version','reports','quality'])||doc.version!==VERSION||
    !Array.isArray(doc.reports)||doc.reports.length!==types.length)fail('schéma ou familles inattendus');
 const seen=new Set(),reports=[];let accepted=0,sourceOnly=0,omitted=0,total=0;
 for(const report of doc.reports){
  if(!keysOnly(report,['reportType','items','review'])||!types.includes(report.reportType)||
     seen.has(report.reportType)||!Array.isArray(report.items))fail('rapport dupliqué ou inconnu');
  seen.add(report.reportType);
  const entries=reportFor(source,report.reportType).entries;
  const bySource=new Map(entries.map(x=>[x.source,x]));
  const items=[];let reportRaw=0;
  for(const item of report.items){
   if(++total>MAX_ITEMS+entries.length||!keysOnly(item,['section','text','source','quote'])||
      !ORDER[report.reportType].includes(item.section)||
      typeof item.text!=='string'||typeof item.source!=='string'||typeof item.quote!=='string')fail('fait non conforme');
   const src=bySource.get(item.source),sentence=editorialSentence(item.text),quoted=text(item.quote);
   if(!src||!sentence||!editorialFigures(sentence,src.text)||!editorialCommercialGuard(item,src.text)||!quoted||
      !text(src.text).replace(/\s+/g,' ').includes(quoted.replace(/\s+/g,' ')))fail('fait non conforme');
   if(item.section==='notes'&&plain(sentence)===plain(quoted))reportRaw++;
   else accepted++;
   items.push({section:item.section,text:sentence,source:item.source,quote:quoted});
  }
  if(!items.length&&entries.some(x=>text(x.text)))fail('rapport vide');
  sourceOnly+=reportRaw;
  const v=report.review;
  if(v){
   if(!keysOnly(v,['sourceOnly','omitted'])||!Number.isInteger(v.sourceOnly)||
      !Number.isInteger(v.omitted)||v.sourceOnly!==reportRaw||v.omitted<0||v.omitted>200)fail('fait non conforme');
   omitted+=v.omitted;
  }else if(reportRaw)fail('fait non conforme');
  reports.push({reportType:report.reportType,items,...(v?{review:v}:{})});
 }
 const quality=doc.quality;
 if(!keysOnly(quality,['mode','status','acceptedItems','sourceOnlyItems','omittedItems'])||
   quality.mode!=='editorial'||quality.acceptedItems!==accepted||
   quality.sourceOnlyItems!==sourceOnly||quality.omittedItems!==omitted||
   quality.status!==(sourceOnly||omitted?(accepted?'partial':'source-only'):'complete'))fail('fait non conforme');
 return {version:VERSION,reports,quality};
}

function validateBestEffort(raw,source){
 const doc=parse(raw),types=expectedTypes(source);
 if(!keysOnly(doc,['version','reports'])||doc.version!==VERSION||!Array.isArray(doc.reports)||doc.reports.length!==types.length)fail('schéma ou familles inattendus');
 const seen=new Set(),reports=[];let processed=0,accepted=0,sourceOnly=0,omitted=0;
 for(const report of doc.reports){
  if(!keysOnly(report,['reportType','items'])||!types.includes(report.reportType)||seen.has(report.reportType)||!Array.isArray(report.items))fail('rapport dupliqué ou inconnu');
  seen.add(report.reportType);
  const inputs=reportFor(source,report.reportType),bySource=new Map(inputs.entries.map(e=>[e.source,e])),context=sourceContext(source,inputs);
  if(!report.items.length&&inputs.entries.some(e=>text(e.text)))fail('rapport vide');
  const items=[],duplicates=new Set();let reportRaw=0,reportOmitted=0,reportAccepted=0;
  for(const item of report.items){
   if(++processed>MAX_ITEMS){reportOmitted++;continue}
   if(!keysOnly(item,['section','text','source','quote'])||!ORDER[report.reportType].includes(item.section)||['text','source','quote'].some(k=>typeof item[k]!=='string')){reportOmitted++;continue}
   const src=bySource.get(item.source),quote=text(item.quote),proposed=text(item.text);
   if(!src||quote.length<4||quote.length>1400||!text(src.text).replace(/\s+/g,' ').includes(quote.replace(/\s+/g,' '))){reportOmitted++;continue}
   if(!completeEvidence(quote,src.text)&&!spokenEvidence(quote,src.text)){reportOmitted++;continue}
   if(!validTopic(item.section,quote)){reportOmitted++;continue}
   const key=item.source+'|'+plain(quote);if(duplicates.has(key))continue;duplicates.add(key);
   if(((validCleanup(proposed,quote,context)||professionalRewrite(proposed,quote,context))&&safeBusinessRelations(proposed,quote))||naturalRewrite(proposed,quote,context)){
    if(item.section==='notes'&&plain(proposed)===plain(quote)){
     // An unedited transcription is retained source evidence, not a
     // successfully authored professional report.
     items.push({section:'notes',text:quote,source:item.source,quote});reportRaw++;
    }else{
     items.push({section:item.section,text:proposed,source:item.source,quote});reportAccepted++;
    }
   }else{
    // A questionable statement is never copied into the finished report.
    // The exact field note is kept, clearly identified as a source quotation.
    items.push({section:'notes',text:quote,source:item.source,quote});reportRaw++;
   }
  }
  // In V278-3 one rejected short quote appended the ENTIRE dictated entry,
  // even if its facts were already represented by validated items. This
  // created a huge repeated final paragraph on real store visits.
  // Preserve untouched sources for genuinely empty reports; otherwise only
  // append short, uncovered entries. Longer unmatched notes remain in the
  // immutable visit source and trigger explicit manual-review notice.
  if(reportOmitted||!items.length){
   const alreadyCovered=items.length>0;
   for(const entry of inputs.entries){
    const raw=text(entry.text);if(!raw)continue;
    const key=entry.source+'|'+plain(raw);
    if(duplicates.has(key))continue;
    // This exact passage has already been included, possibly by another
    // source entry. Never reprint it as an additional raw note.
    if(items.some(item=>plain(item.quote)===plain(raw)||plain(item.text)===plain(raw)))continue;
    if(alreadyCovered&&raw.length>150){
     // Do NOT silently drop the underlying source: it remains in the visit,
     // and the report explicitly flags that a source entry needs review.
     reportOmitted++;continue;
    }
    duplicates.add(key);
    items.push({section:'notes',text:raw,source:entry.source,quote:raw});
    reportRaw++;
   }
  }
  if(inputs.entries.some(e=>text(e.text))&&!items.length)fail('rapport vide');
  accepted+=reportAccepted;sourceOnly+=reportRaw;omitted+=reportOmitted;
  reports.push({reportType:report.reportType,items,
   ...(reportRaw||reportOmitted?{review:{sourceOnly:reportRaw,omitted:reportOmitted}}:{})});
 }
 return {version:VERSION,reports,
  quality:{status:sourceOnly||omitted?(accepted?'partial':'source-only'):'complete',
   acceptedItems:accepted,sourceOnlyItems:sourceOnly,omittedItems:omitted}};
}
// The phone independently verifies the already-safe server output. Never
// call the strict V278 validator on a partial result: doing so would reject
// the exact source quotations preserved to avoid losing field observations.

/* Groq free prose protocol: this is transport/schema validation, never a
   semantic editorial filter. Keep every dictated observation and every
   generated sentence, even when the advisory audit requests human review. */
function validateFreeform(doc,source){
 const types=expectedTypes(source);
 if(!keysOnly(doc,['version','format','quality','reports'])||doc.version!==VERSION
    ||doc.format!=='groq-freeform'||!doc.quality
    ||!keysOnly(doc.quality,['mode','status'])
    ||doc.quality.mode!=='groq-freeform'||doc.quality.status!=='review-required'
    ||!Array.isArray(doc.reports)||doc.reports.length!==types.length)
   fail('schéma ou familles inattendus');
 const seen=new Set();
 const auditKeys=['missingReferences','unexpectedReferences','missingPrices',
   'unexpectedPrices','missingPercentages','unexpectedPercentages','unexpectedDates'];
 for(const report of doc.reports){
   if(!keysOnly(report,['reportType','text','audit'])||!types.includes(report.reportType)
     ||seen.has(report.reportType)||typeof report.text!=='string'
     ||!report.text.trim()||report.text.length>24000)fail('rapport vide');
   seen.add(report.reportType);
   const a=report.audit;
   if(!a||!keysOnly(a,auditKeys)
     ||auditKeys.some(key=>!Array.isArray(a[key])||a[key].length>20
       ||a[key].some(x=>typeof x!=='string'||x.length>120)))fail('fait non conforme');
 }
 return doc;
}

function validateDelivered(raw,source){
 const doc=parse(raw);
 if(doc&&doc.format==='groq-freeform')return validateFreeform(doc,source);
 if(doc&&doc.quality&&doc.quality.mode==='editorial')return validateEditorialDelivered(doc,source);
 const types=expectedTypes(source);
 if(!keysOnly(doc,['version','reports','quality'])||doc.version!==VERSION||!Array.isArray(doc.reports)||doc.reports.length!==types.length)fail('schéma ou familles inattendus');
 const seen=new Set(),reports=[];
 for(const report of doc.reports){
  if(!keysOnly(report,['reportType','items','review'])||!types.includes(report.reportType)||seen.has(report.reportType)||!Array.isArray(report.items))fail('rapport dupliqué ou inconnu');
  seen.add(report.reportType);
  const entries=reportFor(source,report.reportType).entries,bySource=new Map(entries.map(e=>[e.source,e])),context=sourceContext(source,{entries}),items=[];
  if(report.items.length>MAX_ITEMS+entries.length)fail('trop de faits');
  for(const item of report.items){
   if(!keysOnly(item,['section','text','source','quote'])||!ORDER[report.reportType].includes(item.section)||['text','source','quote'].some(k=>typeof item[k]!=='string'))fail('fait non conforme');
   const src=bySource.get(item.source),quote=text(item.quote),proposed=text(item.text);
   if(!src||!quote||!text(src.text).replace(/\s+/g,' ').includes(quote.replace(/\s+/g,' ')))fail('citation absente des notes');
   if(item.section==='notes'&&proposed===quote&&
       (quote===text(src.text)||completeEvidence(quote,src.text)||spokenEvidence(quote,src.text))){
    items.push({section:'notes',text:quote,source:item.source,quote});continue;
   }
   if(quote.length<4||quote.length>1400||(!completeEvidence(quote,src.text)&&!spokenEvidence(quote,src.text)))fail('citation privée de son contexte');
   if(!validTopic(item.section,quote))fail('rubrique sans preuve métier');
   if(!(((validCleanup(proposed,quote,context)||professionalRewrite(proposed,quote,context))&&safeBusinessRelations(proposed,quote))||naturalRewrite(proposed,quote,context)))fail('faits, attribution ou nuance modifiés');
   items.push({section:item.section,text:proposed,source:item.source,quote});
  }
  if(!items.length&&entries.some(e=>text(e.text)))fail('rapport vide');
  const r={reportType:report.reportType,items};
  if(report.review){
   const v=report.review;
   if(!keysOnly(v,['sourceOnly','omitted'])||!Number.isInteger(v.sourceOnly)||!Number.isInteger(v.omitted)||v.sourceOnly<0||v.omitted<0||v.sourceOnly>200||v.omitted>200)fail('fait non conforme');
   r.review={sourceOnly:v.sourceOnly,omitted:v.omitted};
  }
  reports.push(r);
 }
 const counts={acceptedItems:0,sourceOnlyItems:0,omittedItems:0};
 for(const report of reports){
  counts.sourceOnlyItems+=report.items.filter(i=>i.section==='notes').length;
  counts.acceptedItems+=report.items.filter(i=>i.section!=='notes').length;
  counts.omittedItems+=report.review&&report.review.omitted||0;
 }
 return {version:VERSION,reports,quality:{
  status:counts.sourceOnlyItems||counts.omittedItems?(counts.acceptedItems?'partial':'source-only'):'complete',...counts}};
}
function label(section,type){if(type==='cuisiniste'){if(section==='context')return'🏬 Suivi magasin';if(section==='competition')return'🆚 Concurrence';if(section==='training')return'🍳 Formation réalisée / prévue'}return LABELS[section]}
function storeName(source){return[text(source&&source.store&&source.store.enseigne),text(source&&source.store&&source.store.ville)].filter(Boolean).join(' ')}
function render(doc,source){
 if(doc&&TYPES.includes(doc.reportType)&&typeof doc.text==='string')return doc.text;
 if(!doc||!TYPES.includes(doc.reportType)||!Array.isArray(doc.items))throw new Error('Rapport structuré invalide');
 const type=doc.reportType,name=storeName(source),head=type==='cuisiniste'?'🟠 COMPTE RENDU CUISINISTE':type==='buying-groups'?'🟠 COMPTE RENDU BUYING GROUP':(type==='brun'?'⚫ Résumé BRUN':'⚪ Résumé BLANC');
 const lines=[head+(name?' – '+name:'')],day=text(source&&source.completedDate||source&&source.date);
 
 if(type==='cuisiniste'&&/^\d{4}-\d{2}-\d{2}$/.test(day))lines.push('','Date : '+day.slice(8,10)+'/'+day.slice(5,7)+'/'+day.slice(0,4));
 if(doc.review&&(doc.review.sourceOnly||doc.review.omitted))lines.push('','⚠️ Relecture nécessaire : '+doc.review.sourceOnly+' extrait(s) repris des notes originales, '+doc.review.omitted+' élément(s) non reformulé(s). Les notes complètes restent dans la fiche visite.');
 let sections=0;
 for(const section of ORDER[type]){
  const rows=doc.items.filter(i=>i.section===section&&text(i.text));if(!rows.length)continue;
  if(sections&&type!=='cuisiniste'&&!APPENDIX.has(section))lines.push('','⸻');
  lines.push('',label(section,type),'');
  if(LISTS.has(section))for(const item of rows)lines.push('* '+text(item.text));
  else rows.forEach((item,index)=>{if(index)lines.push('');lines.push(text(item.text))});
  sections++;
 }
 return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
function fallback(source,reportType){
 const report=reportFor(source,reportType),items=[];
 for(const entry of report.entries){const quote=text(entry.text);if(!quote)continue;items.push({section:entry.source==='report.shared.context'?'context':'notes',text:quote,source:entry.source,quote})}
 return render({reportType,items},source);
}
function memoryStatus(quote,section){
 const q=plain(quote),negative=/\b(pas|aucun|aucune|non|jamais)\b/.test(q);
 if(!negative&&/\b(annule|annulee)\b/.test(q))return'cancelled';
 if(validTopic('actionsDone',quote))return'done';
 if(section==='actions'&&validTopic('actions',quote))return'planned';
 if(!negative&&/\b(prevu|prevue|prevoir)\b|a confirmer|a definir/.test(q))return'planned';
 return'recorded';
}
function memory(validated,source){
 // The original visit already carries source-derived Runner memory. Do not
 // turn unverified Groq prose into new actions or product facts.
 if(validated&&validated.format==='groq-freeform')return{version:1,sourceSignature:text(source&&source.sourceSignature),items:[]};
 const kinds={training:'training',merchandising:'merchandising',tv:'product',cold:'product',cooking:'product',laundry:'product',vacuum:'product',showroom:'product',competition:'objection',focus:'problem',actions:'followup',actionsDone:'action',contract:'followup',context:'contact'},items=[],seen=new Set();
 for(const report of validated.reports||[])for(const item of report.items||[]){
  const kind=kinds[item.section];if(!kind||item.section==='summary')continue;
  /* Product memory in V277.1 is an exact reference, never a supposed product name. */
  const quotes=kind==='product'?(text(item.quote).match(/\b(?:[A-Za-z]*\d+[A-Za-z]+[A-Za-z0-9-]*|[A-Za-z]+\d+[A-Za-z0-9-]*)\b/g)||[]):[text(item.quote)];
  const row=reportFor(source,report.reportType).entries.find(e=>e.source===item.source);
  for(const quote of quotes){if(quote.length<4||quote.length>600)continue;const key=kind+'|'+item.source+'|'+plain(quote);if(seen.has(key))continue;seen.add(key);items.push({kind,text:quote,source:item.source,status:memoryStatus(quote,item.section),family:row&&row.family||''});if(items.length>=12)break}
  if(items.length>=12)break;
 }
 return{version:1,sourceSignature:text(source&&source.sourceSignature),items:items.slice(0,12)};
}
function buildPrompt(source){
 const types=expectedTypes(source),schemas=types.map(type=>({reportType:type,sections:ORDER[type].filter(x=>x!=='notes')}));
 return `PROMPT_VERSION: ${PROMPT_VERSION}
Tu es rédacteur professionnel des comptes rendus de visite Samsung (BRUN, BLANC, cuisinistes).
Tu es AUTONOME pour comprendre la dictée, corriger les fautes vocales évidentes, reformuler, regrouper les observations et choisir les rubriques. Rédige des phrases naturelles et professionnelles, pas de notes télégraphiques recopiées. Évite les doublons.
Ne classe pas selon des mots-clés : considère le SENS de chaque observation. Exemple : une massification d'aspirateurs placée à l'entrée du rayon cuisson est du MERCHANDISING, pas un retour vendeur en ASPIRATION.
Lexique métier : BLANC signifie électroménager (froid, lavage, cuisson, aspiration), jamais une couleur; BRUN signifie image, TV et audio. TG = tête de gondole; massification = exposition groupée; mur de fours = meuble de présentation. « en castrape » peut signifier « encastrable » en contexte cuisson; série Q = gamme de barres de son Samsung en contexte audio; SmartThings est une technologie Samsung.
Utilise le nom canonique du magasin donné dans la fiche visite pour éviter les transcriptions vocales approximatives du magasin (Saint-Étienne Villars vs Steel/Villard). N'invente pas d'identité de personne ni de référence produit.
Le commercial doit dicter librement, sans corriger sa manière de parler : tu structures correctement toute la note, même longue ou sans ponctuation. Une dictée recopiée mot pour mot, même placée dans une jolie rubrique, n'est PAS un compte rendu professionnel. Reformule chaque observation avec une syntaxe naturelle sans en réduire le contenu.
Une observation par item, ou deux faits étroitement liés. Maximum 36 items au total. text contient une phrase professionnelle sans titre, emoji ni markdown. Choisis librement la rubrique parmi celles de la famille. Un fait concernant l'audio doit aller dans audio, un contact magasin dans context, une mise en avant dans merchandising.
Avant de rendre le JSON, relis les observations et évite de laisser des faits exploitables uniquement dans la dictée originale. Garde les réserves et les formulations attribuées au vendeur. Ne crée pas de rubrique Notes terrain pour copier la dictée.
RÈGLES MÉTIER : n'invente jamais de personnes, actions, formations, prix, quantités, références, positions, décisions ou rendez-vous. N'inverse pas présence/absence, auteur d'une action ou marque concernée; ne transforme pas un retour vendeur en fait prouvé ni une discussion commerciale en contrat signé. Respecte réserves, incertitudes, négations. Ne déduis pas de plan d'action absent des notes.
Si une transcription orale est vraiment ambiguë, rédige prudemment sans deviner. Corrige les fautes évidentes et les tournures maladroites en préservant le sens.
source doit être l'identifiant exact d'une entrée de la bonne famille. quote est une trace de provenance : cite si possible un passage source, mais la qualité de text ne doit pas être limitée aux mots exacts de quote. Le Worker conserve les notes d'origine et corrige une citation imparfaite.
Réponds UNIQUEMENT par un objet JSON valide : {"version":1,"reports":[{"reportType":"...","items":[{"section":"...","text":"...","source":"...","quote":"..."}]}]}. Un rapport pour chaque type demandé; aucune rubrique vide.
Rubriques possibles par type : ${JSON.stringify(schemas)}
SOURCES_IMMUABLES:
${JSON.stringify(source)}`;
}
const api={VERSION,PROMPT_VERSION,MAX_ITEMS,TYPES,LABELS,ORDER,canonicalJSON,canonical:canonicalJSON,sourceSignature,reportsFor,buildPrompt,validate,validateBestEffort,validateEditorial,validateFreeform,validateDelivered,render,fallback,memory,validCleanup,validTopic};
root.StoreRunnerReportRenderer=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
