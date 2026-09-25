/* Store Runner V190 — interface du pilotage performance.

   Ce module possède la feuille #srPerfSheet et le bloc #sqPerformance de la fiche magasin,
   et rien d'autre. Il ne redéfinit aucune fonction globale, n'observe aucune zone qui ne
   lui appartient pas, et ne modifie jamais le planning : marquer un P1 « traité » pose une
   note de semaine, ça ne crée pas de visite et ça ne déplace pas une journée.

   Le classeur est lu sur l'appareil. Rien n'est envoyé nulle part. */
(function(root){
'use strict';

const SHEET_ID='srPerfSheet';
const MENU_BTN_ID='srPerfMenuButton';
const CARD_ID='sqPerformance';
let sheet=null,view='pilotage',activeWeek='',busy=false;

function D(){return root.StoreRunnerPerformanceV190||null}
function db(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function stores(){try{return Array.isArray(root.state&&root.state.stores)?root.state.stores:[]}catch(e){return[]}}
function text(v){return String(v==null?'':v).trim()}
function el(tag,txt,cls){const n=root.document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n}
function btn(txt,fn,cls){const b=el('button',txt,cls||'secondary');b.type='button';b.addEventListener('click',fn);return b}
function pct(v){return v==null?'—':(Math.round(v*10)/10).toString().replace('.',',')+' %'}
function euro(v){return v==null?'—':(v<0?'−':'')+Math.abs(Math.round(v)).toLocaleString('fr-FR')+' €'}
/* Les points sont réservés aux écarts de part de marché. Une évolution vs N-1 est un
   pourcentage : l'afficher en « pt » ferait lire une variation de PDM là où il n'y en a
   pas. Deux formateurs distincts, donc, et pas un seul qui mentirait sur l'unité. */
function signed(v){return v==null?'—':(v>0?'+':v<0?'−':'')+(Math.round(Math.abs(v)*10)/10).toString().replace('.',',')+' pt'}
function signedPct(v){return v==null?'—':(v>0?'+':v<0?'−':'')+(Math.round(Math.abs(v)*10)/10).toString().replace('.',',')+' %'}

/* « Déjà visité » a une seule définition, tenue par la couche données : une visite au
   statut `completed`. Un brouillon n'est pas un passage fait. */
function visitsFor(storeId){
  const P=D();
  try{return P?P.completedVisitsFor(root.state,storeId):null}catch(e){return null}
}

/* Le classeur porte un écart de sell-out par semaine. On les rend tels quels, chacun
   nommé par sa semaine, plutôt que d'en afficher un seul qui masquerait les autres. */
function sellOutLine(r){
  const parts=[];
  if(r.sellOutYtd!=null)parts.push(euro(r.sellOutYtd)+' YTD');
  const weeks=r.sellOutWeeks||{};
  for(const w of Object.keys(weeks).sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))))
    if(weeks[w]!=null)parts.push(euro(weeks[w])+' '+w);
  if(!parts.length&&r.sellOutWeek!=null)parts.push(euro(r.sellOutWeek)+' semaine');
  return parts.length?'Sell-out : '+parts.join(' · '):'';
}
function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-perf-style'))return;
  const s=el('style');s.id='sr-perf-style';
  s.textContent='#'+SHEET_ID+'{box-sizing:border-box;width:min(760px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px;border:1px solid #d9dce3;background:#fff;color:#1d1d1f}'
    +'#'+SHEET_ID+'::backdrop{background:rgba(17,24,39,.45)}'
    +'.srPerfHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.srPerfHead h2{margin:0;font-size:20px}.srPerfHead p{margin:4px 0 0;color:#667085;font-size:12px}'
    +'.srPerfBar{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.srPerfBar button,.srPerfBar select{min-height:46px;border-radius:13px;font-weight:800;font-size:12px;width:100%;box-sizing:border-box}'
    +'.srPerfKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}'
    +'.srPerfKpi{border:1px solid #e2e6ed;border-radius:14px;padding:9px 8px;background:#fff;text-align:center}.srPerfKpi b{display:block;font-size:19px;letter-spacing:-.03em}.srPerfKpi span{display:block;font-size:10px;color:#667085;margin-top:2px;line-height:1.25}'
    +'.srPerfNote{grid-column:1/-1;font-size:11.5px;color:#667085;line-height:1.45;margin:2px 0 0}'
    +'.srPerfRow{border:1px solid #e2e6ed;border-radius:14px;padding:10px;margin:8px 0;background:#fff}'
    +'.srPerfRow button{min-height:44px;width:100%;margin-top:8px;border-radius:12px;border:1px solid #d3d9e3;background:#fff;font-weight:800;font-size:11.5px}'
    +'.srPerfRow b{font-size:13px}.srPerfRow .srPerfMeta{display:block;white-space:pre-line;font-size:11px;color:#667085;margin-top:4px;line-height:1.5}'
    +'.srPerfTag{display:inline-block;padding:3px 8px;border-radius:8px;font-weight:800;font-size:10.5px;margin-right:6px}'
    +'.srPerfP1{background:#fdecea;color:#a3261c;border:1px solid #f3c3bd}.srPerfP2{background:#fff5e6;color:#8a5200;border:1px solid #f6ddb4}'
    +'.srPerfWatch{background:#eef2ff;color:#334155;border:1px solid #d7ddf5}.srPerfNodata{background:#eef0f4;color:#4a5260;border:1px solid #d9dee6}'
    +'.srPerfDone{background:#e9f7ef;color:#1a6b42;border:1px solid #bfe5d0}'
    +'.srPerfSection{margin-top:16px}.srPerfSection h3{font-size:14px;margin:0 0 6px}'
    +'.srPerfEmpty{padding:18px 10px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:14px}'
    +'.srPerfStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.srPerfStatus.srPerfError{color:#b42318}'
    +'#'+CARD_ID+'{margin-top:8px;padding:10px;border:1px solid #e2e6ed;border-radius:14px;background:#fbfcff;font-size:11.5px;line-height:1.5}'
    +'#'+CARD_ID+' b{font-size:12px}#'+CARD_ID+' .srPerfCardRow{display:block;color:#454b56;margin-top:3px}'
    +'#'+CARD_ID+' button{min-height:44px;width:100%;margin-top:8px;border-radius:12px;border:1px solid #d3d9e3;background:#fff;font-weight:800;font-size:11.5px}'
    +'#'+CARD_ID+' .srPerfCardHead{display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
    +'#'+CARD_ID+' .srPerfCardHead b{font-size:13.5px;line-height:1.3;overflow-wrap:anywhere}'
    +'#'+CARD_ID+' .srPerfCardWeek{display:block;margin-top:2px;font-size:10.5px;color:#667085}'
    +'#'+CARD_ID+' .srPerfBlock237{margin-top:9px}'
    +'#'+CARD_ID+' .srPerfBlockTitle237{display:block;font-size:10px;font-weight:850;letter-spacing:.02em;text-transform:uppercase;color:#667085}'
    +'#'+CARD_ID+' .srPerfBlockBody237{display:block;margin-top:2px;font-size:12px;line-height:1.45;color:#1d2939;white-space:pre-line;overflow-wrap:anywhere}'
    +'#'+CARD_ID+' .srPerfDetail237{margin-top:11px;border-top:1px solid #e6eaf1;padding-top:8px}'
    +'#'+CARD_ID+' .srPerfDetail237>summary{min-height:34px;display:flex;align-items:center;cursor:pointer;font-weight:800;font-size:11.5px;color:#315b9d;list-style:none}'
    +'#'+CARD_ID+' .srPerfDetail237>summary::-webkit-details-marker{display:none}'
    +'#'+CARD_ID+' .srPerfDetail237>summary::after{content:"\\25be";margin-left:auto;font-size:10px}'
    +'#'+CARD_ID+' .srPerfDetail237[open]>summary::after{content:"\\25b4"}'
    +'#'+CARD_ID+' .srPerfDetail237 .srPerfCardRow{overflow-wrap:anywhere}'
    +'@media(max-width:520px){.srPerfKpis{grid-template-columns:repeat(2,minmax(0,1fr))}.srPerfBar{grid-template-columns:1fr}}';
  root.document.head.appendChild(s);
}
function say(msg,error){const box=sheet&&sheet.querySelector('#srPerfStatus');if(box){box.textContent=msg||'';box.classList.toggle('srPerfError',!!error)}}
function tag(prio){
  const map={P1:['Prio 1','srPerfP1'],P2:['Prio 2','srPerfP2'],watch:['À surveiller','srPerfWatch'],nodata:['Pas de data','srPerfNodata']};
  const [label,cls]=map[prio]||['Non classé','srPerfNodata'];
  return el('span',label,'srPerfTag '+cls);
}

/* ------------------------------------------------------------------ import local ---- */
async function importFile(file){
  const P=D();
  if(!P||!file)return false;
  busy=true;say('Lecture du classeur sur l’appareil…');
  try{
    const buffer=await file.arrayBuffer();
    const week=P.weekFromName(file.name);
    const snapshot=await P.parseWorkbook(new Uint8Array(buffer),{week});
    if(!snapshot.week)throw new Error('Semaine introuvable : renomme le fichier en « … W34.xlsx ».');
    P.saveSnapshot(db(),snapshot);
    activeWeek=snapshot.week;
    const c=P.counts(snapshot.rows);
    say(snapshot.week+' importée sur cet appareil · '+snapshot.rows.length+' lignes · '+c.P1+' P1, '+c.P2+' P2, '+c.watch+' à surveiller.');
    render();
    return true;
  }catch(e){
    say(text(e&&e.message)||'Classeur illisible.',true);
    return false;
  }finally{busy=false}
}
function pickFile(){
  const input=sheet&&sheet.querySelector('#srPerfFile');
  if(input&&!busy)input.click();
}

/* ------------------------------------------------------------------ rendu ----------- */
function rowCard(r,options){
  const P=D(),o=options||{},box=el('div',undefined,'srPerfRow'),head=el('div');
  head.append(tag(r.prio));
  if(r.treated)head.append(el('span','Traité '+text(r.treated.at),'srPerfTag srPerfDone'));
  head.append(el('b',text(r.retailer)+' · '+text(r.site)));
  box.append(head);
  const bits=[];
  /* Le statut vient du YTD, seul agrégat stable. */
  bits.push('Statut YTD : '+(r.status?r.status.label:'—')+' · PDM YTD '+pct(r.pdmYtd)+(r.pdmYtd==null?'':' · écart cible '+signed(r.deltaYtd)));
  const w=r.weekly;
  if(w&&w.points&&w.points.length){
    bits.push('Tendance hebdo (indicative, hors classement) : '+w.points.map(p=>p.week+' '+pct(p.value)).join(' · ')
      +(w.delta==null?'':' → '+w.direction+' '+signed(w.delta))+(w.volatile?' · amplitude '+w.amplitude+' pts, très volatile':''));
  }
  if(r.evolYtd!=null)bits.push('Évolution YTD vs N-1 : '+signedPct(r.evolYtd));
  const so=sellOutLine(r);
  if(so)bits.push(so);
  if(r.trend!=null&&r.previousWeek)bits.push('PDM YTD depuis '+r.previousWeek+' : '+signed(r.trend)+' — association de dates, sans lien de cause établi');
  if(r.visits&&r.visits.lastVisit)bits.push('Dernière visite terminée '+r.visits.lastVisit+' · '+r.visits.count+' visite'+(r.visits.count>1?'s':''));
  else bits.push('Aucune visite terminée enregistrée');
  if(!r.storeId)bits.push('Pas encore rattaché à un magasin du secteur');
  if(r.comment)bits.push('Mission : '+r.comment);
  box.append(el('small',bits.join('\n'),'srPerfMeta'));
  if(o.actions&&r.storeId&&r.prio==='P1'){
    if(r.treated)box.append(btn('Retirer la marque « traité »',()=>{P.markTreated(db(),o.week,r.storeId,null);render()}));
    else box.append(btn(r.qualifying?'Marquer traité (visite du '+r.qualifying.date+')':'Marquer comme traité cette semaine',
      ()=>{P.markTreated(db(),o.week,r.storeId,r.qualifying?r.qualifying.date:'');render()}));
  }
  if(o.resolve&&!r.storeId)box.append(resolver(r,o));
  return box;
}
function suggestedStoreFields(r){
  const raw=text(r&&r.retailer),upper=raw.toUpperCase(),labels={ED:'Electro Depot',CONFO:'Conforama',BOULANGER:'Boulanger',DARTY:'Darty',FNAC:'Fnac',BUT:'BUT',CARREFOUR:'Carrefour',AUCHAN:'Auchan'};
  const enseigne=labels[upper]||raw,original=text(r&&r.site);let site=original;
  if(raw&&site.toLowerCase().indexOf(raw.toLowerCase())===0)site=site.slice(raw.length).trim();
  const ville=text((site.split('/')[0]||site)).replace(/^[-–—]+|[-–—]+$/g,'').trim();
  return{enseigne:enseigne,ville:ville,sourceName:original||[enseigne,ville].filter(Boolean).join(' ')};
}
/* V261 — un magasin absent passe par l'écran unique d'ajout (store-add-v261.js) :
   recherche préremplie, aperçu, détection de doublon. Le rattachement n'est retenu
   qu'après un ajout réel. */
function openStoreAdd(r){
  const A=root.StoreRunnerStoreAdd;if(!A||typeof A.open!=='function'){say('Ajout magasin indisponible. Recharge Store Runner.',true);return}
  const P=D();
  A.open({drafts:[suggestedStoreFields(r)],onAdded:store=>{P.rememberMatch(db(),r.key,store.id);say('Magasin ajouté et rattaché ✓ '+text(store.enseigne)+' · '+text(store.ville));render()}});
}
function oWeek(){return activeWeek||''}
/* Appariement manuel : une liste de candidats, jamais un choix fait à la place de
   l'utilisateur. Le choix est retenu pour les semaines suivantes. */
function resolver(r,o){
  const P=D(),wrap=el('div'),select=el('select'),create=btn('＋ Ajouter ce magasin à mon secteur',()=>openStoreAdd(r));
  select.append(Object.assign(el('option','Rattacher à un magasin…'),{value:''}));
  for(const s of stores())select.append(Object.assign(el('option',text(s.enseigne)+' · '+text(s.ville)),{value:String(s.id)}));
  select.style.minHeight='44px';select.style.width='100%';select.style.marginTop='8px';
  select.onchange=()=>{if(!select.value)return;P.rememberMatch(db(),r.key,select.value);say('Rattachement enregistré : il sera réutilisé les semaines suivantes.');render()};
  wrap.append(select,create);return wrap;
}
function kpi(host,value,label){const box=el('div',undefined,'srPerfKpi');box.append(el('b',String(value)),el('span',label));host.append(box)}

function render(){
  const P=D();if(!sheet||!P)return;
  const body=sheet.querySelector('#srPerfBody');body.replaceChildren();
  const all=P.weeks(db());
  const picker=sheet.querySelector('#srPerfWeek');
  picker.replaceChildren();
  for(const w of all)picker.append(Object.assign(el('option',w),{value:w}));
  if(!all.length){picker.disabled=true;picker.append(Object.assign(el('option','Aucune semaine'),{value:''}))}
  else{picker.disabled=false;if(!activeWeek||all.indexOf(activeWeek)<0)activeWeek=all[all.length-1];picker.value=activeWeek}
  if(!all.length){
    body.append(el('div','Aucun classeur importé. Le fichier reste sur cet appareil : rien n’est envoyé sur un serveur.','srPerfEmpty'));
    return;
  }
  const board=P.dashboard(db(),{stores:stores(),week:activeWeek,visitsFor});
  sheet.querySelector('#srPerfSubtitle').textContent='Semaine '+board.week+' · cible '+pct(board.targetPdm)
    +(board.targetSource==='déduit'?' (déduite du fichier)':board.targetSource==='explicite'?' (lue dans le fichier)':'');
  const kpis=el('div',undefined,'srPerfKpis');
  kpi(kpis,board.counts.P1,'Prio 1');kpi(kpis,board.counts.P2,'Prio 2');
  kpi(kpis,board.counts.watch,'À surveiller');kpi(kpis,board.underTarget.length,'sous la cible');
  const matched=board.counts.total-board.counts.unmatched,notes=[matched+' rattaché'+(matched>1?'s':'')+' sur '+board.counts.total,board.counts.nodata+' sans data',board.counts.unmatched+' non rattaché'+(board.counts.unmatched>1?'s':'')];
  if(board.importsThisWeek>1)notes.push(board.importsThisWeek+' imports pour cette semaine, tous conservés — la dernière valeur connue est affichée');
  kpis.append(el('p',notes.join(' · ')+' · statut et écart calculés sur le YTD ; les magasins sans PDM ne sont comptés ni au-dessus ni en dessous de la cible.','srPerfNote'));
  body.append(kpis);
  const cmp=board.comparison;
  const sections=[
    ['À traiter en priorité',board.rows.filter(r=>r.prio==='P1'),{actions:true,week:board.week,resolve:true},''],
    ['Prio 2',board.rows.filter(r=>r.prio==='P2'),{week:board.week,resolve:true},''],
    ['À surveiller',board.rows.filter(r=>r.prio==='watch'),{week:board.week,resolve:true},''],
    ['Sans data',board.rows.filter(r=>r.prio==='nodata'),{week:board.week,resolve:true},'']
  ];
  /* Les deux vues comparatives n'apparaissent qu'à partir de deux semaines : sur un seul
     snapshot il n'y a pas d'avant, donc rien à comparer. */
  if(cmp.available){
    const effectif=' · '+cmp.sample.visited+' visités contre '+cmp.sample.notVisited+' non visités, sur '+cmp.weeksCompared+' semaines';
    const note=cmp.wording+effectif;
    sections.splice(2,0,
      ['Visités, PDM YTD sous la cible',cmp.visitedLowPdm,{week:board.week},note],
      ['Non visités, PDM YTD au-dessus de la cible',cmp.notVisitedGoodPdm,{week:board.week},note]);
  }
  for(const [title,rows,opts,note] of sections){
    if(!rows.length)continue;
    const section=el('section',undefined,'srPerfSection');
    section.append(el('h3',title+' ('+rows.length+')'));
    if(note)section.append(el('p',note,'srPerfNote'));
    for(const r of rows.slice(0,40))section.append(rowCard(r,opts));
    if(rows.length>40)section.append(el('p','… et '+(rows.length-40)+' autres.','srPerfNote'));
    body.append(section);
  }
  if(!cmp.available)body.append(el('p','Comparaison visités / non visités : '+cmp.reason+' Elle apparaîtra au deuxième import.','srPerfNote'));
  else if(cmp.trendVisited&&cmp.trendNotVisited&&cmp.trendVisited.delta!=null&&cmp.trendNotVisited.delta!=null)
    body.append(el('p','PDM YTD moyenne : '+signed(cmp.trendVisited.delta)+' chez '+cmp.trendVisited.n+' magasins visités, '
      +signed(cmp.trendNotVisited.delta)+' chez '+cmp.trendNotVisited.n+' non visités. Association observée sur '+cmp.weeksCompared
      +' semaines, sans lien de cause établi.','srPerfNote'));
}
function ensureSheet(){
  if(sheet)return sheet;
  if(!root.document)return null;
  ensureStyle();
  sheet=el('dialog');sheet.id=SHEET_ID;sheet.setAttribute('aria-labelledby','srPerfTitle');
  sheet.innerHTML='<div class="srPerfHead"><div><h2 id="srPerfTitle">Pilotage performance</h2><p id="srPerfSubtitle"></p></div></div>'
    +'<div class="srPerfBar"><button type="button" id="srPerfImport" class="primary">📥 Importer un classeur .xlsx</button>'
    +'<select id="srPerfWeek" aria-label="Semaine affichée"></select></div>'
    +'<input id="srPerfFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>'
    +'<p id="srPerfStatus" class="srPerfStatus" role="status"></p><div id="srPerfBody"></div>'
    +'<div class="srPerfBar"><button type="button" id="srPerfClose">Fermer</button></div>';
  root.document.body.appendChild(sheet);
  sheet.querySelector('#srPerfImport').onclick=pickFile;
  sheet.querySelector('#srPerfClose').onclick=()=>{if(sheet.open)sheet.close()};
  sheet.querySelector('#srPerfWeek').onchange=e=>{activeWeek=e.target.value;render()};
  const input=sheet.querySelector('#srPerfFile');
  input.addEventListener('change',()=>{const f=input.files&&input.files[0];input.value='';if(f)importFile(f)});
  sheet.addEventListener('cancel',e=>{e.preventDefault();sheet.close()});
  return sheet;
}
function open(){ensureSheet();say('');if(typeof sheet.showModal==='function'&&!sheet.open)sheet.showModal();else sheet.setAttribute('open','');render();return true}

/* ======================= V237 — synthèse lisible de la priorité =====================

   La carte de la fiche magasin rendait toutes les colonnes du classeur, mission
   comprise. C'était complet et inutilisable : en visite le FMT a cinq secondes, pas
   trente lignes. Cette couche ne calcule rien de neuf — elle relit `statusOf`,
   `weeklyTrend` et la mission déjà lus, et en tire quatre phrases courtes.

   Aucune IA. La mission du classeur est un texte à motifs stables : on la lit avec un
   vocabulaire fermé et des expressions régulières. Un motif inconnu ne produit pas de
   phrase — le bloc est omis plutôt qu'inventé.

   Le détail intégral reste dans la carte, replié, et le pilotage performance n'est pas
   touché. */

function normText(v){
  let base='';
  try{base=text(v).normalize('NFD')}catch(e){base=text(v)}
  let out='';
  for(const ch of base){
    const c=ch.codePointAt(0);
    if(c>=0x300&&c<=0x36F)continue;   // marques diacritiques combinantes
    out+=ch;
  }
  return out.toLowerCase().replace(/[^a-z0-9%<>~\-\/ ]+/g,' ').replace(/\s+/g,' ').trim();
}

/* Le rendu utilisateur ne doit jamais porter les scories du classeur : caractère de
   remplacement, demi-surrogate isolé, zone privée laissée par un décodage fautif,
   séparateurs techniques. On nettoie aussi à l'affichage, parce que les instantanés
   déjà enregistrés sur l'appareil gardent le texte tel qu'il a été lu à l'époque. */
function stripJunk(value){
  let out='';
  for(const ch of text(value)){
    const c=ch.codePointAt(0);
    if(c<9||(c>10&&c<32))continue;                    // commandes de controle du classeur
    if(c>=0xD800&&c<=0xDFFF)continue;                 // demi-surrogate isole
    if(c>=0xE000&&c<=0xF8FF)continue;                 // zone privee : decodage fautif
    if(c===0xFFFD||c===0xFFFE||c===0xFFFF)continue;   // caractere de remplacement
    out+=ch;
  }
  return out;
}
function cleanMission(value){
  return stripJunk(value)
    .split(/[|•;]+/).join(' · ')
    .split('·').map(part=>part.trim()).filter(Boolean).join(' · ')
    .replace(/[ \t]{2,}/g,' ')
    .trim();
}

/* Vocabulaire fermé, du plus spécifique au plus général : « Neo QLED » doit gagner
   contre « QLED », sinon toute la dynamique Neo QLED serait lue comme du QLED. */
const FAMILIES=[
  ['neo qled','Neo QLED'],['the frame','The Frame'],['lifestyle','Lifestyle'],
  ['oled','OLED'],['qled','QLED'],['uhd','UHD'],['crystal','Crystal'],
  ['soundbar','Soundbar'],['barre de son','Soundbar'],
  ['lave linge','Lave-linge'],['lave vaisselle','Lave-vaisselle'],
  ['refrigerateur','Réfrigérateur'],['micro onde','Micro-ondes']
];
function familyOf(segment){
  const n=normText(segment);
  for(let i=0;i<FAMILIES.length;i++)if(n.includes(FAMILIES[i][0]))return FAMILIES[i][1];
  return '';
}
function signedNumber(segment){
  const m=String(segment).match(/([+\-−]?\s?\d+(?:[.,]\d+)?)\s*%/);
  if(!m)return null;
  const n=Number(m[1].replace(/\s/g,'').replace('−','-').replace(',','.'));
  return Number.isFinite(n)?Math.round(n*10)/10:null;
}
/* « 37~43 », « 37-43 », « 80/85 » : le classeur écrit les groupes de tailles de
   plusieurs façons. Seules les paires de pouces plausibles sont retenues. */
function sizesOf(segment){
  const out=[];
  const re=/(\d{2})\s*[~\-–—/]\s*(\d{2,3})/g;
  let m;
  while((m=re.exec(String(segment)))){
    const min=Number(m[1]),max=Number(m[2]);
    if(min>=15&&max<=120&&max>min)out.push({min,max,label:min+'–'+max+'"'});
  }
  return out;
}

/* Découpe la mission en signaux typés. */
function parseMission(mission){
  const clean=cleanMission(mission);
  const out={alerts:[],weights:[],declines:[],growths:[],sizes:[],mission:clean};
  if(!clean)return out;
  const segments=clean.split(/·|\n/);
  for(let i=0;i<segments.length;i++){
    const segment=segments[i].trim();
    if(!segment)continue;
    const n=normText(segment),family=familyOf(segment),value=signedNumber(segment);

    /* Un plancher de poids — « Poids OLED <40% » — est le signal le plus fort du
       classeur : il dit que la famille n'est pas exposée, pas seulement qu'elle recule. */
    const floor=segment.match(/<\s*(\d+(?:[.,]\d+)?)\s*%/);
    if(/poids/.test(n)&&family&&floor){
      out.weights.push({label:family,floor:Number(floor[1].replace(',','.'))});
      continue;
    }
    if(/alerte/.test(n)&&family){out.alerts.push({label:family,value:value});continue}

    const sizes=sizesOf(segment);
    if(sizes.length){
      const up=/hausse|progress|croissance/.test(n)&&!/decroissance/.test(n);
      for(let s=0;s<sizes.length;s++)out.sizes.push({min:sizes[s].min,max:sizes[s].max,label:sizes[s].label,direction:up?'up':'down'});
      continue;
    }
    if(value==null||!family)continue;
    if(value<0||/baisse|recul|decroissance|reprise requise|retard/.test(n))out.declines.push({label:family,value:value});
    else if(value>0)out.growths.push({label:family,value:value});
  }
  return out;
}

/* Ce qui n'est pas exposé passe avant ce qui recule, et un fort recul avant un faible.
   Jamais plus de deux familles : au-delà, la carte redevient le mur de texte qu'on
   vient justement de supprimer. */
const MAX_FAMILIES=2,MAX_SIZES=2,MAX_ACTIONS=2;
function keptFamilies(signals){
  const seen=Object.create(null),out=[];
  const push=(label,kind,value)=>{
    if(!label||seen[label]||out.length>=MAX_FAMILIES)return;
    seen[label]=true;out.push({label:label,kind:kind,value:value});
  };
  for(let i=0;i<signals.weights.length;i++)push(signals.weights[i].label,'weight',signals.weights[i].floor);
  for(let i=0;i<signals.alerts.length;i++)push(signals.alerts[i].label,'alert',signals.alerts[i].value);
  const worst=signals.declines.slice().sort((a,b)=>a.value-b.value);
  for(let i=0;i<worst.length;i++)push(worst[i].label,'decline',worst[i].value);
  return out;
}
function keptSizes(signals){
  const seen=Object.create(null),out=[];
  for(let i=0;i<signals.sizes.length;i++){
    const t=signals.sizes[i];
    if(t.direction!=='down'||seen[t.label]||out.length>=MAX_SIZES)continue;
    seen[t.label]=true;out.push(t);
  }
  return out;
}
function bestGrowth(signals){
  const up=signals.growths.filter(g=>g.value>0).sort((a,b)=>b.value-a.value);
  return up.length?up[0]:null;
}

/* Les alertes du classeur sont écrites pour un analyste. Ces phrases-là sont écrites
   pour quelqu'un qui est debout dans le rayon. */
function actionForFamily(f){
  if(f.kind==='weight')return 'Renforcer la présence et le discours '+f.label+'.';
  if(f.kind==='alert')return 'Contrôler l’exposition '+f.label+' et le discours vendeur.';
  return 'Identifier les freins à la vente '+f.label+'.';
}
function actionForSize(t){
  if(t.max<=50)return 'Travailler les petites tailles '+t.label+'.';
  if(t.min>=70)return 'Vérifier l’exposition et la proposition sur les très grandes tailles.';
  return 'Travailler les tailles '+t.label+'.';
}
function fieldActions(families,sizes,growth){
  const out=[];
  for(let i=0;i<families.length&&out.length<MAX_ACTIONS;i++)out.push(actionForFamily(families[i]));
  for(let i=0;i<sizes.length&&out.length<MAX_ACTIONS;i++)out.push(actionForSize(sizes[i]));
  if(!out.length&&growth)out.push('S’appuyer sur la dynamique '+growth.label+'.');
  return out;
}

/* « hausse » sur une valeur restée négative faisait lire un redressement là où le
   magasin recule encore. Le sens de la variation et le signe de la dernière semaine
   sont deux informations distinctes, donc deux morceaux de phrase distincts. */
function weeklyReading(trend){
  if(!trend||!trend.points||!trend.points.length)return null;
  const last=trend.points[trend.points.length-1];
  if(trend.points.length<2)return{week:last.week,value:last.value,reading:''};
  const negative=last.value<0,delta=trend.delta;
  let reading;
  if(negative)reading=delta>0?'amélioration récente mais toujours en recul'
    :delta<0?'dégradation qui se poursuit':'stable, toujours en recul';
  else reading=delta>0?'en progression':delta<0?'en repli, mais toujours positif':'stable';
  return{week:last.week,value:last.value,reading:reading};
}

/* Le reste de la carte ecrit les negatifs avec un trait d'union via `pct`. La
   synthese aligne le signe moins typographique du reste de l'interface, sans
   toucher au formateur historique que d'autres vues utilisent deja. */
function pctSigned(v){
  if(v==null)return '—';
  const n=Math.round(Math.abs(v)*10)/10;
  return (v<0?'−':'')+String(n).replace('.',',')+' %';
}
function joinList(items){
  if(items.length<=1)return items[0]||'';
  return items.slice(0,-1).join(', ')+' et '+items[items.length-1];
}
function headlineOf(families,status){
  if(families.length)return 'Relancer '+families.map(f=>f.label).join(' / ');
  if(status&&status.underTarget===true)return 'Redresser la part de marché';
  if(status&&status.underTarget===false)return 'Tenir le niveau atteint';
  return 'Performance à regarder';
}
function situationOf(row,targetPdm,status){
  if(row.pdmYtd==null)return 'Pas de part de marché dans le fichier : s’appuyer sur la mission et le sell-out.';
  const gap=status&&status.gap!=null?status.gap:null;
  const target=targetPdm==null?'':' vs '+pct(targetPdm)+' cible';
  if(gap==null)return 'PDM à '+pct(row.pdmYtd)+target+'.';
  const force=Math.abs(gap)>=10?'très ':Math.abs(gap)>=4?'':'légèrement ';
  return 'Magasin '+force+(gap<0?'sous l’objectif':'au-dessus de l’objectif')+
    ', avec une PDM à '+pct(row.pdmYtd)+target+'.';
}
function focusOf(families,sizes){
  const parts=families.map(f=>
    f.kind==='weight'?f.label+' sous '+String(Math.round(f.value)).replace('.',',')+' %'
    :f.value==null?f.label+' en difficulté'
    :f.label+' '+signedPct(f.value));
  let phrase=parts.length?joinList(parts):'';
  if(sizes.length){
    const t=joinList(sizes.map(x=>x.label));
    phrase=phrase?phrase+', avec une faiblesse particulière sur les '+t
                 :'Faiblesse marquée sur les '+t;
  }
  return phrase?phrase+'.':'';
}
function positiveOf(growth){
  return growth?growth.label+' '+signedPct(growth.value)+' progresse fortement.':'';
}
/* Deux chiffres cumulés, jamais la ligne complète des semaines. La dernière semaine a
   sa propre ligne, avec sa lecture : la répéter ici ferait lire deux fois le même
   chiffre dans le même bloc. */
function keyFigures(row,status){
  const out=[];
  if(row.evolYtd!=null)out.push('YTD '+signedPct(row.evolYtd));
  if(status&&status.gap!=null)out.push('écart cible '+signed(status.gap));
  return out;
}

/* Point d'entrée unique de la synthèse. Pure : mêmes entrées, même sortie. */
function prioritySummary(row,targetPdm){
  const P=D();
  if(!row||!P)return null;
  const status=P.statusOf(row,targetPdm);
  const signals=parseMission(row.comment);
  const families=keptFamilies(signals);
  const sizes=keptSizes(signals);
  const growth=bestGrowth(signals);
  const weekly=weeklyReading(P.weeklyTrend(row));
  return{
    headline:headlineOf(families,status),
    situation:situationOf(row,targetPdm,status),
    focus:focusOf(families,sizes),
    positive:positiveOf(growth),
    actions:fieldActions(families,sizes,growth),
    figures:keyFigures(row,status),
    weekly:weekly,
    signals:{families:families,sizes:sizes,growth:growth,
      alerts:signals.alerts,weights:signals.weights,declines:signals.declines,mission:signals.mission}
  };
}

/* ---------------------------------------------------- bloc de la fiche magasin ------ */
function renderStoreCard(){
  const P=D();if(!P||!root.document)return false;
  const sheetEl=root.document.getElementById('storeQuickSheet'),start=root.document.getElementById('srQuickStart');
  if(!sheetEl||!start||!start.dataset)return false;
  const storeId=text(start.dataset.srStart);if(!storeId)return false;
  const anchor=root.document.getElementById('sqVisitCredit')||root.document.getElementById('sqAddress');
  if(!anchor)return false;
  let card=root.document.getElementById(CARD_ID);
  const history=P.historyForStore(db(),storeId,stores());
  if(!history.length){if(card)card.remove();return false}
  if(!card){ensureStyle();card=el('section');card.id=CARD_ID;card.setAttribute('aria-label','Performance du magasin');anchor.insertAdjacentElement('afterend',card)}
  card.replaceChildren();
  const last=history[history.length-1],r=last.row;
  const st=P.statusOf(r,last.targetPdm);
  const summary=prioritySummary(r,last.targetPdm);

  /* En tête : la pastille de priorité, puis ce qu'il faut faire. Le titre dit l'action,
     pas la colonne du classeur. */
  const head=el('div','','srPerfCardHead');
  head.append(tag(r.prio),el('b',summary?summary.headline:'Performance'));
  card.append(head,el('span','Performance '+last.week,'srPerfCardWeek'));

  /* Quatre blocs courts au maximum, chacun omis quand il n'a rien à dire : un bloc vide
     coûte de la hauteur d'écran sans rien apprendre. */
  const block=(title,body)=>{
    if(!body)return;
    const b=el('div','','srPerfBlock237');
    b.append(el('span',title,'srPerfBlockTitle237'),el('span',body,'srPerfBlockBody237'));
    card.append(b);
  };
  if(summary){
    block('Situation',summary.situation);
    block('À travailler',summary.focus);
    block('Point positif',summary.positive);
    block('Action visite',summary.actions.join(' '));
    const figures=summary.figures.join(' · ');
    const weekly=summary.weekly&&summary.weekly.reading
      ? summary.weekly.week+' '+pctSigned(summary.weekly.value)+' · '+summary.weekly.reading:'';
    if(figures||weekly)block('Tendance',[figures,weekly].filter(Boolean).join('\n'));
  }

  /* Rien n'est retiré : tout ce que la carte affichait est ici, replié. */
  const detail=root.document.createElement('details');
  detail.className='srPerfDetail237';
  const head2=root.document.createElement('summary');
  head2.textContent='Voir le détail performance';
  detail.append(head2);
  const line=(t)=>detail.append(el('span',t,'srPerfCardRow'));
  line('Statut YTD : '+st.label);
  line('PDM YTD '+pct(r.pdmYtd)+' · cible '+pct(last.targetPdm)+(r.pdmYtd==null?' — pas de PDM dans le fichier':' · écart '+signed(r.deltaYtd)));
  const w=P.weeklyTrend(r);
  if(w.points.length)line('Tendance hebdo (indicative) : '+w.points.map(p=>p.week+' '+pct(p.value)).join(' · ')+(w.delta==null?'':' → '+w.direction));
  if(r.evolYtd!=null)line('Évolution YTD vs N-1 : '+signedPct(r.evolYtd));
  const so=sellOutLine(r);
  if(so)line(so);
  if(history.length>1){
    line('Historique : '+history.map(h=>h.week+' '+pct(h.row.pdmYtd)).join(' → '));
    const first=history[0].row;
    if(first.pdmYtd!=null&&r.pdmYtd!=null)line('PDM YTD '+history[0].week+' → '+last.week+' : '+signed(Math.round((r.pdmYtd-first.pdmYtd)*10)/10)+' — association de dates, pas un effet attribué à une visite');
  }
  const v=visitsFor(storeId);
  line(v&&v.lastVisit?'Dernière visite terminée '+v.lastVisit+' · '+v.count+' visite'+(v.count>1?'s':''):'Aucune visite terminée enregistrée');
  const treated=P.isTreated(db(),last.week,storeId);
  if(treated)line('Marqué traité pour '+last.week+' le '+treated.at);
  const mission=cleanMission(r.comment);
  if(mission)line('Mission : '+mission);
  card.append(detail);

  card.append(btn('Ouvrir le pilotage performance',open));
  return true;
}

/* --------------------------------------------------------------- installation ------- */
function ensureMenuEntry(){
  if(!root.document)return false;
  const grid=root.document.querySelector('#moreSheetV2 .moreSheetGrid');
  if(!grid)return false;
  if(root.document.getElementById(MENU_BTN_ID))return true;
  const b=btn('📊 Performance',function(e){
    if(e&&e.preventDefault){e.preventDefault();e.stopPropagation()}
    const more=root.document.getElementById('moreSheetV2');if(more)more.classList.remove('open');
    open();
  });
  b.id=MENU_BTN_ID;b.setAttribute('aria-label','Pilotage performance');
  grid.appendChild(b);
  return true;
}
/* Rien ne s'installe ni ne se recalcule au démarrage en dehors de ces deux poses, et
   aucune d'elles ne touche au planning. */
function install(){ensureStyle();ensureMenuEntry();renderStoreCard();return true}

const api={open,install,importFile,renderStoreCard,visitsFor,suggestedStoreFields,
  prioritySummary,parseMission,cleanMission};
root.StoreRunnerPerformanceUIV190=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  root.document.addEventListener('store-runner:home-rendered',install);
  root.document.addEventListener('store-runner:data-restored',install);
  root.document.addEventListener('store-runner:planning-updated',renderStoreCard);
}
})(typeof window!=='undefined'?window:globalThis);
