const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(process.cwd(),'daily-capacity.js'),'utf8');

if(/scheduleBoot/.test(source)||/\[0,80,250,700,1500\]/.test(source))throw new Error('Capacité journalière: boots temporisés répétés interdits.');
if(/addEventListener\(['"]load['"],\s*boot/.test(source))throw new Error('Capacité journalière: boot supplémentaire au load interdit.');
if(/addEventListener\(['"]focus['"],\s*boot/.test(source))throw new Error('Capacité journalière: boot au focus interdit.');
if(!/DOMContentLoaded['"],\s*boot,\s*\{once:true\}/.test(source)&&!/else\s+boot\(\)/.test(source))throw new Error('Capacité journalière: initialisation unique au DOM prêt absente.');
if(!/store-runner:data-restored/.test(source)||!/syncField/.test(source))throw new Error('Capacité journalière: resynchronisation après restauration absente.');
if(!/store-runner:planning-updated/.test(source))throw new Error('Capacité journalière: récupération événementielle du champ absente.');
if(/state\.plan/.test(source)||/capPlan\s*\(/.test(source)||/route\.slice\s*\(\s*0\s*,\s*max\s*\)/.test(source))throw new Error('Capacité journalière: le réglage ne doit jamais tronquer ni muter le planning existant.');
if(!/planning déjà généré est conservé/.test(source))throw new Error('Capacité journalière: l’interface doit préciser que le planning existant est conservé.');

console.log('Daily capacity architecture guards: OK');
