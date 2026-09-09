const fs=require('fs');
const path=require('path');
function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function must(file,label,re){if(!re.test(read(file)))throw new Error(`${file}: requis absent: ${label}`)}
function forbid(file,label,re){if(re.test(read(file)))throw new Error(`${file}: interdit: ${label}`)}

const calendar=read('calendar-oauth.js');
const auto=read('auto-planning-fix.js');
const syncAssignment=/window\.syncGoogleCalendar\s*=(?!=)/g;

if((calendar.match(syncAssignment)||[]).length!==1)throw new Error('calendar-oauth.js: un seul propriétaire syncGoogleCalendar est attendu');
must('calendar-oauth.js','propriétaire unique de la synchro',/__storeRunnerCalendarSyncOwner/);
must('calendar-oauth.js','reconnexion silencieuse',/silentReconnect/);
must('calendar-oauth.js','fallback agenda conservé',/fallbackStatus/);
must('calendar-oauth.js','installation des blocs sémantiques après synchro',/installSemanticCalendarBlocks/);
must('calendar-oauth.js','pré-synchronisation avant génération',/await window\.syncGoogleCalendar\(true\)/);

forbid('auto-planning-fix.js','wrapper syncGoogleCalendar',/window\.syncGoogleCalendar\s*=(?!=)/);
forbid('auto-planning-fix.js','ancien propriétaire synchro Google',/__chefGooglePlanningFix/);
forbid('auto-planning-fix.js','gestion de token Google',/GOOGLE_TOKEN_KEY|chef_secteur_google_token_v2/);
must('auto-planning-fix.js','responsabilité limitée à Reliability',/R\.propose/);

console.log('Calendar ownership guards: OK');
