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

// Après un remplacement manuel, la persistance émet un événement métier puis l'ancien
// flux tente encore de rouvrir la fiche magasin. Le contrôleur doit absorber uniquement
// cette prochaine ouverture automatique et laisser toutes les ouvertures suivantes normales.
must('navigation-controller.js','écoute des modifications manuelles du planning',/store-runner:planning-updated/);
must('navigation-controller.js','raison remplacement manuel',/day-store-recenter/);
must('navigation-controller.js','raison déplacement inter-jours',/store-moved-between-days/);
must('navigation-controller.js','garde ouverture fiche magasin',/installStoreQuickReturnGuard/);
must('navigation-controller.js','suppression unique de la prochaine fiche',/suppressNextQuickOpen=false/);
must('navigation-controller.js','retour planning sans remonter en haut',/activatePlanning\(\)/);
must('navigation-controller.js','fermeture fiche existante',/closeStoreQuick/);
forbid('navigation-controller.js','temporisation UX du retour planning',/setTimeout\s*\(/);

// Les réglages restent physiquement à leur place dans .applePlan. Le contrôleur de
// navigation transforme seulement ce même nœud en sheet fixe, ce qui évite les copies
// d'état et les réorganisations qui ferment les sélecteurs natifs sur iOS.
must('navigation-controller.js','identifiant du raccourci réglages',/SETTINGS_SHORTCUT_ID='planningSettingsShortcut'/);
must('navigation-controller.js','interception déléguée du raccourci',/closest\('#'\+SETTINGS_SHORTCUT_ID\)/);
must('navigation-controller.js','classe de sheet planning',/planningSettingsSheetOpen/);
must('navigation-controller.js','ouverture du vrai panneau',/settings\.open=true/);
must('navigation-controller.js','dialogue accessible',/aria-modal/);
must('navigation-controller.js','fermeture sans scroll',/closePlanningSettingsSheet/);
must('navigation-controller.js','fermeture par tap hors fiche',/e\.target===settings/);
must('navigation-controller.js','fermeture clavier',/e\.key==='Escape'/);
must('navigation-controller.js','glissement vers le bas',/y-dragStartY>70/);
must('navigation-controller.js','hauteur mobile bornée',/max-height:min\(82dvh,760px\)/);
must('navigation-controller.js','cible fermeture 44px',/width:44px;height:44px;min-width:44px/);
// V252.1 : le clic de recalcul doit d'abord libérer la sheet mobile pour que la
// confirmation ChefReliability reste visible et que la promesse puisse se terminer.
must('navigation-controller.js','interception du recalcul dans la sheet',/closest\('#recalculateRemainingWeekBtn'\)/);
must('navigation-controller.js','fermeture avant le recalcul',/if\(recalc\)\{\s*closePlanningSettingsSheet\(\);\s*return;/);
forbid('navigation-controller.js','ancien scroll vers les réglages',/scrollIntoView/);
forbid('navigation-controller.js','duplication du formulaire de réglages',/cloneNode/);

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
must('profile-controller.js','API publique de validation du départ',/window\.storeRunnerHasValidBase\s*=\s*validBase/);
must('planning-generation-controller.js','consommation de la validation du profil',/window\.storeRunnerHasValidBase\(\)/);
forbid('planning-generation-controller.js','duplication locale de validBase',/function\s+validBase\s*\(/);
forbid('planning-generation-controller.js','duplication des bornes latitude',/lat\s*>=\s*-90|lat\s*<=\s*90/);

must('sw.js','contrôleur de navigation disponible hors ligne',/["']\.\/navigation-controller\.js["']/);
must('sw.js','contrôleur profil disponible hors ligne',/["']\.\/profile-controller\.js["']/);

console.log('Navigation/profile architecture guards: OK');
