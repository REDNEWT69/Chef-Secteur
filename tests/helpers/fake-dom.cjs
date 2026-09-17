/* Faux DOM minimal, écrit à la main (pas de jsdom).
   Seulement les primitives réellement utilisées par les modules qui écrivent dans
   #dayTabs : createElement/createDocumentFragment, appendChild/insertBefore/remove,
   insertAdjacentElement, classList, dataset, style, innerHTML, scrollLeft,
   getBoundingClientRect/scrollIntoView, closest, et un querySelector limité aux
   sélecteurs effectivement employés (classes, présence d'attribut, listes séparées par
   des virgules, et un unique niveau de descendance préfixé par un id, ex.
   "#dayTabs .foo.bar[baz]"). */
function parseCompound(token){
  const compound={id:null,tag:null,classes:[],attrs:[]};
  const re=/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|([a-zA-Z][\w-]*)/g;
  let m;
  while((m=re.exec(token))){
    if(m[1])compound.id=m[1];
    else if(m[2])compound.classes.push(m[2]);
    else if(m[3])compound.attrs.push({name:m[3],value:m[4]!==undefined?m[4]:null});
    else if(m[5])compound.tag=m[5].toUpperCase();
  }
  return compound;
}
function matchesCompound(el,compound){
  if(compound.tag&&el.tagName!==compound.tag)return false;
  if(compound.id&&el.id!==compound.id)return false;
  for(const c of compound.classes)if(!el.classList.contains(c))return false;
  for(const a of compound.attrs){
    const val=el.getAttribute(a.name);
    if(a.value!==null){if(val!==a.value)return false}
    else if(val===null)return false;
  }
  return true;
}
function subtreeElements(root){
  const out=[];
  (function walk(node){for(const child of (node.children||[])){out.push(child);walk(child)}})(root);
  return out;
}
function createFakeDom(){
  const registry=new Map();
  function makeFragment(){
    const frag={_isFragment:true,children:[]};
    frag.appendChild=function(child){child.parentNode=frag;frag.children.push(child);return child};
    return frag;
  }
  function detach(child){
    const parent=child&&child.parentNode;
    if(!parent||!parent.children)return;
    const i=parent.children.indexOf(child);
    if(i!==-1)parent.children.splice(i,1);
    child.parentNode=null;
  }
  function makeElement(tag){
    const classes=new Set();
    let id='';
    const el={tagName:String(tag).toUpperCase(),children:[],parentNode:null,dataset:{},style:{},_attrs:{},_listeners:{},_text:'',_html:'',scrollLeft:0,onclick:null,type:''};
    Object.defineProperty(el,'className',{get:()=>Array.from(classes).join(' '),set(v){classes.clear();String(v||'').split(/\s+/).filter(Boolean).forEach(c=>classes.add(c))}});
    Object.defineProperty(el,'innerHTML',{get:()=>el._html,set(v){el._html=v;if(v===''){el.children.forEach(c=>{c.parentNode=null});el.children=[]}}});
    Object.defineProperty(el,'textContent',{get:()=>el._text,set(v){el._text=String(v)}});
    Object.defineProperty(el,'firstElementChild',{get:()=>el.children[0]||null});
    Object.defineProperty(el,'nextElementSibling',{get(){
      const parent=el.parentNode;if(!parent||!parent.children)return null;
      const i=parent.children.indexOf(el);return i===-1?null:(parent.children[i+1]||null);
    }});
    Object.defineProperty(el,'id',{get:()=>id,set(v){if(id)registry.delete(id);id=String(v);if(id)registry.set(id,el)}});
    el.classList={add:(...n)=>n.forEach(x=>classes.add(x)),remove:(...n)=>n.forEach(x=>classes.delete(x)),contains:n=>classes.has(n),toggle(n,force){const has=classes.has(n);const next=force===undefined?!has:Boolean(force);if(next)classes.add(n);else classes.delete(n);return next}};
    el.appendChild=function(child){
      if(child&&child._isFragment){for(const c of child.children){c.parentNode=el;el.children.push(c)}child.children=[];return child}
      detach(child);child.parentNode=el;el.children.push(child);return child;
    };
    el.insertBefore=function(child,ref){
      detach(child);child.parentNode=el;
      const i=ref?el.children.indexOf(ref):-1;
      if(i===-1)el.children.push(child);else el.children.splice(i,0,child);
      return child;
    };
    el.removeChild=function(child){detach(child);return child};
    el.remove=function(){detach(el)};
    el.insertAdjacentElement=function(position,node){
      const parent=el.parentNode;
      if(position==='afterend'){
        if(!parent)return null;
        detach(node);node.parentNode=parent;
        parent.children.splice(parent.children.indexOf(el)+1,0,node);
        return node;
      }
      if(position==='beforebegin'){
        if(!parent)return null;
        detach(node);node.parentNode=parent;
        parent.children.splice(parent.children.indexOf(el),0,node);
        return node;
      }
      if(position==='beforeend')return el.appendChild(node);
      if(position==='afterbegin')return el.insertBefore(node,el.children[0]||null);
      return null;
    };
    el.setAttribute=function(name,value){el._attrs[name]=String(value)};
    el.getAttribute=function(name){
      if(name.indexOf('data-')===0){const key=name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return Object.prototype.hasOwnProperty.call(el.dataset,key)?el.dataset[key]:null}
      return Object.prototype.hasOwnProperty.call(el._attrs,name)?el._attrs[name]:null;
    };
    el.addEventListener=function(type,fn){(el._listeners[type]=el._listeners[type]||[]).push(fn)};
    el.removeEventListener=function(type,fn){const l=el._listeners[type]||[];const i=l.indexOf(fn);if(i!==-1)l.splice(i,1)};
    el.contains=function(other){let n=other;while(n){if(n===el)return true;n=n.parentNode}return false};
    el.matches=function(sel){return String(sel).split(',').some(part=>matchesCompound(el,parseCompound(part.trim())))};
    el.closest=function(sel){
      const parts=String(sel).split(',').map(p=>parseCompound(p.trim()));
      let node=el;
      while(node){if(parts.some(p=>matchesCompound(node,p)))return node;node=node.parentNode}
      return null;
    };
    el.querySelector=function(sel){return runSelector(el,sel)[0]||null};
    el.querySelectorAll=function(sel){return runSelector(el,sel)};
    el.getBoundingClientRect=function(){return el._rect||{left:0,right:0,top:0,bottom:0,width:0,height:0}};
    return el;
  }
  function runSelector(scopeEl,selectorStr){
    const out=[];
    for(const part of String(selectorStr).split(',')){
      for(const el of runSimpleSelector(scopeEl,part.trim()))if(!out.includes(el))out.push(el);
    }
    return out;
  }
  function runSimpleSelector(scopeEl,selectorStr){
    if(!selectorStr)return[];
    const tokens=selectorStr.trim().split(/\s+/);
    const first=parseCompound(tokens[0]);
    let pool,startIdx;
    if(first.id){const resolved=registry.get(first.id);if(!resolved)return[];pool=[resolved];startIdx=1}
    else{pool=subtreeElements(scopeEl);startIdx=0}
    for(let i=startIdx;i<tokens.length;i++){
      const compound=parseCompound(tokens[i]);
      const searchSpace=(i===startIdx&&first.id)?subtreeElements(pool[0]):pool;
      pool=searchSpace.filter(el=>matchesCompound(el,compound));
    }
    return pool;
  }
  const documentListeners={};
  const document={
    createElement:makeElement,
    createDocumentFragment:makeFragment,
    getElementById:id=>registry.get(id)||null,
    head:makeElement('head'),
    readyState:'loading',
    addEventListener(type,fn){(documentListeners[type]=documentListeners[type]||[]).push(fn)},
    removeEventListener(){},
    querySelector(sel){return runSelector(null,sel)[0]||null},
    querySelectorAll(sel){return runSelector(null,sel)},
  };
  return {
    document,
    registry,
    dispatchDocumentEvent(type,detail){(documentListeners[type]||[]).slice().forEach(fn=>fn(detail||{}))},
  };
}

module.exports={createFakeDom,parseCompound,matchesCompound,subtreeElements};
