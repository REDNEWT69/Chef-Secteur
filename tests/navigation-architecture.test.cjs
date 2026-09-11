const fs=require('fs');
const path=require('path');
function read(file){return fs.readFileSync(path.join(process.cwd(),file),'utf8')}
function must(file,label,re){if(!re.test(read(file)))throw new Error(`${file}: requis absent: ${label}`)}
function forbid(file,label,re){if(re.test(read(file)))throw new Error(`${file}: interdit: ${label}`)}

forbid('store-runner-branding.js','état de retour au planning',/returnToPlanning|departureNavInstalled/);
forbid('store-runner-branding.js','logique de sauvegarde profil',/saveProfile/);
forbid('store-runner-branding.js','chargement de contrôleurs',/navigation-controller\.js|profile-controller\.js|createElement\(['"]script['"]\)/);
must('index.html','chargement du contrôleur de navigation',/'\.\/navigation-controller\.js'/);
must('index.html','chargement du contrôleur profil',/'\.\/profile-controller\.js'/);

must('navigation-controller.js','origine planning',/#planPanel \.departureCard/);
must('navigation-controller.js','retour planning',/goTab\(['"]planPanel['"]\)/);
must('navigation-controller.js','écoute sauvegarde profil',/store-runner:profile-saved/);
forbid('navigation-controller.js','attente temporelle de sauvegarde',/setTimeout\s*\(/);
forbid('navigation-controller.js','couplage direct à saveProfile',/saveProfile/);
forbid('navigation-controller.js','revalidation DOM des coordonnées',/savedProfileMatchesForm/);

forbid('planning-ui-fixes.js','sauvegarde du profil dans le module planning',/window\.saveProfile\s*=/);
forbid('planning-ui-fixes.js','géolocalisation dans le module planning',/window\.useCurrentLocation\s*=/);
forbid('planning-ui-fixes.js','override de la base dans le module planning',/window\.baseObj\s*=/);
must('profile-controller.js','propriétaire sauvegarde profil',/window\.saveProfile\s*=/);
must('profile-controller.js','propriétaire géolocalisation',/window\.useCurrentLocation\s*=/);
must('profile-controller.js','événement de sauvegarde profil',/store-runner:profile-saved/);
must('profile-controller.js','position GPS non mise en cache',/maximumAge\s*:\s*0/);
must('profile-controller.js','seuil de précision GPS',/accuracy>250/);
must('profile-controller.js','géocodage manuel du départ',/async function forwardGeocode\(query\)/);
must('profile-controller.js','bouton de recherche manuelle',/departureLookupBtn/);
must('profile-controller.js','sauvegarde capable de géocoder sans GPS',/await geocodeDepartureInputs\(\)/);

must('sw.js','contrôleur de navigation disponible hors ligne',/["']\.\/navigation-controller\.js["']/);
must('sw.js','contrôleur profil disponible hors ligne',/["']\.\/profile-controller\.js["']/);

console.log('Navigation/profile architecture guards: OK');
