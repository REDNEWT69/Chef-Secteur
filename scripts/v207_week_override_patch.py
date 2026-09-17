from pathlib import Path

engine=Path('auto-planning-fix.js')
s=engine.read_text()
old="function selectedWeekMonday(){const d=parse(window.state&&state.settings&&state.settings.weekDate)||new Date();return monday(d)}\nfunction futureOvernightAnalysis(plan){\n  const profile=(window.state&&state.profile)||{},mode=profile.overnightMode||'auto',threshold=overnightThreshold();if(mode==='never')return{mode,threshold,candidate:null,reason:'disabled',best:null,bestRemote:null};\n  const days=(state.settings&&Array.isArray(state.settings.days)&&state.settings.days.length?state.settings.days:DAYS.slice(0,5)).filter(d=>DAYS.includes(d)),source=plan||state.plan||{},mon=selectedWeekMonday(),today=iso(new Date());let best=null,bestRemote=null,bestUseful=null;"
new="function selectedWeekMonday(weekDate){const d=parse(weekDate)||parse(window.state&&state.settings&&state.settings.weekDate)||new Date();return monday(d)}\nfunction futureOvernightAnalysis(plan,weekDate){\n  const profile=(window.state&&state.profile)||{},mode=profile.overnightMode||'auto',threshold=overnightThreshold();if(mode==='never')return{mode,threshold,candidate:null,reason:'disabled',best:null,bestRemote:null};\n  const days=(state.settings&&Array.isArray(state.settings.days)&&state.settings.days.length?state.settings.days:DAYS.slice(0,5)).filter(d=>DAYS.includes(d)),source=plan||state.plan||{},mon=selectedWeekMonday(weekDate),today=iso(new Date());let best=null,bestRemote=null,bestUseful=null;"
assert old in s,'futureOvernightAnalysis anchor missing'
engine.write_text(s.replace(old,new,1))

slider=Path('period-day-slider.js')
p=slider.read_text()
old2="""  function analyzeArchivedWeek(plan,weekDate){
    const api=window.StoreRunnerStoreControlsV189;
    if(!api||typeof api.futureOvernightAnalysis!=='function'||!window.state)return null;
    const original=window.state,clone=Object.assign({},original,{settings:Object.assign({},original.settings||{},{weekDate:String(weekDate||'').slice(0,10)}),plan:plan||{}});
    try{window.state=clone;const analysis=api.futureOvernightAnalysis(plan||{});return analysis&&analysis.candidate||null}catch(e){return null}finally{window.state=original}
  }
"""
new2="""  function analyzeArchivedWeek(plan,weekDate){
    const api=window.StoreRunnerStoreControlsV189;
    if(!api||typeof api.futureOvernightAnalysis!=='function')return null;
    try{const analysis=api.futureOvernightAnalysis(plan||{},String(weekDate||'').slice(0,10));return analysis&&analysis.candidate||null}catch(e){return null}
  }
"""
assert old2 in p,'analyzeArchivedWeek anchor missing'
slider.write_text(p.replace(old2,new2,1))
