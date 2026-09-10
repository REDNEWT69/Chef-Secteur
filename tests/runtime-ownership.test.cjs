const fs=require('fs');
const path=require('path');

const root=process.cwd();
function walk(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','tests'].includes(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full,out);
    else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(full);
  }
  return out;
}

const files=walk(root);
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
      throw new Error(`Propriété globale: ${name} ne doit pas assigner ${label}`);
    }
  }
}

console.log(`Runtime ownership guards: OK · ${files.length} fichier(s) JS inspecté(s)`);
