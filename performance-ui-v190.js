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
    +'.srPerfCreateV209{margin-top:8px;padding:10px;border:1px solid #cfd9ea;border-radius:14px;background:#f8fbff}.srPerfCreateV209 h4{margin:0 0 8px;font-size:12px}.srPerfCreateGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.srPerfCreateGrid label{font-size:10.5px;color:#667085}.srPerfCreateGrid input{box-sizing:border-box;width:100%;min-height:42px;margin-top:4px;border:1px solid #d8dee8;border-radius:10px;padding:8px;background:#fff}.srPerfCreateWide{grid-column:1/-1}.srPerfCreateV209 small{display:block;margin-top:7px;color:#667085;line-height:1.35}@media(max-width:520px){.srPerfCreateGrid{grid-template-columns:1fr}}'
    +'#'+CARD_ID+'{margin-top:8px;padding:10px;border:1px solid #e2e6ed;border-radius:14px;background:#fbfcff;font-size:11.5px;line-height:1.5}'
    +'#'+CARD_ID+' b{font-size:12px}#'+CARD_ID+' .srPerfCardRow{display:block;color:#454b56;margin-top:3px}'
    +'#'+CARD_ID+' button{min-height:44px;width:100%;margin-top:8px;border-radius:12px;border:1px solid #d3d9e3;background:#fff;font-weight:800;font-size:11.5px}'
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
function createStoreEditor(r){
  const P=D(),defaults=suggestedStoreFields(r),box=el('div',undefined,'srPerfCreateV209'),grid=el('div',undefined,'srPerfCreateGrid'),fields={};
  box.append(el('h4','Ajouter ce magasin à mon secteur'));
  function field(label,key,value,type,wide){const l=el('label',label,wide?'srPerfCreateWide':'');const i=el('input');i.type=type||'text';i.value=value||'';i.dataset.v209Field=key;if(type==='number')i.step='any';l.append(i);grid.append(l);fields[key]=i;return i}
  field('Enseigne','enseigne',defaults.enseigne);field('Ville','ville',defaults.ville);
  field('Adresse','adresse','',null,true);field('Code postal','codePostal','');
  field('Latitude','lat','', 'number');field('Longitude','lon','', 'number');
  box.append(grid);
  const lookup=btn('⌕ Rechercher l’adresse',async()=>{
    const G=root.StoreRunnerGeocode;if(!G||typeof G.forward!=='function'){say('Recherche d’adresse indisponible. Tu peux compléter les champs manuellement.',true);return}
    lookup.disabled=true;lookup.textContent='⌕ Recherche…';
    try{
      const q=[text(fields.enseigne.value),text(r.site),text(fields.ville.value)].filter(Boolean).join(' '),found=await G.forward(q);
      fields.adresse.value=found.address||fields.adresse.value;fields.ville.value=found.city||fields.ville.value;fields.codePostal.value=found.postcode||fields.codePostal.value;
      fields.lat.value=Number(found.lat).toFixed(6);fields.lon.value=Number(found.lon).toFixed(6);say('Adresse trouvée ✓ Vérifie puis ajoute le magasin.');
    }catch(e){say(text(e&&e.message)||'Adresse introuvable.',true)}finally{lookup.disabled=false;lookup.textContent='⌕ Rechercher l’adresse'}
  });
  const add=btn('＋ Ajouter au secteur',()=>{
    try{
      const R=root.RegionStores;if(!R||typeof R.commit!=='function')throw new Error('Ajout magasin indisponible. Recharge Store Runner.');
      const enseigne=text(fields.enseigne.value),ville=text(fields.ville.value),adresse=text(fields.adresse.value),codePostal=text(fields.codePostal.value),lat=Number(fields.lat.value),lon=Number(fields.lon.value);
      if(!enseigne||!ville||!adresse||!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Enseigne, ville, adresse et coordonnées sont obligatoires. Utilise « Rechercher l’adresse » ou complète-les manuellement.');
      const slug=(P&&P.norm?P.norm(enseigne+' '+ville):String(enseigne+' '+ville).toLowerCase()).replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,46)||'magasin';
      const store={id:'perf-'+slug+'-'+Date.now().toString(36),enseigne:enseigne,ville:ville,adresse:adresse,codePostal:codePostal,dept:codePostal.slice(0,2),lat:lat,lon:lon,freq:'Mensuel',intervalDays:30,priority:3,active:true,products:['À confirmer'],source:'Fichier performance '+text(oWeek()),sourceName:defaults.sourceName,sourceFetchedAt:new Date().toISOString()};
      if(R.duplicate(store,stores()))throw new Error('Doublon probable : rattache plutôt cette ligne à un magasin déjà présent.');
      if(R.commit([store])!==1)throw new Error('Ce magasin existe déjà ou n’a pas pu être ajouté.');
      P.rememberMatch(db(),r.key,store.id);say('Magasin ajouté et rattaché ✓ '+enseigne+' · '+ville);render();
    }catch(e){say(text(e&&e.message)||'Ajout impossible.',true)}
  },'primary');
  box.append(lookup,add,el('small','Aucun ajout automatique : vérifie toujours l’adresse avant validation. Recherche d’adresse : © OpenStreetMap contributors.'));
  return box;
}
function oWeek(){return activeWeek||''}
/* Appariement manuel : une liste de candidats, jamais un choix fait à la place de
   l'utilisateur. Le choix est retenu pour les semaines suivantes. */
function resolver(r,o){
  const P=D(),wrap=el('div'),select=el('select'),create=btn('＋ Ajouter ce magasin à mon secteur',()=>{const old=wrap.querySelector('.srPerfCreateV209');if(old){old.remove();create.textContent='＋ Ajouter ce magasin à mon secteur';return}wrap.append(createStoreEditor(r));create.textContent='Masquer le formulaire'});
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
  const head=el('div');head.append(tag(r.prio),el('b','Performance '+last.week));
  card.append(head);
  const line=(t)=>card.append(el('span',t,'srPerfCardRow'));
  const st=P.statusOf(r,last.targetPdm);
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
  if(r.comment)line('Mission : '+r.comment);
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

const api={open,install,importFile,renderStoreCard,visitsFor,suggestedStoreFields};
root.StoreRunnerPerformanceUIV190=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  root.document.addEventListener('store-runner:home-rendered',install);
  root.document.addEventListener('store-runner:data-restored',install);
  root.document.addEventListener('store-runner:planning-updated',renderStoreCard);
}
})(typeof window!=='undefined'?window:globalThis);
