/* V256 — durabilité sur 6 à 12 mois de terrain.

   1. Reproduit la panne : sur le moteur localStorage (~5 Mo), un secteur actif ne
      tient pas quelques mois — sauvegarde puis restauration échouent.
   2. Prouve le correctif : sur le moteur IndexedDB, un an de visites s'enregistre,
      s'exporte, se restaure, dix fois de suite, à l'identique.
   3. Verrouille l'export : compact, scellé, relu avant téléchargement, complet
      (performances, crédits, profil national), tolérant à une clé auxiliaire abîmée.
   Données 100 % synthétiques (tests/helpers/durability-fixture.cjs). */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../reliability-core.js');
const F=require('./helpers/durability-fixture.cjs');
const {FakeLocalStorage}=require('./helpers/fake-indexeddb.cjs');
const ROOT=path.join(__dirname,'..');
const ko=n=>Math.round(n/1024)+' Ko';
const K=R.keys;

/* Moteur atomique en mémoire : même contrat que le moteur IndexedDB (atomic:true). */
class AtomicDB{constructor(){this.map=new Map();this.atomic=true}getItem(k){return this.map.has(k)?this.map.get(k):null}setItem(k,v){this.map.set(String(k),String(v))}removeItem(k){this.map.delete(k)}}
function bundleOf(data){return{format:'ChefSecteurBackup',version:1,createdAt:'2026-09-25T08:00:00.000Z',state:data.state,archive:data.archive,range:data.range,catalog:[],performance:data.performance,creditOverrides:{'boulanger|ville 1|1 rue de test':2},nationalProfile:{mode:'national',sectors:[{id:'s1',name:'Secteur Test'}]}}}
const results=[];const pass=m=>{results.push(m);console.log('PASS '+results.length+' · '+m)};

/* ---------------------------------------------------------------- 1. la panne */
{
  const quota=5*1024*1024,lines=[];let saveFailedAt=null,restoreFailedAt=null;
  for(const months of [1,2,3,4,6]){
    const data=F.build({months}),db=new FakeLocalStorage(quota);
    let saved=true,restored=true;
    try{R.persist(bundleOf(data),db)}catch(e){saved=false}
    if(saved){
      /* Une journée de travail : la sauvegarde horodatée pose un point de restauration. */
      const next=structuredClone(data.state);next.notes['st-0']='modifié';
      try{R.save(next,db)}catch(e){saved=false}
      try{global.state=next;R.restore(bundleOf(data),db)}catch(e){restored=false}
    }
    if(!saved&&saveFailedAt===null)saveFailedAt=months;
    if(!restored&&restoreFailedAt===null)restoreFailedAt=months;
    lines.push(months+' mois : état '+ko(JSON.stringify(data.state).length)+(saved?'':' → ÉCHEC sauvegarde')+(restored?'':' → ÉCHEC restauration'));
  }
  delete global.state;
  assert(saveFailedAt!==null&&saveFailedAt<=6,'le moteur localStorage devait échouer avant 6 mois');
  assert(restoreFailedAt!==null&&restoreFailedAt<=3,'la restauration localStorage devait échouer avant 3 mois');
  pass('panne reproduite sur localStorage 5 Mo — restauration impossible dès '+restoreFailedAt+' mois, sauvegarde dès '+saveFailedAt+' mois ('+lines.join(' ; ')+')');
}

/* ----------------------------------------------- 2. un an sur le moteur atomique */
const year=F.build({months:12,stores:60});
{
  const db=new AtomicDB();const bundle=bundleOf(year);
  R.persist(bundle,db);
  let t=Date.now();const s=R.load(db);const loadMs=Date.now()-t;
  assert.equal(s.businessV2.visits.length,year.visitCount);
  /* 60 sauvegardes successives (une journée chargée) : aucune ne doit échouer. */
  t=Date.now();for(let i=0;i<60;i++){s.notes['st-'+(i%60)]='note '+i;R.save(s,db)}const saveMs=(Date.now()-t)/60;
  assert.equal(JSON.parse(db.getItem(K.MAIN)).notes['st-59'],'note 59');
  assert.equal(db.getItem(K.JOURNAL),null);
  /* Budget sauvegardes : les versions s'accumulent sans jamais dépasser le budget. */
  for(let i=0;i<10;i++)R.checkpoint('test '+i,db,R.capture(s,db));
  const rows=R.backups(db),bytes=db.getItem(K.BACKUPS).length;
  assert(rows.length>=1&&bytes<=R.limits.ATOMIC_BACKUPS_MAX_BYTES,'historique hors budget');
  pass('12 mois / 60 magasins / '+year.visitCount+' visites / '+year.state.businessV2.actions.length+' actions : état '+ko(db.getItem(K.MAIN).length)+', chargement '+loadMs+' ms, sauvegarde moyenne '+Math.round(saveMs)+' ms, '+rows.length+' versions gardées ('+ko(bytes)+')');
}

/* ------------------------------------ 3. export → restauration, dix fois de suite */
{
  let db=new AtomicDB();R.persist(bundleOf(year),db);global.state=R.load(db);
  const first=R.seal(R.capture(global.state,db)),text=JSON.stringify(first),pretty=JSON.stringify(first,null,2);
  assert(text.length<R.limits.IMPORT_MAX_BYTES);
  assert(pretty.length>20*1024*1024,'référence : l’ancien export indenté dépassait l’ancienne limite de 20 Mo');
  let current=text;
  const strip=b=>{const c=Object.assign({},b);delete c.createdAt;delete c.integrity;return JSON.stringify(c)},reference=strip(first);
  for(let cycle=0;cycle<10;cycle++){
    const decoded=R.decode(current,global.state);
    db=new AtomicDB();                       /* nouvel appareil à chaque cycle */
    global.state=R.restore(decoded,db);
    const again=R.seal(R.capture(global.state,db));
    assert.equal(strip(again),reference,'cycle '+cycle+' : données divergentes');
    assert.equal(again.integrity.state,first.integrity.state);
    current=JSON.stringify(again);
  }
  assert.deepEqual(R.summary(JSON.parse(current)),first.integrity.counts);
  delete global.state;
  pass('10 cycles export → nouvel appareil → restauration → export identiques ; export compact '+ko(text.length)+' (indenté : '+ko(pretty.length)+', au-delà de l’ancienne limite de 20 Mo)');
}

/* ------------------------------------------------------ 4. intégrité de l'export */
{
  const db=new AtomicDB();R.persist(bundleOf(F.build({months:1})),db);const s=R.load(db);
  const sealed=R.seal(R.capture(s,db));
  const tampered=JSON.parse(JSON.stringify(sealed));tampered.state.notes['st-0']='note réécrite hors application';
  assert.throws(()=>R.decode(JSON.stringify(tampered),s),/altéré/);
  const truncated=JSON.stringify(sealed).slice(0,-200);assert.throws(()=>R.decode(truncated,s));
  const unsealed=structuredClone(sealed);delete unsealed.integrity;assert.doesNotThrow(()=>R.decode(JSON.stringify(unsealed),s),'un ancien export sans sceau reste accepté');
  pass('fichier altéré ou tronqué refusé ; export antérieur sans sceau toujours accepté');
}

/* --------------------------------------- 5. clés auxiliaires dans la sauvegarde */
{
  const data=F.build({months:1}),db=new AtomicDB();
  db.setItem(K.MAIN,JSON.stringify(data.state));
  db.setItem(K.PERFORMANCE,JSON.stringify(data.performance));
  db.setItem(K.CREDITS,JSON.stringify({'darty|ville 1|':1}));
  db.setItem(K.NATIONAL,JSON.stringify({mode:'national'}));
  const b=R.capture(data.state,db);
  assert.deepEqual(b.performance,data.performance);assert.deepEqual(b.creditOverrides,{'darty|ville 1|':1});assert.deepEqual(b.nationalProfile,{mode:'national'});
  const target=new AtomicDB();R.persist(b,target);
  assert.equal(target.getItem(K.PERFORMANCE),JSON.stringify(data.performance));
  /* Une sauvegarde d'avant V256 ne porte pas ces champs : l'appareil garde les siens. */
  const legacy=structuredClone(b);delete legacy.performance;delete legacy.creditOverrides;delete legacy.nationalProfile;
  R.persist(legacy,target);assert.equal(target.getItem(K.PERFORMANCE),JSON.stringify(data.performance));assert.equal(target.getItem(K.NATIONAL),'{"mode":"national"}');
  /* Une clé auxiliaire abîmée n'empêche plus l'export du reste. */
  db.setItem(K.PERFORMANCE,'{pas du json');db.setItem(K.CUISINISTE,JSON.stringify({schema:9}));
  const partial=R.capture(data.state,db);
  assert.deepEqual(partial.skipped.sort(),['cuisinisteContracts','performance']);assert.equal(partial.performance,undefined);
  const keep=new AtomicDB();keep.setItem(K.PERFORMANCE,'{"version":2,"imports":[],"mapping":{},"treated":{}}');R.persist(partial,keep);
  assert.equal(keep.getItem(K.PERFORMANCE),'{"version":2,"imports":[],"mapping":{},"treated":{}}','une donnée écartée ne doit jamais effacer la valeur de l’appareil');
  pass('performances, crédits forcés et profil national exportés/restaurés ; sauvegarde ancienne non destructive ; clé abîmée écartée sans bloquer l’export');
}

/* ------------------------------------------------------------ 6. données anciennes */
{
  const db=new AtomicDB();
  const old=F.build({months:2}).state;old.schemaVersion=3;
  for(const v of old.businessV2.visits){delete v.report;delete v.activeFamily}
  const decoded=R.decode(JSON.stringify(old),old);assert.equal(decoded.state.schemaVersion,5);
  global.state=decoded.state;const restored=R.restore(decoded,db);
  assert.equal(restored.businessV2.visits.length,old.businessV2.visits.length);
  assert.equal(restored.businessV2.visits[0].report,undefined,'une ancienne visite n’est jamais réécrite');
  delete global.state;
  pass('sauvegarde schéma 3 sans comptes rendus V2 : restaurée telle quelle, sans migration destructive');
}

/* ------------------------------------------------ 7. garde-fous de code source */
{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
  assert(html.includes('createStorageEngine(window)'),'index.html doit démarrer le moteur V256');
  assert(!/createStorageFallback/.test(html),'l’ancien repli ne doit plus être le moteur');
  const direct=[];
  for(const f of fs.readdirSync(ROOT).filter(f=>f.endsWith('.js'))){
    const src=fs.readFileSync(path.join(ROOT,f),'utf8');
    for(const key of [K.MAIN,K.ARCHIVE,K.RANGE,K.CATALOG,K.CUISINISTE,K.PERFORMANCE,K.CREDITS,K.NATIONAL,'ARCHIVE_KEY','RANGE_KEY'])
      if(new RegExp('(^|[^.\\w])localStorage\\.(get|set|remove)Item\\(\\s*[\'"]?'+key.replace(/[-]/g,'\\-')).test(src))direct.push(f+' → '+key);
  }
  assert.deepEqual(direct,[],'donnée métier lue/écrite directement dans localStorage (contourne le moteur) : '+direct.join(', '));
  const ui=fs.readFileSync(path.join(ROOT,'reliability-ui.js'),'utf8');
  assert(!/JSON\.stringify\(bundle,null,2\)/.test(ui),'export indenté réintroduit');
  assert(/R\.decode\(text/.test(ui),'l’export doit être relu avant téléchargement');
  assert(/verify\(/.test(ui),'la restauration doit relire le disque');
  pass('aucun module ne contourne le moteur pour une donnée métier ; export compact relu ; restauration vérifiée');
}
