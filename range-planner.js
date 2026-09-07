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
  function cloneStore(s){return{id:s.id||'',enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||'',dept:s.dept||''}}
  function snapshotWeek(mon,start,end){const out={weekMonday:iso(mon),plan:{}};for(let i=0;i<DAYS.length;i++){const day=DAYS[i],date=addDays(mon,i),inside=date>=start&&date<=end;out.plan[day]=inside?(((state.plan&&state.plan[day])||[]).map(cloneStore)):[];if(!inside&&state.plan)state.plan[day]=[]}return out}
  function formatRange(a,b){const f={day:'2-digit',month:'2-digit',year:'numeric'};return a.toLocaleDateString('fr-FR',f)+' → '+b.toLocaleDateString('fr-FR',f)}
  function defaultDates(){let raw=null;try{raw=state.settings&&state.settings.weekDate}catch(e){}const m=monday(parse(raw)||new Date()),f=addDays(m,4);return{start:iso(m),end:iso(f)}}
  function setNativeWeekDate(v){try{if(!state.settings)state.settings={};state.settings.weekDate=v;const el=document.getElementById('weekDate');if(el){el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))}}catch(e){}}
  function showStatus(text,bad){const el=document.getElementById('rangePlanStatus');if(!el)return;el.textContent=text;el.style.color=bad?'#b42318':'#667085'}
  async function generateRange(){
    const sEl=document.getElementById('rangeStart'),eEl=document.getElementById('rangeEnd'),start=parse(sEl&&sEl.value),end=parse(eEl&&eEl.value);
    if(!start||!end)return showStatus('Choisis une date de début et une date de fin.',true);
    if(end<start)return showStatus('La date de fin doit être après la date de début.',true);
    const span=Math.round((end-start)/86400000)+1;if(span>93)return showStatus('Pour rester lisible, limite une génération à 3 mois maximum.',true);
    if(typeof window.generateWeek!=='function')return showStatus('Le moteur de planning n’est pas encore prêt.',true);
    const btn=document.getElementById('generateRangeBtn');if(btn)btn.disabled=true;
    const archive=loadArchive(),firstMon=monday(start),lastMon=monday(end),original=state.settings&&state.settings.weekDate;
    let count=0,mon=new Date(firstMon);
    try{
      while(mon<=lastMon){
        const monIso=iso(mon);setNativeWeekDate(monIso);window.generateWeek();archive[monIso]=snapshotWeek(mon,start,end);count++;mon=addDays(mon,7);await new Promise(r=>setTimeout(r,25));
      }
      saveArchive(archive);setNativeWeekDate(iso(firstMon));
      const first=archive[iso(firstMon)];if(first&&first.plan){state.plan={};for(const d of DAYS)state.plan[d]=(first.plan[d]||[]).map(x=>{try{return (state.stores||[]).find(s=>String(s.id)===String(x.id))||x}catch(e){return x}})}
      try{if(typeof save==='function')save();if(typeof renderAll==='function')renderAll()}catch(e){}
      try{localStorage.setItem('chef_sector_range_v1',JSON.stringify({start:iso(start),end:iso(end),weeks:count,updatedAt:new Date().toISOString()}))}catch(e){}
      showStatus('Période générée : '+formatRange(start,end)+' · '+count+' semaine'+(count>1?'s':'')+' enregistrée'+(count>1?'s':'')+'.');
    }catch(e){showStatus('Erreur pendant la génération : '+(e&&e.message?e.message:String(e)),true);if(original)setNativeWeekDate(original)}finally{if(btn)btn.disabled=false}
  }
  function movePairToBottom(settings,inputId){
    const input=document.getElementById(inputId);if(!input)return;
    const label=input.previousElementSibling;
    if(label&&label.tagName==='LABEL')settings.appendChild(label);
    settings.appendChild(input);
  }
  function moveBlockToBottom(settings,boxId){
    const box=document.getElementById(boxId);if(!box)return;
    const label=box.previousElementSibling;
    if(label&&label.tagName==='LABEL')settings.appendChild(label);
    settings.appendChild(box);
  }
  function install(){
    if(installed)return true;
    const settings=document.querySelector('#planningSettings .settingsInner');
    const weekInput=document.getElementById('weekDate');
    if(!settings||!weekInput)return false;
    const oldLabel=weekInput.previousElementSibling;
    if(oldLabel&&oldLabel.tagName==='LABEL')oldLabel.style.display='none';
    weekInput.style.display='none';
    const d=defaultDates(),box=document.createElement('div');
    box.id='rangePlannerCard';
    box.style.cssText='margin:0 0 14px;padding:14px;border:1px solid #dfe5ef;border-radius:16px;background:#f8faff';
    box.innerHTML='<label style="margin-top:0">Période du planning</label><div class="formgrid"><div><label for="rangeStart">Date de début</label><input id="rangeStart" type="date" value="'+d.start+'"></div><div><label for="rangeEnd">Date de fin</label><input id="rangeEnd" type="date" value="'+d.end+'"></div></div><button id="generateRangeBtn" class="primary full" type="button">Générer la période</button><div id="rangePlanStatus" class="tiny" style="margin-top:9px">L’affichage reste semaine par semaine, mais toutes les semaines de la période sont enregistrées.</div>';
    settings.insertBefore(box,settings.firstChild);
    document.getElementById('generateRangeBtn').addEventListener('click',generateRange);

    // Ordre plus logique : période d'abord, choix des magasins en dernier.
    moveBlockToBottom(settings,'brandsBox');
    movePairToBottom(settings,'target');

    installed=true;return true;
  }
  window.generatePlanningRange=generateRange;
  let tries=0,t=setInterval(function(){tries++;if(install()||tries>120)clearInterval(t)},100);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else setTimeout(install,0);
})();
