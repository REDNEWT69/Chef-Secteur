(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  const RANGE_KEY='chef_sector_range_v1';
  let installed=false;
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
  function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
  function loadArchive(){try{return JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){return{}}}
  function saveArchive(a){try{localStorage.setItem(ARCHIVE_KEY,JSON.stringify(a))}catch(e){}}
  function cloneStore(s){return{id:s.id||'',enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||'',dept:s.dept||'',lat:s.lat,lon:s.lon,freq:s.freq||'',priority:s.priority,lastVisit:s.lastVisit||'',intervalDays:s.intervalDays}}
  function formatRange(a,b){const f={day:'2-digit',month:'2-digit',year:'numeric'};return a.toLocaleDateString('fr-FR',f)+' → '+b.toLocaleDateString('fr-FR',f)}
  function defaultDates(){let raw=null;try{raw=state.settings&&state.settings.weekDate}catch(e){}const m=monday(parse(raw)||new Date()),f=addDays(m,4);return{start:iso(m),end:iso(f)}}
  function setNativeWeekDate(v){try{if(!state.settings)state.settings={};state.settings.weekDate=v;const el=document.getElementById('weekDate');if(el)el.value=v}catch(e){}}
  function showStatus(text,bad){const el=document.getElementById('rangePlanStatus');if(!el)return;el.textContent=text;el.style.color=bad?'#b42318':'#667085'}
  function isWeeklyStore(s){const f=String(s&&s.freq||'').toLowerCase();return /hebdo|weekly|semaine/.test(f)||Number(s&&s.intervalDays||99)<=7}
  function restoreExcluded(original){state.excluded={};for(const k of Object.keys(original||{}))if(original[k])state.excluded[k]=true}
  function selectedDaysFromUI(){
    const out=[];document.querySelectorAll('[data-day]').forEach(el=>{if(el.checked&&DAYS.includes(el.value))out.push(el.value)});
    return out;
  }
  function readBaseControls(){
    if(typeof window.readPlanningControls==='function')window.readPlanningControls();
    const uiDays=selectedDaysFromUI();
    if(!uiDays.length)throw new Error('Choisis au moins un jour travaillé.');
    state.settings.days=uiDays.slice();
    if(!uiDays.includes('Samedi'))state.settings.days=state.settings.days.filter(d=>d!=='Samedi');
    const end=document.getElementById('endTime');if(end&&end.value)state.settings.endTime=end.value;
    const max=document.getElementById('maxVisitsPerDay');if(max&&max.value)state.settings.maxVisitsPerDay=Math.max(1,Math.min(8,Number(max.value)||4));
    if(typeof save==='function')save();
    return uiDays;
  }
  function markTempExclusions(used,originalExcluded){if(!state.excluded)state.excluded={};for(const id of used){const s=(state.stores||[]).find(x=>String(x.id)===String(id));if(!s||isWeeklyStore(s)||originalExcluded[id])continue;state.excluded[id]=true}}
  function collectUsed(plan){const out=[];for(const d of DAYS)for(const s of ((plan&&plan[d])||[]))if(s&&s.id!=null)out.push(String(s.id));return out}
  function routeFinish(route,day){
    if(!route||!route.length)return 0;const p=t=>{const a=String(t||'').split(':');return (+a[0]||0)*60+(+a[1]||0)};
    const start=p(day==='Samedi'?(state.settings.saturdayStart||'08:00'):(state.settings.startTime||'08:30'));
    let km=0;try{km+=havBase(route[0]);for(let i=1;i<route.length;i++)km+=hav(route[i-1],route[i]);km+=hav(route[route.length-1],baseObj())}catch(e){}
    return start+(km*1.22/55*60)+(route.length*Number(state.settings.visitMinutes||60));
  }
  function enforceCapacity(plan,workDays){
    const max=Math.max(1,Math.min(8,Number(state.settings.maxVisitsPerDay)||4));
    for(const day of DAYS){
      if(!workDays.includes(day)){plan[day]=[];continue}
      let route=(plan[day]||[]).slice(0,max);
      const limit=(function(t){const a=String(t||'').split(':');return (+a[0]||0)*60+(+a[1]||0)})(day==='Samedi'?(state.settings.saturdayEnd||'12:00'):(state.settings.endTime||'18:00'));
      while(route.length&&routeFinish(route,day)>limit)route.pop();
      plan[day]=route;
    }
    return plan;
  }
  function snapshotWeek(mon,start,end,plan,workDays){
    const out={weekMonday:iso(mon),plan:{}};
    for(let i=0;i<DAYS.length;i++){
      const day=DAYS[i],date=addDays(mon,i),inside=date>=start&&date<=end&&workDays.includes(day);
      out.plan[day]=inside?((plan[day]||[]).map(cloneStore)):[];
    }
    return out;
  }
  function buildWeek(workDays,target){
    const selected=selectStores(Math.max(1,target));
    if(!selected.length)return Object.fromEntries(DAYS.map(d=>[d,[]]));
    const groups=cluster(selected,workDays);
    const plan=optimize(groups,workDays);
    for(const d of DAYS)if(!plan[d])plan[d]=[];
    return enforceCapacity(plan,workDays);
  }
  async function generateRange(){
    const sEl=document.getElementById('rangeStart'),eEl=document.getElementById('rangeEnd'),start=parse(sEl&&sEl.value),end=parse(eEl&&eEl.value);
    if(!start||!end)return showStatus('Choisis une date de début et une date de fin.',true);
    if(end<start)return showStatus('La date de fin doit être après la date de début.',true);
    const span=Math.round((end-start)/86400000)+1;if(span>93)return showStatus('Pour rester lisible, limite une génération à 3 mois maximum.',true);
    if(typeof selectStores!=='function'||typeof cluster!=='function'||typeof optimize!=='function')return showStatus('Le moteur de planning n’est pas encore prêt.',true);
    const btn=document.getElementById('generateRangeBtn');if(btn)btn.disabled=true;
    let workDays=[];try{workDays=readBaseControls()}catch(e){if(btn)btn.disabled=false;return showStatus(e.message||String(e),true)}
    const archive=loadArchive(),firstMon=monday(start),lastMon=monday(end),originalWeek=state.settings&&state.settings.weekDate,originalExcluded=Object.assign({},state.excluded||{}),used=new Set();
    const target=Math.max(1,Number((state.settings&&state.settings.target)||20));
    let count=0,mon=new Date(firstMon),emptyWeeks=0;
    try{
      while(mon<=lastMon){
        restoreExcluded(originalExcluded);markTempExclusions(used,originalExcluded);setNativeWeekDate(iso(mon));
        let plan=buildWeek(workDays,target);
        let total=workDays.reduce((n,d)=>n+(plan[d]||[]).length,0);
        if(!total&&used.size){used.clear();restoreExcluded(originalExcluded);plan=buildWeek(workDays,target);total=workDays.reduce((n,d)=>n+(plan[d]||[]).length,0)}
        if(!total)emptyWeeks++;
        const ids=collectUsed(plan);for(const id of ids){const s=(state.stores||[]).find(x=>String(x.id)===id);if(s&&!isWeeklyStore(s))used.add(id)}
        archive[iso(mon)]=snapshotWeek(mon,start,end,plan,workDays);
        count++;mon=addDays(mon,7);await new Promise(r=>setTimeout(r,20));
      }
      restoreExcluded(originalExcluded);saveArchive(archive);
      localStorage.setItem(RANGE_KEY,JSON.stringify({start:iso(start),end:iso(end),weeks:count,workDays:workDays.slice(),smartRotation:true,updatedAt:new Date().toISOString()}));
      setNativeWeekDate(iso(firstMon));
      const first=archive[iso(firstMon)];state.plan={};for(const d of DAYS)state.plan[d]=first&&first.plan?(first.plan[d]||[]).map(x=>(state.stores||[]).find(s=>String(s.id)===String(x.id))||x):[];
      state.settings.days=workDays.slice();
      try{if(typeof save==='function')save();if(typeof renderAll==='function')renderAll()}catch(e){}
      showStatus('Période générée : '+formatRange(start,end)+' · '+count+' semaine'+(count>1?'s':'')+(emptyWeeks?' · '+emptyWeeks+' semaine(s) vide(s)':'')+'.');
      window.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:iso(start),end:iso(end),weeks:count,workDays:workDays.slice()}}));
    }catch(e){restoreExcluded(originalExcluded);if(originalWeek)setNativeWeekDate(originalWeek);showStatus('Erreur pendant la génération : '+(e&&e.message?e.message:String(e)),true)}finally{restoreExcluded(originalExcluded);if(btn)btn.disabled=false}
  }
  function movePairToBottom(settings,inputId){const input=document.getElementById(inputId);if(!input)return;const label=input.previousElementSibling;if(label&&label.tagName==='LABEL')settings.appendChild(label);settings.appendChild(input)}
  function moveBlockToBottom(settings,boxId){const box=document.getElementById(boxId);if(!box)return;const label=box.previousElementSibling;if(label&&label.tagName==='LABEL')settings.appendChild(label);settings.appendChild(box)}
  function install(){
    if(installed)return true;
    const settings=document.querySelector('#planningSettings .settingsInner'),weekInput=document.getElementById('weekDate');if(!settings||!weekInput)return false;
    const oldLabel=weekInput.previousElementSibling;if(oldLabel&&oldLabel.tagName==='LABEL')oldLabel.style.display='none';weekInput.style.display='none';
    const d=defaultDates(),box=document.createElement('div');box.id='rangePlannerCard';box.style.cssText='margin:0 0 14px;padding:14px;border:1px solid #dfe5ef;border-radius:16px;background:#f8faff';
    box.innerHTML='<label style="margin-top:0">Période du planning</label><div class="formgrid"><div><label for="rangeStart">Date de début</label><input id="rangeStart" type="date" value="'+d.start+'"></div><div><label for="rangeEnd">Date de fin</label><input id="rangeEnd" type="date" value="'+d.end+'"></div></div><button id="generateRangeBtn" class="primary full" type="button">Générer la période</button><div id="rangePlanStatus" class="tiny" style="margin-top:9px">La période respecte strictement les jours cochés et régénère chaque semaine indépendamment.</div>';
    settings.insertBefore(box,settings.firstChild);document.getElementById('generateRangeBtn').addEventListener('click',generateRange);moveBlockToBottom(settings,'brandsBox');movePairToBottom(settings,'target');installed=true;return true
  }
  window.generatePlanningRange=generateRange;
  let tries=0,t=setInterval(function(){tries++;if(install()||tries>120)clearInterval(t)},100);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else setTimeout(install,0);
})();
