const fs=require('fs');
const path=require('path');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

const assistant=read('assistant-upgrade.js');
const contextLimit=read('ai-context-limit.js');
const storeLookup=read('assistant-store-lookup.js');

if(/window\.setAssistantMode\s*=/.test(assistant))throw new Error('Assistant: setAssistantMode ne doit pas être réécrit par assistant-upgrade.js');
if(/__assistantModeWrapped/.test(assistant))throw new Error('Assistant: ancien wrapper de mode encore présent');
if(!/store-runner:assistant-mode-changed/.test(assistant))throw new Error('Assistant: écoute de l’événement assistant-mode-changed absente');
if(!/installStatusEvents/.test(assistant))throw new Error('Assistant: gestion événementielle du statut absente');
if(!/chefSecteurStoreScheduleAnswer/.test(assistant))throw new Error('Assistant: le résolveur de planning magasin doit être consulté par le propriétaire assistant');
if(!/storeRunnerLimitAssistantContext/.test(assistant))throw new Error('Assistant: le limiteur de contexte doit être consulté par le propriétaire assistant');

if(/window\.sectorContext\s*=/.test(contextLimit))throw new Error('Assistant: ai-context-limit.js ne doit plus wrapper sectorContext');
if(!/window\.storeRunnerLimitAssistantContext\s*=/.test(contextLimit))throw new Error('Assistant: limiteur de contexte public absent');

for(const [label,re] of [
  ['assistantSend',/window\.assistantSend\s*=/],
  ['renderAll',/window\.renderAll\s*=/],
  ['generateWeek',/window\.generateWeek\s*=/]
])if(re.test(storeLookup))throw new Error(`Assistant magasins: wrapper ${label} interdit`);
if(!/window\.chefSecteurStoreScheduleAnswer\s*=/.test(storeLookup))throw new Error('Assistant magasins: résolveur public absent');
if(!/store-runner:planning-updated/.test(storeLookup))throw new Error('Assistant magasins: écoute planning-updated absente');
if(!/MutationObserver/.test(storeLookup)||!/observedPlanHost/.test(storeLookup))throw new Error('Assistant magasins: observation du planning absente');

console.log('Assistant architecture guards: OK');
