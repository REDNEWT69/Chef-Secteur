(function(){
  'use strict';

  const MAX_ONLINE_STORES=12;
  const MAX_CONTEXT_CHARS=7200;
  const MAX_DETAIL_TEXT=220;

  function clip(value,max){
    const s=String(value==null?'':value).trim();
    if(!s)return'';
    max=Number(max)||MAX_DETAIL_TEXT;
    return s.length>max?s.slice(0,max-1)+'…':s;
  }
  function norm(value){return String(value==null?'':value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
  function pct(value){if(value==null||!Number.isFinite(Number(value)))return'—';return String(Math.round(Number(value)*10)/10).replace('.',',')+' %'}
  function signed(value,unit){if(value==null||!Number.isFinite(Number(value)))return'—';const n=Math.round(Math.abs(Number(value))*10)/10;return(Number(value)>0?'+':Number(value)<0?'−':'')+String(n).replace('.',',')+(unit||' pt')}

  function basicStore(s){
    if(!s||typeof s!=='object')return null;
    return {
      id:s.id||null,
      enseigne:s.enseigne||'',
      ville:s.ville||'',
      dept:s.dept||'',
      priority:s.priority||null,
      lastVisit:s.lastVisit||null
    };
  }

  function slimPlan(plan){
    const out={};
    if(!plan||typeof plan!=='object')return out;
    Object.keys(plan).forEach(function(day){
      out[day]=(plan[day]||[]).slice(0,8).map(function(s){
        if(!s||typeof s!=='object')return null;
        return{id:s.id||null,enseigne:s.enseigne||'',ville:s.ville||''};
      }).filter(Boolean);
    });
    return out;
  }

  function slimSettings(s){
    s=s||{};
    return {
      weekDate:s.weekDate||null,
      days:Array.isArray(s.days)?s.days.slice(0,6):[],
      target:s.target||null,
      startTime:s.startTime||null,
      visitMinutes:s.visitMinutes||null
    };
  }

  function slimProfile(p){
    p=p||{};
    return {repName:p.repName||'',sectorName:p.sectorName||'',overnightMode:p.overnightMode||''};
  }

  function slimBusinessV2(b){
    b=b||{};
    return {
      activeDrafts:(Array.isArray(b.activeDrafts)?b.activeDrafts:[]).slice(0,4).map(function(v){return{storeId:v.storeId||null,store:v.store||'',step:Number.isInteger(v.step)?v.step:null}}),
      openActions:(Array.isArray(b.openActions)?b.openActions:[]).slice(0,8).map(function(a){return{storeId:a.storeId||null,store:a.store||'',category:a.category||'',description:clip(a.description,120),dueDate:a.dueDate||'',status:a.status||'',overdue:!!a.overdue}}),
      recentVisits:(Array.isArray(b.recentVisits)?b.recentVisits:[]).slice(0,4).map(function(v){return{storeId:v.storeId||null,store:v.store||'',completedDate:v.completedDate||null,conclusion:clip(v.conclusion,120)}})
    };
  }

  function slimPerformance(p){
    if(!p||typeof p!=='object')return null;
    return {
      week:p.week||null,
      targetPdm:p.targetPdm==null?null:p.targetPdm,
      counts:p.counts||{},
      rules:p.rules||{}
    };
  }

  function performanceFor(storeId){
    try{
      const api=window.StoreRunnerPerformanceV192;
      if(!api||typeof api.briefingForStore!=='function')return null;
      return api.briefingForStore(storeId)||null;
    }catch(e){return null}
  }

  function terrainRows(){
    const map=new Map();
    try{
      const api=window.StoreRunnerSectorPilotage;
      const st=window.state;
      if(!api||typeof api.compute!=='function'||!st)return map;
      const view=api.compute(st,{family:'all'});
      for(const row of (view&&view.rows)||[]){
        if(row&&row.store&&row.store.id!=null)map.set(String(row.store.id),row);
      }
    }catch(e){}
    return map;
  }

  function compactAnomalies(visit){
    try{
      return (((visit||{}).arrival||{}).anomalies||[])
        .filter(function(a){return a&&a.text})
        .slice(0,3)
        .map(function(a){return{family:a.family||'',text:clip(a.text,150)}});
    }catch(e){return[]}
  }

  function compactSixP(visit){
    const out=[];
    try{
      const six=(visit&&visit.sixP)||{};
      for(const category of Object.keys(six)){
        for(const row of (Array.isArray(six[category])?six[category]:[])){
          if(!row||!row.status||row.status==='ok')continue;
          out.push({category:category,family:row.family||'',status:row.status||'',comment:clip(row.comment,140),action:clip(row.action,140)});
          if(out.length>=4)return out;
        }
      }
    }catch(e){}
    return out;
  }

  function openActionDetails(storeId){
    try{
      const rows=((((window.state||{}).businessV2||{}).actions)||[]);
      return rows
        .filter(function(a){return a&&String(a.storeId)===String(storeId)&&a.status!=='done'&&a.status!=='cancelled'})
        .slice(0,4)
        .map(function(a){return{category:a.category||'',description:clip(a.description||a.text||a.action,150),dueDate:a.dueDate||'',status:a.status||''}});
    }catch(e){return[]}
  }

  function latestReport(visit){
    if(!visit)return null;
    const r=visit.report&&typeof visit.report==='object'?visit.report:{};
    const scope=function(x){x=x||{};return{team:clip(x.team,100),actions:clip(x.actions,130),massification:clip(x.massification,100),omni:clip(x.omni,100),training:clip(x.training,100)}};
    return {sharedContext:clip(r.shared&&r.shared.context,140),blanc:scope(r.blanc),brun:scope(r.brun)};
  }

  function richStore(s,terrainMap,fullDetail){
    const base=basicStore(s);if(!base)return null;
    const perf=performanceFor(base.id);
    const terrain=terrainMap.get(String(base.id))||null;
    const visit=terrain&&terrain.visit?terrain.visit:null;
    if(perf){
      base.performance={
        priority:perf.priority||null,
        priorityLabel:perf.priorityLabel||'',
        treated:!!perf.treated,
        pdmYtd:perf.pdmYtd==null?null:perf.pdmYtd,
        targetPdm:perf.targetPdm==null?null:perf.targetPdm,
        gapYtd:perf.gapYtd==null?null:perf.gapYtd,
        underTarget:perf.underTarget==null?null:!!perf.underTarget,
        evolutionYtd:perf.evolutionYtd==null?null:perf.evolutionYtd,
        weekly:perf.weekly?{direction:perf.weekly.direction||'',delta:perf.weekly.delta==null?null:perf.weekly.delta,volatile:!!perf.weekly.volatile}:null,
        sellOutYtd:perf.sellOutYtd==null?null:perf.sellOutYtd,
        mission:clip(perf.mission,fullDetail?180:90)
      };
    }
    if(terrain){
      base.terrain={
        pdl:terrain.pdl==null?null:terrain.pdl,
        compliance6P:terrain.compliance==null?null:terrain.compliance,
        alerts:Number(terrain.alerts)||0,
        openActions:Number(terrain.openActions)||0,
        pilotagePriority:terrain.priority==null?null:terrain.priority,
        pilotageLevel:terrain.level||null,
        reasons:(terrain.reasons||[]).slice(0,fullDetail?4:2).map(function(x){return clip(x,100)}),
        lastVisit:terrain.lastVisit||null
      };
      if(fullDetail){
        base.terrain.conclusion=clip(visit&&visit.conclusion,220);
        base.terrain.anomalies=compactAnomalies(visit);
        base.terrain.sixPToWork=compactSixP(visit);
        base.terrain.actions=openActionDetails(base.id);
        base.terrain.lastReport=latestReport(visit);
      }
    }
    return base;
  }

  function allStores(){return(window.state&&Array.isArray(window.state.stores))?window.state.stores:[]}
  function findStoreInQuestion(message){
    const n=norm(message);if(!n)return null;
    const rows=allStores();let best=null,bestScore=0;
    for(const s of rows){
      if(!s||s.id==null)continue;
      const labels=[s.ville,(s.enseigne||'')+' '+(s.ville||'')].map(norm).filter(Boolean);
      let score=0;
      for(const label of labels){
        if(label.length>=4&&n.includes(label))score=Math.max(score,label.length+30);
        else{
          const tokens=label.split(' ').filter(function(x){return x.length>3});
          const hits=tokens.filter(function(x){return n.includes(x)}).length;
          if(hits)score=Math.max(score,hits*8);
        }
      }
      if(score>bestScore){best=s;bestScore=score}
    }
    return bestScore>=8?best:null;
  }

  function lastUserQuestion(){
    try{
      const nodes=window.document&&window.document.querySelectorAll?window.document.querySelectorAll('#assistantMsgs .amsg.user'):[];
      return nodes&&nodes.length?String(nodes[nodes.length-1].textContent||'').trim():'';
    }catch(e){return''}
  }

  function dayInQuestion(message){
    const n=norm(message),days=['lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    for(const d of days)if(n.includes(d))return d.charAt(0).toUpperCase()+d.slice(1);
    return null;
  }

  function selectedStoresForContext(c,message){
    const rows=Array.isArray(c&&c.stores)?c.stores:[],byId=new Map();
    rows.forEach(function(s){if(s&&s.id!=null)byId.set(String(s.id),s)});
    const picked=[],seen=new Set();
    function add(store){if(!store||store.id==null||seen.has(String(store.id))||picked.length>=MAX_ONLINE_STORES)return;seen.add(String(store.id));picked.push(store)}
    function addId(id){if(id!=null)add(byId.get(String(id)))}

    const specific=findStoreInQuestion(message),day=dayInQuestion(message);
    if(specific)addId(specific.id);
    if(day&&c&&c.plan&&Array.isArray(c.plan[day]))c.plan[day].forEach(function(s){addId(s&&s.id)});

    const perfStores=c&&c.performanceV192&&Array.isArray(c.performanceV192.stores)?c.performanceV192.stores:[];
    perfStores.forEach(function(s){addId(s&&s.storeId)});

    const actions=c&&c.businessV2&&Array.isArray(c.businessV2.openActions)?c.businessV2.openActions:[];
    actions.forEach(function(a){addId(a&&a.storeId)});

    if(c&&c.plan&&typeof c.plan==='object')Object.keys(c.plan).forEach(function(k){(c.plan[k]||[]).forEach(function(s){addId(s&&s.id)})});
    if(!picked.length)rows.slice(0,MAX_ONLINE_STORES).forEach(add);
    return{stores:picked,specificId:specific&&specific.id!=null?String(specific.id):null};
  }

  function localStoreAnswer(message){
    const n=norm(message);
    if(!/(pdm|pdl|6p|performance|priorit|travaill|prepar|conseil|piste|representation|action|anomal|quoi faire|faire dans)/.test(n))return null;
    const store=findStoreInQuestion(message);if(!store)return null;
    const x=richStore(store,terrainRows(),true);if(!x)return null;
    const title=(x.enseigne||'Magasin')+(x.ville?' '+x.ville:'');
    const lines=['Brief magasin · '+title];
    const p=x.performance;
    if(p){
      const perf=[];
      if(p.pdmYtd!=null)perf.push('PDM YTD '+pct(p.pdmYtd));
      if(p.targetPdm!=null)perf.push('cible '+pct(p.targetPdm));
      if(p.gapYtd!=null)perf.push('écart '+signed(p.gapYtd));
      if(p.evolutionYtd!=null)perf.push('vs N-1 '+signed(p.evolutionYtd,' %'));
      if(p.priorityLabel)perf.push(p.priorityLabel+(p.treated?' traité':' non traité'));
      if(perf.length)lines.push('Performance : '+perf.join(' · ')+'.');
      if(p.weekly&&p.weekly.delta!=null)lines.push('Tendance hebdo : '+(p.weekly.direction||'indéterminée')+' '+signed(p.weekly.delta)+' (signal indicatif seulement).');
      if(p.mission)lines.push('Mission : '+p.mission+'.');
    }
    const t=x.terrain;
    if(t){
      const terrain=[];
      if(t.pdl!=null)terrain.push('représentation/PDL '+pct(t.pdl));
      if(t.compliance6P!=null)terrain.push('conformité 6P '+pct(t.compliance6P));
      if(t.alerts)terrain.push(t.alerts+' alerte'+(t.alerts>1?'s':''));
      if(t.openActions)terrain.push(t.openActions+' action'+(t.openActions>1?'s':'')+' ouverte'+(t.openActions>1?'s':''));
      if(terrain.length)lines.push('Terrain : '+terrain.join(' · ')+'.');
      if(t.reasons&&t.reasons.length)lines.push('Pourquoi le travailler : '+t.reasons.join(' · ')+'.');
      const work=[];
      for(const s of (t.sixPToWork||[]).slice(0,3))work.push([s.category,s.comment,s.action].filter(Boolean).join(' : '));
      for(const a of (t.anomalies||[]).slice(0,2))work.push(a.text);
      for(const a of (t.actions||[]).slice(0,3))if(a.description)work.push(a.description);
      if(work.length)lines.push('À travailler :\n'+work.map(function(v){return'• '+v}).join('\n'));
      if(t.conclusion)lines.push('Dernier compte rendu : '+t.conclusion);
    }
    if(!p&&!t)return null;
    return lines.join('\n');
  }

  function serializedSize(value){try{return JSON.stringify(value).length}catch(e){return Number.MAX_SAFE_INTEGER}}
  function enforceBudget(out,specificId){
    while(serializedSize(out)>MAX_CONTEXT_CHARS&&out.stores.length>(specificId?1:3))out.stores.pop();
    while(serializedSize(out)>MAX_CONTEXT_CHARS&&out.businessV2.openActions.length>3)out.businessV2.openActions.pop();
    while(serializedSize(out)>MAX_CONTEXT_CHARS&&out.businessV2.recentVisits.length>2)out.businessV2.recentVisits.pop();
    while(serializedSize(out)>MAX_CONTEXT_CHARS&&out.businessV2.activeDrafts.length>2)out.businessV2.activeDrafts.pop();
    if(serializedSize(out)>MAX_CONTEXT_CHARS&&specificId){
      const s=out.stores.find(function(x){return String(x.id)===String(specificId)});
      if(s&&s.terrain){delete s.terrain.lastReport;if(Array.isArray(s.terrain.sixPToWork))s.terrain.sixPToWork=s.terrain.sixPToWork.slice(0,2);if(Array.isArray(s.terrain.anomalies))s.terrain.anomalies=s.terrain.anomalies.slice(0,2);if(Array.isArray(s.terrain.actions))s.terrain.actions=s.terrain.actions.slice(0,2)}
    }
    return out;
  }

  function limitContext(c,questionOverride){
    c=c||{};
    const question=String(questionOverride||lastUserQuestion()||'').trim();
    const privacyInstruction='Les détails Google Agenda restent locaux à Store Runner et ne sont pas fournis à l’IA en ligne.';
    const storeInstruction='Les magasins fournis sont un sous-ensemble ciblé des données internes Store Runner, choisi pour la question afin de respecter la limite du modèle. Utilise leurs chiffres comme source de vérité. Performance : YTD principal, tendance hebdomadaire indicative. Terrain : croise PDL/représentation, 6P, alertes, actions et dernière visite. N’invente aucune donnée ni causalité ; si un magasin ou un champ utile manque du contexte, dis-le.';
    const terrainMap=terrainRows(),selection=selectedStoresForContext(c,question);
    const stores=selection.stores.map(function(s){return richStore(s,terrainMap,selection.specificId!=null&&String(s.id)===selection.specificId)}).filter(Boolean);
    const out={
      today:c.today||null,
      profile:slimProfile(c.profile),
      settings:slimSettings(c.settings),
      plan:slimPlan(c.plan),
      calendarEvents:[],
      calendarLastSync:c.calendarLastSync||null,
      awayRanges:[],
      daySummaries:{},
      overnight:null,
      businessV2:slimBusinessV2(c.businessV2),
      performanceV192:slimPerformance(c.performanceV192),
      contextMeta:{mode:'targeted',totalStores:Array.isArray(c.stores)?c.stores.length:0,selectedStores:stores.length,specificStore:selection.specificId||null},
      instructions:[c.instructions||'',privacyInstruction,storeInstruction].filter(Boolean).join(' '),
      stores:stores
    };
    return enforceBudget(out,selection.specificId);
  }

  window.storeRunnerLimitAssistantContext=limitContext;
  window.storeRunnerLocalStoreIntelligence=localStoreAnswer;
  if(typeof window.storeRunnerRegisterAssistantResolver==='function')window.storeRunnerRegisterAssistantResolver(localStoreAnswer,10);
  if(typeof window.storeRunnerRegisterAssistantContextTransform==='function')window.storeRunnerRegisterAssistantContextTransform(limitContext,100);
})();
