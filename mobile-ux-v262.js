/* V262 — confort mobile de Store Runner V1 (Android et iPhone, autour de 390 px).
   Propriétaire unique des comportements de « coque » mobile qui ne relèvent d'aucun
   écran métier. Aucune donnée n'est lue ni écrite, aucune fonction globale n'est
   remplacée : ce module observe des états visibles et appelle des fonctions publiques.

   1. Clavier virtuel — `html[data-sr-keyboard="open"]` pendant la saisie. La barre de
      navigation basse et le bouton IA se retirent : sur Android (viewport
      `interactive-widget=resizes-content`, ignoré par iOS) ils remonteraient sinon
      au-dessus du clavier et masqueraient le champ. Le champ actif reste visible.
   2. Bouton retour Android — une seule entrée d'historique « sentinelle » tant qu'il y
      a quelque chose à refermer : fiche magasin, menu Plus, assistant, puis retour à
      l'accueil depuis un autre onglet. Sans elle, le retour fermait la PWA au milieu
      d'une fiche. Les <dialog> modaux ne sont pas concernés : Chrome les ferme déjà
      nativement au retour (CloseWatcher), sans toucher à l'historique.
   3. Retouches visuelles transverses (feuille `srMobileUxV262`), limitées à ≤ 700 px :
      cibles tactiles ≥ 44 px, bandeau résumé répété retiré des onglets (il reste sur
      l'accueil sous forme de cartes), historique et Mode Runner plus compacts, menu
      Plus homogène et hiérarchisé. */
(function(root){
'use strict';
const doc=root.document;
if(!doc||root.StoreRunnerMobileUX)return;

const CSS=[
'@media(max-width:700px){',
/* Bandeau résumé : il répétait les 4 mêmes cartes (≈ 460 px) en tête de Magasins,
   Historique, Données, Rendez-vous, Secteur et Mode Runner. Déjà masqué sur l'accueil
   et le planning ; l'accueil « Votre activité » porte ces informations. */
'#smartBrief{display:none!important}',
/* Chiffres clés (historique, magasins) : une rangée de 4 tuiles au lieu de 4 cartes de 150 px. */
'#historyKpis.kpis,#storeKpis.kpis{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;margin-bottom:14px!important}',
'.kpis .kpi{min-height:0!important;padding:10px 8px!important;border-radius:16px!important;text-align:center}',
'.kpis .kpi b{display:block;font-size:22px!important}.kpis .kpi span{font-size:10.5px!important;line-height:1.25;margin-top:3px!important}',
/* Historique : une ligne d'adresse, suppression discrète mais toujours 44 px. */
'#historyPanel .historyRow{padding:11px 12px!important;gap:10px!important;min-height:0!important}',
'#historyPanel .historyMain{min-width:0}',
'#historyPanel .historyMain small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'#historyPanel .historyDate{font-size:13px!important;white-space:nowrap}',
'#historyPanel .visitDeleteBtn{min-height:44px!important;min-width:44px!important;padding:0 10px!important;font-size:12px!important;border-radius:12px!important}',
/* Mode Runner : actions secondaires lisibles sur fond sombre, espacement avant « Ensuite ». */
'#terrainPanel .terrainBtns #terrainRouteBtn,#terrainPanel .terrainBtns .secondary{background:rgba(255,255,255,.12)!important;color:#fff!important;border:1px solid rgba(255,255,255,.22)!important;box-shadow:none!important}',
'#terrainPanel .terrainBtns button{min-height:48px!important}',
'#terrainPanel .terrainNext{margin-top:14px}',
/* Menu Plus : un seul style, les usages quotidiens d\'abord, les réglages ensuite. */
'#moreSheetV2 .moreSheetCard{max-height:calc(100dvh - 104px - env(safe-area-inset-bottom));overflow:auto;overscroll-behavior:contain}',
'#moreSheetV2 .moreSheetGrid>button{order:20;min-height:52px!important;border:0!important;border-radius:16px!important;background:rgba(235,238,244,.8)!important;color:#1d1d1f!important;font-weight:700!important;box-shadow:none!important}',
'#moreSheetV2 .moreSheetGrid>[data-go="storesPanel"]{display:none!important}',
'#moreSheetV2 .moreSheetGrid>[data-go="appointmentsPanel"]{order:1}#moreSheetV2 .moreSheetGrid>[data-go="terrainPanel"]{order:2}',
'#moreSheetV2 .moreSheetGrid>[data-go="historyPanel"]{order:3}#moreSheetV2 .moreSheetGrid>#srOpportunitySectorBtn{order:4}',
'#moreSheetV2 .moreSheetGrid>#srBriefMenuButton{order:5}#moreSheetV2 .moreSheetGrid>[data-pilotage]{order:6}',
'#moreSheetV2 .moreSheetGrid>#srPerfMenuButton{order:7}#moreSheetV2 .moreSheetGrid>#srCuisineMenuButton{order:8}',
'#moreSheetV2 .moreSheetGrid>:is([data-go="profilePanel"],[data-go="importPanel"],#storeRunnerUpdateMenuButton,#storeRunnerWhatsNewMenuButton){order:30;min-height:46px!important;background:transparent!important;border:1px solid rgba(60,60,67,.14)!important;color:#3a3f47!important;font-weight:650!important}',
'#moreSheetV2 .moreClose{min-height:48px;margin-top:10px;background:rgba(235,238,244,.8)!important;color:#1d1d1f!important;box-shadow:none!important}',
/* Cibles tactiles relevées au 390 px (audit V262). */
'.phTerrainOpen{min-height:44px;display:inline-flex;align-items:center}',
'[data-sr-hub]{min-height:44px!important}',
'#planPanel button.pmvAdd{min-height:44px!important}',
'#routeCompactCard button{min-height:44px!important}',
'#planPanel #proOptimizeDay{min-height:44px!important}',
'#appointmentsPanel button,#profilePanel button{min-height:44px}',
'details>summary{min-height:44px;display:flex;align-items:center;gap:6px}',
/* Magasins : les champs passent à 16 px (anti-zoom iOS) ; la rangée Imposer / Exclure /
   jour fixe / ✎ se range donc en deux lignes nettes au lieu d'un ✎ de 26 px orphelin. */
'#storesPanel .storeline .flags{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 48px;gap:6px!important;width:100%}',
'#storesPanel .storeline .flags>button{min-height:44px!important;font-size:13px!important;padding:6px 8px!important;border-radius:12px!important}',
'#storesPanel .storeline .flags>select{order:2;grid-column:1/-1;min-height:44px!important;padding:8px 12px!important;border-radius:12px!important;width:100%!important}',
'.sr-photoLink{min-height:44px!important}',
'#srVisitDialog .sr-head button,#srVisitDialog [role="tab"]{min-height:44px!important}',
/* Clavier ouvert : rien de fixe ne recouvre le champ. */
'html[data-sr-keyboard="open"] #bottomAppNav,html[data-sr-keyboard="open"] #assistFab{display:none!important}',
'}'
].join('');

function ensureStyle(){
  if(doc.getElementById('srMobileUxV262'))return;
  const s=doc.createElement('style');s.id='srMobileUxV262';s.textContent=CSS;(doc.head||doc.documentElement).appendChild(s);
}

/* ---------------------------------------------------------------- clavier */
const EDITABLE_INPUT=/^(text|search|email|tel|url|number|password|date|time|datetime-local|month|week)$/;
function isEditable(el){
  if(!el||el.disabled||el.readOnly)return false;
  if(el.isContentEditable)return true;
  const tag=el.tagName;
  if(tag==='TEXTAREA')return true;
  if(tag==='INPUT')return EDITABLE_INPUT.test(String(el.type||'text').toLowerCase());
  return false;
}
let baseline={w:0,h:0};
function viewportHeight(){const vv=root.visualViewport;return vv?vv.height:root.innerHeight}
function refreshBaseline(){
  const w=root.innerWidth,h=Math.max(root.innerHeight||0,viewportHeight()||0);
  /* Nouvelle orientation ou nouvelle largeur : nouvelle référence. */
  if(Math.abs(w-baseline.w)>40){baseline={w,h};return}
  if(!keyboardOpen()&&h>baseline.h)baseline.h=h;
}
function keyboardOpen(){return doc.documentElement.getAttribute('data-sr-keyboard')==='open'}
function syncKeyboard(){
  const active=doc.activeElement;
  const typing=isEditable(active);
  /* Clavier = champ actif ET écran visiblement réduit (≥ 120 px) : un clavier matériel ou
     une simple sélection ne change rien. */
  const shrunk=baseline.h>0&&viewportHeight()<baseline.h-120;
  const open=typing&&shrunk;
  const html=doc.documentElement;
  if(open!==keyboardOpen()){
    if(open)html.setAttribute('data-sr-keyboard','open');else html.removeAttribute('data-sr-keyboard');
  }
  if(open)revealField(active);
}
function revealField(el){
  const vv=root.visualViewport,r=el.getBoundingClientRect();
  const top=vv?vv.offsetTop:0,bottom=top+(vv?vv.height:root.innerHeight);
  if(r.top<top+8||r.bottom>bottom-8){try{el.scrollIntoView({block:'center',inline:'nearest'})}catch(e){el.scrollIntoView()}}
}
let keyboardFrame=0;
function scheduleKeyboard(){if(keyboardFrame)return;keyboardFrame=root.requestAnimationFrame(()=>{keyboardFrame=0;refreshBaseline();syncKeyboard()})}
function installKeyboard(){
  refreshBaseline();
  doc.addEventListener('focusin',scheduleKeyboard);
  doc.addEventListener('focusout',()=>root.setTimeout(scheduleKeyboard,0));
  if(root.visualViewport)root.visualViewport.addEventListener('resize',scheduleKeyboard);
  root.addEventListener('resize',scheduleKeyboard);
  root.addEventListener('orientationchange',()=>{baseline={w:0,h:0};scheduleKeyboard()});
}

/* ---------------------------------------------------------- retour Android */
function byId(id){return doc.getElementById(id)}
function activePanelId(){const p=doc.querySelector('.panel.active');return p?p.id:''}
/* Du plus haut au plus bas : ce que le retour referme en premier. */
const CLOSABLES=[
  {name:'assistant',open:()=>{const p=byId('assistantPanel');return !!(p&&p.classList.contains('open'))},close:()=>{if(typeof root.toggleAssistant==='function')root.toggleAssistant();else byId('assistantPanel').classList.remove('open')}},
  {name:'more',open:()=>{const m=byId('moreSheetV2');return !!(m&&m.classList.contains('open'))},close:()=>byId('moreSheetV2').classList.remove('open')},
  {name:'store',open:()=>{const s=byId('storeQuickSheet');return !!(s&&s.classList.contains('open'))},close:()=>{if(typeof root.closeStoreQuick==='function')root.closeStoreQuick();else byId('storeQuickSheet').classList.remove('open')}},
  {name:'tab',open:()=>{const id=activePanelId();return !!id&&id!=='homePanel'},close:()=>{if(typeof root.goTab==='function')root.goTab('homePanel')}}
];
function topClosable(){return CLOSABLES.find(c=>{try{return c.open()}catch(e){return false}})||null}
function onSentinel(){const s=root.history&&root.history.state;return !!(s&&s.srBack===1)}
/* Seule une sentinelle posée par CETTE page est consommée : après un rechargement,
   l'entrée précédente appartient à l'ancien document et y revenir rechargerait l'app. */
let sentinelActive=false,ignorePop=0;
function syncHistory(){
  if(!root.history||typeof root.history.pushState!=='function')return;
  const need=!!topClosable();
  if(need&&!(sentinelActive&&onSentinel())){
    try{root.history.pushState({srBack:1},'',root.location.href);sentinelActive=true}catch(e){}
  }else if(!need&&sentinelActive&&onSentinel()){
    /* Refermé depuis l'interface : on consomme la sentinelle, sinon le prochain retour
       ne ferait rien. */
    sentinelActive=false;ignorePop++;
    try{root.history.back()}catch(e){ignorePop--}
  }
}
function onPopState(){
  if(ignorePop>0){ignorePop--;return}
  /* Une navigation qui ne vient pas de notre sentinelle ne referme rien. */
  if(!sentinelActive||onSentinel())return;
  sentinelActive=false;
  const c=topClosable();
  if(c){try{c.close()}catch(e){}}
  /* Encore quelque chose à refermer (onglet sous une fiche) : nouvelle sentinelle. */
  root.setTimeout(syncHistory,0);
}
let historyTimer=0;
function scheduleHistory(){if(historyTimer)return;historyTimer=root.setTimeout(()=>{historyTimer=0;syncHistory()},0)}
const watched=new WeakSet();
let classObserver=null;
function watch(el){if(!el||watched.has(el)||!classObserver)return;watched.add(el);classObserver.observe(el,{attributes:true,attributeFilter:['class']})}
function watchKnown(){
  ['assistantPanel','moreSheetV2','storeQuickSheet'].forEach(id=>watch(byId(id)));
  doc.querySelectorAll('.panel').forEach(watch);
}
function installBack(){
  if(!root.history||!root.MutationObserver)return;
  /* Les entrées sentinelles partagent l'URL de l'app : sans ceci, chaque retour
     restaurerait un ancien défilement et ferait sauter la page. L'app démarre toujours
     sur l'accueil, la restauration au rechargement n'apportait rien. */
  try{if('scrollRestoration' in root.history)root.history.scrollRestoration='manual'}catch(e){}
  /* Sentinelle héritée d'avant un rechargement : neutralisée, jamais consommée. */
  if(onSentinel()){try{root.history.replaceState(null,'',root.location.href)}catch(e){}}
  classObserver=new root.MutationObserver(scheduleHistory);
  watchKnown();
  /* Menu Plus et panneau Pilotage sont créés plus tard par leurs modules : on ne suit que
     les ajouts d'enfants directs de <body> et du conteneur des panneaux. */
  const adds=new root.MutationObserver(()=>{watchKnown();scheduleHistory()});
  adds.observe(doc.body,{childList:true});
  const wrap=doc.querySelector('.wrap');if(wrap)adds.observe(wrap,{childList:true});
  root.addEventListener('popstate',onPopState);
  scheduleHistory();
}

function install(){
  if(!doc.body){doc.addEventListener('DOMContentLoaded',install,{once:true});return}
  ensureStyle();installKeyboard();installBack();
}

root.StoreRunnerMobileUX={install,isEditable,keyboardOpen,topClosable:()=>{const c=topClosable();return c?c.name:null}};
install();
})(typeof window!=='undefined'?window:globalThis);
