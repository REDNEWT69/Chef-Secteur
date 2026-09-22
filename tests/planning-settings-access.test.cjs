const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');

// #133 : les réglages du planning sont placés en dernier dans .applePlan, après la
// timeline, les métriques et la carte de départ. Red les ouvre en permanence pour
// planifier trois semaines à l'avance : il lui faut un accès direct depuis le haut du
// planning, sans que le bloc lui-même bouge dans le DOM.

const source=fs.readFileSync(__dirname+'/../planning-ui-fixes.js','utf8')
  .replace('  function run(){','  window.__planningAccessTest={ensureSettingsShortcut,openPlanningSettings,reorderPlanning,isSettingsShortcut,css,run};\n  function run(){');

// --- Garde-fous statiques -----------------------------------------------------------
assert.match(source,/⚙ Réglages/,'la barre d’outils du planning doit proposer un accès aux réglages');
assert.match(source,/ensureSettingsShortcut\(tools\);/,'le raccourci doit être posé dans la barre d’outils du planning');
// Le raccourci ne doit jamais devenir un second propriétaire de la position des réglages.
// On isole le corps réel de la fonction plutôt que de laisser une expression régulière
// déborder sur le reste du module.
function bodyOf(name){
  const start=source.indexOf('function '+name+'()');
  assert(start>=0,'la fonction '+name+' doit exister');
  let i=source.indexOf('{',start),depth=0;
  for(let j=i;j<source.length;j++){
    if(source[j]==='{')depth++;
    else if(source[j]==='}'){depth--;if(!depth)return source.slice(i,j+1)}
  }
  throw new Error('corps de '+name+' introuvable');
}
// Les commentaires citent volontairement reorderPlanning() pour expliquer l'ownership :
// on n'inspecte que le code exécuté.
function stripComments(code){return code.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'')}
const openBody=stripComments(bodyOf('openPlanningSettings'));
assert.doesNotMatch(openBody,/insertAdjacentElement|appendChild|insertBefore|prepend|remove\(\)/,'le raccourci ne doit jamais déplacer #planningSettings : reorderPlanning() en reste propriétaire');
assert.doesNotMatch(openBody,/schedule\(\)|reorderPlanning\(\)|run\(\)/,'ouvrir les réglages ne doit déclencher aucune réorganisation');
assert.match(openBody,/settings\.open=true/,'le raccourci doit ouvrir le panneau replié');
assert.match(openBody,/scrollIntoView/,'le raccourci doit défiler jusqu’aux réglages');
assert.match(source,/isSettingsShortcut\(e\.target\)&&!\(e\.target&&e\.target\.matches&&e\.target\.matches\(SETTINGS_FIELD\)\)\)releaseEditingLock\(\)/,'le raccourci ne doit pas lever le verrou de saisie des réglages');
// Cible tactile et lisibilité à 390 px : deux lignes plutôt qu’une compression.
assert.match(source,/\.planningToolsV2 button\{min-height:44px/,'la cible tactile de la barre d’outils doit faire au moins 44 px');
assert.match(source,/#planningSettings\{scroll-margin-top:\d+px\}/,'le défilement doit dégager l’en-tête de l’application, sinon le titre des réglages arrive caché dessous');
assert.match(source,/\.planningToolsV2 button\{flex:1 1 calc\(50% - 4px\);min-width:0;min-height:44px\}/,'à 390 px, trois boutons doivent passer sur deux lignes au lieu d’être comprimés');
assert.doesNotMatch(source,/\.planningToolsV2 button\{flex:1 1 0;min-width:0\}/,'l’ancienne compression en une seule ligne doit avoir disparu');

// --- Faux DOM minimal, écrit à la main (pas de jsdom) --------------------------------
function createDom(){
  const registry=new Map();
  function make(tag){
    const classes=new Set();let id='';
    const el={tagName:String(tag).toUpperCase(),children:[],parentNode:null,dataset:{},style:{},_attrs:{},_listeners:{},_text:'',open:false,type:'',scrollCalls:[]};
    Object.defineProperty(el,'className',{get:()=>[...classes].join(' '),set(v){classes.clear();String(v||'').split(/\s+/).filter(Boolean).forEach(c=>classes.add(c))}});
    Object.defineProperty(el,'textContent',{get:()=>el._text,set(v){el._text=String(v)}});
    Object.defineProperty(el,'id',{get:()=>id,set(v){if(id)registry.delete(id);id=String(v);if(id)registry.set(id,el)}});
    Object.defineProperty(el,'nextElementSibling',{get(){const p=el.parentNode;if(!p)return null;const i=p.children.indexOf(el);return i>=0?(p.children[i+1]||null):null}});
    el.classList={add:(...n)=>n.forEach(x=>classes.add(x)),remove:(...n)=>n.forEach(x=>classes.delete(x)),contains:n=>classes.has(n),toggle(n,f){const next=f===undefined?!classes.has(n):Boolean(f);if(next)classes.add(n);else classes.delete(n);return next}};
    el.appendChild=function(child){if(child.parentNode){const i=child.parentNode.children.indexOf(child);if(i>=0)child.parentNode.children.splice(i,1)}child.parentNode=el;el.children.push(child);return child};
    el.insertBefore=function(child,ref){const i=ref?el.children.indexOf(ref):-1;child.parentNode=el;if(i<0)el.children.push(child);else el.children.splice(i,0,child);return child};
    el.insertAdjacentElement=function(pos,node){
      if(pos==='afterend'){const p=el.parentNode;if(!p)return node;if(node.parentNode){const j=node.parentNode.children.indexOf(node);if(j>=0)node.parentNode.children.splice(j,1)}const i=p.children.indexOf(el);node.parentNode=p;p.children.splice(i+1,0,node);return node}
      if(pos==='beforebegin'){const p=el.parentNode;if(!p)return node;const i=p.children.indexOf(el);node.parentNode=p;p.children.splice(i,0,node);return node}
      return el.appendChild(node);
    };
    el.remove=function(){const p=el.parentNode;if(!p)return;const i=p.children.indexOf(el);if(i>=0)p.children.splice(i,1);el.parentNode=null};
    el.setAttribute=function(n,v){el._attrs[n]=String(v)};
    el.removeAttribute=function(n){delete el._attrs[n]};
    el.getAttribute=function(n){return Object.prototype.hasOwnProperty.call(el._attrs,n)?el._attrs[n]:null};
    el.addEventListener=function(t,fn){(el._listeners[t]=el._listeners[t]||[]).push(fn)};
    el.removeEventListener=function(){};
    el.scrollIntoView=function(opts){el.scrollCalls.push(opts||null)};
    el.matches=function(sel){return matches(el,sel)};
    el.closest=function(sel){let n=el;while(n){if(matches(n,sel))return n;n=n.parentNode}return null};
    el.querySelector=function(sel){return find(el,sel)[0]||null};
    el.querySelectorAll=function(sel){return find(el,sel)};
    Object.defineProperty(el,'innerHTML',{get:()=>el._html||'',set(v){el._html=String(v);el.children=[]}});
    el.click=function(){
      const event={target:el,stopped:false,preventDefault(){},stopPropagation(){this.stopped=true}};
      document.dispatch('click',event);
      if(!event.stopped)(el._listeners.click||[]).slice().forEach(fn=>fn(event));
    };
    return el;
  }
  function matchOne(el,token){
    const m=/^(?:([a-zA-Z]+))?(?:#([\w-]+))?((?:\.[\w-]+)*)$/.exec(token.trim());
    if(!m)return false;
    if(m[1]&&el.tagName!==m[1].toUpperCase())return false;
    if(m[2]&&el.id!==m[2])return false;
    for(const c of (m[3]||'').split('.').filter(Boolean))if(!el.classList.contains(c))return false;
    return true;
  }
  // matches() doit gérer les sélecteurs de descendance : SETTINGS_FIELD vaut
  // '#planningSettings input, #planningSettings select, #planningSettings textarea'.
  function matchesPart(el,part){
    const tokens=part.trim().split(/\s+/);
    if(!matchOne(el,tokens[tokens.length-1]))return false;
    let node=el.parentNode;
    for(let i=tokens.length-2;i>=0;i--){
      while(node&&!matchOne(node,tokens[i]))node=node.parentNode;
      if(!node)return false;
      node=node.parentNode;
    }
    return true;
  }
  function matches(el,sel){return String(sel).split(',').some(part=>matchesPart(el,part))}
  function descendants(root){const out=[];(function walk(n){for(const c of (n.children||[])){out.push(c);walk(c)}})(root);return out}
  function find(root,sel){
    // Combinateur de descendance réel : chaque token restreint la recherche aux
    // descendants des éléments déjà retenus, pas au même ensemble plat.
    return String(sel).split(',').flatMap(part=>{
      const tokens=part.trim().split(/\s+/);
      let scopes=[root];
      let pool=[];
      for(const token of tokens){
        pool=scopes.flatMap(descendants).filter(el=>matchOne(el,token));
        pool=pool.filter((el,i)=>pool.indexOf(el)===i);
        scopes=pool;
      }
      return pool;
    });
  }
  const docListeners={};
  const document={
    readyState:'complete',
    head:make('head'),body:make('body'),
    createElement:make,
    getElementById:id=>registry.get(id)||null,
    querySelector:sel=>find(document.body,sel)[0]||null,
    querySelectorAll:sel=>find(document.body,sel),
    addEventListener(t,fn){(docListeners[t]=docListeners[t]||[]).push(fn)},
    removeEventListener(){},
    dispatch(type,event){(docListeners[type]||[]).slice().forEach(fn=>fn(event))}
  };
  return {document,make,registry};
}

// Structure réelle du planning : les réglages sont bien le dernier enfant de .applePlan.
function buildPlanning(dom){
  const panel=dom.make('div');panel.id='planPanel';dom.document.body.appendChild(panel);
  const plan=dom.make('div');plan.className='applePlan';panel.appendChild(plan);
  const title=dom.make('h2');title.className='applePlanTitle';plan.appendChild(title);
  const tabs=dom.make('div');tabs.id='dayTabs';plan.appendChild(tabs);
  const tools=dom.make('div');tools.id='planningToolsV2';tools.className='planningToolsV2';
  const generate=dom.make('button');generate.className='primary';generate.textContent='✦ Générer mes 3 semaines';generate.setAttribute('data-planning-generate','three-weeks');tools.appendChild(generate);
  plan.appendChild(tools);
  const timeline=dom.make('div');timeline.className='timelineShell';plan.appendChild(timeline);
  const metrics=dom.make('div');metrics.id='planMetrics';plan.appendChild(metrics);
  const departure=dom.make('div');departure.className='departureCard';plan.appendChild(departure);
  const settings=dom.make('details');settings.id='planningSettings';
  const summary=dom.make('summary');summary.textContent='⚙︎ Réglages du planning';settings.appendChild(summary);
  const inner=dom.make('div');inner.className='settingsInner';settings.appendChild(inner);
  const field=dom.make('input');field.type='date';field.id='rangeStart';inner.appendChild(field);
  plan.appendChild(settings);
  return {panel,plan,tabs,tools,timeline,settings,summary,inner,field};
}

function boot(){
  const dom=createDom();
  const ui=buildPlanning(dom);
  let frames=0;
  const ctx={
    console,Date,Math,JSON,Object,Array,String,Number,Set,Map,RegExp,
    state:{settings:{days:['Lundi'],weekDate:'2026-09-14'},stores:[],plan:{},calendarEvents:[]},
    document:dom.document,
    requestAnimationFrame(fn){frames++;fn();return frames},
    setTimeout(){return 0},clearTimeout(){},
    MutationObserver:class{observe(){}disconnect(){}},
    addEventListener(){},removeEventListener(){}
  };
  ctx.window=ctx;
  vm.runInNewContext(source,ctx);
  return {dom,ui,ctx,api:ctx.__planningAccessTest,frames:()=>frames};
}

// --- 1. Le bouton existe dans la barre d'outils du planning -------------------------
let t=boot();
assert(t.api,'le test doit pouvoir atteindre le raccourci');
t.api.reorderPlanning();
const shortcut=t.ui.tools.querySelector('#planningSettingsShortcut');
assert(shortcut,'le raccourci doit être ajouté à #planningToolsV2');
assert.equal(shortcut.parentNode,t.ui.tools,'le raccourci doit vivre dans la barre d’outils, à côté de « Générer mes 3 semaines »');
assert.equal(shortcut.textContent,'⚙ Réglages');
assert.equal(shortcut.type,'button','le raccourci ne doit jamais soumettre un formulaire');
assert.equal(shortcut.getAttribute('aria-controls'),'planningSettings','le raccourci doit annoncer le panneau qu’il commande');
const labels=t.ui.tools.querySelectorAll('button').map(b=>b.textContent);
assert(labels.includes('✦ Générer mes 3 semaines'),'le bouton de génération doit rester présent');
assert.equal(t.ui.tools.querySelectorAll('button').length,2,'la barre d’outils de ce test part d’un seul bouton : le raccourci en ajoute exactement un');

// Plusieurs passages de reorderPlanning ne doivent pas dupliquer le raccourci.
t.api.reorderPlanning();t.api.reorderPlanning();
assert.equal(t.ui.tools.querySelectorAll('#planningSettingsShortcut').length,1,'le raccourci ne doit jamais être ajouté deux fois');

// --- 2. Son action ouvre #planningSettings ------------------------------------------
assert.equal(t.ui.settings.open,false,'les réglages partent repliés');
shortcut.click();
assert.equal(t.ui.settings.open,true,'le clic doit ouvrir #planningSettings');
assert.equal(t.ui.settings.scrollCalls.length,1,'le clic doit défiler jusqu’aux réglages');

// Déjà ouvert : le clic défile de nouveau sans rien refermer.
shortcut.click();
assert.equal(t.ui.settings.open,true,'un second clic ne doit jamais replier les réglages');
assert.equal(t.ui.settings.scrollCalls.length,2,'un second clic doit ramener l’utilisateur aux réglages');

// --- 3. Le bloc des réglages ne bouge pas dans le DOM -------------------------------
t=boot();
t.api.reorderPlanning();
const avantParent=t.ui.settings.parentNode,avantIndex=t.ui.plan.children.indexOf(t.ui.settings),avantOrdre=t.ui.plan.children.slice();
t.ui.tools.querySelector('#planningSettingsShortcut').click();
assert.equal(t.ui.settings.parentNode,avantParent,'#planningSettings ne doit pas changer de parent : plusieurs modules dépendent de sa position');
assert.equal(t.ui.plan.children.indexOf(t.ui.settings),avantIndex,'#planningSettings ne doit pas changer de place dans .applePlan');
t.ui.plan.children.forEach((c,i)=>assert.equal(c,avantOrdre[i],'l’ordre du planning doit rester strictement inchangé'));

// --- 4. Le verrou de saisie est respecté --------------------------------------------
// Un champ des réglages en cours d'édition pose le verrou : sur iOS, réorganiser le
// panneau à ce moment referme le sélecteur natif de date.
t=boot();
t.api.reorderPlanning();
const bouton=t.ui.tools.querySelector('#planningSettingsShortcut');
t.dom.document.dispatch('focusin',{target:t.ui.field});
const framesAvant=t.frames();
t.dom.document.dispatch('pointerdown',{target:bouton});
assert.equal(t.frames(),framesAvant,'toucher le raccourci pendant une saisie ne doit déclencher aucune réorganisation');
bouton.click();
assert.equal(t.ui.settings.open,true,'le raccourci doit rester utilisable pendant une saisie');
assert.equal(t.frames(),framesAvant,'ouvrir les réglages ne doit jamais planifier de rendu');
assert.equal(t.api.isSettingsShortcut(bouton),true,'le raccourci doit être reconnu comme tel par le verrou');
assert.equal(t.api.isSettingsShortcut(t.ui.field),false,'un champ des réglages n’est pas le raccourci');

// Un clic hors des réglages et hors du raccourci lève bien le verrou, comme avant.
t.dom.document.dispatch('pointerdown',{target:t.ui.timeline});
assert(t.frames()>framesAvant,'un clic ailleurs doit continuer à lever le verrou et relancer un rendu');

// --- 5. Une seule entrée fermée, sans deuxième gestionnaire du panneau -------------
// Ce test vérifie la règle émise et les invariants DOM, pas un rendu navigateur.
t=boot();
t.api.run();
const css=t.dom.document.getElementById('planning-fix-css').textContent;
assert.match(css,/#planningSettings:not\(\[open\]\),\s*#planningSettings:not\(\.planningSettingsSheetOpen\)\s*\{\s*display:none!important\s*;?\s*\}/,
  'fermé OU ouvert sans classe de feuille, le panneau entier doit disparaître');
assert.doesNotMatch(css,/#planningSettings(?:\[open\])?\s*\{[^}]*display:none/,
  'la règle ne doit pas masquer la feuille ouverte');
assert.doesNotMatch(css,/#planningSettings\s+summary\s*\{[^}]*display:none/,
  'les résumés imbriqués Jours et Enseignes doivent rester utilisables');
const summary=t.ui.summary,inner=t.ui.inner,parent=t.ui.settings.parentNode;
const settingsButton=t.ui.tools.querySelector('#planningSettingsShortcut');
settingsButton.click();
assert.equal(t.ui.settings.open,true);
assert.equal(t.ui.summary,summary,'aucun résumé ni contenu ne doit être recréé');
assert.equal(summary.parentNode,t.ui.settings);
assert.equal(summary.getAttribute('hidden'),null);
assert.equal(summary.getAttribute('tabindex'),null);

// Six rendus pendant la saisie ne doivent ni recréer ni déplacer les réglages.
t.ui.field.value='2026-10-05';
t.dom.document.activeElement=t.ui.field;
t.dom.document.dispatch('focusin',{target:t.ui.field});
const order=t.ui.plan.children.slice();
t.ui.settings.parentNode.appendChild=function(){throw new Error('déplacement pendant la saisie')};
for(let i=0;i<6;i++)t.api.run();
assert.equal(t.ui.field.value,'2026-10-05');
assert.deepEqual(t.ui.plan.children,order);
assert.equal(t.ui.settings.parentNode,parent);
assert.equal(t.ui.inner,inner);
assert.equal(t.dom.document.querySelectorAll('#planningSettings').length,1);
assert.equal(t.dom.document.querySelectorAll('#planningSettingsShortcut').length,1);

// --- 6. Intégration avec le vrai propriétaire de la feuille ------------------------
t=boot();t.api.run();
vm.runInNewContext(fs.readFileSync(__dirname+'/../navigation-controller.js','utf8'),t.ctx);
const sheetSettings=t.ui.settings,sheetInner=t.ui.inner,sheetOrder=t.ui.plan.children.slice();
const sheetButton=t.ui.tools.querySelector('#planningSettingsShortcut');
sheetSettings.open=true; // Chemin historique : aucune classe/aucun en-tête ajouté.
assert.equal(sheetSettings.classList.contains('planningSettingsSheetOpen'),false);
assert.equal(sheetSettings.getAttribute('role'),null);
sheetButton.click(); // Le listener document intercepte le raccourci réel.
assert.equal(sheetSettings.classList.contains('planningSettingsSheetOpen'),true);
assert.equal(sheetSettings.getAttribute('role'),'dialog');
assert.equal(sheetSettings.getAttribute('aria-modal'),'true');
assert.equal(sheetSettings.scrollCalls.length,0,'la feuille intercepte le vieux défilement');
const header=t.dom.document.getElementById('planningSettingsSheetHeader');
assert(header&&header.parentNode===sheetInner);
assert.match(header.innerHTML,/data-planning-settings-close aria-label="Fermer les réglages"/);
const sheetCss=t.dom.document.getElementById('planning-settings-sheet-css').textContent;
assert.match(sheetCss,/#planningSettings\.planningSettingsSheetOpen>summary\{display:none!important\}/);
assert.match(sheetCss,/width:44px;height:44px;min-width:44px/);

t.ui.field.value='2026-10-05';
t.dom.document.activeElement=t.ui.field;
t.dom.document.dispatch('focusin',{target:t.ui.field});
const lockedFrames=t.frames();
const originalAppend=t.ui.plan.appendChild;
t.ui.plan.appendChild=function(){throw new Error('déplacement pendant la saisie')};
for(let i=0;i<6;i++){
  t.dom.document.dispatch('store-runner:planning-updated',{});
  t.api.run();
}
assert.deepEqual(t.ui.plan.children,sheetOrder);
assert.equal(t.ui.field.value,'2026-10-05');
assert.equal(t.dom.document.querySelectorAll('#planningSettings').length,1);
assert.equal(t.dom.document.querySelectorAll('#planningSettingsShortcut').length,1);

// Le faux DOM ne parse pas innerHTML : la cible de la croix est fournie au
// listener délégué réel, dont on vérifie les effets (pas le rendu tactile).
const closeTarget={closest:selector=>selector==='[data-planning-settings-close]'?closeTarget:null};
t.dom.document.dispatch('click',{target:closeTarget,preventDefault(){},stopPropagation(){}});
assert.equal(sheetSettings.open,false);
assert.equal(sheetSettings.classList.contains('planningSettingsSheetOpen'),false);
assert.equal(sheetSettings.getAttribute('role'),null);
assert.equal(sheetSettings.getAttribute('aria-modal'),null);
assert.equal(t.frames(),lockedFrames+6,'la fermeture ne doit ajouter aucun rendu au propriétaire visuel');
t.ui.plan.appendChild=originalAppend;
t.dom.document.activeElement=null;
t.dom.document.dispatch('toggle',{target:sheetSettings});
sheetButton.click();
assert.equal(sheetSettings.open,true);
assert.equal(sheetSettings.getAttribute('role'),'dialog');
assert.equal(t.ui.field.value,'2026-10-05');
assert.equal(t.ui.inner,sheetInner);
assert.equal(t.dom.document.getElementById('planningSettingsSheetHeader'),header);
assert.deepEqual(t.ui.plan.children,sheetOrder);

console.log('PASS: réglages invisibles hors feuille, raccourci et fermeture déléguée, six rendus sans duplication/déplacement, saisie conservée.');
