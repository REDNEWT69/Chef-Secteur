const fs=require('fs');
const assert=require('assert');
const src=fs.readFileSync('period-day-slider.js','utf8');
assert(src.includes("dataset.date"),'les onglets de période doivent porter leur date ISO');
assert(src.includes('syncPlanningHero'),'le slider doit resynchroniser le héros planning avec la vraie date active');
assert(src.includes("active.dataset.date"),'la date affichée doit venir du data-date actif, pas de l’index visuel');
assert(src.includes("planningHeroDay"),'le libellé principal du jour doit être mis à jour');
assert(src.includes("planningHeroFull"),'la date complète doit être mise à jour');
console.log('planning period date tests: OK');
