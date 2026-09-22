/* V240 — le journal de récupération `chef_recovery_transaction_v1` faisait déborder le
   quota localStorage pendant une génération de planning.

   Ce fichier reproduit d'abord la panne par la mesure, puis prouve le correctif :
   journal sélectif, nettoyage des transactions restées ouvertes, limite de taille et
   repli propre quand le quota est atteint.

   Fixtures 100 % synthétiques : le dépôt est public. Aucun magasin, aucune note, aucun
   client réel — un secteur fabriqué au volume de celui du terrain. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../reliability-core.js');

const ROOT=path.join(__dirname,'..');
const SOURCE=fs.readFileSync(path.join(ROOT,'reliability-core.js'),'utf8');
const K=R.keys;
const ko=n=>Math.round(n/1024)+' Ko';

/* ------------------------------------------------------------------ stockage simulé */
/* Quota en octets, comme un vrai navigateur : la somme des valeurs stockées est bornée
   et `setItem` lève la même DOMException que le terrain a vue. */
class DB{
  constructor(quota=Infinity){this.map=new Map();this.quota=quota;this.fail=null;this.writes=[];this.peak=0}
  getItem(k){return this.map.has(k)?this.map.get(k):null}
  bytes(extraKey,extraValue){
    let n=0;
    for(const [k,v] of this.map)if(k!==extraKey)n+=k.length+v.length;
    if(extraValue!=null)n+=extraKey.length+extraValue.length;
    return n;
  }
  setItem(k,v){
    v=String(v);
    if(this.fail===k){this.fail=null;throw Error('quota')}
    const total=this.bytes(k,v);
    if(total>this.quota)throw Error("Failed to execute 'setItem' on 'Storage': Setting the value of '"+k+"' exceeded the quota.");
    this.map.set(k,v);this.writes.push(k);this.peak=Math.max(this.peak,total);
  }
  removeItem(k){this.map.delete(k)}
  used(){return this.bytes()}
}

/* ------------------------------------------------------------------------ fixtures */
function stores(n){
  return Array.from({length:n},(_,i)=>({id:'st-'+i,enseigne:['Boulanger','Darty','Fnac','Conforama','But'][i%5],
    ville:'Ville-'+i,adresse:i+' rue de Test',dept:'38',lat:45.1+i/1000,lon:5.7+i/1000,
    active:true,priority:(i%5)+1,products:['Brun','Blanc'],freq:2}));
}
const STORES=stores(58);
function state(){
  const notes={},visits={};
  for(const s of STORES){
    notes[s.id]=('Constat terrain synthetique sur ce magasin, rayon et equipe. ').repeat(6);
    visits[s.id]=Array.from({length:8},(_,k)=>({date:'2026-0'+((k%9)+1)+'-1'+(k%9),done:true,
      note:('Compte rendu synthetique de visite avec quelques details. ').repeat(4)}));
  }
  return{schemaVersion:5,profile:{name:'Secteur Test',base:'1 rue de Test'},
    settings:{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],startTime:'08:30',endTime:'18:00',weekDate:'2026-09-28',visitMinutes:60},
    stores:structuredClone(STORES),notes,visits,included:{},excluded:{},locks:{},plan:{},appointments:[],calendarEvents:[]};
}
function archive(weeks=26){
  const a={};
  for(let w=0;w<weeks;w++){const d='2026-0'+((w%9)+1)+'-0'+((w%9)+1);
    a[d]={plan:Object.fromEntries(['Lundi','Mardi','Mercredi','Jeudi','Vendredi']
      .map(day=>[day,STORES.slice(0,6).map(s=>({id:s.id,enseigne:s.enseigne,ville:s.ville,lat:s.lat,lon:s.lon}))]))};}
  return a;
}
/* Les deux plus gros blocs, et ceux qui ne changent JAMAIS pendant une génération. */
const CATALOG=Array.from({length:1200},(_,i)=>({id:'off-'+i,enseigne:'Enseigne '+(i%40),
  ville:'Commune '+i,adresse:i+' avenue de Test',codePostal:'380'+(i%100),lat:45+i/10000,lon:5+i/10000}));
const CUISINISTE={schema:1,mapping:Object.fromEntries(Array.from({length:300},(_,i)=>['SCH-'+i,'st-'+(i%58)])),
  trackingImports:Array.from({length:6},(_,i)=>({type:'tracking',sector:'Secteur '+i,
    rows:Array.from({length:400},(_,r)=>({ref:'R-'+r,qte:r%9,ca:r*12.5,magasin:'st-'+(r%58)}))})),
  tariffImports:Array.from({length:3},(_,i)=>({type:'tariff',rows:Array.from({length:500},(_,r)=>({ref:'T-'+r,prix:r*3.2}))}))};

function bundle(){
  return{format:'ChefSecteurBackup',version:1,createdAt:'2026-09-22T10:00:00.000Z',
    state:state(),archive:archive(),range:null,catalog:structuredClone(CATALOG),
    cuisinisteContracts:structuredClone(CUISINISTE)};
}
/* Un secteur déjà installé : les cinq clés en place. */
function seeded(quota){
  const db=new DB(quota),b=bundle();
  db.setItem(K.MAIN,JSON.stringify(b.state));
  db.setItem(K.ARCHIVE,JSON.stringify(b.archive));
  db.setItem(K.CATALOG,JSON.stringify(b.catalog));
  db.setItem(K.CUISINISTE,JSON.stringify(b.cuisinisteContracts));
  db.writes.length=0;
  return db;
}
/* Ce que fait une génération de planning : seul l'état change. */
function afterPlanning(){
  const b=bundle();
  b.state.plan={Lundi:STORES.slice(0,5).map(s=>({id:s.id,enseigne:s.enseigne,ville:s.ville,lat:s.lat,lon:s.lon}))};
  b.state.settings.weekDate='2026-10-05';
  return b;
}

/* ================================================================================== */
/* 1. LA PANNE, REPRODUITE PAR LA MESURE                                              */
/* ================================================================================== */
{
  const b=bundle();
  const src={[K.MAIN]:JSON.stringify(b.state),[K.ARCHIVE]:JSON.stringify(b.archive),
    [K.CATALOG]:JSON.stringify(b.catalog),[K.CUISINISTE]:JSON.stringify(b.cuisinisteContracts)};
  const sources=Object.values(src).reduce((n,v)=>n+v.length,0);

  // Ancien comportement : le journal recopiait les cinq clés, quoi qu'il arrive.
  const journalComplet=JSON.stringify(src);
  assert(journalComplet.length>sources,
    'une chaîne JSON re-sérialisée est plus lourde que la source : chaque guillemet est échappé');
  const amplification=journalComplet.length/sources;
  assert(amplification>1.10,'surcoût d’échappement mesuré, vu x'+amplification.toFixed(2));

  // Nouveau : seules les clés réellement modifiées entrent dans le journal.
  const db=seeded(),cible=afterPlanning();
  const changed=R.plannedWrites(cible).filter(([k,next])=>db.getItem(k)!==next);
  const clefs=changed.map(([k])=>k);
  assert.deepEqual(clefs,[K.MAIN],'une génération de planning ne change que l’état');
  const journalSelectif=JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,db.getItem(k)])));
  const economie=1-journalSelectif.length/journalComplet.length;
  assert(economie>0.60,'le journal sélectif doit économiser bien plus de la moitié, vu '+(100*economie).toFixed(1)+'%');

  // Et huit sauvegardes complètes pesaient à elles seules l'essentiel du quota.
  const unBundle=JSON.stringify(b).length;
  assert(unBundle*8>0.75*5*1024*1024,'huit sauvegardes complètes dépassaient les trois quarts d’un quota de 5 Mo');

  console.log('PASS 1 · panne mesurée : sources '+ko(sources)+', journal complet '+ko(journalComplet.length)+
    ' (x'+amplification.toFixed(2)+'), journal sélectif '+ko(journalSelectif.length)+
    ' (-'+(100*economie).toFixed(1)+'%), 8 sauvegardes '+ko(unBundle*8));
}

/* ================================================================================== */
/* 2. LE SCÉNARIO TERRAIN PASSE MAINTENANT SOUS LE QUOTA                              */
/* ================================================================================== */
{
  const QUOTA=5*1024*1024;
  const db=seeded(QUOTA);
  // Historique chargé, comme sur un appareil utilisé depuis des semaines.
  for(let i=0;i<8;i++)R.checkpoint('point '+i,db,bundle());
  const avant=db.used();
  assert(avant<QUOTA,'l’historique borné doit déjà tenir dans le quota, vu '+ko(avant));

  // La génération de planning aboutit, là où elle levait « exceeded the quota ».
  R.persist(afterPlanning(),db);
  assert.equal(db.getItem(K.JOURNAL),null,'aucun journal résiduel après succès');
  assert.equal(JSON.parse(db.getItem(K.MAIN)).settings.weekDate,'2026-10-05','le planning est bien enregistré');
  assert(db.peak<QUOTA,'le pic d’occupation doit rester sous le quota, vu '+ko(db.peak));

  // Le carnet officiel et les imports cuisinistes n'ont pas été réécrits pour rien.
  assert.equal(db.writes.includes(K.CATALOG),false,'le carnet officiel inchangé ne doit pas être réécrit');
  assert.equal(db.writes.includes(K.CUISINISTE),false,'les imports cuisinistes inchangés ne doivent pas être réécrits');
  console.log('PASS 2 · génération de planning sur secteur chargé : pic '+ko(db.peak)+' sous un quota de '+ko(QUOTA));
}

/* ================================================================================== */
/* 3. UNE SEULE CLÉ MODIFIÉE : AUCUN JOURNAL — `setItem` EST ATOMIQUE                 */
/* ================================================================================== */
{
  const db=seeded();
  let journalEcrit=false;
  const espion={getItem:k=>db.getItem(k),removeItem:k=>db.removeItem(k),
    setItem:(k,v)=>{if(k===K.JOURNAL)journalEcrit=true;db.setItem(k,v)}};
  R.persist(afterPlanning(),espion);
  assert.equal(journalEcrit,false,'une écriture atomique n’a rien à annuler : pas de journal');
  assert.equal(db.getItem(K.JOURNAL),null);
  assert.equal(JSON.parse(db.getItem(K.MAIN)).settings.weekDate,'2026-10-05');

  // Plusieurs clés modifiées : le journal redevient nécessaire, et ne porte QU'ELLES.
  const db2=seeded();
  let capture=null;
  const espion2={getItem:k=>db2.getItem(k),removeItem:k=>db2.removeItem(k),
    setItem:(k,v)=>{if(k===K.JOURNAL)capture=JSON.parse(v);db2.setItem(k,v)}};
  const large=afterPlanning();large.catalog=[{id:'off-nouveau',enseigne:'Fnac',ville:'Ville-Test'}];
  R.persist(large,espion2);
  assert.deepEqual(Object.keys(capture).sort(),[K.CATALOG,K.MAIN].sort(),
    'le journal ne porte que les clés modifiées, jamais les imports cuisinistes intacts');
  assert.equal(Object.prototype.hasOwnProperty.call(capture,K.CUISINISTE),false);
  console.log('PASS 3 · clé unique sans journal, clés multiples journalisées sélectivement');
}

/* ================================================================================== */
/* 4. LE RETOUR ARRIÈRE RESTE EXACT                                                   */
/* ================================================================================== */
{
  const db=seeded();
  const avant=[K.MAIN,K.ARCHIVE,K.CATALOG,K.CUISINISTE].map(k=>db.getItem(k));
  const cible=afterPlanning();
  cible.catalog=[{id:'off-nouveau',enseigne:'Fnac',ville:'Ville-Test'}];
  cible.cuisinisteContracts=structuredClone(CUISINISTE);
  cible.cuisinisteContracts.mapping['SCH-0']='st-remappe';
  db.fail=K.MAIN;                       // la dernière écriture casse
  assert.throws(()=>R.persist(cible,db),/Enregistrement interrompu/);
  assert.deepEqual([K.MAIN,K.ARCHIVE,K.CATALOG,K.CUISINISTE].map(k=>db.getItem(k)),avant,
    'toutes les clés doivent revenir à leur valeur d’avant');
  assert.equal(db.getItem(K.JOURNAL),null,'le journal est refermé même après échec');
  console.log('PASS 4 · échec en fin de transaction : retour arrière complet, journal refermé');
}

/* ================================================================================== */
/* 5. NETTOYAGE AUTOMATIQUE D'UNE TRANSACTION RESTÉE OUVERTE                          */
/* ================================================================================== */
{
  // Un journal résiduel = une écriture interrompue. L'écraser détruirait son retour
  // arrière ; `persist` doit d'abord la terminer.
  const db=seeded();
  const etatSain=db.getItem(K.MAIN);
  db.setItem(K.JOURNAL,JSON.stringify({[K.MAIN]:etatSain}));
  db.setItem(K.MAIN,'{"corrompu":true}');   // moitié d'écriture laissée par le crash
  R.persist(afterPlanning(),db);
  assert.equal(db.getItem(K.JOURNAL),null,'la transaction résiduelle doit être refermée');
  const apres=JSON.parse(db.getItem(K.MAIN));
  assert.equal(apres.settings.weekDate,'2026-10-05','la nouvelle écriture aboutit');
  assert.equal(apres.corrompu,undefined,'la moitié d’écriture du crash précédent a bien été annulée');
  assert.equal(apres.stores.length,58,'les données saines sont revenues avant la nouvelle transaction');

  // `load` refermait déjà une transaction résiduelle au démarrage : inchangé.
  const boot=seeded();
  const sain=boot.getItem(K.MAIN);
  boot.setItem(K.JOURNAL,JSON.stringify({[K.MAIN]:sain}));
  boot.setItem(K.MAIN,'{"corrompu":true}');
  assert.equal(R.load(boot).stores.length,58);
  assert.equal(boot.getItem(K.JOURNAL),null);
  console.log('PASS 5 · transaction résiduelle terminée, jamais écrasée, au démarrage comme à l’écriture');
}

/* ================================================================================== */
/* 6. LIMITE DE TAILLE : REFUS AVANT TOUTE ÉCRITURE                                   */
/* ================================================================================== */
{
  assert.equal(R.limits.JOURNAL_MAX_BYTES,1536*1024,'la limite du journal doit rester une constante lisible');
  assert.match(SOURCE,/const JOURNAL_MAX_BYTES=/,'la limite doit vivre dans le module, pas dans un test');

  /* Le journal porte les ANCIENNES valeurs : c'est donc la taille des données DÉJÀ en
     place qui peut le faire déborder, pas celle de ce qu'on s'apprête à écrire. On
     installe donc un carnet officiel hors norme, puis on modifie deux clés. */
  const db=seeded();
  db.setItem(K.CATALOG,JSON.stringify(Array.from({length:40000},(_,i)=>
    ({id:'off-'+i,enseigne:'Enseigne '+i,ville:'Commune '+i,adresse:i+' avenue de Test'}))));
  assert(db.getItem(K.CATALOG).length>R.limits.JOURNAL_MAX_BYTES,'le carnet installé doit dépasser la limite à lui seul');
  db.writes.length=0;
  const cible=afterPlanning();
  cible.catalog=[{id:'off-nouveau',enseigne:'Fnac',ville:'Ville-Test'}];
  const avant=[K.MAIN,K.ARCHIVE,K.CATALOG,K.CUISINISTE].map(k=>db.getItem(k));
  const ecrituresAvant=db.writes.length;
  assert.throws(()=>R.persist(cible,db),/trop volumineuses|Espace insuffisant/);
  assert.deepEqual([K.MAIN,K.ARCHIVE,K.CATALOG,K.CUISINISTE].map(k=>db.getItem(k)),avant,
    'un refus ne doit toucher aucune donnée');
  assert.equal(db.writes.length,ecrituresAvant,'aucune écriture ne doit avoir eu lieu');
  assert.equal(db.getItem(K.JOURNAL),null,'aucun journal ne doit rester ouvert');
  console.log('PASS 6 · journal hors limite : refus net, données et écritures intactes');
}

/* ================================================================================== */
/* 7. REPLI PROPRE QUAND LE QUOTA EST ATTEINT                                         */
/* ================================================================================== */
{
  // Quota juste trop serré pour loger le journal en plus des sauvegardes : le module
  // doit céder des sauvegardes plutôt que refuser d'enregistrer.
  const db=seeded(Infinity);
  for(let i=0;i<6;i++)R.checkpoint('point '+i,db,bundle());
  const sauvegardesAvant=R.backups(db).length;
  assert(sauvegardesAvant>=2,'il faut plusieurs sauvegardes pour observer le repli');

  const cible=afterPlanning();
  cible.catalog=[{id:'off-nouveau',enseigne:'Fnac',ville:'Ville-Test'}];  // 2 clés -> journal requis
  const journal=JSON.stringify({[K.MAIN]:db.getItem(K.MAIN),[K.CATALOG]:db.getItem(K.CATALOG)});
  db.quota=db.used()+journal.length-1;   // il manque un octet
  R.persist(cible,db);
  assert.equal(JSON.parse(db.getItem(K.MAIN)).settings.weekDate,'2026-10-05','l’enregistrement aboutit');
  assert(R.backups(db).length<sauvegardesAvant,'une sauvegarde au moins doit avoir été cédée');
  assert.equal(db.getItem(K.JOURNAL),null,'journal refermé après succès');

  // Plus rien à céder : refus propre, données intactes.
  const serre=seeded(Infinity);
  const cible2=afterPlanning();
  cible2.catalog=[{id:'off-nouveau',enseigne:'Fnac',ville:'Ville-Test'}];
  const avant=[K.MAIN,K.CATALOG].map(k=>serre.getItem(k));
  serre.quota=serre.used();              // pas un octet de libre, aucune sauvegarde
  assert.throws(()=>R.persist(cible2,serre),/Espace insuffisant/);
  assert.deepEqual([K.MAIN,K.CATALOG].map(k=>serre.getItem(k)),avant,'les données restent intactes');
  assert.equal(serre.getItem(K.JOURNAL),null);
  console.log('PASS 7 · quota atteint : sauvegardes cédées puis succès ; sans marge, refus sans perte');
}

/* ================================================================================== */
/* 8. L'HISTORIQUE DE SAUVEGARDES EST BORNÉ EN OCTETS                                 */
/* ================================================================================== */
{
  assert.equal(R.limits.BACKUPS_MAX_BYTES,1536*1024);
  const db=seeded(Infinity);
  for(let i=0;i<8;i++)R.checkpoint('point '+i,db,bundle());
  const rows=R.backups(db);
  assert(rows.length>=1,'la sauvegarde la plus récente est toujours conservée');
  assert(db.getItem(K.BACKUPS).length<=R.limits.BACKUPS_MAX_BYTES,
    'l’historique doit tenir dans son budget, vu '+ko(db.getItem(K.BACKUPS).length));
  assert.equal(rows[0].reason,'point 7','la plus récente est en tête');

  // Un petit secteur garde bien ses huit versions : le plafond est en octets, pas en nombre.
  const petit=new DB(Infinity);
  const mini={format:'ChefSecteurBackup',version:1,createdAt:'2026-09-22T10:00:00.000Z',
    state:{schemaVersion:5,profile:{name:'P'},settings:{},stores:stores(2),notes:{},visits:{},
      included:{},excluded:{},locks:{},plan:{},appointments:[],calendarEvents:[]},archive:{},range:null};
  for(let i=0;i<10;i++)R.checkpoint('mini '+i,petit,mini);
  assert.equal(R.backups(petit).length,8,'un petit secteur conserve ses huit versions');
  console.log('PASS 8 · historique borné en octets ('+ko(db.getItem(K.BACKUPS).length)+'), huit versions gardées sur un petit secteur');
}

/* ================================================================================== */
/* 9. HYGIÈNE : AUCUNE DONNÉE TERRAIN JOURNALISÉE, CONTRATS EXISTANTS INTACTS         */
/* ================================================================================== */
{
  assert(!/console\.(log|warn|info|error)\(/.test(SOURCE),
    'le noyau fiabilité ne doit journaliser aucune donnée locale');
  assert.match(SOURCE,/function dropOldestBackup/,'le repli doit être une fonction nommée, testable');
  assert.match(SOURCE,/function openJournal/,'l’ouverture du journal doit être isolée');
  assert.match(SOURCE,/if\(db\.getItem\(JOURNAL\)!==null\)recover\(db\)/,
    'une transaction résiduelle doit être terminée avant d’en ouvrir une autre');
  // Les clés de stockage ne changent pas : les appareils déjà installés doivent relire.
  assert.equal(K.JOURNAL,'chef_recovery_transaction_v1');
  assert.equal(K.BACKUPS,'chef_recovery_backups_v1');
  assert.equal(K.MAIN,'sector_planner_universal_v1');
  console.log('PASS 9 · aucun journal sensible, clés de stockage inchangées, repli isolé et testable');
}
