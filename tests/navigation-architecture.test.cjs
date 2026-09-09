const fs=require('fs');
const path=require('path');
function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function must(file,label,re){if(!re.test(read(file)))throw new Error(`${file}: requis absent: ${label}`)}
function forbid(file,label,re){if(re.test(read(file)))throw new Error(`${file}: interdit: ${label}`)}

forbid('store-runner-branding.js','état de retour au planning',/returnToPlanning|departureNavInstalled/);
forbid('store-runner-branding.js','logique de sauvegarde profil',/saveProfile/);
must('store-runner-branding.js','chargement du contrôleur de navigation',/navigation-controller\.js/);
must('store-runner-branding.js','chargement du contrôleur profil',/profile-controller\.js/);

must('navigation-controller.js','origine planning',/#planPanel \.departureCard/);
must('navigation-controller.js','cible réglages départ',/#departureSettings/);
must('navigation-controller.js','détection sauvegarde profil',/saveProfile/);
must('navigation-controller.js','retour planning',/goTab\(['"]planPanel['"]\)/);
must('navigation-controller.js','validation des coordonnées sauvegardées',/savedProfileMatchesForm/);

forbid('planning-ui-fixes.js','sauvegarde du profil dans le module planning',/window\.saveProfile\s*=/);
forbid('planning-ui-fixes.js','géolocalisation dans le module planning',/window\.useCurrentLocation\s*=/);
forbid('planning-ui-fixes.js','override de la base dans le module planning',/window\.baseObj\s*=/);
must('profile-controller.js','propriétaire sauvegarde profil',/window\.saveProfile\s*=/);
must('profile-controller.js','propriétaire géolocalisation',/window\.useCurrentLocation\s*=/);
must('profile-controller.js','position GPS non mise en cache',/maximumAge\s*:\s*0/);
must('profile-controller.js','seuil de précision GPS',/accuracy>250/);

must('sw.js','contrôleur de navigation disponible hors ligne',/["']\.\/navigation-controller\.js["']/);
must('sw.js','contrôleur profil disponible hors ligne',/["']\.\/profile-controller\.js["']/);

console.log('Navigation/profile architecture guards: OK');
