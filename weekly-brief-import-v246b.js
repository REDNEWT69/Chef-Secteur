/* Store Runner V246B — import PDF local du brief hebdomadaire.
   Le PDF est lu dans le navigateur. Aucun octet du fichier n'est envoyé au Worker IA.
   L'analyse produit uniquement des propositions ambiguës : l'utilisateur doit confirmer
   les règles avant qu'elles puissent affecter une priorité. */
(function(root){
'use strict';

const PDFJS_VERSION='4.10.38';
const PDFJS_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VERSION+'/build/pdf.min.mjs';
const PDFJS_WORKER_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+PDFJS_VERSION+'/build/pdf.worker.min.mjs';
const MAX_PDF_BYTES=15*1024*1024;
const MAX_PAGES=40;
const MAX_TEXT=50000;

function text(v){return String(v==null?'':v).replace(/\r/g,'').trim()}
function norm(v){try{return text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return text(v).toLowerCase()}}
function pad2(n){return String(n).padStart(2,'0')}
function B(){return root.StoreRunnerWeeklyBriefV246||null}
function validWeek(w){const api=B();if(api&&typeof api.validWeek==='function')return api.validWeek(w);return /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(String(w||''))}
function shiftWeek(w,n){const api=B();if(api&&typeof api.shiftWeek==='function')return api.shiftWeek(w,n);return w}
function weekMonday(w){const api=B();return api&&typeof api.weekMonday==='function'?api.weekMonday(w):''}
function dateAdd(iso,n){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}

function detectWeek(raw,fileName,referenceWeek){
  const ref=validWeek(referenceWeek)?referenceWeek:(B()&&B().activeWeek?B().activeWeek(new Date()):'');
  const sources=[text(fileName),text(raw)];
  for(let i=0;i<sources.length;i++){
    const m=sources[i].match(/\b(20\d{2})\s*[-_/ ]?\s*W\s*(\d{1,2})\b/i);
    if(m){const w=m[1]+'-W'+pad2(Number(m[2]));if(validWeek(w))return{week:w,source:i===0?'filename':'text',explicitYear:true}}
  }
  for(let i=0;i<sources.length;i++){
    const m=sources[i].match(/\bW\s*(\d{1,2})\b/i);
    if(!m)continue;
    const year=(ref&&ref.slice(0,4))||String(new Date().getFullYear());
    const w=year+'-W'+pad2(Number(m[1]));
    if(validWeek(w))return{week:w,source:i===0?'filename':'text',explicitYear:false};
  }
  return{week:ref||'',source:'reference',explicitYear:false};
}

function splitSegments(raw){
  const s=text(raw).replace(/\u2022/g,'\n- ');
  if(!s)return[];
  const lines=s.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const out=[];let cur='';
  for(const line of lines){
    if(/^[-–—]\s+/.test(line)){
      if(cur)out.push(cur.trim());
      cur=line.replace(/^[-–—]\s+/,'').trim();
    }else if(cur){cur+=' '+line}
    else{cur=line}
  }
  if(cur)out.push(cur.trim());
  return out;
}
function pendingLabel(segment){
  const m=segment.match(/en attente de\s+(confirmation(?:\s+de)?\s+[A-Za-z0-9À-ÿ._ -]{1,60})/i);
  if(m)return text(m[1]).replace(/\s+/g,' ');
  const n=segment.match(/en attente de\s+([A-Za-z0-9À-ÿ._ -]{1,60})/i);
  return n?text(n[1]).replace(/\s+/g,' '):null;
}
function titleFromText(raw,week){
  const first=text(raw).split(/\n/).map(x=>x.trim()).find(Boolean)||'';
  return first&&first.length<=120?first:'Feuille de route '+(week?week.slice(5):'');
}
function noteRule(label,segment,week,scope,extra){
  return Object.assign({type:'note',label,scope:scope||{},validFrom:week,validTo:week,confidence:'ambiguous',origin:'parsed',note:text(segment).slice(0,400)},extra||{});
}
function deadlineRule(label,segment,week,dueDate,scope,extra){
  return Object.assign({type:'deadline',label,scope:scope||{},boost:0,dueDate,validFrom:week,validTo:week,confidence:'ambiguous',origin:'parsed',note:text(segment).slice(0,400)},extra||{});
}
function fp(r){return JSON.stringify([r.type,r.label,r.target||'',r.dueDate||'',r.validFrom,r.validTo,r.pending||'',r.scope||{}])}
function pushUnique(arr,seen,r){const k=fp(r);if(!seen.has(k)){seen.add(k);arr.push(r)}}

function analyzeText(raw,options){
  const o=options||{},input=text(raw);if(!input)throw Error('Le PDF ne contient aucun texte exploitable.');
  const detected=detectWeek(input,o.fileName,o.referenceWeek);
  const week=detected.week;
  if(!validWeek(week))throw Error('Impossible de déterminer la semaine du brief.');
  const monday=weekMonday(week),rules=[],seen=new Set(),warnings=[];
  const segments=splitSegments(input);
  const joinedNorm=norm(input);

  for(const segment of segments){
    const n=norm(segment),pending=pendingLabel(segment);
    const waiting=pending||null;

    if(/semaine weekly/.test(n)&&(/gsa/.test(n)||/meublier/.test(n))){
      pushUnique(rules,seen,noteRule('Semaine Weekly GSA/Meublier',segment,week,{}));
    }
    if(/champions? enseignes?/.test(n))pushUnique(rules,seen,noteRule('Champions enseignes',segment,week,{}));

    if(/benchmark/.test(n)){
      const due=monday?dateAdd(monday,3):null;
      if(due)pushUnique(rules,seen,deadlineRule('Benchmark GSA/Meublier',segment,week,due,{}));
      else pushUnique(rules,seen,noteRule('Benchmark GSA/Meublier',segment,week,{}));
    }

    if(/prio ?1|p1/.test(n)&&/visite/.test(n)){
      const due=monday?dateAdd(monday,2):null;
      if(due)pushUnique(rules,seen,deadlineRule('Visites Prio 1 + Google Forms',segment,week,due,{basePrio:'P1'}));
      else pushUnique(rules,seen,noteRule('Visites Prio 1 + Google Forms',segment,week,{basePrio:'P1'}));
    }

    if(/micro rgb/.test(n))pushUnique(rules,seen,noteRule('Micro RGB Sony vs Samsung',segment,week,{}));
    if(/challenge/.test(n)&&/darty/.test(n))pushUnique(rules,seen,noteRule('Challenge Darty',segment,week,{brands:['Darty']}));

    if(/prio/.test(n)&&/brun/.test(n)&&/(annul|suspend|stop)/.test(n)){
      pushUnique(rules,seen,{type:'suspend',target:'performance',label:'Prios Co BRUN annulées',scope:{family:'brun'},validFrom:week,validTo:week,confidence:'ambiguous',origin:'parsed',pending:waiting,note:text(segment).slice(0,400)});
    }
    if(/prio/.test(n)&&/blanc/.test(n)&&/mainten/.test(n)&&/(semaine prochaine|prochaine semaine)/.test(n)){
      const next=shiftWeek(week,1);
      pushUnique(rules,seen,noteRule('Prios Co BLANC maintenues',segment,next,{family:'blanc'},{validFrom:next,validTo:next,pending:waiting}));
    }
  }

  if(!rules.length)warnings.push('Aucune consigne structurée reconnue : le texte est conservé, sans règle automatique.');
  if(/en attente de confirmation/.test(joinedNorm)&&!rules.some(r=>r.pending))warnings.push('Le brief contient une confirmation en attente qui n’a pas pu être rattachée automatiquement à une règle.');
  if(detected.source==='reference')warnings.push('Aucun numéro Wxx trouvé : semaine active utilisée.');
  else if(!detected.explicitYear)warnings.push('Année absente du PDF : année de la semaine affichée utilisée.');

  return{
    week,
    title:titleFromText(input,week),
    text:input.slice(0,MAX_TEXT),
    source:{kind:'file',fileName:text(o.fileName).slice(0,160),importedAt:o.importedAt||new Date().toISOString(),excerpt:input.slice(0,4000)},
    rules,
    warnings,
    detectedWeek:detected
  };
}

async function loadPdfJs(){
  if(root.__storeRunnerPdfJs)return root.__storeRunnerPdfJs;
  if(typeof root.__storeRunnerPdfJsLoader==='function')return root.__storeRunnerPdfJsLoader();
  const mod=await import(PDFJS_URL);
  if(mod&&mod.GlobalWorkerOptions)mod.GlobalWorkerOptions.workerSrc=PDFJS_WORKER_URL;
  root.__storeRunnerPdfJs=mod;
  return mod;
}
async function extractPdfText(file){
  if(typeof root.__storeRunnerPdfTextExtractor==='function')return root.__storeRunnerPdfTextExtractor(file);
  if(!file)throw Error('Choisis un fichier PDF.');
  const name=text(file.name),type=text(file.type).toLowerCase();
  if(!/\.pdf$/i.test(name)&&type!=='application/pdf')throw Error('Le fichier doit être un PDF.');
  if(Number(file.size)>MAX_PDF_BYTES)throw Error('PDF trop volumineux (15 Mo maximum).');
  const pdfjs=await loadPdfJs();
  const data=new Uint8Array(await file.arrayBuffer());
  const doc=await pdfjs.getDocument({data}).promise;
  if(doc.numPages>MAX_PAGES)throw Error('PDF trop long ('+doc.numPages+' pages, maximum '+MAX_PAGES+').');
  const pages=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p),tc=await page.getTextContent();
    const lines=[];let line='';
    for(const item of tc.items||[]){
      const s=text(item&&item.str);
      if(s)line+=(line?' ':'')+s;
      if(item&&item.hasEOL&&line){lines.push(line);line=''}
    }
    if(line)lines.push(line);
    pages.push(lines.join('\n'));
    if(pages.join('\n').length>MAX_TEXT)break;
  }
  const out=text(pages.join('\n'));
  if(!out)throw Error('Aucun texte lisible trouvé dans ce PDF.');
  return out.slice(0,MAX_TEXT);
}
async function analyzePdfFile(file,options){
  const raw=await extractPdfText(file);
  return analyzeText(raw,Object.assign({},options||{},{fileName:file&&file.name||''}));
}

let pendingAnalysis=null,lastMessage='';
function node(tag,label,cls){const d=root.document.createElement(tag);if(label!=null)d.textContent=label;if(cls)d.className=cls;return d}
function button(label,fn,cls){const b=node('button',label,cls||'secondary');b.type='button';b.addEventListener('click',fn);return b}
function displayedWeek(){
  const core=B(),sub=root.document&&root.document.getElementById('srBriefSubtitle');
  if(!core||!sub)return core&&core.activeWeek?core.activeWeek(new Date()):'';
  const m=text(sub.textContent).match(/\bW(\d{1,2})\b/),dm=text(sub.textContent).match(/du\s+(\d{2})\/(\d{2})/i);
  const current=core.activeWeek(new Date()),year=Number(current.slice(0,4));
  if(!m)return current;
  const short=pad2(Number(m[1]));
  for(const y of [year-1,year,year+1]){
    const w=y+'-W'+short;if(!core.validWeek(w))continue;
    if(!dm)return w;
    const mon=core.weekMonday(w);if(mon&&mon.slice(8,10)===dm[1]&&mon.slice(5,7)===dm[2])return w;
  }
  const fallback=year+'-W'+short;return core.validWeek(fallback)?fallback:current;
}
function ruleSummary(r,core){
  const parts=[core&&core.TYPE_LABELS&&core.TYPE_LABELS[r.type]||r.type];
  if(r.scope&&r.scope.family&&r.scope.family!=='all')parts.push(String(r.scope.family).toUpperCase());
  if(r.scope&&r.scope.basePrio)parts.push(r.scope.basePrio);
  if(r.scope&&r.scope.brands&&r.scope.brands.length)parts.push(r.scope.brands.join(', '));
  if(r.dueDate)parts.push('échéance '+(core&&core.dateLabel?core.dateLabel(r.dueDate):r.dueDate));
  if(r.validFrom!==r.validTo)parts.push((core&&core.shortWeek?core.shortWeek(r.validFrom):r.validFrom)+' → '+(core&&core.shortWeek?core.shortWeek(r.validTo):r.validTo));
  else if(r.validFrom)parts.push(core&&core.shortWeek?core.shortWeek(r.validFrom):r.validFrom);
  return parts.join(' · ');
}
function semanticRuleKey(r){
  const s=r.scope||{};
  return JSON.stringify([r.type,r.label,r.target||'',r.dueDate||'',r.validFrom||'',r.validTo||'',r.pending||'',s.family||'all',(s.brands||[]).slice().sort(),(s.storeIds||[]).slice().sort(),s.basePrio||null]);
}
function saveAnalysis(result){
  const core=B(),state=root.state;if(!core||!state)throw Error('Brief indisponible.');
  const had=Object.prototype.hasOwnProperty.call(state,'weeklyBriefs'),before=had?JSON.parse(JSON.stringify(state.weeklyBriefs)):undefined;
  try{
    const prev=core.briefForWeek(state,result.week),existing=prev?prev.rules.slice():[],seen=new Set(existing.map(semanticRuleKey));
    const additions=result.rules.filter(r=>{const k=semanticRuleKey(r);if(seen.has(k))return false;seen.add(k);return true});
    core.saveBrief(state,result.week,{title:result.title,source:result.source,rules:existing.concat(additions)});
    if(typeof root.save==='function')root.save();
    try{root.document.dispatchEvent(new root.CustomEvent((root.StoreRunnerWeeklyBriefUIV246&&root.StoreRunnerWeeklyBriefUIV246.EVENT)||'store-runner:weekly-brief-updated',{detail:{week:result.week}}))}catch(e){}
    return additions.length;
  }catch(e){if(had)state.weeklyBriefs=before;else delete state.weeklyBriefs;throw e}
}
function renderImportStatus(host,msg,error){
  if(!host)return;let p=host.querySelector('.srBriefPdfStatus');if(!p){p=node('p',undefined,'srBriefSub srBriefPdfStatus');host.prepend(p)}p.textContent=msg||'';p.style.color=error?'#b42318':'';
}
function renderPreview(host,result){
  const core=B();host.replaceChildren();
  const head=node('div',undefined,'srBriefRule');
  head.append(node('b',(core&&core.shortWeek?core.shortWeek(result.week):result.week)+' détectée · '+result.rules.length+' proposition'+(result.rules.length>1?'s':'')));
  head.append(node('span','Aucune proposition ne modifie les priorités avant confirmation.','srBriefMeta'));
  host.append(head);
  for(const r of result.rules){
    const c=node('div',undefined,'srBriefRule');
    const h=node('div');h.append(node('span','À confirmer','srBriefTag'),node('b',r.label));
    c.append(h,node('span',ruleSummary(r,core),'srBriefMeta'));
    if(r.pending)c.append(node('span','En attente : '+r.pending,'srBriefMeta'));
    host.append(c);
  }
  for(const w of result.warnings||[])host.append(node('p','⚠️ '+w,'srBriefSub'));
  const save=button('Enregistrer le brief + les propositions',()=>{
    try{
      const count=saveAnalysis(result);lastMessage='PDF enregistré : '+count+' nouvelle'+(count>1?'s':'')+' proposition'+(count>1?'s':'')+' à confirmer.';pendingAnalysis=null;
      const ui=root.StoreRunnerWeeklyBriefUIV246;if(ui&&typeof ui.open==='function')ui.open(result.week);setTimeout(ensureImportUi,0);
    }catch(e){lastMessage=text(e&&e.message)||'Import impossible.';renderImportStatus(host,lastMessage,true)}
  },'primary srBriefWide');
  save.id='srBriefPdfSave';host.append(save);
}
function ensureImportUi(){
  if(!root.document)return false;
  const body=root.document.getElementById('srBriefBody');if(!body||root.document.getElementById('srBriefPdfImport'))return false;
  const section=node('section',undefined,'srBriefSection');section.id='srBriefPdfImport';
  section.append(node('h3','📄 Importer le PDF'),node('p','Le fichier est lu sur cet appareil. Store Runner propose des règles, mais rien ne s’applique avant ta confirmation.','srBriefSub'));
  const file=root.document.createElement('input');file.type='file';file.accept='.pdf,application/pdf';file.id='srBriefPdfFile';
  const label=node('label',undefined,'srBriefField');label.append(node('span','Feuille de route PDF'),file);section.append(label);
  const preview=node('div');preview.id='srBriefPdfPreview';
  const analyze=button('Analyser le PDF',async()=>{
    if(!file.files||!file.files[0]){renderImportStatus(preview,'Choisis d’abord un fichier PDF.',true);return}
    analyze.disabled=true;renderImportStatus(preview,'Lecture et analyse du PDF…',false);
    try{
      const result=await analyzePdfFile(file.files[0],{referenceWeek:displayedWeek()});pendingAnalysis=result;renderPreview(preview,result);
    }catch(e){pendingAnalysis=null;preview.replaceChildren();renderImportStatus(preview,text(e&&e.message)||'Analyse PDF impossible.',true)}
    finally{analyze.disabled=false}
  },'primary srBriefWide');
  analyze.id='srBriefPdfAnalyze';section.append(analyze,preview);
  if(lastMessage)renderImportStatus(preview,lastMessage,false);
  const first=body.firstElementChild;if(first)first.insertAdjacentElement('afterend',section);else body.append(section);
  return true;
}
function installUi(){
  if(!root.document||root.__srBriefPdfUiInstalled)return false;root.__srBriefPdfUiInstalled=true;
  root.document.addEventListener('click',()=>setTimeout(ensureImportUi,0),true);
  root.document.addEventListener('store-runner:weekly-brief-updated',()=>setTimeout(ensureImportUi,0));
  root.document.addEventListener('store-runner:data-restored',()=>setTimeout(ensureImportUi,0));
  setTimeout(ensureImportUi,0);return true;
}

const api={PDFJS_VERSION,PDFJS_URL,PDFJS_WORKER_URL,MAX_PDF_BYTES,MAX_PAGES,MAX_TEXT,detectWeek,splitSegments,analyzeText,extractPdfText,analyzePdfFile,displayedWeek,saveAnalysis,ensureImportUi,installUi};
root.StoreRunnerWeeklyBriefImportV246B=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',installUi,{once:true});else installUi()}
})(typeof window!=='undefined'?window:globalThis);
