/* Carnet officiel intégré : base GitHub + ajouts locaux validés par l'utilisateur. */
(function(root){
'use strict';
const KEY='chef-secteur-official-catalog-local-v1';
const BRANDS=['Boulanger','Darty','Fnac','Conforama','Cuisinella','Carrefour'];
/* #467 — périmètre du carnet : France métropolitaine continentale, exactement 12 régions.
   Corse et outre-mer n'entrent ni dans le carnet ni dans ses sélecteurs. */
const REGIONS=[
 {code:'84',name:'Auvergne-Rhône-Alpes'},{code:'27',name:'Bourgogne-Franche-Comté'},
 {code:'53',name:'Bretagne'},{code:'24',name:'Centre-Val de Loire'},
 {code:'44',name:'Grand Est'},{code:'32',name:'Hauts-de-France'},{code:'11',name:'Île-de-France'},
 {code:'28',name:'Normandie'},{code:'75',name:'Nouvelle-Aquitaine'},{code:'76',name:'Occitanie'},
 {code:'52',name:'Pays de la Loire'},{code:'93',name:"Provence-Alpes-Côte d'Azur"}
];
const REGION_NAMES=Object.fromEntries(REGIONS.map(r=>[r.code,r.name]));
const DEPT_REGION={
 '01':'84','03':'84','07':'84','15':'84','26':'84','38':'84','42':'84','43':'84','63':'84','69':'84','73':'84','74':'84',
 '21':'27','25':'27','39':'27','58':'27','70':'27','71':'27','89':'27','90':'27','22':'53','29':'53','35':'53','56':'53',
 '18':'24','28':'24','36':'24','37':'24','41':'24','45':'24',
 '08':'44','10':'44','51':'44','52':'44','54':'44','55':'44','57':'44','67':'44','68':'44','88':'44',
 '02':'32','59':'32','60':'32','62':'32','80':'32','14':'28','27':'28','50':'28','61':'28','76':'28',
 '16':'75','17':'75','19':'75','23':'75','24':'75','33':'75','40':'75','47':'75','64':'75','79':'75','86':'75','87':'75',
 '09':'76','11':'76','12':'76','30':'76','31':'76','32':'76','34':'76','46':'76','48':'76','65':'76','66':'76','81':'76','82':'76',
 '44':'52','49':'52','53':'52','72':'52','85':'52','04':'93','05':'93','06':'93','13':'93','83':'93','84':'93',
 '75':'11','77':'11','78':'11','91':'11','92':'11','93':'11','94':'11','95':'11'
};
const PAGE_SIZE=150;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const esc=s=>String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const readLocal=()=>{try{const v=JSON.parse((root.__chefStorage||root.localStorage).getItem(KEY)||'[]');return Array.isArray(v)?v:[]}catch(e){return []}};
const writeLocal=v=>(root.__chefStorage||root.localStorage).setItem(KEY,JSON.stringify(v));
const coords=s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon));
function duplicate(a,list){const R=root.RegionStores;if(R&&R.duplicate)return R.duplicate(a,list);return list.some(b=>norm(a.enseigne)===norm(b.enseigne)&&norm(a.adresse)===norm(b.adresse)&&norm(a.ville)===norm(b.ville))}
let catalogSnapshot=null;
/* Le code postal fait foi : un code postal hors des 94 départements continentaux
   (20xxx Corse, 97xxx/98xxx outre-mer) ne reçoit jamais de région du carnet. */
function postalDept(postal){const p=String(postal||'').replace(/\s/g,'');return /^\d{5}$/.test(p)?p.slice(0,2):''}
function isContinentalPostal(postal){return !!DEPT_REGION[postalDept(postal)]}
function regionCodeFor(s){
 const postal=String(s&&s.codePostal||'').replace(/\s/g,'');
 if(/^\d{5}$/.test(postal))return DEPT_REGION[postal.slice(0,2)]||'';
 if(postal)return '';
 const explicit=String(s&&s.regionCode||'');if(REGION_NAMES[explicit])return explicit;
 return DEPT_REGION[String(s&&s.dept||'').toUpperCase()]||'';
}
function normalizeOfficialStore(s){const row=Object.assign({},s),code=regionCodeFor(row);row.regionCode=code;row.region=code?REGION_NAMES[code]:'';return row}
/* Défense en profondeur : une fiche sans région continentale (Corse, outre-mer,
   code postal invalide) ne sort jamais du carnet, même si un snapshot la contient. */
function normalizeSnapshot(d){return d&&Array.isArray(d.stores)?Object.assign({},d,{sources:d.sources||{},stores:d.stores.filter(Boolean).map(normalizeOfficialStore).filter(s=>REGION_NAMES[s.regionCode])}):{generatedAt:null,sources:{},stores:[]}}
async function loadCatalog(force){if(catalogSnapshot&&!force)return catalogSnapshot;const r=await fetch('./data/official-stores.json?catalog='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Carnet officiel indisponible.');const d=normalizeSnapshot(await r.json());catalogSnapshot=d;return d}
async function officialData(){try{return await loadCatalog()}catch(e){return {generatedAt:null,sources:{},stores:[]}}}
function catalogBrands(snapshot){const d=normalizeSnapshot(snapshot);return BRANDS.filter(b=>d.sources[b]||d.stores.some(s=>s.enseigne===b))}
function catalogRegions(){return REGIONS.map(r=>Object.assign({},r))}
function filterStores(snapshot,brand,regionCode){const d=normalizeSnapshot(snapshot);return d.stores.filter(s=>s&&s.enseigne===brand&&String(s.regionCode||'')===String(regionCode||'')).sort((a,b)=>(a.ville+' '+a.sourceName).localeCompare(b.ville+' '+b.sourceName,'fr'))}
/* #467 — « complet » exige une preuve : région collectée ET enseigne au statut complete
   (liste contrôlée contre le plan du site ou le sitemap de l'enseigne). Le message du
   collecteur (source, blocage, date) est affiché tel quel quand il existe. */
function coverage(snapshot,brand,regionCode){
 const d=normalizeSnapshot(snapshot),source=d.sources[brand]||{},rows=filterStores(d,brand,regionCode),region=source.regions&&source.regions[regionCode];
 const note=region&&typeof region.message==='string'?region.message.trim():'';
 if(region){const raw=String(region.status||'').toLowerCase();if(raw==='collected'&&source.status==='complete')return{level:'complete',count:rows.length,message:note||'Liste officielle complète pour cette région.'};if(rows.length)return{level:'partial',count:rows.length,message:note||'Liste partielle : la source officielle n’a pas pu être collectée complètement.'};return{level:'unavailable',count:0,message:note||'Liste indisponible pour cette région dans le carnet officiel.'}}
 if(rows.length)return{level:'partial',count:rows.length,message:'Liste partielle : région déduite du code postal, sans garantie d’exhaustivité.'};
 return{level:'unavailable',count:0,message:'Aucune liste exploitable pour cette enseigne dans cette région.'};
}
function audit(snapshot){
 const d=normalizeSnapshot(snapshot);return BRANDS.map(brand=>{const rows=d.stores.filter(s=>s&&s.enseigne===brand),regions=new Set(rows.map(regionCodeFor).filter(Boolean)),source=d.sources[brand]||{},declared=REGIONS.map(r=>(source.regions||{})[r.code]),allCollected=declared.every(r=>r&&r.status==='collected');return{brand,count:rows.length,regions:regions.size,source:!rows.length?'unavailable':allCollected&&source.status==='complete'?'complete':'partial',rawStatus:source.status||'unavailable'} });
}
function manualRow(x){return {id:x.id||('manual-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)),enseigne:x.enseigne,sourceName:x.sourceName||((x.enseigne||'Magasin')+' '+(x.ville||'')),adresse:x.adresse||'',codePostal:x.codePostal||'',ville:x.ville||'',regionCode:x.regionCode||'',region:x.region||'',lat:x.lat===''||x.lat==null?null:Number(x.lat),lon:x.lon===''||x.lon==null?null:Number(x.lon),source:'Carnet officiel local',sourceUrl:x.sourceUrl||'',sourceFetchedAt:x.sourceFetchedAt||new Date().toISOString(),verifiedAt:x.verifiedAt||new Date().toISOString().slice(0,10),status:x.status||'validated',freq:'Mensuel',intervalDays:30,priority:3,active:true,products:['À confirmer']}}
async function geocode(s){const q=[s.adresse,s.codePostal,s.ville,s.enseigne].filter(Boolean).join(', ');if(!q)throw Error('Renseigne au moins une adresse ou une ville.');const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=fr&limit=1&q='+encodeURIComponent(q),{headers:{'Accept-Language':'fr'}});if(!r.ok)throw Error('Géocodage indisponible.');const d=await r.json();if(!Array.isArray(d)||!d[0])throw Error('Adresse introuvable.');s.lat=Number(d[0].lat);s.lon=Number(d[0].lon);const a=d[0].address||{};if(!s.ville)s.ville=a.city||a.town||a.village||a.municipality||'';if(!s.codePostal)s.codePostal=a.postcode||'';return s}
function install(){
 /* V261 — rangé dans Données › Outils avancés, hors du parcours quotidien Magasins. */
 const host=document.getElementById('storeToolsHost');
 if(!host||document.getElementById('officialCatalogBtn'))return;
 const style=document.createElement('style');style.textContent=`
 #officialCatalogBtn{font-weight:700}.catalogDialog{width:min(760px,calc(100vw - 20px));max-height:90dvh;overflow:auto;border:0;border-radius:26px;padding:0;background:#f5f8fc;color:#142033;box-shadow:0 28px 90px #0f172a55}.catalogDialog::backdrop{background:#0f172a66;backdrop-filter:blur(6px)}.catalogHead{position:sticky;top:0;z-index:4;display:flex;justify-content:space-between;align-items:center;padding:18px;background:#f5f8fcf2;border-bottom:1px solid #dbe3ee}.catalogHead h2{margin:2px 0;font-size:24px}.catalogHead small{color:#66758a}.catalogClose{width:42px;height:42px;border:0;border-radius:50%}.catalogBody{padding:16px}.catalogTools{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:8px}.catalogTools input,.catalogTools select,.catalogForm input,.catalogForm select{min-height:44px;border:1px solid #c8d4e2;border-radius:13px;padding:0 12px;background:white;color:#142033;font:inherit;box-sizing:border-box;width:100%}.catalogStats{margin:12px 0;color:#607086;font-size:13px}.catalogList{display:grid;gap:10px}.catalogCard{background:white;border:1px solid #e2e8f0;border-radius:18px;padding:14px}.catalogCard h3{margin:0 0 5px;font-size:17px}.catalogMeta{color:#5d6b7c;font-size:13px;line-height:1.45}.catalogBadge{display:inline-flex;border-radius:999px;padding:4px 8px;margin:7px 6px 8px 0;background:#e8f4ec;color:#176b38;font-size:12px;font-weight:700}.catalogBadge.warn{background:#fff2d8;color:#8a5a00}.catalogActions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.catalogActions button,.catalogAddBtn{min-height:42px;border:0;border-radius:13px;padding:0 13px;font:inherit;font-weight:700}.catalogActions .primary,.catalogAddBtn{background:#0b78f0;color:white}.catalogActions .secondary{background:#e8eef6;color:#1d3553}.catalogMore{display:flex;justify-content:center;margin:14px 0 4px}.catalogMore .catalogAddBtn{min-width:220px}.catalogForm{display:none;margin:14px 0;padding:14px;background:white;border:1px solid #dfe7f0;border-radius:18px}.catalogForm.open{display:grid;gap:9px}.catalogFormGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.catalogForm .wide{grid-column:1/-1}.catalogNote{font-size:12px;color:#68778b;line-height:1.4}@media(max-width:560px){.catalogTools{grid-template-columns:1fr}.catalogFormGrid{grid-template-columns:1fr}.catalogForm .wide{grid-column:auto}.catalogDialog{width:calc(100vw - 10px);border-radius:22px}.catalogBody{padding:12px}}
 `;document.head.append(style);
 const b=document.createElement('button');b.id='officialCatalogBtn';b.type='button';b.className='secondary';b.textContent='📒 Carnet officiel';host.append(b);
 const d=document.createElement('dialog');d.className='catalogDialog';d.innerHTML=`<div class="catalogHead"><div><small>MAGASINS VALIDÉS</small><h2>Carnet officiel</h2></div><button class="catalogClose" type="button" aria-label="Fermer">✕</button></div><div class="catalogBody"><div class="catalogTools"><input id="catalogSearch" placeholder="Rechercher un magasin, une ville…"><select id="catalogBrand"><option value="">Toutes les enseignes</option>${BRANDS.map(x=>`<option>${x}</option>`).join('')}</select><select id="catalogRegion"><option value="">Toutes les régions</option></select></div><div class="catalogStats" id="catalogStats">Chargement du carnet…</div><button class="catalogAddBtn" id="catalogAddToggle" type="button">＋ Ajouter au carnet</button><form class="catalogForm" id="catalogForm"><div class="catalogFormGrid"><select id="cfBrand" required>${BRANDS.map(x=>`<option>${x}</option>`).join('')}</select><input id="cfName" placeholder="Nom du magasin" required><input id="cfAddress" class="wide" placeholder="Adresse officielle" required><input id="cfZip" placeholder="Code postal" required><input id="cfCity" placeholder="Ville" required><select id="cfRegion" required><option value="">Région</option></select><input id="cfUrl" class="wide" placeholder="Lien officiel du magasin (recommandé)"><input id="cfLat" placeholder="Latitude (optionnel)"><input id="cfLon" placeholder="Longitude (optionnel)"></div><div class="catalogActions"><button type="button" class="secondary" id="cfGeo">Trouver les coordonnées</button><button type="submit" class="primary">Enregistrer dans le carnet</button></div><div class="catalogNote">Les ajouts manuels sont conservés dans le stockage local de cette application. Le lien officiel sert à garder une trace vérifiable de la source.</div><div class="catalogStats" id="cfStatus"></div></form><div class="catalogList" id="catalogList"></div><div class="catalogMore" id="catalogMore"></div></div>`;document.body.append(d);
 const q=s=>d.querySelector(s), list=q('#catalogList'), more=q('#catalogMore'), stats=q('#catalogStats'), search=q('#catalogSearch'), brand=q('#catalogBrand'), region=q('#catalogRegion'), form=q('#catalogForm'), formRegion=q('#cfRegion');
 let official=[],regions=[],generatedAt=null,visibleLimit=PAGE_SIZE;
 /* #467 — liste fixe des 12 régions continentales : aucun appel à geo.api.gouv.fr,
    qui réinjectait la Corse et l'outre-mer dans les sélecteurs. */
 function loadRegions(){if(regions.length)return;regions=REGIONS.map(r=>({code:r.code,nom:r.name}));const html='<option value="">Toutes les régions</option>'+regions.map(r=>`<option value="${esc(r.code)}">${esc(r.nom)}</option>`).join('');region.innerHTML=html;formRegion.innerHTML='<option value="">Région</option>'+regions.map(r=>`<option value="${esc(r.code)}">${esc(r.nom)}</option>`).join('')}
 function all(){return official.concat(readLocal())}
 function regionName(code){return (regions.find(r=>r.code===String(code))||{}).nom||''}
 function filtered(){const t=norm(search.value), br=brand.value, rg=region.value;return all().filter(s=>(!br||s.enseigne===br)&&(!rg||String(s.regionCode||'')===rg)&&(!t||norm([s.enseigne,s.sourceName,s.ville,s.adresse,s.codePostal].join(' ')).includes(t))).sort((a,b)=>(a.enseigne+' '+a.ville).localeCompare(b.enseigne+' '+b.ville,'fr'))}
 function render(){const rows=filtered(),shown=Math.min(visibleLimit,rows.length),localCount=readLocal().length;stats.textContent=rows.length+' correspondant(s) · '+shown+' affiché(s) · '+official.length+' dans la base intégrée · '+localCount+' ajout(s) local(aux)'+(generatedAt?' · base '+new Date(generatedAt).toLocaleDateString('fr-FR'):'');list.innerHTML='';more.innerHTML='';if(!rows.length){list.innerHTML='<div class="catalogCard">Aucun magasin correspondant. Tu peux l’ajouter au carnet manuellement.</div>';return}rows.slice(0,visibleLimit).forEach(s=>{const exists=duplicate(s,(root.state&&root.state.stores)||[]), complete=coords(s)&&s.adresse&&s.ville, local=s.source==='Carnet officiel local';const card=document.createElement('article');card.className='catalogCard';card.innerHTML=`<h3>${esc(s.sourceName||((s.enseigne||'')+' '+(s.ville||'')))}</h3><div class="catalogMeta">${esc([s.adresse,s.codePostal,s.ville].filter(Boolean).join(' · '))}</div><span class="catalogBadge${complete?'':' warn'}">${complete?'✓ Coordonnées prêtes':'⚠ Coordonnées à compléter'}</span><span class="catalogBadge">${local?'Carnet local':/Sirene/.test(String(s.source||''))?'Répertoire Sirene (INSEE)':'Source officielle'}</span><div class="catalogMeta">${esc(regionName(s.regionCode)||s.region||'Région non renseignée')}${s.verifiedAt?' · vérifié '+esc(s.verifiedAt):s.sourceFetchedAt?' · source '+esc(String(s.sourceFetchedAt).slice(0,10)):''}</div><div class="catalogActions">${s.sourceUrl?`<button type="button" class="secondary" data-open>Voir la source ↗</button>`:''}<button type="button" class="primary" data-add ${exists||!complete?'disabled':''}>${exists?'Déjà dans mon secteur':complete?'Ajouter à mon secteur':'Coordonnées manquantes'}</button>${local?'<button type="button" class="secondary" data-del>Supprimer du carnet</button>':''}</div>`;
 if(s.sourceUrl)card.querySelector('[data-open]').onclick=()=>window.open(s.sourceUrl,'_blank','noopener');
 const add=card.querySelector('[data-add]');if(add&&!add.disabled)add.onclick=()=>{try{const R=root.RegionStores;if(!R||!R.commit)throw Error('Module magasins indisponible.');const n=R.commit([s]);if(typeof root.renderFilterControls==='function')root.renderFilterControls();if(typeof root.renderAll==='function')root.renderAll();render();stats.textContent=n?'Magasin ajouté à ton secteur avec sauvegarde préalable.':'Ce magasin était déjà présent.'}catch(e){stats.textContent='Ajout impossible : '+e.message}};
 const del=card.querySelector('[data-del]');if(del)del.onclick=()=>{const arr=readLocal().filter(x=>x.id!==s.id);writeLocal(arr);render()};list.append(card)});if(shown<rows.length){const btn=document.createElement('button');btn.type='button';btn.className='catalogAddBtn';btn.textContent='Afficher plus ('+(rows.length-shown)+' restants)';btn.onclick=()=>{visibleLimit+=PAGE_SIZE;render()};more.append(btn)}}
 function resetAndRender(){visibleLimit=PAGE_SIZE;render()}
 async function open(){d.showModal();stats.textContent='Chargement du carnet…';loadRegions();const data=await officialData();official=data.stores||[];generatedAt=data.generatedAt||null;visibleLimit=PAGE_SIZE;render()}
 b.onclick=open;q('.catalogClose').onclick=()=>d.close();search.oninput=resetAndRender;brand.onchange=resetAndRender;region.onchange=resetAndRender;q('#catalogAddToggle').onclick=()=>form.classList.toggle('open');
 q('#cfGeo').onclick=async()=>{const st=q('#cfStatus');st.textContent='Recherche des coordonnées…';try{const x=manualRow({enseigne:q('#cfBrand').value,sourceName:q('#cfName').value,adresse:q('#cfAddress').value,codePostal:q('#cfZip').value,ville:q('#cfCity').value});await geocode(x);q('#cfLat').value=x.lat;q('#cfLon').value=x.lon;if(!q('#cfCity').value)q('#cfCity').value=x.ville;if(!q('#cfZip').value)q('#cfZip').value=x.codePostal;st.textContent='Coordonnées trouvées. Vérifie l’adresse avant enregistrement.'}catch(e){st.textContent=e.message}};
 form.onsubmit=e=>{e.preventDefault();const zip=q('#cfZip').value.trim();if(zip&&!isContinentalPostal(zip)){q('#cfStatus').textContent='Le carnet couvre la France métropolitaine continentale (12 régions). Pour un autre magasin, utilise « + Ajouter un magasin ».';return}const code=regionCodeFor({codePostal:zip,regionCode:q('#cfRegion').value});const row=manualRow({enseigne:q('#cfBrand').value,sourceName:q('#cfName').value,adresse:q('#cfAddress').value,codePostal:zip,ville:q('#cfCity').value,regionCode:code,region:REGION_NAMES[code]||'',sourceUrl:q('#cfUrl').value,lat:q('#cfLat').value,lon:q('#cfLon').value});const arr=readLocal();if(duplicate(row,official.concat(arr))){q('#cfStatus').textContent='Ce magasin semble déjà exister dans le carnet.';return}arr.push(row);writeLocal(arr);form.reset();form.classList.remove('open');q('#cfStatus').textContent='';resetAndRender();stats.textContent='Magasin ajouté au carnet local.'};
}
const api={load:loadCatalog,brands:catalogBrands,regions:catalogRegions,filter:filterStores,coverage,audit,regionCodeFor,isContinentalPostal,normalizeSnapshot};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.StoreRunnerOfficialCatalog=api;
if(!root.document)return;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(typeof window!=='undefined'?window:globalThis);
