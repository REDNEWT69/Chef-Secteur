from pathlib import Path

p=Path('v182-fixes.js')
s=p.read_text()
old="const out=Object.fromEntries(DAYS.map(d=>[d,workDays.includes(d)?[]:clone((plan&&plan[d])||[])])),free=[],seen=new Set(),origin={};"
new="const out=Object.fromEntries(DAYS.map(d=>[d,workDays.includes(d)?[]:clone((plan&&plan[d])||[])])),free=[],seen=new Set(),origin={},fixedIds=new Set();"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('declaration V185 introuvable')
old="if(fixed){if(!workDays.includes(fixed))return{ok:false,plan,changed:false,reason:'fixed-outside'};out[fixed].push(store)}else free.push(store)"
new="if(fixed){if(!workDays.includes(fixed))return{ok:false,plan,changed:false,reason:'fixed-outside'};out[fixed].push(store);fixedIds.add(id)}else free.push(store)"
if old in s:
    s=s.replace(old,new,1)
elif new not in s:
    raise SystemExit('fixedIds V185 introuvable')
marker="""    if(!best)return{ok:false,plan,changed:false,reason:'unplaced',store};out[best.day]=best.trial
  }
  for(const day of workDays){out[day]=optimizeRouteV185(out[day]);if(routeCreditsV185(out[day])>max)return{ok:false,plan,changed:false,reason:'capacity-after'}}"""
replacement="""    if(!best)return{ok:false,plan,changed:false,reason:'unplaced',store};out[best.day]=best.trial
  }
  /* V220 : V185 optimise les kilomètres après le moteur escargot. Il n'a plus le droit
     de gagner quelques kilomètres en compactant 12 visites sur trois jours si le plan
     source couvrait déjà les cinq jours. On répare uniquement les jours que le moteur
     amont avait réellement couverts ; une journée volontairement vide (cible < nombre
     de jours) reste donc vide. Les visites fixes ne sont jamais déplacées. */
  const coverageDays=workDays.filter(day=>((plan&&plan[day])||[]).length>0&&!dayBlockedV185(iso(addDays(mon,DAYS.indexOf(day))))),coverageSet=new Set(coverageDays);
  for(const target of coverageDays){
    if((out[target]||[]).length)continue;
    let bestMove=null;
    for(const donor of workDays){
      const donorRoute=out[donor]||[],minimum=coverageSet.has(donor)?1:0;if(donorRoute.length<=minimum)continue;
      for(let i=0;i<donorRoute.length;i++){
        const store=donorRoute[i],id=String(store&&store.id||'');if(!id||fixedIds.has(id))continue;
        const donorTrial=optimizeRouteV185(donorRoute.filter((_,idx)=>idx!==i)),targetTrial=optimizeRouteV185((out[target]||[]).concat([store]));
        if(routeCreditsV185(targetTrial)>max||routeCreditsV185(donorTrial)>max)continue;
        if(!dayFitsV185(targetTrial,target,mon)||!dayFitsV185(donorTrial,donor,mon))continue;
        const beforeA=routeKmV185(donorRoute),beforeB=routeKmV185(out[target]||[]),afterA=routeKmV185(donorTrial),afterB=routeKmV185(targetTrial);
        const score=(Number.isFinite(afterA)?afterA:99999)+(Number.isFinite(afterB)?afterB:99999)-(Number.isFinite(beforeA)?beforeA:99999)-(Number.isFinite(beforeB)?beforeB:0),originMatch=origin[id]===target;
        if(!bestMove||(originMatch&&!bestMove.originMatch)||(originMatch===bestMove.originMatch&&(score<bestMove.score-0.001||(Math.abs(score-bestMove.score)<0.001&&DAYS.indexOf(donor)<DAYS.indexOf(bestMove.donor)))))bestMove={donor,donorTrial,targetTrial,score,originMatch};
      }
    }
    if(!bestMove)return{ok:false,plan,changed:false,reason:'coverage-unplaced',day:target};
    out[bestMove.donor]=bestMove.donorTrial;out[target]=bestMove.targetTrial;
  }
  for(const day of workDays){out[day]=optimizeRouteV185(out[day]);if(routeCreditsV185(out[day])>max)return{ok:false,plan,changed:false,reason:'capacity-after'}}"""
if replacement not in s:
    if marker not in s:
        raise SystemExit('point insertion couverture V185 introuvable')
    s=s.replace(marker,replacement,1)
p.write_text(s)

t=Path('tests/v182-field-fixes.test.cjs')
s=t.read_text()
anchor="""const oldPlan={
  Lundi:[{id:'old-mon'}],Mardi:[{id:'old-tue'}],Mercredi:[{id:'old-wed'}],Jeudi:[{id:'old-thu'}],Vendredi:[{id:'old-fri'}],Samedi:[{id:'old-sat'}]
};"""
test="""/* V220 : l'optimisation géographique ne doit plus recompacter une semaine équilibrée
   au point de recréer les jeudi/vendredi vides que l'escargot vient de corriger. */
state.settings.maxVisitsPerDay=4;ctx.storeVisitCredit=()=>1;
const coverageStores=Array.from({length:12},(_,i)=>({id:'cov-'+(i+1),x:100,enseigne:'Test',ville:'Zone'}));
const coverageInput={
  Lundi:coverageStores.slice(0,3),Mardi:coverageStores.slice(3,6),Mercredi:coverageStores.slice(6,8),
  Jeudi:coverageStores.slice(8,10),Vendredi:coverageStores.slice(10,12),Samedi:[]
};
geo=ctx.StoreRunnerGeographyV185.rebalance(coverageInput,{weekKey:'2026-09-14',preferNearFirst:true});
assert.equal(geo.ok,true,'V185 doit conserver une solution quand les cinq jours sont couvrables');
for(const day of workDays)assert.ok((geo.plan[day]||[]).length>0,'V185 ne doit pas vider '+day+' si ce jour était couvert en entrée');
const coverageIds=workDays.flatMap(day=>(geo.plan[day]||[]).map(s=>s.id));
assert.equal(coverageIds.length,12,'V185 doit conserver les 12 magasins');
assert.equal(new Set(coverageIds).size,12,'V185 ne doit créer aucun doublon pendant la réparation de couverture');
for(const day of workDays)assert.ok((geo.plan[day]||[]).length<=4,day+' doit rester sous la capacité après réparation');

"""+anchor
if 'coverageStores=Array.from({length:12}' not in s:
    if anchor not in s:
        raise SystemExit('point insertion test V185 introuvable')
    s=s.replace(anchor,test,1)
t.write_text(s)

Path('.github/workflows/v220-coverage-fix-once.yml').unlink(missing_ok=True)
Path('.github/v220_coverage_patch.py').unlink(missing_ok=True)
