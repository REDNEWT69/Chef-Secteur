const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('period-day-slider.js','utf8');
assert(src.includes("dataset.date"),'les onglets de période doivent porter leur date ISO');
assert(src.includes('syncPlanningHero'),'le slider doit resynchroniser le héros planning avec la vraie date active');
assert(src.includes("active.dataset.date"),'la date affichée doit venir du data-date actif, pas de l’index visuel');
assert(src.includes("planningHeroDay"),'le libellé principal du jour doit être mis à jour');
assert(src.includes("planningHeroFull"),'la date complète doit être mise à jour');
console.log('planning period date tests: OK');

const home=fs.readFileSync('home-refresh-v2.js','utf8');
const pro=fs.readFileSync('planning-pro-plus.js','utf8');
assert(src.includes('openDate:function(raw)'), 'le slider doit publier un chargeur de date unique');
assert(src.includes('allowOutsideRange:true'), 'une date ouverte depuis accueil/mois doit pouvoir charger une semaine hors de la période affichée');
assert(src.includes("planningHeroWeek"), 'le libellé de semaine doit suivre la vraie date active');
assert(src.includes("reason:'period-date-loaded'"), 'le chargement d’une date doit notifier les autres modules');
assert(home.includes("StoreRunnerPeriodDaySlider")&&home.includes("api.openDate"), 'Accueil doit charger réellement la semaine de la date demandée');
assert(pro.includes("StoreRunnerPeriodDaySlider")&&pro.includes("api.openDate"), 'Vue mensuelle doit charger réellement la semaine de la date demandée');
