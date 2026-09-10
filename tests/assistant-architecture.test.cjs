const fs=require('fs');
const path=require('path');
const read=file=>fs.readFileSync(path.join(process.cwd(),file),'utf8');

const assistant=read('assistant-upgrade.js');

if(/window\.setAssistantMode\s*=/.test(assistant))throw new Error('Assistant: setAssistantMode ne doit pas être réécrit par assistant-upgrade.js');
if(/__assistantModeWrapped/.test(assistant))throw new Error('Assistant: ancien wrapper de mode encore présent');
if(!/store-runner:assistant-mode-changed/.test(assistant))throw new Error('Assistant: écoute de l’événement assistant-mode-changed absente');
if(!/installStatusEvents/.test(assistant))throw new Error('Assistant: gestion événementielle du statut absente');

console.log('Assistant architecture guards: OK');
