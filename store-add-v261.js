/* Store Runner V261 — une seule porte pour ajouter un magasin : chercher → choisir → ajouter.

   Propriétaire unique de l'ajout d'un magasin au secteur. Le noyau (`openStore()` sans
   identifiant, `openStoreCreation(drafts)`), l'assistant, l'import IA et le pilotage
   performance ouvrent tous ce même écran.

   Source : Nominatim (OpenStreetMap), interrogé à la demande, uniquement quand
   l'utilisateur valide sa recherche. Aucune base de magasins n'est embarquée ni mise en
   cache : seuls les résultats de la session restent en mémoire. Politique Nominatim
   respectée — pas d'autocomplétion, au plus une requête par seconde, en-tête Referer du
   navigateur, attribution OpenStreetMap affichée. Aucune clé, aucun proxy.

   L'enregistrement passe par `RegionStores.commit` : sauvegarde préalable, validation,
   écriture atomique, et refus des doublons certains. Le magasin ajouté garde la forme
   historique (`freq`, `intervalDays`, `priority`, `active`, `products`) : planning,
   visites, photos, opportunités et pilotage le voient immédiatement. */
(function(root,factory){
  const api=factory(root);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root&&root.document){root.StoreRunnerStoreAdd=api;api.install()}
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const NOMINATIM='https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS=1100;      /* politique Nominatim : une requête par seconde au plus */
const TIMEOUT_MS=9000;
const MAX_RESULTS=6;
const NEAR_SAME_STORE_M=250;     /* même enseigne à moins de 250 m : c'est le même magasin */
const NEAR_PROBABLE_M=2500;      /* même enseigne dans la même zone commerciale */
const POI_CATEGORIES=['shop','amenity','craft','office'];
const AREA_TYPES=['country','state','region','province','county','municipality','city','town','village','hamlet','suburb','quarter','neighbourhood','postcode','administrative','island','locality','city_block','borough','district'];
const KNOWN_BRANDS=['Boulanger','Darty','Fnac','Conforama','Cuisinella','Carrefour','Schmidt','Electro Dépôt','But','Auchan','E.Leclerc','Leclerc','Mobalpa','Ixina','Cuisine Plus','SoCoo’c','Arthur Bonnet','Lapeyre','Castorama','Leroy Merlin','Ikea','Intermarché','Hyper U','Super U','Gitem','Pulsat','Proxi Confort','Copra'];

let lastRequestAt=0,requestSeq=0,controller=null;
const memory=new Map();

function text(v){return String(v==null?'':v).replace(/\s+/g,' ').trim()}
function norm(v){return text(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function finite(v){return v!==null&&v!==''&&v!==undefined&&Number.isFinite(Number(v))}
function hasCoords(s){return !!s&&finite(s.lat)&&finite(s.lon)}
function distanceMeters(a,b){
  if(!hasCoords(a)||!hasCoords(b))return null;
  const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLon=(b.lon-a.lon)*r;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function currentStores(){return (root.state&&Array.isArray(root.state.stores))?root.state.stores:[]}

/* L'enseigne d'un résultat. On réutilise d'abord le libellé déjà présent dans le secteur
   (« Darty » et non « DARTY ») pour que filtres, horaires d'enseigne et pilotage restent
   groupés sous le même nom. */
function brandLabels(stores){
  const out=[],seen=new Set();
  for(const label of (stores||[]).map(s=>text(s&&s.enseigne)).concat(KNOWN_BRANDS)){const k=norm(label);if(k&&!seen.has(k)){seen.add(k);out.push(label)}}
  return out.sort((a,b)=>norm(b).length-norm(a).length);
}
function detectBrand(name,tagBrand,stores){
  const labels=brandLabels(stores);
  const tag=text(tagBrand);
  if(tag){const k=norm(tag),hit=labels.find(l=>norm(l)===k);return hit||tag}
  const n=norm(name);
  if(!n)return '';
  const hit=labels.find(l=>{const k=norm(l);return n===k||n.indexOf(k+' ')===0});
  return hit||text(name);
}

/* Recherche : paramètres Nominatim. Le secteur (point de départ ou centre des magasins)
   sert seulement à classer les résultats proches en premier, jamais à les filtrer. */
function sectorCenter(state){
  const p=state&&state.profile;
  if(p&&finite(p.baseLat)&&finite(p.baseLon))return{lat:Number(p.baseLat),lon:Number(p.baseLon)};
  const pts=((state&&state.stores)||[]).filter(hasCoords);
  if(!pts.length)return null;
  return{lat:pts.reduce((t,s)=>t+Number(s.lat),0)/pts.length,lon:pts.reduce((t,s)=>t+Number(s.lon),0)/pts.length};
}
function searchUrl(query,center){
  const p=new URLSearchParams({format:'jsonv2',q:text(query),countrycodes:'fr','accept-language':'fr',addressdetails:'1',extratags:'1',namedetails:'1',limit:'10',dedupe:'1'});
  if(center)p.set('viewbox',[center.lon-0.9,center.lat+0.6,center.lon+0.9,center.lat-0.6].map(n=>n.toFixed(4)).join(','));
  return NOMINATIM+'/search?'+p.toString();
}
function addressUrl(adresse,ville){
  const p=new URLSearchParams({format:'jsonv2',street:text(adresse),city:text(ville),countrycodes:'fr','accept-language':'fr',addressdetails:'1',limit:'1'});
  return NOMINATIM+'/search?'+p.toString();
}

function cityOf(a){return text(a.city||a.town||a.village||a.municipality||a.hamlet||a.suburb||'')}
function streetOf(a){const road=a.road||a.pedestrian||a.footway||a.square||a.place||a.retail||a.commercial||'';return text([a.house_number,road].filter(Boolean).join(' '))}
function deptOf(cp){
  if(typeof root.deptFromPostal==='function')return root.deptFromPostal(cp);
  const v=text(cp).toUpperCase();return /^\d{5}$/.test(v)?(v.slice(0,2)==='97'?v.slice(0,3):v.slice(0,2)):'';
}
function cleanPhone(v){const t=text(String(v||'').split(';')[0]);return /^[+0-9 ().-]{6,24}$/.test(t)?t:''}
function cleanWebsite(v){const t=text(String(v||'').split(';')[0]);return /^https?:\/\/[^\s]+$/i.test(t)?t:''}

/* Un résultat Nominatim → candidat. `kind` vaut « store » (établissement nommé) ou
   « address » (adresse seule : le nom sera demandé). Les zones (villes, régions…) sont
   écartées : ce ne sont pas des magasins. */
function candidateFrom(row,stores){
  if(!row||!finite(row.lat)||!finite(row.lon))return null;
  const a=row.address||{},x=row.extratags||{},names=row.namedetails||{};
  const category=text(row.category||row.class),type=text(row.type);
  const name=text(row.name||names.name||'');
  const isPoi=POI_CATEGORIES.includes(category)&&!!name;
  if(!isPoi&&(category==='boundary'||category==='place'&&AREA_TYPES.includes(type)||AREA_TYPES.includes(row.addresstype)))return null;
  const ville=cityOf(a),adresse=streetOf(a)||text(String(row.display_name||'').split(',').slice(isPoi?1:0,isPoi?3:2).join(','));
  if(!ville||!adresse)return null;
  const osmType=text(row.osm_type),osmId=text(row.osm_id);
  const base={
    id:osmType&&osmId?'osm-'+osmType+'-'+osmId:'',
    adresse:adresse,codePostal:text(a.postcode),ville:ville,dept:deptOf(a.postcode),
    lat:Number(row.lat),lon:Number(row.lon),
    source:'Recherche OpenStreetMap',
    sourceUrl:osmType&&osmId?'https://www.openstreetmap.org/'+osmType+'/'+osmId:'',
  };
  if(!isPoi)return{kind:'address',store:base};
  const enseigne=detectBrand(name,x.brand||names.brand,stores);
  const store=Object.assign(base,{enseigne:enseigne,sourceName:name});
  const phone=cleanPhone(x.phone||x['contact:phone']),website=cleanWebsite(x.website||x['contact:website']);
  if(phone)store.phone=phone;
  if(website)store.website=website;
  return{kind:'store',store:store};
}
function candidatesFrom(rows,stores){
  const out=[],seen=new Set();
  for(const row of Array.isArray(rows)?rows:[]){
    const c=candidateFrom(row,stores);if(!c)continue;
    const key=c.store.id||norm((c.store.sourceName||'')+' '+c.store.adresse+' '+c.store.ville);
    if(seen.has(key))continue;seen.add(key);out.push(c);
  }
  /* Les établissements passent devant les adresses ; l'ordre de pertinence de la source
     est conservé à l'intérieur de chaque groupe. */
  return out.filter(c=>c.kind==='store').concat(out.filter(c=>c.kind==='address')).slice(0,MAX_RESULTS);
}

/* Doublons. « same » = le même magasin (même fiche OpenStreetMap, ou la règle historique
   de RegionStores : même enseigne à proximité immédiate ou à la même adresse). Il n'est
   jamais ajouté. « probable » = même enseigne dans la même ville ou la même zone : on
   prévient, l'utilisateur ouvre la fiche existante ou confirme explicitement. */
function findDuplicate(candidate,stores){
  let probable=null;
  const c=candidate||{},cb=norm(c.enseigne),cn=norm(c.sourceName);
  for(const s of stores||[]){
    if(!s)continue;
    if(c.id&&String(s.id)===String(c.id))return{level:'same',store:s};
    if(c.sourceUrl&&s.sourceUrl&&s.sourceUrl===c.sourceUrl)return{level:'same',store:s};
    const sameBrand=!!cb&&norm(s.enseigne)===cb,d=distanceMeters(c,s);
    const sameAddress=!!norm(c.adresse)&&norm(c.adresse)===norm(s.adresse)&&norm(c.ville)===norm(s.ville);
    if(sameBrand&&((d!==null&&d<NEAR_SAME_STORE_M)||sameAddress))return{level:'same',store:s};
    if(!probable&&(
      (sameBrand&&!!norm(c.ville)&&norm(c.ville)===norm(s.ville))||
      (sameBrand&&d!==null&&d<NEAR_PROBABLE_M)||
      (!!cn&&cn===norm(s.sourceName||(s.enseigne+' '+s.ville)))||
      (sameAddress&&d!==null&&d<NEAR_SAME_STORE_M)
    ))probable={level:'probable',store:s};
  }
  return probable;
}

/* Brouillons (import IA, pilotage performance) → texte de recherche prérempli. */
function draftQuery(draft){
  const d=draft||{},parts=[];
  for(const v of [d.enseigne,d.sourceName||d.nom||d.name,d.adresse,d.ville]){
    const t=text(v);if(!t)continue;
    const joined=norm(parts.join(' ')),n=norm(t);
    if(joined.indexOf(n)>=0)continue;
    if(parts.length&&n.indexOf(norm(parts[parts.length-1]))===0){parts[parts.length-1]=t;continue}
    parts.push(t);
  }
  return parts.join(' ');
}

/* Le magasin tel qu'il sera enregistré : forme historique, valeurs par défaut identiques
   à l'ancien parcours, aucun champ inventé. */
function finalizeStore(store,stores){
  const s=JSON.parse(JSON.stringify(store||{}));
  s.enseigne=text(s.enseigne)||detectBrand(s.sourceName,'',stores);
  s.sourceName=text(s.sourceName)||text(s.enseigne+' '+s.ville);
  s.ville=text(s.ville);s.adresse=text(s.adresse);s.codePostal=text(s.codePostal);
  s.dept=text(s.dept)||deptOf(s.codePostal);
  s.lat=Number(s.lat);s.lon=Number(s.lon);
  if(!s.id)s.id=typeof root.newId==='function'?root.newId():'u'+Date.now()+'_'+Math.floor(Math.random()*10000);
  s.freq='Mensuel';s.intervalDays=30;s.priority=3;s.active=true;s.products=['À confirmer'];
  s.channel=typeof root.storeChannel==='function'?root.storeChannel(s):(/^(schmidt|cuisinella)$/.test(norm(s.enseigne))?'cuisiniste':'retail');
  s.sourceFetchedAt=new Date().toISOString();
  return s;
}

/* ------------------------------------------------------------------ réseau */
function isOffline(){return !!(root.navigator&&root.navigator.onLine===false)}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function friendlyError(e){
  const code=e&&e.code;
  if(code==='OFFLINE')return 'La recherche nécessite une connexion Internet.';
  if(code==='TIMEOUT')return 'La recherche prend trop de temps. Réessaie dans un instant.';
  if(code==='BUSY')return 'Le service de recherche est très sollicité. Réessaie dans quelques secondes.';
  return 'Impossible de joindre le service de recherche. Vérifie ta connexion et réessaie.';
}
function fail(code){const e=new Error(code);e.code=code;return e}
async function fetchJson(url){
  if(isOffline())throw fail('OFFLINE');
  const own=new AbortController();controller=own;
  const gap=MIN_INTERVAL_MS-(Date.now()-lastRequestAt);
  if(gap>0)await wait(gap);
  if(own.signal.aborted)throw fail('ABORTED');
  lastRequestAt=Date.now();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;own.abort()},TIMEOUT_MS);
  try{
    const r=await root.fetch(url,{signal:own.signal,cache:'no-store',referrerPolicy:'strict-origin-when-cross-origin'});
    if(r.status===429)throw fail('BUSY');
    if(!r.ok)throw fail('HTTP');
    return await r.json();
  }catch(e){
    if(e&&e.code)throw e;
    if(timedOut)throw fail('TIMEOUT');
    if(own.signal.aborted)throw fail('ABORTED');
    throw fail(isOffline()?'OFFLINE':'NETWORK');
  }finally{clearTimeout(timer);if(controller===own)controller=null}
}
async function search(query){
  const q=text(query),key=norm(q);
  if(memory.has(key))return memory.get(key);
  const rows=await fetchJson(searchUrl(q,sectorCenter(root.state)));
  const results=candidatesFrom(rows,currentStores());
  memory.set(key,results);
  if(memory.size>30)memory.delete(memory.keys().next().value);
  return results;
}
async function locateAddress(adresse,ville){
  const rows=await fetchJson(addressUrl(adresse,ville));
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row||!finite(row.lat)||!finite(row.lon))return null;
  const a=row.address||{};
  return{lat:Number(row.lat),lon:Number(row.lon),codePostal:text(a.postcode),ville:cityOf(a)||text(ville)};
}
function currentPosition(){
  return new Promise((resolve,reject)=>{
    const g=root.navigator&&root.navigator.geolocation;
    if(!g){reject(fail('NO_GPS'));return}
    g.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),e=>reject(fail(e&&e.code===1?'GPS_DENIED':'GPS')),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  });
}

/* ------------------------------------------------------------------ interface */
const CSS=`
#storeAddDlg{box-sizing:border-box;width:min(480px,calc(100vw - 24px));max-width:none;max-height:min(760px,calc(100dvh - 24px));padding:0;border:0;border-radius:24px;background:#fbfbfd;color:#1d1d1f;box-shadow:0 30px 80px rgba(15,23,42,.28);overflow:hidden}
#storeAddDlg[open]{display:flex;flex-direction:column}
#storeAddDlg::backdrop{background:rgba(15,23,42,.36);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
#storeAddDlg *{box-sizing:border-box}
#storeAddDlg [hidden]{display:none!important}
#storeAddDlg .sraHead{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:14px 12px 6px;flex:0 0 auto}
#storeAddDlg .sraHead h2{margin:0;font-size:17px;font-weight:700;letter-spacing:-.01em;text-align:center;white-space:nowrap}
#storeAddDlg .sraNav{justify-self:start;min-height:44px;padding:0 8px;border:0;background:none;color:#0a66d8;font-size:16px;font-weight:500;border-radius:12px;box-shadow:none;width:auto;height:auto}
#storeAddDlg .sraBody{flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:10px 20px calc(22px + env(safe-area-inset-bottom))}
#storeAddDlg .sraProgress{display:flex;justify-content:space-between;align-items:center;margin:0 0 10px;font-size:13px;color:#6e6e73}
#storeAddDlg .sraProgress button{min-height:36px;border:0;background:none;color:#0a66d8;font-size:14px;padding:0 4px;box-shadow:none;width:auto;height:auto}
#storeAddDlg .sraLabel{display:block;margin:14px 0 10px;font-size:26px;font-weight:700;letter-spacing:-.025em;line-height:1.15;color:#1d1d1f}
#storeAddDlg .sraField{position:relative}
#storeAddDlg input[type=search],#storeAddDlg input[type=text]{display:block;width:100%;height:52px;min-height:52px;margin:0;padding:0 16px;border:1px solid #d2d2d7;border-radius:14px;background:#fff;color:#1d1d1f;font-size:17px;accent-color:auto;-webkit-appearance:none;appearance:none}
#storeAddDlg input[type=search]{padding-right:48px}
#storeAddDlg input:focus{outline:none;border-color:#0a66d8;box-shadow:0 0 0 4px rgba(10,102,216,.14)}
#storeAddDlg .sraSpinner{position:absolute;right:16px;top:50%;width:20px;height:20px;margin-top:-10px;border:2px solid #d2d2d7;border-top-color:#0a66d8;border-radius:50%;animation:sraSpin .8s linear infinite}
@keyframes sraSpin{to{transform:rotate(360deg)}}
#storeAddDlg .sraPrimary{display:block;width:100%;min-height:52px;margin:16px 0 0;padding:0 18px;border:0;border-radius:14px;background:#0a66d8;color:#fff;font-size:17px;font-weight:600;box-shadow:none;height:auto}
#storeAddDlg .sraPrimary:disabled{opacity:.45}
#storeAddDlg .sraLink{display:block;width:100%;min-height:48px;margin:6px 0 0;border:0;background:none;color:#0a66d8;font-size:16px;font-weight:500;box-shadow:none;height:auto;padding:0}
#storeAddDlg .sraStatus{min-height:20px;margin:12px 2px 0;font-size:15px;line-height:1.4;color:#6e6e73}
#storeAddDlg .sraStatus.sraWarn{color:#b25000}
#storeAddDlg .sraResults{list-style:none;margin:10px 0 0;padding:0;border-radius:16px;background:#fff;overflow:hidden;border:1px solid #e5e5ea}
#storeAddDlg .sraResults:empty{display:none}
#storeAddDlg .sraResult{display:block;width:100%;min-height:64px;padding:12px 16px;border:0;border-bottom:1px solid #eeeef2;border-radius:0;background:#fff;text-align:left;color:#1d1d1f;box-shadow:none;height:auto;font-size:inherit;white-space:normal}
#storeAddDlg li:last-child .sraResult{border-bottom:0}
#storeAddDlg .sraResult:active{background:#f2f2f7}
#storeAddDlg .sraResult b{display:block;font-size:16px;font-weight:600;line-height:1.3}
#storeAddDlg .sraResult span{display:block;margin-top:3px;font-size:14px;color:#6e6e73;line-height:1.35}
#storeAddDlg .sraResult em{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;background:#fff4e5;color:#9a4b00;font-size:12px;font-style:normal;font-weight:600}
#storeAddDlg .sraCard{margin:12px 0 0;padding:20px;border-radius:18px;background:#fff;border:1px solid #e5e5ea}
#storeAddDlg .sraCard h3{margin:0;font-size:22px;font-weight:700;letter-spacing:-.02em;line-height:1.2;overflow-wrap:anywhere}
#storeAddDlg .sraCard p{margin:6px 0 0;font-size:15px;color:#3a3a3c;line-height:1.4;overflow-wrap:anywhere}
#storeAddDlg .sraCard .sraMeta{margin-top:10px;font-size:14px;color:#6e6e73}
#storeAddDlg .sraDup{margin:14px 0 0;padding:16px;border-radius:16px;background:#fff8ec;border:1px solid #ffd9a3}
#storeAddDlg .sraDup b{display:block;font-size:16px;color:#7a3d00}
#storeAddDlg .sraDup span{display:block;margin-top:4px;font-size:14px;color:#6e4a1f;overflow-wrap:anywhere}
#storeAddDlg .sraManual label{display:block;margin:16px 0 6px;font-size:14px;font-weight:600;color:#3a3a3c}
#storeAddDlg .sraHint{margin:10px 2px 0;font-size:14px;color:#6e6e73;line-height:1.4}
#storeAddDlg .sraDone{text-align:center;padding-top:24px}
#storeAddDlg .sraCheck{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 14px;border-radius:50%;background:#e8f7ee;color:#1a7f37;font-size:32px;font-weight:700}
#storeAddDlg .sraDone h3{margin:0;font-size:22px;letter-spacing:-.02em}
#storeAddDlg .sraDone p{margin:8px 0 0;color:#6e6e73;font-size:15px}
#storeAddDlg .sraCredit{margin:22px 0 0;font-size:12px;color:#8e8e93;text-align:center}
#storeAddDlg .sraCredit a{color:inherit}
@media (max-width:600px){
 #storeAddDlg{width:100vw;max-width:100vw;height:calc(100dvh - 10px);max-height:calc(100dvh - 10px);margin:auto 0 0;border-radius:22px 22px 0 0}
}`;

const MARKUP=`
<div class="sraHead"><button type="button" class="sraNav" data-sra-nav>Annuler</button><h2 id="sraTitle">Ajouter un magasin</h2><span></span></div>
<div class="sraBody">
 <div class="sraProgress" data-sra-progress hidden><span data-sra-progress-text></span><button type="button" data-sra-skip>Passer</button></div>
 <section data-sra-step="search">
  <form data-sra-search-form role="search" novalidate>
   <label class="sraLabel" for="sraQuery">Rechercher un magasin</label>
   <div class="sraField"><input id="sraQuery" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" placeholder="Nom, enseigne ou adresse" aria-describedby="sraStatus"><span class="sraSpinner" data-sra-spinner hidden aria-hidden="true"></span></div>
   <button type="submit" class="sraPrimary" data-sra-search>Rechercher</button>
  </form>
  <p id="sraStatus" class="sraStatus" role="status" aria-live="polite"></p>
  <ul class="sraResults" data-sra-results aria-label="Résultats"></ul>
  <button type="button" class="sraLink" data-sra-manual>Saisir manuellement</button>
  <p class="sraCredit">Recherche : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>
 </section>
 <section data-sra-step="preview" hidden>
  <div class="sraCard"><h3 data-sra-name></h3><p data-sra-address></p><p data-sra-city></p><p class="sraMeta" data-sra-meta hidden></p></div>
  <div class="sraDup" data-sra-dup hidden role="alert"><b>Ce magasin semble déjà être dans ton secteur</b><span data-sra-dup-store></span></div>
  <button type="button" class="sraPrimary" data-sra-add>Ajouter ce magasin</button>
  <button type="button" class="sraLink" data-sra-open-existing hidden>Ouvrir la fiche existante</button>
  <button type="button" class="sraLink" data-sra-add-anyway hidden>Ajouter quand même</button>
  <p class="sraStatus" data-sra-preview-status role="status" aria-live="polite"></p>
 </section>
 <section data-sra-step="manual" class="sraManual" hidden>
  <form data-sra-manual-form novalidate>
   <label for="sraName">Nom du magasin</label><input id="sraName" type="text" enterkeyhint="next" autocomplete="off" autocapitalize="words" placeholder="Ex. Darty Villefranche">
   <label for="sraAddress">Adresse</label><input id="sraAddress" type="text" enterkeyhint="next" autocomplete="off" placeholder="Ex. 12 rue de la République">
   <label for="sraCity">Ville</label><input id="sraCity" type="text" enterkeyhint="done" autocomplete="off" autocapitalize="words" placeholder="Ex. Villefranche-sur-Saône">
   <button type="submit" class="sraPrimary" data-sra-manual-submit>Continuer</button>
  </form>
  <p class="sraHint" data-sra-manual-hint hidden></p>
  <button type="button" class="sraLink" data-sra-gps hidden>Utiliser ma position</button>
  <p class="sraStatus" data-sra-manual-status role="status" aria-live="polite"></p>
 </section>
 <section data-sra-step="done" class="sraDone" hidden>
  <div class="sraCheck" aria-hidden="true">✓</div>
  <h3 data-sra-done-name></h3>
  <p>Ajouté à ton secteur, prêt pour le planning et les visites.</p>
  <button type="button" class="sraPrimary" data-sra-finish>Terminé</button>
  <button type="button" class="sraLink" data-sra-open-new>Voir la fiche</button>
 </section>
</div>`;

const ui={dlg:null,step:'search',results:[],preview:null,duplicate:null,queue:[],index:0,onAdded:null,added:null,located:null,busy:false,searchSeq:0};

function q(sel){return ui.dlg&&ui.dlg.querySelector(sel)}
function ensureDialog(){
  const doc=root.document;
  if(ui.dlg&&ui.dlg.isConnected)return ui.dlg;
  if(!doc.getElementById('storeAddStyle')){const st=doc.createElement('style');st.id='storeAddStyle';st.textContent=CSS;doc.head.appendChild(st)}
  const d=doc.createElement('dialog');d.id='storeAddDlg';d.setAttribute('aria-labelledby','sraTitle');d.innerHTML=MARKUP;doc.body.appendChild(d);ui.dlg=d;
  q('[data-sra-nav]').addEventListener('click',back);
  d.addEventListener('cancel',e=>{e.preventDefault();close()});
  q('[data-sra-search-form]').addEventListener('submit',e=>{e.preventDefault();runSearch()});
  q('#sraQuery').addEventListener('input',()=>{if(!ui.busy&&!q('#sraQuery').value.trim()){ui.results=[];renderResults();say('')}});
  q('[data-sra-manual]').addEventListener('click',()=>openManual());
  q('[data-sra-add]').addEventListener('click',()=>add(false));
  q('[data-sra-add-anyway]').addEventListener('click',()=>add(true));
  q('[data-sra-open-existing]').addEventListener('click',()=>{const s=ui.duplicate&&ui.duplicate.store;if(s)openFiche(s.id)});
  q('[data-sra-manual-form]').addEventListener('submit',e=>{e.preventDefault();submitManual()});
  ['#sraAddress','#sraCity'].forEach(id=>q(id).addEventListener('input',()=>{ui.located=null}));
  q('#sraName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();q('#sraAddress').focus()}});
  q('#sraAddress').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();q('#sraCity').focus()}});
  q('[data-sra-gps]').addEventListener('click',()=>submitManual(true));
  q('[data-sra-finish]').addEventListener('click',finish);
  q('[data-sra-open-new]').addEventListener('click',()=>{if(ui.added)openFiche(ui.added.id)});
  q('[data-sra-skip]').addEventListener('click',nextDraft);
  return d;
}
function say(message,warn){const s=q('#sraStatus');if(!s)return;s.textContent=message||'';s.classList.toggle('sraWarn',!!warn)}
function setStep(step){
  ui.step=step;
  for(const sec of ui.dlg.querySelectorAll('[data-sra-step]'))sec.hidden=sec.dataset.sraStep!==step;
  const nav=q('[data-sra-nav]');nav.style.visibility=step==='done'?'hidden':'';nav.textContent=step==='search'?'Annuler':'Retour';
  q('#sraTitle').textContent=step==='manual'?'Saisir un magasin':step==='done'?'Magasin ajouté':'Ajouter un magasin';
  const body=q('.sraBody');if(body)body.scrollTop=0;
}
function setBusy(on){
  ui.busy=on;
  q('[data-sra-spinner]').hidden=!on;
  const b=q('[data-sra-search]');b.disabled=on;b.textContent=on?'Recherche…':'Rechercher';
  q('#sraQuery').setAttribute('aria-busy',on?'true':'false');
}
function progress(){
  const box=q('[data-sra-progress]'),many=ui.queue.length>1;
  box.hidden=!many;
  if(many)q('[data-sra-progress-text]').textContent='Magasin '+(ui.index+1)+' sur '+ui.queue.length;
}
function updateConnectivity(){
  if(!ui.dlg||!ui.dlg.open)return;
  if(ui.step==='manual'){manualMode();return}
  if(ui.step!=='search')return;
  if(isOffline())say('Hors ligne : la recherche nécessite une connexion. Tu peux saisir le magasin manuellement.',true);
  else if(q('#sraStatus').classList.contains('sraWarn')&&!ui.busy)say('');
}

function open(options){
  const opts=Array.isArray(options)?{drafts:options}:(options||{});
  ensureDialog();
  if(controller)controller.abort();
  ui.queue=Array.isArray(opts.drafts)?opts.drafts.filter(Boolean).map(d=>Object.assign({},d)):[];
  ui.index=0;ui.onAdded=typeof opts.onAdded==='function'?opts.onAdded:null;
  if(!ui.queue.length&&opts.query)ui.queue=[{query:text(opts.query)}];
  if(!ui.dlg.open)ui.dlg.showModal();
  root.addEventListener('online',updateConnectivity);root.addEventListener('offline',updateConnectivity);
  showDraft();
  return true;
}
function showDraft(){
  const draft=ui.queue[ui.index]||null;
  ui.results=[];ui.preview=null;ui.duplicate=null;ui.added=null;ui.located=null;ui.searchSeq++;
  if(controller)controller.abort();
  setBusy(false);renderResults();setStep('search');progress();
  const input=q('#sraQuery');
  input.value=draft?(draft.query||draftQuery(draft)):'';
  say('');
  if(isOffline())say('Hors ligne : la recherche nécessite une connexion. Tu peux saisir le magasin manuellement.',true);
  if(draft&&input.value&&!isOffline())runSearch();
  else try{input.focus({preventScroll:true})}catch(e){input.focus()}
}
function nextDraft(){
  ui.index++;
  if(ui.index<ui.queue.length){showDraft();return}
  close();
}
function close(){
  ui.searchSeq++;
  if(controller)controller.abort();
  root.removeEventListener('online',updateConnectivity);root.removeEventListener('offline',updateConnectivity);
  if(ui.dlg&&ui.dlg.open)ui.dlg.close();
  ui.queue=[];ui.onAdded=null;
}
function back(){
  if(ui.step==='done'){finish();return}
  if(ui.step==='search'){close();return}
  if(ui.step==='preview'&&ui.preview&&ui.preview.fromManual){setStep('manual');return}
  setStep('search');
}
function finish(){
  if(ui.queue.length>1){nextDraft();return}
  close();
}
function openFiche(id){
  close();
  if(typeof root.goTab==='function')root.goTab('storesPanel');
  if(typeof root.openStoreQuick==='function')root.openStoreQuick(id);
  else if(typeof root.openStore==='function')root.openStore(id);
}

async function runSearch(){
  const input=q('#sraQuery'),query=text(input.value);
  if(query.length<3){say('Tape au moins 3 caractères, par exemple « Darty Villefranche ».');input.focus();return}
  if(isOffline()){ui.results=[];renderResults();say('Hors ligne : la recherche nécessite une connexion. Tu peux saisir le magasin manuellement.',true);return}
  const seq=++ui.searchSeq;
  if(controller)controller.abort();
  input.blur();
  setBusy(true);say('');
  try{
    const results=await search(query);
    if(seq!==ui.searchSeq)return;
    ui.results=results;renderResults();
    if(!results.length)say('Aucun magasin trouvé. Essaie avec la ville, par exemple « '+(query.split(' ')[0]||'Darty')+' Lyon », ou saisis-le manuellement.');
    else say(results.length===1?'1 résultat':results.length+' résultats');
  }catch(e){
    if(seq!==ui.searchSeq||e.code==='ABORTED')return;
    ui.results=[];renderResults();say(friendlyError(e),true);
  }finally{if(seq===ui.searchSeq)setBusy(false)}
}
function renderResults(){
  const list=q('[data-sra-results]');list.replaceChildren();
  const stores=currentStores();
  ui.results.forEach((c,i)=>{
    const li=root.document.createElement('li'),b=root.document.createElement('button');
    b.type='button';b.className='sraResult';b.dataset.sraResult=String(i);
    const title=root.document.createElement('b'),line=root.document.createElement('span');
    title.textContent=c.kind==='store'?c.store.sourceName:c.store.adresse;
    line.textContent=c.kind==='store'?[c.store.adresse,[c.store.codePostal,c.store.ville].filter(Boolean).join(' ')].filter(Boolean).join(' · '):[c.store.codePostal,c.store.ville].filter(Boolean).join(' ')+' · adresse';
    b.append(title,line);
    if(c.kind==='store'&&findDuplicate(c.store,stores)){const tag=root.document.createElement('em');tag.textContent='Déjà dans ton secteur ?';b.append(tag)}
    b.addEventListener('click',()=>choose(i));
    li.append(b);list.append(li);
  });
}
function choose(i){
  const c=ui.results[i];if(!c)return;
  if(c.kind==='address'){openManual({adresse:c.store.adresse,ville:c.store.ville,located:{lat:c.store.lat,lon:c.store.lon,codePostal:c.store.codePostal,ville:c.store.ville}});return}
  showPreview(Object.assign({},c.store),false);
}
function showPreview(store,fromManual){
  ui.preview=Object.assign(store,{fromManual:!!fromManual});
  ui.duplicate=findDuplicate(store,currentStores());
  q('[data-sra-name]').textContent=store.sourceName||store.enseigne;
  q('[data-sra-address]').textContent=store.adresse||'';
  q('[data-sra-city]').textContent=[store.codePostal,store.ville].filter(Boolean).join(' ');
  const meta=[store.phone,store.website&&store.website.replace(/^https?:\/\/(www\.)?/i,'').replace(/\/$/,'')].filter(Boolean).join(' · ');
  q('[data-sra-meta]').hidden=!meta;q('[data-sra-meta]').textContent=meta;
  const dup=ui.duplicate,s=dup&&dup.store;
  q('[data-sra-dup]').hidden=!dup;
  if(s)q('[data-sra-dup-store]').textContent=(s.sourceName||(s.enseigne+' · '+s.ville))+(s.adresse?' — '+s.adresse:'')+(s.ville&&s.sourceName?', '+s.ville:'');
  q('[data-sra-add]').hidden=!!dup;
  q('[data-sra-open-existing]').hidden=!dup;
  q('[data-sra-open-existing]').className=dup?'sraPrimary':'sraLink';
  q('[data-sra-add-anyway]').hidden=!(dup&&dup.level==='probable');
  q('[data-sra-preview-status]').textContent='';
  setStep('preview');
}
function add(force){
  const store=ui.preview;if(!store)return;
  const status=q('[data-sra-preview-status]');
  const stores=currentStores(),dup=findDuplicate(store,stores);
  if(dup&&(dup.level==='same'||!force)){ui.duplicate=dup;showPreview(store,store.fromManual);return}
  const R=root.RegionStores;
  if(!R||typeof R.commit!=='function'){status.textContent='Ajout indisponible pour le moment. Recharge Store Runner.';return}
  const row=finalizeStore(Object.assign({},store,{fromManual:undefined}),stores);
  delete row.fromManual;
  let added=0;
  try{added=R.commit([row])}catch(e){status.textContent='Le magasin n’a pas pu être enregistré. Réessaie. ('+text(e&&e.message)+')';return}
  if(!added){ui.duplicate=findDuplicate(row,currentStores())||{level:'same',store:row};showPreview(store,store.fromManual);return}
  ui.added=row;
  try{if(typeof root.renderFilterControls==='function')root.renderFilterControls()}catch(e){}
  try{if(typeof root.renderAll==='function')root.renderAll()}catch(e){}
  try{root.document.dispatchEvent(new CustomEvent('store-runner:store-added',{detail:{storeId:row.id}}))}catch(e){}
  if(ui.onAdded){try{ui.onAdded(row)}catch(e){}}
  q('[data-sra-done-name]').textContent=row.sourceName||row.enseigne;
  q('[data-sra-finish]').textContent=ui.queue.length>1&&ui.index<ui.queue.length-1?'Magasin suivant':'Terminé';
  setStep('done');
}

function openManual(prefill){
  const p=prefill||{},draft=ui.queue[ui.index]||{};
  const guess=p.adresse!==undefined?p:{name:draft.sourceName||draft.nom||draft.name||(draft.enseigne?text(draft.enseigne+' '+(draft.ville||'')):''),adresse:draft.adresse||'',ville:draft.ville||''};
  q('#sraName').value=text(p.name!==undefined?p.name:guess.name||'');
  q('#sraAddress').value=text(guess.adresse||'');
  q('#sraCity').value=text(guess.ville||'');
  ui.located=p.located||null;
  q('[data-sra-manual-status]').textContent='';
  setStep('manual');manualMode();
  const first=['#sraName','#sraAddress','#sraCity'].map(q).find(i=>!i.value)||q('#sraName');
  try{first.focus({preventScroll:true})}catch(e){first.focus()}
}
function manualMode(){
  const offline=isOffline(),gps=!!(root.navigator&&root.navigator.geolocation);
  const hint=q('[data-sra-manual-hint]');
  hint.hidden=!(offline&&!ui.located);
  hint.textContent=gps?'Hors ligne : si tu es au magasin, ta position servira à le situer.':'Hors ligne : l’adresse sera localisée une fois connecté.';
  q('[data-sra-manual-submit]').textContent=offline&&!ui.located&&gps?'Continuer avec ma position':'Continuer';
  q('[data-sra-manual-submit]').disabled=offline&&!ui.located&&!gps;
}
async function submitManual(useGps){
  const name=text(q('#sraName').value),adresse=text(q('#sraAddress').value),ville=text(q('#sraCity').value);
  const status=q('[data-sra-manual-status]');
  const missing=!name?'#sraName':!adresse?'#sraAddress':!ville?'#sraCity':'';
  if(missing){status.textContent='Indique le nom, l’adresse et la ville du magasin.';q(missing).focus();return}
  const stores=currentStores(),enseigne=detectBrand(name,'',stores);
  const store={enseigne:enseigne,sourceName:name,adresse:adresse,ville:ville,codePostal:'',source:'Saisie manuelle'};
  const btn=q('[data-sra-manual-submit]');
  if(ui.located){Object.assign(store,{lat:ui.located.lat,lon:ui.located.lon,codePostal:ui.located.codePostal||'',ville:ville});showPreview(store,true);return}
  const active=root.document.activeElement;if(active&&active.blur)active.blur();
  btn.disabled=true;q('[data-sra-gps]').hidden=true;
  try{
    if(useGps||isOffline()){
      status.textContent='Localisation en cours…';
      const pos=await currentPosition();
      Object.assign(store,{lat:pos.lat,lon:pos.lon,source:'Saisie manuelle (position sur place)'});
    }else{
      status.textContent='Recherche de l’adresse…';
      const hit=await locateAddress(adresse,ville);
      if(!hit){
        status.textContent='Adresse introuvable. Vérifie-la'+(root.navigator&&root.navigator.geolocation?', ou utilise ta position si tu es au magasin.':'.');
        q('[data-sra-gps]').hidden=!(root.navigator&&root.navigator.geolocation);
        return;
      }
      Object.assign(store,{lat:hit.lat,lon:hit.lon,codePostal:hit.codePostal,ville:ville||hit.ville});
    }
    status.textContent='';
    showPreview(store,true);
  }catch(e){
    const c=e&&e.code;
    status.textContent=c==='GPS_DENIED'?'Autorise la localisation pour situer le magasin, ou réessaie une fois connecté.':c==='GPS'||c==='NO_GPS'?'Position indisponible. Réessaie, ou saisis le magasin une fois connecté.':friendlyError(e);
    if(c!=='GPS_DENIED'&&c!=='NO_GPS'&&root.navigator&&root.navigator.geolocation)q('[data-sra-gps]').hidden=false;
  }finally{btn.disabled=false;manualMode()}
}

function install(){
  /* Rien à installer au démarrage : l'écran est construit à la première ouverture. */
  return true;
}

return{open,close,install,search,searchUrl,addressUrl,candidateFrom,candidatesFrom,findDuplicate,detectBrand,draftQuery,finalizeStore,distanceMeters,sectorCenter,friendlyError,
  _reset(){lastRequestAt=0;memory.clear()}};
});
