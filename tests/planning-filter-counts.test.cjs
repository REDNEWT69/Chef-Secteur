const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(process.env.PLANNING_UI_SOURCE||path.join(root,'planning-ui-fixes.js'),'utf8');
const core=fs.readFileSync(path.join(root,'src/chef-secteur.html'),'utf8');
// Execute the production filter and control renderer, with an in-memory DOM.
// All stores and brands below are synthetic; no sector export is used.
function dom(){
  const listeners={},frames=[];
  function matches(el,selector){return selector.split(',').some(part=>{
    const tokens=part.trim().split(/\s+/);
    function token(n,s){
      const attrs=[...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
      s=s.replace(/\[[^\]]*\]/g,'');
      const tag=s.match(/^[a-z]+/i),id=s.match(/#([\w-]+)/),cls=[...s.matchAll(/\.([\w-]+)/g)];
      return (!tag||n.tagName===tag[0].toUpperCase())&&(!id||n.id===id[1])&&cls.every(m=>n.className.split(' ').includes(m[1]))&&attrs.every(m=>m[2]===undefined?n.attrs[m[1]]!==undefined:(n[m[1]]||n.attrs[m[1]])===m[2]);
    }
    if(!token(el,tokens.pop()))return false;
    let n=el.parentNode;
    while(tokens.length){const t=tokens.pop();while(n&&!token(n,t))n=n.parentNode;if(!n)return false;n=n.parentNode}
    return true;
  })}
  function descendants(n){return n.children.flatMap(c=>[c,...descendants(c)])}
  function make(tag){
    const n={tagName:tag.toUpperCase(),id:'',className:'',children:[],parentNode:null,attrs:{},style:{},dataset:{},events:{},textContent:'',checked:false};
    n.matches=s=>matches(n,s);n.closest=s=>n.matches(s)?n:n.parentNode?.closest(s);
    n.querySelectorAll=s=>descendants(n).filter(c=>matches(c,s));n.querySelector=s=>n.querySelectorAll(s)[0]||null;
    n.appendChild=c=>{c.remove();c.parentNode=n;n.children.push(c);return c};
    n.remove=()=>{if(n.parentNode){n.parentNode.children.splice(n.parentNode.children.indexOf(n),1);n.parentNode=null}};
    n.insertBefore=(c,ref)=>{c.remove();const i=n.children.indexOf(ref);c.parentNode=n;n.children.splice(i<0?n.children.length:i,0,c);return c};
    n.insertAdjacentElement=(pos,c)=>{assert.equal(pos,'afterend');n.parentNode.insertBefore(c,n.nextElementSibling)};
    n.addEventListener=(event,fn)=>(n.events[event]??=[]).push(fn);n.setAttribute=(k,v)=>n.attrs[k]=v;
    n.click=()=>{for(const fn of n.events.click||[])fn({target:n})};
    n.classList={contains:c=>n.className.split(' ').includes(c),add:()=>{},remove:()=>{}};
    Object.defineProperty(n,'nextElementSibling',{get:()=>n.parentNode?.children[n.parentNode.children.indexOf(n)+1]||null});
    Object.defineProperty(n,'previousElementSibling',{get:()=>n.parentNode?.children[n.parentNode.children.indexOf(n)-1]||null});
    Object.defineProperty(n,'innerHTML',{set(html){
      n.children.slice().forEach(c=>c.remove());
      if(html.includes('data-choice-summary')){const small=make('small');small.attrs['data-choice-summary']='';n.appendChild(small)}
      for(const m of html.matchAll(/<input\b([^>]*)>/g)){
        const input=make('input');input.type='checkbox';input.value=m[1].match(/value="([^"]*)"/)[1];input.checked=/\bchecked\b/.test(m[1]);
        for(const a of m[1].matchAll(/\b(data-[\w-]+)/g))input.attrs[a[1]]='';n.appendChild(input);
      }
    }});
    return n;
  }
  const document={body:make('body'),head:make('head'),readyState:'loading',activeElement:null,createElement:make,
    addEventListener:(e,fn)=>(listeners[e]??=[]).push(fn),
    querySelectorAll:s=>[...descendants(document.body),...descendants(document.head)].filter(n=>matches(n,s)),
    querySelector:s=>document.querySelectorAll(s)[0]||null,getElementById:id=>document.querySelector('#'+id)};
  return {document,make,frames,dispatch:(name,event={})=>{for(const fn of listeners[name]||[])fn(event)}};
}
function boot(){
  const d=dom(),doc=d.document;
  function add(tag,id,parent=doc.body){const n=d.make(tag);n.id=id;parent.appendChild(n);return n}
  const settings=add('details','planningSettings'),inner=add('div','',settings);inner.className='settingsInner';
  add('input','target',inner);add('div','daysBox',inner);add('div','brandsBox',inner);add('div','departureStoreNotice');
  const counts=[9,8,8,8,8,4,3,3,1,1,1],stores=[];
  counts.forEach((count,b)=>{for(let i=0;i<count;i++)stores.push({id:'fiction-'+stores.length,enseigne:'Brand '+b,ville:'Town '+stores.length,active:true})});
  stores.push({id:'disabled',enseigne:'Brand 0',active:false},{id:'excluded',enseigne:'Brand 0',active:true});
  const state={stores,settings:{brands:counts.slice(0,5).map((_,i)=>'Brand '+i),products:[],days:['Lundi','Mardi']},excluded:{excluded:true}};
  let saved=null,saves=0;
  const ctx={document:doc,state,console,Intl,Date,Set,save(){saves++;saved=JSON.stringify(state)},DAYS:['Lundi','Mardi'],brands:()=>counts.map((_,i)=>'Brand '+i),esc:s=>s,
    setTimeout:fn=>d.frames.push(fn),requestAnimationFrame:fn=>d.frames.push(fn),window:{addEventListener(){}},MutationObserver:class{observe(){}}};
  vm.createContext(ctx);
  for(const name of ['includedByFilters','renderFilterControls'])vm.runInContext(core.split('\n').find(line=>line.startsWith('function '+name+'(')),ctx);
  vm.runInContext(source.replace('  function run(){','  window.testUI={compactSettings,syncDynamicStoreCount,choiceSummary};\n  function run(){'),ctx);
  ctx.renderFilterControls();ctx.window.testUI.compactSettings();
  return {d,ctx,doc,state,get saved(){return saved},get saves(){return saves},refresh:()=>ctx.window.testUI.compactSettings()};
}
const h=boot(),{ctx,doc,state,d}=h;
const line=()=>doc.getElementById('planningDynamicStoreCount')?.textContent||'';
const summary=()=>doc.querySelector('#planningBrandsDetails [data-choice-summary]').textContent;
const available=()=>state.stores.filter(s=>s.active!==false&&!state.excluded[s.id]&&ctx.includedByFilters(s)).length;
if(process.env.PLANNING_UI_BASELINE){
  console.log(JSON.stringify({count:line(),summary:summary(),eligible:available(),button:!!doc.getElementById('planningAllBrands')}));
  process.exit(0);
}
assert.match(line(),/^41 magasins disponibles pour le planning · 13 écartés par le filtre Enseignes\.$/);
assert.equal(summary(),'5 sur 11 · 13 magasins écartés');assert.equal(available(),41);
assert.match(doc.getElementById('departureStoreNotice').textContent,/55 magasins actifs dans ton secteur · 56 au total/);
assert.equal(ctx.window.testUI.choiceSummary('daysBox','days'),'Lun, Mar');
const checkbox=doc.querySelectorAll('#brandsBox input')[0];checkbox.checked=false;doc.activeElement=checkbox;
d.dispatch('change',{target:checkbox});
assert.match(line(),/^32 magasins.*22 écartés/);assert.equal(summary(),'4 sur 11 · 22 magasins écartés');
assert.equal(available(),32);assert.equal(h.saves,1);
console.log('Décocher une enseigne : 41 -> 32 disponibles ; 13 -> 22 écartés (focus conservé).');
ctx.renderFilterControls();h.refresh();
assert.equal(summary(),'4 sur 11 · 22 magasins écartés');
const button=doc.getElementById('planningAllBrands');
assert.equal(button.parentNode.className,'planningChoiceBody');assert.equal(doc.getElementById('brandsBox').nextElementSibling,button);
button.click();assert.equal(state.settings.brands.length,0);assert.equal(h.saves,2);
assert.equal(JSON.parse(h.saved).settings.brands.length,0);assert(doc.querySelectorAll('#brandsBox input').every(n=>n.checked));
assert.equal(line(),'54 magasins disponibles pour le planning.');assert.equal(summary(),'Toutes');assert.equal(available(),54);
assert.equal(doc.getElementById('planningAllBrands'),null);
console.log('Toutes les enseignes : 32 -> 54 disponibles ; 22 -> 0 écarté ; filtre sauvegardé vide.');
state.settings.brands=ctx.brands();ctx.renderFilterControls();h.refresh();
assert.equal(line(),'54 magasins disponibles pour le planning.');assert.equal(doc.getElementById('planningAllBrands'),null);
// Restoring saved settings and rebuilding controls uses the same UI and filter.
state.settings.brands=['Brand 0','Brand 1','Brand 2','Brand 3','Brand 4'];ctx.renderFilterControls();
doc.activeElement=null;d.dispatch('store-runner:data-restored');
while(d.frames.length)d.frames.shift()();
assert.match(line(),/^41 magasins.*13 écartés/);
for(let i=0;i<6;i++){ctx.renderFilterControls();h.refresh()}
for(const id of ['planningBrandsDetails','planningDaysDetails','planningDynamicStoreCount','departureStoreNotice','planningAllBrands'])assert.equal(doc.querySelectorAll('#'+id).length,1,id);
assert.equal(doc.querySelectorAll('#brandsBox button').length,0);
console.log('6 reconstructions : 1 nœud par identifiant ; bouton hors de brandsBox.');
// No guessed count when the production filter is unavailable.
ctx.includedByFilters=undefined;h.refresh();assert.equal(line(),'');assert.equal(summary(),'');
console.log('Filtre absent : compteur et résumé masqués.');
// Prove the UI delegates all filtering instead of reimplementing brand matching.
ctx.includedByFilters=s=>s.id==='fiction-0';h.refresh();assert.match(line(),/^1 magasin disponible.*53 écartés/);
console.log('planning-filter-counts: PASS (données entièrement fictives).');
