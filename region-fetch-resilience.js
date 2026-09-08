/* Resilient network fallback for the regional OpenStreetMap scan. */
(function(root){
'use strict';
if(!root.fetch||root.__regionFetchResilienceInstalled)return;
root.__regionFetchResilienceInstalled=true;
const nativeFetch=root.fetch.bind(root);
const OVERPASS=[
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
function isRegionOverpass(url){return typeof url==='string'&&url.indexOf('overpass.private.coffee/api/interpreter')!==-1}
async function tryEndpoint(url,options,outerSignal){
  const local=new AbortController();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;local.abort()},12000);
  const abortOuter=()=>local.abort();
  if(outerSignal){if(outerSignal.aborted){clearTimeout(timer);throw new DOMException('Aborted','AbortError')}outerSignal.addEventListener('abort',abortOuter,{once:true})}
  try{
    const copy={...(options||{}),signal:local.signal};
    const response=await nativeFetch(url,copy);
    if(response.ok)return response;
    const err=new Error('HTTP '+response.status);err.status=response.status;throw err;
  }catch(e){
    if(outerSignal&&outerSignal.aborted)throw new DOMException('Aborted','AbortError');
    if(timedOut){const err=new Error('TIMEOUT');err.code='REGION_TIMEOUT';throw err}
    throw e;
  }finally{
    clearTimeout(timer);
    if(outerSignal)outerSignal.removeEventListener('abort',abortOuter);
  }
}
root.fetch=async function(input,options){
  const url=typeof input==='string'?input:(input&&input.url)||'';
  if(!isRegionOverpass(url))return nativeFetch(input,options);
  const outerSignal=options&&options.signal;
  let lastError=null;
  for(let i=0;i<OVERPASS.length;i++){
    try{return await tryEndpoint(OVERPASS[i],options,outerSignal)}catch(e){
      if(e&&e.name==='AbortError'&&outerSignal&&outerSignal.aborted)throw e;
      lastError=e;
    }
  }
  const err=new Error('Les services cartographiques sont momentanément saturés. Réessaie dans quelques instants.');
  err.cause=lastError;
  throw err;
};
})(window);
