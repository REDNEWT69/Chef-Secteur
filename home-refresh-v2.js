(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const RANGE_KEY='chef_sector_range_v1';
  const DAY_MS=86400000;
  let busy=false,homeObserver=null,panelObserver=null,refreshTimer=null,contextTimer=null;
  const observedPanels=new WeakSet();

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c))}
  function text(v){return String(v==null?'':v).trim()}
  function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?n:null}
  function icon(name){const paths={home:'<path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z" fill="currentColor"/>',calendar:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 2v6m8-6v6M4 11h16M8 15h2m4 0h2m-8 3h2"/>',store:'<path d="M3 10 5 3h14l2 7c0 4-5 4-6 1-1 3-5 3-6 0-1 3-6 3-6-1ZM5 14v7h14v-7"/>',pin:'<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',navigation:'<path d="m3 11 18-8-7 18-3-8Z" fill="currentColor"/>',spark:'<path d="M12 1c-2 8-3 9-11 11 8 2 9 3 11 11 2-8 3-9 11-11-8-2-9-3-11-11Z" fill="currentColor" stroke="none"/>',chevron:'<path d="m9 4 8 8-8 8"/>',chart:'<rect x="3" y="12" width="4" height="9" rx="1" fill="currentColor" stroke="none"/><rect x="10" y="7" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="17" y="2" width="4" height="19" rx="1" fill="currentColor" stroke="none"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',alert:'<path d="M12 3 2 20h20Z"/><path d="M12 10v4m0 3h.01"/>',more:'<circle cx="4" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="20" cy="12" r="2" fill="currentColor"/>'};return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.spark)+'</svg>'}
  function parse(v){const d=new Date(String(v||'')+'T12:00:00');return isNaN(d)?null:d}
  function fmtDate(v){const d=typeof v==='string'?parse(v):v;if(!d||isNaN(d))return'À planifier';return d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}).replace('.','')}
  function isoLocal(v){const d=v instanceof Date?v:new Date(v);if(isNaN(d))return'';return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dateOnly(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||'')))return null;return parse(v)}
  function activeStores(){try{return typeof window.activeStores==='function'?window.activeStores():(state.stores||[]).filter(s=>s.active!==false)}catch(e){return[]}}
  function nextAppointment(now){try{const ref=now instanceof Date?now:new Date(),arr=(state.appointments||[]).map(a=>{const raw=a.date+(a.time?'T'+a.time+':00':'T12:00:00');return{a,d:new Date(raw)}}).filter(x=>!isNaN(x.d)&&x.d>=ref).sort((a,b)=>a.d-b.d);return arr[0]||null}catch(e){return null}}
  function recommended(){try{return typeof window.nextRecommended==='function'?window.nextRecommended():null}catch(e){return null}}
  function baseName(){try{return (state.profile&&state.profile.baseName)||'Maison'}catch(e){return'Maison'}}
  function rangeInfo(){try{const r=JSON.parse((window.__chefStorage||localStorage).getItem(RANGE_KEY)||'{}');if(r&&r.start&&r.end)return r}catch(e){}return null}

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
  /* V245 : l'accueil ne recompte plus lui-même les visites. Les compteurs viennent de
     StoreRunnerActivityMetrics (visit-counting.js), seule source des magasins planifiés,
     crédits de visite et visites réalisées ; aucun autre module ne réécrit ensuite la carte. */
  function metricsApi(){
    try{if(typeof window!=='undefined'&&window.StoreRunnerActivityMetrics)return window.StoreRunnerActivityMetrics}catch(e){}
    try{if(typeof module!=='undefined'&&typeof require==='function')return require('./visit-counting.js').StoreRunnerActivityMetrics}catch(e){}
    return null;
  }
  function plannedStoreIds(stateValue){
    const ids=new Set();
    for(const day of DAYS)for(const row of ((stateValue.plan&&Array.isArray(stateValue.plan[day]))?stateValue.plan[day]:[])){const id=storeIdOf(row);if(id)ids.add(id)}
    return ids;
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

  /* V259 — catalogue complet des cartes « Votre activité ».
     Le classement automatique (rankCards) reste le comportement par défaut et ne voit
     que les cartes qu'il voyait avant V259 : les cartes ajoutées ici (`auto:false`) et
     les états vides (`empty:true`) n'apparaissent que si l'utilisateur les épingle.
     Ordre du catalogue = ordre de présentation dans « Voir tout ». */
  const CARD_CATALOG=[
    {id:'week',label:'Cette semaine',icon:'chart',action:'plan',emptyValue:'Semaine à planifier',emptySub:'Génère ton planning'},
    {id:'action-now',label:'À traiter maintenant',icon:'check',action:'pilotage',emptyValue:'Rien d’urgent',emptySub:'Aucun magasin à traiter maintenant'},
    {id:'priority',label:'Prochaine priorité',icon:'pin',action:'stores',emptyValue:'À calculer',emptySub:'Génère ton planning pour la voir'},
    {id:'opportunities',label:'Opportunités',icon:'spark',action:'opportunities',emptyValue:'Aucune ouverte',emptySub:'À créer depuis une fiche magasin'},
    {id:'appointment',label:'Prochain rendez-vous',icon:'calendar',action:'appointments',emptyValue:'Aucun prévu',emptySub:'Ajouter un rendez-vous'},
    {id:'watch',label:'À surveiller',icon:'alert',action:'pilotage',emptyValue:'Secteur à jour',emptySub:'Aucun magasin en retard'},
    {id:'actions',label:'Actions ouvertes',icon:'check',action:'hub',emptyValue:'Aucune action',emptySub:'Rien à relancer'},
    {id:'month',label:'Ce mois',icon:'chart',action:'history',emptyValue:'0 visite réalisée',emptySub:'Aucune visite terminée ce mois'}
  ];
  const CARD_IDS=CARD_CATALOG.map(c=>c.id);
  const HOME_SLOTS=4;
  function weekSummaryOf(api,m){
    if(api&&typeof api.weekSummary==='function')return api.weekSummary(m);
    return{value:'',bits:[]};
  }

  function collectActivity(stateValue,environment){
    const s=stateValue||{},env=environment||{},now=env.now instanceof Date?env.now:new Date(env.now||Date.now());
    const api=metricsApi(),m=env.metrics||(api?api.compute(s,{now}):null);
    const pilotage=env.pilotage||{rows:[]},performance=env.performance||{rows:[]},actions=openActions(s,now);
    const opportunities=opportunityFacts(env.opportunities!==undefined?env.opportunities:((((s||{}).businessV2||{}).opportunities)||[]),now);
    const ctx={pilotMap:pilotageMap(pilotage),performanceMap:perfMap(performance),actions,opportunities};
    const candidates=[],extras=[];

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
    if(rec&&recId){
      const reasons=reasonsForStore(recId,ctx,{includeAge:true});
      if(Array.isArray(rec.reasons))for(const r of rec.reasons)addReason(reasons,r);
      if(rec.reason)addReason(reasons,rec.reason);
      /* Même magasin que « À traiter maintenant » : le classement automatique ne le
         montre pas deux fois ; la carte reste disponible si l'utilisateur l'épingle. */
      if(reasons.length){const c=card('priority','Prochaine priorité',storeLabel(s,recId,rec),reasons.slice(0,3).join(' · '),76,'pin','stores',recId);if(urgent&&recId===urgent.id){c.auto=false;extras.push(c)}else candidates.push(c)}
    }

    const ap=env.appointment||null;
    if(ap&&ap.a&&ap.d){
      const a=ap.a,id=storeIdOf(a),parts=[];
      if(a.time)parts.push(a.time);
      const explicit=text(a.storeName||a.magasin||a.storeLabel);const label=id?storeLabel(s,id):explicit;
      if(label&&label!=='Magasin')parts.push(label);
      candidates.push(card('appointment','Prochain rendez-vous',fmtDate(ap.d),parts.join(' · ')||'Rendez-vous planifié',54,'calendar','appointments',id));
    }

    const perfP1=(performance.rows||[]).filter(r=>r&&r.prio==='P1'&&r.storeId),plannedIds=plannedStoreIds(s);
    if(m){
      /* V258 — le travail réellement fait passe devant le prévu. V259 : la mise en forme
         vient de StoreRunnerActivityMetrics.weekSummary, partagée avec le bandeau
         historique du noyau ; aucun nombre n'est recompté ici. */
      const week=weekSummaryOf(api,m),weekBits=week.bits.slice(),weekValue=week.value;
      if(perfP1.length&&plannedIds.size){const n=perfP1.filter(r=>plannedIds.has(String(r.storeId))).length;weekBits.push('P1 : '+n+'/'+perfP1.length+' planifiés')}
      if(weekValue)candidates.push(card('week','Cette semaine',weekValue,weekBits.join(' · ')||'Suivi hebdomadaire',30,'chart','plan'));
    }

    /* Cartes disponibles seulement sur choix de l'utilisateur (hors classement auto). */
    const lateRows=(pilotage.rows||[]).filter(r=>r&&r.store&&r.store.id!=null&&(r.late||0)>0),alertStores=(pilotage.rows||[]).filter(r=>r&&(r.alerts||0)>0).length;
    const overdueCount=m?m.overdueActions:actions.overdue.length,openCount=m?m.openActions:actions.open.length;
    if(lateRows.length||alertStores||overdueCount){
      const bits=[];if(alertStores)bits.push(plural(alertStores,'magasin avec point terrain','magasins avec points terrain'));if(overdueCount)bits.push(plural(overdueCount,'action échue','actions échues'));
      const worst=lateRows.slice().sort((a,b)=>(b.late||0)-(a.late||0))[0];if(worst&&bits.length<2)bits.push('plus ancien : '+storeLabel(s,worst.store.id,worst.store));
      const c=card('watch','À surveiller',lateRows.length?plural(lateRows.length,'magasin en retard','magasins en retard'):'0 magasin en retard',bits.join(' · ')||'Visites à rattraper',0,'alert','pilotage');c.auto=false;extras.push(c);
    }
    if(openCount){
      const c=card('actions','Actions ouvertes',plural(openCount,'action ouverte','actions ouvertes'),overdueCount?plural(overdueCount,'échue','échues'):'Aucune en retard',0,'check','hub');c.auto=false;extras.push(c);
    }
    if(m&&m.completedVisitsMonth){
      const L=api&&api.labels,done=(n,when)=>L?L.completed(n,when):plural(n,'visite réalisée','visites réalisées')+(when?' '+when:'');
      const c=card('month','Ce mois',done(m.completedVisitsMonth),plural(m.completedUniqueStoresMonth,'magasin distinct','magasins distincts')+' · '+done(m.completedVisitsToday,'aujourd’hui'),0,'chart','history');c.auto=false;extras.push(c);
    }
    return{candidates,extras};
  }

  function buildActivityCards(stateValue,environment){return rankCards(collectActivity(stateValue,environment).candidates)}

  /* Toutes les cartes, dans l'ordre du catalogue ; une carte sans donnée garde un état
     vide explicite, jamais un chiffre inventé. */
  function buildActivityCatalog(stateValue,environment){
    const {candidates,extras}=collectActivity(stateValue,environment),byId=new Map();
    for(const c of extras.concat(candidates))byId.set(c.id,c);
    return CARD_CATALOG.map(def=>{
      const c=byId.get(def.id);
      if(c)return Object.assign({auto:true,empty:false},c);
      return Object.assign(card(def.id,def.label,def.emptyValue,def.emptySub,0,def.icon,def.action),{auto:false,empty:true});
    });
  }

  /* V259 — préférences d'accueil. Une seule clé, dans le moteur durable V256
     (window.__chefStorage) ; aucune écriture dans state, donc aucune migration.
     Absence de clé = mode automatique d'avant V259 : les utilisateurs existants ne
     voient aucun changement tant qu'ils ne personnalisent pas.
       pinned : cartes épinglées, dans l'ordre choisi — toujours sur l'accueil, en tête ;
       hidden : cartes retirées — jamais proposées par le classement automatique. */
  const PREFS_KEY='store-runner-home-cards-v1';
  function uniqueKnown(list,exclude){const out=[];for(const id of Array.isArray(list)?list:[]){const k=String(id);if(CARD_IDS.includes(k)&&!out.includes(k)&&!(exclude&&exclude.includes(k)))out.push(k)}return out}
  function normalizePrefs(raw){const r=raw&&typeof raw==='object'?raw:{},pinned=uniqueKnown(r.pinned);return{version:1,pinned,hidden:uniqueKnown(r.hidden,pinned)}}
  function isCustomPrefs(p){const n=normalizePrefs(p);return n.pinned.length>0||n.hidden.length>0}
  function prefsStore(){try{return window.__chefStorage||window.localStorage}catch(e){return null}}
  function readPrefs(db){const store=db||prefsStore();try{const raw=store&&store.getItem(PREFS_KEY);return normalizePrefs(raw?JSON.parse(raw):null)}catch(e){return normalizePrefs(null)}}
  function writePrefs(prefs,db){
    const store=db||prefsStore(),p=normalizePrefs(prefs);if(!store)return p;
    if(!isCustomPrefs(p))store.removeItem(PREFS_KEY);
    else store.setItem(PREFS_KEY,JSON.stringify(Object.assign({},p,{updatedAt:new Date().toISOString()})));
    try{if(typeof store.flush==='function'){const f=store.flush();if(f&&typeof f.catch==='function')f.catch(e=>console.warn('Préférences accueil non synchronisées',e))}}catch(e){console.warn('Préférences accueil non synchronisées',e)}
    return p;
  }
  const prefsOps={
    pin(p,id){const n=normalizePrefs(p);if(!CARD_IDS.includes(id)||n.pinned.includes(id))return n;return normalizePrefs({pinned:n.pinned.concat(id),hidden:n.hidden.filter(x=>x!==id)})},
    unpin(p,id){const n=normalizePrefs(p);return normalizePrefs({pinned:n.pinned.filter(x=>x!==id),hidden:n.hidden})},
    add(p,id){return prefsOps.pin(p,id)},
    remove(p,id){const n=normalizePrefs(p);return normalizePrefs({pinned:n.pinned.filter(x=>x!==id),hidden:n.hidden.includes(id)?n.hidden:n.hidden.concat(id)})},
    move(p,id,delta){const n=normalizePrefs(p),list=n.pinned.slice(),i=list.indexOf(id),j=i+(delta<0?-1:1);if(i<0||j<0||j>=list.length)return n;list.splice(i,1);list.splice(j,0,id);return normalizePrefs({pinned:list,hidden:n.hidden})},
    reset(){return normalizePrefs(null)}
  };
  /* Accueil = cartes épinglées (ordre utilisateur, même vides), puis classement
     automatique inchangé pour compléter les emplacements, sans les cartes retirées. */
  function composeHomeCards(catalog,prefs,slots){
    const p=normalizePrefs(prefs),max=Number.isFinite(slots)?slots:HOME_SLOTS,byId=new Map((catalog||[]).map(c=>[c.id,c]));
    const pinned=p.pinned.map(id=>byId.get(id)).filter(Boolean).map(c=>Object.assign({},c,{pinned:true,placement:'pinned'}));
    const used=new Set(p.pinned),hidden=new Set(p.hidden);
    const auto=rankCards((catalog||[]).filter(c=>c.auto!==false&&!c.empty&&!used.has(c.id)&&!hidden.has(c.id))).slice(0,Math.max(0,max-pinned.length)).map(c=>Object.assign({},c,{pinned:false,placement:'auto'}));
    return pinned.concat(auto);
  }

  function runtimeActivityCatalog(now){
    const ref=now instanceof Date?now:new Date();let pilotage={rows:[]},performance={rows:[]},opportunities=[];
    try{if(window.StoreRunnerSectorPilotage&&typeof window.StoreRunnerSectorPilotage.compute==='function')pilotage=window.StoreRunnerSectorPilotage.compute(state,{now:ref})||pilotage}catch(e){}
    try{if(window.StoreRunnerPerformanceV190&&typeof window.StoreRunnerPerformanceV190.dashboard==='function'){const db=window.__chefStorage||window.localStorage;performance=window.StoreRunnerPerformanceV190.dashboard(db,{state,stores:activeStores()})||performance}}catch(e){}
    try{if(window.StoreRunnerOpportunities&&typeof window.StoreRunnerOpportunities.list==='function')opportunities=window.StoreRunnerOpportunities.list(state,{openOnly:true})||[];else opportunities=((((state||{}).businessV2||{}).opportunities)||[])}catch(e){}
    return buildActivityCatalog(state,{now:ref,pilotage,performance,opportunities,recommended:recommended(),appointment:nextAppointment(ref)});
  }
  /* V245 — Mode terrain contextuel. La carte réutilise le workflow terrain existant :
     data-sr-start ouvre la visite 6P par StoreRunnerVisits.start (même gestionnaire que
     le bouton du terrainPanel), openMapsStore l'itinéraire et openTerrain le panneau.
     Aucun second moteur : la tournée vient de StoreRunnerActivityMetrics.todayTour. */
  /* V258 — vocabulaire Runner à l'écran. Le bouton ouvre toujours la visite 6P
     (StoreRunnerVisits.start) ; seuls les libellés visibles changent. */
  const RUN_LABELS={start:'Démarrer le run',resume:'Reprendre le run'};
  function buildTerrainCard(tour,extra){
    if(!tour||!tour.total)return'';
    const x=extra||{},credits=n=>plural(n,'crédit de visite','crédits de visite');
    const km=Number.isFinite(x.dayKm)&&x.dayKm>0?' · ~'+Math.round(x.dayKm)+' km estimés':'';
    const head=`<div class="phTerrainEyebrow">Mode Runner</div>`;
    if(tour.finished)return `<section class="phTerrain" data-home-terrain="done" aria-label="Mode Runner">${head}<div class="phTerrainDay">${esc(tour.day)} · tournée terminée</div><div class="phTerrainStore">${tour.done} / ${tour.total} magasins visités</div><div class="phTerrainMeta">${esc(credits(tour.credits))} réalisés aujourd’hui</div><div class="phTerrainBtns"><button type="button" class="phTerrainMain" data-sr-hub>Voir mes visites &amp; actions</button></div></section>`;
    const c=tour.current||{},position=tour.index+1,id=esc(String(c.id));
    const place=[text(c.adresse),Number.isFinite(x.distanceKm)?'~'+Math.round(x.distanceKm)+' km à vol d’oiseau':''].filter(Boolean).join(' · ');
    const summary='Aujourd’hui : '+tour.done+'/'+plural(tour.total,'magasin','magasins')+' faits · '+credits(tour.credits)+km;
    const next=tour.next?`<div class="phTerrainNext">Prochaine : <b>${esc([text(tour.next.enseigne),text(tour.next.ville)].filter(Boolean).join(' '))}</b></div>`:`<div class="phTerrainNext">Dernier magasin de la tournée.</div>`;
    return `<section class="phTerrain" data-home-terrain="active" data-terrain-store="${id}" aria-label="Mode Runner">${head}<div class="phTerrainDay">${esc(tour.day)} · visite ${position} / ${tour.total}</div><div class="phTerrainStore">${esc([text(c.enseigne),text(c.ville)].filter(Boolean).join(' ')||'Magasin')}</div>${place?`<div class="phTerrainMeta">${esc(place)}</div>`:''}<div class="phTerrainBtns"><button type="button" class="phTerrainMain" data-sr-start="${id}">${x.draft?RUN_LABELS.resume:RUN_LABELS.start}</button><button type="button" class="phTerrainRoute" data-store-id="${id}" onclick="openMapsStore(this.dataset.storeId)">➤ Itinéraire</button></div><div class="phTerrainSummary">${esc(summary)}</div>${next}<button type="button" class="phTerrainOpen" onclick="openTerrain()">Ouvrir le mode Runner ›</button></section>`;
  }
  function archiveSnapshot(){try{const db=window.__chefStorage||window.localStorage;return JSON.parse(db.getItem('chef_sector_plan_archive_v1')||'{}')||{}}catch(e){return{}}}
  function runtimeTodayTour(now){const api=metricsApi();if(!api)return null;try{return api.todayTour(state,{now,archive:archiveSnapshot})}catch(e){return null}}
  function addLocalDays(date,n){const d=new Date(date);d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d}
  function plannedRouteForDate(stateValue,date,archive,referenceNow){
    const d=date instanceof Date?new Date(date):parse(date);if(!d||isNaN(d))return null;d.setHours(12,0,0,0);
    const dayIndex=(d.getDay()+6)%7;if(dayIndex>5)return null;
    const day=DAYS[dayIndex],targetMonday=weekBounds(d).start,now=referenceNow instanceof Date?referenceNow:new Date();
    let planMonday='';try{const configured=parse(String((stateValue.settings&&stateValue.settings.weekDate)||'').slice(0,10));planMonday=weekBounds(configured||now).start}catch(e){planMonday=weekBounds(now).start}
    let rows=null;
    if(planMonday===targetMonday&&stateValue.plan&&Array.isArray(stateValue.plan[day]))rows=stateValue.plan[day];
    else{const snap=archive&&archive[targetMonday];if(snap&&snap.plan&&Array.isArray(snap.plan[day]))rows=snap.plan[day]}
    if(!rows||!rows.length)return null;
    const route=rows.map(row=>storeFor(stateValue,storeIdOf(row))||row).filter(row=>row&&storeIdOf(row));if(!route.length)return null;
    let credits=route.length;try{if(typeof window!=='undefined'&&typeof window.storeVisitCreditsForRoute==='function')credits=Number(window.storeVisitCreditsForRoute(route))||route.length}catch(e){}
    return{date:isoLocal(d),day,route,total:route.length,credits};
  }
  function nextPlannedTour(stateValue,now,archive,maxDays){
    const ref=now instanceof Date?new Date(now):new Date(now||Date.now()),limit=Math.max(1,Number(maxDays)||35);
    ref.setHours(12,0,0,0);
    for(let offset=1;offset<=limit;offset++){const candidate=plannedRouteForDate(stateValue,addLocalDays(ref,offset),archive,ref);if(candidate){candidate.offset=offset;return candidate}}
    return null;
  }
  function appointmentsForDay(stateValue,date){return (stateValue.appointments||[]).filter(a=>a&&String(a.date||'').slice(0,10)===String(date||'').slice(0,10))}
  function dayTitle(next){
    if(!next)return'Aujourd’hui.';if(next.offset===1)return'Demain.';
    const d=parse(next.date);if(!d)return'Prochaine journée.';
    const label=d.toLocaleDateString('fr-FR',{weekday:'long'});return label.charAt(0).toUpperCase()+label.slice(1)+'.';
  }
  function buildHomeContext(stateValue,now,todayTour,archive){
    const ref=now instanceof Date?new Date(now):new Date(now||Date.now()),afterHours=ref.getHours()>=20;
    const unfinished=!!(todayTour&&!todayTour.finished&&todayTour.remaining>0);
    const shouldAdvance=afterHours||!todayTour||todayTour.finished;
    const next=shouldAdvance?nextPlannedTour(stateValue,ref,archive,35):null;
    if(!next)return{mode:'today',title:'Aujourd’hui.',afterHours,pendingToday:unfinished?todayTour.remaining:0,today:todayTour,next:null};
    return{mode:'next',title:dayTitle(next),afterHours,pendingToday:afterHours&&unfinished?todayTour.remaining:0,today:todayTour,next};
  }
  function nextDayEstimate(next){let estimate=null;try{if(next&&next.route.length&&typeof window.dayEstimatePremium==='function')estimate=window.dayEstimatePremium(next.route,next.day)}catch(e){}return estimate}
  function openPlanningDateCode(date){const safe=String(date||'').replace(/[^0-9-]/g,'');return `goTab('planPanel');setTimeout(function(){var bs=document.querySelectorAll('.periodDayTab'),b=null;for(var i=0;i<bs.length;i++){if(bs[i].dataset&&bs[i].dataset.date==='${safe}'){b=bs[i];break}}if(b)b.click()},40)`}
  function buildNextDayCard(context,stateValue){
    const next=context&&context.next;if(!next)return'';const estimate=nextDayEstimate(next),appointments=appointmentsForDay(stateValue,next.date),byStore=new Map();
    for(const a of appointments){const id=storeIdOf(a);if(id)byStore.set(id,a)}
    const bits=[plural(next.total,'magasin','magasins'),plural(next.credits,'crédit de visite','crédits de visite')];
    if(estimate&&estimate.start)bits.push('départ '+estimate.start);if(estimate&&Number.isFinite(estimate.km))bits.push('~'+Math.round(estimate.km)+' km');
    const warning=context.pendingToday?`<div class="phNextWarn">${esc(plural(context.pendingToday,'visite encore en attente aujourd’hui','visites encore en attente aujourd’hui'))}</div>`:'';
    const rows=next.route.map((s,i)=>{const id=storeIdOf(s),ap=byStore.get(id),time=ap&&ap.time?' · RDV '+text(ap.time):'';return `<li><span>${i+1}</span><b>${esc(storeLabel(stateValue,id,s))}</b>${time?`<small>${esc(time.replace(/^ · /,''))}</small>`:''}</li>`}).join('');
    return `<section class="phNextDay" data-home-next-day="${esc(next.date)}" aria-label="Programme de la prochaine journée"><div class="phNextEyebrow">Prochaine journée · ${esc(fmtDate(next.date))}</div><div class="phNextMeta">${esc(bits.join(' · '))}</div>${warning}<ol class="phNextList">${rows}</ol><button type="button" class="phNextOpen" onclick="${openPlanningDateCode(next.date)}">Voir cette journée dans le planning ›</button></section>`;
  }
  function scheduleContextBoundary(now){
    if(contextTimer){clearTimeout(contextTimer);contextTimer=null}
    const ref=now instanceof Date?new Date(now):new Date(),next=new Date(ref);
    if(ref.getHours()<20){next.setHours(20,0,0,0)}else{next.setDate(next.getDate()+1);next.setHours(0,0,1,0)}
    const delay=Math.max(1000,Math.min(2147483000,next-ref));contextTimer=setTimeout(()=>{contextTimer=null;scheduleRun(0)},delay)
  }
  function runtimeTerrainCard(tour){
    if(!tour)return'';const extra={};
    try{const c=tour.current;if(c&&typeof window.hav==='function'){const d=tour.previous?window.hav(tour.previous,c):(typeof window.havBase==='function'?window.havBase(c):NaN);if(Number.isFinite(Number(d)))extra.distanceKm=Number(d)}}catch(e){}
    try{if(typeof window.dayEstimatePremium==='function'){const est=window.dayEstimatePremium(tour.route,tour.day);if(est&&Number.isFinite(est.km))extra.dayKm=est.km}}catch(e){}
    try{const id=tour.current&&String(tour.current.id);extra.draft=!!(id&&(((state.businessV2||{}).visits)||[]).some(v=>v&&String(v.storeId)===id&&v.status==='draft'))}catch(e){}
    return buildTerrainCard(tour,extra);
  }
  /* Un tap ouvre le contenu logique de la carte. V259 : une carte qui nomme un magasin
     (À traiter maintenant, Prochaine priorité) ouvre la fiche de ce magasin ; l'ancienne
     destination reste le repli si la fiche n'est pas disponible. */
  function openStoreCard(storeId){try{if(storeId&&typeof window.openStoreQuick==='function'&&(state.stores||[]).some(s=>String(s.id)===String(storeId))){window.openStoreQuick(storeId);return true}}catch(e){}return false}
  function goPanel(id){if(typeof window.goTab==='function')window.goTab(id)}
  function openCardTarget(action,storeId){
    if((action==='pilotage'||action==='stores')&&storeId&&openStoreCard(storeId))return;
    if(action==='pilotage'){if(window.StoreRunnerSectorPilotage&&typeof StoreRunnerSectorPilotage.open==='function')StoreRunnerSectorPilotage.open(window);else goPanel('storesPanel');return}
    if(action==='opportunities'){if(window.StoreRunnerOpportunities&&typeof StoreRunnerOpportunities.open==='function')StoreRunnerOpportunities.open('','');return}
    if(action==='appointments'){goPanel('appointmentsPanel');return}
    if(action==='stores'){goPanel('storesPanel');return}
    if(action==='hub'){if(window.StoreRunnerVisits&&typeof StoreRunnerVisits.openHub==='function')StoreRunnerVisits.openHub();else goPanel('historyPanel');return}
    if(action==='history'){goPanel('historyPanel');return}
    goPanel('planPanel');
  }
  function cardBody(c){return `<span class="phIcon">${icon(c.icon)}</span><span class="phLabel">${esc(c.label)}</span><strong class="phValue${c.storeId?' phStoreValue':''}">${esc(c.value)}</strong><span class="phSub">${esc(c.sub)}</span>`}
  function activityMarkup(cards){return cards.map(c=>`<button type="button" class="phCard${c.pinned?' phPinned':''}${c.empty?' phEmpty':''}" data-home-card="${esc(c.id)}" data-home-action="${esc(c.action)}" data-store-id="${esc(c.storeId||'')}"${c.pinned?' data-home-pinned="1"':''}>${c.pinned?`<span class="phPinMark" title="Épinglée">${icon('pin')}</span>`:''}${cardBody(c)}</button>`).join('')}

  /* V259 — feuille « Votre activité » : « Voir tout » (toutes les cartes, ajout/retrait
     de l'accueil) et « Personnaliser » (épingler, ordre, masquer, réinitialiser).
     Une seule feuille, deux vues ; elle ne possède que les préférences d'affichage. */
  let sheetView='all',lastCatalog=[];
  function sheetNode(){
    let d=document.getElementById('homeCardsSheet');if(d)return d;
    d=document.createElement('dialog');d.id='homeCardsSheet';d.className='phSheet';d.setAttribute('aria-labelledby','homeCardsSheetTitle');
    document.body.appendChild(d);
    d.addEventListener('click',onSheetClick);
    d.addEventListener('cancel',e=>{e.preventDefault();closeSheet()});
    return d;
  }
  function closeSheet(){const d=document.getElementById('homeCardsSheet');if(d&&d.open){try{d.close()}catch(e){d.removeAttribute('open')}}}
  function openSheet(view){
    sheetView=view==='edit'?'edit':'all';const d=sheetNode();renderSheet();
    if(!d.open){try{d.showModal()}catch(e){d.setAttribute('open','')}}
    const body=d.querySelector('.phSheetBody');if(body)body.scrollTop=0;
  }
  function sheetRow(c,placement,index,count){
    const id=esc(c.id),tools=[];
    if(placement==='pinned'){
      tools.push(`<button type="button" class="phTool" data-home-move="-1" data-card-id="${id}" aria-label="Monter ${esc(c.label)}"${index===0?' disabled':''}>↑</button>`);
      tools.push(`<button type="button" class="phTool" data-home-move="1" data-card-id="${id}" aria-label="Descendre ${esc(c.label)}"${index===count-1?' disabled':''}>↓</button>`);
      tools.push(`<button type="button" class="phTool on" data-home-unpin="${id}" aria-pressed="true" aria-label="Désépingler ${esc(c.label)}">${icon('pin')}</button>`);
      tools.push(`<button type="button" class="phTool" data-home-remove="${id}" aria-label="Retirer ${esc(c.label)} de l’accueil">✕</button>`);
    }else if(placement==='auto'){
      tools.push(`<button type="button" class="phTool" data-home-pin="${id}" aria-pressed="false" aria-label="Épingler ${esc(c.label)}">${icon('pin')}</button>`);
      tools.push(`<button type="button" class="phTool" data-home-remove="${id}" aria-label="Retirer ${esc(c.label)} de l’accueil">✕</button>`);
    }else{
      tools.push(`<button type="button" class="phTool phAdd" data-home-add="${id}" aria-label="Ajouter ${esc(c.label)} à l’accueil">+ Ajouter</button>`);
    }
    return `<li class="phEditRow" data-card-id="${id}" data-placement="${placement}"><span class="phEditIcon">${icon(c.icon)}</span><span class="phEditText"><b>${esc(c.label)}</b><small>${esc(c.value)}</small></span><span class="phEditTools">${tools.join('')}</span></li>`;
  }
  function renderSheet(){
    const d=document.getElementById('homeCardsSheet');if(!d)return;
    const prefs=readPrefs(),custom=isCustomPrefs(prefs),catalog=lastCatalog.length?lastCatalog:runtimeActivityCatalog(new Date()),home=composeHomeCards(catalog,prefs),onHome=new Set(home.map(c=>c.id)),hidden=new Set(prefs.hidden);
    const mode=custom?'Personnalisé · '+plural(prefs.pinned.length,'carte épinglée','cartes épinglées'):'Automatique · les cartes suivent tes priorités';
    let body='';
    if(sheetView==='all'){
      body=`<div class="phSheetGrid">${catalog.map(c=>{const on=onHome.has(c.id);return `<div class="phSheetCard${on?' on':''}${c.empty?' phEmpty':''}" data-card-id="${esc(c.id)}"><button type="button" class="phSheetOpen" data-home-open="${esc(c.id)}" data-home-action="${esc(c.action)}" data-store-id="${esc(c.storeId||'')}">${cardBody(c)}</button><button type="button" class="phSheetToggle" ${on?`data-home-remove="${esc(c.id)}" aria-pressed="true"`:`data-home-add="${esc(c.id)}" aria-pressed="false"`}>${on?'✓ Sur l’accueil':'+ Ajouter'}</button></div>`}).join('')}</div><button type="button" class="phSheetLink" data-home-history>Historique des visites ${icon('chevron')}</button>`;
    }else{
      const pinned=home.filter(c=>c.placement==='pinned'),auto=home.filter(c=>c.placement==='auto'),rest=catalog.filter(c=>!onHome.has(c.id));
      body=`<p class="phSheetHint">Les cartes épinglées restent sur l’accueil dans cet ordre. Les places restantes suivent tes priorités du moment.</p>`+
        `<h4>Épinglées</h4>`+(pinned.length?`<ul class="phEditList">${pinned.map((c,i)=>sheetRow(c,'pinned',i,pinned.length)).join('')}</ul>`:`<p class="phSheetEmpty">Aucune carte épinglée. Touche ${icon('pin')} pour en garder une.</p>`)+
        `<h4>Automatiques</h4>`+(auto.length?`<ul class="phEditList">${auto.map(c=>sheetRow(c,'auto')).join('')}</ul>`:`<p class="phSheetEmpty">Aucune place automatique restante.</p>`)+
        `<h4>Autres cartes</h4>`+(rest.length?`<ul class="phEditList">${rest.map(c=>sheetRow(c,hidden.has(c.id)?'hidden':'available')).join('')}</ul>`:`<p class="phSheetEmpty">Toutes les cartes sont sur l’accueil.</p>`)+
        `<button type="button" class="phSheetReset" data-home-reset${custom?'':' disabled'}>Réinitialiser · mode automatique</button>`;
    }
    const html=`<div class="phSheetHead"><div><h3 id="homeCardsSheetTitle">Votre activité</h3><p data-home-mode="${custom?'custom':'auto'}">${esc(mode)}</p></div><button type="button" class="phSheetClose" data-home-close>Fermer</button></div><div class="phSheetTabs" role="group" aria-label="Vue"><button type="button" data-home-view="all" aria-pressed="${sheetView==='all'}">Toutes les cartes</button><button type="button" data-home-view="edit" aria-pressed="${sheetView==='edit'}">Personnaliser</button></div><div class="phSheetBody">${body}</div>`;
    const scroller=d.querySelector('.phSheetBody'),top=scroller?scroller.scrollTop:0;
    if(d.__lastHtml!==html){d.innerHTML=html;d.__lastHtml=html;const next=d.querySelector('.phSheetBody');if(next)next.scrollTop=top}
  }
  function updatePrefs(fn){writePrefs(fn(readPrefs()));run();renderSheet();document.dispatchEvent(new CustomEvent('store-runner:home-cards-changed',{detail:readPrefs()}))}
  function onSheetClick(e){
    const t=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!t){if(e.target===e.currentTarget)closeSheet();return}
    const ds=t.dataset;
    if(ds.homeClose!==undefined){closeSheet();return}
    if(ds.homeView){sheetView=ds.homeView==='edit'?'edit':'all';renderSheet();return}
    if(ds.homeOpen){closeSheet();openCardTarget(ds.homeAction,ds.storeId);return}
    if(ds.homeHistory!==undefined){closeSheet();goPanel('historyPanel');return}
    if(ds.homeReset!==undefined){updatePrefs(()=>prefsOps.reset());return}
    if(ds.homeAdd){const id=ds.homeAdd;updatePrefs(p=>prefsOps.add(p,id));return}
    if(ds.homeRemove){const id=ds.homeRemove;updatePrefs(p=>prefsOps.remove(p,id));return}
    if(ds.homePin){const id=ds.homePin;updatePrefs(p=>prefsOps.pin(p,id));return}
    if(ds.homeUnpin){const id=ds.homeUnpin;updatePrefs(p=>prefsOps.unpin(p,id));return}
    if(ds.homeMove){const id=ds.cardId,delta=Number(ds.homeMove);updatePrefs(p=>prefsOps.move(p,id,delta));return}
  }
  function onHomeClick(e){
    const t=e.target&&e.target.closest?e.target.closest('#premiumHomeV2 [data-home-customize],#premiumHomeV2 [data-home-all],#premiumHomeV2 .phCard[data-home-card]'):null;if(!t)return;
    if(t.dataset.homeCustomize!==undefined){openSheet('edit');return}
    if(t.dataset.homeAll!==undefined){openSheet('all');return}
    openCardTarget(t.dataset.homeAction,t.dataset.storeId);
  }

  function ensureCss(){if(document.getElementById('home-refresh-v2-css'))return;const s=document.createElement('style');s.id='home-refresh-v2-css';s.textContent=`
#homePanel{max-width:980px;margin:0 auto}.homeHero,#homeKpis,#homePriority,#homeNext,#homePanel>.sectionTitle{display:none!important}
#premiumHomeV2{display:block}.phTop{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:2px 0 22px}.phEyebrow{font-size:14px;color:#858991}.phTitle{font-size:clamp(42px,7vw,72px);line-height:.98;letter-spacing:-.065em;margin:7px 0 0;font-weight:820}.phBase{border:0;background:transparent;color:#777c85;font-size:14px;padding:2px 0}.phGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.phCard{box-sizing:border-box;width:100%;min-width:0;min-height:184px;padding:20px;border:1px solid rgba(255,255,255,.84);border-radius:28px;background:rgba(255,255,255,.72);box-shadow:0 14px 42px rgba(35,40,55,.08);backdrop-filter:blur(24px) saturate(1.15);-webkit-backdrop-filter:blur(24px) saturate(1.15);display:flex;flex-direction:column;align-items:flex-start;text-align:left;overflow:hidden;color:inherit}.phIcon{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(195,224,255,.82),rgba(228,239,251,.66));font-size:24px;color:#0a84ff;margin-bottom:28px}.phIcon svg{width:24px;height:24px}.phLabel{font-size:15px;color:#30333a}.phValue{display:block;max-width:100%;font-size:38px;line-height:1.02;font-weight:790;letter-spacing:-.055em;margin-top:8px;overflow-wrap:anywhere}.phValue.phStoreValue{font-size:26px;line-height:1.08;letter-spacing:-.035em}.phSub{display:block;font-size:13px;color:#777c85;margin-top:8px;line-height:1.35;overflow-wrap:anywhere}.phWide{margin-top:14px;padding:22px;border:1px solid rgba(255,255,255,.84);border-radius:30px;background:rgba(255,255,255,.72);box-shadow:0 14px 42px rgba(35,40,55,.08);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}.phWideLabel{font-size:16px;color:#6f747d}.phWideValue{font-size:42px;font-weight:790;letter-spacing:-.055em;margin:5px 0 16px}.phButton{width:100%;min-height:54px;border:0;border-radius:19px;background:rgba(180,211,247,.58);color:#0878e8;font-size:17px;font-weight:700}.phRange{margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 18px;border-radius:22px;background:rgba(255,255,255,.55);border:1px solid rgba(255,255,255,.72)}.phRange b{font-size:15px}.phRange span{display:block;font-size:12px;color:#777c85;margin-top:4px}.phRange button{border:0;background:#111217;color:#fff;border-radius:15px;padding:10px 13px;font-weight:700}.phActions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.phActions button{min-height:50px;border-radius:18px;border:1px solid rgba(120,125,140,.14);background:rgba(255,255,255,.70);color:#176fd0;font-weight:720}
#premiumHomeV2 .phTerrain{order:2;box-sizing:border-box;width:100%;margin:0 0 14px;padding:22px 20px 18px;border-radius:28px;background:#111;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.18)}#premiumHomeV2 .phTerrainEyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#d6d2cd}#premiumHomeV2 .phTerrainDay{font-size:13px;color:#b9b5af;margin-top:6px}#premiumHomeV2 .phTerrainStore{font-family:Georgia,serif;font-size:32px;line-height:1.08;margin:10px 0 6px;overflow-wrap:anywhere}#premiumHomeV2 .phTerrainMeta{font-size:14px;line-height:1.4;color:#e8e4de;overflow-wrap:anywhere}#premiumHomeV2 .phTerrainBtns{display:grid;grid-template-columns:1fr;gap:8px;margin-top:16px}#premiumHomeV2 .phTerrainBtns button{min-height:52px;border-radius:17px;font-size:16px;font-weight:800;border:0}#premiumHomeV2 .phTerrainMain{background:#fff;color:#111}#premiumHomeV2 .phTerrainRoute{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.22)!important}#premiumHomeV2 .phTerrainSummary{margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.14);font-size:13px;color:#d6d2cd;line-height:1.4}#premiumHomeV2 .phTerrainNext{font-size:13px;color:#d6d2cd;margin-top:4px;line-height:1.4}#premiumHomeV2 .phTerrainNext b{color:#fff}#premiumHomeV2 .phVisitCard .phAssistant:first-child{margin-top:0}#premiumHomeV2 .phTerrainOpen{margin-top:10px;padding:6px 0;border:0;background:none;color:#fff;font-size:13px;font-weight:700;opacity:.8}@media(min-width:701px){#premiumHomeV2 .phTerrainBtns{grid-template-columns:2fr 1fr}}
#premiumHomeV2 .phNextDay{box-sizing:border-box;width:100%;margin:0 0 14px;padding:20px;border-radius:28px;background:#111;color:#fff;box-shadow:0 20px 50px rgba(0,0,0,.18)}#premiumHomeV2 .phNextEyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#d6d2cd}#premiumHomeV2 .phNextMeta{margin-top:7px;font-size:14px;line-height:1.4;color:#fff}#premiumHomeV2 .phNextWarn{margin-top:12px;padding:10px 12px;border-radius:14px;background:rgba(255,184,77,.15);border:1px solid rgba(255,184,77,.28);color:#ffd59a;font-size:13px;font-weight:750}#premiumHomeV2 .phNextList{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:7px}#premiumHomeV2 .phNextList li{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:38px;padding:6px 8px;border-radius:13px;background:rgba(255,255,255,.08)}#premiumHomeV2 .phNextList li>span{display:grid;place-items:center;width:25px;height:25px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;color:#d6d2cd}#premiumHomeV2 .phNextList b{font-size:14px;min-width:0;overflow-wrap:anywhere}#premiumHomeV2 .phNextList small{font-size:11px;color:#d6d2cd;text-align:right}#premiumHomeV2 .phNextOpen{width:100%;margin-top:14px;min-height:48px;border:0;border-radius:16px;background:#fff;color:#111;font-size:14px;font-weight:800}
#premiumHomeV2 .phActivityTools{display:flex;align-items:center;gap:14px;flex-shrink:0}#premiumHomeV2 .phActivityTools button{min-height:44px}#premiumHomeV2 .phActivityTools [data-home-customize]{color:#1686ff;font-weight:700}#premiumHomeV2 .phCard{position:relative}#premiumHomeV2 .phPinMark{position:absolute;top:10px;right:11px;color:#1686ff;opacity:.85}#premiumHomeV2 .phPinMark svg{width:14px;height:14px}#premiumHomeV2 .phCard.phEmpty .phValue{color:#8a93a6}
#homeCardsSheet{box-sizing:border-box;width:min(100% - 16px,560px);max-width:none;max-height:min(88dvh,760px);margin:auto auto calc(8px + env(safe-area-inset-bottom));padding:0;border:1px solid rgba(255,255,255,.9);border-radius:28px;background:#f6f8fc;color:#13213a;box-shadow:0 28px 80px rgba(20,25,35,.28);overflow:hidden}#homeCardsSheet[open]{display:flex;flex-direction:column}#homeCardsSheet::backdrop{background:rgba(20,24,32,.28);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#homeCardsSheet .phSheetHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 18px 8px}#homeCardsSheet h3{margin:0;font-size:20px;letter-spacing:-.035em}#homeCardsSheet .phSheetHead p{margin:3px 0 0;font-size:12px;color:#6d7890}#homeCardsSheet .phSheetClose{min-height:44px;border:0;border-radius:14px;background:#111217;color:#fff;font-weight:750;padding:0 14px;flex-shrink:0}
#homeCardsSheet .phSheetTabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:6px 18px 10px;padding:4px;border-radius:14px;background:#e6ebf3}#homeCardsSheet .phSheetTabs button{min-height:40px;border:0;border-radius:11px;background:transparent;color:#52627c;font-weight:700;font-size:13px}#homeCardsSheet .phSheetTabs button[aria-pressed="true"]{background:#fff;color:#13213a;box-shadow:0 2px 8px rgba(35,45,65,.1)}
#homeCardsSheet .phSheetBody{overflow:auto;-webkit-overflow-scrolling:touch;padding:0 14px 16px;min-height:0}#homeCardsSheet .phSheetGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#homeCardsSheet .phSheetCard{display:flex;flex-direction:column;min-width:0;border-radius:18px;background:#fff;border:1px solid #e4e9f1;overflow:hidden}#homeCardsSheet .phSheetCard.on{border-color:#9cc9ff;box-shadow:0 0 0 1px #9cc9ff inset}#homeCardsSheet .phSheetOpen{flex:1;display:flex;flex-direction:column;align-items:flex-start;text-align:left;min-width:0;padding:12px 12px 8px;border:0;background:none;color:inherit}#homeCardsSheet .phIcon{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(140deg,#c8e2ffa3,#eef8ffb8);color:#1686ff;margin-bottom:6px}#homeCardsSheet .phIcon svg{width:18px;height:18px}#homeCardsSheet .phLabel{font-size:12px;color:#6d7890}#homeCardsSheet .phValue{display:block;max-width:100%;font-size:17px;line-height:1.1;font-weight:780;letter-spacing:-.035em;margin-top:3px;overflow-wrap:anywhere}#homeCardsSheet .phSub{display:block;font-size:11px;line-height:1.3;color:#6d7890;margin-top:3px;overflow-wrap:anywhere}#homeCardsSheet .phEmpty .phValue{color:#8a93a6}#homeCardsSheet .phSheetToggle{min-height:44px;border:0;border-top:1px solid #edf0f5;background:#f7f9fc;color:#1686ff;font-weight:750;font-size:13px}#homeCardsSheet .phSheetCard.on .phSheetToggle{background:#eaf4ff;color:#0b63c5}
#homeCardsSheet .phSheetLink{display:flex;align-items:center;justify-content:center;gap:4px;width:100%;min-height:44px;margin-top:10px;border:0;background:none;color:#52627c;font-size:13px;font-weight:700}#homeCardsSheet .phSheetLink svg{width:14px;height:14px}
#homeCardsSheet h4{margin:14px 4px 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6d7890}#homeCardsSheet .phSheetHint{margin:0 4px 4px;font-size:12px;line-height:1.4;color:#52627c}#homeCardsSheet .phSheetEmpty{margin:0 4px;font-size:12px;color:#8a93a6}#homeCardsSheet .phSheetEmpty svg{width:12px;height:12px;vertical-align:-1px}
#homeCardsSheet .phEditList{list-style:none;margin:0;padding:0;display:grid;gap:6px}#homeCardsSheet .phEditRow{display:flex;align-items:center;gap:8px;min-height:56px;padding:6px 6px 6px 10px;border-radius:16px;background:#fff;border:1px solid #e4e9f1}#homeCardsSheet .phEditRow[data-placement="pinned"]{border-color:#9cc9ff}#homeCardsSheet .phEditIcon{display:grid;place-items:center;width:30px;height:30px;flex-shrink:0;border-radius:10px;background:#eef5ff;color:#1686ff}#homeCardsSheet .phEditIcon svg{width:17px;height:17px}#homeCardsSheet .phEditText{flex:1;min-width:0}#homeCardsSheet .phEditText b{display:block;font-size:14px;line-height:1.2}#homeCardsSheet .phEditText small{display:block;font-size:11px;color:#6d7890;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#homeCardsSheet .phEditTools{display:flex;gap:4px;flex-shrink:0}#homeCardsSheet .phTool{display:grid;place-items:center;min-width:40px;height:44px;padding:0 6px;border:0;border-radius:12px;background:#f0f3f8;color:#33405a;font-size:16px;font-weight:750}#homeCardsSheet .phTool svg{width:16px;height:16px}#homeCardsSheet .phTool.on{background:#1686ff;color:#fff}#homeCardsSheet .phTool:disabled{opacity:.35}#homeCardsSheet .phTool.phAdd{font-size:13px;color:#1686ff;padding:0 12px}
#homeCardsSheet .phSheetReset{width:100%;min-height:48px;margin-top:16px;border:1px solid #d7deea;border-radius:16px;background:#fff;color:#c2410c;font-weight:750}#homeCardsSheet .phSheetReset:disabled{color:#9aa3b5}
#moreSheetV2{display:none;position:fixed;inset:0;z-index:190;background:rgba(20,24,32,.20);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}#moreSheetV2.open{display:block}.moreSheetCard{position:absolute;left:12px;right:12px;bottom:calc(82px + env(safe-area-inset-bottom));padding:10px;border-radius:28px;background:rgba(249,250,252,.94);border:1px solid rgba(255,255,255,.9);box-shadow:0 28px 80px rgba(20,25,35,.24)}.moreSheetCard>div:first-child{width:42px;height:5px;border-radius:999px;background:#d3d6dc;margin:2px auto 12px}.moreSheetGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.moreSheetGrid button{border:0;background:rgba(235,238,244,.76);border-radius:18px;min-height:58px;font-weight:720;color:#333941}.moreClose{width:100%;margin-top:8px;border:0;background:#111217;color:#fff;border-radius:18px;min-height:48px;font-weight:750}
@media(max-width:700px){.top .tabs{display:none!important}.top{padding-bottom:10px!important}.phTop{margin-top:10px}.phTitle{font-size:48px}.phGrid{gap:10px}.phCard{min-height:166px;padding:17px;border-radius:24px}.phIcon{margin-bottom:22px;width:44px;height:44px}.phValue{font-size:31px}.phValue.phStoreValue{font-size:22px}.phWide{border-radius:26px;padding:19px}.phWideValue{font-size:38px}.bottomAppNav{grid-template-columns:repeat(5,1fr)!important}.bottomNavBtn{font-size:10px!important}.bottomNavBtn .bnIcon{font-size:22px!important}#premiumHomeV2 .phNextList li{grid-template-columns:26px minmax(0,1fr)}#premiumHomeV2 .phNextList small{grid-column:2;text-align:left;margin-top:-5px}}
`;
    document.head.appendChild(s)
  }

  function buildHome(){
    const panel=document.getElementById('homePanel');if(!panel)return false;
    let box=document.getElementById('premiumHomeV2');if(!box){box=document.createElement('div');box.id='premiumHomeV2';const install=document.getElementById('installCard');if(install&&install.parentNode===panel)panel.insertBefore(box,install.nextSibling);else panel.insertBefore(box,panel.firstChild)}
    const range=rangeInfo(),today=new Date(),catalog=runtimeActivityCatalog(today),prefs=readPrefs(),custom=isCustomPrefs(prefs),cards=composeHomeCards(catalog,prefs),tour=runtimeTodayTour(today),archive=archiveSnapshot(),context=buildHomeContext(state,today,tour,archive),showNext=context.mode==='next'&&context.next,terrain=showNext?'':runtimeTerrainCard(tour),nextCard=showNext?buildNextDayCard(context,state):'';let rangeHtml='Aucune période générée',rangeSub='Crée ton prochain planning';
    lastCatalog=catalog;scheduleContextBoundary(today);
    if(range){rangeHtml=fmtDate(range.start)+' → '+fmtDate(range.end);rangeSub=(range.weeks||'')+(range.weeks?' semaines':'')+(range.uniqueStores?' · '+range.uniqueStores+' magasins distincts':'')}
    const day=DAYS[(today.getDay()+6)%7];let todayRoute=[];
    /* dateForDay n'est pas exposé hors du noyau : la tournée du jour vient de la même
       source que la carte terrain, pour que le sous-titre ne la contredise jamais. */
    if(tour)todayRoute=tour.route;
    let estimate=null;try{if(todayRoute.length&&typeof window.dayEstimatePremium==='function')estimate=window.dayEstimatePremium(todayRoute,day)}catch(e){}
    const km=estimate&&Number.isFinite(estimate.km)?' · ~'+Math.round(estimate.km)+' km':'';
    const summary=todayRoute.length?todayRoute.length+' magasin'+(todayRoute.length>1?'s':'')+' aujourd’hui'+km:'Prépare ta prochaine tournée';
    let daySummary=todayRoute.length?todayRoute.length+' magasin'+(todayRoute.length>1?'s':'')+' prévu'+(todayRoute.length>1?'s':'')+km+(estimate&&estimate.start?' · départ '+estimate.start:''):'Aucune visite prévue aujourd’hui';
    if(showNext){const nextEstimate=nextDayEstimate(context.next),parts=[plural(context.next.total,'magasin prévu','magasins prévus'),plural(context.next.credits,'crédit de visite','crédits de visite')];if(nextEstimate&&nextEstimate.start)parts.push('départ '+nextEstimate.start);if(context.pendingToday)parts.push(plural(context.pendingToday,'visite en attente aujourd’hui','visites en attente aujourd’hui'));daySummary=parts.join(' · ')}
    const sector=String((state.profile&&state.profile.sectorName)||'Mon secteur').replace(/^samsung\s*[·:–—-]?\s*/i,'').trim()||'Mon secteur';
    const markup=`<div class="phTop"><div class="phBrandRow"><div class="phBrand"><img class="srBrandLogo" src="./app-icon.svg" alt="S-RUNNER"><span class="srBrandName">Store Runner</span><span class="srBrandSignature">S-RUNNER By Red①</span></div><div class="phHeaderContext"><button class="phBase" type="button" onclick="openDepartureSettings()" aria-label="Modifier le point de départ">${icon('pin')}<span class="phDepartureCopy"><span>${/^(ma position(?: actuelle)?)$/i.test(baseName())?'Ma position actuelle':'Départ'}</span><span class="phDepartureAddress"></span></span></button><span class="phSector">${esc(sector)} · ${activeStores().length} magasins</span></div></div><h2 class="phTitle">${esc(context.title)}</h2><p class="phTagline">${esc(daySummary)}</p></div>
    ${nextCard}${terrain}<section class="phVisitCard" aria-label="Vos visites">${showNext?'':(terrain?'':`<button class="phVisitLink" type="button" onclick="goTab('planPanel')"><span class="phVisitIcon">${icon('navigation')}</span><span class="phVisitText"><strong>${todayRoute.length?'Ta journée est prête':'Prépare ta journée'}</strong><span>${esc(summary)}</span></span><span class="phArrow">${icon('chevron')}</span></button>`)}<button class="phAssistant" type="button" onclick="toggleAssistant()"><span class="phSpark">${icon('spark')}</span><span>Tes magasins, tes priorités,<br>préparons ta prochaine tournée…</span>${icon('chevron')}</button></section>
    <div class="phActivityHeading" data-home-mode="${custom?'custom':'auto'}"><div><h3>Votre activité</h3>${custom?'<p>Personnalisée</p>':''}</div><div class="phActivityTools"><button type="button" data-home-customize>Personnaliser</button><button type="button" data-home-all>Voir tout ${icon('chevron')}</button></div></div>
    <div class="phGrid" data-home-cards="${cards.length}">${activityMarkup(cards)}</div>
    <div class="phRange"><div><b>Planning actif</b><span>${esc(rangeHtml)} · ${esc(rangeSub)}</span></div><button type="button" onclick="goTab('planPanel')">Voir</button></div>`;
    if(box.__lastMarkup!==markup){box.innerHTML=markup;box.__lastMarkup=markup;document.dispatchEvent(new CustomEvent('store-runner:home-rendered'))}
    const sheet=document.getElementById('homeCardsSheet');if(sheet&&sheet.open)renderSheet();return true
  }

  function installMoreSheet(){if(document.getElementById('moreSheetV2'))return;const s=document.createElement('div');s.id='moreSheetV2';s.innerHTML='<div class="moreSheetCard"><div></div><div class="moreSheetGrid"><button data-go="appointmentsPanel">◷ Rendez-vous</button><button data-go="terrainPanel" data-terrain-fallback>➤ Mode Runner</button><button data-go="historyPanel">◴ Historique</button><button data-go="profilePanel">◎ Secteur</button><button data-go="importPanel">⇅ Données</button><button data-go="storesPanel">▤ Magasins</button></div><button class="moreClose" type="button">Fermer</button></div>';document.body.appendChild(s);s.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b){s.classList.remove('open');if(typeof window.goTab==='function')window.goTab(b.dataset.go);return}if(e.target===s||e.target.closest('.moreClose'))s.classList.remove('open')})}
  function showMore(){installMoreSheet();document.getElementById('moreSheetV2').classList.add('open')}
  function rebuildBottomNav(){const nav=document.getElementById('bottomAppNav');if(!nav)return false;if(nav.dataset.v2==='1')return true;nav.dataset.v2='1';nav.innerHTML='<button class="bottomNavBtn active" data-panel="homePanel" type="button"><span class="bnIcon">'+icon('home')+'</span>Accueil</button><button class="bottomNavBtn" data-panel="planPanel" type="button"><span class="bnIcon">'+icon('calendar')+'</span>Planning</button><button class="bottomNavBtn" data-panel="storesPanel" type="button"><span class="bnIcon">'+icon('store')+'</span>Magasins</button><button class="bottomNavBtn ia" data-ai="1" type="button"><span class="bnIcon">'+icon('spark')+'</span>IA</button><button class="bottomNavBtn" data-more="1" type="button"><span class="bnIcon">'+icon('more')+'</span>Plus</button>';nav.addEventListener('click',e=>{const b=e.target.closest('.bottomNavBtn');if(!b)return;if(b.dataset.ai){if(typeof window.toggleAssistant==='function')window.toggleAssistant();return}if(b.dataset.more){showMore();return}const p=b.dataset.panel;if(p&&typeof window.goTab==='function'){window.goTab(p);setActive(p)}});return true}
  function setActive(panel){document.body.classList.toggle('glassHome',panel==='homePanel');const nav=document.getElementById('bottomAppNav');if(!nav)return;nav.querySelectorAll('.bottomNavBtn').forEach(b=>b.classList.toggle('active',b.dataset.panel===panel))}
  function activePanel(){const p=document.querySelector('.panel.active');return p&&p.id}
  function run(){if(busy)return;busy=true;try{ensureCss();buildHome();rebuildBottomNav();installMoreSheet();setActive(activePanel()||'homePanel')}finally{busy=false}}
  function scheduleRun(delay){clearTimeout(refreshTimer);refreshTimer=setTimeout(run,delay==null?30:delay)}
  function observeHomeSignals(){if(homeObserver)return true;const targets=['homeKpis','homePriority','homeNext','terrainDay','terrainStore'].map(id=>document.getElementById(id)).filter(Boolean);if(!targets.length)return false;homeObserver=new MutationObserver(function(){scheduleRun(30)});targets.forEach(function(el){homeObserver.observe(el,{childList:true,subtree:true,characterData:true})});return true}
  function observePanels(){if(!panelObserver)panelObserver=new MutationObserver(function(){setTimeout(function(){setActive(activePanel()||'homePanel')},0)});let found=false;document.querySelectorAll('.panel').forEach(function(panel){found=true;if(observedPanels.has(panel))return;panelObserver.observe(panel,{attributes:true,attributeFilter:['class']});observedPanels.add(panel)});return found}
  async function boot(){for(let i=0;i<60;i++){run();observeHomeSignals();observePanels();if(document.getElementById('homePanel')&&document.getElementById('bottomAppNav')&&homeObserver)break;await new Promise(r=>setTimeout(r,100))}run();observeHomeSignals();observePanels()}
  function refreshWhenVisible(){if(document.hidden)return;run();observeHomeSignals();observePanels()}

  const publicApi={buildActivityCards,buildActivityCatalog,composeHomeCards,normalizePrefs,isCustomPrefs,readPrefs,writePrefs,prefsOps,PREFS_KEY,CARD_IDS,buildTerrainCard,rankCards,openActions,opportunityFacts,plannedRouteForDate,nextPlannedTour,buildHomeContext};
  if(typeof module!=='undefined'&&module.exports)module.exports=publicApi;
  if(typeof window==='undefined'||typeof document==='undefined')return;
  publicApi.openCards=openSheet;publicApi.closeCards=closeSheet;
  window.StoreRunnerHomeV204=publicApi;
  document.addEventListener('click',onHomeClick);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
  window.addEventListener('focus',refreshWhenVisible);
  window.addEventListener('pageshow',refreshWhenVisible);
  document.addEventListener('visibilitychange',refreshWhenVisible);
  ['store-runner:data-restored','store-runner:planning-updated','store-runner:opportunities-updated','store-runner:visit-deleted'].forEach(name=>document.addEventListener(name,()=>scheduleRun(20)));
})();