const fs=require('fs');
const path=require('path');

const root=process.cwd();
if(!fs.existsSync(path.join(root,'PLAN_METIER_STORE_RUNNER.md')))throw new Error('Métier V2: PLAN_METIER_STORE_RUNNER.md doit rester versionné');

function walk(dir,out=[]){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','tests'].includes(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())walk(full,out);
    else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(full);
  }
  return out;
}

const candidates=walk(root).filter(file=>/(?:^|[-_.])(visit|visits|action|actions|business|business-v2|6p|six-p)(?:[-_.]|$)/i.test(path.basename(file)));
const forbidden=[
  ['generateWeek',/window\.generateWeek\s*=/],
  ['syncGoogleCalendar',/window\.syncGoogleCalendar\s*=/],
  ['saveProfile',/window\.saveProfile\s*=/],
  ['useCurrentLocation',/window\.useCurrentLocation\s*=/],
  ['baseObj',/window\.baseObj\s*=/],
  ['havBase',/window\.havBase\s*=/],
  ['renderAll',/window\.renderAll\s*=/],
  ['renderWeek',/window\.renderWeek\s*=/],
  ['renderHistory',/window\.renderHistory\s*=/],
  ['switchTab',/window\.switchTab\s*=/],
  ['assistantHandle',/window\.assistantHandle\s*=/],
  ['sectorContext',/window\.sectorContext\s*=/],
  ['surveillance setInterval',/\bsetInterval\s*\(/]
];

for(const file of candidates){
  const rel=path.relative(root,file).replace(/\\/g,'/');
  const src=fs.readFileSync(file,'utf8');
  for(const [label,re] of forbidden){
    if(re.test(src))throw new Error(`Métier V2: ${rel} ne doit pas prendre possession de ${label}`);
  }
}

console.log(`Business V2 architecture guards: OK · ${candidates.length} module(s) surveillé(s)`);
