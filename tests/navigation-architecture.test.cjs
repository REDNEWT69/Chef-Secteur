const fs=require('fs');
const path=require('path');
function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function must(file,label,re){if(!re.test(read(file)))throw new Error(`${file}: requis absent: ${label}`)}
function forbid(file,label,re){if(re.test(read(file)))throw new Error(`${file}: interdit: ${label}`)}

forbid('store-runner-branding.js','état de retour au planning',/returnToPlanning|departureNavInstalled/);
forbid('store-runner-branding.js','logique de sauvegarde profil',/saveProfile/);
must('store-runner-branding.js','chargement du contrôleur de navigation',/navigation-controller\.js/);

must('navigation-controller.js','origine planning',/#planPanel \.departureCard/);
must('navigation-controller.js','cible réglages départ',/#departureSettings/);
must('navigation-controller.js','détection sauvegarde profil',/saveProfile/);
must('navigation-controller.js','retour planning',/goTab\(['"]planPanel['"]\)/);
must('navigation-controller.js','validation des coordonnées sauvegardées',/savedProfileMatchesForm/);

must('sw.js','contrôleur de navigation disponible hors ligne',/["']\.\/navigation-controller\.js["']/);

console.log('Navigation architecture guards: OK');
