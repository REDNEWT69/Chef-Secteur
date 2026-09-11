const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

for(const file of ['oauth-home.html','privacy.html','terms.html','GOOGLE_OAUTH_EXTERNAL.md'])assert.ok(fs.existsSync(path.join(root,file)),file+' doit exister pour la préparation OAuth External');

const home=read('oauth-home.html'),privacy=read('privacy.html'),terms=read('terms.html'),doc=read('GOOGLE_OAUTH_EXTERNAL.md');
assert.match(home,/Store Runner/);
assert.match(home,/href="\.\/privacy\.html"/);
assert.match(home,/href="\.\/terms\.html"/);
assert.match(home,/lecture seule/i);
assert.match(home,/ne sont pas transmis à l’assistant IA en ligne/i);
assert.match(privacy,/Google API Services User Data Policy/);
assert.match(privacy,/Limited Use/);
assert.match(privacy,/sessionStorage/);
assert.match(privacy,/ne sont pas envoyés à l’assistant IA en ligne/i);
assert.match(terms,/href="\.\/privacy\.html"/);
assert.match(doc,/Audience.*External/is);
assert.match(doc,/https:\/\/rednewt69\.github\.io\/Chef-Secteur\/oauth-home\.html/);
assert.match(doc,/https:\/\/rednewt69\.github\.io\/Chef-Secteur\/privacy\.html/);
assert.match(doc,/https:\/\/rednewt69\.github\.io\/Chef-Secteur\/terms\.html/);

const core=read('src/chef-secteur.html');
assert.match(core,/scope:'https:\/\/www\.googleapis\.com\/auth\/calendar\.readonly'/,'Google Agenda doit rester en lecture seule');
assert.doesNotMatch(core,/scope:'https:\/\/www\.googleapis\.com\/auth\/calendar'/,'le scope Calendar complet en écriture est interdit');
assert.doesNotMatch(core,/scope:'https:\/\/www\.googleapis\.com\/auth\/calendar\.events'/,'le scope événements en écriture est interdit');

const calendar=read('calendar-oauth.js');
assert.match(calendar,/PRIVACY_URL='\.\/privacy\.html'/);
assert.match(calendar,/TERMS_URL='\.\/terms\.html'/);
assert.match(calendar,/input\.hidden=true/,'le Client ID technique ne doit pas être présenté comme un réglage utilisateur en production');
assert.match(calendar,/Les détails des événements restent dans Store Runner/);
assert.doesNotMatch(calendar,/client_secret/i,'aucun secret OAuth ne doit être embarqué côté navigateur');

const reliability=read('reliability-core.js');
assert.match(reliability,/OAuth tokens are never exported/,'les sauvegardes doivent continuer à exclure les jetons OAuth');

let registered=null,priority=null;
const ctx={window:null,console};ctx.window=ctx;
ctx.storeRunnerRegisterAssistantContextTransform=(fn,p)=>{registered=fn;priority=p};
vm.runInNewContext(read('ai-context-limit.js'),ctx);
assert.equal(typeof ctx.storeRunnerLimitAssistantContext,'function');
assert.equal(registered,ctx.storeRunnerLimitAssistantContext);
assert.equal(priority,100);
const limited=ctx.storeRunnerLimitAssistantContext({
  calendarEvents:[{title:'SECRET AGENDA',location:'Adresse privée',date:'2026-09-11'}],
  awayRanges:[{start:'2026-09-11',end:'2026-09-12',city:'Paris'}],
  daySummaries:{Vendredi:'Agenda : SECRET AGENDA'},
  overnight:{title:'Hôtel secret'},
  instructions:'Instruction de base',stores:[],plan:{},settings:{},profile:{},businessV2:{}
});
assert.deepEqual(Array.from(limited.calendarEvents),[],'aucun événement Google ne doit quitter le navigateur via le contexte IA');
assert.deepEqual(Array.from(limited.awayRanges),[],'les déplacements déduits de Google Agenda doivent rester locaux');
assert.deepEqual(Object.keys(limited.daySummaries),[],'les résumés pouvant contenir des titres Agenda doivent rester locaux');
assert.equal(limited.overnight,null,'les hôtels déduits du contexte Agenda doivent rester locaux');
assert.doesNotMatch(JSON.stringify(limited),/SECRET AGENDA|Adresse privée|Hôtel secret/);
assert.match(limited.instructions,/Google Agenda restent locaux/);

const assistant=read('assistant-upgrade.js');
assert.match(assistant,/détails Google Agenda conservés localement/,'le statut IA doit refléter la protection réellement appliquée');
assert.doesNotMatch(assistant,/planning \+ agenda \+ hôtels envoyés comme contexte/,'l’interface ne doit plus prétendre envoyer Agenda à l’IA en ligne');

console.log('PASS: préparation OAuth External publiée, lecture seule maintenue, jetons exclus des sauvegardes et données Google Agenda gardées hors de l’IA en ligne.');
