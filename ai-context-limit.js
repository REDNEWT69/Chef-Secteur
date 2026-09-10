(function(){
  'use strict';

  function slimStore(s){
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

  function slimEvent(e){
    if(!e||typeof e!=='object')return null;
    return {
      date:e.date||null,
      start:e.start||e.startDateTime||null,
      end:e.end||e.endDateTime||null,
      title:e.title||e.summary||'',
      location:e.location||''
    };
  }

  function slimPlan(plan){
    const out={};
    if(!plan||typeof plan!=='object')return out;
    Object.keys(plan).forEach(function(day){
      out[day]=(plan[day]||[]).slice(0,8).map(slimStore).filter(Boolean);
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

  function limitContext(c){
    c=c||{};
    return {
      today:c.today||null,
      profile:slimProfile(c.profile),
      settings:slimSettings(c.settings),
      plan:slimPlan(c.plan),
      calendarEvents:(c.calendarEvents||[]).slice(0,24).map(slimEvent).filter(Boolean),
      calendarLastSync:c.calendarLastSync||null,
      awayRanges:(c.awayRanges||[]).slice(0,12),
      daySummaries:c.daySummaries||{},
      overnight:c.overnight||null,
      instructions:c.instructions||'',
      stores:(c.stores||[]).slice(0,20).map(slimStore).filter(Boolean)
    };
  }

  window.storeRunnerLimitAssistantContext=limitContext;
})();
