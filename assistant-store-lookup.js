(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const ARCHIVE_KEY='chef_sector_plan_archive_v1';
  let planObserver=null;
  let observedPlanHost=null;
  let snapshotTimer=null;

  function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function mondayDate(raw){try{const d=new Date((raw||new Date().toISOString().slice(0,10))+'T12:00:00'),w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function currentMonday(){try{return mondayDate(state.settings&&state.settings.weekDate)}catch(e){return mondayDate()}}
  function dateFromMonday(mon,day){const d=new Date(mon+'T12:00:00');d.setDate(d.getDate()+Math.max(0,DAYS.indexOf(day)));return d}
  function frDate(d){return d.toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
  function allStores(){try{return (state.stores&&state.stores.length?state.stores:(typeof DEFAULT_STORES!=='undefined'?DEFAULT_STORES:[]))||[]}catch(e){return[]}}
  function archiveStorage(){try{return window.__chefStorage||window.localStorage||null}catch(e){return window.__chefStorage||null}}
  function loadArchive(){try{const s=archiveStorage();return s?JSON.parse(s.getItem(ARCHIVE_KEY)||'{}')||{}:{}}catch(e){return{}}}
  function saveArchive(a){try{const s=archiveStorage();if(s)s.setItem(ARCHIVE_KEY,JSON.stringify(a))}catch(e){}}
  function snapshotCurrentWeek(){try{if(!state||!state.plan)return;const mon=iso(currentMonday()),out={weekMonday:mon,plan:{}};for(const day of DAYS){out.plan[day]=((state.plan&&state.plan[day])||[]).map(s=>({id:s.id||'',enseigne:s.enseigne||'',ville:s.ville||'',adresse:s.adresse||''}))}const a=loadArchive();a[mon]=out;saveArchive(a)}catch(e){}}
  function scheduleSnapshot(delay){if(snapshotTimer)clearTimeout(snapshotTimer);snapshotTimer=setTimeout(function(){snapshotTimer=null;snapshotCurrentWeek()},Number(delay)||60)}
  function currentPlanEntry(){const mon=iso(currentMonday()),out={weekMonday:mon,plan:{}};for(const d of DAYS)out.plan[d]=((state.plan&&state.plan[d])||[]);return out}
  function monthFromText(text){const n=norm(text),names=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];for(let i=0;i<names.length;i++)if(n.includes(names[i])){const base=currentMonday();return{year:base.getFullYear(),month:i}}if(n.includes('ce mois')||n.includes('mois')){const base=currentMonday();return{year:base.getFullYear(),month:base.getMonth()}}const base=currentMonday();return{year:base.getFullYear(),month:base.getMonth()}}
  function bestMatches(text){const q=norm(text);if(q.length<3)return[];const common=new Set(['quand','passe','passer','vais','aller','magasin','visite','visiter','programme','programmer','prevu','prevue','chez','dans','quel','quelle','jour','date','mois','semaine','cette','prochain','prochaine']);const words=q.split(' ').filter(w=>w.length>2&&!common.has(w));if(!words.length)return[];const scored=[];for(const s of allStores()){const label=norm((s.enseigne||'')+' '+(s.ville||'')+' '+(s.adresse||''));let score=0;for(const w of words)if(label.includes(w))score+=w.length>=6?3:1;if(q.includes(norm((s.enseigne||'')+' '+(s.ville||''))))score+=10;if(score>=3)scored.push({s,score})}scored.sort((a,b)=>b.score-a.score);if(!scored.length)return[];const top=scored[0].score;return scored.filter(x=>x.score===top).slice(0,4).map(x=>x.s)}
  function sameStore(a,b){return String(a&&a.id||'')===String(b&&b.id||'')||(norm(a&&a.enseigne)===norm(b&&b.enseigne)&&norm(a&&a.ville)===norm(b&&b.ville))}
  function findCurrentArrival(storeId,day){try{const esc=window.CSS&&CSS.escape?CSS.escape(String(storeId)):String(storeId);const el=document.querySelector('.stop[data-store-id="'+esc+'"][data-day="'+day+'"]');if(el&&el.dataset.arrival)return el.dataset.arrival;const rows=[...document.querySelectorAll('.timelineRow')];for(const row of rows){const name=row.querySelector('.tlName'),time=row.querySelector('.tlTime');if(name&&time&&norm(name.textContent).includes(norm((allStores().find(s=>String(s.id)===String(storeId))||{}).ville||'')))return time.textContent.trim()}}catch(e){}return null}
  function monthlyHits(store,text){snapshotCurrentWeek();const target=monthFromText(text),archive=loadArchive();archive[iso(currentMonday())]=currentPlanEntry();const hits=[];for(const k of Object.keys(archive)){const entry=archive[k];if(!entry||!entry.plan)continue;for(const day of DAYS){const date=dateFromMonday(entry.weekMonday||k,day);if(date.getFullYear()!==target.year||date.getMonth()!==target.month)continue;const route=entry.plan[day]||[];for(let i=0;i<route.length;i++){if(sameStore(route[i],store)){hits.push({date,day,index:i,arrival:(entry.weekMonday===iso(currentMonday())?findCurrentArrival(store.id,day):null)});break}}}}hits.sort((a,b)=>a.date-b.date);return hits}
  function answer(text){const n=norm(text);if(!/(quand|passe|passer|programme|prevu|date|quel jour|quelle jour|visite|mois)/.test(n)&&n.split(' ').length<2)return null;const matches=bestMatches(text);if(!matches.length)return null;const lines=[];for(const store of matches){const hits=monthlyHits(store,text),name=(store.enseigne||'Magasin')+' '+(store.ville||'');if(hits.length){lines.push(name+' est planifié ce mois :');for(const h of hits)lines.push('• '+frDate(h.date)+(h.arrival?' vers '+h.arrival:'')+' · visite n°'+(h.index+1));}else{const m=monthFromText(text),label=new Date(m.year,m.month,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});lines.push(name+' fait bien partie de ton secteur'+(store.freq?' ('+store.freq+')':'')+', mais je ne le trouve pas dans les semaines de '+label+' actuellement enregistrées dans le planning.')}}return lines.join('\n')}

  function observePlanning(){
    const host=document.getElementById('planPanel')||document.body;
    if(host===observedPlanHost)return;
    if(planObserver)planObserver.disconnect();
    observedPlanHost=host;
    planObserver=new MutationObserver(function(){scheduleSnapshot(80)});
    planObserver.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-arrival','data-day','data-store-id']});
  }

  window.chefSecteurStoreScheduleAnswer=answer;
  window.chefSecteurSnapshotCurrentWeek=snapshotCurrentWeek;
  if(typeof window.storeRunnerRegisterAssistantResolver==='function')window.storeRunnerRegisterAssistantResolver(answer,20);

  function boot(){observePlanning();scheduleSnapshot(0)}
  document.addEventListener('store-runner:planning-updated',function(){observePlanning();scheduleSnapshot(40)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  window.addEventListener('load',function(){observePlanning();scheduleSnapshot(0)},{once:true});
  window.addEventListener('focus',function(){observePlanning();scheduleSnapshot(50)});
  document.addEventListener('visibilitychange',function(){if(!document.hidden){observePlanning();scheduleSnapshot(50)}});
})();
