/* Store Runner V1 — Planning Command Engine (Lot B, V1).

   Une phrase de l'utilisateur devient une INTENTION, jamais une écriture :

     texte → parse() → intention JSON stricte → validate() → resolve() (IDs magasin)
           → simulate() par les moteurs propriétaires, sur des copies → preview()
           → validation explicite de l'utilisateur → apply() → journal

   Ce module ne choisit aucune visite. Il traduit la demande en contraintes pour les
   propriétaires existants et vérifie leur résultat :
     - période / filtres / jours exigés ou interdits → terrain-planning-v1.js
       (simulateCommandWindow : même construction que le cycle 3 semaines, V263, V264/H2, M1),
       puis V185 (repli géographique) et V251 (ordre intra-journée), V189 (découché, lecture) ;
     - « mets / garde X mardi » → planning-manual-visits.js (StoreRunnerManualPlanning) ;
     - « recalcule le reste de ma semaine » → planning-cascade-v181.js (build / applyResult).
   L'application réutilise exactement le candidat simulé, par les API de ces propriétaires
   et ChefReliability (sauvegarde atomique), puis relit le résultat : toute différence avec
   l'aperçu restaure l'état d'avant. Aucun eval, aucun texte exécuté, aucun réseau : le
   modèle éventuel ne peut fournir qu'une intention JSON, validée comme celle du parseur. */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.StoreRunnerPlanningCommandEngine=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';

const VERSION=1;
const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const WEEKDAY_NAMES=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
const ARCHIVE_KEY='chef_sector_plan_archive_v1';
const JOURNAL_KEY='store-runner-planning-command-log-v1';
const JOURNAL_MAX=30;
const ACTIONS=['plan_visits','place_stores','recalculate_rest_of_week'];
const PRIORITIES=['P1','P2'];
const MAX_WEEKS=6,MAX_LIST=20,MAX_QUERY=80,PREVIEW_TTL_MS=10*60*1000,ORIGIN_TOLERANCE_KM=1;
const DAY_MS=86400000;

/* ------------------------------------------------------------------ utilitaires purs */
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(isObject(value))return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
  if(typeof value==='number'&&!Number.isFinite(value))return null;
  return value;
}
function stableStringify(value){return JSON.stringify(canonical(value))}
function fnv(text){let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return text.length+':'+h.toString(16).padStart(8,'0')}
function norm(value){
  return String(value==null?'':value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[’‘'`´-]/g,' ').replace(/[^a-z0-9/\s]/g,' ').replace(/\s+/g,' ').trim();
}
/* Dates « AAAA-MM-JJ » calculées en UTC pur : aucun décalage d'heure d'été. */
function stampOf(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));if(!m)return null;const y=+m[1],mo=+m[2],d=+m[3],s=Date.UTC(y,mo-1,d),x=new Date(s);return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d?s:null}
function isoOf(stamp){return new Date(stamp).toISOString().slice(0,10)}
function validDate(iso){return stampOf(iso)!==null}
function addDays(iso,n){return isoOf(stampOf(iso)+n*DAY_MS)}
function weekdayOf(iso){return new Date(stampOf(iso)).getUTCDay()}
function mondayOf(iso){const w=weekdayOf(iso)||7;return addDays(iso,1-w)}
function sundayOf(iso){return addDays(mondayOf(iso),6)}
function dayNameOf(iso){const w=weekdayOf(iso);return w>=1&&w<=6?DAYS[w-1]:''}
function dateOfDay(weekKey,day){return addDays(weekKey,DAYS.indexOf(day))}
function localToday(now){const d=now instanceof Date?now:new Date(now||Date.now());return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function isoWeekMonday(year,week){
  if(!Number.isInteger(year)||!Number.isInteger(week)||week<1||week>53)return null;
  const jan4=isoOf(Date.UTC(year,0,4)),monday=addDays(mondayOf(jan4),(week-1)*7);
  return isoYearOf(monday)===year?monday:null;
}
function isoYearOf(iso){return Number(addDays(mondayOf(iso),3).slice(0,4))}
function isoWeekNumber(iso){const thursday=addDays(mondayOf(iso),3),y=Number(thursday.slice(0,4));return Math.round((stampOf(mondayOf(thursday))-stampOf(isoWeekMonday(y,1)))/(7*DAY_MS))+1}
function label(date){return date.slice(8,10)+'/'+date.slice(5,7)}
function storeLabel(store){return ((store&&store.enseigne)||'Magasin')+(store&&store.ville?' '+store.ville:'')}
function planIds(plan){return Object.fromEntries(DAYS.map(day=>[day,((plan&&plan[day])||[]).map(s=>String(s&&s.id))]))}
function emptyPlan(){return Object.fromEntries(DAYS.map(day=>[day,[]]))}

/* ------------------------------------------------------------------ A. interprétation */
const NUMBERS={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6};
const MONTHS={janvier:1,fevrier:2,mars:3,avril:4,mai:5,juin:6,juillet:7,aout:8,septembre:9,octobre:10,novembre:11,decembre:12};
const VERBS=[
  ['plan',/^(programme|programmes|programmer|programe|progamme|planifie|planifies|planifier|repartis|repartir|reparti|repartie|organise|organiser|prepare|preparer|genere|generer)$/],
  ['place',/^(mets|met|mettre|ajoute|ajouter|rajoute|rajouter|place|placer|positionne|positionner|deplace|deplacer|decale|decaler|cale|caler)$/],
  ['keep',/^(garde|garder|conserve|conserver|laisse|laisser)$/],
  ['avoid',/^(evite|eviter)$/],
  ['recalc',/^(recalcule|recalculer|recalcul)$/]
];
const DESTRUCTIVE=/\b(supprime|supprimer|efface|effacer|vide|vider|annule|annuler|retire|retirer|enleve|enlever)\b/;
const POLITE=new Set(['peux','pourrais','pourrait','peut','tu','vous','on','je','j','veux','voudrais','aimerais','souhaite','il','faut','faudrait','stp','svp','merci','bonjour','salut','ok','alors','est','ce','que','qu','vas','va','y','please','hey']);
const STOP=new Set(['moi','me','le','la','les','l','de','du','des','d','au','aux','a','chez','sur','pour','mon','ma','mes','tous','toutes','tout','ce','cette','ces','magasin','magasins','visite','visites','planning','aussi','bien','svp','stp','merci','prochain','prochaine','en','dans','un','une','the','y']);
const PRESERVE_RE=/\b(?:ne touche pas|ne touches pas|sans toucher|ne bouge pas|ne bouges pas|sans bouger|ne modifie pas|sans modifier|garde|garder|conserve|conserver|preserve|preserver|respecte|respecter)\s+(?:a\s+|aux\s+)?(?:mes\s+|les\s+)?(?:rendez vous|rdv|verrous?|poses?|visites? (?:faites|realisees|effectuees)|jours? passes?)\b/g;
const OPTIMIZE_RE=/\b(?:en\s+)?(?:limitant|limite|limiter|minimise|minimiser|minimisant|reduis|reduire|reduisant)\s+(?:les\s+)?(?:kilometres?|km|trajets?)\b|\b(?:optimise|optimiser|optimisant)\s+(?:les\s+)?(?:decouches?|trajets?|kilometres?|km)\b/g;
const NEGATED_PRESERVE_RE=/\b(?:deplace|deplacer|bouge|bouger|modifie|modifier|decale|decaler|annule|annuler|supprime|supprimer)\s+(?:mes\s+|les\s+)?(?:rendez vous|rdv|verrous?)\b|\b(?:ne garde pas|ne conserve pas|ne preserve pas|sans garder|sans conserver|sans preserver|sans respecter)\s+(?:mes\s+|les\s+)?(?:rendez vous|rdv|verrous?)\b|\bsans (?:limiter|optimiser|minimiser)\b|\bignore\b/;
const UNSUPPORTED=[
  [/\b\d{1,2}\s?h(?:\d{2})?\b|\b(?:matin|apres midi|soir)\b/,'Les horaires précis (« à 10 h », « le matin ») ne sont pas pris en charge par les commandes. Pose l’horaire dans la fiche du magasin.'],
  [/\btous les (?:lundis|mardis|mercredis|jeudis|vendredis|samedis)\b/,'Les règles récurrentes (« tous les mardis ») passent par le verrou du magasin, pas par une commande.'],
  [/\bdimanche\b/,'Store Runner ne planifie aucune visite le dimanche.'],
  [/\bcommence par\b|\ben premier\b|\bordre de passage\b/,'L’ordre de passage se change au doigt dans la journée (appui long), pas par commande.'],
  [/\b(?:p3|p 3|prio 3|priorite 3|p4|p 4|prio 4)\b/,'Seules les priorités P1 et P2 du fichier performance sont comprises.'],
  [/\b(?:formation|conge|conges|vacances|seminaire)\b/,'Les formations, congés et indisponibilités se posent dans l’Agenda : le planning les respecte ensuite.'],
  [/\b(?:objectif|maximum|max|decouche|découche|jours travailles|jour travaille)\b/,'Les réglages (objectif, maximum par jour, découché, jours travaillés) se changent dans Réglages, pas par commande.']
];
const HELP='Exemples compris : « Programme mes P1 avant la W42 », « Mets Valence mardi », « Garde Chambéry mercredi », « Évite Lyon jeudi », « Répartis mes P1 sur les trois prochaines semaines », « Fais-moi une semaine autour de Chambéry mardi et mercredi », « Recalcule seulement le reste de ma semaine ».';

function emptyIntent(action,scope){
  return{version:VERSION,action,scope:scope||{start:'',end:''},filters:{priorities:[],brands:[],stores:[]},
    constraints:{exactDays:[],keepDays:[],windowDays:[],forbidden:[],distribution:'asap',preserveAppointments:true,preserveManualLocks:true,preserveCompletedVisits:true,preservePastDays:true}};
}
function clarify(question,choices){return{kind:'clarify',question,choices:Array.isArray(choices)?choices:[]}}
function unsupported(message){return{kind:'unsupported',message}}

/* Jour de semaine → date : tous les jours nommés d'une même commande tombent dans UNE
   semaine, la première dont ils sont tous à venir (aujourd'hui compris). La semaine
   consultée à l'écran n'intervient jamais (contrat r38). */
function resolveWeekdays(refs,today){
  const named=refs.filter(r=>r.kind==='weekday');
  if(!named.length)return true;
  const currentMonday=mondayOf(today),allAhead=named.every(r=>dateOfDay(currentMonday,DAYS[r.index])>=today),monday=allAhead?currentMonday:addDays(currentMonday,7);
  for(const r of named)r.date=dateOfDay(monday,DAYS[r.index]);
  return true;
}
/* Lecture d'une référence de jour à la position i des jetons. Rend {ref,length} ou null. */
function dayRefAt(tokens,i,today){
  const t=tokens[i],n=tokens[i+1],n2=tokens[i+2];
  if(t==='aujourd'&&n==='hui')return{ref:{kind:'date',date:today,text:'aujourd’hui'},length:2};
  if(t==='aujourdhui')return{ref:{kind:'date',date:today,text:'aujourd’hui'},length:1};
  if(t==='demain')return{ref:{kind:'date',date:addDays(today,1),text:'demain'},length:1};
  if(t==='apres'&&n==='demain')return{ref:{kind:'date',date:addDays(today,2),text:'après-demain'},length:2};
  const slash=/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t||'');
  if(slash){const d=+slash[1],m=+slash[2];let y=slash[3]?+slash[3]:Number(today.slice(0,4));if(y<100)y+=2000;let date=isoOf(Date.UTC(y,m-1,d));if(!validDate(date)||Number(date.slice(5,7))!==m)return{ref:{kind:'invalid',text:t},length:1};if(!slash[3]&&date<today&&stampOf(today)-stampOf(date)>183*DAY_MS)date=isoOf(Date.UTC(y+1,m-1,d));return{ref:{kind:'date',date,text:t},length:1}}
  if(/^\d{1,2}$/.test(t||'')&&MONTHS[n]){const d=+t,m=MONTHS[n];let y=/^\d{4}$/.test(n2||'')?+n2:Number(today.slice(0,4));let date=isoOf(Date.UTC(y,m-1,d));if(Number(date.slice(5,7))!==m)return{ref:{kind:'invalid',text:t+' '+n},length:2};if(!/^\d{4}$/.test(n2||'')&&date<today&&stampOf(today)-stampOf(date)>183*DAY_MS)date=isoOf(Date.UTC(y+1,m-1,d));return{ref:{kind:'date',date,text:t+' '+n},length:/^\d{4}$/.test(n2||'')?3:2}}
  const w=WEEKDAY_NAMES.indexOf(t);
  if(w>=1&&w<=6){
    /* « mardi 13 » : le numéro doit correspondre au mardi visé, sinon on demande. */
    if(/^\d{1,2}$/.test(n||'')&&!MONTHS[n2]){return{ref:{kind:'weekdayNumber',index:w-1,number:+n,text:t+' '+n},length:2}}
    return{ref:{kind:'weekday',index:w-1,text:t},length:n==='prochain'?2:1};
  }
  return null;
}
/* Découpe « magasins + jour » dans l'ordre : « Valence et Romans mardi et Chambéry mercredi ». */
function chunkStoresAndDays(tokens,today){
  const chunks=[];let queries=[],words=[],pending=null;
  const flushWord=()=>{if(words.length){queries.push(words.join(' '));words=[]}};
  for(let i=0;i<tokens.length;){
    const day=dayRefAt(tokens,i,today);
    if(day){flushWord();chunks.push({queries,ref:day.ref});queries=[];i+=day.length;continue}
    const t=tokens[i];
    if(t==='et'||t===','){flushWord();i++;continue}
    if(STOP.has(t)){i++;continue}
    words.push(t);i++;
  }
  flushWord();
  if(queries.length){
    if(chunks.length&&!chunks[chunks.length-1].queries.length)chunks[chunks.length-1].queries=queries;
    else pending=queries;
  }
  /* Un jour sans magasin reprend les magasins du jour précédent (« mardi et mercredi »). */
  for(let i=1;i<chunks.length;i++)if(!chunks[i].queries.length)chunks[i].inherit=true,chunks[i].queries=chunks[i-1].queries.slice();
  return{chunks,pending};
}
function extractPriorities(text){
  const out=new Set();let rest=text;
  rest=rest.replace(/\b(?:p|prio|priorite|priorites|priority)\s?(1|2|un|deux)\b/g,(m,n)=>{out.add(n==='2'||n==='deux'?'P2':'P1');return' '});
  return{priorities:[...out].sort(),rest};
}
function extractPeriod(text,ctx){
  const today=ctx.today,start=ctx.startDate||today;let m;
  const yearOf=(week,explicit)=>{
    if(explicit)return Number(explicit);
    const y=isoYearOf(today),monday=isoWeekMonday(y,week);
    if(monday&&addDays(monday,6)>=today)return y;
    if(week<=10&&isoWeekNumber(today)>=45)return y+1;
    return y;
  };
  if((m=/\bavant\s+(?:la\s+|le\s+)?(?:w|s|sem|semaine)\s?(\d{1,2})(?:\s+(?:de\s+)?(\d{4}))?\b/.exec(text))){
    const week=+m[1],year=yearOf(week,m[2]),monday=isoWeekMonday(year,week);
    if(!monday)return{error:'La semaine '+week+' n’existe pas en '+year+'.'};
    const end=addDays(monday,-1);
    if(end<start)return{error:'La W'+week+' commence le '+label(monday)+' : il n’y a plus de jour travaillé avant.'};
    return{scope:{start,end},rest:text.replace(m[0],' '),kind:'before'};
  }
  if((m=/\b(?:sur\s+|pour\s+)?(?:les\s+|mes\s+)?(\d|deux|trois|quatre|cinq|six)\s+prochaines\s+semaines\b/.exec(text))){
    const n=NUMBERS[m[1]]||Number(m[1]);if(!(n>=1&&n<=MAX_WEEKS))return{error:'Une commande couvre au plus '+MAX_WEEKS+' semaines.'};
    return{scope:{start,end:addDays(mondayOf(start),7*n-1)},rest:text.replace(m[0],' '),kind:'weeks'};
  }
  if((m=/\b(?:la\s+)?semaine\s+prochaine\b/.exec(text))){const monday=addDays(mondayOf(today),7);return{scope:{start:monday,end:addDays(monday,6)},rest:text.replace(m[0],' '),kind:'week'}}
  if((m=/\b(?:cette|ma|la)\s+semaine\b/.exec(text))){
    if(mondayOf(start)>mondayOf(today))return{error:'Il ne reste plus de jour travaillé cette semaine.',choice:{label:'Planifier la semaine du '+label(mondayOf(start)),week:mondayOf(start)}};
    return{scope:{start:today,end:sundayOf(today)},rest:text.replace(m[0],' '),kind:'week'};
  }
  if((m=/\b(?:en\s+|pour\s+(?:la\s+)?|la\s+)?(?:w|s|sem|semaine)\s?(\d{1,2})(?:\s+(?:de\s+)?(\d{4}))?\b/.exec(text))){
    const week=+m[1],year=yearOf(week,m[2]),monday=isoWeekMonday(year,week);
    if(!monday)return{error:'La semaine '+week+' n’existe pas en '+year+'.'};
    const sunday=addDays(monday,6);
    if(sunday<today)return{error:'La W'+week+' est passée : une commande ne modifie jamais le passé.'};
    return{scope:{start:monday>start?monday:start,end:sunday},rest:text.replace(m[0],' '),kind:'week'};
  }
  return{scope:null,rest:text};
}
function storeRefs(queries){return queries.map(q=>q.trim()).filter(Boolean).map(query=>({query}))}

/* parse(texte, ctx) → null (pas une commande planning : l'assistant historique répond),
   {kind:'intent', intent}, {kind:'clarify', question, choices}, {kind:'info'} ou
   {kind:'unsupported'}. ctx = {today, startDate, brands}. Pur et déterministe. */
function parse(text,ctx){
  const options=ctx||{};
  if(!validDate(options.today))return clarify('Quelle est la date du jour ? (horloge de l’appareil illisible)');
  const raw=String(text==null?'':text);
  if(!raw.trim())return null;
  if(raw.length>400)return unsupported('Commande trop longue : une ou deux consignes à la fois.');
  let n=' '+norm(raw)+' ';
  /* Commandes historiques de l'assistant (objectif « mets 25 magasins », ajout d'un magasin
     au secteur, imposer, verrou récurrent, régénération d'une journée) : non captées. */
  if(/\b(?:mets?|genere|programme)\s+\d{1,3}\s+magasins?\b/.test(n)||/^\s*(?:ajoute|ajouter)\s+(?:un\s+)?magasin\s*$/.test(n)||/\bverrouill/.test(n)||/\bimpose\b/.test(n)||/\b(?:refais|regenere|regen)\b/.test(n))return null;
  /* Ordre des contrôles : refus explicites d'abord, puis les consignes de protection et
     d'optimisation (toujours appliquées par les moteurs) sont reconnues et retirées. */
  if(NEGATED_PRESERVE_RE.test(n))return unsupported('Les rendez-vous et les magasins verrouillés sont intouchables pour une commande, et le moteur optimise toujours les trajets. Modifie un rendez-vous dans sa fiche.');
  const acknowledged=[];
  n=n.replace(PRESERVE_RE,()=>{acknowledged.push('preserve');return' '}).replace(OPTIMIZE_RE,()=>{acknowledged.push('optimize');return' '}).replace(/\bne touche (?:a )?rien\b/g,()=>{acknowledged.push('preserve');return' '});
  const hasVerb=n.trim().split(' ').some(t=>VERBS.some(([,re])=>re.test(t)))||/\b(?:fais|fait|construis|prepare|organise)(?: moi)? une semaine\b/.test(n);
  if(!hasVerb){
    if(acknowledged.includes('preserve')||/\bne touche pas\b/.test(n))return{kind:'info',message:'C’est garanti : une commande ne déplace jamais un rendez-vous, un magasin posé ou verrouillé, une visite réalisée ni une journée passée.'};
    return null;
  }
  if(/\bne\s+(?:programme|planifie|mets|met|ajoute|place|garde|repartis|recalcule|evite)\w*\s+pas\b/.test(n))return unsupported('Les commandes négatives ne sont pas prises en charge. Dis plutôt ce qu’il faut faire, par exemple « Évite Lyon jeudi ».');
  if(DESTRUCTIVE.test(n))return unsupported('Les commandes ne suppriment rien : retire une visite au doigt dans la journée, avec retour arrière.');
  for(const [re,message] of UNSUPPORTED)if(re.test(n))return unsupported(message);
  /* « Fais-moi une semaine autour de X mardi et mercredi » */
  const around=/\b(?:fais|fait|construis|prepare|organise)(?:\s+moi)?\s+une\s+semaine\s+autour\s+(?:de|d)\s+(.+)$/.exec(n.trim());
  const segments=[];
  if(around)segments.push({kind:'around',text:around[1]});
  else{
    const tokens=n.trim().split(' ');let current=null;
    for(const t of tokens){
      const verb=VERBS.find(([,re])=>re.test(t));
      if(verb){current={kind:verb[0],verb:t,tokens:[]};segments.push(current);continue}
      if(!current){if(STOP.has(t)||POLITE.has(t)||t==='et'||t==='ne'||t==='pas')continue;return null}
      current.tokens.push(t);
    }
    for(const s of segments){while(s.tokens.length&&(s.tokens[s.tokens.length-1]==='et'||s.tokens[s.tokens.length-1]==='puis'))s.tokens.pop();s.text=s.tokens.join(' ')}
  }
  if(segments.some(s=>s.kind==='recalc')){
    if(segments.length>1)return clarify('Une seule consigne avec un recalcul : « Recalcule seulement le reste de ma semaine ».');
    if(!/\b(?:reste|semaine)\b/.test(segments[0].text))return clarify('Que faut-il recalculer ? Exemple : « Recalcule seulement le reste de ma semaine ».');
    if(/\bsemaine prochaine\b|\b(?:w|s|semaine)\s?\d{1,2}\b/.test(segments[0].text))return unsupported('Le recalcul ne porte que sur le reste de la semaine en cours.');
    return{kind:'intent',intent:emptyIntent('recalculate_rest_of_week',{start:options.today,end:sundayOf(options.today)}),acknowledged};
  }
  const dayRefs=[],exact=[],keep=[],forbidden=[],windows=[];let plan=null;
  for(const seg of segments){
    if(seg.kind==='around'){
      const {chunks,pending}=chunkStoresAndDays(seg.text.split(' '),options.today);
      const queries=chunks.length?chunks[0].queries:(pending||[]);
      if(!queries.length)return clarify('Autour de quel magasin ou de quelle ville ?');
      if(chunks.some(c=>c.ref.kind==='invalid'))return clarify('Je n’ai pas compris le jour demandé.');
      if(chunks.some(c=>stableStringify(c.queries)!==stableStringify(queries)))return clarify('Une semaine se construit autour d’une seule zone à la fois. Précise la zone et ses jours.');
      plan={declared:false,priorities:[],brands:[],stores:[],period:null};
      if(chunks.length){for(const c of chunks)dayRefs.push(c.ref);windows.push({queries,refs:chunks.map(c=>c.ref)})}
      else{plan.stores=queries;const start=options.startDate||options.today;plan.period={start,end:sundayOf(start)}}
      continue;
    }
    if(seg.kind==='plan'){
      if(plan)return clarify('Une seule demande de programmation par commande.');
      const period=extractPeriod(' '+seg.text+' ',options);
      if(period.error)return clarify(period.error,period.choice?[{label:period.choice.label,text:seg.verb+' '+seg.text.replace(/\b(?:cette|ma|la)\s+semaine\b/,' ').trim()+' semaine '+isoWeekNumber(period.choice.week)+' '+isoYearOf(period.choice.week)}]:[]);
      const pr=extractPriorities(period.rest),rest=pr.rest.split(' ').filter(Boolean);
      if(rest.some((t,i)=>{const d=dayRefAt(rest,i,options.today);return d&&d.ref.kind!=='invalid'}))return clarify('Pour fixer un jour, dis-le séparément : « Programme mes P1 avant la W42 et mets Valence mardi ».');
      const brands=[],queries=[],knownBrands=new Map((options.brands||[]).map(b=>[norm(b),b]));let words=[];
      const flush=()=>{if(!words.length)return;const q=words.join(' ');if(knownBrands.has(q))brands.push(knownBrands.get(q));else queries.push(q);words=[]};
      for(const t of rest){if(t==='et'||t===','){flush();continue}if(STOP.has(t))continue;words.push(t)}
      flush();
      plan={declared:true,priorities:pr.priorities,brands:[...new Set(brands)].sort(),stores:queries,period:period.scope,spread:/^repart/.test(seg.verb)};
      continue;
    }
    const {chunks,pending}=chunkStoresAndDays(seg.text.split(' '),options.today);
    if(pending&&pending.length)return clarify('Quel jour pour « '+pending.join(', ')+' » ?');
    if(!chunks.length)return seg.kind==='avoid'?clarify('Quel jour faut-il éviter ?'):null;
    for(const c of chunks){
      if(c.ref.kind==='invalid')return clarify('La date « '+c.ref.text+' » n’existe pas.');
      if(seg.kind!=='avoid'&&!c.queries.length)return clarify('Quel magasin pour '+c.ref.text+' ?');
    }
    for(const c of chunks)dayRefs.push(c.ref);
    const target=seg.kind==='place'?exact:seg.kind==='keep'?keep:forbidden;
    for(const c of chunks)target.push({queries:c.queries,ref:c.ref});
  }
  resolveWeekdays(dayRefs,options.today);
  for(const r of dayRefs){
    if(r.kind==='weekdayNumber'){
      /* « mardi 13 » : le prochain 13 (ce mois-ci ou les deux suivants) qui tombe un mardi. */
      const y=+options.today.slice(0,4),m=+options.today.slice(5,7);let date='';
      for(let k=0;k<3&&!date;k++){const c=isoOf(Date.UTC(y,m-1+k,r.number));if(Number(c.slice(8,10))===r.number&&c>=options.today)date=c}
      if(!date||dayNameOf(date)!==DAYS[r.index])return clarify('Le '+r.number+' n’est pas un '+WEEKDAY_NAMES[r.index+1]+'. Quelle date veux-tu ?');
      r.date=date;
    }
    if(!r.date)return clarify('Je n’ai pas compris le jour « '+r.text+' ».');
    if(r.date<options.today)return unsupported('Le '+label(r.date)+' est passé : une commande ne modifie jamais le passé.');
  }
  const uniqueDates=[...new Set(dayRefs.map(r=>r.date))].sort();
  let action,scope;
  if(plan||forbidden.length){
    action='plan_visits';
    if(plan&&plan.period)scope=plan.period;
    else if(uniqueDates.length){const monday=mondayOf(uniqueDates[0]);if(uniqueDates.some(d=>mondayOf(d)!==monday))return clarify('Une commande sans période porte sur une seule semaine : précise la période (« sur les deux prochaines semaines »).');scope={start:monday>options.today?monday:options.today,end:addDays(monday,6)}}
    else return clarify('Sur quelle période ?',[{label:'Cette semaine',text:raw+' cette semaine'},{label:'Les 3 prochaines semaines',text:raw+' sur les trois prochaines semaines'}]);
  }else if(exact.length||keep.length){
    action='place_stores';
    const monday=mondayOf(uniqueDates[0]);
    if(uniqueDates.some(d=>mondayOf(d)!==monday))return clarify('Les placements d’une commande portent sur une seule semaine. Fais une commande par semaine.');
    scope={start:monday>options.today?monday:options.today,end:addDays(monday,6)};
  }else return null;
  const intent=emptyIntent(action,scope);
  if(plan){intent.filters.priorities=plan.priorities;intent.filters.brands=plan.brands;intent.filters.stores=storeRefs(plan.stores);intent.constraints.distribution=plan.spread?'spread':'asap'}
  for(const row of exact)intent.constraints.exactDays.push({stores:storeRefs(row.queries),date:row.ref.date});
  for(const row of keep)intent.constraints.keepDays.push({stores:storeRefs(row.queries),date:row.ref.date});
  for(const row of forbidden)intent.constraints.forbidden.push({stores:storeRefs(row.queries),date:row.ref.date});
  for(const row of windows)intent.constraints.windowDays.push({stores:storeRefs(row.queries),dates:[...new Set(row.refs.map(r=>r.date))].sort()});
  if(action==='plan_visits'&&!intent.filters.priorities.length&&!intent.filters.brands.length&&!intent.filters.stores.length&&!intent.constraints.exactDays.length&&!intent.constraints.keepDays.length&&!intent.constraints.windowDays.length&&!intent.constraints.forbidden.length)
    return clarify('Quels magasins programmer ? Exemple : « Programme mes P1 avant la W42 ». Pour toute la période, utilise « Générer mes 3 semaines ».');
  return{kind:'intent',intent,acknowledged};
}

/* ------------------------------------------------------------------ B. validation stricte */
function strictKeys(value,keys,where){
  if(!isObject(value))throw new Error(where+' doit être un objet JSON.');
  const actual=Object.keys(value);
  if(actual.length!==keys.length||actual.some(k=>!keys.includes(k)))throw new Error('Champ absent ou inconnu dans '+where+' (schéma V1 strict).');
}
function checkStoreRefs(list,where,stage,min){
  if(!Array.isArray(list)||list.length<(min||0)||list.length>MAX_LIST)throw new Error(where+' : liste de magasins invalide.');
  for(const ref of list){
    if(stage==='resolved'){strictKeys(ref,['id'],where);if(typeof ref.id!=='string'||!ref.id||ref.id.length>120)throw new Error(where+' : identifiant magasin invalide.')}
    else{strictKeys(ref,['query'],where);if(typeof ref.query!=='string'||!ref.query.trim()||ref.query.length>MAX_QUERY||/[\u0000-\u001f<>{}]/.test(ref.query))throw new Error(where+' : désignation de magasin invalide.')}
  }
}
function checkDate(date,where){if(typeof date!=='string'||!validDate(date))throw new Error(where+' : date invalide.');if(weekdayOf(date)===0)throw new Error(where+' : aucune visite le dimanche.')}
/* validate(intention, {stage:'raw'|'resolved', today}) — refuse toute valeur inconnue,
   tout champ en trop, tout type inattendu. Rend une COPIE normalisée, jamais l'objet reçu. */
function validate(intent,options){
  const stage=options&&options.stage==='resolved'?'resolved':'raw',today=options&&options.today;
  strictKeys(intent,['version','action','scope','filters','constraints'],'l’intention');
  if(intent.version!==VERSION)throw new Error('Version d’intention non prise en charge.');
  if(!ACTIONS.includes(intent.action))throw new Error('Action non prise en charge : '+String(intent.action).slice(0,40)+'.');
  strictKeys(intent.scope,['start','end'],'la période');
  if(!validDate(intent.scope.start)||!validDate(intent.scope.end)||intent.scope.end<intent.scope.start)throw new Error('Période invalide.');
  if(today&&intent.scope.start<today)throw new Error('La période commence avant aujourd’hui : une commande ne modifie jamais le passé.');
  if(stampOf(intent.scope.end)-stampOf(mondayOf(intent.scope.start))>=MAX_WEEKS*7*DAY_MS)throw new Error('Une commande couvre au plus '+MAX_WEEKS+' semaines.');
  strictKeys(intent.filters,['priorities','brands','stores'],'les filtres');
  const f=intent.filters;
  if(!Array.isArray(f.priorities)||f.priorities.some(p=>!PRIORITIES.includes(p))||new Set(f.priorities).size!==f.priorities.length)throw new Error('Priorités invalides (P1, P2).');
  if(!Array.isArray(f.brands)||f.brands.length>MAX_LIST||f.brands.some(b=>typeof b!=='string'||!b.trim()||b.length>MAX_QUERY||/[\u0000-\u001f<>{}]/.test(b)))throw new Error('Enseignes invalides.');
  checkStoreRefs(f.stores,'les magasins ciblés',stage,0);
  const c=intent.constraints;
  strictKeys(c,['exactDays','keepDays','windowDays','forbidden','distribution','preserveAppointments','preserveManualLocks','preserveCompletedVisits','preservePastDays'],'les contraintes');
  for(const k of ['preserveAppointments','preserveManualLocks','preserveCompletedVisits','preservePastDays'])if(c[k]!==true)throw new Error('Les protections (rendez-vous, verrous, visites réalisées, jours passés) restent obligatoires.');
  if(!['asap','spread'].includes(c.distribution))throw new Error('Répartition invalide.');
  const inScope=date=>date>=intent.scope.start&&date<=intent.scope.end;
  for(const [key,where] of [['exactDays','jour exigé'],['keepDays','jour conservé']]){
    if(!Array.isArray(c[key])||c[key].length>MAX_LIST)throw new Error(where+' : liste invalide.');
    for(const row of c[key]){strictKeys(row,['stores','date'],where);checkStoreRefs(row.stores,where,stage,1);checkDate(row.date,where);if(!inScope(row.date))throw new Error(where+' hors de la période.')}
  }
  if(!Array.isArray(c.windowDays)||c.windowDays.length>MAX_LIST)throw new Error('jours de zone : liste invalide.');
  for(const row of c.windowDays){strictKeys(row,['stores','dates'],'jours de zone');checkStoreRefs(row.stores,'jours de zone',stage,1);if(!Array.isArray(row.dates)||!row.dates.length||row.dates.length>6)throw new Error('jours de zone invalides.');for(const d of row.dates){checkDate(d,'jours de zone');if(!inScope(d))throw new Error('jour de zone hors de la période.')}if(stableStringify(row.dates)!==stableStringify([...new Set(row.dates)].sort()))throw new Error('jours de zone non triés ou en double.')}
  if(!Array.isArray(c.forbidden)||c.forbidden.length>MAX_LIST)throw new Error('jours interdits : liste invalide.');
  for(const row of c.forbidden){strictKeys(row,['stores','date'],'jour interdit');checkStoreRefs(row.stores,'jour interdit',stage,0);checkDate(row.date,'jour interdit');if(!inScope(row.date))throw new Error('jour interdit hors de la période.')}
  const action=intent.action,hasFilters=f.priorities.length||f.brands.length||f.stores.length;
  if(action==='plan_visits'){
    if(weekdayOf(intent.scope.end)!==0)throw new Error('Une programmation couvre des semaines entières (fin de période un dimanche).');
    if(!hasFilters&&!c.exactDays.length&&!c.keepDays.length&&!c.windowDays.length&&!c.forbidden.length)throw new Error('Programmation sans magasin ni contrainte.');
  }
  if(action==='place_stores'){
    if(hasFilters||c.windowDays.length||c.forbidden.length||c.distribution!=='asap')throw new Error('Un placement ne prend que des jours exigés ou conservés.');
    if(!c.exactDays.length&&!c.keepDays.length)throw new Error('Placement sans magasin.');
    const monday=mondayOf(intent.scope.start);
    if(intent.scope.end!==addDays(monday,6)||[...c.exactDays,...c.keepDays].some(r=>mondayOf(r.date)!==monday))throw new Error('Un placement porte sur une seule semaine.');
  }
  if(action==='recalculate_rest_of_week'){
    if(hasFilters||c.exactDays.length||c.keepDays.length||c.windowDays.length||c.forbidden.length||c.distribution!=='asap')throw new Error('Le recalcul ne prend aucun filtre ni contrainte.');
    if(intent.scope.end!==sundayOf(intent.scope.start))throw new Error('Le recalcul porte sur le reste de la semaine en cours.');
  }
  if(stage==='resolved'){
    /* Un magasin : une seule consigne de jour, jamais exigé et interdit le même jour. */
    const dayRule=new Map();
    for(const row of [...c.exactDays,...c.keepDays])for(const ref of row.stores){if(dayRule.has(ref.id))throw new Error('Un même magasin ne peut recevoir qu’une consigne de jour par commande.');dayRule.set(ref.id,row.date)}
    for(const row of c.windowDays)for(const ref of row.stores){if(dayRule.has(ref.id))throw new Error('Un même magasin ne peut recevoir qu’une consigne de jour par commande.');dayRule.set(ref.id,row.dates)}
    for(const row of c.forbidden)for(const ref of row.stores){const r=dayRule.get(ref.id);if(r===row.date||(Array.isArray(r)&&r.includes(row.date)))throw new Error('Un magasin ne peut pas être à la fois exigé et interdit le même jour.')}
  }
  return copy(intent);
}
/* Seule porte d'entrée d'un modèle de langage : du texte JSON, jamais du code. */
function acceptModelIntent(text,options){
  const raw=String(text==null?'':text);
  if(!raw.trim()||raw.length>4000)throw new Error('Réponse du modèle vide ou trop longue.');
  let value;try{value=JSON.parse(raw)}catch(e){throw new Error('La réponse du modèle n’est pas un JSON valide.')}
  return validate(value,{stage:'raw',today:options&&options.today});
}

/* ------------------------------------------------------------------ C. résolution des magasins */
function storeWords(store){return new Set(norm([store.enseigne,store.ville,store.adresse,store.dept,store.name].filter(Boolean).join(' ')).replace(/\bst\b/g,'saint').replace(/\bste\b/g,'sainte').split(' '))}
function queryTokens(query){return norm(query).replace(/\bst\b/g,'saint').replace(/\bste\b/g,'sainte').split(' ').filter(t=>t&&!STOP.has(t))}
function shown(query){return String(query||'').split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ')}
function matchStores(query,stores){
  const tokens=queryTokens(query);if(!tokens.length)return[];
  return stores.filter(s=>{const words=storeWords(s);return tokens.every(t=>words.has(t))})
    .sort((a,b)=>String(a.enseigne||'').localeCompare(String(b.enseigne||''))||String(a.ville||'').localeCompare(String(b.ville||''))||String(a.id).localeCompare(String(b.id)));
}
/* resolve(intention brute, ctx) — chaque désignation devient un ou plusieurs IDs existants.
   Plusieurs correspondances : on ne devine pas, on propose le choix. ctx = {stores,
   selections:{[désignation normalisée]:[ids]}, priorityOf(store), today}. */
function resolve(rawIntent,ctx){
  const intent=validate(rawIntent,{stage:'raw',today:ctx&&ctx.today}),stores=(ctx&&ctx.stores||[]).filter(s=>s&&s.id!=null),byId=new Map(stores.map(s=>[String(s.id),s])),selections=ctx&&ctx.selections||{},notes=[];
  const active=stores.filter(s=>s.active!==false);
  let pending=null;
  const resolveRef=ref=>{
    const key=norm(ref.query);
    if(Array.isArray(selections[key])){const ids=selections[key].map(String).filter(id=>byId.has(id));if(ids.length)return ids.map(id=>({id}))}
    const found=matchStores(ref.query,active);
    if(found.length===1)return[{id:String(found[0].id)}];
    if(!found.length){
      const inactive=matchStores(ref.query,stores.filter(s=>s.active===false));
      if(!pending)pending=clarify(inactive.length?'« '+shown(ref.query)+' » correspond à un magasin désactivé : réactive-le dans Magasins avant de le planifier.':'Je ne trouve pas « '+shown(ref.query)+' » dans ton secteur. Précise l’enseigne et la ville.');
      return[];
    }
    if(!pending){
      const sameTown=found.every(s=>norm(s.ville)===norm(found[0].ville));
      const choices=found.slice(0,8).map(s=>({label:storeLabel(s)+(s.adresse?' · '+s.adresse:''),selections:{[key]:[String(s.id)]}}));
      choices.push({label:(sameTown?'Les '+found.length+' magasins de '+found[0].ville:'Les '+found.length+' magasins')+(found.length>8?' (liste complète)':''),selections:{[key]:found.map(s=>String(s.id))}});
      pending=clarify('« '+shown(ref.query)+' » correspond à '+found.length+' magasins. Lequel ?',choices);
    }
    return[];
  };
  const mapRefs=list=>{const out=[],seen=new Set();for(const ref of list)for(const r of resolveRef(ref))if(!seen.has(r.id)){seen.add(r.id);out.push(r)}return out};
  const c=intent.constraints;
  intent.filters.stores=mapRefs(intent.filters.stores);
  for(const key of ['exactDays','keepDays','forbidden'])c[key]=c[key].map(row=>({stores:mapRefs(row.stores),date:row.date}));
  c.windowDays=c.windowDays.map(row=>({stores:mapRefs(row.stores),dates:row.dates}));
  if(pending)return pending;
  /* Filtres priorité / enseigne : développés en IDs maintenant, avec la même lecture P1/P2
     que les moteurs (couverture V263 ← dernier fichier performance importé). */
  let targets=null;
  if(intent.filters.priorities.length){
    if(typeof ctx.priorityOf!=='function')return clarify('Les priorités du fichier performance ne sont pas disponibles.');
    const wanted=new Set(intent.filters.priorities);
    targets=active.filter(s=>wanted.has(ctx.priorityOf(s)));
    if(!targets.length)return clarify('Aucun magasin '+intent.filters.priorities.join('/')+' dans le dernier fichier performance importé (ou déjà traités cette semaine). Importe le fichier de la semaine pour utiliser ce filtre.');
  }
  if(intent.filters.brands.length){
    const brands=new Set(intent.filters.brands.map(norm)),list=(targets||active).filter(s=>brands.has(norm(s.enseigne)));
    if(!list.length)return clarify('Aucun magasin '+intent.filters.brands.join(', ')+(targets?' parmi ces priorités':'')+' dans ton secteur.');
    targets=list;
  }
  if(targets){
    const explicit=new Set(intent.filters.stores.map(r=>r.id));
    const merged=intent.filters.stores.length?targets.filter(s=>explicit.has(String(s.id))):targets;
    if(!merged.length)return clarify('Aucun des magasins cités ne correspond à ces filtres.');
    intent.filters.stores=merged.map(s=>({id:String(s.id)})).sort((a,b)=>a.id.localeCompare(b.id));
  }
  let resolved;
  try{resolved=validate(intent,{stage:'resolved',today:ctx&&ctx.today})}catch(e){return clarify(e.message)}
  return{kind:'resolved',intent:resolved,notes};
}

/* ------------------------------------------------------------------ D. simulation */
function sourceFingerprint(ctx){
  const db=ctx.db,perf=db&&ctx.keys&&ctx.keys.PERFORMANCE?db.getItem(ctx.keys.PERFORMANCE):null;
  return fnv(stableStringify({state:ctx.state,archive:ctx.archive,performance:perf,today:ctx.today}));
}
function storeById(ctx,id){return (ctx.state.stores||[]).find(s=>String(s.id)===String(id))||null}
function weekPlanFrom(ctx,weekKey,archive){
  const shown=mondayOf(String(ctx.state.settings&&ctx.state.settings.weekDate||ctx.today).slice(0,10));
  if(weekKey===shown)return ctx.state.plan||emptyPlan();
  const snap=(archive||ctx.archive)[weekKey];return (snap&&snap.plan)||emptyPlan();
}
function shownWeekKey(ctx){const raw=String(ctx.state.settings&&ctx.state.settings.weekDate||'').slice(0,10);return mondayOf(validDate(raw)?raw:ctx.today)}
function workDays(ctx){const d=ctx.state.settings&&Array.isArray(ctx.state.settings.days)&&ctx.state.settings.days.length?ctx.state.settings.days:DAYS.slice(0,5);return d.filter(x=>DAYS.includes(x))}
function maxCredits(ctx){return Math.max(1,Number(ctx.state.settings&&ctx.state.settings.maxVisitsPerDay)||4)}
function credit(ctx,store){try{if(typeof ctx.credit==='function')return Math.max(1,Number(ctx.credit(store))||1)}catch(e){}return 1}
function routeCredits(ctx,route){return (route||[]).reduce((n,s)=>n+credit(ctx,s),0)}
function appointmentsOf(ctx,id){return (ctx.state.appointments||[]).filter(a=>a&&String(a.storeId)===String(id)&&validDate(String(a.date||'').slice(0,10)))}
function lockDay(ctx,id,weekKey){try{if(typeof ctx.lockDayForWeek==='function')return ctx.lockDayForWeek(id,weekKey)||''}catch(e){}return''}
function dayBlocked(ctx,date){try{return !!ctx.terrain.dateBlocked(date,ctx.state)}catch(e){return false}}
function completedDates(ctx,id){try{return ctx.visitDays?(ctx.visitDays.get(String(id))||[]):[]}catch(e){return[]}}
function planifiable(ctx,store){
  if(!store)return'inconnu du secteur';
  if(store.active===false)return'désactivé';
  if(ctx.state.excluded&&ctx.state.excluded[store.id])return'exclu du planning';
  try{if(ctx.terrain.summarizeTerrainPool([store],ctx.state).planifiable!==1)return'hors des enseignes ou familles sélectionnées'}catch(e){}
  return'';
}
function dayIssue(ctx,date){
  if(date<ctx.today)return'journée passée';
  const day=dayNameOf(date);
  if(!day||!workDays(ctx).includes(day))return(day||'dimanche').toLowerCase()+' n’est pas un jour travaillé';
  if(dayBlocked(ctx,date))return'journée indisponible dans l’Agenda (férié, formation, congé ou déplacement)';
  return'';
}
function fixedDayFor(ctx,id,weekKey){
  const rdv=appointmentsOf(ctx,id).find(a=>mondayOf(String(a.date).slice(0,10))===weekKey);
  if(rdv)return{kind:'rdv',day:dayNameOf(String(rdv.date).slice(0,10)),date:String(rdv.date).slice(0,10),time:rdv.time||''};
  const lock=lockDay(ctx,id,weekKey);
  if(lock)return{kind:'lock',day:lock,date:dateOfDay(weekKey,lock)};
  return null;
}
/* Garde-fous communs à toute contrainte « ce magasin ce jour-là ». */
function dayRuleIssues(ctx,id,date,kind){
  const store=storeById(ctx,id),name=store?storeLabel(store):id,out=[];
  const why=planifiable(ctx,store);if(why)out.push({code:'store_unavailable',message:name+' : '+why+'.'});
  const issue=dayIssue(ctx,date);if(issue)out.push({code:'day_unavailable',message:name+' '+DAYS_LABEL(date)+' : '+issue+'.'});
  const weekKey=mondayOf(date),fixed=fixedDayFor(ctx,id,weekKey);
  if(fixed&&kind!=='forbid'&&fixed.date!==date)out.push({code:fixed.kind==='rdv'?'appointment_conflict':'lock_conflict',message:name+(fixed.kind==='rdv'?' a un rendez-vous le '+DAYS_LABEL(fixed.date)+(fixed.time?' à '+fixed.time:''):' est posé ou verrouillé le '+DAYS_LABEL(fixed.date))+' : je ne le déplace pas.'});
  if(fixed&&kind==='forbid'&&fixed.date===date)out.push({code:fixed.kind==='rdv'?'appointment_conflict':'lock_conflict',message:name+(fixed.kind==='rdv'?' a un rendez-vous ce jour-là':' est posé ou verrouillé ce jour-là')+' : il reste en place.'});
  const done=completedDates(ctx,id).filter(d=>mondayOf(d)===weekKey&&d!==date);
  if(done.length&&kind!=='forbid')out.push({code:'completed_visit',message:name+' a déjà été visité le '+DAYS_LABEL(done[0])+' : une visite réalisée ne se déplace pas.'});
  return out;
}
function DAYS_LABEL(date){const d=dayNameOf(date);return (d?d.toLowerCase()+' ':'')+label(date)}

function diffWeeks(ctx,weeks){
  /* weeks : [{weekKey, before, after}] (plans d'objets magasin). */
  const lines=new Map(),added=[],moved=[],removed=[],kept=[];let unchanged=0;
  const at=(date)=>{if(!lines.has(date))lines.set(date,[]);return lines.get(date)};
  const beforeDates=new Map(),afterDates=new Map();
  for(const w of weeks){for(const day of DAYS){const date=dateOfDay(w.weekKey,day);for(const s of (w.before[day]||[]))beforeDates.set(String(s.id)+'|'+w.weekKey,date);for(const s of (w.after[day]||[]))afterDates.set(String(s.id)+'|'+w.weekKey,date)}}
  const nameOf=id=>{const s=storeById(ctx,id);return s?storeLabel(s):id};
  for(const [key,date] of afterDates){
    const id=key.split('|')[0],before=beforeDates.get(key);
    if(!before){added.push({id,date});at(date).push({type:'+',id,label:nameOf(id)})}
    else if(before!==date){moved.push({id,from:before,to:date});at(date).push({type:'→',id,label:nameOf(id),from:before})}
    else unchanged++;
  }
  for(const [key,date] of beforeDates){
    const id=key.split('|')[0];
    if(!afterDates.has(key)){removed.push({id,date});at(date).push({type:'−',id,label:nameOf(id)})}
  }
  const days=[...lines.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,day:dayNameOf(date),lines:rows.sort((x,y)=>'+→−='.indexOf(x.type)-'+→−='.indexOf(y.type)||x.label.localeCompare(y.label))}));
  return{days,added,moved,removed,kept,unchanged};
}
function keepLines(ctx,simulation,keepRows){
  for(const row of keepRows){const day=simulation.days.find(d=>d.date===row.date);const line={type:'=',id:row.id,label:storeLabel(storeById(ctx,row.id)||{enseigne:row.id})};if(day){if(!day.lines.some(l=>l.id===row.id))day.lines.push(line)}else simulation.days.push({date:row.date,day:dayNameOf(row.date),lines:[line]})}
  simulation.days.sort((a,b)=>a.date.localeCompare(b.date));
}
function weekMetrics(ctx,weekKey,plan,days){
  let km=0,minutes=0,known=true;
  for(const day of days){const route=plan[day]||[];if(!route.length)continue;let m=null;try{m=ctx.terrain.routeMetrics(route,day,weekKey,ctx.state)}catch(e){m=null}
    if(!m||m.kilometers==null)known=false;else km+=m.kilometers;if(m&&m.driveMinutes!=null)minutes+=m.driveMinutes;else known=false}
  return{km,minutes,known};
}
function overnightOf(ctx,plan,weekKey){
  try{const a=ctx.overnight&&ctx.overnight.analyze(plan,weekKey),c=a&&a.candidate;return c?{fromDate:c.fromDate,toDate:c.toDate,fromDay:c.fromDay,toDay:c.toDay,saving:Math.max(0,Math.round(Number(c.saving)||0))}:null}catch(e){return null}
}
function finishSimulation(ctx,intent,base){
  const changedDays=new Map();
  for(const w of base.weeks)for(const day of DAYS){const b=(w.before[day]||[]).map(s=>String(s.id)).join(','),a=(w.after[day]||[]).map(s=>String(s.id)).join(',');if(a!==b){if(!changedDays.has(w.weekKey))changedDays.set(w.weekKey,[]);changedDays.get(w.weekKey).push(day)}}
  let kmBefore=0,kmAfter=0,minBefore=0,minAfter=0,known=true;const overnight=[];
  for(const w of base.weeks){
    const days=changedDays.get(w.weekKey)||[];
    if(days.length){const b=weekMetrics(ctx,w.weekKey,w.before,days),a=weekMetrics(ctx,w.weekKey,w.after,days);kmBefore+=b.km;kmAfter+=a.km;minBefore+=b.minutes;minAfter+=a.minutes;known=known&&b.known&&a.known}
    const ob=overnightOf(ctx,w.before,w.weekKey),oa=overnightOf(ctx,w.after,w.weekKey);
    if(days.length||ob||oa)overnight.push({weekKey:w.weekKey,before:ob,after:oa,changed:stableStringify(ob)!==stableStringify(oa)});
  }
  const diff=diffWeeks(ctx,base.weeks);
  const simulation={
    version:VERSION,action:intent.action,intent,intentSignature:fnv(stableStringify(intent)),today:ctx.today,
    sourceFingerprint:sourceFingerprint(ctx),scope:intent.scope,
    weeks:base.weeks.map(w=>({weekKey:w.weekKey,before:planIds(w.before),after:planIds(w.after)})),
    days:diff.days,
    totals:{requested:base.requested||0,placedTargets:base.placedTargets||0,coveredTargets:base.coveredTargets||0,added:diff.added.length,moved:diff.moved.length,removed:diff.removed.length,unchanged:diff.unchanged,appointmentsChanged:base.appointmentsChanged||0,locksChanged:base.locksChanged||0,completedChanged:base.completedChanged||0,
      kmBefore:known?Math.round(kmBefore):null,kmAfter:known?Math.round(kmAfter):null,kmDelta:known?Math.round(kmAfter-kmBefore):null,minutesDelta:known?Math.round(minAfter-minBefore):null,changedDays:[...changedDays.values()].reduce((n,d)=>n+d.length,0)},
    overnight,blocking:base.blocking,warnings:base.warnings,notes:base.notes||[],
    payload:base.payload||null
  };
  if(base.keepRows)keepLines(ctx,simulation,base.keepRows);
  simulation.canApply=!simulation.blocking.length&&!!simulation.payload&&(simulation.totals.changedDays>0||(base.payload&&base.payload.ops&&base.payload.ops.some(op=>op.kind==='pin')));
  if(!simulation.blocking.length&&!simulation.canApply)simulation.notes.push('Rien à changer : le planning respecte déjà cette demande.');
  simulation.payloadSignature=fnv(stableStringify(simulation.payload));
  return simulation;
}
/* Contrôles finaux d'un planning candidat, semaine par semaine : rendez-vous, verrous,
   visites réalisées et jours passés inchangés ; capacité ; horaires ; unicité ; contraintes. */
function candidateIssues(ctx,intent,weekKey,before,after,frozenUntil,changedOnly,options){
  const out=[],max=maxCredits(ctx),hours=ctx.hours;
  const c=intent.constraints,forbidden=new Set(),forbiddenDays=new Set();
  for(const row of c.forbidden){if(!row.stores.length)forbiddenDays.add(row.date);for(const ref of row.stores)forbidden.add(ref.id+'|'+row.date)}
  const seen=new Set();
  for(const day of DAYS){
    const date=dateOfDay(weekKey,day),b=(before[day]||[]).map(s=>String(s.id)),a=(after[day]||[]).map(s=>String(s.id));
    for(const id of a){if(seen.has(id))out.push({code:'duplicate',message:'Doublon dans la semaine du '+label(weekKey)+'.'});seen.add(id)}
    if(date<frozenUntil){
      /* Recalcul V181 : une visite ratée (non réalisée) quitte sa journée passée pour être
         replacée, c'est la règle du propriétaire. Aucun ajout dans le passé, aucune visite
         réalisée retirée. Ailleurs, une journée passée reste strictement identique. */
      const missedOnly=options&&options.missedMayLeave&&a.every(id=>b.includes(id))&&b.filter(id=>!a.includes(id)).every(id=>!completedDates(ctx,id).includes(date))&&b.filter(id=>a.includes(id)).join(',')===a.join(',');
      if(b.join(',')!==a.join(',')&&!missedOnly)out.push({code:'past_changed',message:'Une journée passée ou hors période serait modifiée ('+DAYS_LABEL(date)+').'});continue}
    if(changedOnly&&b.join(',')===a.join(','))continue;
    if(routeCredits(ctx,after[day])>max)out.push({code:'capacity',message:DAYS_LABEL(date)+' : '+routeCredits(ctx,after[day])+' crédits pour un maximum de '+max+'.'});
    for(const id of a){
      if(forbidden.has(id+'|'+date))out.push({code:'forbidden_kept',message:storeLabel(storeById(ctx,id)||{})+' resterait '+DAYS_LABEL(date)+'.'});
      if(forbiddenDays.has(date)&&!b.includes(id))out.push({code:'forbidden_day',message:DAYS_LABEL(date)+' devait rester sans nouvelle visite.'});
    }
    if(a.length&&hours&&typeof hours.scheduleRoute==='function'){
      try{
        const sb=b.length?hours.scheduleRoute(before[day],day,ctx.state,{weekMonday:new Date(weekKey+'T12:00:00')}):null,sa=hours.scheduleRoute(after[day],day,ctx.state,{weekMonday:new Date(weekKey+'T12:00:00')});
        const issue=ctx.manual&&typeof ctx.manual.scheduleIssue==='function'?ctx.manual.scheduleIssue(sb,sa):null;
        if(issue)out.push({code:'hours_'+issue.code,message:DAYS_LABEL(date)+' : '+issue.reason});
      }catch(e){}
    }
  }
  /* Rendez-vous et verrous de la semaine : présents avant ⇒ présents au même jour après. */
  const moved=(id,date)=>{const day=dayNameOf(date),bIn=(before[day]||[]).some(s=>String(s.id)===id),aIn=(after[day]||[]).some(s=>String(s.id)===id);return bIn&&!aIn};
  let appointments=0,locks=0;
  for(const a of ctx.state.appointments||[]){const date=String(a&&a.date||'').slice(0,10);if(!validDate(date)||mondayOf(date)!==weekKey||date<ctx.today)continue;if(moved(String(a.storeId),date)){appointments++;out.push({code:'appointment_changed',message:'Le rendez-vous du '+DAYS_LABEL(date)+' chez '+storeLabel(storeById(ctx,a.storeId)||{})+' serait déplacé.'})}}
  for(const day of DAYS){const date=dateOfDay(weekKey,day);if(date<ctx.today)continue;for(const s of before[day]||[]){const id=String(s.id);if(lockDay(ctx,id,weekKey)===day&&moved(id,date)){locks++;out.push({code:'lock_changed',message:storeLabel(storeById(ctx,id)||s)+' est verrouillé le '+DAYS_LABEL(date)+' et serait déplacé.'})}}}
  return{issues:out,appointments,locks};
}

function simulatePlan(ctx,intent){
  const blocking=[],warnings=[],notes=[],T=ctx.terrain,c=intent.constraints;
  if(!T||typeof T.simulateCommandWindow!=='function')return{weeks:[],blocking:[{code:'owner_missing',message:'Le moteur de planning n’est pas encore chargé.'}],warnings};
  const scope=intent.scope,exactRows=[],keepRows=[];
  for(const row of c.exactDays)for(const ref of row.stores){exactRows.push({id:ref.id,date:row.date});for(const x of dayRuleIssues(ctx,ref.id,row.date,'exact'))blocking.push(x)}
  for(const row of c.keepDays)for(const ref of row.stores){keepRows.push({id:ref.id,date:row.date});for(const x of dayRuleIssues(ctx,ref.id,row.date,'keep'))blocking.push(x)}
  for(const row of c.windowDays)for(const date of row.dates){const issue=dayIssue(ctx,date);if(issue)blocking.push({code:'day_unavailable',message:DAYS_LABEL(date)+' : '+issue+'.'})}
  for(const row of c.forbidden){
    if(!row.stores.length){for(const a of ctx.state.appointments||[])if(String(a.date||'').slice(0,10)===row.date)blocking.push({code:'appointment_conflict',message:'Rendez-vous le '+DAYS_LABEL(row.date)+' chez '+storeLabel(storeById(ctx,a.storeId)||{})+' : la journée ne peut pas être évitée.'});
      for(const s of ctx.state.stores||[])if(lockDay(ctx,String(s.id),mondayOf(row.date))===dayNameOf(row.date)&&planifiable(ctx,s)==='')blocking.push({code:'lock_conflict',message:storeLabel(s)+' est verrouillé le '+DAYS_LABEL(row.date)+' : la journée ne peut pas être évitée.'})}
    for(const ref of row.stores)for(const x of dayRuleIssues(ctx,ref.id,row.date,'forbid'))if(x.code!=='day_unavailable')blocking.push(x)
  }
  /* Semaines de la période retouchées à la main sans ancre exploitable : intouchables. */
  for(let wk=mondayOf(scope.start);wk<=scope.end;wk=addDays(wk,7)){
    let info=null;try{info=T.manualWeekInfo(wk,ctx.state,ctx.archive)}catch(e){info=null}
    if(info&&!info.adaptive)blocking.push({code:'manual_week',message:'La semaine du '+label(wk)+' a été modifiée à la main : une commande ne la régénère pas. Retouche-la directement ou fais une commande sur une autre période.'});
  }
  /* Visites demandées par les filtres : la garde anti-sur-visite (V263) s'applique — un
     magasin visité trop récemment pour toute la période n'est pas reprogrammé. */
  const required=[];const fixedIds=new Set([...exactRows,...keepRows].map(r=>r.id));
  /* Revue #496 : un P1 à moins de 2 visites depuis l'import a la garde V263 levée (2e passage SEF). Ce passage est
     souhaité, pas imposé : s'il ne tient pas dans la période, c'est un avertissement, jamais un refus de la commande. */
  const secondIds=new Set();
  for(const ref of intent.filters.stores){
    if(fixedIds.has(ref.id))continue;const store=storeById(ctx,ref.id),why=planifiable(ctx,store);
    if(why){warnings.push({code:'target_skipped',message:storeLabel(store||{enseigne:ref.id})+' : '+why+', non programmé.'});continue}
    let notBefore='';for(let d=scope.start;d<=scope.end;d=addDays(d,1)){if(dayIssue(ctx,d))continue;let blocked=false;try{blocked=!!(ctx.needOf&&ctx.needOf(store,d).blocked)}catch(e){blocked=false}if(!blocked){notBefore=d;break}}
    if(!notBefore){notes.push(storeLabel(store)+' : visité récemment, déjà couvert pour toute la période.');continue}
    try{if(ctx.needOf&&ctx.needOf(store,notBefore).secondVisit)secondIds.add(String(ref.id))}catch(e){}
    required.push({storeId:ref.id,from:scope.start,notBefore,dueDate:scope.end,label:'Commande planning'});
  }
  for(const row of c.windowDays)for(const ref of row.stores){
    const store=storeById(ctx,ref.id),why=planifiable(ctx,store);if(why){blocking.push({code:'store_unavailable',message:storeLabel(store||{enseigne:ref.id})+' : '+why+'.'});continue}
    const first=row.dates[0],last=row.dates[row.dates.length-1],fixed=fixedDayFor(ctx,ref.id,mondayOf(first));
    if(fixed&&(fixed.date<first||fixed.date>last))blocking.push({code:fixed.kind==='rdv'?'appointment_conflict':'lock_conflict',message:storeLabel(store)+(fixed.kind==='rdv'?' a un rendez-vous':' est posé ou verrouillé')+' le '+DAYS_LABEL(fixed.date)+' : je ne le déplace pas.'});
    required.push({storeId:ref.id,from:first,notBefore:first,dueDate:last,label:'Semaine autour de '+storeLabel(store),pin:true});
  }
  if(blocking.length)return{weeks:[],blocking:dedupe(blocking),warnings,notes};
  const shownKey=shownWeekKey(ctx);
  let sim;
  try{
    sim=T.simulateCommandWindow({state:ctx.state,archive:ctx.archive,today:ctx.today,start:scope.start,end:scope.end,shownWeekKey:shownKey,shownPlan:ctx.state.plan,
      exactDays:[...exactRows,...keepRows].map(r=>({storeId:r.id,date:r.date})),
      forbidden:c.forbidden.map(row=>({date:row.date,storeIds:row.stores.map(r=>r.id)})),
      requiredVisits:required,spread:c.distribution==='spread'});
  }catch(e){return{weeks:[],blocking:[{code:'engine_refused',message:e.message||String(e)}],warnings,notes}}
  if(!sim.ok)return{weeks:[],blocking:[{code:'engine_refused',message:sim.error}],warnings,notes};
  const built=sim.built;
  for(const row of built.commandVisits||[])if(row.state==='lost'&&secondIds.has(String(row.storeId))){const store=storeById(ctx,row.storeId);warnings.push({code:'second_visit_unplaced',message:storeLabel(store||{enseigne:row.storeId})+' : 2e passage P1 non placé dans la période (garde levée, aucune journée compatible).'})}else if(row.state==='lost'){const store=storeById(ctx,row.storeId);blocking.push({code:'required_unplaced',message:storeLabel(store||{enseigne:row.storeId})+' : '+(String(row.why||'aucune journée compatible').replace(/l’échéance/g,'la fin de la période'))+'.'})}
  /* Post-passes du pipeline 3 semaines, sur copie : V185 (repli géographique sans passe
     cross-day) puis V251 (ordre intra-journée). Une passe qui défait une contrainte de la
     commande est annulée pour sa semaine, comme pour une échéance du brief. */
  const crossDay=!!(built.crossDay&&built.crossDay.applied),placedOn=new Map(),pinned=new Set(required.filter(r=>r.pin).map(r=>r.storeId));
  /* Figés pour V185 : jours exigés/conservés, fenêtres de jours et échéances du brief. Une visite
     demandée sur toute la période reste libre pour la géographie (contrôlée ensuite). */
  for(const row of built.commandVisits||[])if(row.date&&pinned.has(row.storeId))placedOn.set(row.storeId,row.date);
  for(const r of [...exactRows,...keepRows])placedOn.set(r.id,r.date);
  for(const d of built.deadlines||[])if(d.date)placedOn.set(String(d.storeId),d.date);
  const weeks=[],frozenUntil=scope.start>ctx.today?scope.start:ctx.today;
  for(const week of built.weeks){
    const before=weekPlanFrom(ctx,week.weekKey);
    if(week.manual){weeks.push({weekKey:week.weekKey,before,after:before,manual:true});continue}
    let after=week.plan,geo=false,route=false;
    if(!crossDay&&ctx.geo&&typeof ctx.geo.rebalance==='function'){
      const fixedVisits={};for(const [id,date] of placedOn)if(mondayOf(date)===week.weekKey)fixedVisits[id]=dayNameOf(date);
      try{const g=ctx.geo.rebalance(week.plan,Object.assign({weekKey:week.weekKey,preferNearFirst:true,frozenDays:week.frozenDays},Object.keys(fixedVisits).length?{fixedVisits}:{}));
        if(g&&g.ok&&g.changed&&!candidateIssues(ctx,intent,week.weekKey,before,g.plan,frozenUntil,false).issues.some(x=>/^(forbidden|capacity|past_changed|duplicate|appointment|lock)/.test(x.code))){after=g.plan;geo=true}}catch(e){}
    }
    let info=null;try{info=T.manualWeekInfo(week.weekKey,ctx.state,ctx.archive)}catch(e){}
    if(ctx.route&&typeof ctx.route.optimizePlan==='function'&&!(info&&info.adaptive)){
      try{const r=ctx.route.optimizePlan(after,week.weekKey,ctx.state,{frozenDays:week.frozenDays});if(r&&r.changed){after=r.plan;route=true}}catch(e){}
    }
    weeks.push({weekKey:week.weekKey,before,after,frozenDays:week.frozenDays||[],geo,route});
  }
  /* Contrôles finaux. */
  let appointmentsChanged=0,locksChanged=0;
  for(const w of weeks){if(w.manual)continue;const r=candidateIssues(ctx,intent,w.weekKey,w.before,w.after,frozenUntil,true);appointmentsChanged+=r.appointments;locksChanged+=r.locks;for(const x of r.issues)blocking.push(x)}
  for(const r of [...exactRows,...keepRows]){const w=weeks.find(x=>x.weekKey===mondayOf(r.date));if(!w||!(w.after[dayNameOf(r.date)]||[]).some(s=>String(s.id)===r.id))blocking.push({code:'required_unplaced',message:storeLabel(storeById(ctx,r.id)||{})+' n’a pas pu être placé le '+DAYS_LABEL(r.date)+'.'})}
  for(const row of c.windowDays)for(const ref of row.stores){const ok=weeks.some(w=>DAYS.some(day=>{const d=dateOfDay(w.weekKey,day);return d>=row.dates[0]&&d<=row.dates[row.dates.length-1]&&(w.after[day]||[]).some(s=>String(s.id)===ref.id)}));if(!ok)blocking.push({code:'required_unplaced',message:storeLabel(storeById(ctx,ref.id)||{})+' n’a pas pu être placé '+row.dates.map(DAYS_LABEL).join(' ou ')+'.'})}
  /* Visites demandées : toujours présentes dans leur fenêtre après les passes géographiques. */
  const targetIds=required.map(r=>r.storeId);let placedTargets=0;
  for(const req of required){const ok=weeks.some(w=>DAYS.some(day=>{const d=dateOfDay(w.weekKey,day);return d>=req.from&&d<=req.dueDate&&(w.after[day]||[]).some(s=>String(s.id)===req.storeId)}));if(ok)placedTargets++;else if(secondIds.has(String(req.storeId))){if(!(built.commandVisits||[]).some(row=>row.storeId===req.storeId&&row.state==='lost'))warnings.push({code:'second_visit_unplaced',message:storeLabel(storeById(ctx,req.storeId)||{})+' : 2e passage P1 non placé dans la période.'})}else if(!(built.commandVisits||[]).some(row=>row.storeId===req.storeId&&row.state==='lost'))blocking.push({code:'required_unplaced',message:storeLabel(storeById(ctx,req.storeId)||{})+' n’est plus dans la période après optimisation.'})}
  if(built.coverage&&built.coverage.uncoveredLate&&built.coverage.uncoveredLate.length)warnings.push({code:'coverage',message:built.coverage.uncoveredLate.length+' magasin(s) en retard restent hors de la période faute de capacité.'});
  for(const r of keepRows){const w=weeks.find(x=>x.weekKey===mondayOf(r.date)),was=w&&(w.before[dayNameOf(r.date)]||[]).some(s=>String(s.id)===r.id);if(w&&!was)warnings.push({code:'keep_moved',message:storeLabel(storeById(ctx,r.id)||{})+' n’était pas prévu le '+DAYS_LABEL(r.date)+' : il y sera placé.'})}
  const at='planning-command-v1';
  const payload={type:'bundle',realToday:ctx.today,shownWeekKey:shownKey,weeks:weeks.filter(w=>!w.manual).map(w=>({weekKey:w.weekKey,plan:planIds(w.after),frozenDays:w.frozenDays,crossDay,route:w.route,geo:w.geo})),generator:at};
  return{weeks,blocking:dedupe(blocking),warnings:dedupe(warnings),notes,payload,requested:targetIds.length+notes.filter(x=>/déjà couvert/.test(x)).length,placedTargets,coveredTargets:notes.filter(x=>/déjà couvert/.test(x)).length,keepRows:keepRows.filter(r=>weeks.some(w=>w.weekKey===mondayOf(r.date)&&(w.before[dayNameOf(r.date)]||[]).some(s=>String(s.id)===r.id))),appointmentsChanged,locksChanged,built};
}
function dedupe(list){const seen=new Set();return list.filter(x=>{const k=x.code+'|'+x.message;if(seen.has(k))return false;seen.add(k);return true})}

function simulatePlace(ctx,intent){
  const blocking=[],warnings=[],notes=[],M=ctx.manual,c=intent.constraints;
  if(!M||typeof M.addToPlan!=='function')return{weeks:[],blocking:[{code:'owner_missing',message:'Le module de planning manuel n’est pas chargé.'}],warnings};
  const weekKey=mondayOf(intent.scope.start),before=weekPlanFrom(ctx,weekKey),sim=copy(ctx.state);
  sim.plan=copy(before);sim.settings=Object.assign({},sim.settings,{weekDate:weekKey});
  const ops=[],keepRows=[];
  const rows=[...c.exactDays.map(r=>({kind:'add',r})),...c.keepDays.map(r=>({kind:'keep',r}))];
  for(const {kind,r} of rows)for(const ref of r.stores){
    for(const x of dayRuleIssues(ctx,ref.id,r.date,kind==='add'?'exact':'keep'))blocking.push(x);
    const store=storeById(ctx,ref.id),day=dayNameOf(r.date),current=M.plannedDay(sim,ref.id);
    if(current&&dateOfDay(weekKey,current)<ctx.today&&current!==day)blocking.push({code:'past_visit',message:storeLabel(store||{})+' était prévu '+DAYS_LABEL(dateOfDay(weekKey,current))+' (journée passée) : il ne se déplace pas.'});
    let need=null;try{need=ctx.needOf&&store?ctx.needOf(store,r.date):null}catch(e){}
    if(need&&need.blocked)warnings.push({code:'recently_visited',message:storeLabel(store)+' a été visité récemment ('+(need.label||'à jour')+') : placé quand même, à ta demande.'});
    if(kind==='keep'&&current===day){keepRows.push({id:ref.id,date:r.date});ops.push({kind:'pin',storeId:ref.id,day});continue}
    if(kind==='keep')warnings.push({code:'keep_moved',message:storeLabel(store||{})+' n’était pas prévu le '+DAYS_LABEL(r.date)+' : il y sera placé.'});
    const res=M.addToPlan(sim,ref.id,day);
    if(!res||!res.ok){blocking.push({code:'store_unavailable',message:storeLabel(store||{enseigne:ref.id})+' : '+((res&&res.error)||'indisponible')+'.'});continue}
    if(res.already){notes.push(storeLabel(store)+' est déjà prévu le '+DAYS_LABEL(r.date)+'.');if(!lockDay(ctx,ref.id,weekKey))ops.push({kind:'pin',storeId:ref.id,day});keepRows.push({id:ref.id,date:r.date});continue}
    ops.push({kind:'add',storeId:ref.id,day});
  }
  if(blocking.length)return{weeks:[],blocking:dedupe(blocking),warnings,notes};
  const r=candidateIssues(ctx,intent,weekKey,before,sim.plan,ctx.today,true);
  for(const x of r.issues)blocking.push(x);
  if(weekKey!==shownWeekKey(ctx))notes.push('La semaine du '+label(weekKey)+' s’ouvrira à l’application.');
  const payload={type:'manual',weekKey,ops,expected:planIds(sim.plan)};
  return{weeks:[{weekKey,before,after:sim.plan}],blocking:dedupe(blocking),warnings:dedupe(warnings),notes,payload,keepRows,appointmentsChanged:r.appointments,locksChanged:r.locks};
}

function simulateRecalc(ctx,intent){
  const cascade=ctx.cascade;
  if(!cascade||typeof cascade.build!=='function'||typeof cascade.applyResult!=='function')return{weeks:[],blocking:[{code:'owner_missing',message:'Le recalcul n’est pas encore chargé.'}],warnings:[]};
  const weekKey=mondayOf(ctx.today);
  if(shownWeekKey(ctx)!==weekKey)return{weeks:[],blocking:[{code:'not_current_week',message:'Le planning affiché n’est pas la semaine en cours : ouvre la semaine du '+label(weekKey)+' puis relance la commande.',action:{kind:'open_date',date:ctx.today}}],warnings:[]};
  let result;try{result=cascade.build({readControls:false})}catch(e){result={ok:false,error:e.message}}
  if(!result||!result.ok)return{weeks:[],blocking:[{code:'engine_refused',message:(result&&result.error)||'Recalcul impossible.'}],warnings:[]};
  const before=ctx.state.plan||emptyPlan();
  if(result.unchanged)return{weeks:[{weekKey,before,after:before}],blocking:[],warnings:[],notes:['Le reste de la semaine est déjà stable : aucun déplacement nécessaire.'],payload:null};
  const outside=(result.changedWeekKeys||[]).filter(k=>k!==weekKey);
  const blocking=outside.length?[{code:'spill',message:'Le recalcul déborderait sur la semaine du '+outside.map(label).join(', ')+' : « seulement le reste de ma semaine » ne peut pas être respecté. Utilise « Recalculer le reste du planning » dans Réglages pour accepter ce report.'}]:[];
  const after=(result.weeks&&result.weeks[weekKey])||before;
  const r=candidateIssues(ctx,intent,weekKey,before,after,ctx.today,true,{missedMayLeave:true});
  for(const x of r.issues)if(!/^capacity$/.test(x.code)||!(result.overCapacityKept||[]).length)blocking.push(x);
  const payload={type:'cascade',weekKey,signature:fnv(stableStringify({plan:planIds(result.plan),weeks:Object.fromEntries(Object.entries(result.weeks||{}).map(([k,p])=>[k,planIds(p)])),changed:result.changedWeekKeys}))};
  return{weeks:[{weekKey,before,after}],blocking:dedupe(blocking),warnings:[],notes:(result.previewLines||[]).slice(0,4),payload,appointmentsChanged:r.appointments,locksChanged:r.locks};
}

/* simulate(intention résolue, ctx) — aucune écriture : seuls des propriétaires purs (ou
   appelés sur copie) sont sollicités. Le résultat est déterministe pour des données, une
   date et une intention identiques. */
function simulate(intent,ctx){
  const checked=validate(intent,{stage:'resolved',today:ctx.today});
  const base=checked.action==='plan_visits'?simulatePlan(ctx,checked):checked.action==='place_stores'?simulatePlace(ctx,checked):simulateRecalc(ctx,checked);
  return finishSimulation(ctx,checked,base);
}

/* ------------------------------------------------------------------ E. aperçu lisible */
function signed(n,unit){return (n>0?'+':n<0?'−':'±')+Math.abs(n)+' '+unit}
function preview(simulation,ctx){
  const s=simulation,t=s.totals,lines=[];
  const days=s.days.map(d=>({title:d.day+' '+label(d.date),lines:d.lines.map(l=>({type:l.type,text:(l.type==='→'?'→ ':l.type+' ')+l.label+(l.type==='→'?' (depuis '+DAYS_LABEL(l.from)+')':l.type==='='?' conservé':'')}))}));
  if(t.requested)lines.push(t.requested+' magasin'+(t.requested>1?'s':'')+' demandé'+(t.requested>1?'s':'')+' · '+t.placedTargets+' placé'+(t.placedTargets>1?'s':'')+(t.coveredTargets?' · '+t.coveredTargets+' déjà couvert'+(t.coveredTargets>1?'s':''):''));
  if(t.moved)lines.push(t.moved+' magasin'+(t.moved>1?'s':'')+' déplacé'+(t.moved>1?'s':''));
  if(t.added)lines.push(t.added+' visite'+(t.added>1?'s':'')+' ajoutée'+(t.added>1?'s':''));
  if(t.removed)lines.push(t.removed+' visite'+(t.removed>1?'s':'')+' retirée'+(t.removed>1?'s':''));
  lines.push(t.appointmentsChanged+' rendez-vous modifié');
  if(t.kmDelta!=null&&t.changedDays)lines.push(t.kmBefore?signed(t.kmDelta,'km estimés')+(t.minutesDelta?' · '+signed(t.minutesDelta,'min de route'):''):'~'+t.kmAfter+' km estimés sur les journées planifiées');
  const nights=s.overnight.filter(o=>o.changed||o.after).map(o=>o.after?'🌙 Découché '+o.after.fromDay.toLowerCase()+' → '+o.after.toDay.toLowerCase()+' (~'+o.after.saving+' km évités)'+(o.changed?'':' inchangé'):'🏠 Découché '+(o.before?o.before.fromDay.toLowerCase()+' → '+o.before.toDay.toLowerCase()+' ':'')+'plus utile');
  return{
    title:'Voilà ce que Store Runner va faire',
    period:s.scope.start===s.scope.end?label(s.scope.start):'Du '+label(s.scope.start)+' au '+label(s.scope.end),
    days,summary:lines,overnight:nights,
    blocking:s.blocking.map(b=>b.message),warnings:s.warnings.map(w=>w.message),notes:s.notes.slice(),
    canApply:!!s.canApply,applyLabel:'Appliquer',cancelLabel:'Annuler',
    action:(s.blocking.find(b=>b.action)||{}).action||null
  };
}

/* ------------------------------------------------------------------ F. application */
function verifyAppliedPlans(ctx,payload){
  const mismatches=[],archive=JSON.parse(ctx.db.getItem(ARCHIVE_KEY)||'{}')||{},shown=shownWeekKey(ctx);
  const check=(weekKey,expected)=>{
    const actual=planIds(weekKey===shown?ctx.state.plan:(archive[weekKey]&&archive[weekKey].plan));
    for(const day of DAYS)if((actual[day]||[]).join(',')!==(expected[day]||[]).join(','))mismatches.push(weekKey+' '+day);
    if(weekKey===shown){const stored=planIds(archive[weekKey]&&archive[weekKey].plan);if(archive[weekKey]&&DAYS.some(d=>(stored[d]||[]).join(',')!==(expected[d]||[]).join(',')))mismatches.push(weekKey+' archive')}
  };
  if(payload.type==='bundle')for(const w of payload.weeks)check(w.weekKey,w.plan);
  if(payload.type==='manual')check(payload.weekKey,payload.expected);
  if(payload.type==='cascade')check(payload.weekKey,payload.expectedPlan||{});
  return mismatches;
}
function journal(ctx,entry){
  try{
    const db=ctx.db;if(!db)return false;
    let rows=[];try{rows=JSON.parse(db.getItem(JOURNAL_KEY)||'[]');if(!Array.isArray(rows))rows=[]}catch(e){rows=[]}
    rows.unshift(entry);db.setItem(JOURNAL_KEY,JSON.stringify(rows.slice(0,JOURNAL_MAX)));return true;
  }catch(e){return false}
}
function readJournal(db){try{const rows=JSON.parse((db&&db.getItem(JOURNAL_KEY))||'[]');return Array.isArray(rows)?rows:[]}catch(e){return[]}}
async function flush(ctx){try{if(ctx.db&&typeof ctx.db.flush==='function')await ctx.db.flush()}catch(e){}}

/* apply(simulation, ctx, meta) — n'écrit qu'après : aperçu applicable, non altéré, encore
   à jour (mêmes données, même date, moins de 10 min) ; puis relit le résultat. Tout échec
   restaure exactement l'état d'avant (ChefReliability) : jamais de demi-planning. */
async function apply(simulation,ctx,meta){
  const s=simulation;
  const refuse=(code,error)=>{journal(ctx,{at:new Date(ctx.nowMs||Date.now()).toISOString(),text:meta&&meta.text||'',action:s&&s.action,outcome:'refused',code,error});return{ok:false,code,error}};
  if(!s||!s.canApply||!s.payload||(s.blocking&&s.blocking.length))return refuse('not_applicable','Cet aperçu n’est pas applicable : rien n’a été modifié.');
  if(fnv(stableStringify(s.payload))!==s.payloadSignature||fnv(stableStringify(s.intent))!==s.intentSignature)return refuse('tampered','L’aperçu a été modifié : relance la commande.');
  if(meta&&Number.isFinite(meta.createdAt)&&Number.isFinite(ctx.nowMs)&&ctx.nowMs-meta.createdAt>PREVIEW_TTL_MS)return refuse('expired','Aperçu de plus de 10 minutes : relance la commande pour repartir de ta situation actuelle.');
  if(ctx.today!==s.today)return refuse('stale','La date a changé depuis l’aperçu : relance la commande.');
  if(sourceFingerprint(ctx)!==s.sourceFingerprint)return refuse('stale','Le planning ou les données ont changé depuis l’aperçu : relance la commande.');
  const R=ctx.reliability;
  if(!R||typeof R.capture!=='function'||typeof R.persist!=='function')return refuse('unavailable','La protection des données est indisponible : rien n’a été modifié.');
  const before=R.capture(ctx.state,ctx.db);
  const restore=async error=>{
    let restored=true;
    try{R.persist(before,ctx.db);await flush(ctx);ctx.setState(copy(before.state))}catch(e){restored=false}
    ctx.render();ctx.emit({reason:'planning-command-rollback',source:'planning-command-v1'});
    journal(ctx,{at:new Date(ctx.nowMs||Date.now()).toISOString(),text:meta&&meta.text||'',action:s.action,intent:s.intent,outcome:restored?'rolled-back':'rollback-failed',error});
    return{ok:false,code:restored?'rolled_back':'rollback_failed',error:(restored?'Application annulée, planning d’avant restauré : ':'Application interrompue, restauration à vérifier dans Données › Sauvegardes : ')+error};
  };
  try{if(typeof R.checkpoint==='function')R.checkpoint('Avant commande planning',ctx.db,before)}catch(e){}
  try{
    const p=s.payload;
    if(p.type==='bundle'){
      const bundle=R.capture(ctx.state,ctx.db),at=new Date(ctx.nowMs||Date.now()).toISOString(),T=ctx.terrain;
      for(const w of p.weeks){
        const plan=Object.fromEntries(DAYS.map(day=>[day,(w.plan[day]||[]).map(id=>storeById(ctx,id)).filter(Boolean)]));
        if(DAYS.some(day=>plan[day].length!==(w.plan[day]||[]).length))throw new Error('Un magasin de l’aperçu n’existe plus.');
        const entry=T.generatedArchiveEntry({weekKey:w.weekKey,plan,frozenDays:w.frozenDays},{crossDay:{applied:!!w.crossDay}},bundle.state,bundle.archive,at,p.realToday);
        if(w.route)entry.routeOptimized='v251';if(w.geo)entry.geographyOptimized='v185';
        entry.planningCommand={at,signature:s.intentSignature};
        bundle.archive[w.weekKey]=entry;
        if(w.weekKey===p.shownWeekKey)bundle.state.plan=Object.fromEntries(DAYS.map(day=>[day,plan[day].slice()]));
      }
      R.persist(bundle,ctx.db);await flush(ctx);ctx.setState(bundle.state);
    }else if(p.type==='manual'){
      if(p.weekKey!==shownWeekKey(ctx)){
        if(!ctx.slider||typeof ctx.slider.openDate!=='function'||!ctx.slider.openDate(dateOfDay(p.weekKey,(p.ops[0]&&p.ops[0].day)||'Lundi')))throw new Error('Impossible d’ouvrir la semaine du '+label(p.weekKey)+'.');
        ctx.refresh();
      }
      for(const op of p.ops){
        if(op.kind==='add'){const res=await ctx.manual.addStore(ctx.win,op.storeId,op.day);if(!res||!res.ok)throw new Error((res&&res.error)||'Placement refusé par le planning manuel.')}
        else if(op.kind==='pin'){if(typeof ctx.pin!=='function'||!ctx.pin(op.storeId,op.day))throw new Error('Pose impossible pour un magasin conservé.')}
        ctx.refresh();
      }
      await flush(ctx);
    }else if(p.type==='cascade'){
      const result=ctx.cascade.build({readControls:false});
      const signature=result&&result.ok?fnv(stableStringify({plan:planIds(result.plan),weeks:Object.fromEntries(Object.entries(result.weeks||{}).map(([k,v])=>[k,planIds(v)])),changed:result.changedWeekKeys})):'';
      if(signature!==p.signature)throw new Error('Le recalcul ne donne plus le résultat de l’aperçu.');
      p.expectedPlan=planIds(result.plan);
      if(!await ctx.cascade.applyResult(result))throw new Error('Le recalcul a été refusé à l’application.');
      ctx.refresh();await flush(ctx);
    }else throw new Error('Type d’application inconnu.');
    ctx.refresh();
    const mismatches=verifyAppliedPlans(ctx,p);
    if(mismatches.length)return await restore('le planning obtenu diffère de l’aperçu ('+mismatches.slice(0,3).join(', ')+').');
  }catch(e){return await restore(e&&e.message?e.message:String(e))}
  ctx.render();ctx.emit({reason:'planning-command',source:'planning-command-v1',action:s.action});
  journal(ctx,{at:new Date(ctx.nowMs||Date.now()).toISOString(),text:meta&&meta.text||'',action:s.action,intent:s.intent,outcome:'applied',totals:s.totals});
  return{ok:true,firstDate:(s.days[0]&&s.days[0].date)||s.scope.start};
}

/* ------------------------------------------------------------------ contexte runtime */
function runtimeContext(now){
  const win=root,state=win.state,db=win.__chefStorage||win.localStorage,T=win.StoreRunnerTerrainPlanningV1,coverage=win.StoreRunnerVisitCoverage;
  const date=now instanceof Date?now:new Date(),today=localToday(date);
  let archive={};try{archive=JSON.parse(db.getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){archive={}}
  let needOf=null,visitDays=null;try{needOf=coverage&&coverage.needOf(state,{today})}catch(e){}try{visitDays=coverage&&coverage.visitDays(state)}catch(e){}
  const recalc=win.storeRunnerRecalculateRemainingWeek;
  const ctx={
    win,state,db,archive,today,nowMs:date.getTime(),keys:win.ChefReliability&&win.ChefReliability.keys||{},
    terrain:T,coverage,needOf,visitDays,manual:win.StoreRunnerManualPlanning,geo:win.StoreRunnerGeographyV185,route:win.StoreRunnerRouteOptimizerV251,
    overnight:win.StoreRunnerOvernightV182,hours:win.StoreOpeningHoursV1,reliability:win.ChefReliability,slider:win.StoreRunnerPeriodDaySlider,profile:win.StoreRunnerProfile,
    cascade:recalc&&typeof recalc.build==='function'?{build:recalc.build,applyResult:recalc.applyResult}:null,
    pin:typeof win.storeRunnerPinPlannedStore==='function'?win.storeRunnerPinPlannedStore:null,
    lockDayForWeek:typeof win.storeRunnerLockDayForWeek==='function'?win.storeRunnerLockDayForWeek:null,
    credit:typeof win.storeVisitCredit==='function'?win.storeVisitCredit:null,
    priorityOf:needOf?store=>{try{return needOf(store,today).priority||''}catch(e){return''}}:null,
    setState(next){win.state=next;ctx.state=next},
    refresh(){ctx.state=win.state;try{ctx.archive=JSON.parse(db.getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){ctx.archive={}}},
    render(){try{if(typeof win.initControls==='function')win.initControls()}catch(e){}try{if(typeof win.renderAll==='function')win.renderAll()}catch(e){}},
    emit(detail){try{win.document.dispatchEvent(new win.CustomEvent('store-runner:planning-updated',{detail}))}catch(e){}try{if(detail&&detail.reason==='planning-command')win.document.dispatchEvent(new win.CustomEvent('store-runner:planning-command-applied',{detail}))}catch(e){}}
  };
  return ctx;
}
function parseContext(ctx){
  let start=ctx.today;
  try{const d=ctx.terrain.resolveSnailStart(ctx.state,null,new Date(ctx.today+'T12:00:00')),m=localToday(d);start=m>ctx.today?m:ctx.today}catch(e){}
  return{today:ctx.today,startDate:start,brands:[...new Set((ctx.state.stores||[]).map(s=>s&&s.enseigne).filter(Boolean))]};
}
function distanceKm(a,b){const R=6371,toRad=x=>Number(x)*Math.PI/180,dLat=toRad(b.lat-a.lat),dLon=toRad(b.lon-a.lon),h=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(h))}

/* run(texte, ctx, options) — enchaîne A → E pour l'interface. Rend une « session » : rien
   n'est écrit, quelle que soit l'issue. options = {selections, originDecision}. */
async function run(text,ctx,options){
  const opts=options||{},pctx=parseContext(ctx),parsed=parse(text,pctx);
  if(!parsed)return{status:'ignored'};
  if(parsed.kind==='info')return{status:'info',message:parsed.message};
  if(parsed.kind==='unsupported')return{status:'unsupported',message:parsed.message+' '+HELP};
  if(parsed.kind==='clarify')return{status:'clarify',message:parsed.question,choices:parsed.choices};
  const resolved=resolve(parsed.intent,{stores:ctx.state.stores||[],selections:opts.selections,priorityOf:ctx.priorityOf,today:ctx.today});
  if(resolved.kind==='clarify')return{status:'clarify',message:resolved.question,choices:resolved.choices,intent:parsed.intent};
  const intent=resolved.intent;
  /* r38 : une programmation part d'une position fraîche. Elle est lue sans rien écrire ; si
     elle s'écarte du départ enregistré, l'utilisateur choisit explicitement. */
  let origin=null;
  if(intent.action==='plan_visits'&&opts.originDecision!=='keep_saved'&&ctx.profile&&typeof ctx.profile.resolvePlanningOrigin==='function'){
    origin=await ctx.profile.resolvePlanningOrigin();
    if(!origin||!origin.ok)return{status:'blocked',message:(origin&&origin.error)||'Localisation indisponible.',intent};
    const p=ctx.state.profile||{};
    if(origin.source==='gps'&&Number.isFinite(Number(p.baseLat))&&Number.isFinite(Number(p.baseLon))){
      const km=distanceKm({lat:Number(p.baseLat),lon:Number(p.baseLon)},origin);
      if(km>ORIGIN_TOLERANCE_KM)return{status:'origin',message:'Tu es à environ '+Math.round(km)+' km de ton point de départ enregistré « '+(p.baseName||p.baseAddress||'Départ')+' ». D’où partent tes tournées pour cette programmation ?',origin,intent,
        choices:[{label:'Partir de ma position actuelle',originDecision:'use_current'},{label:'Garder mon départ enregistré',originDecision:'keep_saved'}]};
    }
  }
  const simulation=simulate(intent,ctx);
  return{status:'preview',intent,simulation,preview:preview(simulation,ctx),createdAt:ctx.nowMs,origin:origin&&origin.source==='saved_base'?origin.message:''};
}

return{
  VERSION,ACTIONS,JOURNAL_KEY,PREVIEW_TTL_MS,
  parse,validate,acceptModelIntent,resolve,simulate,preview,apply,run,
  runtimeContext,parseContext,readJournal,
  sourceFingerprint,stableStringify,
  dates:{mondayOf,sundayOf,addDays,dayNameOf,isoWeekMonday,isoWeekNumber,localToday}
};
});

/* ------------------------------------------------------------------ interface mobile
   Feuille « Voilà ce que Store Runner va faire » : aperçu lisible jour par jour, questions de
   clarification, choix du point de départ (r38), puis [Annuler] / [Appliquer]. Cette partie ne
   calcule et n'écrit rien elle-même : elle appelle run() (aucune écriture) puis apply() après le
   geste explicite « Appliquer ». Tout texte affiché passe par textContent : une désignation de
   magasin ou une phrase utilisateur n'est jamais interprétée comme du HTML.
   Point d'entrée : window.storeRunnerPlanningCommand(texte), appelé par l'assistant avant ses
   réponses locales ou en ligne ; false pour toute phrase qui n'est pas une commande planning.
   Même fichier que le moteur : une seule ressource au démarrage (budget V234 du chargement). */
(function(root){
'use strict';
if(!root||!root.document)return;
const SHEET_ID='srCommandSheet',STYLE_ID='srCommandStyle';
let current=null,busy=false;

function engine(){return root.StoreRunnerPlanningCommandEngine||null}
function el(tag,cls,text){const node=root.document.createElement(tag);if(cls)node.className=cls;if(text!=null)node.textContent=String(text);return node}
function bot(text){try{if(typeof root.assistantBot==='function')root.assistantBot(text)}catch(e){}}
function toast(text){try{if(typeof root.storeRunnerToast==='function')root.storeRunnerToast(text)}catch(e){}}

function ensureStyle(){
  if(root.document.getElementById(STYLE_ID))return;
  const s=el('style');s.id=STYLE_ID;
  s.textContent='#'+SHEET_ID+'{border:0;padding:0;margin:auto auto 0;width:100%;max-width:560px;max-height:88vh;max-height:88dvh;border-radius:20px 20px 0 0;background:#fff;color:#1d2939;box-shadow:0 -12px 40px rgba(16,24,40,.22);overflow:hidden;box-sizing:border-box}'
    +'#'+SHEET_ID+'[open]{display:flex;flex-direction:column}#'+SHEET_ID+'::backdrop{background:rgba(16,24,40,.45)}'
    +'@media(min-width:700px){#'+SHEET_ID+'{margin:auto;border-radius:20px}}'
    +'#'+SHEET_ID+' .srCmdHead{padding:16px 16px 8px;border-bottom:1px solid #eef1f5}'
    +'#'+SHEET_ID+' .srCmdTitle{display:block;font-size:16px;font-weight:850;line-height:1.3}'
    +'#'+SHEET_ID+' .srCmdPeriod{display:block;margin-top:2px;font-size:12.5px;color:#667085}'
    +'#'+SHEET_ID+' .srCmdAsk{margin:6px 0 0;font-size:12.5px;color:#475467;font-style:italic;overflow-wrap:anywhere}'
    +'#'+SHEET_ID+' .srCmdBody{padding:10px 16px 6px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:60px}'
    +'#'+SHEET_ID+' .srCmdStatus{font-size:13px;color:#1769d2;padding:6px 0}'
    +'#'+SHEET_ID+' .srCmdDay{margin:0 0 10px;padding:10px 12px;border:1px solid #e4e8ef;border-radius:14px}'
    +'#'+SHEET_ID+' .srCmdDay h4{margin:0 0 4px;font-size:13.5px;font-weight:800}'
    +'#'+SHEET_ID+' .srCmdDay ul,#'+SHEET_ID+' .srCmdList{margin:0;padding:0;list-style:none}'
    +'#'+SHEET_ID+' .srCmdDay li{font-size:13.5px;line-height:1.45;overflow-wrap:anywhere}'
    +'#'+SHEET_ID+' li.srAdd{color:#067647}#'+SHEET_ID+' li.srMove{color:#1769d2}#'+SHEET_ID+' li.srRemove{color:#b42318}#'+SHEET_ID+' li.srKeep{color:#475467}'
    +'#'+SHEET_ID+' .srCmdSummary{margin:4px 0 10px;padding:10px 12px;background:#f8fafc;border-radius:14px;font-size:13px;line-height:1.5}'
    +'#'+SHEET_ID+' .srCmdBox{margin:0 0 10px;padding:10px 12px;border-radius:14px;font-size:12.5px;line-height:1.45;overflow-wrap:anywhere}'
    +'#'+SHEET_ID+' .srCmdBlock{background:#fff4f2;border:1px solid #f1b0a8;color:#8a1c12}'
    +'#'+SHEET_ID+' .srCmdWarn{background:#fffaeb;border:1px solid #fedf89;color:#7a2e0e}'
    +'#'+SHEET_ID+' .srCmdNote{background:#f2f4f7;color:#475467}'
    +'#'+SHEET_ID+' .srCmdChoices{display:grid;gap:8px;margin:6px 0 10px}'
    +'#'+SHEET_ID+' .srCmdChoices button{min-height:44px;text-align:left;white-space:normal;overflow-wrap:anywhere}'
    +'#'+SHEET_ID+' .srCmdActions{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #eef1f5;background:#fff}'
    +'#'+SHEET_ID+' .srCmdActions button{min-height:46px;font-size:15px;margin:0}'
    +'#'+SHEET_ID+' .srCmdActions.single{grid-template-columns:1fr}';
  root.document.head.appendChild(s);
}
function sheet(){
  let d=root.document.getElementById(SHEET_ID);
  if(d)return d;
  ensureStyle();
  d=el('dialog');d.id=SHEET_ID;d.setAttribute('aria-labelledby','srCmdTitle');
  const head=el('div','srCmdHead'),title=el('span','srCmdTitle','Voilà ce que Store Runner va faire');title.id='srCmdTitle';
  head.append(title,el('span','srCmdPeriod'),el('p','srCmdAsk'));
  d.append(head,el('div','srCmdBody'),el('div','srCmdActions'));
  /* Retour Android / Échap : même effet qu'« Annuler ». */
  d.addEventListener('cancel',event=>{event.preventDefault();cancel()});
  root.document.body.appendChild(d);
  return d;
}
function open(){const d=sheet();if(!d.open){try{d.showModal()}catch(e){d.setAttribute('open','')}}return d}
function close(){const d=root.document.getElementById(SHEET_ID);if(d&&d.open){try{d.close()}catch(e){d.removeAttribute('open')}}current=null}
function parts(){const d=open();return{d,period:d.querySelector('.srCmdPeriod'),ask:d.querySelector('.srCmdAsk'),body:d.querySelector('.srCmdBody'),actions:d.querySelector('.srCmdActions')}}
function button(label,cls,onClick){const b=el('button',cls,label);b.type='button';b.addEventListener('click',onClick);return b}

function renderBusy(text,message){
  const p=parts();p.ask.textContent='« '+text+' »';p.period.textContent='';p.body.replaceChildren(el('div','srCmdStatus',message||'Analyse de ta demande…'));
  p.actions.className='srCmdActions single';p.actions.replaceChildren(button('Annuler','secondary',cancel));
}
function renderMessage(text,message,kind){
  const p=parts();p.ask.textContent='« '+text+' »';p.period.textContent='';
  p.body.replaceChildren(el('div','srCmdBox '+(kind==='block'?'srCmdBlock':'srCmdNote'),message));
  p.actions.className='srCmdActions single';p.actions.replaceChildren(button('Fermer','secondary',()=>{close()}));
}
function renderChoices(text,session,options){
  const p=parts();p.ask.textContent='« '+text+' »';p.period.textContent='';
  const box=el('div','srCmdChoices');
  for(const choice of session.choices||[])box.append(button(choice.label,'secondary',()=>{
    if(choice.originDecision==='use_current'){
      /* Choix explicite : le profil publie la position fraîche (r38), puis on relance sans
         nouvelle acquisition. Rien d'autre n'est écrit à ce stade. */
      try{const P=root.StoreRunnerProfile;if(P&&typeof P.applyPlanningOrigin==='function'&&P.applyPlanningOrigin(session.origin)&&typeof root.save==='function')root.save()}catch(e){}
      start(text,Object.assign({},options,{originDecision:'keep_saved'}));return;
    }
    if(choice.originDecision==='keep_saved'){start(text,Object.assign({},options,{originDecision:'keep_saved'}));return}
    if(choice.text){start(choice.text,{});return}
    start(text,Object.assign({},options,{selections:Object.assign({},options&&options.selections,choice.selections||{})}));
  }));
  p.body.replaceChildren(el('p','srCmdStatus',session.message),box);
  p.actions.className='srCmdActions single';p.actions.replaceChildren(button('Annuler','secondary',cancel));
}
function renderPreview(text,session,options){
  const view=session.preview,p=parts();
  p.ask.textContent='« '+text+' »';p.period.textContent=view.period;
  const nodes=[];
  if(session.origin)nodes.push(el('div','srCmdBox srCmdNote',session.origin));
  for(const day of view.days){
    const box=el('section','srCmdDay'),list=el('ul');
    box.append(el('h4',null,day.title));
    for(const line of day.lines)list.append(el('li',line.type==='+'?'srAdd':line.type==='→'?'srMove':line.type==='−'?'srRemove':'srKeep',line.text));
    box.append(list);nodes.push(box);
  }
  if(!view.days.length&&!view.blocking.length)nodes.push(el('div','srCmdBox srCmdNote','Aucun changement de planning.'));
  const summary=el('div','srCmdSummary');for(const line of view.summary.concat(view.overnight))summary.append(el('div',null,line));nodes.push(summary);
  if(view.blocking.length){const b=el('div','srCmdBox srCmdBlock');b.append(el('b',null,'Rien ne sera appliqué :'));for(const m of view.blocking)b.append(el('div',null,'• '+m));nodes.push(b)}
  if(view.warnings.length){const w=el('div','srCmdBox srCmdWarn');for(const m of view.warnings)w.append(el('div',null,'⚠ '+m));nodes.push(w)}
  if(view.notes.length){const n=el('div','srCmdBox srCmdNote');for(const m of view.notes)n.append(el('div',null,m));nodes.push(n)}
  p.body.replaceChildren(...nodes);
  const actions=[button(view.cancelLabel,'secondary',cancel)];
  if(view.action&&view.action.kind==='open_date')actions.push(button('Ouvrir la semaine en cours','primary',()=>{try{root.StoreRunnerPeriodDaySlider.openDate(view.action.date)}catch(e){}start(text,options)}));
  else{const apply=button(view.applyLabel,'primary',()=>applyCurrent());apply.disabled=!view.canApply;apply.dataset.commandApply='1';actions.push(apply)}
  p.actions.className='srCmdActions';p.actions.replaceChildren(...actions);
}

async function start(text,options){
  const E=engine();if(!E)return false;
  busy=true;current={text,options:options||{},session:null};
  renderBusy(text,'Analyse de ta demande…');
  let session;
  try{session=await E.run(text,E.runtimeContext(new Date()),options||{})}
  catch(e){session={status:'blocked',message:'Commande impossible à analyser : '+(e&&e.message?e.message:String(e))}}
  finally{busy=false}
  if(!current||current.text!==text)return true;
  current.session=session;
  if(session.status==='ignored'){close();return false}
  if(session.status==='preview'){
    renderPreview(text,session,options);
    const t=session.simulation.totals;
    bot(session.simulation.canApply?'Aperçu prêt : '+[t.requested?t.placedTargets+'/'+t.requested+' magasins demandés placés':'',t.added?t.added+' ajout'+(t.added>1?'s':''):'',t.moved?t.moved+' déplacement'+(t.moved>1?'s':''):''].filter(Boolean).join(' · ')+'. Rien n’est modifié tant que tu n’as pas appuyé sur « Appliquer ».':'Aperçu sans application possible : '+(session.preview.blocking[0]||session.preview.notes[0]||'rien à changer')+'.');
  }else if(session.status==='clarify'||session.status==='origin'){renderChoices(text,session,options);bot(session.message)}
  else{renderMessage(text,session.message,session.status==='blocked'||session.status==='unsupported'?'block':'note');bot(session.message)}
  return true;
}
async function applyCurrent(){
  const E=engine(),c=current;if(!E||!c||!c.session||busy)return;
  busy=true;const d=root.document.getElementById(SHEET_ID);d&&d.querySelectorAll('.srCmdActions button').forEach(b=>{b.disabled=true});
  let result;
  try{result=await E.apply(c.session.simulation,E.runtimeContext(new Date()),{createdAt:c.session.createdAt,text:c.text})}
  catch(e){result={ok:false,error:e&&e.message?e.message:String(e)}}
  finally{busy=false}
  if(result.ok){
    close();toast('Planning mis à jour ✓');bot('Commande appliquée. Le planning affiche le résultat ; chaque changement reste retouchable à la main.');
    try{const S=root.StoreRunnerPeriodDaySlider;if(S&&typeof S.openDate==='function'&&result.firstDate)S.openDate(result.firstDate)}catch(e){}
    return;
  }
  const p=parts();
  p.body.prepend(el('div','srCmdBox srCmdBlock',result.error||'Application impossible.'));
  p.actions.className='srCmdActions';
  p.actions.replaceChildren(button('Fermer','secondary',()=>close()),button('Relancer l’aperçu','primary',()=>start(c.text,c.options)));
  bot(result.error||'Application impossible : planning conservé.');
}
function cancel(){
  const E=engine(),c=current;
  if(E&&c&&c.session&&c.session.status==='preview'){try{const ctx=E.runtimeContext(new Date());const rows=E.readJournal(ctx.db);rows.unshift({at:new Date().toISOString(),text:c.text,action:c.session.simulation.action,outcome:'cancelled'});ctx.db.setItem(E.JOURNAL_KEY,JSON.stringify(rows.slice(0,30)))}catch(e){}}
  close();
}

/* Appelée par l'assistant : true si la phrase est une commande planning (prise en charge
   ici, y compris une clarification), false sinon (l'assistant historique répond). */
function handleText(text){
  const E=engine();if(!E||!root.state)return false;
  let parsed=null;
  try{parsed=E.parse(text,E.parseContext(E.runtimeContext(new Date())))}catch(e){parsed=null}
  if(!parsed)return false;
  start(text,{});
  return true;
}
root.storeRunnerPlanningCommand=handleText;
root.StoreRunnerPlanningCommandUI={handleText,start,close,applyCurrent,cancel};
})(typeof window!=='undefined'?window:globalThis);
