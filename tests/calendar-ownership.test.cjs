const fs=require('fs');
const path=require('path');
function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function must(file,label,re){if(!re.test(read(file)))throw new Error(`${file}: requis absent: ${label}`)}
function forbid(file,label,re){if(re.test(read(file)))throw new Error(`${file}: interdit: ${label}`)}

const calendar=read('calendar-oauth.js');
const auto=read('auto-planning-fix.js');
const generation=read('planning-generation-controller.js');
const syncAssignment=/window\.syncGoogleCalendar\s*=(?!=)/g;

if((calendar.match(syncAssignment)||[]).length!==1)throw new Error('calendar-oauth.js: un seul propriétaire syncGoogleCalendar est attendu');
must('calendar-oauth.js','propriétaire unique de la synchro',/__storeRunnerCalendarSyncOwner/);
must('calendar-oauth.js','reconnexion silencieuse sans OAuth interactif',/async function silentReconnect\(\)\{return tokenValid\(\)\}/);
forbid('calendar-oauth.js','OAuth interactif depuis le wrapper silencieux',/window\.connectGoogleCalendar\s*\(/);
must('calendar-oauth.js','fallback agenda conservé',/fallbackStatus/);
must('calendar-oauth.js','installation des blocs sémantiques après synchro',/installSemanticCalendarBlocks/);
must('calendar-oauth.js','aucun réseau pendant une génération de planning',/silent&&window\.__storeRunnerPlanningGenerationActive/);

forbid('planning-generation-controller.js','appel de préparation Agenda pendant generateWeek',/await\s+window\.chefSecteurPrepareCalendarForPlanning\s*\(/);
forbid('planning-generation-controller.js','synchro Agenda déclenchée pendant generateWeek',/window\.syncGoogleCalendar\s*\(/);
forbid('planning-generation-controller.js','OAuth Google déclenché pendant generateWeek',/window\.connectGoogleCalendar\s*\(/);
must('planning-generation-controller.js','génération locale documentée',/génération du planning doit rester purement locale/i);
must('planning-generation-controller.js','marqueur de génération locale',/__storeRunnerPlanningGenerationActive/);
must('planning-generation-controller.js','événement planning après génération',/store-runner:planning-updated/);
must('planning-generation-controller.js','préflight partagé du point de départ',/function hasValidBase\(\)[\s\S]*window\.storeRunnerHasValidBase\(\)/);
must('planning-generation-controller.js','blocage avant génération si départ invalide',/if\(!hasValidBase\(\)\)/);
forbid('planning-generation-controller.js','duplication locale de validBase',/function validBase\(\)/);
must('planning-generation-controller.js','retour visible près du bouton principal',/planningGenerateStatus/);
must('planning-generation-controller.js','message départ manuel',/Francheville/);

forbid('auto-planning-fix.js','wrapper syncGoogleCalendar',/window\.syncGoogleCalendar\s*=(?!=)/);
forbid('auto-planning-fix.js','ancien propriétaire synchro Google',/__chefGooglePlanningFix/);
forbid('auto-planning-fix.js','gestion de token Google',/GOOGLE_TOKEN_KEY|chef_secteur_google_token_v2/);
must('auto-planning-fix.js','responsabilité limitée à Reliability',/R\.propose/);

console.log('Calendar ownership guards: OK');
