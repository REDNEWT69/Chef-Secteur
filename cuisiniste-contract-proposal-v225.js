/* Store Runner V225 — moteur local de proposition de contrats expo cuisinistes.
   Lecture seule : ne modifie ni planning, ni priorité, ni visites, ni données contrat existantes. */
(function(root){
'use strict';

const MIN_PRODUCTS=2;
const MAX_PRODUCTS=5;
const MAX_STORES=2;

function text(v){return String(v==null?'':v).trim()}
function norm(v){try{return text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}catch(e){return text(v).toLowerCase()}}
function base(){
  if(root.StoreRunnerCuisinisteV193)return root.StoreRunnerCuisinisteV193;
  if(typeof module!=='undefined'&&typeof require==='function')return require('./cuisiniste-contracts-v193.js');
  return null;
}
function storage(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function stores(){try{return Array.isArray(root.state&&root.state.stores)?root.state.stores:[]}catch(e){return[]}}
function productRef(p){return text(p&&p.refSap)||text(p&&p.refCommercial)||text(p&&p.refSchmidt)}
function noExpo(p){return /(?:^| )pas d expo(?: |$)/.test(norm([p&&p.infos,p&&p.description,p&&p.type].filter(Boolean).join(' ')))}
function hasObjective(p){return p&&Number.isFinite(Number(p.contractObjective))&&Number(p.contractObjective)>0}
function eligibleProduct(p){return !!productRef(p)&&hasObjective(p)&&!noExpo(p)}
function latestTariff(db=storage()){
  const A=base();return A&&typeof A.latestTariff==='function'?A.latestTariff(db):null;
}
function eligibleProducts(db=storage()){
  const t=latestTariff(db);return t&&Array.isArray(t.products)?t.products.filter(eligibleProduct):[];
}
function refsOf(p){return[p&&p.refSchmidt,p&&p.refCommercial,p&&p.refSap].map(norm).filter(Boolean)}
function productByRef(products,ref){const n=norm(ref);return n?(products||[]).find(p=>refsOf(p).includes(n))||null:null}
function siteGroup(site){const c=site&&(site.activeContract||site.lastContract);return text(c&&c.group)}
function resolvedSites(db,list){const A=base();return A&&typeof A.resolveSites==='function'?A.resolveSites(db,Array.isArray(list)?list:stores()):[]}
function assertAllocation(allocation){
  if(!Array.isArray(allocation)||allocation.length<1||allocation.length>MAX_STORES)throw new Error('Une proposition concerne un ou deux magasins maximum.');
  const storeIds=allocation.map(x=>text(x&&x.storeId));
  if(storeIds.some(x=>!x)||new Set(storeIds).size!==storeIds.length)throw new Error('Chaque magasin doit être renseigné une seule fois.');
  const refs=allocation.flatMap(x=>Array.isArray(x&&x.refs)?x.refs:[]).map(text).filter(Boolean);
  if(refs.length<MIN_PRODUCTS||refs.length>MAX_PRODUCTS)throw new Error('Une proposition doit contenir entre 2 et 5 produits expo.');
  const normalized=refs.map(norm);if(new Set(normalized).size!==normalized.length)throw new Error('Une même référence ne peut pas être proposée deux fois.');
  if(allocation.some(x=>!Array.isArray(x.refs)||!x.refs.length))throw new Error('Chaque magasin du groupement doit recevoir au moins un produit.');
  return{storeIds,refs};
}
function buildProposal(db=storage(),allocation,list=stores()){
  const A=base();if(!A)throw new Error('Module contrats expo indisponible.');
  const tariff=latestTariff(db);if(!tariff)throw new Error('Importe d’abord le dernier tarif contrats expo.');
  const checked=assertAllocation(allocation),allProducts=Array.isArray(tariff.products)?tariff.products:[],eligible=allProducts.filter(eligibleProduct);
  const sites=resolvedSites(db,list),byStore=new Map(sites.filter(s=>s&&s.storeId!=null).map(s=>[String(s.storeId),s]));
  const selected=[];
  for(const ref of checked.refs){
    const raw=productByRef(allProducts,ref);if(!raw)throw new Error('Référence introuvable dans le dernier tarif : '+ref);
    if(noExpo(raw))throw new Error('Référence exclue des contrats expo : '+ref+' (« pas d’expo »).');
    if(!hasObjective(raw))throw new Error('Objectif Contrat Expo absent pour la référence : '+ref+'.');
    if(!eligibleProduct(raw))throw new Error('Référence non éligible au contrat expo : '+ref+'.');
    selected.push(raw);
  }
  const storeRows=allocation.map(row=>{
    const site=byStore.get(String(row.storeId));if(!site)throw new Error('Magasin cuisiniste non rattaché au suivi : '+row.storeId);
    return{storeId:String(row.storeId),brand:text(site.brand),city:text(site.city),group:siteGroup(site),refs:row.refs.map(text)};
  });
  if(storeRows.length===2){
    const groups=storeRows.map(s=>norm(s.group));
    if(groups.some(x=>!x)||groups[0]!==groups[1])throw new Error('Deux magasins ne peuvent partager une proposition que s’ils appartiennent au même groupement renseigné.');
  }
  const products=selected.map(p=>({
    ref:productRef(p),refSchmidt:text(p.refSchmidt),refCommercial:text(p.refCommercial),refSap:text(p.refSap),
    family:text(p.family),segment:text(p.segment),description:text(p.description),type:text(p.type),
    contractObjective:Number(p.contractObjective),infos:text(p.infos)
  }));
  return{
    type:'cuisiniste-contract-proposal',source:'latest-tariff',tariffImportedAt:text(tariff.importedAt),
    stores:storeRows,products,productCount:products.length,
    objective:products.reduce((sum,p)=>sum+p.contractObjective,0),
    rules:{minProducts:MIN_PRODUCTS,maxProducts:MAX_PRODUCTS,maxStores:MAX_STORES,objectiveSource:'OBJECTIF Contrat Expo',noExpoExcluded:true}
  };
}
function formatEuro(v){return Math.round(Number(v)||0).toLocaleString('fr-FR')+' €'}
function assistantAnswer(raw){
  const q=norm(raw);if(!/(contrat expo|proposition.*contrat|produit.*eligible|reference.*eligible|pas d expo)/.test(q))return null;
  const tariff=latestTariff();if(!tariff)return 'Importe d’abord le dernier tarif contrats expo dans Plus → Contrats expo.';
  const eligible=eligibleProducts();
  if(/pas d expo/.test(q)){
    const excluded=(tariff.products||[]).filter(noExpo);
    return excluded.length?'Références marquées « pas d’expo » dans le dernier tarif :\n'+excluded.slice(0,30).map(p=>'• '+productRef(p)).join('\n'):'Aucune référence « pas d’expo » détectée dans le dernier tarif importé.';
  }
  if(/produit.*eligible|reference.*eligible/.test(q)){
    return eligible.length?'Références éligibles au contrat expo dans le dernier tarif :\n'+eligible.slice(0,30).map(p=>'• '+productRef(p)+' · objectif '+formatEuro(p.contractObjective)).join('\n'):'Aucune référence éligible : vérifie les objectifs Contrat Expo du dernier tarif.';
  }
  const mentioned=eligible.filter(p=>refsOf(p).some(ref=>q.includes(ref))).slice(0,MAX_PRODUCTS);
  if(mentioned.length>=MIN_PRODUCTS){
    const ids=resolvedSites(storage(),stores()).filter(s=>s.storeId&&[s.city,s.brand+' '+s.city].map(norm).some(label=>label&&q.includes(label))).map(s=>String(s.storeId));
    if(ids.length===1){
      try{const proposal=buildProposal(storage(),[{storeId:ids[0],refs:mentioned.map(productRef)}],stores());return 'Proposition contrôlée · '+proposal.productCount+' produits · objectif '+formatEuro(proposal.objective)+'\n'+proposal.products.map(p=>'• '+p.ref+' · '+formatEuro(p.contractObjective)).join('\n')}catch(e){return e.message}
    }
  }
  return 'Pour préparer une proposition fiable, choisis 2 à 5 références du dernier tarif. Store Runner utilise uniquement leur « OBJECTIF Contrat Expo » et exclut automatiquement les lignes marquées « pas d’expo ». Pour un groupement, la répartition peut couvrir deux magasins uniquement si le même groupement est renseigné dans le suivi.';
}

const api={MIN_PRODUCTS,MAX_PRODUCTS,MAX_STORES,norm,productRef,noExpo,eligibleProduct,eligibleProducts,productByRef,siteGroup,buildProposal,assistantAnswer};
root.StoreRunnerCuisinisteProposalV225=api;
if(typeof root.storeRunnerRegisterAssistantResolver==='function')root.storeRunnerRegisterAssistantResolver(assistantAnswer,28);
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
