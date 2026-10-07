(function(){
  'use strict';
  const NOMINATIM_BASE='https://nominatim.openstreetmap.org';
  const NOMINATIM_MIN_INTERVAL_MS=1000;
  let nominatimQueue=Promise.resolve(),nominatimLastStartedAt=0;

  function ensureFeedback(){
    const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
    if(!btn)return null;
    let lookup=document.getElementById('departureLookupBtn');
    if(!lookup){
      lookup=document.createElement('button');
      lookup.id='departureLookupBtn';
      lookup.type='button';
      lookup.className='secondary full';
      lookup.textContent='⌕ Trouver cette ville / adresse';
      lookup.addEventListener('click',function(){window.lookupDepartureAddress()});
      btn.insertAdjacentElement('beforebegin',lookup);
    }
    let box=document.getElementById('departureFeedback');
    if(!box){
      box=document.createElement('div');
      box.id='departureFeedback';
      box.className='departureFeedback';
      box.setAttribute('role','status');
      box.setAttribute('aria-live','polite');
      btn.insertAdjacentElement('afterend',box);
    }
    let attribution=document.getElementById('departureGeocodeAttribution');
    if(!attribution){
      attribution=document.createElement('div');
      attribution.id='departureGeocodeAttribution';
      attribution.className='departureGeocodeAttribution';
      attribution.innerHTML='Recherche d’adresse : <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>';
      box.insertAdjacentElement('afterend',attribution);
    }
    return box;
  }

  function feedback(message,type){
    const box=ensureFeedback();
    if(!box)return;
    box.textContent=message;
    box.className='departureFeedback '+(type||'');
  }

  function toast(message){
    let t=document.getElementById('storeRunnerToast');
    if(!t){
      t=document.createElement('div');
      t.id='storeRunnerToast';
      t.className='storeRunnerToast';
      document.body.appendChild(t);
    }
    t.textContent=message;
    t.classList.add('show');
    clearTimeout(t.__hideTimer);
    t.__hideTimer=setTimeout(function(){t.classList.remove('show')},2200);
  }

  function wait(ms){return new Promise(function(resolve){setTimeout(resolve,ms)})}
  function nominatimFetch(path,timeoutMs){
    const run=async function(){
      const delay=Math.max(0,NOMINATIM_MIN_INTERVAL_MS-(Date.now()-nominatimLastStartedAt));
      if(delay)await wait(delay);
      nominatimLastStartedAt=Date.now();
      const ctrl=new AbortController();
      const timer=setTimeout(function(){ctrl.abort()},timeoutMs);
      try{
        return await fetch(NOMINATIM_BASE+path,{
          headers:{Accept:'application/json'},
          signal:ctrl.signal,
          cache:'default',
          referrerPolicy:'strict-origin-when-cross-origin'
        });
      }finally{clearTimeout(timer)}
    };
    const request=nominatimQueue.then(run,run);
    nominatimQueue=request.then(function(){},function(){});
    return request;
  }

  async function reverseGeocodeInfo(lat,lon){
    if(navigator.onLine===false)return null;
    try{
      const path='/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1';
      const r=await nominatimFetch(path,6000);
      if(!r.ok)return null;
      const data=await r.json(),a=(data&&data.address)||{};
      const city=String(a.city||a.town||a.village||a.municipality||a.hamlet||'').trim();
      return{address:String(data.display_name||'').trim(),city:city};
    }catch(e){return null}
  }

  async function reverseGeocode(lat,lon){
    const info=await reverseGeocodeInfo(lat,lon);
    return info&&info.address||'';
  }

  async function forwardGeocode(query){
    const text=String(query||'').trim();
    if(!text)throw new Error('Saisis une ville ou une adresse de départ.');
    if(navigator.onLine===false)throw new Error('Connexion requise pour rechercher une adresse.');
    try{
      const q=/\bfrance\b/i.test(text)?text:text+', France';
      const path='/search?format=jsonv2&limit=1&countrycodes=fr&addressdetails=1&q='+encodeURIComponent(q);
      const r=await nominatimFetch(path,7000);
      if(!r.ok)throw new Error('Service de recherche d’adresse indisponible ('+r.status+').');
      const rows=await r.json();
      const row=Array.isArray(rows)&&rows[0];
      const lat=Number(row&&row.lat),lon=Number(row&&row.lon);
      if(!row||!isFinite(lat)||!isFinite(lon))throw new Error('Adresse introuvable. Essaie une ville ou une adresse plus précise.');
      const a=row.address||{},city=String(a.city||a.town||a.village||a.municipality||'').trim(),postcode=String(a.postcode||'').trim();
      return{lat:lat,lon:lon,address:String(row.display_name||text).trim(),city:city,postcode:postcode};
    }catch(e){
      if(e&&e.name==='AbortError')throw new Error('La recherche d’adresse a pris trop de temps.');
      throw e;
    }
  }

  async function geocodeDepartureInputs(){
    const nameInput=document.getElementById('pBaseName'),addressInput=document.getElementById('pBaseAddress');
    const latInput=document.getElementById('pBaseLat'),lonInput=document.getElementById('pBaseLon');
    const query=(addressInput&&addressInput.value.trim())||(nameInput&&nameInput.value.trim());
    if(!query)throw new Error('Saisis une ville ou une adresse de départ.');
    feedback('Recherche de « '+query+' »…','busy');
    const found=await forwardGeocode(query);
    if(latInput)latInput.value=found.lat.toFixed(6);
    if(lonInput)lonInput.value=found.lon.toFixed(6);
    if(addressInput)addressInput.value=found.address;
    if(nameInput&&!nameInput.value.trim())nameInput.value=query;
    feedback('Départ trouvé ✓ '+found.address,'ok');
    return found;
  }

  function positionAccuracy(pos){
    const a=Number(pos&&pos.coords&&pos.coords.accuracy);
    return isFinite(a)&&a>0?a:Infinity;
  }

  function validCoordinates(lat,lon){
    if(lat==null||lon==null||String(lat).trim()===''||String(lon).trim()==='')return false;
    lat=Number(lat);lon=Number(lon);
    return isFinite(lat)&&isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180&&!(lat===0&&lon===0);
  }

  const DEPARTURE_DISPLAY_CACHE='store-runner-departure-display-v1';
  let departureDisplayLookup=null;
  function isCurrentGpsProfile(profile){
    const p=profile||{},name=String(p.baseName||'').trim(),address=String(p.baseAddress||'').trim();
    return validCoordinates(p.baseLat,p.baseLon)&&(/^(ma position\b|position(?: actuelle| gps)?(?:\s|$)|gps\b)/i.test(name)||/^position gps\b/i.test(address));
  }
  function departureDisplayKey(profile){
    const p=profile||{};
    return Number(p.baseLat).toFixed(4)+','+Number(p.baseLon).toFixed(4);
  }
  function readDepartureDisplayCache(profile){
    try{
      const raw=window.sessionStorage&&window.sessionStorage.getItem(DEPARTURE_DISPLAY_CACHE);
      if(!raw)return null;
      const cached=JSON.parse(raw);
      return cached&&cached.key===departureDisplayKey(profile)?cached:null;
    }catch(e){return null}
  }
  function writeDepartureDisplayCache(profile,info){
    try{
      if(!window.sessionStorage)return;
      window.sessionStorage.setItem(DEPARTURE_DISPLAY_CACHE,JSON.stringify({
        key:departureDisplayKey(profile),
        city:String(info&&info.city||'').trim(),
        address:String(info&&info.address||'').trim()
      }));
    }catch(e){}
  }
  function departureDisplay(profile){
    const p=profile||((window.state&&state.profile)||{}),name=String(p.baseName||'').trim(),address=String(p.baseAddress||'').trim();
    if(isCurrentGpsProfile(p)){
      const cached=readDepartureDisplayCache(p);
      return{kind:'gps',title:(cached&&cached.city)||'Position actuelle',detail:'Position précise',address:(cached&&cached.address)||''};
    }
    const title=name||address||'À définir';
    return{kind:'saved',title:title,detail:address&&address!==title?address:'',address:address};
  }
  function emitDepartureDisplayUpdated(){
    try{if(typeof window.renderHeader==='function')window.renderHeader()}catch(e){}
    try{document.dispatchEvent(new CustomEvent('store-runner:departure-display-updated',{detail:departureDisplay()}))}catch(e){}
  }
  function refreshDepartureDisplay(profile){
    const p=profile||((window.state&&state.profile)||{});
    if(!isCurrentGpsProfile(p)||navigator.onLine===false)return Promise.resolve(departureDisplay(p));
    const cached=readDepartureDisplayCache(p);
    if(cached&&cached.city)return Promise.resolve(departureDisplay(p));
    const key=departureDisplayKey(p);
    if(departureDisplayLookup&&departureDisplayLookup.key===key)return departureDisplayLookup.promise;
    const promise=(async function(){
      const info=await reverseGeocodeInfo(Number(p.baseLat),Number(p.baseLon));
      if(info&&(info.city||info.address)){writeDepartureDisplayCache(p,info);emitDepartureDisplayUpdated()}
      return departureDisplay(p);
    })().catch(function(){return departureDisplay(p)}).finally(function(){
      if(departureDisplayLookup&&departureDisplayLookup.key===key)departureDisplayLookup=null;
    });
    departureDisplayLookup={key:key,promise:promise};
    return promise;
  }

  function freshPosition(pos,startedAt){
    return !!(pos&&pos.coords&&validCoordinates(pos.coords.latitude,pos.coords.longitude)
      &&Number.isFinite(Number(pos.timestamp))&&Number(pos.timestamp)>=startedAt);
  }

  function acquireBestPosition(onSample){
    return new Promise(function(resolve,reject){
      const geo=navigator.geolocation,opts={enableHighAccuracy:true,timeout:7000,maximumAge:0},startedAt=Date.now();
      if(!geo){reject({code:2,message:'Localisation indisponible'});return}
      let best=null,watchId=null,done=false;
      const finish=function(err){
        if(done)return;done=true;clearTimeout(timer);
        if(watchId!==null&&typeof geo.clearWatch==='function')try{geo.clearWatch(watchId)}catch(e){}
        if(best)resolve(best);else reject(err||{code:3,message:'La localisation a pris trop de temps.'});
      };
      const timer=setTimeout(function(){finish({code:3,message:'La localisation a pris trop de temps.'})},4500);
      const sample=function(pos,single){
        if(done)return;
        if(!freshPosition(pos,startedAt)){
          if(single)finish({code:2,message:'Aucune position fraîche valide reçue.'});
          return;
        }
        if(!best||positionAccuracy(pos)<positionAccuracy(best))best=pos;
        if(typeof onSample==='function')try{onSample(best)}catch(e){}
        if(single||positionAccuracy(best)<=10)finish();
      };
      const oneFix=function(){
        try{geo.getCurrentPosition(function(pos){sample(pos,true)},finish,opts)}catch(err){finish(err)}
      };
      if(typeof geo.watchPosition!=='function'){oneFix();return}
      try{
        watchId=geo.watchPosition(function(pos){
          sample(pos,false);
        },function(err){
          if(err&&err.code===1)finish(err);
          else if(!best&&err&&err.code===2)finish(err);
        },opts);
        // Some embedded implementations deliver a fix before returning the watch id.
        if(done&&watchId!==null&&typeof geo.clearWatch==='function')try{geo.clearWatch(watchId)}catch(e){}
      }catch(e){
        oneFix();
      }
    });
  }

  function validBase(){
    if(!window.state||!state.profile)return false;
    return validCoordinates(state.profile.baseLat,state.profile.baseLon);
  }

  function explicitUserBase(){
    if(!validBase())return false;
    const p=state.profile,name=String(p.baseName||'').trim(),address=String(p.baseAddress||'').trim();
    // Historical GPS fixes share the profile shape with saved user addresses.
    // Without provenance, never infer that a generic/current-position value is a domicile.
    if(/^(ma position\b|position(?: actuelle| gps)?(?:\s|$)|gps\b)/i.test(name)||/^position gps\b/i.test(address))return false;
    // Saving explicit coordinates with a user name (e.g. Domicile) is an existing,
    // supported profile flow; an address is not mandatory in that flow.
    return !!address||!!(name&&!/^(départ|depart|base)$/i.test(name));
  }

  function locationFailure(err){
    if(err&&err.code===1)return 'Localisation refusée.';
    if(err&&err.code===3)return 'La localisation a pris trop de temps.';
    return err&&err.message?String(err.message):'Localisation indisponible.';
  }

  /* r38 — origine de planification en deux temps. `resolvePlanningOrigin` lit une position
     fraîche (mêmes règles : maximumAge 0, horodatage, précision ≤ 250 m) ou le repli sur une
     base enregistrée fiable, SANS rien écrire. `applyPlanningOrigin` publie ensuite cette
     origine dans les champs de départ existants. La génération enchaîne les deux comme avant ;
     une commande planning lit d'abord, et n'écrit qu'après validation de l'utilisateur. */
  async function resolvePlanningOrigin(){
    try{
      // Requesting a fix performs the browser/Android permission check and prompts
      // at the user's generation click when permission has not been granted yet.
      const pos=await acquireBestPosition();
      const accuracy=Math.round(positionAccuracy(pos));
      if(accuracy>250)throw {code:2,message:'Position trop imprécise (±'+accuracy+' m).'};
      if(!window.state||!state.profile)throw {code:2,message:'Point de départ indisponible.'};
      const lat=Number(pos.coords.latitude),lon=Number(pos.coords.longitude);
      return {ok:true,source:'gps',lat:lat,lon:lon,accuracy:accuracy,baseName:'Ma position actuelle',baseAddress:'Position GPS · '+lat.toFixed(5)+', '+lon.toFixed(5),message:'Position fraîche retenue à ±'+accuracy+' m.'};
    }catch(err){
      if(explicitUserBase()){
        const message=locationFailure(err)+' Utilisation de la base enregistrée « '+(state.profile.baseName||state.profile.baseAddress)+' ».';
        return {ok:true,source:'saved_base',lat:Number(state.profile.baseLat),lon:Number(state.profile.baseLon),baseName:state.profile.baseName||'',baseAddress:state.profile.baseAddress||'',message:message};
      }
      return {ok:false,source:'none',error:locationFailure(err)+' Une localisation fraîche est requise : autorise la localisation ou enregistre une adresse de base fiable dans Mon secteur.'};
    }
  }
  function applyPlanningOrigin(origin,profile){
    const target=profile||(window.state&&state.profile);
    if(!origin||origin.ok!==true||!target)return false;
    if(origin.source==='gps'){
      if(!validCoordinates(origin.lat,origin.lon))return false;
      target.baseLat=Number(origin.lat);target.baseLon=Number(origin.lon);
      target.baseName=origin.baseName;target.baseAddress=origin.baseAddress;
      refreshDepartureDisplay(target);
    }
    if(!profile||profile===(window.state&&state.profile))installPersistedBase();
    return true;
  }
  async function preparePlanningOrigin(){
    feedback('Recherche d’une position fraîche avant la génération…','busy');
    const origin=await resolvePlanningOrigin();
    if(!origin.ok){
      feedback(origin.error,'bad');
      throw new Error(origin.error);
    }
    applyPlanningOrigin(origin);
    feedback(origin.message,'ok');
    return {ok:true,source:origin.source,base:window.baseObj(),message:origin.message};
  }

  function installPersistedBase(){
    if(!validBase())return;
    window.baseObj=function(){
      return{id:'BASE',enseigne:'Départ',ville:state.profile.baseName||'Départ',adresse:state.profile.baseAddress||'',lat:Number(state.profile.baseLat),lon:Number(state.profile.baseLon)};
    };
    window.havBase=function(store){return typeof hav==='function'?hav(baseObj(),store):0};
    if(typeof window.renderHeader==='function'){
      try{window.renderHeader()}catch(e){}
    }
  }

  function emitProfileSaved(){
    try{
      document.dispatchEvent(new CustomEvent('store-runner:profile-saved',{detail:{
        baseName:state.profile.baseName||'Départ',
        baseAddress:state.profile.baseAddress||'',
        baseLat:Number(state.profile.baseLat),
        baseLon:Number(state.profile.baseLon)
      }}));
    }catch(e){}
  }

  function ensureCss(){
    if(document.getElementById('profile-controller-css'))return;
    const s=document.createElement('style');
    s.id='profile-controller-css';
    s.textContent=`
      .departureFeedback{min-height:20px;margin:7px 2px 0;font-size:12px;color:#667085;line-height:1.35}
      .departureFeedback.ok{color:#137333;font-weight:700}.departureFeedback.bad{color:#b42318;font-weight:700}.departureFeedback.busy{color:#1769d2}
      .departureGeocodeAttribution{margin:3px 2px 0;font-size:10.5px;line-height:1.35;color:#7a8290}.departureGeocodeAttribution a{color:#667085;text-decoration:underline;text-underline-offset:2px}
      #departureSettings button:disabled{opacity:.62;cursor:wait}
      .storeRunnerToast{position:fixed;left:50%;bottom:96px;z-index:260;transform:translate(-50%,14px);background:#111827;color:#fff;padding:11px 15px;border-radius:999px;font-size:13px;font-weight:750;box-shadow:0 12px 32px rgba(17,24,39,.25);opacity:0;pointer-events:none;transition:.18s ease;white-space:nowrap;max-width:calc(100vw - 28px);overflow:hidden;text-overflow:ellipsis}
      .storeRunnerToast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:650px){.storeRunnerToast{bottom:92px}}
    `;
    document.head.appendChild(s);
  }

  window.storeRunnerToast=toast;
  window.StoreRunnerGeocode={forward:forwardGeocode,reverse:reverseGeocode};
  window.storeRunnerHasValidBase=validBase;
  window.StoreRunnerProfile={preparePlanningOrigin:preparePlanningOrigin,resolvePlanningOrigin:resolvePlanningOrigin,applyPlanningOrigin:applyPlanningOrigin,departureDisplay:departureDisplay,refreshDepartureDisplay:refreshDepartureDisplay};
  window.storeRunnerPreparePlanningOrigin=preparePlanningOrigin;
  window.lookupDepartureAddress=async function(){
    const btn=document.getElementById('departureLookupBtn');
    if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='⌕ Recherche…'}
    try{
      const found=await geocodeDepartureInputs();
      toast('Départ trouvé ✓');
      return found;
    }catch(e){
      const message=e&&e.message?e.message:'Adresse introuvable.';
      feedback(message,'bad');
      if(typeof showError==='function')showError(message);
      return null;
    }finally{
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌕ Trouver cette ville / adresse'}
    }
  };

  window.useCurrentLocation=async function(){
    const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
    if(!navigator.geolocation){feedback('Localisation indisponible sur cet appareil.','bad');return}
    if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='⌖ Localisation…'}
    feedback('Recherche et affinage de la position GPS…','busy');
    try{
      const pos=await acquireBestPosition(function(best){
        const a=Math.round(positionAccuracy(best));
        if(isFinite(a))feedback('Affinage GPS… meilleur signal ±'+a+' m','busy');
      });
      const accuracy=Math.round(positionAccuracy(pos));
      if(accuracy>250){
        feedback('Position trop imprécise (±'+accuracy+' m). Active « Localisation précise » pour Store Runner puis réessaie.','bad');
        return;
      }
      const lat=Number(pos.coords.latitude),lon=Number(pos.coords.longitude);
      const latInput=document.getElementById('pBaseLat'),lonInput=document.getElementById('pBaseLon'),nameInput=document.getElementById('pBaseName'),addressInput=document.getElementById('pBaseAddress');
      if(latInput)latInput.value=lat.toFixed(6);
      if(lonInput)lonInput.value=lon.toFixed(6);
      if(nameInput)nameInput.value='Ma position actuelle';
      if(addressInput)addressInput.value='Position GPS · '+lat.toFixed(5)+', '+lon.toFixed(5);
      feedback('Meilleure position retenue à ±'+accuracy+' m ✓','ok');
      const address=await reverseGeocode(lat,lon);
      if(address&&addressInput){addressInput.value=address;feedback('Position et adresse récupérées à ±'+accuracy+' m ✓','ok')}
    }catch(err){
      let msg='Impossible de récupérer ta position.';
      if(err&&err.code===1)msg='Localisation refusée. Autorise Store Runner et active « Localisation précise ».';
      else if(err&&err.code===2)msg='Position GPS indisponible pour le moment.';
      else if(err&&err.code===3)msg='La localisation a pris trop de temps.';
      feedback(msg,'bad');
    }finally{
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
    }
  };

  window.saveProfile=async function(){
    try{
      let lat=parseFloat(document.getElementById('pBaseLat').value),lon=parseFloat(document.getElementById('pBaseLon').value);
      if(isNaN(lat)||isNaN(lon)){
        const found=await geocodeDepartureInputs();
        lat=found.lat;lon=found.lon;
      }
      state.profile.sectorName=document.getElementById('pSector').value.trim()||'Mon secteur';
      state.profile.repName=document.getElementById('pRep').value.trim();
      state.profile.baseName=document.getElementById('pBaseName').value.trim()||'Départ';
      state.profile.baseAddress=document.getElementById('pBaseAddress').value.trim();
      state.profile.baseLat=lat;
      state.profile.baseLon=lon;
      state.profile.overnightMode=document.getElementById('pOvernight').value;
      const overnightMinSaving=parseFloat(document.getElementById('pSaving').value);
      state.profile.overnightMinSaving=Number.isFinite(overnightMinSaving)&&overnightMinSaving>=0?overnightMinSaving:80;
      save();
      installPersistedBase();
      refreshDepartureDisplay(state.profile);
      if(typeof renderAll==='function')renderAll();
      feedback('Réglages enregistrés ✓','ok');
      toast('Réglages enregistrés ✓');
      emitProfileSaved();
      return true;
    }catch(e){
      const message=e&&e.message?e.message:'Enregistrement impossible.';
      feedback(message,'bad');
      if(typeof showError==='function')showError(message);
      return false;
    }
  };

  function boot(){ensureCss();ensureFeedback();installPersistedBase();refreshDepartureDisplay()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('focus',function(){setTimeout(installPersistedBase,30)});
})();
