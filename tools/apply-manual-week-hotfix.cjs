const fs=require('fs');

function replaceOnce(source,label,before,after){
  const first=source.indexOf(before);
  if(first<0)throw new Error(label+': bloc source introuvable');
  if(source.indexOf(before,first+before.length)>=0)throw new Error(label+': bloc source trouvé plusieurs fois');
  return source.slice(0,first)+after+source.slice(first+before.length);
}

// 1) Force réellement le rechargement de la PWA après le hotfix.
for(const file of ['index.html','sw.js']){
  let s=fs.readFileSync(file,'utf8');
  if(!s.includes('20260913-interday143'))throw new Error(file+': révision source inattendue');
  s=s.replaceAll('20260913-interday143','20260913-manualweek146');
  fs.writeFileSync(file,s);
}

// 2) Double garde-fou : archive + état durable de la semaine manuelle.
const file='range-planner-v2.js';
let source=fs.readFileSync(file,'utf8');
source=replaceOnce(source,'garde génération semaine',
`    const archived=loadArchive()[iso(mon)];\n    if(archived&&archived.manualEdited){`,
`    const weekKey=iso(mon),archived=loadArchive()[weekKey],manualState=!!(state.manualWeekEdits&&state.manualWeekEdits[weekKey]);\n    if((archived&&archived.manualEdited)||manualState){`);

source=replaceOnce(source,'garde génération période',
`      const weekKey=iso(mon),archived=archive[weekKey];\n      if(archived&&archived.manualEdited){`,
`      const weekKey=iso(mon),archived=archive[weekKey],manualState=!!(state.manualWeekEdits&&state.manualWeekEdits[weekKey]);\n      if((archived&&archived.manualEdited)||manualState){`);

source=replaceOnce(source,'miroir état remplacement manuel',
`  if(preview.sourceDay&&Array.isArray(preview.sourceRoute))next.plan[preview.sourceDay]=preview.sourceRoute.map(s=>(state.stores||[]).find(x=>String(x.id)===String(s.id))||s);\n  /* Le magasin choisi à la main est posé sur sa nouvelle journée.`,
`  if(preview.sourceDay&&Array.isArray(preview.sourceRoute))next.plan[preview.sourceDay]=preview.sourceRoute.map(s=>(state.stores||[]).find(x=>String(x.id)===String(s.id))||s);\n  next.manualWeekEdits=next.manualWeekEdits||{};next.manualWeekEdits[weekKey]=new Date().toISOString();\n  /* Le magasin choisi à la main est posé sur sa nouvelle journée.`);

source=replaceOnce(source,'miroir état pose manuelle',
`  if(wasPinned)unpinStore(id);else pinStore(id,day);\n  try{if(typeof save==='function')save()}catch(e){if(typeof showError==='function')showError('Enregistrement impossible : '+(e&&e.message?e.message:String(e)));return false}`,
`  if(wasPinned)unpinStore(id);else{pinStore(id,day);const key=iso(monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()));state.manualWeekEdits=state.manualWeekEdits||{};state.manualWeekEdits[key]=new Date().toISOString()}\n  try{if(typeof save==='function')save()}catch(e){if(typeof showError==='function')showError('Enregistrement impossible : '+(e&&e.message?e.message:String(e)));return false}`);

fs.writeFileSync(file,source);

// 3) Renforcer le test : le miroir d'état doit protéger même si l'archive n'a pas le marqueur.
const testFile='tests/planning-manual-week-protection.test.cjs';
let test=fs.readFileSync(testFile,'utf8');
test=replaceOnce(test,'assert miroir état',
`  assert.equal(saved.archive['2026-09-07'].manualEdited,true,'la modification manuelle doit poser le marqueur de protection de semaine');\n  assert.equal(saved.archive['2026-09-07'].plan.Lundi[0].id,'b','l’archive protégée doit contenir la journée réellement modifiée');`,
`  assert.equal(saved.archive['2026-09-07'].manualEdited,true,'la modification manuelle doit poser le marqueur de protection de semaine');\n  assert.equal(saved.state.manualWeekEdits['2026-09-07']?true:false,true,'la modification manuelle doit aussi poser le garde-fou durable dans l’état');\n  assert.equal(saved.archive['2026-09-07'].plan.Lundi[0].id,'b','l’archive protégée doit contenir la journée réellement modifiée');`);

test=replaceOnce(test,'test garde état sans archive',
`  const protectedPlan=emptyPlan();protectedPlan.Lundi=[store('protected')];`,
`  // Même si l'archive a perdu son marqueur, le garde-fou durable de l'état suffit.\n  t=env();t.state.manualWeekEdits={'2026-09-07':'2026-09-07T12:00:00.000Z'};\n  const stateBefore=JSON.stringify(t.state.plan);\n  const stateGuard=await t.ctx.testManualWeek.strictSingleWeek();\n  assert.equal(JSON.stringify(t.state.plan),stateBefore,'le garde-fou d’état doit conserver la semaine');\n  assert.equal(t.proposals.length,0,'le garde-fou d’état doit bloquer toute proposition automatique');\n  assert.equal(stateGuard&&stateGuard.preservedManual,true,'le moteur doit signaler la conservation manuelle via le garde-fou d’état');\n\n  const protectedPlan=emptyPlan();protectedPlan.Lundi=[store('protected')];`);
fs.writeFileSync(testFile,test);

console.log('HOTFIX APPLIED: build revision bumped and manual weeks protected by archive + durable state guard.');
