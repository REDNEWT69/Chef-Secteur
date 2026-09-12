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

  async function reverseGeocode(lat,lon){
    if(navigator.onLine===false)return '';
    try{
      const path='/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1';
      const r=await nominatimFetch(path,6000);
      if(!r.ok)return '';
      const data=await r.json();
      return String(data.display_name||'').trim();
    }catch(e){return ''}
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
      return{lat:lat,lon:lon,address:String(row.display_name||text).trim()};
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

  function acquireBestPosition(onSample){
    return new Promise(function(resolve,reject){
      const geo=navigator.geolocation,opts={enableHighAccuracy:true,timeout:7000,maximumAge:0};
      if(!geo){reject({code:2,message:'Localisation indisponible'});return}
      if(typeof geo.watchPosition!=='function'){
        geo.getCurrentPosition(resolve,reject,opts);
        return;
      }
      let best=null,watchId=null,done=false;
      const finish=function(err){
        if(done)return;done=true;clearTimeout(timer);
        if(watchId!==null&&typeof geo.clearWatch==='function')try{geo.clearWatch(watchId)}catch(e){}
        if(best)resolve(best);else reject(err||{code:3,message:'La localisation a pris trop de temps.'});
      };
      const timer=setTimeout(function(){finish({code:3,message:'La localisation a pris trop de temps.'})},4500);
      try{
        watchId=geo.watchPosition(function(pos){
          if(!pos||!pos.coords||!isFinite(Number(pos.coords.latitude))||!isFinite(Number(pos.coords.longitude)))return;
          if(!best||positionAccuracy(pos)<positionAccuracy(best))best=pos;
          if(typeof onSample==='function')try{onSample(best)}catch(e){}
          if(positionAccuracy(best)<=10)finish();
        },function(err){
          if(err&&err.code===1)finish(err);
          else if(!best&&err&&err.code===2)finish(err);
        },opts);
      }catch(e){
        clearTimeout(timer);done=true;
        try{geo.getCurrentPosition(resolve,reject,opts)}catch(err){reject(err)}
      }
    });
  }

  function validBase(){
    if(!window.state||!state.profile)return false;
    const lat=Number(state.profile.baseLat),lon=Number(state.profile.baseLon);
    return isFinite(lat)&&isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180&&!(lat===0&&lon===0);
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
  window.storeRunnerHasValidBase=validBase;
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
      state.profile.overnightMinSaving=parseFloat(document.getElementById('pSaving').value)||80;
      save();
      installPersistedBase();
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

  function boot(){ensureCss();ensureFeedback();installPersistedBase()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('focus',function(){setTimeout(installPersistedBase,30)});
})();
