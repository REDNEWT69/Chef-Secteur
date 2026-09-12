const fs=require('fs');
const path=require('path');
const file=path.join(__dirname,'..','range-planner-v2.js');
let source=fs.readFileSync(file,'utf8');

function replaceOnce(label,before,after){
  const first=source.indexOf(before);
  if(first<0)throw new Error(label+': bloc source introuvable');
  if(source.indexOf(before,first+before.length)>=0)throw new Error(label+': bloc source trouvé plusieurs fois');
  source=source.slice(0,first)+after+source.slice(first+before.length);
}

replaceOnce('protection generation semaine',`  try{\n    ChefReliability.checkpoint('Avant génération de la semaine');\n    const days=readControls(),raw=parse((state.settings&&state.settings.weekDate)||iso(new Date())),mon=monday(raw||new Date());\n    showStatus('Synchronisation Google Agenda puis génération de la semaine…');`,
`  try{\n    const days=readControls(),raw=parse((state.settings&&state.settings.weekDate)||iso(new Date())),mon=monday(raw||new Date());\n    const archived=loadArchive()[iso(mon)];\n    if(archived&&archived.manualEdited){\n      const visits=countPlan(state.plan,DAYS),credits=DAYS.reduce((n,d)=>n+routeCredits((state.plan&&state.plan[d])||[]),0);\n      showStatus('Semaine modifiée manuellement : tes magasins sont conservés. La génération automatique n’a rien changé.');\n      return{ok:true,preservedManual:true,visits,credits};\n    }\n    ChefReliability.checkpoint('Avant génération de la semaine');\n    showStatus('Synchronisation Google Agenda puis génération de la semaine…');`);

replaceOnce('protection generation periode',`    while(mon<=last){\n      const usable=activeDays(mon,days,start,end);`,
`    while(mon<=last){\n      const weekKey=iso(mon),archived=archive[weekKey];\n      if(archived&&archived.manualEdited){\n        const weekSeen=new Set();\n        for(const d of DAYS)for(const s of ((archived.plan&&archived.plan[d])||[])){\n          const k=storeKey(s);if(!k||weekSeen.has(k))continue;weekSeen.add(k);unique.add(k);usedKeys.add(k);useCount.set(k,(useCount.get(k)||0)+1);lastUsedWeek.set(k,weekIndex);totalVisits++;totalCredits+=visitCredit(s);\n        }\n        mon=addDays(mon,7);weekIndex++;weeks++;await new Promise(r=>setTimeout(r,10));continue;\n      }\n      const usable=activeDays(mon,days,start,end);`);

replaceOnce('persistance semaine manuelle',`  bundle.state=next;\n  if(bundle.archive&&bundle.archive[weekKey]){\n    bundle.archive[weekKey].plan=bundle.archive[weekKey].plan||{};\n    bundle.archive[weekKey].plan[preview.day]=preview.route.map(cloneStore);\n    if(preview.sourceDay&&Array.isArray(preview.sourceRoute))bundle.archive[weekKey].plan[preview.sourceDay]=preview.sourceRoute.map(cloneStore);\n    refreshRangeStats(bundle);\n  }`,
`  bundle.state=next;\n  bundle.archive=bundle.archive||loadArchive()||{};\n  if(!bundle.archive[weekKey]){\n    const plan={};for(const d of DAYS)plan[d]=((next.plan&&next.plan[d])||[]).map(cloneStore);\n    bundle.archive[weekKey]={weekMonday:weekKey,plan};\n  }\n  bundle.archive[weekKey].plan=bundle.archive[weekKey].plan||{};\n  bundle.archive[weekKey].plan[preview.day]=preview.route.map(cloneStore);\n  if(preview.sourceDay&&Array.isArray(preview.sourceRoute))bundle.archive[weekKey].plan[preview.sourceDay]=preview.sourceRoute.map(cloneStore);\n  bundle.archive[weekKey].manualEdited=true;\n  bundle.archive[weekKey].manualEditedAt=new Date().toISOString();\n  refreshRangeStats(bundle);`);

fs.writeFileSync(file,source);
console.log('PATCH APPLIED: manual week protection against automatic regeneration.');
