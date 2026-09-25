/* V235 — partage des photos de « Sortie magasin » par lots de 10, sans doublon.

   Fixtures entièrement inventées : aucun magasin, aucune note et aucune photo réels.
   Deux niveaux sont exercés ici :
     · la lecture stricte par famille dans store-photos.js, sur un IndexedDB de fortune ;
     · le VRAI bouton de partage de visit-report-slack.js, évalué dans un `vm` avec un
       DOM minimal, pour que ce soit le code de production qui découpe les lots et
       décide d'avancer ou non — jamais une copie du raisonnement écrite dans le test.
   Le partage système n'est jamais déclenché : `navigator.share` est simulé. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const RACINE=path.join(__dirname,'..');
const CHEMIN_PHOTOS=path.join(RACINE,'store-photos.js');
const CHEMIN_RAPPORT=path.join(RACINE,'visit-report-slack.js');
const SOURCE_RAPPORT=fs.readFileSync(CHEMIN_RAPPORT,'utf8');
const MODELE=require('../store-runner-visit-model.js');

/* store-photos.js met sa connexion en cache : chaque scénario recharge le module
   pour repartir d'une base vierge, comme le fait déjà tests/store-photos-move. */
function chargerPhotos(){delete require.cache[require.resolve(CHEMIN_PHOTOS)];return require(CHEMIN_PHOTOS)}

/* ---------------------------------------------------------------------------
   IndexedDB de fortune — même harnais que tests/store-photos.test.cjs.
   --------------------------------------------------------------------------- */
function fakeIndexedDB(rows){
  const data=new Map(rows.map(r=>[String(r.id),Object.assign({},r)]));
  function makeTx(){
    const tx={oncomplete:null,onerror:null,onabort:null,abort(){if(tx.onabort)tx.onabort()}};
    let pending=0;
    function settle(fn){pending++;queueMicrotask(()=>{fn();pending--;if(!pending)setTimeout(()=>{if(!pending&&tx.oncomplete)tx.oncomplete()},0)})}
    const os={
      put(r){data.set(String(r.id),r);const req={};settle(()=>{if(req.onsuccess)req.onsuccess()});return req},
      delete(id){data.delete(String(id));const req={};settle(()=>{if(req.onsuccess)req.onsuccess()});return req},
      get(id){const req={};settle(()=>{req.result=data.get(String(id));if(req.onsuccess)req.onsuccess()});return req},
      index(){return{openCursor(range){
        const req={},matching=[...data.values()].filter(r=>String(r.storeId)===String(range.only));
        let i=0;
        const step=()=>settle(()=>{
          if(i>=matching.length){req.result=null;if(req.onsuccess)req.onsuccess();return}
          req.result={value:matching[i++],continue:step};if(req.onsuccess)req.onsuccess();
        });
        step();return req;
      }}}
    };
    tx.objectStore=()=>os;return tx;
  }
  return {open(){const req={};setTimeout(()=>{req.result={transaction:()=>makeTx(),objectStoreNames:{contains:()=>true}};if(req.onsuccess)req.onsuccess()},0);return req},__data:data};
}

/* Horodatages strictement croissants : l'ordre attendu est createdAt puis id,
   jamais l'index du tableau. */
function horodatage(n){const minute=String(n%60).padStart(2,'0'),heure=String(6+Math.floor(n/60)).padStart(2,'0');return '2026-09-20T'+heure+':'+minute+':00.000Z'}
/* V255.1 — la Sortie magasin ne partage que les photos de SA visite. Une photo prise
   pendant la visite porte son visitId : `COURANTE` est remplacé par le vrai identifiant
   quand le banc crée la visite. `visite` explicite = autre visite, ou aucune. */
const COURANTE='@visite-courante';
function photo(n,famille,magasin,visite){
  return {id:'ph-'+famille+'-'+String(n).padStart(3,'0'),storeId:magasin||'mag-235',visitId:visite===undefined?COURANTE:visite,family:famille,
          moment:n%2?'avant':'apres',createdAt:horodatage(n),type:'image/jpeg',blob:{type:'image/jpeg'}};
}
function lot(quantite,famille,depart){const debut=depart||1,out=[];for(let i=debut;i<debut+quantite;i++)out.push(photo(i,famille));return out}

/* ---------------------------------------------------------------------------
   DOM minimal — seulement ce dont la feuille « Sortie magasin » se sert.
   --------------------------------------------------------------------------- */
function makeEl(tag){
  const classes=new Set(),handlers={};let kids=[];
  const el={
    tagName:tag,id:'',className:'',type:'',hidden:false,disabled:false,readOnly:false,value:'',
    textContent:'',dataset:{},open:false,attributes:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),
      toggle(c,on){if(on===undefined){if(classes.has(c))classes.delete(c);else classes.add(c)}else if(on)classes.add(c);else classes.delete(c)}},
    get children(){return kids},
    setAttribute(k,v){el.attributes[k]=String(v)},
    getAttribute(k){return Object.prototype.hasOwnProperty.call(el.attributes,k)?el.attributes[k]:null},
    addEventListener(type,fn){(handlers[type]=handlers[type]||[]).push(fn)},
    dispatch(type){const ev={type,target:el,preventDefault(){},stopPropagation(){}};let out;for(const fn of (handlers[type]||[]).slice())out=fn(ev);return out},
    append(){for(const k of arguments)kids.push(k);return el},
    appendChild(child){kids.push(child);return child},
    replaceChildren(){kids=Array.prototype.slice.call(arguments)},
    focus(){},setSelectionRange(){},
    querySelector(sel){
      for(const k of kids){
        if(sel.charAt(0)==='#'&&k.id===sel.slice(1))return k;
        if(sel.charAt(0)==='.'&&String(k.className||'').split(/\s+/).indexOf(sel.slice(1))>=0)return k;
        const trouve=k.querySelector&&k.querySelector(sel);
        if(trouve)return trouve;
      }
      return null;
    },
    set innerHTML(html){
      kids=[];
      /* La feuille est écrite d'un bloc puis relue par querySelector : on recrée un
         enfant plat par identifiant et par classe cités dans ce balisage. */
      for(const m of String(html).matchAll(/\sid="([^"]+)"/g)){const n=makeEl('div');n.id=m[1];kids.push(n)}
      for(const m of String(html).matchAll(/\sclass="([^"]+)"/g)){const n=makeEl('div');n.className=m[1];kids.push(n)}
    },
    get innerHTML(){return ''}
  };
  return el;
}
function makeDocument(){
  const doc={readyState:'complete',_byId:{},_handlers:{}};
  doc.createElement=makeEl;
  doc.head=makeEl('head');doc.body=makeEl('body');
  doc.getElementById=id=>doc._byId[id]||null;
  doc.querySelector=()=>null;
  doc.addEventListener=(t,fn)=>{(doc._handlers[t]=doc._handlers[t]||[]).push(fn)};
  return doc;
}

/* ---------------------------------------------------------------------------
   Un banc d'essai = un magasin, ses photos, et la vraie feuille Sortie magasin.
   --------------------------------------------------------------------------- */
function banc(rows,options){
  const opts=options||{};
  const etat={schemaVersion:5,profile:{baseName:'Ville-Base'},settings:{days:['Lundi']},
    stores:[{id:'mag-235',enseigne:opts.enseigne||'Enseigne-Test',ville:'Ville-Test'}],
    notes:{},visits:{},plan:{Lundi:[]},appointments:[],calendarEvents:[]};
  etat.businessV2=MODELE.empty();
  const visitId=MODELE.start(etat,'mag-235');
  const photos=chargerPhotos();
  globalThis.indexedDB=fakeIndexedDB(rows.map(r=>r.visitId===COURANTE?Object.assign({},r,{visitId}):r));
  globalThis.IDBKeyRange={only:v=>({only:v})};
  class FakeFile{constructor(parts,name,opts){this.parts=parts;this.name=name;this.type=opts&&opts.type;this.lastModified=opts&&opts.lastModified}}
  Object.defineProperty(globalThis,'File',{configurable:true,writable:true,value:FakeFile});

  const appels=[];let reponse=null;
  const partage={
    appels,
    reussir(){reponse=null},
    annuler(){reponse=()=>{const e=new Error('Share canceled');e.name='AbortError';throw e}},
    casser(){reponse=()=>{throw new Error('Permission denied. Failed to execute share on Navigator')}}
  };
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    canShare:()=>true,
    share:async charge=>{appels.push((charge.files||[]).map(f=>f.name));if(reponse)reponse()}
  }});

  globalThis.state=etat;

  const doc=makeDocument();
  const ctx={console,JSON,Date,Math,String,Number,Boolean,Object,Array,Set,Map,RegExp,Error,Promise,Symbol,
             setTimeout,clearTimeout,queueMicrotask};
  const ia={charges:[]};
  if(opts.ia){ctx.aiConfig={gateway:'https://passerelle.invalid'};ctx.callAIGateway=async charge=>{ia.charges.push(charge);return {text:opts.ia}}}
  ctx.window=ctx;ctx.self=ctx;ctx.globalThis=ctx;
  ctx.document=doc;ctx.state=etat;ctx.StorePhotosV1=photos;ctx.StoreRunnerVisitModel=MODELE;
  vm.runInNewContext(SOURCE_RAPPORT,ctx);
  const R=ctx.window.StoreRunnerVisitReport;

  const feuille=()=>doc.body.children.filter(n=>n.id==='srReportSheet')[0];
  const bouton=()=>feuille().querySelector('#srReportSharePhotos');
  const onglet=fam=>feuille().querySelector('#srReportTabs').children.filter(b=>b.dataset.family===fam)[0];

  return {photos,partage,etat,visitId,R,doc,ia,
    genererIA:async()=>{feuille().querySelector('#srReportAI').dispatch('click');await repos()},
    ouvrir:()=>R.open(visitId),
    bouton,
    statut:()=>feuille().querySelector('#srReportStatus').textContent,
    rapport:()=>feuille().querySelector('#srReportText').value,
    libelle:()=>bouton().textContent,
    actif:()=>!bouton().disabled,
    /* Le vrai gestionnaire de clic du vrai bouton : c'est lui qui décide du lot. */
    partager:()=>bouton().dispatch('click'),
    /* Le gestionnaire d'onglet ne rend pas la promesse de `refresh()` : on laisse
       la boucle d'événements finir la relecture IndexedDB avant de relire le bouton. */
    famille:async fam=>{onglet(fam).dispatch('click');await repos()},
    noms:()=>appels.map(a=>a.slice())
  };
}
async function repos(){for(let i=0;i<6;i++)await new Promise(r=>setTimeout(r,1))}
function croisement(a,b){const vus=new Set(a);return b.filter(x=>vus.has(x))}
function aplat(listes){return [].concat.apply([],listes)}

/* ============================ 0 — lecture stricte ============================ */
async function test0(){
  const b=banc([
    {id:'brun-1',storeId:'s1',createdAt:'2026-09-20T09:00:00Z',family:'brun'},
    {id:'blanc-1',storeId:'s1',createdAt:'2026-09-20T10:00:00Z',family:'blanc'},
    {id:'nu-1',storeId:'s1',createdAt:'2026-09-20T11:00:00Z'},
    {id:'nu-2',storeId:'s1',createdAt:'2026-09-20T12:00:00Z',family:''}
  ]);
  const strictBrun=await b.photos.listStrictByFamily('s1','brun');
  const strictBlanc=await b.photos.listStrictByFamily('s1','blanc');
  assert.deepEqual(strictBrun.map(r=>r.id),['brun-1'],'BRUN strict ne prend que les photos marquées brun');
  assert.deepEqual(strictBlanc.map(r=>r.id),['blanc-1'],'BLANC strict ne prend que les photos marquées blanc');
  assert.deepEqual(croisement(strictBrun.map(r=>r.id),strictBlanc.map(r=>r.id)),[],'aucune photo commune aux deux familles');
  assert.deepEqual(await b.photos.listStrictByFamily('s1',''),[],'sans famille demandée, la lecture stricte ne rend rien');

  /* Non-régression : le contrat global de listByFamily ne bouge pas, la galerie et
     l'affichage historique continuent de voir les photos non étiquetées. */
  const large=await b.photos.listByFamily('s1','brun');
  assert.deepEqual(large.map(r=>r.id).sort(),['brun-1','nu-1','nu-2'],'listByFamily garde son contrat historique');
  const donnees=[...globalThis.indexedDB.__data.values()];
  assert.equal(donnees.length,4,'une lecture ne supprime aucun enregistrement');
  assert.deepEqual(donnees.filter(r=>!r.family).map(r=>r.id).sort(),['nu-1','nu-2'],'les photos non classées gardent leur famille vide');
  console.log('  0 · lecture stricte par famille : ok');
}

/* ======================= 1 — 20 BRUN : deux lots de 10 ======================= */
async function test1(){
  const b=banc(lot(20,'brun'));
  await b.ouvrir();
  assert.equal(b.libelle(),'Partager 10 / 20 photos BRUN','le bouton annonce la découpe avant le premier partage');
  assert.equal(b.actif(),true);

  await b.partager();
  const premier=b.noms()[0];
  assert.equal(premier.length,10,'le premier appel de partage porte exactement 10 fichiers');
  assert.equal(b.libelle(),'Partager les 10 suivantes · 10 restantes');
  assert.match(b.statut(),/^10 photos BRUN partagées · 10 restantes$/);

  await b.partager();
  const second=b.noms()[1];
  assert.equal(second.length,10,'le second appel porte lui aussi exactement 10 fichiers');
  assert.deepEqual(croisement(premier,second),[],'aucun fichier commun entre le lot 1 et le lot 2');
  assert.equal(b.libelle(),'Toutes les photos BRUN ont été partagées');
  assert.equal(b.actif(),false,'le bouton se désactive quand la famille est épuisée');

  await b.partager();
  assert.equal(b.noms().length,2,'un clic de plus ne relance aucun partage');
  console.log('  1 · 20 BRUN → 10 + 10, sans recouvrement : ok');
}

/* ==================== 2 — 31 BRUN : 10 / 10 / 10 / 1 ======================== */
async function test2(){
  const b=banc(lot(31,'brun'));
  await b.ouvrir();
  assert.equal(b.libelle(),'Partager 10 / 31 photos BRUN');
  await b.partager();
  assert.equal(b.libelle(),'Partager les 10 suivantes · 21 restantes');
  await b.partager();
  assert.equal(b.libelle(),'Partager les 10 suivantes · 11 restantes');
  await b.partager();
  assert.equal(b.libelle(),'Partager la dernière photo BRUN');
  await b.partager();
  assert.equal(b.libelle(),'Toutes les photos BRUN ont été partagées');
  assert.equal(b.actif(),false);

  const lots=b.noms();
  assert.deepEqual(lots.map(l=>l.length),[10,10,10,1],'la découpe attendue est 10 / 10 / 10 / 1');
  const tous=aplat(lots);
  assert.equal(tous.length,31,'31 photos envoyées au total');
  assert.equal(new Set(tous).size,31,'aucun doublon sur l’ensemble des quatre appels');
  console.log('  2 · 31 BRUN → 10/10/10/1, 31 fichiers distincts : ok');
}

/* ================= 3 — annulation Android : la file n'avance pas ============= */
async function test3(){
  const b=banc(lot(20,'brun'));
  await b.ouvrir();
  b.partage.annuler();
  await b.partager();
  assert.equal(b.statut(),'Partage annulé.','AbortError doit dire « Partage annulé. »');
  assert.equal(b.libelle(),'Partager 10 / 20 photos BRUN','une annulation ne fait pas avancer la progression');
  assert.equal(b.actif(),true);

  b.partage.reussir();
  await b.partager();
  const refuse=b.noms()[0],repris=b.noms()[1];
  assert.equal(repris.length,10);
  assert.deepEqual(repris,refuse,'le clic suivant repropose exactement le même lot');

  /* Une erreur réelle ne consomme rien non plus, et ne dit plus « Permission denied ». */
  b.partage.casser();
  await b.partager();
  assert.equal(b.statut(),'Partage impossible sur cet appareil. Réessaie ce lot ou ouvre Photos magasin.');
  assert.equal(b.libelle(),'Partager les 10 suivantes · 10 restantes','une erreur réelle laisse le même lot à envoyer');

  b.partage.reussir();
  await b.partager();
  const noms=b.noms();
  assert.deepEqual(croisement(noms[0],noms[noms.length-1]),[],'le lot 2 ne reprend jamais le lot 1');
  assert.equal(new Set(aplat([noms[1],noms[noms.length-1]])).size,20,'les deux lots réellement partis couvrent les 20 photos');
  console.log('  3 · annulation et erreur réelle : progression intacte : ok');
}

/* ============ 4 — 12 BRUN + 7 BLANC + 4 sans famille : séparation ============ */
async function test4(){
  const nonClassees=[1,2,3,4].map(n=>({id:'ph-nu-'+n,storeId:'mag-235',visitId:COURANTE,family:'',
    createdAt:'2026-09-20T0'+n+':30:00.000Z',type:'image/jpeg',blob:{type:'image/jpeg'}}));
  const b=banc([].concat(lot(12,'brun'),lot(7,'blanc'),nonClassees));
  await b.ouvrir();
  assert.equal(b.libelle(),'Partager 10 / 12 photos BRUN','BRUN ne compte que ses 12 photos');
  await b.partager();
  await b.partager();
  const brun=aplat(b.noms());
  assert.equal(brun.length,12,'BRUN partage exactement ses 12 photos');
  assert.equal(b.libelle(),'Toutes les photos BRUN ont été partagées');

  await b.famille('blanc');
  assert.equal(b.libelle(),'Partager les 7 photos BLANC','BLANC ne compte que ses 7 photos');
  await b.partager();
  const blanc=aplat(b.noms().slice(2));
  assert.equal(blanc.length,7,'BLANC partage exactement ses 7 photos');
  assert.equal(b.libelle(),'Toutes les photos BLANC ont été partagées');

  assert.deepEqual(croisement(brun,blanc),[],'aucun fichier commun entre BRUN et BLANC');
  const tous=brun.concat(blanc);
  assert.equal(tous.filter(n=>n.indexOf('_brun_')>=0).length,12);
  assert.equal(tous.filter(n=>n.indexOf('_blanc_')>=0).length,7);
  assert.equal(tous.length,19,'les 4 photos non classées n’apparaissent dans aucun lot');
  assert.equal(new Set(tous).size,19,'et aucun nom n’est envoyé deux fois');
  console.log('  4 · familles séparées, non classées exclues : ok');
}

/* ================ 5 — changer d'onglet garde deux files distinctes =========== */
async function test5(){
  const b=banc([].concat(lot(20,'brun'),lot(7,'blanc')));
  await b.ouvrir();
  await b.partager();
  const brun1=b.noms()[0];
  assert.equal(brun1.length,10);

  await b.famille('blanc');
  assert.equal(b.libelle(),'Partager les 7 photos BLANC','BLANC démarre sa propre progression à zéro');
  await b.partager();
  const blanc1=b.noms()[1];
  assert.equal(blanc1.length,7);
  assert.equal(b.libelle(),'Toutes les photos BLANC ont été partagées');

  await b.famille('brun');
  assert.equal(b.libelle(),'Partager les 10 suivantes · 10 restantes','BRUN reprend là où il s’était arrêté');
  await b.partager();
  const brun2=b.noms()[2];
  assert.equal(brun2.length,10,'BRUN reprend bien les photos 11 à 20');
  assert.deepEqual(croisement(brun1,brun2),[],'jamais deux fois la même photo BRUN');
  assert.deepEqual(croisement(brun2,blanc1),[],'les deux files ne se mélangent pas');
  console.log('  5 · onglets BLANC / BRUN : files séparées : ok');
}

/* ====== 6 — photos ajoutées pendant la visite, et réouverture du CR ========== */
async function test6(){
  const b=banc(lot(12,'brun'));
  await b.ouvrir();
  await b.partager();
  const lot1=b.noms()[0];

  /* Trois photos BRUN arrivent après le début du partage. */
  for(const p of lot(3,'brun',90))globalThis.indexedDB.__data.set(p.id,Object.assign(p,{visitId:b.visitId}));

  /* Rouvrir le compte rendu ne remet pas la progression à zéro. */
  await b.ouvrir();
  assert.equal(b.libelle(),'Partager les 5 suivantes · 5 restantes','2 restantes + 3 nouvelles, et rien de déjà parti');
  await b.partager();
  const lot2=b.noms()[1];
  assert.equal(lot2.length,5);
  assert.deepEqual(croisement(lot1,lot2),[],'les nouvelles photos s’ajoutent à la fin, sans réinsérer les IDs partis');
  assert.equal(b.libelle(),'Toutes les photos BRUN ont été partagées');

  const restantes=[...globalThis.indexedDB.__data.values()];
  assert.equal(restantes.length,15,'aucune photo n’est supprimée après un partage');
  assert.ok(restantes.every(r=>!('shared' in r)),'aucun champ « partagée » n’est écrit dans les photos');
  console.log('  6 · nouvelles photos et réouverture du CR : ok');
}

/* ============== 7 — aucune photo, et compte rendu resté cohérent ============= */
async function test7(){
  const b=banc(lot(3,'blanc'));
  await b.ouvrir();
  assert.equal(b.libelle(),'Aucune photo BRUN pour cette visite.','BRUN vide le dit clairement');
  assert.equal(b.actif(),false);
  await b.partager();
  assert.equal(b.noms().length,0,'un bouton désactivé ne déclenche aucun partage');

  await b.famille('blanc');
  assert.equal(b.libelle(),'Partager les 3 photos BLANC','un seul lot garde la formulation historique');
  /* Le compte rendu compte les mêmes photos que celles qui partiront. */
  assert.match(b.rapport(),/3 jointes|2 avant \/ 1 après jointes/,'le CR compte les photos strictement BLANC');
  await b.partager();
  assert.equal(b.noms()[0].length,3);
  assert.equal(b.libelle(),'Toutes les photos BLANC ont été partagées');
  console.log('  7 · famille vide et lot unique : ok');
}

/* =================== 8 — contrat de source, non négociable ================== */
function test8(){
  const src=SOURCE_RAPPORT;
  assert.ok(src.includes('const SHARE_BATCH_MAX=10;'),'le lot maximum doit rester de 10 photos');
  assert.ok(src.includes('api.listStrictByFamily(storeId,family)'),'la Sortie magasin lit la famille en strict');
  assert.equal(src.split('photosFor(v.storeId,v.id,activeTab,merged)').length-1,3,'texte local, charge IA et partage lisent tous les photos de la visite');
  assert.ok(!/photosFor\(v\.storeId,activeTab/.test(src),'plus aucune lecture des photos du magasin entier');
  assert.ok(src.includes('return ofVisit(rows,visitId)'),'le filtre de visite s’applique à toutes les lectures');
  assert.ok(src.includes('nextShareBatch(rows,done,SHARE_BATCH_MAX)'),'le partage passe par la file de lots');
  assert.ok(src.includes('api.shareRecords(batch)'),'seul le lot courant part au partage système');
  assert.ok(!/shareRecords\(rows\)/.test(src),'la totalité des photos ne doit plus partir en un seul appel');
  /* La progression ne peut avancer qu'après la promesse résolue : le commit doit
     vivre dans le `if(result===…)`, jamais avant l'await ni dans le catch. */
  const bloc=src.slice(src.indexOf('const result=await api.shareRecords(batch)'));
  const posCommit=bloc.indexOf('commitSharedBatch('),posCatch=bloc.indexOf('}catch(e){');
  assert.ok(posCommit>0&&posCatch>0&&posCommit<posCatch,'la progression doit être enregistrée après le partage résolu, avant le catch');
  assert.ok(!/catch\(e\)\{[^}]*commitSharedBatch/.test(src),'une erreur ne doit jamais marquer un lot comme parti');
  /* Rien de permanent : la progression reste en mémoire. */
  assert.ok(!/localStorage|indexedDB/.test(src),'la progression de partage ne doit pas être persistée');
  assert.ok(!/updateTags\(|removeRecord\(/.test(src),'la Sortie magasin ne modifie ni ne supprime aucune photo');
  assert.ok(!/new MutationObserver|setInterval\s*\(/.test(src),'aucune surveillance permanente ajoutée');
  const photosSrc=fs.readFileSync(CHEMIN_PHOTOS,'utf8');
  assert.ok(photosSrc.includes('async function listStrictByFamily(storeId,family)'),'store-photos doit exposer la lecture stricte');
  assert.ok(photosSrc.includes("return !f||f===String(family||'')"),'listByFamily garde son contrat historique pour la galerie');
  console.log('  8 · contrat de source : ok');
}

/* ======= 9 — V255.1 : seules les photos de la visite courante partent ======= */
async function test9(){
  const ancienne=[1,2,3,4].map(n=>photo(40+n,'brun',undefined,'visite-ancienne'));
  const sansVisite=[
    Object.assign(photo(61,'brun'),{visitId:undefined}),        // d'avant V255 : pas de champ du tout
    Object.assign(photo(62,'brun',undefined,'')),
    Object.assign(photo(63,'brun',undefined,null)),
    Object.assign(photo(64,'blanc',undefined,null))
  ];
  delete sansVisite[0].visitId;
  const autreMagasin=[photo(70,'brun','mag-autre')];
  const b=banc([].concat(lot(3,'brun'),lot(2,'blanc',10),ancienne,sansVisite,autreMagasin),{ia:
    'Résumé BRUN\n\nPassage terrain reformulé à partir des seules notes de la visite, avec les photos de cette visite uniquement.\n\nFormation / prochain passage\n\nRevoir le mural au prochain passage.'});
  const avant=[...globalThis.indexedDB.__data.values()].map(r=>JSON.stringify(r)).sort();
  await b.ouvrir();
  assert.equal(b.libelle(),'Partager les 3 photos BRUN','BRUN ne compte que les 3 photos de la visite');
  assert.match(b.rapport(),/\*\*Photos :\*\* 2 avant \/ 1 après jointes à ce message\./,'le CR local compte les mêmes 3 photos');
  await b.genererIA();
  assert.equal(b.ia.charges.length,1,'la génération IA est bien partie');
  assert.deepEqual(JSON.parse(JSON.stringify(b.ia.charges[0].context.visit.photos)),{total:3,before:2,after:1,other:0},'la charge IA ne compte que la visite');
  await b.partager();
  const brun=b.noms()[0];
  assert.equal(brun.length,3,'3 fichiers BRUN, pas 3 + 4 anciens + 3 sans visite');
  assert.equal(b.libelle(),'Toutes les photos BRUN ont été partagées');

  await b.famille('blanc');
  assert.equal(b.libelle(),'Partager les 2 photos BLANC','BLANC ne compte que les 2 photos de la visite');
  await b.partager();
  const blanc=b.noms()[1];
  assert.equal(blanc.length,2);
  /* Les noms portent l'horodatage : on retrouve exactement les photos attendues. */
  const attendus=lot(3,'brun').concat(lot(2,'blanc',10)).map(r=>r.createdAt.replace(/[:.]/g,'-').replace('T','_').replace('Z',''));
  const partis=brun.concat(blanc);
  assert.equal(partis.length,5);
  for(const stamp of attendus)assert.equal(partis.filter(n=>n.includes(stamp)).length,1,'photo de la visite partagée une seule fois : '+stamp);
  const exclus=ancienne.concat(sansVisite,autreMagasin).map(r=>r.createdAt.replace(/[:.]/g,'-').replace('T','_').replace('Z',''));
  for(const stamp of exclus)assert.ok(!partis.some(n=>n.includes(stamp)),'jamais une photo d’une autre visite ou sans visitId : '+stamp);
  const apres=[...globalThis.indexedDB.__data.values()].map(r=>JSON.stringify(r)).sort();
  assert.deepEqual(apres,avant,'aucune photo n’est modifiée, rattachée ni supprimée par la Sortie magasin');
  console.log('  9 · visite courante seule, anciennes visites et photos sans visitId exclues : ok');
}

/* === 10 — compte rendu fusionné : toutes familles, mais la visite seulement === */
async function test10(){
  const vide=banc([photo(1,'brun',undefined,'visite-ancienne'),Object.assign(photo(2,'blanc'),{visitId:null})],{enseigne:'Schmidt'});
  await vide.ouvrir();
  assert.equal(vide.libelle(),'Aucune photo pour cette visite.','le magasin a des photos, mais aucune de cette visite');
  assert.equal(vide.actif(),false);
  await vide.partager();
  assert.equal(vide.noms().length,0,'rien ne part');

  const b=banc([].concat(lot(2,'brun'),lot(1,'blanc',5),[photo(6,'')],[photo(7,'brun',undefined,'visite-ancienne')],[Object.assign(photo(8,''),{visitId:null})]),{enseigne:'Schmidt'});
  await b.ouvrir();
  assert.equal(b.libelle(),'Partager les 4 photos','fusionné : les 4 photos de la visite, familles confondues');
  await b.partager();
  assert.equal(b.noms()[0].length,4);
  assert.equal(b.libelle(),'Toutes les photos ont été partagées');
  console.log('  10 · compte rendu fusionné limité à la visite : ok');
}

function fatal(e){console.error(e);process.exit(1)}

(async function main(){
  await test0();await test1();await test2();await test3();
  await test4();await test5();await test6();await test7();test8();
  await test9();await test10();
  console.log('partage photo V235 / V255.1 : lots de 10, familles strictes, visite courante seule, aucun doublon · ok');
})().catch(fatal);
