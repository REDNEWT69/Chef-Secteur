const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(process.cwd(),'timeline-end-times.js'),'utf8');

if(/\[0,100,250,600,1200\]/.test(source))throw new Error('Timeline: les boots temporisés répétés sont interdits.');
if(/setTimeout\s*\(\s*boot/.test(source))throw new Error('Timeline: boot ne doit pas être relancé par timer.');
if(/addEventListener\(['"]load['"],\s*boot/.test(source))throw new Error('Timeline: boot supplémentaire au load interdit.');
if(!/DOMContentLoaded['"],\s*boot,\s*\{once:true\}/.test(source)&&!/else\s+boot\(\)/.test(source))throw new Error('Timeline: initialisation unique au DOM prêt absente.');
if(!/MutationObserver/.test(source))throw new Error('Timeline: observation ciblée du planning absente.');
if(!/addEventListener\(['"]focus['"],\s*schedule/.test(source))throw new Error('Timeline: rafraîchissement au focus absent.');

console.log('Timeline architecture guards: OK');
