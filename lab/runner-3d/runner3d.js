/* Runner 3D — prototype du Lab uniquement. Jamais chargé par l'application (index.html / sw.js).
   Même forme d'API que runner-visual.js (mount → setState, showMessage, react, moveTo, setPosture,
   setPresence, destroy) pour pouvoir piloter les deux personnages avec le même code de scène.
   Une seule image (une seule pose) : la tête, le bras droit et les jambes sont des CALQUES découpés
   dans cette image ; les yeux sont recolorés par un recouvrement. Tout geste qui n'existe pas dans
   l'image est donc SIMULÉ ; `SUPPORT` dit précisément lequel. Présentation pure : aucune donnée. */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.document)root.Runner3D=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';

const STATES=Object.freeze(['neutral','analyzing','alert','success']);
const STATE_LABELS=Object.freeze({neutral:'En attente',analyzing:'Il réfléchit',alert:'Une contrainte détectée',success:'Tout est ok'});
const TONES=Object.freeze({
  neutral:{accent:'#2f7bff',tint:'#f1f6ff',line:'#d3e2fa',title:'#10224d'},
  analyzing:{accent:'#3aa0ff',tint:'#eef6ff',line:'#cfe3fb',title:'#10224d'},
  alert:{accent:'#e5392b',tint:'#fdecea',line:'#f6cbc6',title:'#b72a1b'},
  success:{accent:'#22b573',tint:'#e8f7ef',line:'#bfe6d1',title:'#16704a'}
});
/* Vérité du prototype : natif = mécanisme identique au classique ; simulé = calque ou effet ;
   indisponible = impossible avec une pose unique. */
const SUPPORT=Object.freeze({
  blink:{level:'sim',how:'paupière sur les yeux recolorés'},
  nod:{level:'sim',how:'calque tête découpé'},
  look:{level:'sim',how:'tête + yeux décalés'},
  tilt:{level:'sim',how:'calque tête incliné'},
  wave:{level:'sim',how:'calque bras droit pivotant'},
  hop:{level:'sim',how:'saut du corps entier'},
  shake:{level:'sim',how:'secousse de la tête'},
  seated:{level:'sim',how:'hanches posées au bord de la carte, jambes (calques) qui pendent'},
  legs:{level:'sim',how:'calques jambes pivotant aux hanches'},
  moveTo:{level:'native',how:'même principe FLIP que le classique'},
  peek:{level:'native',how:'translation depuis le bord de l’hôte'},
  presence:{level:'native',how:'clignements et regards espacés, annulables'},
  states:{level:'sim',how:'yeux recolorés + effets (bras d’état indisponibles)'},
  stateArms:{level:'na',how:'les bras levés de l’alerte et du succès demandent d’autres poses'}
});

const IMG='runner-whats-new.webp';
const RATIO='640/795';
const CLIP_SVG='<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0"><defs>'
 +'<clipPath id="r3c-body" clipPathUnits="objectBoundingBox"><path clip-rule="evenodd" d="M0 0H1V1H0Z M.10 0H.81V.505H.10Z M.70 .505H.82V.40H1V.64H.70Z M.20 .795H.49V1H.20Z M.49 .795H.80V1H.49Z"/></clipPath>'
 +'<clipPath id="r3c-head" clipPathUnits="objectBoundingBox"><path d="M.10 0H.81V.515H.10Z"/></clipPath>'
 +'<clipPath id="r3c-arm" clipPathUnits="objectBoundingBox"><path d="M.685 .505H.82V.40H1V.64H.685Z"/></clipPath>'
 +'<clipPath id="r3c-legl" clipPathUnits="objectBoundingBox"><path d="M.20 .775H.49V1H.20Z"/></clipPath>'
 +'<clipPath id="r3c-legr" clipPathUnits="objectBoundingBox"><path d="M.49 .775H.80V1H.49Z"/></clipPath>'
 +'</defs></svg>';

const CSS=[
'.r3Host{position:relative;display:inline-flex;align-items:center;gap:8px;max-width:100%;--r3-size:96px;pointer-events:none}',
'.r3Host[data-variant="sheet"]{flex-direction:column;align-items:flex-start}',
'.r3Figure{position:relative;flex:0 0 auto;width:var(--r3-size);aspect-ratio:'+RATIO+'}',
'.r3Float{position:absolute;inset:0;animation:r3Breathe 4.6s ease-in-out infinite;will-change:transform}',
'.r3Host[data-motion="off"] .r3Float{animation:none}',
'@media (prefers-reduced-motion:reduce){.r3Float{animation:none}}',
'@keyframes r3Breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6%)}}',
'.r3Shadow{position:absolute;left:18%;right:18%;bottom:-2%;height:5%;border-radius:50%;background:radial-gradient(closest-side,rgba(40,80,160,.28),rgba(40,80,160,0));pointer-events:none}',
'.r3Host[data-posture="seated"] .r3Shadow{opacity:0}',
'.r3L{position:absolute;inset:0;width:100%;height:100%;display:block;max-width:none;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;pointer-events:none}',
'.r3Body{clip-path:url(#r3c-body)}.r3Head{position:absolute;inset:0;transform-origin:45% 50.5%}',
'.r3Head .r3L{clip-path:url(#r3c-head)}',
'.r3Arm{clip-path:url(#r3c-arm);transform-origin:71% 55%}',
'.r3LegL{clip-path:url(#r3c-legl);transform-origin:37% 79.5%}.r3LegR{clip-path:url(#r3c-legr);transform-origin:62% 79.5%}',
/* yeux : un masque sombre couvre la lueur d'origine, une lueur recolorable la remplace */
'.r3Eyes{position:absolute;inset:0;transform-origin:54% 33%;--eye:#4db8ff;--eye2:#1d86ff}',
'.r3Eye{position:absolute;width:8.5%;height:10.5%}',
'.r3Eye.l{left:38.75%;top:29.25%}.r3Eye.r{left:61%;top:26.75%;transform:rotate(-5deg)}',
'.r3Eye::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at center,#0b0f17 0,#0b0f17 70%,rgba(11,15,23,0) 100%)}',
'.r3Eye::after{content:"";position:absolute;inset:17% 17.5%;border-radius:50%;background:radial-gradient(circle at 50% 38%,#fff 0,var(--eye) 38%,var(--eye2) 100%);box-shadow:0 0 .55em var(--eye);transition:background .25s,box-shadow .25s,inset .2s,border-radius .2s}',
'.r3Host[data-state="analyzing"] .r3Eyes{--eye:#6fd0ff;--eye2:#2a9bff}',
'.r3Host[data-state="alert"] .r3Eyes{--eye:#ff6a55;--eye2:#e5392b}',
'.r3Host[data-state="alert"] .r3Eye::after{inset:10% 22%}',
'.r3Host[data-state="success"] .r3Eyes{--eye:#3fe0a0;--eye2:#22b573}',
/* succès : yeux souriants (arcs) */
'.r3Host[data-state="success"] .r3Eye::after{inset:30% 14% 30%;background:transparent;box-shadow:0 0 .5em var(--eye);border:.22em solid var(--eye);border-bottom-color:transparent;border-left-color:var(--eye);border-right-color:var(--eye);border-radius:60% 60% 0 0/100% 100% 0 0}',
'.r3Host[data-state="analyzing"] .r3Eyes{animation:r3Scan 1.5s ease-in-out infinite}',
'@keyframes r3Scan{0%,100%{transform:translateX(-5%)}50%{transform:translateX(5%)}}',
'.r3Host[data-motion="off"][data-state="analyzing"] .r3Eyes{animation:none}',
/* effets d'état */
'.r3Fx{position:absolute;pointer-events:none;opacity:0;transition:opacity .2s}',
'.r3Bang{right:6%;top:2%;width:20%;aspect-ratio:1;border-radius:50%;background:#e5392b;color:#fff;font:800 calc(var(--r3-size)*.14)/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(229,57,43,.4)}',
'.r3Host[data-state="alert"] .r3Bang{opacity:1}',
'.r3Dots{left:60%;top:6%;display:flex;gap:calc(var(--r3-size)*.025)}',
'.r3Dots i{width:calc(var(--r3-size)*.05);height:calc(var(--r3-size)*.05);border-radius:50%;background:#3aa0ff;animation:r3Dot 1.1s ease-in-out infinite}',
'.r3Dots i:nth-child(2){animation-delay:.18s}.r3Dots i:nth-child(3){animation-delay:.36s}',
'@keyframes r3Dot{0%,100%{transform:translateY(0);opacity:.45}50%{transform:translateY(-35%);opacity:1}}',
'.r3Host[data-state="analyzing"] .r3Dots{opacity:1}',
'.r3Host[data-motion="off"] .r3Dots i{animation:none}',
'.r3Sparks{inset:0}.r3Sparks b{position:absolute;width:calc(var(--r3-size)*.07);aspect-ratio:1;background:#22b573;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}',
'.r3Sparks b:nth-child(1){left:6%;top:12%}.r3Sparks b:nth-child(2){right:4%;top:6%;width:calc(var(--r3-size)*.05)}.r3Sparks b:nth-child(3){left:2%;top:46%;width:calc(var(--r3-size)*.05)}.r3Sparks b:nth-child(4){right:2%;top:36%}',
'.r3Host[data-state="success"] .r3Sparks{opacity:1}',
/* bulle */
'.r3Bubble{position:relative;pointer-events:none;width:max-content;min-width:96px;max-width:min(260px,62vw);padding:8px 12px;border-radius:14px;background:var(--r3-tint,#f1f6ff);border:1px solid var(--r3-line,#d3e2fa);color:#10224d;font:600 13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow-wrap:anywhere}',
'.r3Bubble[hidden]{display:none}',
'.r3Bubble b{display:block;font-size:12px;letter-spacing:.02em;color:var(--r3-title,#10224d)}',
'.r3Host[data-variant="bubble"] .r3Bubble::before{content:"";position:absolute;left:-6px;top:calc(50% - 6px);width:10px;height:10px;transform:rotate(45deg);background:inherit;border-left:1px solid var(--r3-line,#d3e2fa);border-bottom:1px solid var(--r3-line,#d3e2fa)}',
'.r3Live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'
].join('\n');

let uid=0;
function safe(fn,fb){try{return fn()}catch(e){return fb}}
function reduced(){return typeof root.matchMedia==='function'&&root.matchMedia('(prefers-reduced-motion: reduce)').matches}
function ensureStyle(doc){
  if(!doc.getElementById('r3Css')){const s=doc.createElement('style');s.id='r3Css';s.textContent=CSS;doc.head.appendChild(s)}
  if(!doc.getElementById('r3Clips')){const d=doc.createElement('div');d.id='r3Clips';d.setAttribute('aria-hidden','true');d.innerHTML=CLIP_SVG;doc.body.appendChild(d)}
}
function resolve(doc,t){return typeof t==='string'?doc.querySelector(t):(t&&t.nodeType===1?t:null)}

function create(doc,options){
  const o=options&&typeof options==='object'?options:{};
  const variant=['bubble','sheet'].includes(o.variant)?o.variant:'bubble';
  const host=doc.createElement('div');
  host.className='r3Host';host.setAttribute('data-r3','');host.setAttribute('data-variant',variant);
  host.setAttribute('data-posture','floating');host.setAttribute('data-motion',o.motion==='off'?'off':'auto');
  const src=o.src||IMG;
  const layer=cls=>'<img class="r3L '+cls+'" src="'+src+'" alt="" decoding="async" draggable="false">';
  host.innerHTML='<div class="r3Figure" role="img"><div class="r3Shadow"></div><div class="r3Float">'
    +layer('r3LegL')+layer('r3LegR')+layer('r3Arm')+layer('r3Body')
    +'<div class="r3Head">'+layer('r3HeadImg')
    +'<div class="r3Eyes"><span class="r3Eye l"></span><span class="r3Eye r"></span></div></div>'
    +'<div class="r3Fx r3Bang">!</div><div class="r3Fx r3Dots"><i></i><i></i><i></i></div>'
    +'<div class="r3Fx r3Sparks"><b></b><b></b><b></b><b></b></div>'
    +'</div></div><div class="r3Bubble" hidden></div><span class="r3Live" role="status" aria-live="polite"></span>';
  const q=s=>host.querySelector(s);
  const figure=q('.r3Figure'),float=q('.r3Float'),head=q('.r3Head'),arm=q('.r3Arm'),legL=q('.r3LegL'),legR=q('.r3LegR'),eyes=q('.r3Eyes'),bubble=q('.r3Bubble'),live=q('.r3Live');
  host.style.setProperty('--r3-size',(Math.min(240,Math.max(32,Number(o.size)||(variant==='sheet'?120:88))))+'px');
  if(o.decorative){figure.removeAttribute('role');figure.setAttribute('aria-hidden','true')}
  else figure.setAttribute('aria-label','Runner 3D, copilote terrain');

  let state=STATES.includes(o.state)?o.state:'neutral';
  let destroyed=false,anims=[],moveAnim=null,idleTimer=0,presence=false,hideTimer=0,resetTimer=0,posture='floating';
  const motionOk=()=>!destroyed&&host.getAttribute('data-motion')!=='off'&&!reduced()&&!doc.hidden;
  function run(el,frames,ms,opts){
    if(!el||typeof el.animate!=='function')return Promise.resolve(false);
    const a=el.animate(frames,Object.assign({duration:ms,easing:'ease-in-out',iterations:1},opts));
    anims.push(a);
    const done=()=>{anims=anims.filter(x=>x!==a)};
    return a.finished.then(()=>{done();return true},()=>{done();return false});
  }
  function cancelAll(){anims.slice().forEach(a=>{try{a.cancel()}catch(e){}});anims=[];if(moveAnim){try{moveAnim.cancel()}catch(e){}moveAnim=null}}
  const dir=t=>{const r=t&&t.getBoundingClientRect?t.getBoundingClientRect():null;const f=figure.getBoundingClientRect();return r&&r.left+r.width/2<f.left+f.width/2?-1:1};

  const gestures={
    blink:()=>run(eyes,[{transform:'none'},{transform:'scaleY(.1)',offset:.42},{transform:'none'}],240),
    nod:()=>run(head,[{transform:'none'},{transform:'translateY(2.2%) rotate(2deg)',offset:.4},{transform:'none'}],560),
    yes:()=>run(head,[{transform:'none'},{transform:'translateY(2.2%) rotate(2deg)',offset:.22},{transform:'none',offset:.45},{transform:'translateY(2.2%) rotate(2deg)',offset:.7},{transform:'none'}],900),
    look:t=>{const down=t.toward==='down';const d=dir(down?null:t.toward);const o=down?'translateY(2.4%)':'translateX('+(d*2)+'%) rotate('+(d*3)+'deg)';const f=[{transform:'none'},{transform:o,offset:.2},{transform:o,offset:.75},{transform:'none'}];return run(head,f,1400)},
    tilt:t=>{const d=dir(t.toward);const f='rotate('+(d*9)+'deg)';return run(head,[{transform:'none'},{transform:f,offset:.3},{transform:f,offset:.72},{transform:'none'}],1500)},
    wave:()=>Promise.all([
      run(arm,[{transform:'none'},{transform:'rotate(-16deg)',offset:.15},{transform:'rotate(8deg)',offset:.32},{transform:'rotate(-16deg)',offset:.5},{transform:'rotate(8deg)',offset:.68},{transform:'rotate(-16deg)',offset:.84},{transform:'none'}],1500),
      run(head,[{transform:'none'},{transform:'rotate(-4deg)',offset:.25},{transform:'rotate(-4deg)',offset:.8},{transform:'none'}],1500)]).then(r=>r.every(Boolean)),
    hop:()=>run(float,[{transform:'none'},{transform:'translateY(-9%) scaleY(1.03)',offset:.4},{transform:'translateY(0) scaleY(.97)',offset:.7},{transform:'none'}],620,{easing:'cubic-bezier(.3,.7,.4,1)'}),
    shake:()=>run(head,[{transform:'none'},{transform:'translateX(-2.2%)',offset:.15},{transform:'translateX(2.2%)',offset:.35},{transform:'translateX(-1.6%)',offset:.55},{transform:'translateX(1.2%)',offset:.75},{transform:'none'}],520),
    cheer:()=>Promise.all([gestures.hop(),gestures.wave()]).then(r=>r.every(Boolean))
  };
  const KINDS=Object.keys(gestures);
  function react(kind,opts){
    if(destroyed||!KINDS.includes(kind))return Promise.resolve(false);
    if(state!=='neutral'||!motionOk())return Promise.resolve(false);
    return gestures[kind](opts||{});
  }
  function internal(kind){return motionOk()?gestures[kind]({}):Promise.resolve(false)}

  function swing(){
    if(!motionOk())return;
    const f=(a,b)=>[{transform:'rotate('+a+'deg)'},{transform:'rotate('+b+'deg)'},{transform:'rotate('+a+'deg)'}];
    run(legL,f(-8,9),700,{delay:200,iterations:3});run(legR,f(9,-8),700,{delay:400,iterations:3});
  }
  function setPosture(next,extra){
    if(destroyed||!['floating','seated'].includes(next))return false;
    posture=next;host.setAttribute('data-posture',next);
    [legL,legR].forEach(l=>l.getAnimations&&l.getAnimations().forEach(a=>a.cancel()));
    if(next==='seated'&&extra&&extra.swing===true)swing();
    return true;
  }

  function paintLabel(){figure.setAttribute('aria-label','Runner 3D, copilote terrain : '+STATE_LABELS[state].toLowerCase())}
  function paintTone(){const t=TONES[state];host.style.setProperty('--r3-tint',t.tint);host.style.setProperty('--r3-line',t.line);host.style.setProperty('--r3-title',t.title)}
  function say(text){live.textContent='';root.setTimeout(()=>{live.textContent=text},30)}
  function hideMessage(){root.clearTimeout(hideTimer);bubble.hidden=true;bubble.textContent='';return true}
  function showMessage(input,extra){
    const src2=typeof input==='string'?{text:input}:(input||{});
    const text=String(src2.text!=null?src2.text:'').trim().slice(0,280);
    if(!text)return false;
    const title=String((extra&&extra.title)||src2.title||'').trim().slice(0,60);
    bubble.textContent='';
    if(title){const b=doc.createElement('b');b.textContent=title;bubble.appendChild(b)}
    bubble.appendChild(doc.createTextNode(text));
    bubble.hidden=false;say(text);
    root.clearTimeout(hideTimer);
    const d=extra&&extra.duration;
    if(d)hideTimer=root.setTimeout(hideMessage,Math.min(120000,Math.max(1500,d)));
    return true;
  }
  function setState(next,extra){
    if(destroyed||!STATES.includes(next))return false;
    const changed=next!==state;state=next;host.setAttribute('data-state',next);paintTone();paintLabel();
    root.clearTimeout(resetTimer);
    if(next!=='neutral'&&extra&&extra.duration)resetTimer=root.setTimeout(()=>setState('neutral'),Math.min(120000,Math.max(1500,extra.duration)));
    if(changed&&next==='alert')internal('shake');
    if(changed&&next==='success')internal('hop');
    return true;
  }
  function reset(){setState('neutral');hideMessage();return true}

  function stopIdle(){root.clearTimeout(idleTimer);idleTimer=0}
  function idleLoop(){
    stopIdle();
    if(!presence||destroyed)return;
    idleTimer=root.setTimeout(()=>{
      if(presence&&!destroyed&&state==='neutral'&&!moveAnim){react(Math.random()<.7?'blink':'look',{toward:null})}
      idleLoop();
    },2500+Math.random()*3000);
  }
  function setPresence(on){presence=!!on;if(presence)idleLoop();else stopIdle();return presence}

  function moveTo(target,extra){
    if(destroyed)return false;
    const x=extra&&typeof extra==='object'?extra:{};
    const c=resolve(doc,target)||resolve(doc,x.fallback);
    if(!c||!c.isConnected||c===host||host.contains(c))return false;
    const start=figure.getBoundingClientRect();
    cancelAll();
    if(host.parentNode!==c)c.appendChild(host);
    const end=figure.getBoundingClientRect();
    if(x.animate===false||!motionOk())return true;
    let frames;
    if(x.entrance==='peek'){
      frames=[{transform:'translateY(78%)',opacity:0},{transform:'translateY(-6%)',opacity:1,offset:.7},{transform:'none',opacity:1}];
    }else{
      const dx=start.left-end.left,dy=start.top-end.top,dist=Math.hypot(dx,dy);
      if(dist<2)return true;
      frames=[{transform:'translate('+dx+'px,'+dy+'px)'},{transform:'translate('+dx*.45+'px,'+(dy*.45-Math.min(40,dist*.18))+'px)',offset:.5},{transform:'none'}];
    }
    const ms=x.entrance==='peek'?820:Math.round(Math.min(1100,Math.max(520,300+Math.hypot(start.left-end.left,start.top-end.top)*.9)));
    const a=host.animate(frames,{duration:ms,easing:'cubic-bezier(.3,.7,.3,1)'});
    moveAnim=a;a.onfinish=a.oncancel=()=>{if(moveAnim===a)moveAnim=null};
    return true;
  }
  function returnToRest(){cancelAll();return true}
  function destroy(){
    if(destroyed)return false;
    destroyed=true;stopIdle();cancelAll();root.clearTimeout(hideTimer);root.clearTimeout(resetTimer);
    if(host.parentNode)host.parentNode.removeChild(host);
    return true;
  }
  const inst={el:host,figure,variant,KINDS,
    setState,getState:()=>state,showMessage,hideMessage,reset,react,moveTo,cancelMove:returnToRest,returnToRest,setPosture,setPresence,destroy,
    isMoving:()=>!!moveAnim,isConnected:()=>!destroyed&&host.isConnected,
    hasGesture:k=>KINDS.includes(k)};
  host.setAttribute('data-state',state);paintTone();paintLabel();
  if(o.message!=null)showMessage(o.message,{title:o.title,duration:o.duration});
  return inst;
}

function mount(target,options){
  const doc=root.document;if(!doc)return null;
  return safe(()=>{const c=resolve(doc,target);if(!c)return null;ensureStyle(doc);const i=create(doc,options);c.appendChild(i.el);return i},null);
}
return{STATES,STATE_LABELS,TONES,SUPPORT,mount,KIND_LIST:['blink','nod','yes','look','tilt','wave','hop','shake','cheer']};
});
