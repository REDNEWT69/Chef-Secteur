const fs=require('fs');
const path=require('path');

function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function forbid(file,patterns){
  const src=read(file);
  for(const [label,re] of patterns){
    if(re.test(src))throw new Error(`${file}: interdit: ${label}`);
  }
}

const noPermanentLoop=[['boucle setInterval',/\bsetInterval\s*\(/]];
['stores-layout-order.js','auto-planning-fix.js','connection-ui.js'].forEach(file=>forbid(file,noPermanentLoop));

forbid('planning-ui-fixes.js',[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]
]);

forbid('manager-home-fixes.js',[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper syncGoogleCalendar',/window\.syncGoogleCalendar\s*=\s*async\s+function/]
]);

forbid('timeline-end-times.js',[
  ['wrapper renderAll',/window\.renderAll\s*=\s*function/],
  ['wrapper renderWeek',/window\.renderWeek\s*=\s*function/]
]);

console.log('Architecture guards: OK');
