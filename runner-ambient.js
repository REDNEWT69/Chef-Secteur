/* Runner Ambient V1 — couche ambiante de PRÉSENTATION. Runner « habite » l'application : toutes les 8 à 12 s de calme, il joue
   une courte scène finie (6 au total) près d'un élément de l'écran réellement affiché, puis repart. Trois contextes seulement :
   Accueil, Planning, saisie dans un formulaire. Contrat : RUNNER_AMBIENT_V1.md.

   Ce module ne possède AUCUNE donnée : il ne lit ni n'écrit `state`, le stockage, un moteur de planning, un rapport ou la
   mémoire de Runner ; il ne lit jamais le texte saisi (seulement « un champ est actif »), ne clique rien, ne prend aucun focus
   et n'intercepte aucun geste (calque en pointer-events:none). Il ne remplace aucune fonction globale et ne se couple pas à
   Runner Intelligence (V276) : il s'efface devant la voix de l'Accueil, devant un état métier de Runner et devant tout
   recouvrement (assistant, feuilles, dialogues non autorisés, premier lancement, bannière de mise à jour).

   Architecture : un calque fixe unique `#srAmbientLayer` (sous la barre basse ; promu en couche supérieure du navigateur,
   par l'API Popover, seulement pour un champ d'un dialogue modal autorisé), un acteur Runner DÉTACHÉ (`Runner.mount(…, {detached})`,
   jamais « principal », jamais compté) et des animations Web Animations bornées (`transform`/`opacity`). Une seule temporisation
   de cadence en attente, plus un chien de garde pendant une scène : aucun setInterval, aucune boucle requestAnimationFrame. */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.document){root.StoreRunnerAmbient=api;api.start()}
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';

const VERSION=1;
const LAYER_ID='srAmbientLayer',STYLE_ID='srAmbientCss',HIGHLIGHT='srAmbientLetter';
/* Calme entre la FIN d'une scène et le déclenchement de la suivante : 8 à 12 s, jamais un métronome. */
const GAP_MIN=8000,GAP_MAX=12000;
const FORM_DELAY_MIN=1200,FORM_DELAY_MAX=2200,FORM_COOLDOWN=25000;
/* Acteur : Runner `sm` (56 px) ; le bas du corps tombe à 62 px du haut de sa boîte (266/280 du dessin). */
const W=56,H=66,BODY=62;
const OCC_MAX=.2;
const SCENES=Object.freeze(['letter-push','letter-double','sit-edge','peek-behind','observe-card','lean-field']);
const CONTEXTS=Object.freeze({
  home:Object.freeze(['letter-push','letter-double','sit-edge','peek-behind']),
  planning:Object.freeze(['sit-edge','observe-card','peek-behind']),
  form:Object.freeze(['lean-field'])
});
const WEIGHTS=Object.freeze({'letter-push':3,'letter-double':2,'sit-edge':3,'peek-behind':2,'observe-card':3,'lean-field':1});
const MAX_MS=Object.freeze({'letter-push':7000,'letter-double':9000,'sit-edge':8000,'peek-behind':8000,'observe-card':7000,'lean-field':7000});
/* Seuls dialogues modaux où Runner peut regarder un champ : compte rendu de visite, rendez-vous, fiche magasin. */
const FORM_DIALOGS=Object.freeze(['srVisitDialog','apptDlg','storeDlg']);
/* Écran d'un contexte et blocs préférés ; tout autre bloc arrondi, avec fond ou bordure, est aussi un rebord possible. */
const SURFACE_ROOT=Object.freeze({home:'homePanel',planning:'planPanel'});
const SURFACE_HINTS=Object.freeze({
  home:'.phVisitCard,.phTerrain,.phCard,.phNextDay',
  planning:'.cov263Card,.planningTerrainBtn,.timelineRow,.planMetric,.dayTabs'
});
const SURFACE_SCAN_MAX=400;

/* ------------------------------------------------------------------ logique pure */
function rnd(random){const r=typeof random==='function'?random():Math.random();return Math.min(.999999,Math.max(0,Number(r)||0))}
function nextGap(random){return Math.round(GAP_MIN+rnd(random)*(GAP_MAX-GAP_MIN))}
/* Signaux de contexte : HOME_IDLE → 'home', PLANNING_VIEWING → 'planning', FORM_TYPING → 'form'. Tout le reste dort. */
function resolveContext(f){
  if(!f||f.inert||f.blocked)return null;
  if(f.field)return 'form';
  if(f.keyboard)return null;
  if(f.panel==='homePanel')return 'home';
  if(f.panel==='planPanel')return 'planning';
  return null;
}
/* Ordre d'essai : tirage pondéré sans remise, la scène qui vient de jouer passe en dernier (jamais deux fois de suite si autre chose est faisable). */
function orderScenes(context,previous,random){
  const all=CONTEXTS[context]||[];
  const pool=all.filter(id=>id!==previous),out=[];
  while(pool.length){
    const total=pool.reduce((s,id)=>s+WEIGHTS[id],0);
    let x=rnd(random)*total,i=0;
    for(;i<pool.length-1;i++){x-=WEIGHTS[pool[i]];if(x<0)break}
    out.push(pool.splice(i,1)[0]);
  }
  if(previous&&all.indexOf(previous)!==-1)out.push(previous);
  return out;
}
function pickScene(context,previous,random){return orderScenes(context,previous,random)[0]||null}
/* Indices des lettres à pousser, de la droite vers la gauche (Runner arrive par la droite) ; seules les lettres (pas la ponctuation). */
function pickLetters(text,count,random){
  const s=String(text==null?'':text),letters=[];
  for(let i=0;i<s.length;i++)if(/\p{L}/u.test(s[i]))letters.push(i);
  if(!letters.length)return [];
  if(count<2||letters.length<3)return [letters[Math.floor(rnd(random)*letters.length)]];
  const rights=letters.slice(2),a=rights[Math.floor(rnd(random)*rights.length)];
  const lefts=letters.filter(v=>v<=a-2);
  return lefts.length?[a,lefts[Math.floor(rnd(random)*lefts.length)]]:[a];
}
/* Chute d'une lettre poussée vers la gauche : bascule, gravité, rebond, repos. `transform` seulement. */
function fallFrames(height,dir){
  const d=dir<0?-1:1,D=Math.max(16,Math.round(height*.55));
  const f=(x,y,r,extra)=>Object.assign({transform:'translate('+(x*d)+'px,'+y+'px) rotate('+(r*d)+'deg)'},extra);
  return [f(0,0,0,{offset:0}),f(2,-1,6,{offset:.13,easing:'ease-out'}),f(7,0,15,{offset:.25,easing:'cubic-bezier(.5,0,.9,.6)'}),
    f(13,D,27,{offset:.55,easing:'cubic-bezier(.2,.6,.4,1)'}),f(15,D-11,31,{offset:.72,easing:'ease-in'}),f(16,D,28,{offset:.86}),f(16,D,28,{offset:1})];
}
/* Retour : un saut en arc jusqu'à la place d'origine, léger dépassement, repos. */
function returnFrames(height,dir){
  const d=dir<0?-1:1,D=Math.max(16,Math.round(height*.55));
  const f=(x,y,r,extra)=>Object.assign({transform:'translate('+(x*d)+'px,'+y+'px) rotate('+(r*d)+'deg)'},extra);
  return [f(16,D,28,{offset:0,easing:'cubic-bezier(.3,.7,.4,1)'}),f(6,-12,10,{offset:.55,easing:'ease-in'}),f(-1,1,-3,{offset:.8,easing:'ease-out'}),f(0,0,0,{offset:1})];
}

/* ------------------------------------------------------------------ état */
const S={started:false,timer:0,fast:false,run:null,prev:null,lastReason:'',lastFormAt:-Infinity,random:null,motion:null,gap:null};
let layer=null;
function rand(){return rnd(S.random||Math.random)}
function now(){return root.performance&&typeof root.performance.now==='function'?root.performance.now():Date.now()}
function doc(){return root.document}

/* ------------------------------------------------------------------ lecture de l'environnement (aucune donnée métier) */
function rectOf(el){
  if(!el||!el.isConnected||typeof el.getBoundingClientRect!=='function')return null;
  const r=el.getBoundingClientRect();
  return r.width>0&&r.height>0&&[r.left,r.top,r.width,r.height].every(Number.isFinite)?r:null;
}
function motionReduced(){return typeof root.matchMedia==='function'&&root.matchMedia('(prefers-reduced-motion: reduce)').matches}
function personalityIdle(){try{const b=root.StoreRunnerBehavior;return!b||typeof b.controller!=='function'||b.controller().idle()!==false}catch(e){return true}}
/* Raison pour laquelle Runner Ambient dort, ou ''. */
function inertReason(){
  const d=doc();
  if(!d||!d.body)return 'no-document';
  if(root.__STORE_RUNNER_AMBIENT==='off')return 'off';
  if(typeof Element==='undefined'||typeof Element.prototype.animate!=='function')return 'unsupported';
  const api=root.StoreRunnerRunner;
  if(!api||typeof api.mount!=='function')return 'unsupported';
  if(d.hidden)return 'hidden';
  if(motionReduced())return 'reduced-motion';
  if(!personalityIdle())return 'quiet-personality';
  return '';
}
function editable(el){
  if(!el||el.nodeType!==1)return false;
  const t=el.tagName;
  if(t==='TEXTAREA')return!el.readOnly&&!el.disabled;
  if(t==='INPUT')return /^(text|search|email|tel|url|number|date|time|datetime-local|month|week)$/i.test(el.type||'text')&&!el.readOnly&&!el.disabled;
  return el.isContentEditable===true;
}
/* Champ actif : une seule information, « un champ éligible a le focus ». Aucune valeur n'est lue. */
function activeField(){
  const d=doc(),el=d&&d.activeElement;
  if(!el||el===d.body||!editable(el))return null;
  if(el.closest('#assistantPanel,#'+LAYER_ID))return null;
  const dlg=el.closest('dialog');
  if(dlg&&FORM_DIALOGS.indexOf(dlg.id)===-1)return null;
  const r=rectOf(el);
  return r&&r.width>=40&&r.height>=24?el:null;
}
function activePanelId(){const p=doc().querySelector('.panel.active');return p?p.id:''}
function keyboardOpen(){return doc().documentElement.getAttribute('data-sr-keyboard')==='open'}
/* Tout ce qui couvre l'écran ou parle déjà : Ambient se tait. */
function blockedReason(field,panel){
  const d=doc(),html=d.documentElement;
  if(html.classList.contains('srFirstRunOpen'))return 'first-run';
  const boot=root.StoreRunnerBoot;
  if(boot&&typeof boot.settled==='function'&&!boot.settled())return 'boot';
  if(d.querySelector('#assistantPanel.open,#moreSheetV2.open'))return 'overlay';
  if(d.querySelector('#storeRunnerUpdateBanner:not([hidden]),.storeRunnerToast:not([hidden])'))return 'update';
  const dlg=d.querySelector('dialog[open]');
  if(dlg&&!(field&&dlg.contains(field)&&FORM_DIALOGS.indexOf(dlg.id)!==-1))return 'dialog';
  const sheet=d.getElementById('storeQuickSheet');
  if(sheet&&sheet.classList.contains('open')&&!(field&&sheet.contains(field)))return 'sheet';
  if(panel==='homePanel'&&!field&&d.querySelector('#homeRunnerLineV273:not([hidden]),#homeRunnerBriefV276:not([hidden])'))return 'home-voice';
  return '';
}
function viewport(){
  const vv=root.visualViewport;
  return{vw:root.innerWidth,vh:vv&&Number.isFinite(vv.height)?Math.round(vv.offsetTop+vv.height):root.innerHeight};
}
/* Zone sûre : sous un en-tête fixe, au-dessus de la barre basse et du clavier. */
function safeBounds(){
  const d=doc(),v=viewport();let top=8,bottom=v.vh-8;
  const head=d.querySelector('.top');
  if(head){const cs=root.getComputedStyle(head),r=head.getBoundingClientRect();if((cs.position==='sticky'||cs.position==='fixed')&&r.bottom>0)top=Math.max(top,r.bottom+2)}
  const nav=d.getElementById('bottomAppNav');
  if(nav){const r=nav.getBoundingClientRect(),cs=root.getComputedStyle(nav);if(cs.display!=='none'&&r.width>0&&r.top>0)bottom=Math.min(bottom,r.top-6)}
  return{top,bottom,vw:v.vw,vh:v.vh};
}
/* Hôtes : les Runners déjà posés par leurs propriétaires. Un seul hôte visible, neutre, au repos et de taille `sm` peut être « prêté ». */
function hostInfo(scope){
  const d=doc(),list=[];
  d.querySelectorAll('.srRunner[data-sr-runner]').forEach(el=>{
    if(el.hasAttribute('data-sr-ambient-actor'))return;
    /* Un champ dans un dialogue ou une feuille : les hôtes posés derrière sont masqués par le fond, ils ne comptent pas. */
    if(scope&&!scope.contains(el))return;
    const figure=el.querySelector('.srRunnerFigure'),r=figure&&rectOf(figure);
    const v=viewport();
    if(r&&r.bottom>0&&r.top<v.vh&&r.right>0&&r.left<v.vw)list.push({el,figure,rect:r});
  });
  if(!list.length)return{host:null};
  if(list.length>1)return{block:'hosts'};
  const h=list[0];
  if(h.el.getAttribute('data-state')!=='neutral')return{block:'host-state'};
  let busy=false;
  try{busy=h.el.getAnimations({subtree:true}).some(a=>/^runner-(scene|return|react)$/.test(a.id))}catch(e){}
  if(busy)return{block:'host-busy'};
  if(Math.abs(h.rect.width-W)>3)return{block:'host-size'};
  return{host:{el:h.el,rect:{left:h.rect.left,top:h.rect.top,width:h.rect.width,height:h.rect.height}}};
}

/* ------------------------------------------------------------------ recouvrement : ne jamais cacher du texte */
const BOXED=/^(BUTTON|A|INPUT|TEXTAREA|SELECT|IMG|CANVAS|VIDEO)$/i;
/* Un point est « occupé » s'il tombe sur un contrôle, une image ou la boîte réelle d'un texte (pas celle de son bloc entier). */
function busyAt(el,x,y,cache){
  if(!el||el.nodeType!==1||el.closest('#'+LAYER_ID))return false;
  if(BOXED.test(el.tagName)||el.namespaceURI==='http://www.w3.org/2000/svg'||el.getAttribute('role')==='button')return true;
  for(let n=el.firstChild;n;n=n.nextSibling){
    if(n.nodeType!==3||!n.nodeValue.trim())continue;
    let rects=cache.get(n);
    if(!rects){
      const range=doc().createRange();range.selectNodeContents(n);
      rects=Array.from(range.getClientRects());cache.set(n,rects);
    }
    for(const r of rects)if(x>=r.left-2&&x<=r.right+2&&y>=r.top-2&&y<=r.bottom+2)return true;
  }
  return false;
}
/* Part des points d'une grille 4 × 5 qui tombent sur du texte, un contrôle ou une image. */
function occupancy(box,cache){
  const d=doc(),cols=4,rows=5,memo=cache||new Map(),limit=Math.floor(OCC_MAX*cols*rows);let hit=0;
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
    const x=box.left+(box.right-box.left)*(i+.5)/cols,y=box.top+(box.bottom-box.top)*(j+.5)/rows;
    if(x<0||y<0||x>=root.innerWidth||y>=root.innerHeight||busyAt(d.elementFromPoint(x,y),x,y,memo))hit++;
    /* Sortie anticipée : au-delà du seuil la position est refusée, inutile de compter la suite. */
    if(hit>limit)return hit/(cols*rows);
  }
  return hit/(cols*rows);
}
function pose(bx,by,r,k){const f=k||1;return{x:bx-W*f/2,y:by-BODY*f,r:r||0}}
function opaque(color){
  const m=/^rgba?\(([^)]+)\)$/.exec(String(color||'').trim());
  if(!m)return false;
  const p=m[1].split(',');
  return p.length<4||parseFloat(p[3])>.05;
}
/* Rebords possibles d'un écran : d'abord les blocs connus, puis tout bloc arrondi, large, avec fond ou bordure (robuste aux changements d'interface). */
function surfaces(ctx,env){
  const scope=doc().getElementById(SURFACE_ROOT[ctx]);
  if(!scope)return [];
  const out=[],seen=new Set();
  const take=(el,strict)=>{
    if(seen.has(el))return;
    seen.add(el);
    const r=rectOf(el);
    if(!r||r.width<150||r.height<36||r.height>900||r.top<env.bounds.top||r.top>env.bounds.bottom)return;
    if(strict){
      const cs=root.getComputedStyle(el);
      const rad=parseFloat(cs.borderTopLeftRadius)||0;
      const styled=opaque(cs.backgroundColor)||(parseFloat(cs.borderTopWidth)||0)>0||(cs.boxShadow&&cs.boxShadow!=='none');
      if(cs.visibility==='hidden'||rad<10||!styled)return;
    }
    out.push(el);
  };
  scope.querySelectorAll(SURFACE_HINTS[ctx]).forEach(el=>take(el,false));
  let n=0;
  for(const el of scope.querySelectorAll('*')){if(++n>SURFACE_SCAN_MAX)break;take(el,true)}
  return out;
}
function edgeSpot(env,kind){
  const cands=[];
  surfaces(env.ctx,env).forEach(el=>{
    const r=rectOf(el),span=Math.max(0,r.width-92);
    /* 7 positions le long du rebord, toutes candidates : la seule place libre est souvent un coin. */
    [0,1,2,3,4,5,6].map(i=>r.left+46+span*i/6).forEach(bx=>{
      if(bx<W/2+8||bx>env.vw-W/2-8)return;
      const by=r.top;
      /* Le rebord de « peek » masque tout ce qui est dessous : l'hôte prêté doit être au-dessus, sinon l'acteur partirait invisible. */
      if(kind==='peek'&&env.host&&env.host.rect.top+env.host.rect.height>by-4)return;
      const box=kind==='sit'?{left:bx-W/2,right:bx+W/2,top:by-BODY-2,bottom:by+16}:kind==='peek'?{left:bx-W/2,right:bx+W/2,top:by-50,bottom:by}:{left:bx-W/2,right:bx+W/2,top:by-H,bottom:by+2};
      if(box.top<env.bounds.top||box.bottom>env.bounds.bottom)return;
      /* Le rebord doit être réellement rendu à cet endroit : un bloc replié (details fermé) garde des coordonnées virtuelles. */
      const hit=doc().elementFromPoint(bx,by+5);
      if(!hit||!(hit===el||el.contains(hit)))return;
      cands.push({el,bx,by,box});
    });
  });
  for(let i=cands.length-1;i>0;i--){const j=Math.floor(rand()*(i+1)),t=cands[i];cands[i]=cands[j];cands[j]=t}
  /* Recherche bornée de façon déterministe (50 évaluations, 4 positions valides au plus ; 60 ms en simple filet) : le démarrage
     d'une scène ne fait jamais saccader l'écran, et une machine chargée ne rend pas un faux « pas de place ». */
  const memo=new Map(),t0=now(),found=[];
  let tested=0;
  for(const c of cands){
    if(found.length>=4||tested>=50||now()-t0>60)break;
    tested++;
    if(occupancy(c.box,memo)<=OCC_MAX)found.push(c);
  }
  if(!found.length)return null;
  /* Hôte prêté : on préfère le rebord le plus proche (vol court au-dessus du contenu). */
  if(env.host){const at=env.host.rect.top;found.sort((a,b)=>Math.abs(a.by-at)-Math.abs(b.by-at))}
  return found[0];
}

/* ------------------------------------------------------------------ calque, style */
function ensureStyle(){
  const d=doc();
  if(d.getElementById(STYLE_ID))return;
  const s=d.createElement('style');s.id=STYLE_ID;
  s.textContent=[
    '#'+LAYER_ID+'{position:fixed;left:0;top:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:hidden;z-index:100;display:none;contain:layout paint}',
    '#'+LAYER_ID+'[data-on]{display:block}',
    '#'+LAYER_ID+',#'+LAYER_ID+' *{pointer-events:none!important;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}',
    '.srAmbientScene{position:absolute;left:0;top:0;width:0;height:0}',
    '.srAmbientClip{position:absolute;overflow:hidden}',
    '.srAmbientActor{position:absolute;left:0;top:0;width:'+W+'px;height:'+H+'px;transform-origin:50% 94%}',
    '.srAmbientActor .srRunner{gap:0}',
    '.srAmbientLetter{position:absolute;display:block;margin:0;padding:0;white-space:pre;overflow:visible;transform-origin:50% 100%;will-change:transform}',
    /* Un seul Runner visible pendant une scène : la figure des hôtes est « prêtée » (visibility garde la mise en page). */
    'html[data-sr-ambient] .srRunner:not([data-sr-ambient-actor]) .srRunnerFigure{visibility:hidden}',
    '::highlight('+HIGHLIGHT+'){color:transparent;-webkit-text-fill-color:transparent;text-shadow:none}'
  ].join('');
  (d.head||d.documentElement).appendChild(s);
}
function ensureLayer(){
  const d=doc();
  if(layer&&layer.isConnected)return layer;
  ensureStyle();
  layer=d.createElement('div');layer.id=LAYER_ID;layer.setAttribute('aria-hidden','true');
  d.body.appendChild(layer);
  return layer;
}

/* ------------------------------------------------------------------ exécution d'une scène */
function el(tag,cls){const e=doc().createElement(tag);if(cls)e.className=cls;return e}
const T=(x,y,r)=>'translate3d('+Math.round(x*10)/10+'px,'+Math.round(y*10)/10+'px,0) rotate('+(Math.round((r||0)*10)/10)+'deg)';

function newRun(def,env,plan){
  const run={def,env,plan,ctx:env.ctx,field:env.field||null,dead:false,done:false,anims:[],cleanups:[],root:null,stage:null,inst:null,p:null,ox:0,oy:0,timer:0,anchor:null,rect0:null,reason:'',resolve:null};
  run.finished=new Promise(res=>{run.resolve=res});
  /* Une étape d'animation : vrai à la fin, faux si la scène est annulée entre-temps. */
  run.play=(target,frames,opts)=>new Promise(res=>{
    if(run.dead)return res(false);
    let a;
    try{a=target.animate(frames,Object.assign({fill:'forwards',easing:'ease-in-out',iterations:1},opts))}catch(e){return res(false)}
    run.anims.push(a);
    /* À chaque étape : l'ancre existe encore (l'écran a pu se redessiner) et aucun garde-fou ne s'est levé entre-temps. */
    a.onfinish=()=>{
      if(!run.dead){
        const lost=run.anchor&&!rectOf(run.anchor),why=lost?'anchor-lost':revalidate(run);
        if(why){abort(run,why,true);res(false);return}
      }
      res(!run.dead);
    };
    a.oncancel=()=>res(false);
  });
  /* Attente en tranches de 500 ms au plus : l'ancre est vérifiée entre deux tranches. */
  run.hold=async ms=>{
    for(let left=ms;left>0;left-=500){
      if(!await run.play(run.root,[{opacity:1},{opacity:1}],{duration:Math.min(left,500),fill:'none'}))return false;
    }
    return true;
  };
  run.mount=(parent,ox,oy,k)=>{
    const api=root.StoreRunnerRunner,f=k||1;
    const stage=el('div','srAmbientActor');stage.style.visibility='hidden';
    if(f!==1){stage.style.width=Math.round(W*f)+'px';stage.style.height=Math.round(H*f)+'px'}
    parent.appendChild(stage);
    const inst=api&&api.mount(stage,{variant:'bubble',size:Math.round(W*f),decorative:true,detached:true});
    if(!inst){stage.remove();return false}
    inst.el.setAttribute('data-sr-ambient-actor','');
    run.stage=stage;run.inst=inst;run.ox=ox||0;run.oy=oy||0;
    run.cleanups.push(()=>{try{inst.destroy()}catch(e){}});
    return true;
  };
  run.put=p=>{run.p=p;run.stage.style.transform=T(p.x-run.ox,p.y-run.oy,p.r)};
  run.show=p=>{
    run.put(p);
    run.stage.style.visibility='';
    doc().documentElement.setAttribute('data-sr-ambient','on');
    try{run.inst.setPresence(true)}catch(e){}
  };
  /* Déplacement d'une pose à l'autre ; commit en ligne puis annulation de l'animation : aucune mémoire d'effet. */
  run.move=async(to,o)=>{
    const from=run.p,opt=o||{};
    const frames=[{transform:T(from.x-run.ox,from.y-run.oy,from.r)}];
    if(opt.arc)frames.push({transform:T((from.x+to.x)/2-run.ox,(from.y+to.y)/2-run.oy-opt.arc,(from.r+to.r)/2),offset:.5});
    frames.push({transform:T(to.x-run.ox,to.y-run.oy,to.r)});
    const ok=await run.play(run.stage,frames,{duration:opt.ms||600,easing:opt.easing||'cubic-bezier(.4,0,.25,1)'});
    if(!ok||run.dead)return false;
    run.put(to);
    return true;
  };
  run.squash=async()=>{
    const t=T(run.p.x-run.ox,run.p.y-run.oy,run.p.r);
    return run.play(run.stage,[{transform:t+' scale(1,1)'},{transform:t+' scale(1.05,.92)',offset:.4},{transform:t+' scale(1,1)'}],{duration:240,fill:'none'});
  };
  run.gesture=(kind,opts)=>{try{return run.inst.react(kind,opts)}catch(e){return Promise.resolve(false)}};
  run.posture=(p,swing)=>{try{run.inst.setPosture(p,{swing:swing===true})}catch(e){}};
  return run;
}
/* Entrée et sortie : depuis la figure de l'hôte (échange sans à-coup) ou depuis le bord de l'écran le plus proche. */
function entryPose(env,target){
  if(env.host)return{x:env.host.rect.left,y:env.host.rect.top,r:0};
  const right=target.x+W/2>env.vw/2;
  return{x:right?env.vw+12:-W-12,y:Math.max(env.bounds.top,target.y-28),r:0};
}

function finishRun(run){
  if(run.done)return;
  run.done=true;run.dead=true;
  if(run.timer){root.clearTimeout(run.timer);run.timer=0}
  for(const a of run.anims){try{a.cancel()}catch(e){}}
  run.anims=[];
  for(let i=run.cleanups.length-1;i>=0;i--){try{run.cleanups[i]()}catch(e){}}
  const html=doc()&&doc().documentElement;
  if(html)html.removeAttribute('data-sr-ambient');
  if(layer){layer.removeAttribute('data-on');layer.style.zIndex=''}
  if(S.run===run)S.run=null;
  S.prev=run.def.id;
  if(run.ctx==='form')S.lastFormAt=now();
  run.resolve({played:true,scene:run.def.id,reason:run.reason||'done'});
  arm(nextGap(S.random||Math.random));
}
/* Annulation : immédiate, ou avec un fondu de 180 ms quand l'acteur est visible (changement d'écran, perte de focus). */
function abort(run,reason,fade){
  if(!run||run.dead)return false;
  run.dead=true;run.reason=reason;
  for(const a of run.anims){try{a.cancel()}catch(e){}}
  run.anims=[];
  if(fade&&run.stage&&run.stage.isConnected&&run.stage.style.visibility!=='hidden'){
    try{const a=run.stage.animate([{opacity:1},{opacity:0}],{duration:180,fill:'forwards'});a.onfinish=a.oncancel=()=>finishRun(run);return true}catch(e){}
  }
  finishRun(run);
  return true;
}
/* Jusqu'où l'acteur s'étend au-dessus et au-dessous du bord haut de son ancre, au départ de la scène. */
function reachOf(run){
  const p=run.plan,top=run.rect0.top;
  if(p.spot&&p.spot.box)return{up:Math.max(0,top-p.spot.box.top),down:Math.max(0,p.spot.box.bottom-top)};
  if(p.spot&&p.spot.vis)return{up:p.spot.vis,down:0};
  return{up:12,down:H};
}
/* La scène suit son ancre (défilement de n'importe quel conteneur, redimensionnement, clavier) : jamais de position figée. */
function track(run,anchor){
  run.anchor=anchor;run.rect0=rectOf(anchor);
  if(!run.rect0){abort(run,'anchor-lost',false);return}
  const d=doc(),vv=root.visualViewport;
  const reach=reachOf(run);
  const move=()=>{
    if(run.dead)return;
    const r=rectOf(anchor);
    if(!r){abort(run,'anchor-lost',true);return}
    /* L'emprise de l'acteur suit l'ancre : si elle sort de la zone sûre (sous l'en-tête collant, sous la barre basse), Runner repart. */
    const b=safeBounds();
    if(r.top-reach.up<b.top-2||r.top+reach.down>b.bottom+2){abort(run,'out-of-bounds',true);return}
    run.root.style.transform='translate3d('+(r.left-run.rect0.left)+'px,'+(r.top-run.rect0.top)+'px,0)';
  };
  d.addEventListener('scroll',move,{capture:true,passive:true});
  root.addEventListener('resize',move);
  if(vv)vv.addEventListener('resize',move);
  run.cleanups.push(()=>{d.removeEventListener('scroll',move,{capture:true});root.removeEventListener('resize',move);if(vv)vv.removeEventListener('resize',move)});
}
/* Pendant une scène seulement : un changement d'onglet, de feuille ou de clavier la referme. */
function watch(run){
  if(typeof root.MutationObserver!=='function')return;
  const d=doc();
  const obs=new root.MutationObserver(()=>{
    if(run.dead)return;
    const why=revalidate(run);
    if(why)abort(run,why,true);
  });
  d.querySelectorAll('.panel,#assistantPanel,#moreSheetV2,#storeQuickSheet,dialog').forEach(n=>obs.observe(n,{attributes:true,attributeFilter:['class','open']}));
  obs.observe(d.documentElement,{attributes:true,attributeFilter:['class','data-sr-keyboard']});
  /* Gardes prioritaires : voix et point du jour de l'Accueil, bannière de mise à jour, état métier des hôtes. */
  d.querySelectorAll('#homeRunnerLineV273,#homeRunnerBriefV276,#storeRunnerUpdateBanner').forEach(n=>obs.observe(n,{attributes:true,attributeFilter:['hidden']}));
  d.querySelectorAll('.srRunner[data-sr-runner]').forEach(n=>{if(!n.hasAttribute('data-sr-ambient-actor'))obs.observe(n,{attributes:true,attributeFilter:['data-state']})});
  if(d.body)obs.observe(d.body,{childList:true});
  run.cleanups.push(()=>obs.disconnect());
}
function facts(){
  const field=activeField(),panel=activePanelId();
  const block=blockedReason(field,panel);
  return{field,panel,block,f:{inert:!!inertReason(),blocked:!!block,field:!!field,keyboard:keyboardOpen(),panel}};
}
function revalidate(run){
  const x=facts(),ctx=resolveContext(x.f);
  if(x.f.inert||x.block)return 'blocked';
  if(ctx!==run.ctx)return 'context';
  if(run.ctx==='form'&&x.field!==run.field)return 'field';
  /* Un état métier de Runner ou un geste de son propriétaire passe avant le décor, même en pleine scène. */
  const h=hostInfo(x.field&&x.field.closest('dialog,#storeQuickSheet'));
  if(h.block==='host-state'||h.block==='host-busy')return h.block;
  return '';
}
/* Couche supérieure : un champ d'un dialogue modal autorisé n'est jamais atteint par un z-index, on promeut le calque (API Popover). */
function promote(run,anchor){
  const l=ensureLayer();
  l.setAttribute('data-on','');
  const dlg=anchor.closest&&anchor.closest('dialog');
  if(dlg&&dlg.open){
    if(typeof l.showPopover!=='function')return false;
    l.setAttribute('popover','manual');
    try{l.showPopover()}catch(e){l.removeAttribute('popover');return false}
    run.cleanups.push(()=>{try{l.hidePopover()}catch(e){}l.removeAttribute('popover')});
    return true;
  }
  let z=100;
  for(let n=anchor;n&&n!==doc().body;n=n.parentElement){
    const cs=root.getComputedStyle(n);
    if(cs.position==='fixed'&&/^\d+$/.test(cs.zIndex))z=Math.max(z,parseInt(cs.zIndex,10)+1);
  }
  l.style.zIndex=String(z);
  return true;
}

/* ------------------------------------------------------------------ lettres du titre de l'Accueil */
function letterSupport(){return!!(root.CSS&&root.CSS.highlights&&typeof root.Highlight==='function')}
function planLetters(env,count){
  const title=doc().querySelector('#premiumHomeV2 .phTitle');
  if(!title||!letterSupport()||title.childNodes.length!==1||title.firstChild.nodeType!==3)return null;
  const tr=rectOf(title);
  if(!tr||tr.top<env.bounds.top||tr.bottom>env.bounds.bottom)return null;
  const node=title.firstChild,idx=pickLetters(node.nodeValue,count,S.random||Math.random);
  const letters=[];
  for(const i of idx){
    const range=doc().createRange();range.setStart(node,i);range.setEnd(node,i+1);
    const r=range.getBoundingClientRect();
    if(!(r.width>2&&r.height>8)||r.left<4||r.right>env.vw-4)continue;
    letters.push({range,ch:node.nodeValue[i],rect:{left:r.left,top:r.top,width:r.width,height:r.height,right:r.right}});
  }
  if(!letters.length)return null;
  return{title,letters,cs:root.getComputedStyle(title)};
}
/* La lettre réelle est masquée par un surlignage CSS (aucune modification du DOM) et remplacée par un clone au même endroit. */
function takeLetter(run,plan,letter){
  const clone=el('span','srAmbientLetter'),st=clone.style,cs=plan.cs;
  clone.textContent=letter.ch;
  st.left=letter.rect.left+'px';st.top=letter.rect.top+'px';st.width=letter.rect.width+'px';st.height=letter.rect.height+'px';st.lineHeight=letter.rect.height+'px';
  st.fontFamily=cs.fontFamily;st.fontSize=cs.fontSize;st.fontWeight=cs.fontWeight;st.fontStyle=cs.fontStyle;st.letterSpacing=cs.letterSpacing;st.color=cs.color;st.textTransform=cs.textTransform;
  run.root.appendChild(clone);
  if(!run.highlight){
    run.highlight=new root.Highlight();root.CSS.highlights.set(HIGHLIGHT,run.highlight);
    run.cleanups.push(()=>{try{root.CSS.highlights.delete(HIGHLIGHT)}catch(e){}});
  }
  run.highlight.add(letter.range);
  letter.clone=clone;
  run.cleanups.push(()=>clone.remove());
}
function giveBack(run,letter){
  if(run.highlight)run.highlight.delete(letter.range);
  if(letter.clone)letter.clone.remove();
}
function standPose(env,letter){
  return{x:letter.rect.right-2,y:letter.rect.top+letter.rect.height/2-H/2+3,r:0};
}
async function pushLetter(run,env,plan,letter){
  const stand=standPose(env,letter);
  if(!await run.move(stand,{ms:run.p.x>stand.x+100?900:520,arc:12,easing:'cubic-bezier(.22,.8,.3,1)'}))return false;
  run.gesture('look',{toward:letter.clone||plan.title});
  if(!await run.hold(380))return false;
  const dir=-1;
  takeLetter(run,plan,letter);
  const fall=run.play(letter.clone,fallFrames(letter.rect.height,dir),{duration:1500,easing:'linear'});
  /* coup d'épaule : une fente vers la lettre, puis recul */
  if(!await run.move({x:stand.x-9,y:stand.y,r:-7},{ms:150,easing:'cubic-bezier(.3,.9,.4,1)'}))return false;
  if(!await run.move(stand,{ms:260,easing:'ease-out'}))return false;
  letter.fall=fall;
  return true;
}
async function runLetters(run,env,plan,count){
  if(!run.mount(run.root,0,0))return;
  const first=standPose(env,plan.letters[0]);
  run.show(entryPose(env,first));
  if(!await pushLetter(run,env,plan,plan.letters[0]))return;
  run.gesture('look',{toward:'down'});
  if(count>1&&plan.letters[1]){
    if(!await run.hold(650))return;
    if(!await pushLetter(run,env,plan,plan.letters[1]))return;
  }
  if(!await run.hold(count>1?500:900))return;
  /* Les lettres reviennent à leur place ; Runner recule d'un pas et hoche la tête. */
  const backs=plan.letters.filter(l=>l.clone).map((l,i)=>run.play(l.clone,returnFrames(l.rect.height,-1),{duration:700,delay:i*160,easing:'linear'}).then(ok=>{if(ok)giveBack(run,l);return ok}));
  run.move({x:run.p.x+10,y:run.p.y,r:4},{ms:380,easing:'ease-out'});
  run.gesture('nod');
  const all=await Promise.all(backs);
  if(all.some(ok=>!ok)||run.dead)return;
  await exitScene(run,env);
}
async function exitScene(run,env){
  const target=env.host?{x:env.host.rect.left,y:env.host.rect.top,r:0}:entryPose(env,run.p);
  await run.move(target,{ms:900,arc:14,easing:'cubic-bezier(.4,0,.25,1)'});
}

/* ------------------------------------------------------------------ les autres scènes */
async function runSit(run,env,plan){
  const s=plan.spot,hover=pose(s.bx,s.by-32),seat=pose(s.bx,s.by+1);
  if(!run.mount(run.root,0,0))return;
  run.show(entryPose(env,hover));
  if(!await run.move(hover,{ms:900,arc:22,easing:'cubic-bezier(.22,.8,.3,1)'}))return;
  if(!await run.move(seat,{ms:380,easing:'cubic-bezier(.5,0,.9,.6)'}))return;
  run.posture('seated',true);
  run.squash();
  run.gesture('look',{toward:s.el});
  if(!await run.hold(2700))return;
  run.posture('floating');
  if(!await run.hold(300))return;
  if(!await run.move(hover,{ms:420,easing:'ease-out'}))return;
  await exitScene(run,env);
}
async function runObserve(run,env,plan){
  const s=plan.spot,spot=pose(s.bx,s.by-6,-4),dir=s.bx>env.vw/2?-1:1;
  if(!run.mount(run.root,0,0))return;
  run.show(entryPose(env,spot));
  if(!await run.move(spot,{ms:900,arc:20,easing:'cubic-bezier(.22,.8,.3,1)'}))return;
  run.gesture('tilt',{toward:s.el});
  if(!await run.move(pose(s.bx,s.by-9,-4),{ms:520}))return;
  if(!await run.move(pose(s.bx+dir*24,s.by-6,dir*-6),{ms:760}))return;
  run.gesture('look',{toward:'down'});
  if(!await run.move(pose(s.bx,s.by-9,-4),{ms:760}))return;
  if(!await run.hold(500))return;
  await exitScene(run,env);
}
async function runPeek(run,env,plan){
  const s=plan.spot,b=env.bounds;
  /* Le haut de la carte est le rebord : tout ce qui est sous lui reste caché. */
  const clip=el('div','srAmbientClip');
  clip.style.left='0px';clip.style.top=b.top+'px';clip.style.width=env.vw+'px';clip.style.height=Math.max(0,s.by-b.top)+'px';
  run.root.appendChild(clip);
  if(!run.mount(clip,0,b.top))return;
  const up=pose(s.bx,s.by+BODY-46),hidden=pose(s.bx,s.by+BODY+4);
  run.show(entryPose(env,pose(s.bx,s.by-26)));
  if(!await run.move(pose(s.bx,s.by-26),{ms:900,arc:18,easing:'cubic-bezier(.22,.8,.3,1)'}))return;
  if(!await run.move(hidden,{ms:560,easing:'cubic-bezier(.5,0,.9,.6)'}))return;
  if(!await run.hold(520))return;
  if(!await run.move(up,{ms:640,easing:'cubic-bezier(.2,.9,.3,1)'}))return;
  run.gesture('look',{toward:'down'});
  if(!await run.hold(500))return;
  run.gesture('tilt',{toward:s.el});
  if(!await run.hold(1000))return;
  if(!await run.move(pose(s.bx,s.by-26),{ms:520,easing:'ease-out'}))return;
  await exitScene(run,env);
}
/* Saisie : Runner (75 %) émerge de derrière le rebord haut du champ, tête penchée vers lui ; il ne recouvre jamais le champ. */
async function runLean(run,env,plan){
  const s=plan.spot,b=env.bounds,k=s.k;
  const clip=el('div','srAmbientClip');
  clip.style.left=s.left+'px';clip.style.top=b.top+'px';clip.style.width=s.width+'px';clip.style.height=Math.max(0,s.by-b.top)+'px';
  run.root.appendChild(clip);
  if(!run.mount(clip,s.left,b.top,k))return;
  const hidden=pose(s.bx,s.by+BODY*k+4,0,k),up=pose(s.bx,s.by-s.vis+BODY*k,s.bx>s.left+s.width/2?-6:6,k);
  run.show(hidden);
  if(!await run.move(up,{ms:680,easing:'cubic-bezier(.2,.9,.3,1)'}))return;
  run.gesture('tilt',{toward:run.field});
  if(!await run.hold(1500))return;
  run.gesture('look',{toward:'down'});
  if(!await run.move(pose(s.bx,s.by-s.vis+BODY*k+3,up.r*1.4,k),{ms:520,easing:'ease-in-out'}))return;
  if(!await run.hold(1100))return;
  await run.move(hidden,{ms:560,easing:'cubic-bezier(.5,0,.9,.6)'});
}

/* ------------------------------------------------------------------ planification des scènes */
const PLANNERS={
  'letter-push':env=>{const p=env.ctx==='home'?planLetters(env,1):null;return p?{letters:p,anchor:p.title}:null},
  'letter-double':env=>{const p=env.ctx==='home'?planLetters(env,2):null;return p&&p.letters.length>1?{letters:p,anchor:p.title}:null},
  'sit-edge':env=>{const spot=edgeSpot(env,'sit');return spot?{spot,anchor:spot.el}:null},
  'peek-behind':env=>{const spot=edgeSpot(env,'peek');return spot&&spot.by-env.bounds.top>80?{spot,anchor:spot.el}:null},
  'observe-card':env=>{const spot=env.ctx==='planning'?edgeSpot(env,'observe'):null;return spot?{spot,anchor:spot.el}:null},
  'lean-field':env=>{
    const f=env.field,r=f&&rectOf(f),k=.75,w=W*k;
    /* Pas d'hôte visible : l'acteur n'a aucun vol à faire, il sort de derrière le champ. */
    if(!r||env.host)return null;
    const memo=new Map();
    for(const vis of [34,26])for(const bx of [r.right-34,r.left+34,r.left+r.width/2]){
      if(bx<w/2+4||bx>env.vw-w/2-4)continue;
      const by=r.top,box={left:bx-w/2,right:bx+w/2,top:by-vis,bottom:by};
      if(box.top<env.bounds.top)continue;
      if(occupancy(box,memo)<=OCC_MAX)return{spot:{el:f,bx,by,vis,k,left:r.left,width:r.width},anchor:f};
    }
    return null;
  }
};
const RUNNERS={
  'letter-push':(run,env,plan)=>runLetters(run,env,plan.letters,1),
  'letter-double':(run,env,plan)=>runLetters(run,env,plan.letters,2),
  'sit-edge':runSit,'peek-behind':runPeek,'observe-card':runObserve,'lean-field':runLean
};
/* Prépare une scène : garde-fous, contexte, hôte, zone sûre, puis premier plan faisable. `only` impose la scène (tests, play). */
function prepare(only){
  const why=inertReason();
  if(why)return{ok:false,reason:why};
  const x=facts();
  if(x.block)return{ok:false,reason:x.block};
  const ctx=resolveContext(x.f);
  if(!ctx)return{ok:false,reason:'no-context'};
  if(ctx==='form'&&!only&&now()-S.lastFormAt<FORM_COOLDOWN)return{ok:false,reason:'form-cooldown'};
  const h=hostInfo(x.field&&x.field.closest('dialog,#storeQuickSheet'));
  if(h.block)return{ok:false,reason:h.block};
  const bounds=safeBounds(),env={ctx,host:h.host,field:x.field,bounds,vw:bounds.vw,vh:bounds.vh};
  const order=only?(CONTEXTS[ctx]||[]).filter(id=>id===only):orderScenes(ctx,S.prev,S.random||Math.random);
  if(!order.length)return{ok:false,reason:'scene-not-in-context'};
  for(const id of order){
    let plan=null;
    try{plan=PLANNERS[id](env)}catch(e){plan=null}
    if(plan)return{ok:true,id,env,plan};
  }
  return{ok:false,reason:'no-spot'};
}
function begin(r){
  const def={id:r.id},run=newRun(def,r.env,r.plan);
  S.run=run;
  const l=ensureLayer();
  run.root=el('div','srAmbientScene');
  l.appendChild(run.root);
  run.cleanups.push(()=>run.root.remove());
  const anchor=r.plan.anchor;
  if(!promote(run,anchor)){finishRun(run);return run.finished}
  track(run,anchor);
  if(run.done)return run.finished;
  watch(run);
  run.timer=root.setTimeout(()=>abort(run,'watchdog',false),MAX_MS[r.id]+3000);
  const task=RUNNERS[r.id](run,r.env,r.plan);
  Promise.resolve(task).catch(()=>{}).then(()=>{if(!run.done)finishRun(run)});
  return run.finished;
}

/* ------------------------------------------------------------------ cadence */
function arm(ms){
  if(S.timer){root.clearTimeout(S.timer);S.timer=0}
  S.fast=false;
  if(!S.started||S.run||inertReason())return;
  S.timer=root.setTimeout(tick,ms);
}
function tick(){
  S.timer=0;
  if(S.run)return;
  /* Minuterie accélérée par un focus : si le champ a perdu le focus entre-temps, on revient au rythme normal (8 à 12 s). */
  const fast=S.fast;S.fast=false;
  if(fast&&!activeField()){arm(nextGap(S.random||Math.random));return}
  const r=prepare(null);
  if(!r.ok){S.lastReason=r.reason;arm(nextGap(S.random||Math.random));return}
  S.lastReason='';
  begin(r);
}
function play(id){
  if(S.run)return Promise.resolve({played:false,reason:'busy'});
  if(S.timer){root.clearTimeout(S.timer);S.timer=0}
  const r=prepare(id||null);
  if(!r.ok){S.lastReason=r.reason;arm(nextGap(S.random||Math.random));return Promise.resolve({played:false,reason:r.reason})}
  return begin(r);
}

/* ------------------------------------------------------------------ cycle de vie */
function onVisibility(){
  const d=doc();
  if(d.hidden){if(S.run)abort(S.run,'hidden',false);if(S.timer){root.clearTimeout(S.timer);S.timer=0}}
  else arm(nextGap(S.random||Math.random));
}
function onPageHide(){if(S.run)abort(S.run,'pagehide',false);if(S.timer){root.clearTimeout(S.timer);S.timer=0}}
function onPageShow(){arm(nextGap(S.random||Math.random))}
function onMotion(){
  if(motionReduced()){if(S.run)abort(S.run,'reduced-motion',false);if(S.timer){root.clearTimeout(S.timer);S.timer=0}}
  else arm(nextGap(S.random||Math.random));
}
/* Un champ prend le focus : Runner peut venir regarder, après un court délai, au plus toutes les 25 s. */
function onFocusIn(){
  if(S.run||!S.started)return;
  if(!activeField()||now()-S.lastFormAt<FORM_COOLDOWN)return;
  arm(Math.round(FORM_DELAY_MIN+rand()*(FORM_DELAY_MAX-FORM_DELAY_MIN)));
  S.fast=S.timer!==0;
}
function onFocusOut(e){
  const run=S.run;
  if(run&&run.ctx==='form'&&e&&e.target===run.field)abort(run,'blur',true);
}
/* La personnalité (Discret) se règle dans la feuille Apparence : à sa fermeture, la cadence reprend si elle dormait. */
function onAppearanceClosed(){if(S.started&&!S.run&&!S.timer)arm(nextGap(S.random||Math.random))}
function start(){
  if(S.started||!doc()||root.__STORE_RUNNER_AMBIENT==='off')return false;
  S.started=true;
  const d=doc();
  d.addEventListener('visibilitychange',onVisibility);
  root.addEventListener('pagehide',onPageHide);
  root.addEventListener('pageshow',onPageShow);
  d.addEventListener('focusin',onFocusIn,true);
  d.addEventListener('focusout',onFocusOut,true);
  d.addEventListener('store-runner:appearance-closed',onAppearanceClosed);
  S.motion=typeof root.matchMedia==='function'?root.matchMedia('(prefers-reduced-motion: reduce)'):null;
  if(S.motion&&typeof S.motion.addEventListener==='function')S.motion.addEventListener('change',onMotion);
  const go=()=>arm(nextGap(S.random||Math.random));
  if(d.readyState==='complete')go();else root.addEventListener('load',go,{once:true});
  return true;
}
function stop(){
  if(!S.started)return false;
  S.started=false;
  if(S.run)abort(S.run,'stopped',false);
  if(S.timer){root.clearTimeout(S.timer);S.timer=0}
  const d=doc();
  d.removeEventListener('visibilitychange',onVisibility);
  root.removeEventListener('pagehide',onPageHide);
  root.removeEventListener('pageshow',onPageShow);
  d.removeEventListener('focusin',onFocusIn,true);
  d.removeEventListener('focusout',onFocusOut,true);
  d.removeEventListener('store-runner:appearance-closed',onAppearanceClosed);
  if(S.motion&&typeof S.motion.removeEventListener==='function')S.motion.removeEventListener('change',onMotion);
  S.motion=null;
  return true;
}
/* Réglage de présentation (tests) : aléa injectable. Aucun autre paramètre n'est exposé. */
function configure(o){if(o&&typeof o.random==='function')S.random=o.random;return true}
function describe(node){return node&&node.tagName?node.tagName.toLowerCase()+(node.id?'#'+node.id:'')+(node.className&&typeof node.className==='string'?'.'+node.className.trim().split(/\s+/)[0]:''):''}
function status(){
  const run=S.run,spot=run&&run.plan&&(run.plan.spot||null);
  return{started:S.started,running:!!run,scene:run?run.def.id:null,previous:S.prev,context:run?run.ctx:null,pendingTimers:(S.timer?1:0)+(run&&run.timer?1:0),reason:S.lastReason,layer:!!(layer&&layer.isConnected),
    anchor:run?describe(run.plan.anchor):'',spot:spot?{bx:Math.round(spot.bx),by:Math.round(spot.by)}:null,posture:run&&run.inst?run.inst.getPosture():null};
}
function abortCurrent(reason){return S.run?abort(S.run,reason||'external',true):false}

return{
  VERSION,SCENES,CONTEXTS,WEIGHTS,GAP_MIN,GAP_MAX,FORM_DIALOGS,
  nextGap,resolveContext,orderScenes,pickScene,pickLetters,fallFrames,returnFrames,
  start,stop,play,configure,status,abort:abortCurrent
};
});
