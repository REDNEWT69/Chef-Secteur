/* Store Runner V246 — interface minimale du brief hebdomadaire.

   Ce module possède la feuille #srBriefSheet, son entrée du menu « Plus » et le bloc
   #sqWeeklyBrief de la fiche magasin. Il ne redéfinit aucune fonction globale, ne touche
   ni à la carte Performance (#sqPerformance), ni au planning, ni à `store.priority`.

   Les écritures passent toutes par StoreRunnerWeeklyBriefV246 puis `save()` : si
   l'enregistrement échoue, l'état précédent des briefs est remis en place. */
(function(root){
'use strict';

const SHEET_ID='srBriefSheet';
const MENU_BTN_ID='srBriefMenuButton';
const CARD_ID='sqWeeklyBrief';
const EVENT='store-runner:weekly-brief-updated';
let sheet=null,week='',quickObserver=null,cardQueued=false,cardSignature='';

function B(){return root.StoreRunnerWeeklyBriefV246||null}
function st(){return root.state||null}
function text(v){return String(v==null?'':v).trim()}
function el(tag,txt,cls){const n=root.document.createElement(tag);if(txt!==undefined&&txt!==null)n.textContent=txt;if(cls)n.className=cls;return n}
function btn(txt,fn,cls){const b=el('button',txt,cls||'secondary');b.type='button';b.addEventListener('click',fn);return b}
function field(label,input){const w=el('label',undefined,'srBriefField');w.append(el('span',label),input);return w}
function input(type,value,attrs){const i=el('input');i.type=type;if(value!==undefined)i.value=value;Object.entries(attrs||{}).forEach(([k,v])=>i.setAttribute(k,v));return i}
function select(options,value){const s=el('select');for(const [v,l] of options){const o=el('option',l);o.value=v;s.append(o)}if(value!==undefined)s.value=value;return s}
function currentWeek(){const api=B();return api?api.activeWeek(new Date()):''}
function stamp(v){const d=new Date(v);if(isNaN(d))return'';return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}

function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-brief-style'))return;
  const s=el('style');s.id='sr-brief-style';
  s.textContent='#'+SHEET_ID+'{box-sizing:border-box;width:min(760px,calc(100vw - 20px));max-width:calc(100vw - 20px);max-height:calc(100dvh - 20px);overflow:auto;padding:16px;border-radius:24px;border:1px solid #d9dce3;background:#fff;color:#1d1d1f}'
    +'#'+SHEET_ID+'::backdrop{background:rgba(17,24,39,.45)}'
    +'#'+SHEET_ID+' h2{margin:0;font-size:20px}#'+SHEET_ID+' h3{font-size:14px;margin:0 0 6px}'
    +'.srBriefSub{margin:4px 0 0;color:#667085;font-size:12px}'
    +'.srBriefNav{display:grid;grid-template-columns:48px 1fr 48px;gap:8px;margin:12px 0}.srBriefNav button{min-height:46px;border-radius:13px;font-weight:800;font-size:13px}'
    +'.srBriefSection{margin-top:14px}'
    +'.srBriefEmpty{padding:16px 10px;text-align:center;color:#667085;font-size:12px;border:1px dashed #d8dee8;border-radius:14px}'
    +'.srBriefField{display:block;margin:8px 0;font-size:11.5px;font-weight:750;color:#475467}.srBriefField>span{display:block;margin-bottom:4px}'
    +'.srBriefField input,.srBriefField select,.srBriefField textarea{box-sizing:border-box;width:100%;min-height:44px;border-radius:12px;border:1px solid #d3d9e3;padding:8px 10px;font-size:14px;background:#fff;color:#1d1d1f}'
    +'.srBriefField textarea{min-height:110px;resize:vertical;font-size:13px;line-height:1.45}'
    +'.srBriefGrid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}'
    +'.srBriefCheck{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:12.5px;font-weight:700}.srBriefCheck input{width:22px;height:22px}'
    +'#'+SHEET_ID+' .srBriefActions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:8px}#'+SHEET_ID+' .srBriefActions button,.srBriefWide{min-height:46px;width:100%;border-radius:13px;font-weight:800;font-size:12.5px}'
    +'.srBriefRule{border:1px solid #e2e6ed;border-radius:14px;padding:10px;margin:8px 0;background:#fff;font-size:12px;line-height:1.45}'
    +'.srBriefRule b{font-size:13px;overflow-wrap:anywhere}.srBriefRule .srBriefMeta{display:block;color:#667085;margin-top:3px;overflow-wrap:anywhere}'
    +'.srBriefRule .srBriefRow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.srBriefRule .srBriefRow button{min-height:44px;border-radius:12px;font-weight:800;font-size:11.5px}'
    +'.srBriefTag{display:inline-block;padding:3px 8px;border-radius:8px;font-weight:800;font-size:10.5px;margin:0 6px 4px 0;border:1px solid #d7ddf5;background:#eef2ff;color:#334155}'
    +'.srBriefTag.boost{background:#e9f7ef;color:#1a6b42;border-color:#bfe5d0}.srBriefTag.suspend{background:#fff5e6;color:#8a5200;border-color:#f6ddb4}'
    +'.srBriefTag.deadline{background:#fdecea;color:#a3261c;border-color:#f3c3bd}.srBriefTag.performance{background:#fdecea;color:#a3261c;border-color:#f3c3bd}'
    +'.srBriefTag.muted{background:#f2f4f7;color:#667085;border-color:#e4e7ec}'
    +'.srBriefStatus{min-height:18px;font-size:12px;color:#315b9d;margin:8px 0}.srBriefStatus.srBriefError{color:#b42318}'
    +'.srBriefDetails>summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:800;font-size:13px;color:#315b9d}'
    +'#'+CARD_ID+'{margin-top:8px;padding:10px;border:1px solid #e2e6ed;border-radius:14px;background:#fbfcff;font-size:11.5px;line-height:1.5}'
    +'#'+CARD_ID+' .srBriefCardHead{display:flex;align-items:center;gap:4px;flex-wrap:wrap}#'+CARD_ID+' .srBriefCardHead b{font-size:13px;margin-right:6px}'
    +'#'+CARD_ID+' .srBriefLine{display:block;color:#454b56;margin-top:3px;overflow-wrap:anywhere}'
    +'#'+CARD_ID+' button{min-height:44px;width:100%;margin-top:8px;border-radius:12px;border:1px solid #d3d9e3;background:#fff;font-weight:800;font-size:11.5px}'
    +'@media(max-width:520px){.srBriefGrid{grid-template-columns:1fr}}';
  root.document.head.appendChild(s);
}
function say(msg,error){const box=sheet&&sheet.querySelector('#srBriefStatus');if(box){box.textContent=msg||'';box.classList.toggle('srBriefError',!!error)}}

/* Toute écriture : mutation par la couche pure, enregistrement, sinon retour arrière. */
function commit(mutate,okMessage){
  const api=B(),s=st();
  if(!api||!s)return false;
  const had=Object.prototype.hasOwnProperty.call(s,'weeklyBriefs'),before=had?JSON.parse(JSON.stringify(s.weeklyBriefs)):undefined;
  try{
    mutate(api,s);
    if(typeof root.save==='function')root.save();
  }catch(e){
    if(had)s.weeklyBriefs=before;else delete s.weeklyBriefs;
    say(text(e&&e.message)||'Enregistrement impossible.',true);
    return false;
  }
  try{root.document.dispatchEvent(new root.CustomEvent(EVENT,{detail:{week}}))}catch(e){}
  render();say(okMessage||'Enregistré sur cet appareil.');
  return true;
}

/* ------------------------------------------------------------ lecture des règles ---- */
function scopeText(r,api){
  const s=r.scope||{},parts=[];
  if(s.family&&s.family!=='all')parts.push(api.FAMILY_LABELS[s.family]);
  if(s.brands&&s.brands.length)parts.push('Enseignes : '+s.brands.join(', '));
  if(s.basePrio)parts.push('Seulement les '+s.basePrio);
  if(s.storeIds&&s.storeIds.length)parts.push(s.storeIds.length+' magasin'+(s.storeIds.length>1?'s':''));
  return parts.length?parts.join(' · '):(r.type==='note'?'Consigne générale':'Tout le secteur');
}
function effectText(r,api){
  if(r.type==='boost')return (r.boost>0?'+':'')+r.boost+' de priorité';
  if(r.type==='suspend')return 'Neutralise la '+api.TARGET_LABELS[r.target]+' (donnée source conservée)';
  if(r.type==='deadline')return (r.dueDate?'Avant le '+api.dateLabel(r.dueDate):'Échéance sans date')+(r.boost?' · '+(r.boost>0?'+':'')+r.boost:'');
  return 'Information';
}
function validityText(r,api){
  const span=r.validFrom===r.validTo?api.shortWeek(r.validFrom)+' seulement':api.shortWeek(r.validFrom)+' → '+api.shortWeek(r.validTo);
  return span+(r.inherited?' · vient du brief '+api.shortWeek(r.briefWeek):'');
}
function ruleCard(r,api,options){
  const o=options||{},box=el('div',undefined,'srBriefRule'),head=el('div');
  head.append(el('span',api.TYPE_LABELS[r.type],'srBriefTag '+r.type));
  if(r.confidence!=='confirmed')head.append(el('span','À confirmer','srBriefTag'));
  head.append(el('b',r.label));
  box.append(head,el('span',scopeText(r,api)+' · '+effectText(r,api),'srBriefMeta'),el('span',validityText(r,api)+(r.pending?' · en attente : '+r.pending:''),'srBriefMeta'));
  if(o.editable){
    const row=el('div',undefined,'srBriefRow');
    if(r.confidence!=='confirmed')row.append(btn('Confirmer',()=>commit((a,s)=>a.confirmRule(s,week,r.id),'Règle confirmée : elle compte dès maintenant.'),'primary'));
    row.append(btn('Retirer',()=>{
      if(typeof root.confirm==='function'&&!root.confirm('Retirer « '+r.label+' » du brief '+api.shortWeek(week)+' ? La version précédente reste dans l’historique.'))return;
      commit((a,s)=>a.removeRule(s,week,r.id),'Règle retirée. La version précédente reste dans l’historique.');
    }));
    box.append(row);
  }
  return box;
}

/* --------------------------------------------------------------------- feuille ------ */
function ensureSheet(){
  if(sheet)return sheet;
  if(!root.document)return null;
  ensureStyle();
  sheet=el('dialog');sheet.id=SHEET_ID;sheet.setAttribute('aria-labelledby','srBriefTitle');
  const head=el('div');head.append(Object.assign(el('h2','Brief de la semaine'),{id:'srBriefTitle'}),Object.assign(el('p','','srBriefSub'),{id:'srBriefSubtitle'}));
  const nav=el('div',undefined,'srBriefNav');
  nav.append(Object.assign(btn('‹',()=>go(-1)),{id:'srBriefPrev'}),Object.assign(btn('Semaine en cours',()=>{week=currentWeek();render()}),{id:'srBriefToday'}),Object.assign(btn('›',()=>go(1)),{id:'srBriefNext'}));
  nav.querySelector('#srBriefPrev').setAttribute('aria-label','Semaine précédente');
  nav.querySelector('#srBriefNext').setAttribute('aria-label','Semaine suivante');
  const status=el('p','','srBriefStatus');status.id='srBriefStatus';status.setAttribute('role','status');
  const body=el('div');body.id='srBriefBody';
  const actions=el('div',undefined,'srBriefActions');actions.append(Object.assign(btn('Fermer',()=>{if(sheet.open)sheet.close()}),{id:'srBriefClose'}));
  sheet.append(head,nav,status,body,actions);
  sheet.addEventListener('cancel',e=>{e.preventDefault();sheet.close()});
  root.document.body.appendChild(sheet);
  return sheet;
}
function go(delta){const api=B();if(api){week=api.shiftWeek(week||currentWeek(),delta);say('');render()}}
function open(targetWeek){
  const api=B();if(!api||!root.document)return false;
  ensureSheet();
  week=api.validWeek(targetWeek)?targetWeek:(week||currentWeek());
  say('');
  if(typeof sheet.showModal==='function'&&!sheet.open)sheet.showModal();else sheet.setAttribute('open','');
  render();
  return true;
}
function briefForm(api,brief){
  const box=el('section',undefined,'srBriefSection');
  box.append(el('h3','Feuille de route'));
  const title=input('text',brief.title,{maxlength:'120'});title.id='srBriefTitleInput';
  const file=input('text',brief.source.fileName,{maxlength:'160',placeholder:'ex. Feuille de route W39.pdf'});file.id='srBriefFileInput';
  const excerpt=el('textarea');excerpt.id='srBriefExcerpt';excerpt.maxLength=api.EXCERPT_MAX;excerpt.value=brief.source.excerpt;excerpt.placeholder='Colle ici le texte reçu. Il est gardé tel quel, sur cet appareil.';
  box.append(field('Titre',title),field('Fichier reçu (facultatif)',file),field('Texte du brief',excerpt));
  box.append(el('span','Révision '+brief.revision+(brief.updatedAt?' · mise à jour le '+stamp(brief.updatedAt):'')+(brief.source.fileName?' · fichier : '+brief.source.fileName:''),'srBriefSub'));
  const save=btn('Enregistrer la feuille de route',()=>commit((a,s)=>a.saveBrief(s,week,{
    title:title.value,source:{kind:excerpt.value.trim()?'text':'manual',fileName:file.value,excerpt:excerpt.value,importedAt:brief.source.importedAt||new Date().toISOString()}
  }),'Feuille de route '+api.shortWeek(week)+' enregistrée.'),'primary srBriefWide');
  save.id='srBriefSave';
  box.append(save);
  return box;
}
function ruleForm(api){
  const wrap=el('details',undefined,'srBriefDetails srBriefSection');wrap.id='srBriefAddRule';
  wrap.append(el('summary','➕ Ajouter une règle'));
  const type=select(Object.entries(api.TYPE_LABELS),'boost');type.id='srBriefRuleType';
  const label=input('text','',{maxlength:'160',placeholder:'ex. Challenge Darty — moniteurs'});label.id='srBriefRuleLabel';
  const family=select([['all','Toutes familles'],['brun','BRUN'],['blanc','BLANC']],'all');family.id='srBriefRuleFamily';
  const brands=input('text','',{placeholder:'ex. Darty, Boulanger'});brands.id='srBriefRuleBrands';
  const prio=select([['','Tous les magasins'],['P1','Seulement les P1'],['P2','Seulement les P2']],'');prio.id='srBriefRulePrio';
  const boost=input('number','20',{min:String(-api.BOOST_LIMIT),max:String(api.BOOST_LIMIT),step:'5',inputmode:'numeric'});boost.id='srBriefRuleBoost';
  const target=select([['performance','Priorité performance (P1/P2)'],['structural','Priorité structurelle (fiche)']],'performance');target.id='srBriefRuleTarget';
  const due=input('date','');due.id='srBriefRuleDue';
  const until=select([0,1,2,3,4].map(n=>[String(n),n?'Jusqu’à '+api.shortWeek(api.shiftWeek(week,n)):'Cette semaine seulement']),'0');until.id='srBriefRuleUntil';
  const pending=input('text','',{maxlength:'120',placeholder:'ex. Confirmation SEF'});pending.id='srBriefRulePending';
  const confirmed=input('checkbox');confirmed.checked=true;confirmed.id='srBriefRuleConfirmed';
  const check=el('label',undefined,'srBriefCheck');check.append(confirmed,el('span','Règle confirmée (sinon elle attend validation et ne compte pas)'));
  const fBoost=field('Effet sur la priorité (−100 à +100)',boost),fTarget=field('Contribution à neutraliser',target),fDue=field('Échéance',due);
  const grid=el('div',undefined,'srBriefGrid');
  grid.append(field('Type',type),field('Famille',family),field('Enseignes (virgules)',brands),field('Magasins visés',prio),fBoost,fTarget,fDue,field('Validité',until));
  const sync=()=>{const t=type.value;fBoost.hidden=!(t==='boost'||t==='deadline');fTarget.hidden=t!=='suspend';fDue.hidden=t!=='deadline';if(t==='deadline'&&boost.value==='20')boost.value='0';};
  type.addEventListener('change',sync);sync();
  const add=btn('Ajouter la règle',()=>{
    const t=type.value,name=label.value.trim();
    if(!name){say('Donne un libellé à la règle : c’est lui qui s’affiche sur la fiche magasin.',true);return}
    if(t==='deadline'&&!due.value){say('Indique la date limite de l’échéance.',true);return}
    const n=Number(boost.value);
    if(t==='boost'&&(!Number.isFinite(n)||n===0)){say('Un renforcement a besoin d’un effet différent de 0.',true);return}
    const rule={type:t,label:name,origin:'manual',confidence:confirmed.checked?'confirmed':'ambiguous',pending:pending.value,
      scope:{family:family.value,brands:brands.value.split(',').map(x=>x.trim()).filter(Boolean),basePrio:prio.value||null},
      validFrom:week,validTo:api.shiftWeek(week,Number(until.value)||0)};
    if(t==='boost'||t==='deadline')rule.boost=Number.isFinite(n)?n:0;
    if(t==='suspend')rule.target=target.value;
    if(t==='deadline')rule.dueDate=due.value;
    if(commit((a,s)=>a.addRule(s,week,rule),'Règle ajoutée au brief '+api.shortWeek(week)+'.')){label.value='';brands.value='';pending.value=''}
  },'primary srBriefWide');
  add.id='srBriefRuleAdd';
  wrap.append(field('Libellé',label),grid,field('En attente de (facultatif)',pending),check,add);
  return wrap;
}
function storesSection(api){
  const box=el('section',undefined,'srBriefSection');
  let lot;
  try{lot=api.effectivePriorities(week)}catch(e){lot={rows:[]}}
  const rows=lot.rows.filter(r=>r.touchedByBrief);
  box.append(el('h3','Magasins concernés en '+api.shortWeek(week)+' · '+rows.length));
  if(!rows.length){box.append(el('div','Aucun magasin n’est touché par une règle confirmée cette semaine.','srBriefEmpty'));return box}
  for(const r of rows.slice(0,40)){
    const card=el('div',undefined,'srBriefRule'),head=el('div');
    head.append(el('b',text(r.store.enseigne)+' · '+text(r.store.ville)));
    card.append(head);
    const tags=el('div');
    for(const b of r.badges)tags.append(el('span',b.text,'srBriefTag '+b.kind+(b.muted?' muted':'')));
    card.append(tags);
    for(const line of r.explain.slice(1))card.append(el('span',line,'srBriefMeta'));
    box.append(card);
  }
  if(rows.length>40)box.append(el('p','… et '+(rows.length-40)+' autres magasins.','srBriefSub'));
  if(lot.performance&&lot.performance.week)box.append(el('p','Priorité performance lue dans le fichier '+lot.performance.week+'.','srBriefSub'));
  return box;
}
function historySection(api,brief){
  const wrap=el('details',undefined,'srBriefDetails srBriefSection');wrap.id='srBriefHistory';
  const all=api.listBriefs(st());
  wrap.append(el('summary','🗂️ Historique des briefs · '+all.length+' semaine'+(all.length>1?'s':'')));
  if(!all.length){wrap.append(el('div','Aucun brief enregistré pour l’instant.','srBriefEmpty'));return wrap}
  for(const b of all){
    const item=btn(api.shortWeek(b.week)+' · '+b.title+' · '+b.rules+' règle'+(b.rules>1?'s':'')+(b.ambiguous?' ('+b.ambiguous+' à confirmer)':'')+' · rév. '+b.revision,()=>{week=b.week;say('');render()},'secondary srBriefWide');
    item.dataset.week=b.week;
    if(b.week===week)item.setAttribute('aria-current','true');
    wrap.append(item);
  }
  if(brief&&brief.history.length){
    wrap.append(el('h3','Versions précédentes de '+api.shortWeek(week)));
    for(const h of brief.history)wrap.append(el('span','Révision '+h.revision+(h.savedAt?' · '+stamp(h.savedAt):'')+' · '+h.rules.length+' règle'+(h.rules.length>1?'s':'')+(h.rules.length?' : '+h.rules.map(r=>r.label).join(', '):'')+(typeof h.excerpt==='string'?' · texte précédent conservé':''),'srBriefSub'));
  }
  return wrap;
}
function render(){
  const api=B();if(!sheet||!api)return;
  if(!api.validWeek(week))week=currentWeek();
  const now=currentWeek(),rel=week===now?' · semaine en cours':week<now?' · semaine passée':' · semaine à venir';
  sheet.querySelector('#srBriefSubtitle').textContent=api.shortWeek(week)+' · du '+api.dateLabel(api.weekMonday(week))+' au '+api.dateLabel(api.weekSunday(week))+rel;
  const body=sheet.querySelector('#srBriefBody');body.replaceChildren();
  const s=st(),brief=api.briefForWeek(s,week);
  if(!brief){
    const empty=el('section',undefined,'srBriefSection');
    empty.append(el('div','Aucun brief pour '+api.shortWeek(week)+'. Les priorités restent celles de la fiche et du fichier performance.','srBriefEmpty'));
    const create=btn('Créer le brief '+api.shortWeek(week),()=>commit((a,x)=>a.saveBrief(x,week,{title:'Feuille de route '+api.shortWeek(week)}),'Brief '+api.shortWeek(week)+' créé.'),'primary srBriefWide');
    create.id='srBriefCreate';
    empty.append(create);
    body.append(empty);
  }else body.append(briefForm(api,brief));

  const active=api.rulesForWeek(s,week),pending=brief?brief.rules.filter(r=>r.confidence!=='confirmed').map(r=>Object.assign({},r,{briefWeek:week,inherited:false})):[];
  const rulesBox=el('section',undefined,'srBriefSection');rulesBox.id='srBriefRules';
  rulesBox.append(el('h3','Règles actives en '+api.shortWeek(week)+' · '+active.length));
  if(!active.length)rulesBox.append(el('div','Aucune règle confirmée pour cette semaine.','srBriefEmpty'));
  const order={suspend:0,deadline:1,boost:2,note:3};
  for(const r of active.slice().sort((a,b)=>order[a.type]-order[b.type]))rulesBox.append(ruleCard(r,api,{editable:!r.inherited}));
  if(pending.length){
    rulesBox.append(el('h3','À confirmer · '+pending.length));
    for(const r of pending)rulesBox.append(ruleCard(r,api,{editable:true}));
  }
  body.append(rulesBox);
  if(brief)body.append(ruleForm(api));
  body.append(storesSection(api),historySection(api,brief));
}

/* ------------------------------------------------------------ fiche magasin -------- */
/* Le bloc n'apparaît que si une règle confirmée du brief touche ce magasin cette
   semaine. Sans brief, la carte Performance explique déjà seule le P1/P2. Le bloc est
   construit hors du DOM puis inséré : aucun attribut observé n'est modifié en place, ce
   qui évite de réveiller les observateurs de la fiche. */
function renderStoreCard(){
  cardQueued=false;
  const api=B();if(!api||!root.document)return false;
  const sheetEl=root.document.getElementById('storeQuickSheet'),start=root.document.getElementById('srQuickStart');
  const old=root.document.getElementById(CARD_ID);
  const storeId=start&&start.dataset?text(start.dataset.srStart):'';
  if(!sheetEl||!storeId){if(old)old.remove();cardSignature='';return false}
  const anchor=root.document.getElementById('sqPerformance')||root.document.getElementById('sqVisitCredit')||root.document.getElementById('sqAddress');
  if(!anchor){if(old)old.remove();cardSignature='';return false}
  let r=null;
  try{r=api.effectivePriority(storeId,currentWeek())}catch(e){r=null}
  if(!r||!r.touchedByBrief){if(old)old.remove();cardSignature='';return false}
  const signature=storeId+'|'+JSON.stringify([r.badges,r.explain,r.deadline]);
  if(old&&signature===cardSignature)return true;
  ensureStyle();
  const card=el('section');card.id=CARD_ID;card.setAttribute('aria-label','Priorité de la semaine');
  const head=el('div',undefined,'srBriefCardHead');
  head.append(el('b','Priorité '+api.shortWeek(r.week)));
  for(const b of r.badges)head.append(el('span',b.text,'srBriefTag '+b.kind+(b.muted?' muted':'')));
  card.append(head);
  for(const line of r.explain)card.append(el('span',line,'srBriefLine'));
  if(r.deadline){
    const d=r.deadline;
    card.append(el('span',d.doneDate?'✅ '+d.label+' : visité le '+api.dateLabel(d.doneDate):d.overdue?'🔴 '+d.label+' : échéance du '+api.dateLabel(d.dueDate)+' dépassée':'⏳ '+d.label+' : avant le '+api.dateLabel(d.dueDate),'srBriefLine'));
  }
  card.append(btn('Voir le brief '+api.shortWeek(r.week),()=>open(r.week)));
  if(old)old.replaceWith(card);else anchor.insertAdjacentElement('afterend',card);
  cardSignature=signature;
  return true;
}
function queueCard(){if(cardQueued)return;cardQueued=true;(root.setTimeout||(f=>f()))(renderStoreCard,0)}
function attachQuickObserver(){
  if(!root.document||quickObserver||typeof root.MutationObserver!=='function')return false;
  const el2=root.document.getElementById('storeQuickSheet');if(!el2)return false;
  quickObserver=new root.MutationObserver(queueCard);
  quickObserver.observe(el2,{attributes:true,subtree:true,attributeFilter:['class','aria-hidden','data-sr-start']});
  return true;
}

/* --------------------------------------------------------------- installation ------- */
function ensureMenuEntry(){
  if(!root.document)return false;
  const grid=root.document.querySelector('#moreSheetV2 .moreSheetGrid');
  if(!grid)return false;
  if(root.document.getElementById(MENU_BTN_ID))return true;
  const b=btn('🗓️ Brief semaine',function(e){
    if(e&&e.preventDefault){e.preventDefault();e.stopPropagation()}
    const more=root.document.getElementById('moreSheetV2');if(more)more.classList.remove('open');
    open(currentWeek());
  });
  b.id=MENU_BTN_ID;b.setAttribute('aria-label','Brief de la semaine');
  grid.appendChild(b);
  return true;
}
function install(){ensureStyle();ensureMenuEntry();attachQuickObserver();queueCard();return true}

const api={open,install,render,renderStoreCard,scopeText,effectText,validityText,EVENT};
root.StoreRunnerWeeklyBriefUIV246=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  root.document.addEventListener('store-runner:home-rendered',install);
  root.document.addEventListener('store-runner:data-restored',()=>{install();if(sheet&&sheet.open)render()});
  root.document.addEventListener('store-runner:planning-updated',queueCard);
  root.document.addEventListener(EVENT,queueCard);
}
})(typeof window!=='undefined'?window:globalThis);
