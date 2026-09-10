const fs=require('fs');
const path=require('path');
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
if(!/MutationObserver/.test(storeLookup)||!/observedPlanHost/.test(storeLookup))throw new Error('Assistant magasins: observation du planning absente');
if(!/__chefStorage/.test(storeLookup))throw new Error('Assistant magasins: archive doit utiliser le stockage robuste de l’application');
if(/localStorage\.getItem\(ARCHIVE_KEY\)|localStorage\.setItem\(ARCHIVE_KEY/.test(storeLookup))throw new Error('Assistant magasins: archive ne doit pas dépendre directement de localStorage');
if(/addEventListener\(['"]load['"],[\s\S]{0,160}(?:observePlanning|scheduleSnapshot)/.test(storeLookup))throw new Error('Assistant magasins: initialisation redondante au load interdite');

if(!/MutationObserver/.test(sheetDrag))throw new Error('Assistant mobile: observation de l’état du panneau absente');
if(/\[100,250,600,1200,2400\]/.test(sheetDrag)||/setTimeout\s*\(\s*install/.test(sheetDrag))throw new Error('Assistant mobile: réinstallation différée répétée interdite');
if(/addEventListener\(['"]focus['"],\s*install/.test(sheetDrag))throw new Error('Assistant mobile: install ne doit pas être relancé à chaque focus');

console.log('Assistant architecture guards: OK');
