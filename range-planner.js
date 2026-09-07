(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  let installed=false;
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
  function monday(d){const x=new Date(d),w=x.getDay()||7;x.setDate(x.getDate()-w+1);return x}
  function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
  function loadArchive(){try{return JSON.parse(localStorage.getItem(ARCHIVE_KEY)||'{}')||{}}catch(e){return{}}}
  function saveArchive(a){try{localStorage.setItem(ARCHIVE_KEY,JSON.stringify(a))}catch(e){}}
  function cloneStore(s){return{id:s.id||'',enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||'',dept:s.dept||'',lat:s.lat,lon:s.lon,freq:s.freq||'',priority:s.priority,lastVisit:s.lastVisit||'',intervalDays:s.intervalDays}}
  function snapshotWeek(mon,start,end){const out={weekMonday:iso(mon),plan:{}};for(let i=0;i<DAYS.length;i++){const day=DAYS[i],date=addDays(mon,i),inside=date>=start&&date<=end;out.plan[day]=inside?(((state.plan&&state.plan[day])||[]).map(cloneStore)):[];if(!inside&&state.plan)state.plan[day]=[]}return out}
  function formatRange(a,b){const f={day:'2-digit',month:'2-digit',year:'numeric'};return a.toLocaleDateString('fr-FR',f)+' → '+b.toLocaleDateString('fr-FR',f)}
  function defaultDates(){let raw=null;try{raw=state.settings&&state.settings.weekDate}catch(e){}const m=monday(parse(raw)||new Date()),f=addDays(m,4);return{start:iso(m),end:iso(f)}}
  function setNativeWeekDate(v){try{if(!state.settings)state.settings={};state.settings.weekDate=v;const el=document.getElementById('weekDate');if(el){el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))}}catch(e){}}
  function showStatus(text,bad){const el=document.getElementById('rangePlanStatus');if(!el)return;el.textContent=text;el.style.color=bad?'#b42318':'#667085'}
  function isWeeklyStore(s){const f=String(s&&s.freq||'').toLowerCase();return /hebdo|weekly|semaine/.test(f)||Number(s&&s.intervalDays||99)<=7}
  function markTempExclusions(used,originalExcluded){if(!state.excluded)state.excluded={};for(const id of used){const s=(state.stores||[]).find(x=>String(x.id)===String(id));if(!s||isWeeklyStore(s)||originalExcluded[id])continue;state.excluded[id]=true}}
  function restoreExcluded(original){state.excluded={};for(const k of Object.keys(original||{}))if(original[k])state.excluded[k]=true}
  function collectUsed(){const out=[];for(const d of DAYS)for(const s of ((state.plan&&state.plan[d])||[]))if(s&&s.id!=null)out.push(String(s.id));return out}
  function eligibleNonWeeklyCount(originalExcluded){let n=0;try{for(const s of (state.stores||[])){if(s.active===false||originalExcluded[s.id]||isWeeklyStore(s))continue;if(typeof includedByFilters==='function'&&!includedByFilters(s))continue;n++}}catch(e){}return n}
  function planCount(){let n=0;for(const d of DAYS)n+=((state.plan&&state.plan[d])||[]).length;return n}
  function generateOneWeek(monIso,originalExcluded,used){
    restoreExcluded(originalExcluded);markTempExclusions(used,originalExcluded);setNativeWeekDate(monIso);window.generateWeek();
    let count=planCount();
    if(count===0&&used.size){
      used.clear();restoreExcluded(originalExcluded);setNativeWeekDate(monIso);window.generateWeek();count=planCount();
    }
    return count;
  }
  async function generateRange(){
    const sEl=document.getElementById('rangeStart'),eEl=document.getElementById('rangeEnd'),start=parse(sEl&&sEl.value),end=parse(eEl&&eEl.value);
    if(!start||!end)return showStatus('Choisis une date de début et une date de fin.',true);
    if(end<start)return showStatus('La date de fin doit être après la date de début.',true);
    const span=Math.round((end-start)/86400000)+1;if(span>93)return showStatus('Pour rester lisible, limite une génération à 3 mois maximum.',true);
    if(typeof window.generateWeek!=='function')return showStatus('Le moteur de planning n’est pas encore prêt.',true);
    const btn=document.getElementById('generateRangeBtn');if(btn)btn.disabled=true;
    const archive=loadArchive(),firstMon=monday(start),lastMon=monday(end),originalWeek=state.settings&&state.settings.weekDate,originalExcluded=Object.assign({},state.excluded||{}),used=new Set();
    const eligible=eligibleNonWeeklyCount(originalExcluded),target=Math.max(1,Number((state.settings&&state.settings.target)||20));
    let count=0,mon=new Date(firstMon),rotations=0,emptyWeeks=0;
    try{
      while(mon<=lastMon){
        if(eligible>0&&used.size>=Math.max(1,eligible-target+1))used.clear();
        const monIso=iso(mon),generated=generateOneWeek(monIso,originalExcluded,used);
        if(!generated)emptyWeeks++;
        const ids=collectUsed();for(const id of ids){const s=(state.stores||[]).find(x=>String(x.id)===id);if(s&&!isWeeklyStore(s))used.add(id)}
        archive[monIso]=snapshotWeek(mon,start,end);count++;rotations+=ids.length;mon=addDays(mon,7);await new Promise(r=>setTimeout(r,35));
      }
      restoreExcluded(originalExcluded);saveArchive(archive);setNativeWeekDate(iso(firstMon));
      const first=archive[iso(firstMon)];if(first&&first.plan){state.plan={};for(const d of DAYS)state.plan[d]=(first.plan[d]||[]).map(x=>{try{return (state.stores||[]).find(s=>String(s.id)===String(x.id))||x}catch(e){return x}})}
      try{if(typeof save==='function')save();if(typeof renderAll==='function')renderAll()}catch(e){}
      try{localStorage.setItem('chef_sector_range_v1',JSON.stringify({start:iso(start),end:iso(end),weeks:count,smartRotation:true,updatedAt:new Date().toISOString()}))}catch(e){}
      showStatus('Période générée : '+formatRange(start,end)+' · '+count+' semaine'+(count>1?'s':'')+(emptyWeeks?' · '+emptyWeeks+' semaine(s) sans magasin disponible':'')+'.');
      window.dispatchEvent(new CustomEvent('chef-range-generated',{detail:{start:iso(start),end:iso(end),weeks:count}}));
    }catch(e){restoreExcluded(originalExcluded);showStatus('Erreur pendant la génération : '+(e&&e.message?e.message:String(e)),true);if(originalWeek)setNativeWeekDate(originalWeek)}finally{restoreExcluded(originalExcluded);if(btn)btn.disabled=false}
  }
  function movePairToBottom(settings,inputId){const input=document.getElementById(inputId);if(!input)return;const label=input.previousElementSibling;if(label&&label.tagName==='LABEL')settings.appendChild(label);settings.appendChild(input)}
  function moveBlockToBottom(settings,boxId){const box=document.getElementById(boxId);if(!box)return;const label=box.previousElementSibling;if(label&&label.tagName==='LABEL')settings.appendChild(label);settings.appendChild(box)}
  function install(){
    if(installed)return true;
    const settings=document.querySelector('#planningSettings .settingsInner'),weekInput=document.getElementById('weekDate');if(!settings||!weekInput)return false;
    const oldLabel=weekInput.previousElementSibling;if(oldLabel&&oldLabel.tagName==='LABEL')oldLabel.style.display='none';weekInput.style.display='none';
    const d=defaultDates(),box=document.createElement('div');box.id='rangePlannerCard';box.style.cssText='margin:0 0 14px;padding:14px;border:1px solid #dfe5ef;border-radius:16px;background:#f8faff';
    box.innerHTML='<label style="margin-top:0">Période du planning</label><div class="formgrid"><div><label for="rangeStart">Date de début</label><input id="rangeStart" type="date" value="'+d.start+'"></div><div><label for="rangeEnd">Date de fin</label><input id="rangeEnd" type="date" value="'+d.end+'"></div></div><button id="generateRangeBtn" class="primary full" type="button">Générer la période</button><div id="rangePlanStatus" class="tiny" style="margin-top:9px">Rotation intelligente : le cycle repart automatiquement quand le stock de magasins disponibles est épuisé.</div>';
    settings.insertBefore(box,settings.firstChild);document.getElementById('generateRangeBtn').addEventListener('click',generateRange);moveBlockToBottom(settings,'brandsBox');movePairToBottom(settings,'target');installed=true;return true
  }
  window.generatePlanningRange=generateRange;
  let tries=0,t=setInterval(function(){tries++;if(install()||tries>120)clearInterval(t)},100);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else setTimeout(install,0);
})();
