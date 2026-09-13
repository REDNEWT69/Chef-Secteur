const fs=require('fs');
const path=require('path');

const ui=fs.readFileSync(path.join(process.cwd(),'connection-ui.js'),'utf8');

if(!/GATEWAY_HEALTH_TTL/.test(ui))throw new Error('Assistant online: cache de santé passerelle absent');
if(!/checkGatewayHealth/.test(ui))throw new Error('Assistant online: test réel de passerelle absent');
if(!/searchParams\.set\(['"]mode['"],['"]ping['"]\)/.test(ui))throw new Error('Assistant online: le health-check doit appeler le mode ping');
if(!/fetch\(/.test(ui))throw new Error('Assistant online: le health-check doit effectuer un vrai appel réseau');
if(!/Vérification de l’IA en ligne/.test(ui))throw new Error('Assistant online: état de vérification absent');
if(!/connexion vérifiée/.test(ui))throw new Error('Assistant online: état prêt vérifié absent');
if(!/IA en ligne indisponible/.test(ui))throw new Error('Assistant online: état indisponible absent');
if(!/store-runner:assistant-mode-changed/.test(ui))throw new Error('Assistant online: changement de mode non écouté');
if(!/assistantAIStatus/.test(ui))throw new Error('Assistant online: statut visuel non piloté');
if(/Access-Control-Allow-Origin/.test(ui))throw new Error('Assistant online: aucune logique CORS ne doit être bricolée côté navigateur');

console.log('Assistant online health guards: OK · ready state requires a real gateway ping');
