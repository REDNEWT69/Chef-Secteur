(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const RANGE_KEY='chef_sector_range_v1';
  const DAY_MS=86400000;
  let busy=false,homeObserver=null,panelObserver=null,refreshTimer=null;
  const observedPanels=new WeakSet();

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}
  function text(v){return String(v==null?'':v).trim()}
  function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null}
  function icon(name){const paths={home:'<path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z" fill="currentColor"/>',calendar:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 2v6m8-6v6M4 11h16M8 15h2m4 0h2m-8 3h2"/>',store:'<path d="M3 10 5 3h14l2 7c0 4-5 4-6 1-1 3-5 3-6 0-1 3-6 3-6-1ZM5 14v7h14v-7"/>',pin:'<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',navigation:'<path d="m3 11 18-8-7 18-3-8Z" fill="currentColor"/>',spark:'<path d="M12 1c-2 8-3 9-11 11 8 2 9 3 11 11 2-8 3-9 11-11-8-2-9-3-11-11Z" fill="currentColor" stroke="none"/>',chevron:'<path d="m9 4 8 8-8 8"/>',chart:'<rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="17" y="2" width="4" height="19" rx="1" fill="currentColor" stroke="none"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',more:'<circle cx="4" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="20" cy="12" r="2" fill="currentColor"/>'};return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.spark)+'</svg>'}
  function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
  function fmtDate(v){const d=typeof v==='string'?parse(v):v;if(!d||isNaN(d))return'À planifier';return d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}).replace('.','')}
  function isoLocal(v){const d=v instanceof Date?v:new Date(v);if(isNaN(d))return'';return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dateOnly(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return null;return parse(v)}
  function activeStores(){try{return typeof window.activeStores==='function'?window.activeStores():(state.stores||[]).filter(s=>s.active!==false)}catch(e){return[]}}
  function nextAppointment(now){try{const ref=now instanceof Date?now:new Date(),arr=(state.appointments||[]).map(a=>{const raw=a.date+(a.time?'T'+a.time+':00':'T12:00:00');return{a,d:new Date(raw)}}).filter(x=>!isNaN(x.d)&&x.d>=ref).sort((a,b)=>a.d-b.d);return arr[0]||null}catch(e){return null}}
  function recommended(){try{return typeof window.nextRecommended==='function'?window.nextRecommended():null}catch(e){return null}}
  function baseName(){try{return (state.profile&&state.profile.baseName)||'Maison'}catch(e){return'Maison'}}
  function rangeInfo(){try{const r=JSON.parse(localStorage.getItem(RANGE_KEY)||'{}');if(r&&r.start&&r.end)return r}catch(e){}return null}

  function storeIdOf(row){
    if(row==null)return'';
    if(typeof row==='string'||typeof row==='number')return String(row);
    if(row.storeId!=null)return String(row.storeId);
    if(row.id!=null)return String(row.id);
    if(row.store&&row.store.id!=null)return String(row.store.id);
    return'';
  }
  function storeFor(stateValue,id){
    const key=String(id||'');if(!key)return null;
    const live=(stateValue.stores||[]).find(s=>String(s.id)===key);
    if(live)return live;
    const snap=stateValue.businessV2&&stateValue.businessV2.storeSnapshots&&stateValue.businessV2.storeSnapshots[key];
    return snap||null;
  }
  function storeLabel(stateValue,id,fallback){
    const s=storeFor(stateValue,id)||fallback||{};
    return [text(s.enseigne),text(s.ville)].filter(Boolean).join(' ')||'Magasin';
  }
  function weekBounds(now){
    const d=new Date(now instanceof Date?now:new Date());d.setHours(12,0,0,0);
    const monday=new Date(d);monday.setDate(d.getDate()-((d.getDay()+6)%7));
    const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);
    return{start:isoLocal(monday),end:isoLocal(sunday)};
  }
  function plannedWeek(stateValue){
    let visits=0,unknown=0;const ids=new Set();
    for(const day of DAYS){
      const rows=(stateValue.plan&&Array.isArray(stateValue.plan[day]))?stateValue.plan[day]:[];
      visits+=rows.length;
      for(const row of rows){const id=storeIdOf(row);if(id)ids.add(id);else unknown++}
    }
    return{visits,storeIds:[...ids],stores:unknown?null:ids.size,unknown};
  }
  function completedWeek(stateValue,now){
    const bounds=weekBounds(now),keys=new Set(),stores=new Set();
    const add=(storeId,date)=>{const id=String(storeId||''),d=String(date||'');if(!id||d<bounds.start||d>bounds.end)return;keys.add(id+'|'+d);stores.add(id)};
    const b=stateValue.businessV2||{};
    for(const v of Array.isArray(b.visits)?b.visits:[])if(v&&v.status==='completed')add(v.storeId,v.completedDate);
    for(const [id,h] of Object.entries(stateValue.visits||{})){
      const dates=[];
      if(h&&h.lastVisit)dates.push(h.lastVisit);
      if(h&&Array.isArray(h.history))dates.push(...h.history);
      for(const d of dates)add(id,d);
    }
    return{visits:keys.size,stores:stores.size,start:bounds.start,end:bounds.end};
  }
  function openActions(stateValue,now){
    const today=isoLocal(now),open=[],overdue=[];
    for(const a of (((stateValue||{}).businessV2||{}).actions||[])){
      if(!a||a.status==='done'||a.status==='cancelled')continue;
      open.push(a);
      if(a.dueDate&&a.dueDate<today)overdue.push(a);
    }
    const byStore=new Map(),overdueByStore=new Map();
    for(const a of open){const id=String(a.storeId||'');if(id)byStore.set(id,(byStore.get(id)||0)+1)}
    for(const a of overdue){const id=String(a.storeId||'');if(id)overdueByStore.set(id,(overdueByStore.get(id)||0)+1)}
    return{open,overdue,byStore,overdueByStore};
  }
  function opportunityFacts(rows,now){
    const today=isoLocal(now),soonDate=new Date(now instanceof Date?now:new Date());soonDate.setHours(12,0,0,0);soonDate.setDate(soonDate.getDate()+7);const soonIso=isoLocal(soonDate);
    const open=(rows||[]).filter(o=>o&&(o.status==='open'||o.status==='in_progress')).slice();
    open.sort((a,b)=>String(a.dueDate||'9999-12-31').localeCompare(String(b.dueDate||'9999-12-31'))||String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    const overdue=open.filter(o=>o.dueDate&&o.dueDate<today),soon=open.filter(o=>o.dueDate&&o.dueDate>=today&&o.dueDate<=soonIso);
    const byStore=new Map(),overdueByStore=new Map(),soonByStore=new Map();
    for(const o of open){const id=String(o.storeId||'');if(id)byStore.set(id,(byStore.get(id)||0)+1)}
    for(const o of overdue){const id=String(o.storeId||'');if(id)overdueByStore.set(id,(overdueByStore.get(id)||0)+1)}
    for(const o of soon){const id=String(o.storeId||'');if(id)soonByStore.set(id,(soonByStore.get(id)||0)+1)}
    return{open,overdue,soon,byStore,overdueByStore,soonByStore,next:open[0]||null};
  }
  function plural(n,singular,pluralValue){return n+' '+(n>1?(pluralValue||singular+'s'):singular)}
  function pts(v){const n=Math.abs(Number(v));return Number.isFinite(n)?n.toLocaleString('fr-FR',{maximumFractionDigits:1}):''}
  function addReason(list,value){const v=text(value);if(v&&!list.includes(v)&&list.length<3)list.push(v)}
  function perfMap(performance){const m=new Map();for(const r of (performance&&performance.rows)||[]){const id=String(r.storeId||'');if(id)m.set(id,r)}return m}
  function pilotageMap(pilotage){const m=new Map();for(const r of (pilotage&&pilotage.rows)||[]){const id=String(r.store&&r.store.id||'');if(id)m.set(id,r)}return m}
  function reasonsForStore(id,ctx,options){
    options=options||{};const out=[],pilot=ctx.pilotMap.get(String(id)),perf=ctx.performanceMap.get(String(id));
    const actionOverdue=ctx.actions.overdueByStore.get(String(id))||0,actionOpen=ctx.actions.byStore.get(String(id))||0;
    const oppOverdue=ctx.opportunities.overdueByStore.get(String(id))||0,oppOpen=ctx.opportunities.byStore.get(String(id))||0;
    if(actionOverdue)addReason(out,plural(actionOverdue,'action échue','actions échues'));
    if(perf&&perf.status&&Number.isFinite(perf.status.gap)&&perf.status.gap<0)addReason(out,'PDM -'+pts(perf.status.gap)+' pt'+(Math.abs(perf.status.gap)>=2?'s':'')+' vs cible');
    else if(perf&&perf.prio==='P1')addReason(out,'Priorité performance P1');
    if(pilot&&pilot.late>0)addReason(out,'Visite en retard de '+Math.round(pilot.late)+' j');
    else if(pilot&&pilot.age!=null&&pilot.age>0&&options.includeAge)addReason(out,'Dernière visite il y a '+Math.round(pilot.age)+' j');
    if(pilot&&pilot.pdl!=null&&Array.isArray(pilot.reasons)&&pilot.reasons.some(r=>/représentation marque faible/i.test(r)))addReason(out,'PDL faible ('+Math.round(pilot.pdl)+' %)');
    if(pilot&&pilot.alerts>0)addReason(out,plural(pilot.alerts,'point terrain à suivre','points terrain à suivre'));
    if(actionOpen&&!actionOverdue)addReason(out,plural(actionOpen,'action ouverte','actions ouvertes'));
    if(oppOverdue)addReason(out,plural(oppOverdue,'opportunité échue','opportunités échues'));
    else if(oppOpen)addReason(out,plural(oppOpen,'opportunité ouverte','opportunités ouvertes'));
    if(!out.length&&pilot&&Array.isArray(pilot.reasons))for(const r of pilot.reasons)addReason(out,r);
    return out.slice(0,3);
  }
  function card(id,label,value,sub,importanceScore,iconName,action,storeId){return{id,label,value,sub,importanceScore,icon:iconName,action,storeId:storeId||''}}
  function rankCards(candidates){return(candidates||[]).filter(c=>c&&text(c.label)&&text(c.value)&&Number.isFinite(c.importanceScore)).slice().sort((a,b)=>b.importanceScore-a.importanceScore||String(a.id).localeCompare(String(b.id))).slice(0,4)}

  function buildActivityCards(stateValue,environment){
    const s=stateValue||{},env=environment||{},now=env.now instanceof Date?env.now:new Date(env.now||Date.now());
    const planned=plannedWeek(s),done=completedWeek(s,now),target=numberOrNull(s.settings&&s.settings.target);
    const pilotage=env.pilotage||{rows:[]},performance=env.performance||{rows:[]},actions=openActions(s,now);
    const opportunities=opportunityFacts(env.opportunities!==undefined?env.opportunities:((((s||{}).businessV2||{}).opportunities)||[]),now);
    const ctx={pilotMap:pilotageMap(pilotage),performanceMap:perfMap(performance),actions,opportunities};
    const candidates=[];

    const urgentIds=new Set();
    for(const id of actions.overdueByStore.keys())urgentIds.add(id);
    for(const r of pilotage.rows||[]){const id=String(r.store&&r.store.id||'');if(id&&(r.alerts>0||r.late>0||r.openActions>0||r.priority>=55))urgentIds.add(id)}
    for(const r of performance.rows||[]){const id=String(r.storeId||'');if(id&&(r.prio==='P1'||(r.status&&r.status.underTarget===true)))urgentIds.add(id)}
    let urgent=null;
    for(const id of urgentIds){
      const p=ctx.pilotMap.get(id),perf=ctx.performanceMap.get(id),over=actions.overdueByStore.get(id)||0,open=actions.byStore.get(id)||0;
      let tier=0;
      if(over)tier=500;
      else if(p&&((p.late||0)>=14||(p.alerts||0)>0))tier=450;
      else if(perf&&(perf.prio==='P1'||(perf.status&&perf.status.underTarget===true)))tier=400;
      else if(p&&(p.late||0)>0)tier=360;
      else if(open||p&&p.openActions)tier=320;
      else if(p&&p.priority>=55)tier=300;
      const score=tier+(p&&Number.isFinite(p.priority)?p.priority:0);
      if(!urgent||score>urgent.score||score===urgent.score&&id<urgent.id)urgent={id,score,tier};
    }
    if(urgent){
      const reasons=reasonsForStore(urgent.id,ctx,{includeAge:true});
      if(reasons.length)candidates.push(card('action-now','À traiter maintenant',storeLabel(s,urgent.id,ctx.pilotMap.get(urgent.id)&&ctx.pilotMap.get(urgent.id).store),reasons.join(' · '),urgent.tier>=450?98:urgent.tier>=400?92:86,'check','pilotage',urgent.id));
    }

    const opp=opportunities;
    if(opp.open.length){
      const bits=[];
      if(opp.overdue.length)bits.push(plural(opp.overdue.length,'échéance dépassée','échéances dépassées'));
      else if(opp.soon.length)bits.push(plural(opp.soon.length,'échéance sous 7 j','échéances sous 7 j'));
      if(opp.next&&opp.next.dueDate)bits.push('prochaine '+fmtDate(opp.next.dueDate));
      else if(opp.next&&opp.next.storeId)bits.push(storeLabel(s,opp.next.storeId));
      candidates.push(card('opportunities','Opportunités',plural(opp.open.length,'opportunité ouverte','opportunités ouvertes'),bits.join(' · ')||'À suivre sur le secteur',opp.overdue.length?94:opp.soon.length?82:58,'spark','opportunities'));
    }

    const rec=env.recommended||null,recId=storeIdOf(rec);
    if(rec&&recId&&(!urgent||recId!==urgent.id)){
      const reasons=reasonsForStore(recId,ctx,{includeAge:true});
      if(Array.isArray(rec.reasons))for(const r of rec.reasons)addReason(reasons,r);
      if(rec.reason)addReason(reasons,rec.reason);
      if(reasons.length)candidates.push(card('priority','Prochaine priorité',storeLabel(s,recId,rec),reasons.slice(0,3).join(' · '),76,'pin','stores',recId));
    }

    const ap=env.appointment||null;
    if(ap&&ap.a&&ap.d){
      const a=ap.a,id=storeIdOf(a),parts=[];
      if(a.time)parts.push(a.time);
      const explicit=text(a.storeName||a.magasin||a.storeLabel);const label=id?storeLabel(s,id):explicit;
      if(label&&label!=='Magasin')parts.push(label);
      candidates.push(card('appointment','Prochain rendez-vous',fmtDate(ap.d),parts.join(' · ')||'Rendez-vous planifié',54,'calendar','appointments',id));
    }

    const perfP1=(performance.rows||[]).filter(r=>r&&r.prio==='P1'&&r.storeId),plannedIds=new Set(planned.storeIds);
    const weekBits=[];
    if(done.visits)weekBits.push(plural(done.visits,'visite faite','visites faites'));
    if(target!=null){const remaining=Math.max(0,Math.round(target)-done.visits);weekBits.push(remaining+' à faire · objectif '+Math.round(target)+' visites')}
    else if(planned.visits){const remaining=Math.max(0,planned.visits-done.visits);weekBits.push(plural(remaining,'visite planifiée restante','visites planifiées restantes'))}
    if(perfP1.length&&planned.storeIds.length){const n=perfP1.filter(r=>plannedIds.has(String(r.storeId))).length;weekBits.push('P1 : '+n+'/'+perfP1.length+' planifiés')}
    let weekValue='';
    if(planned.stores!=null&&planned.visits)weekValue=plural(planned.stores,'magasin planifié','magasins planifiés');
    else if(planned.visits)weekValue=plural(planned.visits,'visite prévue','visites prévues');
    else if(done.visits)weekValue=plural(done.stores,'magasin visité','magasins visités');
    else if(target!=null)weekValue='Objectif '+Math.round(target)+' visites';
    if(weekValue)candidates.push(card('week','Cette semaine',weekValue,weekBits.join(' · ')||'Suivi hebdomadaire',30,'chart','plan'));

    return rankCards(candidates);
  }

  function runtimeActivityCards(now){
    const ref=now instanceof Date?now:new Date();let pilotage={rows:[]},performance={rows:[]},opportunities=[];
    try{if(window.StoreRunnerSectorPilotage&&typeof window.StoreRunnerSectorPilotage.compute==='function')pilotage=window.StoreRunnerSectorPilotage.compute(state,{now:ref})||pilotage}catch(e){}
    try{if(window.StoreRunnerPerformanceV190&&typeof window.StoreRunnerPerformanceV190.dashboard==='function'){const db=window.__chefStorage||window.localStorage;performance=window.StoreRunnerPerformanceV190.dashboard(db,{state,stores:activeStores()})||performance}}catch(e){}
    try{if(window.StoreRunnerOpportunities&&typeof window.StoreRunnerOpportunities.list==='function')opportunities=window.StoreRunnerOpportunities.list(state,{openOnly:true})||[];else opportunities=((((state||{}).businessV2||{}).opportunities)||[])}catch(e){}
    return buildActivityCards(state,{now:ref,pilotage,performance,opportunities,recommended:recommended(),appointment:nextAppointment(ref)});
  }
  function actionCode(action){
    if(action==='pilotage')return"if(window.StoreRunnerSectorPilotage&&StoreRunnerSectorPilotage.open)StoreRunnerSectorPilotage.open(window);else goTab('storesPanel')";
    if(action==='opportunities')return"if(window.StoreRunnerOpportunities&&StoreRunnerOpportunities.open)StoreRunnerOpportunities.open('','')";
    if(action==='appointments')return"goTab('appointmentsPanel')";
    if(action==='stores')return"goTab('storesPanel')";
    return"goTab('planPanel')";
  }
  function activityMarkup(cards){return cards.map(c=>`<button type="button" class="phCard" data-home-card="${esc(c.id)}" onclick="${actionCode(c.action)}"><span class="phIcon">${icon(c.icon)}</span><span class="phLabel">${esc(c.label)}</span><strong class="phValue${c.storeId?' phStoreValue':''}">${esc(c.value)}</strong><span class="phSub">${esc(c.sub)}</span></button>`).join('')}

  function ensureCss(){if(document.getElementById('home-refresh-v2-css'))return;const s=document.createElement('style');s.id='home-refresh-v2-css';s.textContent=`
#homePanel{max-width:980px;margin:0 auto}.homeHero,#homeKpis,#homePriority,#homeNext,#homePanel>.sectionTitle{display:none!important}
#premiumHomeV2{display:block}.phTop{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:2px 0 22px}.phEyebrow{font-size:14px;color:#858991}.phTitle{font-size:clamp(42px,7vw,72px);line-height:.98;letter-spacing:-.065em;margin:7px 0 0;font-weight:820}.phBase{border:0;background:transparent;color:#777c85;font-size:14px;padding:2px 0}.phGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.phCard{box-sizing:border-box;width:100%;min-width:0;min-height:184px;padding:20px;border:1px solid rgba(255,255,255,.84);border-radius:28px;background:rgba(255,255,255,.72);box-shadow:0 14px 42px rgba(35,40,55,.08);backdrop-filter:blur(24px) saturate(1.15);-webkit-backdrop-filter:blur(24px) saturate(1.15);display:flex;flex-direction:column;align-items:flex-start;text-align:left;overflow:hidden;color:inherit}.phIcon{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(195,224,255,.82),rgba(228,239,251,.66));font-size:24px;color:#0a84ff;margin-bottom:28px}.phIcon svg{width:24px;height:24px}.phLabel{font-size:15px;color:#30333a}.phValue{display:block;max-width:100%;font-size:38px;line-height:1.02;font-weight:790;letter-spacing:-.055em;margin-top:8px;overflow-wrap:anywhere}.phValue.phStoreValue{font-size:26px;line-height:1.08;letter-spacing:-.035em}.phSub{display:block;font-size:13px;color:#777c85;margin-top:8px;line-height:1.35;overflow-wrap:anywhere}.phWide{margin-top:14px;padding:22px;border:1px solid rgba(255,255,255,.84);border-radius:30px;background:rgba(255,255,255,.72);box-shadow:0 14px 42px rgba(35,40,55,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}.phWideLabel{font-size:16px;color:#6f747d}.phWideValue{font-size:42px;font-weight:790;letter-spacing:-.055em;margin:5px 0 16px}.phButton{width:100%;min-height:54px;border:0;border-radius:19px;background:rgba(180,211,247,.58);color:#0878e8;font-size:17px;font-weight:700}.phRange{margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-radius:22px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.72)}.phRange b{font-size:15px}.phRange span{display:block;font-size:12px;color:#777c85;margin-top:4px}.phRange button{border:0;background:#111217;color:#fff;border-radius:15px;padding:10px 13px;font-weight:700}.phActions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.phActions button{min-height:50px;border-radius:18px;border:1px solid rgba(120,125,140,.14);background:rgba(255,255,255,.70);color:#176fd0;font-weight:720}
#moreSheetV2{display:none;position:fixed;inset:0;z-index:190;background:rgba(20,24,32,.20);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}#moreSheetV2.open{display:block}.moreSheetCard{position:absolute;left:12px;right:12px;bottom:calc(82px + env(safe-area-inset-bottom));padding:10px;border-radius:28px;background:rgba(249,250,252,.94);border:1px solid rgba(255,255,255,.9);box-shadow:0 28px 80px rgba(20,25,35,.24)}.moreSheetCard>div:first-child{width:42px;height:5px;border-radius:999px;background:#d3d6dc;margin:2px auto 12px}.moreSheetGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.moreSheetGrid button{border:0;background:rgba(235,238,244,.76);border-radius:18px;min-height:58px;font-weight:720;color:#333941}.moreClose{width:100%;margin-top:8px;border:0;background:#111217;color:#fff;border-radius:18px;min-height:48px;font-weight:750}
@media(max-width:700px){.top .tabs{display:none!important}.top{padding-bottom:10px!important}.phTop{margin-top:10px}.phTitle{font-size:48px}.phGrid{gap:10px}.phCard{min-height:166px;padding:17px;border-radius:24px}.phIcon{margin-bottom:22px;width:44px;height:44px}.phValue{font-size:31px}.phValue.phStoreValue{font-size:22px}.phWide{border-radius:26px;padding:19px}.phWideValue{font-size:38px}.bottomAppNav{grid-template-columns:repeat(5,1fr)!important}.bottomNavBtn{font-size:10px!important}.bottomNavBtn .bnIcon{font-size:22px!important}}
`;
    document.head.appendChild(s)
  }

  function buildHome(){
    const panel=document.getElementById('homePanel');if(!panel)return false;
    let box=document.getElementById('premiumHomeV2');if(!box){box=document.createElement('div');box.id='premiumHomeV2';const install=document.getElementById('installCard');if(install&&install.parentNode===panel)panel.insertBefore(box,install.nextSibling);else panel.insertBefore(box,panel.firstChild)}
    const range=rangeInfo(),today=new Date(),cards=runtimeActivityCards(today);let rangeHtml='Aucune période générée',rangeSub='Crée ton prochain planning';
    if(range){rangeHtml=fmtDate(range.start)+' → '+fmtDate(range.end);rangeSub=(range.weeks||'')+(range.weeks?' semaines':'')+(range.uniqueStores?' · '+range.uniqueStores+' magasins distincts':'')}
    const day=DAYS[(today.getDay()+6)%7];let todayRoute=[];
    try{if(day&&typeof dateForDay==='function'&&dateForDay(day)===todayISO())todayRoute=(state.plan&&state.plan[day])||[]}catch(e){}
    let estimate=null;try{if(todayRoute.length&&typeof window.dayEstimatePremium==='function')estimate=window.dayEstimatePremium(todayRoute,day)}catch(e){}
    const km=estimate&&Number.isFinite(estimate.km)?' · ~'+Math.round(estimate.km)+' km':'';
    const summary=todayRoute.length?todayRoute.length+' magasin'+(todayRoute.length>1?'s':'')+' aujourd’hui'+km:'Prépare ta prochaine tournée';
    const daySummary=todayRoute.length?todayRoute.length+' visite'+(todayRoute.length>1?'s':'')+km+(estimate&&estimate.start?' · départ '+estimate.start:''):'Aucune visite prévue aujourd’hui';
    const sector=String((state.profile&&state.profile.sectorName)||'Mon secteur').replace(/^samsung\s*[·:–—-]?\s*/i,'').trim()||'Mon secteur';
    const markup=`<div class="phTop"><div class="phBrandRow"><div class="phBrand"><img class="srBrandLogo" src="./app-icon.svg" alt="S-RUNNER"><span class="srBrandName">Store Runner</span><span class="srBrandSignature">S-RUNNER By Red①</span></div><div class="phHeaderContext"><button class="phBase" type="button" onclick="openDepartureSettings()" aria-label="Modifier le point de départ">${icon('pin')}<span class="phDepartureCopy"><span>${/^(ma position(?: actuelle)?)$/i.test(baseName())?'Ma position actuelle':'Départ'}</span><span class="phDepartureAddress"></span></span></button><span class="phSector">${esc(sector)} · ${activeStores().length} magasins</span></div></div><h2 class="phTitle">Aujourd’hui.</h2><p class="phTagline">${esc(daySummary)}</p></div>
    <section class="phVisitCard" aria-label="Vos visites"><button class="phVisitLink" type="button" onclick="goTab('planPanel')"><span class="phVisitIcon">${icon('navigation')}</span><span class="phVisitText"><strong>${todayRoute.length?'Ta journée est prête':'Prépare ta journée'}</strong><span>${esc(summary)}</span></span><span class="phArrow">${icon('chevron')}</span></button><button class="phAssistant" type="button" onclick="toggleAssistant()"><span class="phSpark">${icon('spark')}</span><span>Tes magasins, tes priorités,<br>préparons ta prochaine tournée…</span>${icon('chevron')}</button></section>
    <div class="phActivityHeading"><div><h3>Votre activité</h3></div><button type="button" onclick="goTab('historyPanel')">Voir tout ${icon('chevron')}</button></div>
    <div class="phGrid" data-home-cards="${cards.length}">${activityMarkup(cards)}</div>
    <div class="phRange"><div><b>Planning actif</b><span>${esc(rangeHtml)} · ${esc(rangeSub)}</span></div><button type="button" onclick="goTab('planPanel')">Voir</button></div>`;
    if(box.__lastMarkup!==markup){box.innerHTML=markup;box.__lastMarkup=markup;document.dispatchEvent(new CustomEvent('store-runner:home-rendered'))}return true
  }

  function installMoreSheet(){if(document.getElementById('moreSheetV2'))return;const s=document.createElement('div');s.id='moreSheetV2';s.innerHTML='<div class="moreSheetCard"><div></div><div class="moreSheetGrid"><button data-go="appointmentsPanel">◷ Rendez-vous</button><button data-go="terrainPanel">➤ Terrain</button><button data-go="historyPanel">◴ Historique</button><button data-go="profilePanel">◎ Secteur</button><button data-go="importPanel">⇅ Données</button><button data-go="storesPanel">▤ Magasins</button></div><button class="moreClose" type="button">Fermer</button></div>';document.body.appendChild(s);s.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){s.classList.remove('open');if(typeof window.goTab==='function')window.goTab(b.dataset.go);return}if(e.target===s||e.target.closest('.moreClose'))s.classList.remove('open')})}
  function showMore(){installMoreSheet();document.getElementById('moreSheetV2').classList.add('open')}
  function rebuildBottomNav(){const nav=document.getElementById('bottomAppNav');if(!nav)return false;if(nav.dataset.v2==='1')return true;nav.dataset.v2='1';nav.innerHTML='<button class="bottomNavBtn active" data-panel="homePanel" type="button"><span class="bnIcon">'+icon('home')+'</span>Accueil</button><button class="bottomNavBtn" data-panel="planPanel" type="button"><span class="bnIcon">'+icon('calendar')+'</span>Planning</button><button class="bottomNavBtn" data-panel="storesPanel" type="button"><span class="bnIcon">'+icon('store')+'</span>Magasins</button><button class="bottomNavBtn ia" data-ai="1" type="button"><span class="bnIcon">'+icon('spark')+'</span>IA</button><button class="bottomNavBtn" data-more="1" type="button"><span class="bnIcon">'+icon('more')+'</span>Plus</button>';nav.addEventListener('click',e=>{const b=e.target.closest('.bottomNavBtn');if(!b)return;if(b.dataset.ai){if(typeof window.toggleAssistant==='function')window.toggleAssistant();return}if(b.dataset.more){showMore();return}const p=b.dataset.panel;if(p&&typeof window.goTab==='function'){window.goTab(p);setActive(p)}});return true}
  function setActive(panel){document.body.classList.toggle('glassHome',panel==='homePanel');const nav=document.getElementById('bottomAppNav');if(!nav)return;nav.querySelectorAll('.bottomNavBtn').forEach(b=>b.classList.toggle('active',b.dataset.panel===panel))}
  function activePanel(){const p=document.querySelector('.panel.active');return p&&p.id}
  function run(){if(busy)return;busy=true;try{ensureCss();buildHome();rebuildBottomNav();installMoreSheet();setActive(activePanel()||'homePanel')}finally{busy=false}}
  function scheduleRun(delay){clearTimeout(refreshTimer);refreshTimer=setTimeout(run,delay==null?30:delay)}
  function observeHomeSignals(){if(homeObserver)return true;const targets=['homeKpis','homePriority','homeNext'].map(id=>document.getElementById(id)).filter(Boolean);if(!targets.length)return false;homeObserver=new MutationObserver(function(){scheduleRun(30)});targets.forEach(function(el){homeObserver.observe(el,{childList:true,subtree:true,characterData:true})});return true}
  function observePanels(){if(!panelObserver)panelObserver=new MutationObserver(function(){setTimeout(function(){setActive(activePanel()||'homePanel')},0)});let found=false;document.querySelectorAll('.panel').forEach(function(panel){found=true;if(observedPanels.has(panel))return;panelObserver.observe(panel,{attributes:true,attributeFilter:['class']});observedPanels.add(panel)});return found}
  async function boot(){for(let i=0;i<60;i++){run();observeHomeSignals();observePanels();if(document.getElementById('homePanel')&&document.getElementById('bottomAppNav')&&homeObserver)break;await new Promise(r=>setTimeout(r,100))}run();observeHomeSignals();observePanels()}
  function refreshWhenVisible(){if(document.hidden)return;run();observeHomeSignals();observePanels()}

  const publicApi={buildActivityCards,rankCards,plannedWeek,completedWeek,openActions,opportunityFacts};
  if(typeof module!=='undefined'&&module.exports)module.exports=publicApi;
  if(typeof window==='undefined'||typeof document==='undefined')return;
  window.StoreRunnerHomeV204=publicApi;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
  window.addEventListener('focus',refreshWhenVisible);
  document.addEventListener('visibilitychange',refreshWhenVisible);
  ['store-runner:data-restored','store-runner:planning-updated','store-runner:opportunities-updated'].forEach(name=>document.addEventListener(name,()=>scheduleRun(20)));
})();