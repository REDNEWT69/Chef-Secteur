(function(){
  'use strict';

  const MAX_ONLINE_STORES=80;
  const MAX_DETAIL_TEXT=260;

  function clip(value,max){
    const s=String(value==null?'':value).trim();
    if(!s)return'';
    max=Number(max)||MAX_DETAIL_TEXT;
    return s.length>max?s.slice(0,max-1)+'…':s;
  }

  function basicStore(s){
    if(!s||typeof s!=='object')return null;
    return {
      id:s.id||null,
      enseigne:s.enseigne||'',
      ville:s.ville||'',
      dept:s.dept||'',
      freq:s.freq||'',
      priority:s.priority||null,
      lastVisit:s.lastVisit||null,
      products:Array.isArray(s.products)?s.products.slice(0,3):[]
    };
  }

  function slimPlan(plan){
    const out={};
    if(!plan||typeof plan!=='object')return out;
    Object.keys(plan).forEach(function(day){
      out[day]=(plan[day]||[]).slice(0,8).map(basicStore).filter(Boolean);
    });
    return out;
  }

  function slimSettings(s){
    s=s||{};
    return {
      weekDate:s.weekDate||null,
      days:Array.isArray(s.days)?s.days.slice(0,6):[],
      target:s.target||null,
      products:Array.isArray(s.products)?s.products.slice(0,6):[],
      startTime:s.startTime||null,
      visitMinutes:s.visitMinutes||null,
      saturdayStart:s.saturdayStart||null,
      saturdayEnd:s.saturdayEnd||null
    };
  }

  function slimProfile(p){
    p=p||{};
    return {
      repName:p.repName||'',
      sectorName:p.sectorName||'',
      overnightMode:p.overnightMode||''
    };
  }

  function slimBusinessV2(b){
    b=b||{};
    return {
      activeDrafts:(Array.isArray(b.activeDrafts)?b.activeDrafts:[]).slice(0,8).map(function(v){return{id:v.id||null,storeId:v.storeId||null,store:v.store||'',step:Number.isInteger(v.step)?v.step:null,updatedAt:v.updatedAt||null}}),
      openActions:(Array.isArray(b.openActions)?b.openActions:[]).slice(0,20).map(function(a){return{id:a.id||null,storeId:a.storeId||null,store:a.store||'',category:a.category||'',description:clip(a.description,180),owner:a.owner||'',dueDate:a.dueDate||'',status:a.status||'',overdue:!!a.overdue}}),
      recentVisits:(Array.isArray(b.recentVisits)?b.recentVisits:[]).slice(0,8).map(function(v){return{id:v.id||null,storeId:v.storeId||null,store:v.store||'',completedDate:v.completedDate||null,conclusion:clip(v.conclusion,220)}})
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
        .slice(0,5)
        .map(function(a){return{family:a.family||'',text:clip(a.text,220)}});
    }catch(e){return[]}
  }

  function compactSixP(visit){
    const out=[];
    try{
      const six=(visit&&visit.sixP)||{};
      for(const category of Object.keys(six)){
        for(const row of (Array.isArray(six[category])?six[category]:[])){
          if(!row||!row.status||row.status==='ok')continue;
          out.push({category:category,family:row.family||'',status:row.status||'',comment:clip(row.comment,220),action:clip(row.action,220)});
          if(out.length>=6)return out;
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
        .slice(0,5)
        .map(function(a){return{category:a.category||'',description:clip(a.description||a.text||a.action,220),owner:a.owner||'',dueDate:a.dueDate||'',status:a.status||'',overdue:!!a.overdue}});
    }catch(e){return[]}
  }

  function latestReport(visit){
    if(!visit)return null;
    const r=visit.report&&typeof visit.report==='object'?visit.report:{};
    const scope=function(x){x=x||{};return{team:clip(x.team,180),actions:clip(x.actions,220),massification:clip(x.massification,180),omni:clip(x.omni,180),training:clip(x.training,180)}};
    return {
      sharedContext:clip(r.shared&&r.shared.context,240),
      blanc:scope(r.blanc),
      brun:scope(r.brun)
    };
  }

  function richStore(s,terrainMap){
    const base=basicStore(s);if(!base)return null;
    const perf=performanceFor(base.id);
    const terrain=terrainMap.get(String(base.id))||null;
    const visit=terrain&&terrain.visit?terrain.visit:null;
    if(perf){
      base.performance={
        week:perf.week||null,
        priority:perf.priority||null,
        priorityLabel:perf.priorityLabel||'',
        treated:!!perf.treated,
        statusYtd:perf.statusYtd||null,
        pdmYtd:perf.pdmYtd==null?null:perf.pdmYtd,
        targetPdm:perf.targetPdm==null?null:perf.targetPdm,
        gapYtd:perf.gapYtd==null?null:perf.gapYtd,
        underTarget:perf.underTarget==null?null:!!perf.underTarget,
        evolutionYtd:perf.evolutionYtd==null?null:perf.evolutionYtd,
        weekly:perf.weekly||null,
        sellOutYtd:perf.sellOutYtd==null?null:perf.sellOutYtd,
        visitCount:Number(perf.visitCount)||0,
        mission:clip(perf.mission,240)
      };
    }
    if(terrain){
      base.terrain={
        pdl:terrain.pdl==null?null:terrain.pdl,
        compliance6P:terrain.compliance==null?null:terrain.compliance,
        rated6P:Number(terrain.rated6P)||0,
        alerts:Number(terrain.alerts)||0,
        openActions:Number(terrain.openActions)||0,
        pilotagePriority:terrain.priority==null?null:terrain.priority,
        pilotageLevel:terrain.level||null,
        reasons:(terrain.reasons||[]).slice(0,6).map(function(x){return clip(x,180)}),
        visitAgeDays:terrain.age==null?null:terrain.age,
        visitLateDays:terrain.late==null?null:terrain.late,
        lastVisit:terrain.lastVisit||null,
        conclusion:clip(visit&&visit.conclusion,300),
        anomalies:compactAnomalies(visit),
        sixPToWork:compactSixP(visit),
        actions:openActionDetails(base.id),
        lastReport:latestReport(visit)
      };
    }
    return base;
  }

  function limitContext(c){
    c=c||{};
    const privacyInstruction='Les détails Google Agenda restent locaux à Store Runner et ne sont pas fournis à l’IA en ligne. Ne prétends pas connaître un événement, un hôtel ou un déplacement provenant de Google Agenda si le résolveur local ne l’a pas déjà traité.';
    const storeInstruction='Les objets stores sont les données internes réelles de Store Runner. Quand un magasin contient performance, utilise PDM YTD, cible, écart, évolution, sell-out et priorité comme chiffres de référence. Quand il contient terrain, croise PDL/représentation, conformité 6P, anomalies, actions ouvertes, dernière visite et compte rendu pour proposer des actions concrètes. Le YTD reste le statut performance principal ; la tendance hebdomadaire est seulement indicative. N’invente jamais une cause et ne prétends jamais qu’une visite a causé une variation de PDM. Si une donnée manque, dis-le au lieu de répondre par une généralité présentée comme un fait.';
    const terrainMap=terrainRows();
    return {
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
      performanceV192:c.performanceV192||null,
      instructions:[c.instructions||'',privacyInstruction,storeInstruction].filter(Boolean).join(' '),
      stores:(c.stores||[]).slice(0,MAX_ONLINE_STORES).map(function(s){return richStore(s,terrainMap)}).filter(Boolean)
    };
  }

  window.storeRunnerLimitAssistantContext=limitContext;
  if(typeof window.storeRunnerRegisterAssistantContextTransform==='function')window.storeRunnerRegisterAssistantContextTransform(limitContext,100);
})();
