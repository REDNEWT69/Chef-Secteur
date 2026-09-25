/* IndexedDB minimal pour exécuter en Node le moteur de stockage d'index.html.

   Fidèle sur ce qui compte pour la durabilité :
   - une transaction reste active pendant la tâche qui l'a créée, puis se valide seule
     une fois ses requêtes terminées (ou tout de suite après `commit()`) ;
   - ses écritures sont appliquées TOUTES ou AUCUNE ;
   - un quota en octets fait avorter la transaction avec `QuotaExceededError` ;
   - une connexion fermée (iOS qui suspend la PWA) lève `InvalidStateError`.
   Ce n'est pas un moteur complet : pas d'index, pas de plages de clés. */
function domError(name,message){const e=new Error(message||name);e.name=name;return e}
const tick=fn=>setTimeout(fn,0);

class FakeIDB{
  constructor(options={}){this.bases=new Map();this.quota=options.quota??Infinity;this.failOpen=null;this.commits=0;this.connections=new Set()}
  size(name='chef-secteur-storage'){const b=this.bases.get(name);if(!b)return 0;let n=0;for(const s of b.stores.values())for(const [k,v] of s)n+=String(k).length+String(v).length;return n}
  dump(name='chef-secteur-storage',store='kv'){const b=this.bases.get(name);return b&&b.stores.get(store)?new Map(b.stores.get(store)):new Map()}
  deleteAll(){this.bases.clear()}
  /* Simule iOS : toutes les connexions ouvertes deviennent inutilisables. */
  dropConnections(){for(const c of this.connections){c._closed=true;if(typeof c.onclose==='function')c.onclose()}this.connections.clear()}
  open(name,version){
    const req={result:null,error:null,onsuccess:null,onerror:null,onupgradeneeded:null,onblocked:null};
    tick(()=>{
      if(this.failOpen){const e=this.failOpen;this.failOpen=null;req.error=e;req.onerror&&req.onerror();return}
      let base=this.bases.get(name),upgrade=false;
      if(!base){base={version:0,stores:new Map()};this.bases.set(name,base)}
      if(version>base.version){upgrade=true;base.version=version}
      const conn=new Connection(this,base);this.connections.add(conn);req.result=conn;
      if(upgrade&&req.onupgradeneeded){conn._upgrading=true;req.onupgradeneeded();conn._upgrading=false}
      req.onsuccess&&req.onsuccess();
    });
    return req;
  }
}
class Connection{
  constructor(idb,base){this.idb=idb;this.base=base;this._closed=false;this.onclose=null;this.onversionchange=null}
  get objectStoreNames(){const names=[...this.base.stores.keys()];return{contains:n=>names.includes(n),length:names.length}}
  createObjectStore(n){this.base.stores.set(n,new Map());return{}}
  close(){this._closed=true;this.idb.connections.delete(this)}
  transaction(store,mode){
    if(this._closed)throw domError('InvalidStateError','The database connection is closing.');
    if(!this.base.stores.has(store))throw domError('NotFoundError','No objectStore named '+store);
    return new Tx(this,store,mode);
  }
}
class Tx{
  constructor(conn,store,mode){
    this.conn=conn;this.store=store;this.mode=mode;this.active=true;this.done=false;this.error=null;
    this.ops=[];this.queue=[];this.oncomplete=null;this.onabort=null;this.onerror=null;
    setTimeout(()=>{this.active=false;this.run()},0);
  }
  objectStore(){const tx=this;return{
    put(value,key){tx.check(true);tx.ops.push(['put',String(key),String(value)]);return tx.request(()=>key)},
    delete(key){tx.check(true);tx.ops.push(['delete',String(key)]);return tx.request(()=>undefined)},
    clear(){tx.check(true);tx.ops.push(['clear']);return tx.request(()=>undefined)},
    get(key){tx.check(false);return tx.request(()=>{const v=tx.view().get(String(key));return v===undefined?undefined:v})},
    openCursor(){tx.check(false);const req=tx.request(null);const entries=()=>[...tx.view().entries()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);let i=0;
      const step=()=>{const list=entries();if(i<list.length){const [k,v]=list[i];req.result={key:k,value:v,continue(){i++;tx.queue.push(step)}}}else req.result=null;req.onsuccess&&req.onsuccess()};
      tx.queue.push(step);return req}
  }}
  check(write){
    if(this.done||!this.active)throw domError('TransactionInactiveError','The transaction is not active.');
    if(write&&this.mode!=='readwrite')throw domError('ReadOnlyError','readonly');
  }
  view(){const m=new Map(this.conn.base.stores.get(this.store));for(const op of this.ops){if(op[0]==='put')m.set(op[1],op[2]);else if(op[0]==='delete')m.delete(op[1]);else m.clear()}return m}
  request(compute){const req={result:undefined,error:null,onsuccess:null,onerror:null};if(compute)this.queue.push(()=>{req.result=compute();req.onsuccess&&req.onsuccess()});return req}
  commit(){this.active=false}
  run(){
    if(this.done)return;
    while(this.queue.length){const job=this.queue.shift();job()}
    if(this.active){setTimeout(()=>this.run(),0);return}
    this.done=true;
    if(this.conn._closed){this.error=domError('AbortError','Connection closed');this.onerror&&this.onerror();this.onabort&&this.onabort();return}
    const next=this.view(),before=this.conn.base.stores.get(this.store);
    if(this.mode==='readwrite'){
      const others=this.conn.idb.size()-[...before].reduce((n,[k,v])=>n+k.length+v.length,0);
      const after=[...next].reduce((n,[k,v])=>n+k.length+v.length,0);
      if(others+after>this.conn.idb.quota){this.error=domError('QuotaExceededError','The quota has been exceeded.');this.onerror&&this.onerror();this.onabort&&this.onabort();return}
      this.conn.base.stores.set(this.store,next);this.conn.idb.commits++;
    }
    this.oncomplete&&this.oncomplete();
  }
}

/* localStorage simulé, quota en unités UTF-16 comme les navigateurs. */
class FakeLocalStorage{
  constructor(quota=Infinity){this.map=new Map();this.quota=quota;this.disabled=false;this.writes=0}
  get length(){return this.map.size}
  key(i){return [...this.map.keys()][i]??null}
  getItem(k){return this.map.has(String(k))?this.map.get(String(k)):null}
  setItem(k,v){if(this.disabled)throw domError('SecurityError','localStorage disabled');k=String(k);v=String(v);let n=k.length+v.length;for(const [a,b] of this.map)if(a!==k)n+=a.length+b.length;if(n>this.quota)throw domError('QuotaExceededError',"Setting the value of '"+k+"' exceeded the quota.");this.map.set(k,v);this.writes++}
  removeItem(k){this.map.delete(String(k))}
  clear(){this.map.clear()}
}

module.exports={FakeIDB,FakeLocalStorage,domError};
