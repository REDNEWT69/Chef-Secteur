const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(process.cwd(),'working-hours-end.js'),'utf8');

if(/scheduleBoot/.test(source)||/\[0,80,220,500,1000,1800\]/.test(source))throw new Error('Horaires: boots temporisés répétés interdits.');
if(/addEventListener\(['"]load['"],\s*boot/.test(source))throw new Error('Horaires: boot supplémentaire au load interdit.');
if(/addEventListener\(['"]focus['"],\s*boot/.test(source))throw new Error('Horaires: boot au focus interdit.');
if(!/DOMContentLoaded['"],\s*boot,\s*\{once:true\}/.test(source)&&!/else\s+boot\(\)/.test(source))throw new Error('Horaires: initialisation unique au DOM prêt absente.');
if(!/store-runner:data-restored/.test(source)||!/syncField/.test(source))throw new Error('Horaires: resynchronisation après restauration absente.');
if(!/store-runner:planning-updated/.test(source))throw new Error('Horaires: récupération événementielle du champ absente.');

console.log('Working hours architecture guards: OK');
