/* Runner 3D Lab — scènes de comparaison. Données fictives uniquement ; aucune requête hors des fichiers
   publiés avec la page ; rien n'est lu ni écrit en dehors de deux préférences d'affichage (mode, onglet)
   dans le stockage de CET artefact. Le Runner actuel est le fichier runner-visual.js d'origine, jamais modifié. */
(function(){
'use strict';
const Classic=window.StoreRunnerRunner,R3=window.Runner3D;
if(!Classic||!R3){window.RunnerLab=null;return}

/* Empreinte du runner-visual.js de `main` (vérifiée par tests/runner-3d-lab.test.cjs et recalculée dans le navigateur). */
const EXPECTED_SHA='9b2d6859e31c2b93715dfaa74e672e6ed43c1c366666840c47f2bf585cb83a93';
const NAMES={classic:'Runner actuel','3d':'Runner 3D'};
const LS={mode:'r3lab:mode',tab:'r3lab:tab'};
const TABS=['home','assistant','cards','moves','ambient','perf','report'];
const S={mode:'both',tab:'home'};
let scene=null;

const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
function h(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function html(e,markup){e.innerHTML=markup;return e}   /* uniquement des gabarits statiques ci-dessous ; tout texte variable passe par textContent */
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
const kinds=()=>S.mode==='both'?['classic','3d']:[S.mode];
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer=0;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{t.hidden=true},2600)}

/* ------------------------------------------------------------------ scène : cycle de vie */
function newScene(){return{actors:[],timers:[],dead:false,busy:new Set()}}
function destroyScene(){
  if(!scene)return;
  scene.dead=true;scene.timers.forEach(clearTimeout);
  scene.actors.forEach(a=>{try{a.inst.setPresence(false);a.inst.destroy()}catch(e){}});
  scene=null;
}
const sleep=ms=>new Promise(res=>{if(!scene)return;scene.timers.push(setTimeout(res,ms))});
function mountActor(kind,container,opt){
  const o=Object.assign({variant:'bubble',size:84},opt||{});
  const inst=kind==='classic'?Classic.mount(container,{variant:o.variant,size:o.size,state:o.state}):R3.mount(container,{variant:o.variant==='sheet'?'sheet':'bubble',size:o.size,state:o.state});
  const a={kind,inst,el:inst.el};scene.actors.push(a);return a;
}
async function each(fn,only){
  const list=scene.actors.filter(a=>!only||only(a));
  await Promise.all(list.map(async a=>{try{await fn(a)}catch(e){}}));
}
function frame(parent,kind,extra){
  const f=h('section','frame');
  const head=h('div','frameHead');head.appendChild(h('span',null,NAMES[kind]));
  head.appendChild(h('span','tag '+(kind==='classic'?'native':'sim'),kind==='classic'?'fichier d’origine':'prototype'));
  const body=h('div','frameBody');f.appendChild(head);f.appendChild(body);parent.appendChild(f);
  if(extra)extra(body);return body;
}
function actionBar(panel,items){
  const bar=h('div','actions');
  items.forEach(it=>{
    const b=h('button','btn'+(it.primary?' primary':''));b.type='button';b.appendChild(document.createTextNode(it.label));
    if(it.tags){const s=h('small');it.tags.forEach(t=>s.appendChild(h('span','tag '+t[0],t[1])));b.appendChild(s)}
    b.addEventListener('click',()=>{if(scene)it.run()});bar.appendChild(b);
  });
  panel.appendChild(bar);return bar;
}
function intro(panel,title,text){const d=h('div','intro');d.appendChild(h('h2',null,title));d.appendChild(h('p','sub',text));panel.appendChild(d)}
function gridFor(panel){const g=h('div','grid'+(kinds().length>1?' two':''));panel.appendChild(g);return g}

/* ------------------------------------------------------------------ gestes : correspondance et vérité */
const GESTURES=[
  {id:'blink',label:'Clignement',c:'native',d:'sim'},{id:'nod',label:'Hochement',c:'native',d:'sim'},
  {id:'look',label:'Regard',c:'native',d:'sim'},{id:'tilt',label:'Inclinaison',c:'native',d:'sim'},
  {id:'wave',label:'Salut',c:'absent',d:'sim'},{id:'hop',label:'Saut',c:'absent',d:'sim'},{id:'shake',label:'Secousse',c:'absent',d:'sim'}
];
const LEVEL_TEXT={native:'Natif',sim:'Simulé',na:'Indisponible',absent:'Absent'};
async function gesture(a,id,toward){
  if(a.kind==='classic'&&['wave','hop','shake','yes','cheer'].includes(id))return 'absent';
  return a.inst.react(id,{toward});
}

/* ================================================================== ACCUEIL */
function renderHome(panel){
  intro(panel,'Accueil','Runner près du titre, entrée discrète, ligne du jour et fin de tournée. Données fictives.');
  const g=gridFor(panel);const refs=[];
  kinds().forEach(kind=>{
    const body=frame(g,kind);
    html(body,'<div class="mock"><div class="slot clip" data-r="slot" style="min-height:108px;width:100%"></div>'
      +'<div><p class="eyebrow">Samedi 12 octobre</p><h3>Bonjour Alex</h3></div>'
      +'<div class="tile"><b>Tournée du jour</b><span>4 magasins · 112 km (exemple)</span></div>'
      +'<div class="tile hot"><b>À traiter maintenant</b><span>Magasin Démo Rivoli · rapport à finaliser</span></div>'
      +'<div data-r="hold" style="position:absolute;left:-9999px;top:0;width:10px;height:10px"></div></div>');
    const slot=$('[data-r="slot"]',body),hold=$('[data-r="hold"]',body);
    const a=mountActor(kind,slot,{size:84});refs.push({a,slot,hold});
    a.inst.showMessage('Bonjour Alex, 4 visites au programme.',{title:'Runner',duration:4000});
  });
  const refOf=a=>refs.find(r=>r.a===a);
  actionBar(panel,[
    {label:'Rejouer l’entrée',primary:true,tags:[['native','A'],['native','3D']],run:()=>each(async a=>{const r=refOf(a);a.inst.hideMessage();a.inst.moveTo(r.hold,{animate:false});await sleep(160);a.inst.moveTo(r.slot,{entrance:'peek'});await sleep(950);a.inst.showMessage('Je suis de retour.',{duration:2500})})},
    {label:'Ligne du jour',run:()=>each(a=>a.inst.showMessage('Tournée du jour : 4 magasins, départ 8 h 30.',{title:'Ligne du jour',duration:5000}))},
    {label:'Saluer',tags:[['native','A'],['sim','3D']],run:()=>each(async a=>{const r=await gesture(a,a.kind==='classic'?'nod':'wave');if(a.kind==='classic')toast('Le Runner actuel n’a pas de salut : hochement à la place.')})},
    {label:'Fin de tournée',run:()=>each(a=>{a.inst.setState('success',{duration:3400});a.inst.showMessage('Tournée terminée : 4 visites sur 4.',{title:'Bravo',duration:3400})})},
    {label:'Contrainte',run:()=>each(a=>{a.inst.setState('alert',{duration:3400});a.inst.showMessage('Visite de 14 h : magasin fermé le jeudi (exemple).',{title:'Contrainte',duration:3600})})}
  ]);
}

/* ================================================================== ASSISTANT */
function renderAssistant(panel){
  intro(panel,'Assistant','Runner dans l’en-tête de la feuille ; ses états suivent la conversation. Textes fictifs.');
  const g=gridFor(panel);const refs=[];
  kinds().forEach(kind=>{
    const body=frame(g,kind);
    html(body,'<div class="mock"><div class="slot" data-r="slot" style="min-height:130px"></div><div class="chat" data-r="chat"></div><div class="fakeInput">Écris à Runner…</div></div>');
    const slot=$('[data-r="slot"]',body),chat=$('[data-r="chat"]',body);
    const a=mountActor(kind,slot,{variant:'sheet',size:112});refs.push({a,chat});
    const m=h('div','msg bot','Bonjour Alex, que puis-je faire pour ta tournée ?');chat.appendChild(m);
  });
  const refOf=a=>refs.find(r=>r.a===a);
  const say=(a,cls,t)=>{const m=h('div','msg '+cls,t);refOf(a).chat.appendChild(m);while(refOf(a).chat.children.length>6)refOf(a).chat.removeChild(refOf(a).chat.firstChild)};
  actionBar(panel,[
    {label:'Poser une question',primary:true,run:()=>each(async a=>{say(a,'me','Peux-tu déplacer ma visite de jeudi ?');a.inst.setState('analyzing');await sleep(1800);say(a,'bot','Oui, vendredi 9 h est libre.');a.inst.setState('success',{duration:2600})})},
    {label:'Contrainte détectée',run:()=>each(async a=>{say(a,'me','Ajoute 3 magasins à jeudi.');a.inst.setState('analyzing');await sleep(1400);say(a,'bot','Jeudi est plein : 7 h de route déjà prévues.');a.inst.setState('alert',{duration:3000})})},
    {label:'Tout est ok',run:()=>each(a=>{say(a,'bot','Planning enregistré (exemple).');a.inst.setState('success',{duration:2600})})},
    {label:'Réinitialiser',run:()=>each(a=>{a.inst.reset();refOf(a).chat.textContent='';say(a,'bot','Bonjour Alex, que puis-je faire pour ta tournée ?')})}
  ]);
}

/* ================================================================== CARTES */
function renderCards(panel){
  intro(panel,'Cartes','Runner se déplace d’une carte à l’autre, la regarde, s’assoit sur son bord ou se cache derrière. Touche une carte.');
  const g=gridFor(panel);const refs=[];
  const STORES=[['Magasin Démo Nord','2 actions ouvertes'],['Magasin Démo Centre','Dernière visite il y a 12 jours'],['Magasin Démo Sud','Rendez-vous vendredi 10 h']];
  kinds().forEach(kind=>{
    const body=frame(g,kind);const stage=h('div','cardsStage');body.appendChild(stage);const cards=[];
    STORES.forEach((s,i)=>{
      const c=h('div','storeCard');c.dataset.i=String(i);
      html(c,'<b></b><span class="sub" style="display:block;margin:2px 0 0"></span><div class="slot" data-r="top"></div><div class="sit" data-r="sit"></div><div class="peek" data-r="peek"></div>');
      c.querySelector('b').textContent=s[0];c.querySelector('.sub').textContent=s[1];
      stage.appendChild(c);cards.push({c,top:$('[data-r="top"]',c),sit:$('[data-r="sit"]',c),peek:$('[data-r="peek"]',c)});
    });
    const a=mountActor(kind,cards[0].top,{size:84});cards[0].c.dataset.on='true';
    const r={a,cards,cur:0};refs.push(r);
    cards.forEach((k,i)=>k.c.addEventListener('click',()=>goTo(r,i)));
  });
  const refOf=a=>refs.find(r=>r.a===a);
  async function goTo(r,i){
    if(!scene||scene.busy.has(r))return;scene.busy.add(r);
    try{
      const a=r.a;a.inst.setPosture('floating');a.inst.hideMessage();
      r.cards.forEach((k,j)=>{k.c.dataset.on=String(j===i)});
      a.inst.moveTo(r.cards[i].top);r.cur=i;await sleep(1000);
      a.inst.react('tilt',{toward:r.cards[i].c});
      a.inst.showMessage(STORES[i][0]+' : '+STORES[i][1]+'.',{duration:3200});
    }finally{scene&&scene.busy.delete(r)}
  }
  const cur=a=>refOf(a);
  actionBar(panel,[
    {label:'Carte suivante',primary:true,tags:[['native','A'],['native','3D']],run:()=>each(a=>goTo(cur(a),(cur(a).cur+1)%3))},
    {label:'Regarder la carte',tags:[['native','A'],['sim','3D']],run:()=>each(a=>{const r=cur(a);a.inst.react('tilt',{toward:r.cards[r.cur].c})})},
    {label:'S’asseoir sur le bord',tags:[['native','A'],['sim','3D']],run:()=>each(async a=>{const r=cur(a);a.inst.hideMessage();a.inst.moveTo(r.cards[r.cur].sit);await sleep(900);a.inst.setPosture('seated',{swing:true})})},
    {label:'Se relever',run:()=>each(async a=>{const r=cur(a);a.inst.setPosture('floating');a.inst.moveTo(r.cards[r.cur].top)})},
    {label:'Apparaître derrière',tags:[['native','A'],['native','3D']],run:()=>each(async a=>{const r=cur(a);a.inst.setPosture('floating');a.inst.moveTo(r.cards[r.cur].peek,{entrance:'peek'});await sleep(2600);a.inst.moveTo(r.cards[r.cur].top)})}
  ]);
}

/* ================================================================== MOUVEMENTS */
function renderMoves(panel){
  intro(panel,'Mouvements','Un banc d’essai par personnage. Chaque bouton indique ce que fait réellement chaque Runner : natif, simulé ou absent.');
  const g=gridFor(panel);const refs=[];
  kinds().forEach(kind=>{
    const body=frame(g,kind);
    const st=h('div','stage');body.appendChild(st);
    const A=h('div','slot');A.dataset.r='A';const B=h('div','slot');B.dataset.r='B';B.style.marginLeft='auto';st.appendChild(A);st.appendChild(B);
    const a=mountActor(kind,A,{size:150});refs.push({a,A,B,flip:false});
  });
  const refOf=a=>refs.find(r=>r.a===a);
  const gestureButtons=GESTURES.map(x=>({label:x.label,tags:[[x.c,'A'],[x.d,'3D']],run:()=>{
    each(async a=>{const r=refOf(a);await gesture(a,x.id,r.flip?r.A:r.B)});
    if(x.c==='absent'&&kinds().includes('classic'))toast('Absent du Runner actuel : '+x.label.toLowerCase()+' (3D seulement).');
  }}));
  panel.appendChild(h('h3',null,'Gestes'));actionBar(panel,gestureButtons);
  panel.appendChild(h('h3',null,'États'));
  actionBar(panel,[['neutral','Neutre'],['analyzing','Analyse'],['alert','Alerte'],['success','Succès']].map(s=>({label:s[1],tags:[['native','A'],['sim','3D']],run:()=>each(a=>{a.inst.setState(s[0]);if(s[0]!=='neutral')a.inst.showMessage({neutral:'',analyzing:'Je regarde ton planning…',alert:'Une contrainte bloque ce jour.',success:'Tout est en ordre.'}[s[0]],{duration:3200})})})));
  panel.appendChild(h('h3',null,'Posture, déplacement, présence'));
  actionBar(panel,[
    {label:'Assis, jambes qui balancent',tags:[['native','A'],['sim','3D']],run:()=>each(a=>a.inst.setPosture('seated',{swing:true}))},
    {label:'Debout',run:()=>each(a=>a.inst.setPosture('floating'))},
    {label:'Aller de A à B',tags:[['native','A'],['native','3D']],run:()=>each(a=>{const r=refOf(a);r.flip=!r.flip;a.inst.moveTo(r.flip?r.B:r.A)})},
    {label:'Entrée discrète',tags:[['native','A'],['native','3D']],run:()=>each(async a=>{const r=refOf(a);a.inst.moveTo(r.A,{animate:false});await sleep(100);a.inst.moveTo(r.A,{entrance:'peek'})})},
    {label:'Présence : clignements espacés',tags:[['native','A'],['native','3D']],run:()=>each(a=>{a.presence=!a.presence;a.inst.setPresence(a.presence);toast(a.presence?'Présence activée (clignements et regards espacés).':'Présence arrêtée.')})}
  ]);
}

/* ================================================================== AMBIANCE */
function renderAmbient(panel){
  intro(panel,'Ambiance','Les six micro-animations de la couche ambiante, reconstituées pour le Lab avec les mêmes gestes de base pour les deux personnages. Ce n’est pas le code ambiant de production.');
  const g=gridFor(panel);const refs=[];
  kinds().forEach(kind=>{
    const body=frame(g,kind);
    html(body,'<div class="ambi"><div class="row" data-r="lane"><div class="slot" data-r="home" style="min-width:96px;min-height:104px"></div></div>'
      +'<div class="tile" data-r="obs"><b>Carte à observer</b><span>Magasin Démo Nord · 2 actions</span></div>'
      +'<div class="storeCard" data-r="edge" style="cursor:default;margin-top:60px"><b>Carte avec bord</b><span class="sub" style="display:block;margin:2px 0 0">Runner peut s’y asseoir ou apparaître derrière</span><div class="sit" data-r="sit"></div><div class="peek" data-r="peek"></div></div>'
      +'<div class="fieldMock" data-r="field">Champ de saisie</div><div class="slot" data-r="fieldSlot" style="min-height:104px"></div></div>');
    const q=s=>$('[data-r="'+s+'"]',body);
    const a=mountActor(kind,q('home'),{size:84});
    refs.push({a,lane:q('lane'),home:q('home'),obs:q('obs'),edge:q('edge'),sit:q('sit'),peek:q('peek'),field:q('field'),fieldSlot:q('fieldSlot')});
  });
  const refOf=a=>refs.find(r=>r.a===a);
  const back=async(a,r)=>{a.inst.setPosture('floating');a.inst.moveTo(r.home);await sleep(1000)};
  function letter(r,times){
    return (async()=>{
      for(let n=0;n<times;n++){
        const L=h('div','letter');L.style.left='14px';L.style.bottom='20px';r.lane.appendChild(L);
        const dist=Math.max(80,Math.min(r.lane.clientWidth-150,230));
        const a=r.a;const host=a.inst.el;
        host.animate([{transform:'translateX(0)'},{transform:'translateX('+dist+'px)',offset:.7},{transform:'translateX('+dist+'px)',offset:.82},{transform:'translateX(0)'}],{duration:3000,easing:'ease-in-out'});
        L.animate([{transform:'translateX(70px)',opacity:1},{transform:'translateX('+(dist+70)+'px)',opacity:1,offset:.7},{transform:'translateX('+(dist+70)+'px)',opacity:0,offset:.82},{transform:'translateX('+(dist+70)+'px)',opacity:0}],{duration:3000,easing:'ease-in-out',fill:'forwards'});
        await sleep(3100);L.remove();
      }
    })();
  }
  const run={
    'letter-push':a=>letter(refOf(a),1),
    'letter-double':a=>letter(refOf(a),2),
    'sit-edge':async a=>{const r=refOf(a);a.inst.moveTo(r.sit);await sleep(1000);a.inst.setPosture('seated',{swing:true});await sleep(3600);await back(a,r)},
    'peek-behind':async a=>{const r=refOf(a);a.inst.moveTo(r.peek,{entrance:'peek'});await sleep(2800);await back(a,r)},
    'observe-card':async a=>{const r=refOf(a);a.inst.react('tilt',{toward:r.obs});await sleep(1700)},
    'lean-field':async a=>{const r=refOf(a);a.inst.moveTo(r.fieldSlot);await sleep(1000);a.inst.react('look',{toward:'down'});await sleep(1700);await back(a,r)}
  };
  const LABELS=[['letter-push','Pousse une lettre'],['letter-double','Deux lettres'],['sit-edge','S’assoit sur le bord'],['peek-behind','Apparaît derrière'],['observe-card','Observe une carte'],['lean-field','Se penche vers le champ']];
  const guard=(id)=>()=>each(async a=>{const r=refOf(a);if(scene.busy.has(r))return;scene.busy.add(r);try{await run[id](a)}finally{scene&&scene.busy.delete(r)}});
  actionBar(panel,LABELS.map(l=>({label:l[1],tags:[['native','A'],[['sit-edge','observe-card','lean-field'].includes(l[0])?'sim':'native','3D']],run:guard(l[0])})));
  actionBar(panel,[{label:'Tout enchaîner',primary:true,run:async()=>{for(const l of LABELS){if(!scene)return;await guard(l[0])();await sleep(300)}}}]);
}

/* ================================================================== MESURES */
const results={};
function deviceInfo(){
  const n=navigator;
  return{agent:n.userAgent,dpr:window.devicePixelRatio,viewport:innerWidth+'×'+innerHeight,coeurs:n.hardwareConcurrency||null,memoireGo:n.deviceMemory||null,mouvementReduit:reducedMotion(),theme:matchMedia('(prefers-color-scheme: dark)').matches?'sombre':'clair'};
}
function resourceInfo(){
  const out={};
  performance.getEntriesByType('resource').forEach(e=>{
    const n=e.name.split('/').pop().split('?')[0];
    if(['runner-visual.js','runner3d.js','runner-whats-new.webp','lab.js'].includes(n))out[n]={transfert:e.transferSize||0,corps:e.encodedBodySize||0,decode:e.decodedBodySize||0};
  });
  return out;
}
const PLAN=['blink','nod','tilt','look','move','analyzing','alert','success','neutral','seat','stand'];
async function measure(kind,ms,box,onProgress){
  const wrap=h('div','stage');wrap.style.minHeight='170px';const A=h('div','slot');const B=h('div','slot');B.style.marginLeft='auto';wrap.appendChild(A);wrap.appendChild(B);box.appendChild(wrap);
  const t0=performance.now();
  const heap0=performance.memory?performance.memory.usedJSHeapSize:null;
  const inst=kind==='classic'?Classic.mount(A,{variant:'bubble',size:110}):R3.mount(A,{variant:'bubble',size:110});
  const imgs=$$('img',inst.el);
  if(imgs.length)await Promise.all(imgs.map(i=>i.decode?i.decode().catch(()=>{}):0));
  const mountMs=performance.now()-t0;
  const nodes=inst.el.querySelectorAll('*').length+1;
  const deltas=[];let longTasks=0,po=null;
  try{po=new PerformanceObserver(l=>{longTasks+=l.getEntries().length});po.observe({entryTypes:['longtask']})}catch(e){po=null}
  let flip=false,i=0,stop=false;
  const start=performance.now();let last=start;
  const raf=t=>{deltas.push(t-last);last=t;if(!stop)requestAnimationFrame(raf)};
  requestAnimationFrame(t=>{last=t;requestAnimationFrame(raf)});
  const step=()=>{
    const k=PLAN[i++%PLAN.length];
    if(['blink','nod','tilt','look'].includes(k))inst.react(k,{toward:flip?A:B});
    else if(k==='move'){flip=!flip;inst.moveTo(flip?B:A)}
    else if(['analyzing','alert','success','neutral'].includes(k))inst.setState(k);
    else if(k==='seat')inst.setPosture('seated',{swing:true});
    else if(k==='stand')inst.setPosture('floating');
  };
  await new Promise(res=>{
    const tick=setInterval(()=>{
      const el=performance.now()-start;onProgress(Math.min(1,el/ms));
      if(el>=ms){clearInterval(tick);res()}else if(Math.floor(el/650)>=i)step();
    },80);
  });
  stop=true;if(po)po.disconnect();
  const total=performance.now()-start;const heap1=performance.memory?performance.memory.usedJSHeapSize:null;
  const d=deltas.slice(2).sort((x,y)=>x-y);const med=d[Math.floor(d.length/2)]||0;
  const p95=d[Math.floor(d.length*.95)]||0;
  const res={kind,duree_s:+(total/1000).toFixed(1),images_par_s:+(deltas.length/(total/1000)).toFixed(1),mediane_ms:+med.toFixed(1),p95_ms:+p95.toFixed(1),pire_ms:+(d[d.length-1]||0).toFixed(1),images_lentes:d.filter(x=>x>25).length,taches_longues:longTasks,montage_ms:+mountMs.toFixed(1),noeuds_dom:nodes,tas_js_Mo:heap0!=null&&heap1!=null?+((heap1-heap0)/1048576).toFixed(2):null,mouvement_reduit:reducedMotion()};
  inst.setPresence(false);inst.destroy();wrap.remove();
  return res;
}
function renderPerf(panel){
  intro(panel,'Mesures','Chaque test joue la même suite de gestes pendant 10 s : clignement, hochement, inclinaison, regard, déplacement, quatre états, assis et debout. Lance-le sur ton téléphone puis copie le rapport.');
  const info=deviceInfo();
  const dev=h('pre',null,'Appareil : '+info.viewport+' · DPR '+info.dpr+' · '+(info.coeurs||'?')+' cœurs'+(info.memoireGo?' · '+info.memoireGo+' Go':'')+' · '+info.theme+(info.mouvementReduit?' · MOUVEMENT RÉDUIT':'')+'\n'+info.agent);panel.appendChild(dev);
  const out=h('div');const progress=h('div','sub','');const lab=h('div');
  let running=false;
  async function go(list){
    if(running)return;running=true;
    for(const kind of list){
      progress.textContent='Mesure en cours : '+NAMES[kind]+'…';
      results[kind]=await measure(kind,10000,lab,p=>{progress.textContent='Mesure en cours : '+NAMES[kind]+' ('+Math.round(p*100)+' %)'});
      draw();
    }
    progress.textContent='Terminé.';running=false;
  }
  actionBar(panel,[
    {label:'Mesurer le Runner actuel (10 s)',run:()=>go(['classic'])},
    {label:'Mesurer le Runner 3D (10 s)',run:()=>go(['3d'])},
    {label:'Mesurer les deux (20 s)',primary:true,run:()=>go(['classic','3d'])},
    {label:'Copier le rapport',run:()=>copyReport()}
  ]);
  panel.appendChild(progress);panel.appendChild(lab);panel.appendChild(out);
  const ROWS=[['images_par_s','Images / s','plus haut = mieux'],['mediane_ms','Image médiane (ms)',''],['p95_ms','Image p95 (ms)','plus bas = mieux'],['pire_ms','Pire image (ms)',''],['images_lentes','Images > 25 ms',''],['taches_longues','Tâches longues',''],['montage_ms','Montage + décodage (ms)',''],['noeuds_dom','Nœuds DOM',''],['tas_js_Mo','Tas JS (Mo)','Chrome seulement']];
  function draw(){
    out.textContent='';const wrap=h('div','scroll');const t=document.createElement('table');
    const hd=document.createElement('tr');['Mesure','Runner actuel','Runner 3D'].forEach(x=>hd.appendChild(h('th',null,x)));t.appendChild(hd);
    ROWS.forEach(r=>{const tr=document.createElement('tr');const th=document.createElement('td');th.textContent=r[1];if(r[2])th.appendChild(h('span','how',r[2]));tr.appendChild(th);
      ['classic','3d'].forEach(k=>{const td=h('td','num');const v=results[k]&&results[k][r[0]];td.textContent=v==null?'—':String(v);tr.appendChild(td)});t.appendChild(tr)});
    wrap.appendChild(t);out.appendChild(wrap);
    const res=resourceInfo();const rr=h('pre',null,'Poids des fichiers (octets) :\n'+Object.keys(res).map(k=>k+' : '+(res[k].corps||res[k].transfert||'?')+' (décodé '+res[k].decode+')').join('\n'));out.appendChild(rr);
  }
  draw();
  function reportText(){
    return JSON.stringify({lab:'Runner 3D Lab',date:new Date().toISOString(),appareil:deviceInfo(),fichiers:resourceInfo(),resultats:results},null,1);
  }
  async function copyReport(){
    const txt=reportText();
    try{await navigator.clipboard.writeText(txt);toast('Rapport copié.')}
    catch(e){const ta=h('textarea');ta.value=txt;ta.style.cssText='width:100%;min-height:160px';panel.appendChild(ta);ta.focus();ta.select();toast('Sélectionne et copie le texte.')}
  }
}

/* ================================================================== COMPTE RENDU */
const REPORT_ROWS=[
  ['Clignement','native','paupière sur les yeux (scaleY)','sim','paupière sur des yeux recolorés'],
  ['Hochement de tête','native','tête','sim','calque tête découpé dans l’image'],
  ['Regard (gauche/droite/bas)','native','tête/yeux','sim','tête + yeux décalés'],
  ['Inclinaison vers une carte','native','tête','sim','calque tête incliné'],
  ['Salut','absent','le classique n’a pas ce geste','sim','calque bras droit qui pivote (l’image montre un doigt pointé)'],
  ['Saut / joie','absent','—','sim','saut du corps entier'],
  ['Secousse (alerte)','absent','—','sim','secousse de la tête'],
  ['États neutre, analyse, alerte, succès','native','yeux + bras par état','sim','yeux recolorés (bleu, cyan, rouge, vert souriant), « … », « ! », étincelles'],
  ['Bras levés par état (alerte, succès)','native','bras dessinés','na','demande de nouvelles poses 3D'],
  ['Assis, jambes qui balancent','native','jambes rentrées/sorties','sim','hanches au bord de la carte, jambes (calques) qui pendent et pivotent'],
  ['Déplacement d’une carte à l’autre','native','déplacement FLIP','native','même principe, réécrit pour le 3D'],
  ['Entrée discrète (derrière un bord)','native','translation','native','translation depuis le bord'],
  ['Présence (clignements espacés)','native','boucle bornée','native','boucle bornée, annulable'],
  ['Pousse une lettre / deux lettres','native','couche ambiante','native','chorégraphie Lab (déplacement + lettre)'],
  ['Marche / course','absent','—','na','nécessite un cycle de marche : plusieurs poses 3D'],
  ['Mouvement réduit','native','respecté','native','respecté (gestes désactivés)']
];
function renderReport(panel){
  intro(panel,'Compte rendu','Ce que le Runner 3D sait réellement faire aujourd’hui, comparé au Runner actuel.');
  const wrap=h('div','scroll');const t=document.createElement('table');
  const hd=document.createElement('tr');['Animation','Runner actuel','Runner 3D'].forEach(x=>hd.appendChild(h('th',null,x)));t.appendChild(hd);
  REPORT_ROWS.forEach(r=>{
    const tr=document.createElement('tr');tr.appendChild(h('td',null,r[0]));
    [[r[1],r[2]],[r[3],r[4]]].forEach(c=>{const td=document.createElement('td');td.appendChild(h('span','tag '+c[0],LEVEL_TEXT[c[0]]));td.appendChild(h('span','how',c[1]));tr.appendChild(td)});
    t.appendChild(tr);
  });
  wrap.appendChild(t);panel.appendChild(wrap);
  const legend=h('p','sub','Natif : même mécanisme que le Runner actuel. Simulé : obtenu par calque ou effet sur une image unique. Indisponible : exige d’autres poses. Absent : n’existe pas dans le Runner actuel.');legend.style.marginTop='8px';panel.appendChild(legend);

  panel.appendChild(h('h2',null,'Intégrité et isolation'));
  const box=h('pre',null,'Vérification en cours…');panel.appendChild(box);
  (async()=>{
    const lines=['Origine de cette page : '+location.origin,'Requêtes vers store-runner.fr : aucune (aucun appel réseau dans le code du Lab).','Stockage utilisé : 2 préférences d’affichage de cet artefact (mode, onglet).','Service worker : aucun ; cache de l’application : jamais touché.'];
    try{
      if(!(crypto&&crypto.subtle))throw new Error('indisponible');
      const buf=await (await fetch('runner-visual.js',{cache:'no-store'})).arrayBuffer();
      const hex=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf))).map(b=>b.toString(16).padStart(2,'0')).join('');
      lines.push('runner-visual.js : '+(hex===EXPECTED_SHA?'identique à main ✓':'DIFFÉRENT de main ✗')+' (sha256 '+hex.slice(0,16)+'…)');
    }catch(e){lines.push('runner-visual.js : empreinte non vérifiable ici.')}
    box.textContent=lines.join('\n');
  })();
  panel.appendChild(h('h2',null,'Limites connues'));
  const ul=document.createElement('ul');
  ['Une seule pose : debout, doigt pointé à droite. Tout le reste est simulé par découpe de calques ; des bords peuvent se voir lors des grands angles.',
   'Les bras par état (levés pour l’alerte et le succès) ne sont pas reproductibles : ils demandent de nouvelles poses.',
   'Assis et jambes : approximation (jambes droites qui pendent), pas une vraie posture assise.',
   'Les chorégraphies de l’onglet Ambiance sont reconstituées ; le code ambiant de production n’est pas rejoué.',
   'Test iPhone/Safari à faire sur l’appareil : l’émulation ne prouve ni la fluidité ni le rendu des découpes (clip-path).'
  ].forEach(x=>ul.appendChild(h('li',null,x)));panel.appendChild(ul);
}

/* ================================================================== navigation */
const RENDER={home:renderHome,assistant:renderAssistant,cards:renderCards,moves:renderMoves,ambient:renderAmbient,perf:renderPerf,report:renderReport};
function show(){
  destroyScene();scene=newScene();
  const panel=$('#panel');panel.textContent='';
  $$('#modeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===S.mode)));
  $$('#tabs button').forEach(b=>{const on=b.dataset.tab===S.tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1});
  $('#motionNote').hidden=!reducedMotion();
  try{RENDER[S.tab](panel)}catch(e){panel.appendChild(h('div','bad','Erreur de scène : '+(e&&e.message||e)))}
}
function init(){
  const m=store(LS.mode),t=store(LS.tab);
  if(['classic','both','3d'].includes(m))S.mode=m;
  const hash=(location.hash||'').replace('#','');
  if(TABS.includes(hash))S.tab=hash;else if(TABS.includes(t))S.tab=t;
  $$('#modeSeg button').forEach(b=>b.addEventListener('click',()=>{S.mode=b.dataset.mode;store(LS.mode,S.mode);show()}));
  $$('#tabs button').forEach(b=>b.addEventListener('click',()=>{S.tab=b.dataset.tab;store(LS.tab,S.tab);show();b.scrollIntoView&&b.scrollIntoView({inline:'center',block:'nearest'})}));
  show();
}
window.RunnerLab={S,show,kinds,get scene(){return scene},results,EXPECTED_SHA,TABS,GESTURES,REPORT_ROWS,measure};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
