const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

const assistant=read('assistant-upgrade.js');
const contextLimit=read('ai-context-limit.js');
const storeLookup=read('assistant-store-lookup.js');
const sheetDrag=read('assistant-sheet-drag.js');

if(/window\.setAssistantMode\s*=/.test(assistant))throw new Error('Assistant: setAssistantMode ne doit pas être réécrit par assistant-upgrade.js');
if(/__assistantModeWrapped/.test(assistant))throw new Error('Assistant: ancien wrapper de mode encore présent');
if(!/store-runner:assistant-mode-changed/.test(assistant))throw new Error('Assistant: écoute de l’événement assistant-mode-changed absente');
if(!/installStatusEvents/.test(assistant))throw new Error('Assistant: gestion événementielle du statut absente');
if(!/storeRunnerRegisterAssistantResolver/.test(assistant)||!/runAssistantResolvers/.test(assistant))throw new Error('Assistant: registre de résolveurs absent');
if(!/storeRunnerRegisterAssistantContextTransform/.test(assistant)||!/applyAssistantContextTransforms/.test(assistant))throw new Error('Assistant: registre de transformations de contexte absent');
if(!/window\.storeRunnerRunAssistantResolvers\s*=/.test(assistant))throw new Error('Assistant: exécuteur public de résolveurs absent');
if(!/window\.storeRunnerApplyAssistantContextTransforms\s*=/.test(assistant))throw new Error('Assistant: exécuteur public de transformations absent');
if(/setTimeout\s*\(\s*install/.test(assistant))throw new Error('Assistant: réinstallation différée répétée interdite');
if(/window\.addEventListener\(['"]focus['"],\s*updateAssistantStatus/.test(assistant))throw new Error('Assistant: le statut ne doit plus être rafraîchi globalement à chaque focus');
if(/visibilitychange/.test(assistant))throw new Error('Assistant: le statut ne doit plus être rafraîchi globalement au retour de visibilité');
if(!/PLAN_ARCHIVE_KEY='chef_sector_plan_archive_v1'/.test(assistant)||!/dayRefFromText/.test(assistant))throw new Error('Assistant: résolution temporelle et archive de planning absentes');

if(/window\.sectorContext\s*=/.test(contextLimit))throw new Error('Assistant: ai-context-limit.js ne doit plus wrapper sectorContext');
if(!/window\.storeRunnerLimitAssistantContext\s*=/.test(contextLimit))throw new Error('Assistant: limiteur de contexte public absent');
if(!/storeRunnerRegisterAssistantContextTransform/.test(contextLimit))throw new Error('Assistant: ai-context-limit.js doit enregistrer son transformateur');

for(const [label,re] of [
  ['assistantSend',/window\.assistantSend\s*=/],
  ['renderAll',/window\.renderAll\s*=/],
  ['generateWeek',/window\.generateWeek\s*=/]
])if(re.test(storeLookup))throw new Error(`Assistant magasins: wrapper ${label} interdit`);
if(!/window\.chefSecteurStoreScheduleAnswer\s*=/.test(storeLookup))throw new Error('Assistant magasins: résolveur public absent');
if(!/storeRunnerRegisterAssistantResolver/.test(storeLookup))throw new Error('Assistant magasins: résolveur non enregistré');
if(!/store-runner:planning-updated/.test(storeLookup))throw new Error('Assistant magasins: écoute planning-updated absente');
if(!/store-runner:data-restored/.test(storeLookup))throw new Error('Assistant magasins: écoute data-restored absente');
if(!/MutationObserver/.test(storeLookup)||!/observedPlanHost/.test(storeLookup))throw new Error('Assistant magasins: observation du planning absente');
if(!/__chefStorage/.test(storeLookup))throw new Error('Assistant magasins: archive doit utiliser le stockage robuste de l’application');
if(/localStorage\.getItem\(ARCHIVE_KEY\)|localStorage\.setItem\(ARCHIVE_KEY/.test(storeLookup))throw new Error('Assistant magasins: archive ne doit pas dépendre directement de localStorage');
if(/addEventListener\(['"]load['"],[\s\S]{0,160}(?:observePlanning|scheduleSnapshot|refreshPlanningArchive)/.test(storeLookup))throw new Error('Assistant magasins: initialisation redondante au load interdite');
if(/window\.addEventListener\(['"]focus['"],[\s\S]{0,160}(?:observePlanning|scheduleSnapshot|refreshPlanningArchive)/.test(storeLookup))throw new Error('Assistant magasins: rafraîchissement global au focus interdit');
if(/visibilitychange/.test(storeLookup))throw new Error('Assistant magasins: rafraîchissement global au retour de visibilité interdit');

if(!/MutationObserver/.test(sheetDrag))throw new Error('Assistant mobile: observation de l’état du panneau absente');
if(/\[100,250,600,1200,2400\]/.test(sheetDrag)||/setTimeout\s*\(\s*install/.test(sheetDrag))throw new Error('Assistant mobile: réinstallation différée répétée interdite');
if(/addEventListener\(['"]focus['"],\s*install/.test(sheetDrag))throw new Error('Assistant mobile: install ne doit pas être relancé à chaque focus');

// « Aujourd’hui » et « demain » doivent viser la vraie date, même si une autre semaine est affichée.
class FixedDate extends Date{
  constructor(...args){super(...(args.length?args:['2026-09-11T10:00:00+02:00']))}
  static now(){return new Date('2026-09-11T08:00:00Z').getTime()}
}
const archivedPlan={
  '2026-09-07':{weekMonday:'2026-09-07',plan:{Samedi:[{id:'archive',enseigne:'Darty',ville:'Bron'}]}}
};
const temporalState={
  settings:{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']},
  plan:{Samedi:[{id:'displayed',enseigne:'Boulanger',ville:'Grenoble'}]},
  calendarEvents:[{date:'2026-09-12',title:'Formation terrain'}]
};
const ctx={
  state:temporalState,
  Date:FixedDate,
  console,
  setTimeout,
  localStorage:{getItem:key=>key==='chef_sector_plan_archive_v1'?JSON.stringify(archivedPlan):null},
  document:{readyState:'loading',addEventListener(){},getElementById(){return null}}
};
ctx.window=ctx;
vm.runInNewContext(assistant,ctx);
const tomorrow=ctx.chefSecteurSmartLocalAnswer('planning demain');
assert.match(tomorrow,/Samedi 2026-09-12\./,'demain doit conserver la vraie date et non le samedi de la semaine affichée');
assert.match(tomorrow,/Darty Bron/,'demain doit lire la tournée de la vraie semaine dans l’archive');
assert.match(tomorrow,/Formation terrain/,'demain doit lire l’Agenda de la vraie date');
assert.doesNotMatch(tomorrow,/Boulanger Grenoble/,'demain ne doit pas reprendre la tournée de la semaine affichée');
const namedDay=ctx.chefSecteurSmartLocalAnswer('planning samedi');
assert.match(namedDay,/Samedi 2026-09-19\./,'un jour nommé explicitement doit rester lié à la semaine affichée');
assert.match(namedDay,/Boulanger Grenoble/,'un jour nommé explicitement doit continuer à utiliser le planning affiché');

console.log('Assistant architecture guards: OK · relative dates use the real calendar date and store archive refresh stays event-driven');
