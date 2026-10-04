/* Store Runner V1 — Runner Visual System V1 (`StoreRunnerRunner`, alias `Runner`).

   Runner est le copilote VISUEL de Store Runner : un personnage, quatre états, une bulle.
   Ce module est une couche de présentation pure :
   - il ne lit ni n'écrit aucune donnée (`state`, stockage, IndexedDB, agenda, performance) ;
   - il ne choisit aucun magasin, ne simule rien, n'appelle aucun moteur et n'est appelé par
     aucun moteur : Planning, Forecast, Command Engine et Explorer Terrain ne le connaissent pas
     encore. Les brancher est une décision séparée (voir RUNNER_VISUAL_SYSTEM.md) ;
   - il ne remplace aucune fonction globale et ne s'accroche à aucun événement du document
     (ni `focus`, ni `visibilitychange`, ni `resize`), sans `setInterval` ni observateur.

   Au démarrage il ne fait strictement rien : aucun nœud, aucune feuille de style, aucun
   écouteur. Le style n'est injecté qu'au premier `mount()`. Rien n'est affiché tant qu'un
   propriétaire d'écran n'a pas monté Runner dans son conteneur.

   États : neutral (en attente), analyzing (il réfléchit), alert (une contrainte détectée),
   success (tout est ok). Un état = un attribut `data-state` sur le conteneur ; tous les
   calques du dessin sont déjà dans le SVG, le CSS n'en montre qu'un. Changer d'état ne
   reconstruit donc rien.

   Mouvement : transform/opacité uniquement. Une seule boucle existe — les trois points de
   « analyzing » — et elle est bornée (≈ 22 s) pour qu'un état oublié ne tourne jamais en
   continu. Alerte, succès et changement d'état jouent une seule fois. Avec
   `prefers-reduced-motion: reduce` (ou `motion:'off'`) rien ne bouge : seuls les états changent.

   Texte : toute bulle est écrite avec `textContent`, jamais en HTML. Un nom de magasin ou une
   note utilisateur y est donc inoffensif. */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root){root.StoreRunnerRunner=api;if(!root.Runner)root.Runner=api}
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';

const VERSION=1;
const STATES=Object.freeze(['neutral','analyzing','alert','success']);
const STATE_LABELS=Object.freeze({neutral:'En attente',analyzing:'Il réfléchit',alert:'Une contrainte détectée',success:'Tout est ok'});
const ACCESSIBLE_NAME='Runner, copilote terrain';
const SIDES=Object.freeze(['right','left','top','bottom']);
const SIZES=Object.freeze({sm:56,md:88,lg:128,xl:176});
const SIZE_MIN=32,SIZE_MAX=320;
const TEXT_MAX=280,TITLE_MAX=60;
const DURATION_MIN=1500,DURATION_MAX=120000;
const STYLE_ID='srRunnerCss';
const ART_RATIO=280/240;
const CHANGE_EVENT='store-runner:runner-state';

/* ------------------------------------------------------------------ valeurs */
function isState(value){return STATES.indexOf(value)!==-1}
function clean(value,max){
  if(value==null)return '';
  const chars=Array.from(String(value).replace(/\s+/g,' ').trim());
  return chars.length>max?chars.slice(0,max-1).join('').trimEnd()+'…':chars.join('');
}
function clampDuration(value){
  const n=Number(value);
  if(!isFinite(n)||n<=0)return 0;
  return Math.min(DURATION_MAX,Math.max(DURATION_MIN,Math.round(n)));
}
function sizeFrom(value){
  if(typeof value==='string'&&SIZES[value])return SIZES[value];
  const n=Number(value);
  if(!isFinite(n)||n<=0)return SIZES.md;
  return Math.min(SIZE_MAX,Math.max(SIZE_MIN,Math.round(n)));
}
/* Une entrée de bulle : un texte seul, ou { text, title, state, duration, side }. */
function normalizeMessage(input,extra){
  const source=input&&typeof input==='object'?input:{text:input};
  const opts=extra&&typeof extra==='object'?extra:{};
  const pick=key=>source[key]!=null?source[key]:opts[key];
  const text=clean(source.text!=null?source.text:opts.text,TEXT_MAX);
  if(!text)return null;
  const state=pick('state');
  const side=pick('side');
  return{
    text,
    title:clean(pick('title'),TITLE_MAX),
    state:isState(state)?state:null,
    duration:clampDuration(pick('duration')),
    side:SIDES.indexOf(side)!==-1?side:null
  };
}
function accessibleLabel(state){return ACCESSIBLE_NAME+' : '+(STATE_LABELS[state]||STATE_LABELS.neutral).toLowerCase()}

/* ------------------------------------------------------------------- dessin */
/* Le dessin reprend la planche officielle Runner V1 : tête en goutte nacrée, visière sombre
   à liseré bleu, yeux lumineux, crête bleue type aileron, pastille d'oreille bleue, corps
   ovoïde blanc avec l'emblème de navigation, mains bleues, halo bleu sous le corps. Aucun
   filtre SVG (coûteux sur mobile) : les lueurs sont des formes translucides superposées.
   Les identifiants de dégradés sont uniques par instance : un Runner masqué ne prive jamais
   un autre de ses dégradés. `{u}` est remplacé par le numéro d'instance. */
function arm(x,y,len,angle,tip,mirror){
  const flip=mirror?'scale(-1 1) ':'';
  return '<g transform="translate('+x+' '+y+') '+flip+'rotate('+angle+')">'
    +'<rect x="0" y="-8.5" width="'+len+'" height="17" rx="8.5" fill="url(#rn{u}-arm)"/>'
    +'<rect x="'+(len-tip)+'" y="-8.5" width="'+tip+'" height="17" rx="8.5" fill="url(#rn{u}-blue)"/>'
    +'<rect x="1" y="-6.4" width="'+(len-tip-3)+'" height="4" rx="2" fill="#fff" opacity=".7"/>'
    +'</g>';
}
/* Œil en arche (crescent) centré sur (0,0), avec sa lueur. */
const ARCH='M-14 11C-13 -13 13 -13 14 11';
function archEye(x,y,scale,rotate){
  return '<g transform="translate('+x+' '+y+') rotate('+(rotate||0)+') scale('+(scale||1.3)+')">'
    +'<ellipse cy="-2" rx="24" ry="22" fill="url(#rn{u}-glow)"/>'
    +'<path d="'+ARCH+'" fill="none" stroke="url(#rn{u}-eye)" stroke-width="8.4" stroke-linecap="round"/></g>';
}
function ovalEye(x,y,fill,glow){
  return '<g transform="translate('+x+' '+y+')">'
    +'<ellipse rx="22" ry="30" fill="url(#'+glow+')"/>'
    +'<ellipse rx="9.4" ry="16.5" fill="url(#'+fill+')"/></g>';
}
function sparks(items,color){
  return items.map(function(s,i){
    return '<path class="rnSpark" style="--i:'+i+'" d="M'+s[0]+' '+s[1]+'L'+s[2]+' '+s[3]+'" stroke="'+color+'" stroke-width="5.5" stroke-linecap="round" fill="none"/>';
  }).join('');
}
function artMarkup(){
  const defs=''
    +'<radialGradient id="rn{u}-head" cx=".36" cy=".2" r=".95"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#f3f6fc"/><stop offset=".86" stop-color="#d8e1f1"/><stop offset="1" stop-color="#b6c4dd"/></radialGradient>'
    +'<linearGradient id="rn{u}-shade" x1=".2" y1=".4" x2=".95" y2="1"><stop offset="0" stop-color="#7a95c8" stop-opacity="0"/><stop offset="1" stop-color="#6f8cc4" stop-opacity=".34"/></linearGradient>'
    +'<radialGradient id="rn{u}-body" cx=".38" cy=".25" r=".95"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#f1f5fb"/><stop offset=".9" stop-color="#d3ddef"/><stop offset="1" stop-color="#b3c2dc"/></radialGradient>'
    +'<linearGradient id="rn{u}-arm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#cbd7ec"/></linearGradient>'
    +'<linearGradient id="rn{u}-blue" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#63b3ff"/><stop offset=".45" stop-color="#1f74ff"/><stop offset="1" stop-color="#0a3fc9"/></linearGradient>'
    +'<linearGradient id="rn{u}-navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2459d6"/><stop offset="1" stop-color="#0a2a7e"/></linearGradient>'
    +'<linearGradient id="rn{u}-visor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151f4c"/><stop offset="1" stop-color="#050919"/></linearGradient>'
    +'<linearGradient id="rn{u}-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    +'<linearGradient id="rn{u}-eye" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6f1ff"/><stop offset="1" stop-color="#34b4ff"/></linearGradient>'
    +'<linearGradient id="rn{u}-amber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe49a"/><stop offset="1" stop-color="#ffab1f"/></linearGradient>'
    +'<linearGradient id="rn{u}-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7d55"/><stop offset="1" stop-color="#e22f16"/></linearGradient>'
    +'<radialGradient id="rn{u}-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#43c2ff" stop-opacity=".5"/><stop offset="1" stop-color="#43c2ff" stop-opacity="0"/></radialGradient>'
    +'<radialGradient id="rn{u}-glowAmber" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffb020" stop-opacity=".45"/><stop offset="1" stop-color="#ffb020" stop-opacity="0"/></radialGradient>'
    +'<radialGradient id="rn{u}-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#4fd2ff" stop-opacity=".85"/><stop offset="1" stop-color="#4fd2ff" stop-opacity="0"/></radialGradient>';

  /* Bras : un jeu par état, partagé quand le geste est identique. */
  const armsNeutral=arm(84,208,56,18,20,true)+arm(152,208,56,18,20,false);
  const armsAnalyzing=arm(84,208,56,18,20,true);
  const armsAlert=arm(86,206,70,-6,22,true)+arm(152,210,48,26,18,false);
  const armsSuccess=arm(84,208,56,18,20,true);

  const eyesNeutral=archEye(92,122,1.3,-2)+archEye(148,122,1.3,2);
  const eyesAnalyzing=ovalEye(94,121,'rn{u}-eye','rn{u}-glow')
    +'<g><ellipse cx="148" cy="121" rx="30" ry="22" fill="url(#rn{u}-glow)"/><path d="M134 132L164 112" stroke="url(#rn{u}-eye)" stroke-width="10" stroke-linecap="round"/></g>';
  const eyesAlert=ovalEye(94,121,'rn{u}-amber','rn{u}-glowAmber')+ovalEye(148,121,'rn{u}-amber','rn{u}-glowAmber');
  const eyesSuccess=archEye(92,121,1.3,0)
    +'<g><ellipse cx="148" cy="122" rx="28" ry="22" fill="url(#rn{u}-glow)"/><path d="M130 132C134 108 162 108 166 132" stroke="url(#rn{u}-eye)" stroke-width="9" stroke-linecap="round" fill="none"/></g>';

  return '<svg class="rnArt" viewBox="0 0 240 280" focusable="false" aria-hidden="true"><defs>'+defs+'</defs>'
    /* sol : ombre bleutée et halo de la plaque stationnaire */
    +'<ellipse cx="120" cy="272" rx="58" ry="6" fill="#4a78d6" opacity=".16"/>'
    +'<ellipse cx="119" cy="266" rx="34" ry="9" fill="url(#rn{u}-floor)"/>'
    /* bras du fond */
    +'<g class="rnLayer" data-rn="neutral">'+armsNeutral+'</g>'
    +'<g class="rnLayer" data-rn="analyzing">'+armsAnalyzing+'</g>'
    +'<g class="rnLayer" data-rn="alert">'+armsAlert+'</g>'
    +'<g class="rnLayer" data-rn="success">'+armsSuccess+'</g>'
    /* corps ovoïde, plaque bleue, épaulettes, anneau de cou */
    +'<path d="M118 170C152 170 176 196 176 224C176 252 152 266 118 266C84 266 60 252 60 224C60 196 84 170 118 170Z" fill="url(#rn{u}-body)"/>'
    +'<path d="M118 170C152 170 176 196 176 224C176 252 152 266 118 266C84 266 60 252 60 224C60 196 84 170 118 170Z" fill="url(#rn{u}-shade)" opacity=".7"/>'
    +'<path d="M92 261C102 253 134 253 144 261C134 268 102 268 92 261Z" fill="url(#rn{u}-blue)"/>'
    +'<path d="M78 192C64 200 60 226 70 240C74 228 76 210 88 200Z" fill="url(#rn{u}-navy)"/>'
    +'<path d="M158 192C172 200 176 226 166 240C162 228 160 210 148 200Z" fill="url(#rn{u}-navy)"/>'
    +'<ellipse cx="118" cy="182" rx="30" ry="9" fill="#0d2468"/>'
    +'<circle cx="124" cy="224" r="23" fill="#fff" fill-opacity=".55" stroke="#c4d2ea" stroke-width="1.6"/>'
    /* emblème de navigation : flèche bicolore penchée vers le haut à droite */
    +'<g transform="translate(124 224) rotate(36)"><path d="M0 -16L12 14L0 7Z" fill="#1558d6"/><path d="M0 -16L-12 14L0 7Z" fill="#4da3ff"/></g>'
    /* tête en goutte nacrée */
    +'<ellipse cx="26" cy="120" rx="14" ry="27" transform="rotate(-6 26 120)" fill="url(#rn{u}-blue)"/>'
    +'<ellipse cx="22" cy="118" rx="4.5" ry="12" transform="rotate(-6 22 118)" fill="#fff" opacity=".55"/>'
    +'<path d="M118 182C62 182 24 152 24 112C24 78 52 50 88 42C104 38 120 32 132 32C176 34 212 70 212 114C212 154 174 182 118 182Z" fill="url(#rn{u}-head)"/>'
    +'<path d="M118 182C62 182 24 152 24 112C24 78 52 50 88 42C104 38 120 32 132 32C176 34 212 70 212 114C212 154 174 182 118 182Z" fill="url(#rn{u}-shade)"/>'
    +'<path d="M62 60C80 46 106 40 126 40" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".75"/>'
    /* crête : aileron bleu, pointe à gauche, bord de fuite concave vers la droite */
    +'<path d="M98 44C95 28 98 12 106 2C118 14 138 28 154 48C136 41 114 39 98 44Z" fill="url(#rn{u}-blue)"/>'
    +'<path d="M106 6C110 18 122 30 134 38" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".5"/>'
    +'<path d="M96 46C112 38 138 40 156 50C146 56 110 56 96 46Z" fill="#f2f6fc"/>'
    /* visière : verre sombre, liseré bleu, reflet */
    +'<rect x="44" y="72" width="152" height="94" rx="46" fill="#fff" opacity=".5"/>'
    +'<rect x="47" y="75" width="146" height="88" rx="43" fill="url(#rn{u}-visor)" stroke="#2a63ff" stroke-width="2.4"/>'
    +'<rect x="50" y="78" width="140" height="82" rx="40" fill="url(#rn{u}-glass)"/>'
    +'<rect x="49.5" y="77.5" width="141" height="83" rx="41" fill="none" stroke="#8db6ff" stroke-opacity=".35" stroke-width="1.2"/>'
    /* yeux : un jeu par état */
    +'<g class="rnLayer" data-rn="neutral">'+eyesNeutral+'</g>'
    +'<g class="rnLayer" data-rn="analyzing">'+eyesAnalyzing+'</g>'
    +'<g class="rnLayer" data-rn="alert">'+eyesAlert+'</g>'
    +'<g class="rnLayer" data-rn="success">'+eyesSuccess+'</g>'
    /* main au menton (analyzing) */
    +'<g class="rnLayer" data-rn="analyzing"><rect x="148" y="186" width="17" height="38" rx="8.5" transform="rotate(-16 156 204)" fill="url(#rn{u}-arm)"/>'
    +'<ellipse cx="152" cy="176" rx="17" ry="14" fill="url(#rn{u}-arm)" stroke="#bccae3" stroke-width="1.2"/><ellipse cx="138" cy="170" rx="6" ry="9" transform="rotate(24 138 170)" fill="url(#rn{u}-arm)" stroke="#bccae3" stroke-width="1"/><path d="M143 168C148 162 158 162 163 168" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/></g>'
    /* main levée (success) */
    +'<g class="rnLayer" data-rn="success">'+arm(158,200,62,-46,24,false)+'<ellipse cx="205" cy="151" rx="11" ry="14" transform="rotate(-30 205 151)" fill="url(#rn{u}-blue)"/></g>'
    /* effets : points de réflexion, avertissement, étincelles */
    +'<g class="rnLayer rnDots" data-rn="analyzing"><circle style="--i:0" cx="210" cy="56" r="5" fill="#8ccfff"/><circle style="--i:1" cx="222" cy="42" r="4" fill="#8ccfff"/><circle style="--i:2" cx="214" cy="28" r="3" fill="#8ccfff"/></g>'
    +'<g class="rnLayer rnWarn" data-rn="alert">'+sparks([[196,30,200,12],[210,36,224,24]],'#ffb020')
    +'<g class="rnBadge"><path d="M204 186C207 180 215 180 218 186L232 222C234 227 231 232 225 232L197 232C191 232 188 227 190 222Z" fill="url(#rn{u}-red)" stroke="#ff9a82" stroke-width="2"/><rect x="209.4" y="193" width="5.2" height="19" rx="2.6" fill="#fff"/><circle cx="212" cy="221" r="3.2" fill="#fff"/></g></g>'
    +'<g class="rnLayer rnWin" data-rn="success">'+sparks([[194,28,202,14],[206,40,224,34]],'#2ecb82')+'</g>'
    +'</svg>';
}
const ART=artMarkup();

/* -------------------------------------------------------------------- style */
const CSS=[
'.srRunner{--sr-runner-size:88px;--rn-ink:#10224d;--rn-sub:#46567a;--rn-line:#dbe5f6;--rn-accent:#2f7bff;position:relative;display:flex;align-items:center;gap:10px;box-sizing:border-box;max-width:100%;contain:layout style;-webkit-tap-highlight-color:transparent}',
'.srRunner[data-side="left"]{flex-direction:row-reverse}',
'.srRunner[data-side="top"]{flex-direction:column-reverse;align-items:flex-start}',
'.srRunner[data-side="bottom"]{flex-direction:column;align-items:flex-start}',
'.srRunner[data-state="analyzing"]{--rn-accent:#3aa0ff}.srRunner[data-state="alert"]{--rn-accent:#f5a30f}.srRunner[data-state="success"]{--rn-accent:#22b573}',
'.srRunnerFigure{flex:0 0 auto;width:var(--sr-runner-size);height:calc(var(--sr-runner-size)*'+ART_RATIO.toFixed(4)+');line-height:0;pointer-events:none;user-select:none;-webkit-user-select:none}',
'.srRunnerFigure .rnArt{display:block;width:100%;height:100%;overflow:visible}',
/* Calques : tous présents dans le SVG, un seul visible selon l'état. */
'.srRunner .rnLayer{opacity:0;transition:opacity .16s ease}',
'.srRunner[data-state="neutral"] .rnLayer[data-rn="neutral"],.srRunner[data-state="analyzing"] .rnLayer[data-rn="analyzing"],.srRunner[data-state="alert"] .rnLayer[data-rn="alert"],.srRunner[data-state="success"] .rnLayer[data-rn="success"]{opacity:1}',
/* Bulle */
'.srRunnerBubble{position:relative;flex:1 1 auto;min-width:0;max-width:280px;box-sizing:border-box;padding:10px 14px;border-radius:18px;background:#fff;border:1px solid var(--rn-line);border-left:4px solid var(--rn-accent);box-shadow:0 8px 24px rgba(23,44,96,.12);color:var(--rn-ink);font:500 14px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Arial,sans-serif;letter-spacing:-.005em;overflow-wrap:anywhere}',
'.srRunnerBubble[hidden]{display:none}',
'.srRunnerBubble::before{content:"";position:absolute;width:12px;height:12px;background:#fff;border:1px solid var(--rn-line);border-top:0;border-right:0;transform:rotate(45deg);left:-8px;top:calc(50% - 6px)}',
'.srRunner[data-side="left"] .srRunnerBubble::before{left:auto;right:-7px;transform:rotate(225deg)}',
'.srRunner[data-side="top"] .srRunnerBubble::before{left:calc(var(--sr-runner-size)/2 - 6px);top:auto;bottom:-7px;transform:rotate(-45deg)}',
'.srRunner[data-side="bottom"] .srRunnerBubble::before{left:calc(var(--sr-runner-size)/2 - 6px);top:-7px;transform:rotate(135deg)}',
'.srRunnerBubbleTitle{display:block;margin:0 0 2px;font-weight:700;font-size:14.5px;color:var(--rn-ink)}',
'.srRunnerBubbleTitle:empty{display:none}',
'.srRunnerBubbleText{display:block;color:var(--rn-sub);font-weight:500}',
'.srRunnerBubbleTitle:empty+.srRunnerBubbleText{color:var(--rn-ink)}',
'.srRunnerLive{position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
/* Mouvement : un seul passage, sauf les trois points de « analyzing » (bornés). */
'@keyframes srRunnerPop{0%{transform:translateY(7px) scale(.94)}55%{transform:translateY(-3px) scale(1.03)}100%{transform:none}}',
'@keyframes srRunnerBubbleIn{from{opacity:0;transform:translateY(4px) scale(.97)}to{opacity:1;transform:none}}',
'@keyframes srRunnerDot{0%,100%{opacity:.22}40%{opacity:1}}',
'@keyframes srRunnerBadge{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}',
'@keyframes srRunnerSpark{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}',
'.srRunner .rnDots circle,.srRunner .rnBadge,.srRunner .rnSpark{transform-box:fill-box;transform-origin:center}',
'.srRunnerFigure.is-pop{animation:srRunnerPop .42s cubic-bezier(.2,.9,.3,1)}',
'.srRunnerBubble.is-in{animation:srRunnerBubbleIn .22s ease-out}',
'.srRunner[data-state="analyzing"] .rnDots circle{animation:srRunnerDot 1.4s ease-in-out 16;animation-delay:calc(var(--i)*.18s)}',
'.srRunner[data-state="alert"] .rnBadge{animation:srRunnerBadge .6s ease-in-out 2}',
'.srRunner[data-state="alert"] .rnSpark,.srRunner[data-state="success"] .rnSpark{animation:srRunnerSpark .32s ease-out both;animation-delay:calc(var(--i)*.09s)}',
/* Sans mouvement : réglage système, ou `motion:"off"` demandé par l'écran hôte. */
'@media (prefers-reduced-motion:reduce){.srRunner *,.srRunner *::before{animation:none!important;transition:none!important}}',
'.srRunner[data-motion="off"] *,.srRunner[data-motion="off"] *::before{animation:none!important;transition:none!important}',
/* Mobile 390 px : la bulle garde la largeur restante, jamais de défilement horizontal. */
'@media (max-width:420px){.srRunnerBubble{max-width:none;font-size:14px}.srRunner[data-side="top"] .srRunnerBubble,.srRunner[data-side="bottom"] .srRunnerBubble{align-self:stretch}}'
].join('');

function ensureStyle(doc){
  if(!doc||doc.getElementById(STYLE_ID))return;
  const style=doc.createElement('style');
  style.id=STYLE_ID;style.textContent=CSS;
  (doc.head||doc.documentElement).appendChild(style);
}

/* ---------------------------------------------------------------- instances */
let uid=0;
const instances=[];

function resolveContainer(doc,target){
  if(!target)return null;
  if(typeof target==='string'){try{return doc.querySelector(target)}catch(e){return null}}
  return target.nodeType===1?target:null;
}
function restart(el,className){
  el.classList.remove(className);
  /* Relire une mesure force le recalcul : sans cela le retrait puis l'ajout sont fusionnés. */
  void el.offsetWidth;
  el.classList.add(className);
}

function createInstance(doc,options){
  const opts=options&&typeof options==='object'?options:{};
  const id=++uid;
  const host=doc.createElement('div');
  host.className='srRunner';
  host.setAttribute('data-sr-runner','');
  host.innerHTML='<div class="srRunnerFigure" role="img">'+ART.split('{u}').join(String(id))+'</div>'
    +'<div class="srRunnerBubble" hidden aria-hidden="true"><b class="srRunnerBubbleTitle"></b><span class="srRunnerBubbleText"></span></div>'
    +'<span class="srRunnerLive" role="status" aria-live="polite" aria-atomic="true"></span>';
  const figure=host.firstChild;
  const bubble=host.children[1];
  const titleEl=bubble.firstChild;
  const textEl=bubble.lastChild;
  const live=host.lastChild;

  let state=isState(opts.state)?opts.state:'neutral';
  let destroyed=false;
  let hideTimer=0,resetTimer=0,liveTimer=0;

  function clearTimer(timer){if(timer)root.clearTimeout(timer);return 0}
  function announce(text,assertive){
    liveTimer=clearTimer(liveTimer);
    live.setAttribute('aria-live',assertive?'assertive':'polite');
    live.textContent='';
    if(!text)return;
    /* Le contenu arrive après un court délai : un lecteur d'écran n'annonce pas un texte
       identique au précédent ni un texte posé dans le même tick que la région. */
    liveTimer=root.setTimeout(()=>{liveTimer=0;live.textContent=text},60);
  }
  function paintLabel(){
    if(opts.decorative){figure.removeAttribute('role');figure.removeAttribute('aria-label');figure.setAttribute('aria-hidden','true');return}
    figure.setAttribute('aria-label',accessibleLabel(state));
  }
  function applySide(side){host.setAttribute('data-side',SIDES.indexOf(side)!==-1?side:'right')}

  function hideMessage(){
    if(destroyed)return false;
    hideTimer=clearTimer(hideTimer);
    const had=!bubble.hidden;
    bubble.hidden=true;bubble.classList.remove('is-in');
    titleEl.textContent='';textEl.textContent='';
    if(had)announce('',false);
    return had;
  }
  function setState(next,extra){
    if(destroyed||!isState(next))return false;
    const o=extra&&typeof extra==='object'?extra:{};
    resetTimer=clearTimer(resetTimer);
    const previous=state;
    const changed=next!==previous;
    state=next;
    host.setAttribute('data-state',state);
    paintLabel();
    if(changed){
      if(host.getAttribute('data-motion')!=='off')restart(figure,'is-pop');
      try{host.dispatchEvent(new root.CustomEvent(CHANGE_EVENT,{bubbles:true,detail:{state,previous,id}}))}catch(e){}
    }
    const message=o.message!=null?normalizeMessage(o.message,{title:o.title,duration:o.duration,side:o.side}):null;
    if(message)showMessage(message);
    else if(changed){
      /* Un état qui change sans bulle reste annoncé, sauf le retour au calme. */
      if(state!=='neutral')announce(ACCESSIBLE_NAME.split(',')[0]+' : '+STATE_LABELS[state].toLowerCase(),state==='alert');
      else announce('',false);
    }
    const back=clampDuration(o.resetAfter);
    if(back)resetTimer=root.setTimeout(()=>{resetTimer=0;if(!destroyed)reset()},back);
    return true;
  }
  function showMessage(input,extra){
    if(destroyed)return false;
    const message=normalizeMessage(input,extra);
    if(!message){hideMessage();return false}
    if(message.state&&message.state!==state)setState(message.state);
    hideTimer=clearTimer(hideTimer);
    if(message.side)applySide(message.side);
    titleEl.textContent=message.title;
    textEl.textContent=message.text;
    bubble.hidden=false;
    if(host.getAttribute('data-motion')!=='off')restart(bubble,'is-in');
    announce((message.title?message.title+'. ':'')+message.text,state==='alert');
    if(message.duration)hideTimer=root.setTimeout(()=>{hideTimer=0;hideMessage()},message.duration);
    return true;
  }
  function reset(){
    if(destroyed)return false;
    resetTimer=clearTimer(resetTimer);
    hideMessage();
    if(state!=='neutral')setState('neutral');
    return true;
  }
  function destroy(){
    if(destroyed)return false;
    hideTimer=clearTimer(hideTimer);resetTimer=clearTimer(resetTimer);liveTimer=clearTimer(liveTimer);
    destroyed=true;
    const at=instances.indexOf(inst);if(at!==-1)instances.splice(at,1);
    if(host.parentNode)host.parentNode.removeChild(host);
    return true;
  }

  const inst={
    id,el:host,
    getState:()=>state,
    setState,showMessage,hideMessage,reset,destroy,
    isConnected:()=>!destroyed&&host.isConnected
  };

  const motion=opts.motion==='off'?'off':'auto';
  host.setAttribute('data-motion',motion);
  host.style.setProperty('--sr-runner-size',sizeFrom(opts.size)+'px');
  applySide(opts.side);
  host.setAttribute('data-state',state);
  paintLabel();
  if(opts.message!=null)showMessage(opts.message,{title:opts.title,duration:opts.duration});
  return inst;
}

/* --------------------------------------------------------------- API publique */
/* Runner « principal » : le dernier monté encore présent dans le document. L'API globale ne
   crée jamais d'instance toute seule : sans Runner monté, elle ne fait rien et répond false. */
function primary(){
  for(let i=instances.length-1;i>=0;i--){
    if(instances[i].isConnected())return instances[i];
    /* Un conteneur retiré par un rendu de l'écran hôte ne fuit pas : il est oublié ici. */
    instances.splice(i,1);
  }
  return null;
}
function safe(fn,fallback){try{return fn()}catch(e){return fallback}}

/* mount(conteneur, options) → instance, ou null si le conteneur est introuvable. Le propriétaire
   de l'écran décide de l'emplacement ; Runner ne s'insère jamais ailleurs. */
function mount(target,options){
  const doc=root.document;
  if(!doc)return null;
  return safe(()=>{
    const container=resolveContainer(doc,target);
    if(!container)return null;
    ensureStyle(doc);
    const inst=createInstance(doc,options);
    container.appendChild(inst.el);
    instances.push(inst);
    return inst;
  },null);
}
function unmount(ref){
  const inst=ref&&typeof ref.destroy==='function'?ref
    :instances.find(i=>i.el===ref||i.el.parentNode===ref)||null;
  return inst?safe(()=>inst.destroy(),false):false;
}

return{
  VERSION,STATES,STATE_LABELS,SIDES,SIZES,
  isState,normalizeMessage,accessibleLabel,
  mount,unmount,
  setState:(state,opts)=>safe(()=>{const p=primary();return p?p.setState(state,opts):false},false),
  showMessage:(input,opts)=>safe(()=>{const p=primary();return p?p.showMessage(input,opts):false},false),
  hideMessage:()=>safe(()=>{const p=primary();return p?p.hideMessage():false},false),
  reset:()=>safe(()=>{const p=primary();return p?p.reset():false},false),
  getState:()=>safe(()=>{const p=primary();return p?p.getState():null},null),
  mounted:()=>safe(()=>{primary();return instances.length},0)
};
});
