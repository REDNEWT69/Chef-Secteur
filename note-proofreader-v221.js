(function(root){
'use strict';
const DEFAULT_GATEWAY='https://chef-secteur-ai.rednewtizi.workers.dev';

function text(v){return String(v==null?'':v).trim()}
function cleanReply(value){
  let out=text(value).replace(/^```(?:text|markdown)?\s*/i,'').replace(/\s*```$/i,'').trim();
  out=out.replace(/^(?:texte\s+corrig[eé]|correction|version\s+corrig[eé]e)\s*:\s*/i,'').trim();
  if((out.startsWith('"')&&out.endsWith('"'))||(out.startsWith('“')&&out.endsWith('”')))out=out.slice(1,-1).trim();
  return out
}
function buildPrompt(value,label){
  const source=text(value),field=text(label)||'note terrain';
  return [
    'Corrige uniquement le texte ci-dessous pour un compte rendu terrain professionnel en français.',
    'Champ : '+field+'.',
    'Règles impératives :',
    '- corrige orthographe, accords, conjugaison, ponctuation et mots manifestement mal saisis ;',
    '- améliore légèrement la lisibilité sans changer le sens ni ajouter une information ;',
    '- conserve les faits, chiffres, prénoms, enseignes, villes, références et noms de produits ;',
    '- conserve exactement les termes métier et marques comme OLED, Neo QLED, Mini LED, QLED, Q-Symphony, SmartThings, Samsung, TCL, Boulanger, Darty et Electro Dépôt lorsqu’ils sont présents ;',
    '- ne transforme pas la note en analyse, recommandation ou résumé ;',
    '- ne réponds avec aucune introduction, explication, guillemets ou markdown ;',
    '- renvoie uniquement le texte corrigé.',
    '',
    'TEXTE :',
    source
  ].join('\n')
}
async function correct(value,options){
  options=options||{};const source=text(value);if(!source)throw new Error('Écris une note avant de la corriger.');
  if(source.length>12000)throw new Error('Cette note est trop longue pour le correcteur.');
  if(root.navigator&&root.navigator.onLine===false)throw new Error('Correcteur indisponible hors ligne.');
  const gateway=text(options.gateway||(root.aiConfig&&root.aiConfig.gateway)||DEFAULT_GATEWAY);
  if(!gateway)throw new Error('Passerelle IA indisponible.');
  const fetchFn=options.fetch||root.fetch;if(typeof fetchFn!=='function')throw new Error('Connexion IA indisponible.');
  const response=await fetchFn(gateway,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'assistant',message:buildPrompt(source,options.label),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}})});
  let data={};try{data=await response.json()}catch(e){}
  if(!response.ok)throw new Error(text(data.error)||('Correcteur indisponible ('+response.status+').'));
  const corrected=cleanReply(data.text||data.reply||data.answer||data.message||'');
  if(!corrected)throw new Error('Le correcteur n’a renvoyé aucun texte.');
  return corrected
}
function ensureStyle(){
  if(!root.document||root.document.getElementById('srNoteProofreaderStyle'))return;
  const style=root.document.createElement('style');style.id='srNoteProofreaderStyle';style.textContent='\n.sr-noteProof{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 12px}.sr-noteProofBtn{min-height:38px;padding:8px 12px;border-radius:12px;font-size:13px;font-weight:750}.sr-noteProofStatus{font-size:12px;color:#667085}.sr-noteProofPreview{width:100%;padding:12px;border:1px solid #dbe2ea;border-radius:14px;background:#f8fafc;color:#111827}.sr-noteProofPreview[hidden]{display:none!important}.sr-noteProofPreview b{display:block;margin-bottom:6px;font-size:12px}.sr-noteProofPreview p{margin:0 0 10px;white-space:pre-wrap;line-height:1.45;font-size:14px}.sr-noteProofActions{display:flex;gap:8px}.sr-noteProofActions button{min-height:38px;padding:8px 12px;border-radius:11px}@media(max-width:420px){.sr-noteProof{align-items:stretch}.sr-noteProofBtn{width:auto}.sr-noteProofPreview{box-sizing:border-box}.sr-noteProofActions button{flex:1}}';root.document.head.appendChild(style)
}
function attach(labelNode,input,options){
  options=options||{};if(!root.document||!labelNode||!input||input.disabled||input.readOnly||input.dataset.noteProofreader==='1')return false;
  ensureStyle();input.dataset.noteProofreader='1';input.setAttribute('spellcheck','true');input.setAttribute('autocorrect','on');
  const row=root.document.createElement('div');row.className='sr-noteProof';
  const button=root.document.createElement('button');button.type='button';button.className='secondary sr-noteProofBtn';button.textContent='✨ Corriger';
  const status=root.document.createElement('span');status.className='sr-noteProofStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const preview=root.document.createElement('div');preview.className='sr-noteProofPreview';preview.hidden=true;
  const heading=root.document.createElement('b');heading.textContent='Proposition corrigée';
  const proposed=root.document.createElement('p');
  const actions=root.document.createElement('div');actions.className='sr-noteProofActions';
  const apply=root.document.createElement('button');apply.type='button';apply.className='primary';apply.textContent='Appliquer';
  const cancel=root.document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Annuler';
  actions.append(apply,cancel);preview.append(heading,proposed,actions);row.append(button,status,preview);
  if(labelNode.parentNode)labelNode.insertAdjacentElement('afterend',row);else return false;
  let suggestion='';
  function hide(){preview.hidden=true;suggestion=''}
  button.addEventListener('click',async()=>{
    const source=text(input.value);if(!source){status.textContent='Écris une note avant de la corriger.';hide();return}
    button.disabled=true;button.textContent='Correction…';status.textContent='';hide();
    try{
      suggestion=await correct(source,{label:options.label||'',gateway:options.gateway});
      if(suggestion===source){status.textContent='Aucune correction nécessaire.';return}
      proposed.textContent=suggestion;preview.hidden=false;status.textContent='Vérifie avant d’appliquer.'
    }catch(e){status.textContent=e&&e.message?e.message:String(e)}finally{button.disabled=false;button.textContent='✨ Corriger'}
  });
  apply.addEventListener('click',()=>{if(!suggestion)return;input.value=suggestion;input.dispatchEvent(new Event('input',{bubbles:true}));status.textContent='Correction appliquée et enregistrée.';hide();input.focus()});
  cancel.addEventListener('click',()=>{status.textContent='Texte original conservé.';hide();input.focus()});
  return true
}
const api={buildPrompt,cleanReply,correct,attach};root.StoreRunnerNoteProofreader=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
