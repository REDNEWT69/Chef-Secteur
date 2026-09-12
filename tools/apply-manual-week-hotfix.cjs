const fs=require('fs');

function replaceOnce(source,label,before,after){
  const first=source.indexOf(before);
  if(first<0)throw new Error(label+': bloc source introuvable');
  if(source.indexOf(before,first+before.length)>=0)throw new Error(label+': bloc source trouvé plusieurs fois');
  return source.slice(0,first)+after+source.slice(first+before.length);
}

const file='range-planner-v2.js';
let source=fs.readFileSync(file,'utf8');

// Le garde-fou durable transporte aussi le snapshot de la semaine : si l'archive
// disparaît ou perd son marqueur, la période peut encore conserver le vrai plan manuel.
source=replaceOnce(source,'snapshot manuel durable',
`  next.manualWeekEdits=next.manualWeekEdits||{};next.manualWeekEdits[weekKey]=new Date().toISOString();`,
`  next.manualWeekEdits=next.manualWeekEdits||{};next.manualWeekEdits[weekKey]={at:new Date().toISOString(),plan:Object.fromEntries(DAYS.map(d=>[d,((next.plan&&next.plan[d])||[]).map(cloneStore)]))};`);

source=replaceOnce(source,'période robuste sans archive',
`      const weekKey=iso(mon),archived=archive[weekKey],manualState=!!(state.manualWeekEdits&&state.manualWeekEdits[weekKey]);\n      if((archived&&archived.manualEdited)||manualState){\n        const weekSeen=new Set();\n        for(const d of DAYS)for(const s of ((archived.plan&&archived.plan[d])||[])){`,
`      const weekKey=iso(mon),archived=archive[weekKey],manualEntry=state.manualWeekEdits&&state.manualWeekEdits[weekKey],manualState=!!manualEntry;\n      if((archived&&archived.manualEdited)||manualState){\n        const protectedPlan=(archived&&archived.plan)||(manualEntry&&manualEntry.plan)||{};\n        if(!archive[weekKey])archive[weekKey]={weekMonday:weekKey,plan:Object.fromEntries(DAYS.map(d=>[d,((protectedPlan&&protectedPlan[d])||[]).map(cloneStore)])),manualEdited:true,manualEditedAt:(manualEntry&&manualEntry.at)||new Date().toISOString()};\n        const weekSeen=new Set();\n        for(const d of DAYS)for(const s of ((protectedPlan&&protectedPlan[d])||[])){`);

// « Poser » n'est pas une édition totale de semaine : il ne doit verrouiller que le magasin.
source=replaceOnce(source,'ne pas geler toute la semaine au pin',
`  if(wasPinned)unpinStore(id);else{pinStore(id,day);const key=iso(monday(parse((state.settings&&state.settings.weekDate)||'')||new Date()));state.manualWeekEdits=state.manualWeekEdits||{};state.manualWeekEdits[key]=new Date().toISOString()}\n  try{if(typeof save==='function')save()}catch(e){if(typeof showError==='function')showError('Enregistrement impossible : '+(e&&e.message?e.message:String(e)));return false}`,
`  if(wasPinned)unpinStore(id);else pinStore(id,day);\n  try{if(typeof save==='function')save()}catch(e){if(typeof showError==='function')showError('Enregistrement impossible : '+(e&&e.message?e.message:String(e)));return false}`);

fs.writeFileSync(file,source);

// Le test existant accepte le nouvel objet de garde-fou (il vérifie sa présence).
console.log('HOTFIX HARDENED: manual replacement snapshots survive archive loss; pin keeps store-only semantics.');
