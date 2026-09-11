const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8')}
function fail(message){throw new Error(message)}

const visual=read('visual-refresh-v1.js');
const planning=read('planning-ui-fixes.js');
const range=read('range-planner-v2.js');

if(/iosDayHero/.test(visual))fail('visual-refresh-v1.js ne doit plus créer ni styliser le hero planning legacy iosDayHero');
if(/function\s+renderHero\b/.test(visual))fail('visual-refresh-v1.js ne doit plus rendre un hero planning concurrent');
if(/planningHeroV2/.test(visual))fail('visual-refresh-v1.js ne doit pas prendre possession du hero planning V2');
if(/new\s+MutationObserver/.test(visual))fail('visual-refresh-v1.js doit rester passif et ne plus observer le DOM du planning');
if(!/store-runner:calendar-updated/.test(visual))fail('visual-refresh-v1.js doit réagir au contrat calendar-updated plutôt qu’aux mutations du planning');
if(!/planningHeroV2/.test(planning))fail('planning-ui-fixes.js doit rester propriétaire du hero planning V2');

if(!/planningDaysDetails/.test(planning))fail('les jours travaillés doivent être regroupés dans un sélecteur compact');
if(!/planningBrandsDetails/.test(planning))fail('les enseignes doivent être regroupées dans un sélecteur compact');
if(!/planningAdvancedDetails/.test(planning))fail('les horaires et la stratégie doivent rester repliables');
if(!/planningCalendarDetails/.test(planning))fail('Google Agenda doit être repliable dans les réglages');
if(!/planningDuplicateGenerate/.test(planning))fail('le bouton de génération historique dans les réglages doit être masqué');
if(!/planningDynamicStoreCount/.test(planning))fail('le nombre de magasins affiché doit être dynamique');
if(/#planningSettings \.settingsInner\{display:block!important\}/.test(planning))fail('les réglages fermés ne doivent pas forcer leur contenu visible');
if(!/#planningSettings\[open\]>\.settingsInner\{display:block!important\}/.test(planning))fail('le contenu des réglages doit être affiché uniquement quand le détail est ouvert');
if(!/Générer ma semaine/.test(planning))fail('une action hebdomadaire principale doit rester visible');
if(!/Planifier plusieurs semaines/.test(range)||!/document\.createElement\('details'\)/.test(range))fail('la génération de période doit être une option repliable et secondaire');

console.log('Planning visual ownership guards: OK · réglages compacts et compteur dynamique');
