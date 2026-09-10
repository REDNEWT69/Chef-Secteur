const fs=require('fs');
const path=require('path');

const root=process.cwd();
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const runtimeFiles=[...new Set([...index.matchAll(/['"](\.\/[A-Za-z0-9_./-]+\.js)['"]/g)].map(m=>m[1].slice(2)))];
const files=runtimeFiles.map(name=>path.join(root,name)).filter(file=>fs.existsSync(file));
const rel=file=>path.relative(root,file).replace(/\\/g,'/');

const rules=[
  ['generateWeek',/window\.generateWeek\s*=(?!=)/,['planning-generation-controller.js']],
  ['syncGoogleCalendar',/window\.syncGoogleCalendar\s*=(?!=)/,['calendar-oauth.js']],
  ['saveProfile',/window\.saveProfile\s*=(?!=)/,['profile-controller.js']],
  ['useCurrentLocation',/window\.useCurrentLocation\s*=(?!=)/,['profile-controller.js']],
  ['baseObj',/window\.baseObj\s*=(?!=)/,['profile-controller.js']],
  ['havBase',/window\.havBase\s*=(?!=)/,['profile-controller.js']],
  ['renderAll',/window\.renderAll\s*=(?!=)/,[]],
  ['renderWeek',/window\.renderWeek\s*=(?!=)/,[]],
  ['renderHistory',/window\.renderHistory\s*=(?!=)/,[]],
  ['switchTab',/window\.switchTab\s*=(?!=)/,[]],
  // Dette transitoire connue : ces deux hooks restent dans assistant-upgrade.js
  // jusqu'à leur intégration directe dans le propriétaire historique.
  ['sectorContext',/window\.sectorContext\s*=(?!=)/,['assistant-upgrade.js']],
  ['assistantHandle',/window\.assistantHandle\s*=(?!=)/,['assistant-upgrade.js']],
  ['setAssistantMode',/window\.setAssistantMode\s*=(?!=)/,[]]
];

for(const file of files){
  const name=rel(file),src=fs.readFileSync(file,'utf8');
  for(const [label,re,allowed] of rules){
    if(re.test(src)&&!allowed.includes(name)){
      throw new Error(`Propriété globale runtime: ${name} ne doit pas assigner ${label}`);
    }
  }
}

if(!runtimeFiles.includes('planning-generation-controller.js'))throw new Error('Runtime: contrôleur de génération absent du chargeur principal');
if(!runtimeFiles.includes('calendar-oauth.js'))throw new Error('Runtime: propriétaire Agenda absent du chargeur principal');
if(!runtimeFiles.includes('profile-controller.js'))throw new Error('Runtime: propriétaire profil absent du chargeur principal');

console.log(`Runtime ownership guards: OK · ${files.length} module(s) chargé(s) inspecté(s)`);
