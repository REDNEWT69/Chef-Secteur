from pathlib import Path
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'{label}: motif introuvable')
    return text.replace(old, new, 1)


# ---------------- Pilotage secteur : priorité officielle + PDM du fichier
p = Path('sector-pilotage.js')
text = p.read_text()
old = "function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}\nfunction storeSupportsFamily"
new = """function monthKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
const OFFICIAL_PRIORITY_LABELS={P1:'P1',P2:'P2',watch:'À surveiller',nodata:'Pas de data'};
function officialPriorityRank(v){return v==='P1'?0:v==='P2'?1:v==='watch'?2:v==='nodata'?3:4}
function officialPriorityLabel(v){return OFFICIAL_PRIORITY_LABELS[v]||''}
function performanceMap(rows){const out=new Map();for(const r of (rows||[]))if(r&&r.storeId!=null)out.set(String(r.storeId),r);return out}
function storeSupportsFamily"""
text = replace_once(text, old, new, 'pilotage helpers')

old = "let rows=stores.map(s=>rowBase(state,s,family,now));const pdms="
new = """let rows=stores.map(s=>rowBase(state,s,family,now));const perf=performanceMap(options.performanceRows);for(const r of rows){const p=perf.get(String(r.store.id))||null;r.performance=p;r.officialPriority=p&&p.prio||null;r.officialPdm=p&&p.pdmYtd!=null&&Number.isFinite(Number(p.pdmYtd))?Number(p.pdmYtd):null;r.visitPdm=r.pdm;r.pdmSource=r.officialPdm!=null?'performance':(r.pdm!=null?'visit':'none');if(r.officialPdm!=null)r.pdm=r.officialPdm}const pdms="""
text = replace_once(text, old, new, 'pilotage performance join')
text = replace_once(text, "rows.sort((a,b)=>b.priority-a.priority||", "rows.sort((a,b)=>officialPriorityRank(a.officialPriority)-officialPriorityRank(b.officialPriority)||b.priority-a.priority||", 'pilotage sort')
text = replace_once(text, "rows.forEach(r=>levels[r.level]++);const pdmRows=", "rows.forEach(r=>levels[r.level]++);const officialCounts={P1:0,P2:0,watch:0,nodata:0,none:0};rows.forEach(r=>{const k=r.officialPriority;if(k&&Object.prototype.hasOwnProperty.call(officialCounts,k))officialCounts[k]++;else officialCounts.none++});const pdmRows=", 'pilotage counts')
text = replace_once(text, "return{family,brand,rows,total:rows.length,recent,", "return{family,brand,performanceWeek:text(options.performanceWeek||''),officialCounts,rows,total:rows.length,recent,", 'pilotage return')

css_old = ".spBadge{font-size:11px;font-weight:800;padding:7px 10px;border-radius:999px;background:#eef4ff;color:#275fc4}.spFilters"
css_new = ".spBadge{font-size:11px;font-weight:800;padding:7px 10px;border-radius:999px;background:#eef4ff;color:#275fc4}.spOfficial{display:inline-flex;align-items:center;margin-left:6px;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:900;vertical-align:middle}.spOfficial.p1{background:#fdecea;color:#a3261c;border:1px solid #f3c3bd}.spOfficial.p2{background:#fff5e6;color:#8a5200;border:1px solid #f6ddb4}.spOfficial.watch{background:#eef2ff;color:#334155;border:1px solid #d7ddf5}.spOfficial.nodata{background:#eef0f4;color:#4a5260;border:1px solid #d9dee6}.spOfficialSummary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-3px 0 13px;padding:9px 11px;border:1px solid #e5e9f1;border-radius:14px;background:#fafbfe;font-size:10.5px;color:#5f6672}.spOfficialSummary b{color:#1d2939}.spStoreTitle{display:flex;align-items:center;gap:3px;min-width:0}.spFilters"
text = replace_once(text, css_old, css_new, 'pilotage css')

runtime = """function runtimeDb(win){try{return win.__chefStorage||win.localStorage||null}catch(e){return null}}
function performanceSnapshot(win,state){try{const P=win.StoreRunnerPerformanceV190,db=runtimeDb(win);if(!P||typeof P.latestSnapshot!=='function'||typeof P.matchRows!=='function'||typeof P.readStore!=='function')return{week:'',rows:[]};const snap=P.latestSnapshot(db);if(!snap)return{week:'',rows:[]};const data=P.readStore(db),matched=P.matchRows(snap.rows,(state&&state.stores)||[],data.mapping||{}).rows;return{week:snap.week||'',rows:matched}}catch(e){return{week:'',rows:[]}}}
function officialBadgeHtml(prio){const label=officialPriorityLabel(prio);if(!label)return'';const cls=prio==='P1'?'p1':prio==='P2'?'p2':prio==='watch'?'watch':'nodata';return '<span class=\"spOfficial '+cls+'\">'+esc(label)+'</span>'}
"""
text = replace_once(text, "function brands(state){", runtime + "function brands(state){", 'pilotage runtime bridge')
old = "function render(win){const doc=win.document,panel=doc.getElementById('pilotagePanel');if(!panel)return;const data=compute(win.state||{},{family:filter.family,brand:filter.brand}),brandOptions="
new = "function render(win){const doc=win.document,panel=doc.getElementById('pilotagePanel');if(!panel)return;const state=win.state||{},perf=performanceSnapshot(win,state),data=compute(state,{family:filter.family,brand:filter.brand,performanceRows:perf.rows,performanceWeek:perf.week}),brandOptions="
text = replace_once(text, old, new, 'pilotage render data')
text = replace_once(text, " const priorities=top.length?", " const officialSummary=data.performanceWeek?`<div class=\"spOfficialSummary\"><b>Priorités fichier ${esc(data.performanceWeek)}</b><span>${data.officialCounts.P1} P1</span><span>${data.officialCounts.P2} P2</span><span>${data.officialCounts.watch} à surveiller</span><span>${data.officialCounts.nodata} sans data</span></div>`:'<div class=\"spOfficialSummary\"><b>Priorités fichier</b><span>Aucun fichier performance importé</span></div>';\n const priorities=top.length?", 'pilotage official summary')
old = "`<div class=\"spPriorityRow\"><div class=\"spStore\"><b>${esc(r.store.enseigne)} ${esc(r.store.ville)}</b><small>${esc((r.reasons[0]||levelLabel(r.level)))}</small></div><div class=\"spTrack\"><div class=\"spFill ${r.level}\" style=\"width:${Math.max(5,r.priority)}%\"></div></div><div class=\"spScore\">${r.priority}</div></div>`"
new = "`<div class=\"spPriorityRow\"><div class=\"spStore\"><div class=\"spStoreTitle\"><b>${esc(r.store.enseigne)} ${esc(r.store.ville)}</b>${officialBadgeHtml(r.officialPriority)}</div><small>${esc((r.reasons[0]||levelLabel(r.level)))}</small></div><div class=\"spTrack\"><div class=\"spFill ${r.level}\" style=\"width:${Math.max(5,r.priority)}%\"></div></div><div class=\"spScore\">${r.priority}</div></div>`"
text = replace_once(text, old, new, 'pilotage priority rows')
old = "<div class=\"spStoreText\"><b>${esc(r.store.enseigne)} ${esc(r.store.ville)}</b><small>${r.lastVisit?'Dernière visite '+esc(r.lastVisit):'Pas encore qualifié'} · ${esc(levelLabel(r.level))}</small></div>"
new = "<div class=\"spStoreText\"><div class=\"spStoreTitle\"><b>${esc(r.store.enseigne)} ${esc(r.store.ville)}</b>${officialBadgeHtml(r.officialPriority)}</div><small>${r.lastVisit?'Dernière visite '+esc(r.lastVisit):'Pas encore qualifié'} · ${esc(levelLabel(r.level))}</small></div>"
text = replace_once(text, old, new, 'pilotage table badge')
text = replace_once(text, "</select></div>\n <div class=\"spKpis\">", "</select></div>${officialSummary}\n <div class=\"spKpis\">", 'pilotage summary placement')
oldnote = "L’indice d’action sert à prioriser, pas à noter le magasin. Il combine retard de visite, points terrain, actions ouvertes et données PDM / représentation / 6P quand elles existent. Le gris signifie « à qualifier » et une donnée absente reste « — » : Store Runner n’invente aucun chiffre."
newnote = "La pastille P1/P2 vient du dernier fichier performance importé. L’indice d’action terrain reste distinct : il combine retard de visite, points terrain, actions ouvertes, PDM, représentation et 6P. Quand le fichier fournit une PDM YTD, elle devient la PDM de référence dans cette vue ; sinon la dernière PDM terrain reste utilisée. Une donnée absente reste « — » : Store Runner n’invente aucun chiffre."
text = replace_once(text, oldnote, newnote, 'pilotage note')
text = replace_once(text, "return{compute,parsePercent,storeSupportsFamily,levelLabel,install,open,render};", "return{compute,parsePercent,storeSupportsFamily,levelLabel,officialPriorityRank,officialPriorityLabel,performanceMap,install,open,render};", 'pilotage exports')
p.write_text(text)


# ---------------- Génération escargot : P1/P2 + répartition jours + diagnostics
p = Path('terrain-planning-v1.js')
text = p.read_text()
helpers = """function rankStoresForSnail(stores,distanceFn,priorityFn){
  const dist=distanceFn||distanceOf,prio=typeof priorityFn==='function'?priorityFn:(()=>0);
  return (stores||[]).slice().sort((a,b)=>{
    const pa=Number(prio(a)),pb=Number(prio(b)),aa=Number.isFinite(pa)?pa:0,bb=Number.isFinite(pb)?pb:0;
    if(bb!==aa)return bb-aa;
    const da=Number(dist(a)),dbv=Number(dist(b)),ad=Number.isFinite(da)?da:Infinity,bd=Number.isFinite(dbv)?dbv:Infinity;
    return ad-bd||String(a.enseigne||'').localeCompare(String(b.enseigne||''))||String(a.ville||'').localeCompare(String(b.ville||''));
  })
}
function dayQuotas(days,target){const out={},rows=(days||[]).slice(),goal=Math.max(0,Math.floor(Number(target)||0));if(!rows.length)return out;const base=Math.floor(goal/rows.length),extra=goal%rows.length;rows.forEach((d,i)=>out[d]=base+(i<extra?1:0));return out}
function routeCreditCost(route,credit){return(route||[]).reduce((n,s)=>n+Math.max(1,Number(credit(s))||1),0)}
function orderedPlacementDays(activeDays,plan,quotas,credit){
  const order=new Map((activeDays||[]).map((d,i)=>[d,i]));
  return(activeDays||[]).slice().sort((a,b)=>{
    const an=(plan[a]||[]).length<(quotas[a]||0),bn=(plan[b]||[]).length<(quotas[b]||0);
    if(an!==bn)return an?-1:1;
    if(an&&bn)return order.get(a)-order.get(b);
    const ac=routeCreditCost(plan[a],credit),bc=routeCreditCost(plan[b],credit);
    return ac-bc||(plan[a]||[]).length-(plan[b]||[]).length||order.get(a)-order.get(b)
  })
}
function weekDistributionDiagnostics(options){
  const mon=options.mon,days=options.days||[],activeDays=options.activeDays||[],plan=options.plan||emptyPlan(),target=Math.max(1,Number(options.target)||1),max=Math.max(1,Number(options.max)||1),ranked=options.ranked||[],used=options.used||new Set(),weekPlaced=options.weekPlaced||new Set(),credit=options.credit||(()=>1),fits=options.fits||(()=>true),manual=!!options.manual,total=flattenPlan(plan,activeDays).length;
  return days.map(day=>{
    const date=iso(addDays(mon,DAYS.indexOf(day))),route=plan[day]||[];
    if(manual)return{day,date,status:route.length?'manual-planned':'manual-empty',count:route.length,credits:routeCreditCost(route,credit),reason:'Semaine protégée manuellement'};
    if(!activeDays.includes(day))return{day,date,status:'blocked',count:0,credits:0,reason:'Jour bloqué ou indisponible dans l’agenda'};
    if(route.length)return{day,date,status:'planned',count:route.length,credits:routeCreditCost(route,credit),reason:''};
    let reason='Vivier éligible épuisé';
    if(total>=target)reason=target<activeDays.length?'Objectif hebdomadaire inférieur au nombre de jours travaillés':'Objectif hebdomadaire atteint par les autres jours ou des contraintes fixes';
    else{
      const remaining=ranked.filter(s=>!used.has(storeKey(s))&&!weekPlaced.has(storeKey(s)));
      if(remaining.length){let eligible=false,capacityReject=0,fitReject=0;for(const s of remaining){const c=Math.max(1,Number(credit(s))||1);if(c>max){capacityReject++;continue}if(!fits([s],day,mon)){fitReject++;continue}eligible=true;break}if(eligible)reason='Anomalie de répartition : un magasin éligible restait disponible';else if(capacityReject===remaining.length)reason='Capacité journalière insuffisante pour les magasins restants';else if(capacityReject+fitReject===remaining.length)reason='Horaires ou capacité empêchent les magasins restants';else reason='Aucun magasin restant compatible avec cette journée'}
    }
    return{day,date,status:'empty',count:0,credits:0,reason}
  })
}
"""
text = replace_once(text, "function nearestFrom(start,stores,distanceBetween){", helpers + "function nearestFrom(start,stores,distanceBetween){", 'snail helpers')
old = "const state=options.state,first=monday(options.firstMonday),days=(options.days||[]).filter(d=>DAYS.includes(d)),target=Math.max(1,Number(options.target)||20),max=Math.max(1,Number(options.maxCreditsPerDay)||4),archive=options.archive||{},distance=options.distanceOf||(()=>Infinity),credit=options.creditOf||(()=>1),lockFor=options.lockDayForWeek||(()=>''),apptFor=options.appointmentDay||(()=>''),fits=options.dayFits||(()=>true),blocked=options.dayBlocked||(()=>false),imposed=state&&state.included||{};"
new = "const state=options.state,first=monday(options.firstMonday),days=(options.days||[]).filter(d=>DAYS.includes(d)),target=Math.max(1,Number(options.target)||20),max=Math.max(1,Number(options.maxCreditsPerDay)||4),archive=options.archive||{},distance=options.distanceOf||(()=>Infinity),priority=options.priorityOf||(()=>0),credit=options.creditOf||(()=>1),lockFor=options.lockDayForWeek||(()=>''),apptFor=options.appointmentDay||(()=>''),fits=options.dayFits||(()=>true),blocked=options.dayBlocked||(()=>false),imposed=state&&state.included||{};"
text = replace_once(text, old, new, 'snail options')
text = replace_once(text, "const ranked=rankStoresByDistance((options.stores||[]).filter(Boolean),distance),used=new Set()", "const ranked=rankStoresForSnail((options.stores||[]).filter(Boolean),distance,priority),used=new Set()", 'snail ranking')
old = "if(protectedPlan){for(const s of flattenPlan(protectedPlan))used.add(storeKey(s));weeks.push({weekKey,plan:protectedPlan,manual:true,unplaced:[]});continue}"
new = "if(protectedPlan){for(const s of flattenPlan(protectedPlan))used.add(storeKey(s));const diagnostics=weekDistributionDiagnostics({mon,days,activeDays:days,plan:protectedPlan,target,max,ranked,used,weekPlaced:new Set(flattenPlan(protectedPlan).map(storeKey)),credit,fits,manual:true});weeks.push({weekKey,plan:protectedPlan,manual:true,unplaced:[],diagnostics});continue}"
text = replace_once(text, old, new, 'snail manual diagnostics')
text = replace_once(text, "const plan=emptyPlan(),activeDays=days.filter(day=>!blocked(iso(addDays(mon,DAYS.indexOf(day))))),weekPlaced=new Set(),unplaced=[];\n    if(!activeDays.length){weeks.push({weekKey,plan,manual:false,unplaced});continue}", "const plan=emptyPlan(),activeDays=days.filter(day=>!blocked(iso(addDays(mon,DAYS.indexOf(day))))),weekPlaced=new Set(),unplaced=[],quotas=dayQuotas(activeDays,target);\n    if(!activeDays.length){const diagnostics=weekDistributionDiagnostics({mon,days,activeDays,plan,target,max,ranked,used,weekPlaced,credit,fits});weeks.push({weekKey,plan,manual:false,unplaced,diagnostics});continue}", 'snail quotas')
text = replace_once(text, "const candidateDays=item.day?[item.day]:activeDays;", "const candidateDays=item.day?[item.day]:orderedPlacementDays(activeDays,plan,quotas,credit);", 'snail forced balance')
text = replace_once(text, "for(const day of activeDays){\n        const trial=plan[day].concat([s]),cost=trial.reduce((n,x)=>n+Math.max(1,Number(credit(x))||1),0);", "for(const day of orderedPlacementDays(activeDays,plan,quotas,credit)){\n        const trial=plan[day].concat([s]),cost=trial.reduce((n,x)=>n+Math.max(1,Number(credit(x))||1),0);", 'snail normal balance')
text = replace_once(text, "weeks.push({weekKey,plan,manual:false,unplaced});\n  }\n  return{weeks,uniqueStores:new Set(weeks.flatMap(w=>flattenPlan(w.plan).map(storeKey))).size,totalVisits:weeks.reduce((n,w)=>n+flattenPlan(w.plan).length,0),unknownGps:unknownGps.size};", "const diagnostics=weekDistributionDiagnostics({mon,days,activeDays,plan,target,max,ranked,used,weekPlaced,credit,fits});weeks.push({weekKey,plan,manual:false,unplaced,diagnostics});\n  }\n  const dayRows=weeks.flatMap(w=>(w.diagnostics||[]).filter(d=>d.status==='planned'||d.status==='empty')),emptyWorkDays=dayRows.filter(d=>d.status==='empty');\n  return{weeks,uniqueStores:new Set(weeks.flatMap(w=>flattenPlan(w.plan).map(storeKey))).size,totalVisits:weeks.reduce((n,w)=>n+flattenPlan(w.plan).length,0),unknownGps:unknownGps.size,dayCoverage:{planned:dayRows.filter(d=>d.status==='planned').length,active:dayRows.length,empty:emptyWorkDays.length},emptyWorkDays};", 'snail diagnostics return')

perf_bridge = """function performancePlanningBoost(store,state=root.state){try{const P=root.StoreRunnerPerformanceV190,storage=db();if(P&&typeof P.planningBoost==='function')return Math.max(0,Number(P.planningBoost(storage,store&&store.id,(state&&state.stores)||[]))||0)}catch(e){}return 0}
"""
text = replace_once(text, "function currentDays(state=root.state){", perf_bridge + "function currentDays(state=root.state){", 'snail performance bridge')
text = replace_once(text, "archive,distanceOf,creditOf:visitCredit,lockDayForWeek:lockDay", "archive,distanceOf,priorityOf:(store)=>performancePlanningBoost(store,state),creditOf:visitCredit,lockDayForWeek:lockDay", 'snail performance use')
text = replace_once(text, "bundle.range={start:firstWeek.weekKey,end:iso(addDays(first,20)),weeks:3,workDays:days,uniqueStores:built.uniqueStores,totalVisits:built.totalVisits,rotation:'snail-distance-v1',calendarSynced,poolReport:report,overnightReport,hoursReport,updatedAt:new Date().toISOString()};", "bundle.range={start:firstWeek.weekKey,end:iso(addDays(first,20)),weeks:3,workDays:days,uniqueStores:built.uniqueStores,totalVisits:built.totalVisits,rotation:'snail-distance-v1',calendarSynced,poolReport:report,overnightReport,hoursReport,planningDiagnostics:built.weeks.map(w=>({weekKey:w.weekKey,days:w.diagnostics||[]})),dayCoverage:built.dayCoverage,updatedAt:new Date().toISOString()};", 'snail persist diagnostics')
text = replace_once(text, "const rows=range&&Array.isArray(range.overnightReport)?range.overnightReport:[],hours=range&&range.hoursReport;\n  if(!rows.length&&!hours)", "const rows=range&&Array.isArray(range.overnightReport)?range.overnightReport:[],hours=range&&range.hoursReport,distribution=range&&Array.isArray(range.planningDiagnostics)?range.planningDiagnostics:[];\n  if(!rows.length&&!hours&&!distribution.length)", 'snail insights diagnostics source')
marker = "  box.innerHTML=html;box.hidden=false;return true;\n}"
addition = """  if(distribution.length){
    html+='<div style="margin-top:9px;padding-top:9px;border-top:1px solid #eef1f5"><b style="color:#344054">📅 Répartition</b>';
    for(const week of distribution){const active=(week.days||[]).filter(d=>d.status==='planned'||d.status==='empty'),covered=active.filter(d=>d.status==='planned').length,empty=active.filter(d=>d.status==='empty'),parts=String(week.weekKey||'').split('-'),label=parts.length===3?parts[2]+'/'+parts[1]:week.weekKey;html+='<div style="margin-top:6px"><b>Semaine du '+label+'</b> · '+covered+'/'+active.length+' jours travaillés couverts'+(empty.length?' · '+empty.map(d=>d.day+' vide : '+d.reason).join(' ; '):'')+'</div>'}
    html+='</div>';
  }
  box.innerHTML=html;box.hidden=false;return true;
}"""
text = replace_once(text, marker, addition, 'snail insights render')
oldstatus = "if(status)status.textContent='3 semaines escargot : '+built.totalVisits+' visites · '+built.uniqueStores+' magasins distincts · vivier '+report.planifiable+' planifiables'+(report.imposed?' · '+report.imposed+' imposé'+(report.imposed>1?'s':''):'')+(report.withoutGps?' · '+report.withoutGps+' GPS à vérifier':'')+(hoursReport.unknown?' · '+hoursReport.unknown+' horaires à vérifier':'')+'.';"
newstatus = "if(status)status.textContent='3 semaines escargot : '+built.totalVisits+' visites · '+built.uniqueStores+' magasins distincts · '+built.dayCoverage.planned+'/'+built.dayCoverage.active+' jours travaillés couverts'+(built.emptyWorkDays.length?' · '+built.emptyWorkDays.length+' jour'+(built.emptyWorkDays.length>1?'s':'')+' vide'+(built.emptyWorkDays.length>1?'s':'')+' expliqué'+(built.emptyWorkDays.length>1?'s':''):'')+' · vivier '+report.planifiable+' planifiables'+(report.imposed?' · '+report.imposed+' imposé'+(report.imposed>1?'s':''):'')+(report.withoutGps?' · '+report.withoutGps+' GPS à vérifier':'')+(hoursReport.unknown?' · '+hoursReport.unknown+' horaires à vérifier':'')+'.';"
text = replace_once(text, oldstatus, newstatus, 'snail status')
text = replace_once(text, "const api={rankStoresByDistance,reorderDayFromStore,summarizeTerrainPool,buildThreeWeekSnail,resolveSnailStart,dayFits,overnightForPlan,analyzeOvernightWeeks,summarizeOpeningHours,generateThreeWeekSnail,startDayWithStore,install};", "const api={rankStoresByDistance,rankStoresForSnail,dayQuotas,orderedPlacementDays,weekDistributionDiagnostics,performancePlanningBoost,reorderDayFromStore,summarizeTerrainPool,buildThreeWeekSnail,resolveSnailStart,dayFits,overnightForPlan,analyzeOvernightWeeks,summarizeOpeningHours,generateThreeWeekSnail,startDayWithStore,install};", 'snail exports')
p.write_text(text)


# ---------------- Tests Node
p = Path('tests/sector-pilotage.test.cjs')
text = p.read_text()
extra = """
const performanceRows=[
  {storeId:'b',prio:'P1',pdmYtd:22},
  {storeId:'a',prio:'P2',pdmYtd:44},
  {storeId:'c',prio:'watch',pdmYtd:null}
];
const unified=Pilotage.compute(state,{now:new Date('2026-09-15T12:00:00Z'),performanceRows,performanceWeek:'W37'});
assert.strictEqual(unified.performanceWeek,'W37');
assert.deepStrictEqual(unified.officialCounts,{P1:1,P2:1,watch:1,nodata:0,none:0});
assert.strictEqual(unified.rows.find(r=>r.store.id==='b').officialPriority,'P1');
assert.strictEqual(unified.rows.find(r=>r.store.id==='b').pdm,22,'la PDM YTD du fichier devient la référence quand elle existe');
assert.strictEqual(unified.rows.find(r=>r.store.id==='b').pdmSource,'performance');
assert.strictEqual(unified.rows.find(r=>r.store.id==='c').pdm,null,'le fichier ne transforme pas une PDM vide en zéro');
assert.strictEqual(unified.rows[0].store.id,'b','P1 doit remonter avant le score terrain sans modifier ce score');
"""
text = replace_once(text, "\nconsole.log('sector-pilotage: OK');", extra + "\nconsole.log('sector-pilotage: OK');", 'sector test')
p.write_text(text)

p = Path('tests/terrain-planning-v1.test.cjs')
text = p.read_text()
extra = """
(function balancedTargetCoversTheWholeWorkWeek(){
  const stores=Array.from({length:40},(_,i)=>store(i+1));
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:12,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true});
  const first=built.weeks[0],lengths=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'].map(d=>first.plan[d].length);
  assert.deepStrictEqual(lengths,[3,3,2,2,2],'12 visites doivent être réparties sur les 5 jours au lieu de remplir seulement le début de semaine');
  assert.strictEqual(first.diagnostics.filter(d=>d.status==='empty').length,0);
  assert.deepStrictEqual(flat(first).map(s=>s.id),Array.from({length:12},(_,i)=>'s'+(i+1)),'la progression proche → loin reste stable');
})();

(function performancePriorityWinsInsideTheRadialPool(){
  const stores=Array.from({length:20},(_,i)=>store(i+1));
  const boost=s=>s.id==='s10'?60:s.id==='s9'?25:0;
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:5,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:boost,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true});
  assert.deepStrictEqual(flat(built.weeks[0]).map(s=>s.id),['s10','s9','s1','s2','s3'],'P1 puis P2 doivent passer avant la distance, la distance départage ensuite');
})();

(function blockedDayIsExplainedNotSilentlyEmpty(){
  const stores=Array.from({length:30},(_,i)=>store(i+1));
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:8,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:d=>d==='2026-09-17',dayFits:()=>true});
  const diag=built.weeks[0].diagnostics.find(d=>d.day==='Jeudi');
  assert.strictEqual(diag.status,'blocked');
  assert.match(diag.reason,/bloqué|indisponible/i);
  for(const day of ['Lundi','Mardi','Mercredi','Vendredi'])assert.ok(built.weeks[0].plan[day].length>0,day+' doit être alimenté');
})();

(function targetBelowWorkDaysExplainsTheNecessaryGap(){
  const stores=Array.from({length:20},(_,i)=>store(i+1));
  const built=terrain.buildThreeWeekSnail({state:{manualWeekEdits:{}},firstMonday:monday(),days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],target:4,maxCreditsPerDay:4,stores,archive:{},distanceOf:s=>s.distance,priorityOf:()=>0,creditOf:()=>1,lockDayForWeek:()=>'',appointmentDay:()=>'',dayBlocked:()=>false,dayFits:()=>true});
  assert.strictEqual(built.emptyWorkDays.length,3,'un jour par semaine reste nécessairement vide quand la cible est 4 pour 5 jours');
  assert.ok(built.emptyWorkDays.every(d=>/objectif hebdomadaire inférieur/i.test(d.reason)));
})();
"""
text = replace_once(text, "\nconsole.log('terrain-planning-v1: OK');", extra + "\nconsole.log('terrain-planning-v1: OK');", 'terrain node tests')
p.write_text(text)


# ---------------- Tests navigateur Pilotage
p = Path('tests/sector-pilotage-browser.spec.cjs')
text = p.read_text()
text = replace_once(text, "await page.waitForFunction(()=>window.StoreRunnerSectorPilotage&&document.getElementById('premiumHomeV2')&&document.getElementById('moreSheetV2'));", "await page.waitForFunction(()=>window.StoreRunnerSectorPilotage&&window.StoreRunnerPerformanceV190&&window.state&&document.getElementById('premiumHomeV2')&&document.getElementById('moreSheetV2'));", 'pilotage browser wait')
setup = """
  await page.evaluate(()=>{
    const st=window.state,P=window.StoreRunnerPerformanceV190,db=window.__chefStorage||localStorage;
    st.stores=[{id:'pilot-v220',enseigne:'Boulanger',ville:'Alpha',adresse:'1 rue Test',active:true,products:['Brun','Blanc'],intervalDays:30}];
    st.visits={};st.businessV2=Object.assign({},st.businessV2||{},{visits:[],actions:[]});
    const key=P.sourceKey('Boulanger','Alpha');
    P.writeStore(db,{version:2,imports:[{week:'W37',targetPdm:42.5,targetSource:'explicite',importedAt:'2026-09-18T12:00:00Z',rows:[{key,retailer:'Boulanger',site:'Alpha',prio:'P1',pdmYtd:21,evolYtd:-4,deltaYtd:-21.5,weeks:{},deltaWeeks:{},sellOutWeeks:{},sellOutYtd:null,sellOutWeek:null,comment:'Priorité fichier',storeId:null}]}],mapping:{[key]:'pilot-v220'},treated:{}});
    try{if(typeof save==='function')save()}catch(e){}
  });
"""
text = replace_once(text, "  await page.waitForTimeout(300);\n", "  await page.waitForTimeout(300);\n" + setup, 'pilotage browser setup')
text = replace_once(text, "  await expect(panel.locator('#spBrandFilter')).toBeVisible();", "  await expect(panel.locator('#spBrandFilter')).toBeVisible();\n  await expect(panel.locator('.spOfficialSummary')).toContainText('W37');\n  await expect(panel.locator('.spOfficialSummary')).toContainText('1 P1');\n  await expect(panel.locator('.spOfficial.p1')).toHaveCount(2);\n  await expect(panel).toContainText('21%');", 'pilotage browser assertions')
p.write_text(text)


# ---------------- Test navigateur escargot : cible 12 / 5 jours
p = Path('tests/terrain-planning-browser.spec.cjs')
text = p.read_text()
text = replace_once(text, "target:20,maxVisitsPerDay:4", "target:12,maxVisitsPerDay:4", 'terrain browser target')
text = replace_once(text, "return {keys:keys.filter(k=>a[k]),weeks:keys.map(flatten),firstPlan:(window.state.plan.Lundi||[]).map(s=>s.id),poolReport:range.poolReport||null,overnightReport:range.overnightReport||null,hoursReport:range.hoursReport||null,rangeStart:range.start,rangeEnd:range.end};", "const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];const counts=k=>Object.fromEntries(days.map(d=>[d,(a[k]?.plan?.[d]||[]).length]));return {keys:keys.filter(k=>a[k]),weeks:keys.map(flatten),dayCounts:keys.map(counts),planningDiagnostics:range.planningDiagnostics||[],dayCoverage:range.dayCoverage||null,firstPlan:(window.state.plan.Lundi||[]).map(s=>s.id),poolReport:range.poolReport||null,overnightReport:range.overnightReport||null,hoursReport:range.hoursReport||null,rangeStart:range.start,rangeEnd:range.end};", 'terrain browser return')
text = replace_once(text, "  expect(all).toHaveLength(60);\n  expect(new Set(all).size).toBe(60);\n  const expectedWeek=(from,to)=>new Set(Array.from({length:to-from+1},(_,i)=>'snail-'+String(from+i).padStart(2,'0')));\n  expect(new Set(generated.weeks[0])).toEqual(expectedWeek(1,20));\n  expect(new Set(generated.weeks[1])).toEqual(expectedWeek(21,40));\n  expect(new Set(generated.weeks[2])).toEqual(expectedWeek(41,60));", "  expect(all).toHaveLength(36);\n  expect(new Set(all).size).toBe(36);\n  expect(generated.dayCoverage).toMatchObject({planned:15,active:15,empty:0});\n  for(const counts of generated.dayCounts)expect(Object.values(counts)).toEqual([3,3,2,2,2]);\n  expect(generated.planningDiagnostics).toHaveLength(3);\n  const expectedWeek=(from,to)=>new Set(Array.from({length:to-from+1},(_,i)=>'snail-'+String(from+i).padStart(2,'0')));\n  expect(new Set(generated.weeks[0])).toEqual(expectedWeek(1,12));\n  expect(new Set(generated.weeks[1])).toEqual(expectedWeek(13,24));\n  expect(new Set(generated.weeks[2])).toEqual(expectedWeek(25,36));", 'terrain browser counts')
text = text.replace("Ville 21", "Ville 13").replace("Ville 41", "Ville 25")
text = replace_once(text, "  await expect(insights).toContainText('Horaires');", "  await expect(insights).toContainText('Horaires');\n  await expect(insights).toContainText('Répartition');\n  await expect(insights).toContainText('5/5 jours travaillés couverts');", 'terrain browser insights')
p.write_text(text)


# ---------------- Bump atomique V220 partout où l'ancien build est figé
old_build = '20260918-planningsummary219'
new_build = '20260918-pilotagesnail220'
for f in Path('.').rglob('*'):
    if not f.is_file() or '.git' in f.parts or f.as_posix() in {'.github/workflows/v220-apply-once.yml', 'tools/v220_patch.py'}:
        continue
    try:
        raw = f.read_text()
    except Exception:
        continue
    if old_build in raw:
        f.write_text(raw.replace(old_build, new_build))
vp = Path('version.json')
version = json.loads(vp.read_text())
version['latestBuild'] = new_build
version['displayVersion'] = '220'
version['releasedAt'] = '2026-09-18'
vp.write_text(json.dumps(version, ensure_ascii=False, indent=2) + '\n')
