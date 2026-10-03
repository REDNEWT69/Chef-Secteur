/* Store Runner V1 — interface du Planning Command Engine (Lot B).

   Feuille mobile « Voilà ce que Store Runner va faire » : aperçu lisible jour par jour,
   questions de clarification, choix du point de départ (r38), puis [Annuler] / [Appliquer].
   Ce module ne calcule et n'écrit rien lui-même : il appelle
   StoreRunnerPlanningCommandEngine.run (aucune écriture) puis .apply (après le geste
   explicite « Appliquer »). Tout texte affiché passe par textContent : une désignation de
   magasin ou une phrase utilisateur n'est jamais interprétée comme du HTML.
   Point d'entrée : window.storeRunnerPlanningCommand(texte), appelé par l'assistant avant
   ses réponses locales ou en ligne ; il rend false pour toute phrase qui n'est pas une
   commande planning, laissant l'assistant historique répondre. */
(function(root){
'use strict';
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
