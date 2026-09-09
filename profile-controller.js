(function(){
  'use strict';

  function ensureFeedback(){
    const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
    if(!btn)return null;
    let box=document.getElementById('departureFeedback');
    if(!box){
      box=document.createElement('div');
      box.id='departureFeedback';
      box.className='departureFeedback';
      box.setAttribute('role','status');
      box.setAttribute('aria-live','polite');
      btn.insertAdjacentElement('afterend',box);
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

  async function reverseGeocode(lat,lon){
    if(navigator.onLine===false)return '';
    try{
      const ctrl=new AbortController();
      const timer=setTimeout(function(){ctrl.abort()},6000);
      const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon)+'&zoom=18&addressdetails=1';
      const r=await fetch(url,{headers:{Accept:'application/json'},signal:ctrl.signal,cache:'no-store'});
      clearTimeout(timer);
      if(!r.ok)return '';
      const data=await r.json();
      return String(data.display_name||'').trim();
    }catch(e){return ''}
  }

  function validBase(){
    return window.state&&state.profile&&isFinite(Number(state.profile.baseLat))&&isFinite(Number(state.profile.baseLon))&&Math.abs(Number(state.profile.baseLat))>1&&Math.abs(Number(state.profile.baseLon))>1;
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

  function ensureCss(){
    if(document.getElementById('profile-controller-css'))return;
    const s=document.createElement('style');
    s.id='profile-controller-css';
    s.textContent=`
      .departureFeedback{min-height:20px;margin:7px 2px 0;font-size:12px;color:#667085;line-height:1.35}
      .departureFeedback.ok{color:#137333;font-weight:700}.departureFeedback.bad{color:#b42318;font-weight:700}.departureFeedback.busy{color:#1769d2}
      #departureSettings button:disabled{opacity:.62;cursor:wait}
      .storeRunnerToast{position:fixed;left:50%;bottom:96px;z-index:260;transform:translate(-50%,14px);background:#111827;color:#fff;padding:11px 15px;border-radius:999px;font-size:13px;font-weight:750;box-shadow:0 12px 32px rgba(17,24,39,.25);opacity:0;pointer-events:none;transition:.18s ease;white-space:nowrap;max-width:calc(100vw - 28px);overflow:hidden;text-overflow:ellipsis}
      .storeRunnerToast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:650px){.storeRunnerToast{bottom:92px}}
    `;
    document.head.appendChild(s);
  }

  window.useCurrentLocation=function(){
    const btn=document.querySelector('#departureSettings button[onclick="useCurrentLocation()"]');
    if(!navigator.geolocation){feedback('Localisation indisponible sur cet appareil.','bad');return}
    if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='⌖ Localisation…'}
    feedback('Recherche d’une position GPS précise…','busy');
    navigator.geolocation.getCurrentPosition(async function(pos){
      const accuracy=Math.round(Number(pos.coords.accuracy)||0);
      if(accuracy>250){
        feedback('Position trop imprécise (±'+accuracy+' m). Active « Localisation précise » pour Store Runner puis réessaie.','bad');
        if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
        return;
      }
      const lat=Number(pos.coords.latitude),lon=Number(pos.coords.longitude);
      const latInput=document.getElementById('pBaseLat'),lonInput=document.getElementById('pBaseLon'),nameInput=document.getElementById('pBaseName'),addressInput=document.getElementById('pBaseAddress');
      if(latInput)latInput.value=lat.toFixed(6);
      if(lonInput)lonInput.value=lon.toFixed(6);
      if(nameInput)nameInput.value='Ma position actuelle';
      if(addressInput)addressInput.value='Position GPS · '+lat.toFixed(5)+', '+lon.toFixed(5);
      feedback('Position récupérée à ±'+accuracy+' m ✓','ok');
      const address=await reverseGeocode(lat,lon);
      if(address&&addressInput){addressInput.value=address;feedback('Position et adresse récupérées à ±'+accuracy+' m ✓','ok')}
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
    },function(err){
      let msg='Impossible de récupérer ta position.';
      if(err&&err.code===1)msg='Localisation refusée. Autorise Store Runner et active « Localisation précise ».';
      else if(err&&err.code===2)msg='Position GPS indisponible pour le moment.';
      else if(err&&err.code===3)msg='La localisation a pris trop de temps.';
      feedback(msg,'bad');
      if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'⌖ Utiliser ma position actuelle'}
    },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  };

  window.saveProfile=function(){
    try{
      const lat=parseFloat(document.getElementById('pBaseLat').value),lon=parseFloat(document.getElementById('pBaseLon').value);
      if(isNaN(lat)||isNaN(lon))throw new Error('Latitude/longitude de base obligatoires.');
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
    }catch(e){
      feedback(e&&e.message?e.message:'Enregistrement impossible.','bad');
      if(typeof showError==='function')showError(e.message||String(e));
      throw e;
    }
  };

  function boot(){ensureCss();ensureFeedback();installPersistedBase()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('focus',function(){setTimeout(installPersistedBase,30)});
})();
