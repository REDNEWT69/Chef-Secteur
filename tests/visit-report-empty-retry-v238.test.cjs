/* V238 — une réponse IA VIDE sur un compte rendu de visite ne doit plus obliger le FMT à
   recliquer. Ce fichier prouve la cause racine, puis le correctif, de bout en bout.

   Le Worker est chargé tel quel depuis workers/chef-secteur-ai.js : seul `export default`
   est réécrit pour l'exécuter hors Cloudflare. Le module client est chargé tel quel lui
   aussi. La chaîne testée est donc la chaîne déployée.

   Fixtures 100 % synthétiques : le dépôt est public. Aucune note terrain, aucun magasin,
   aucun nom réel. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const api=require('../visit-report-ai-json-v225.js');

const ROOT=path.join(__dirname,'..');
const SOURCE=fs.readFileSync(path.join(ROOT,'workers/chef-secteur-ai.js'),'utf8');
const MODULE=fs.readFileSync(path.join(ROOT,'visit-report-ai-json-v225.js'),'utf8');
const SLACK=fs.readFileSync(path.join(ROOT,'visit-report-slack.js'),'utf8');
const ORIGIN='https://store-runner.fr';
const CHARS_PER_TOKEN=3.2; // français

/* ------------------------------------------------------------------ outillage Worker */
function loadWorker(fetchImpl){
  const sandbox={Response,Request,Headers,URL,console:{warn(){},log(){},error(){}},
    fetch:fetchImpl||(async()=>{throw new Error('fetch non simulé')}),module:{exports:{}}};
  sandbox.globalThis=sandbox;
  vm.runInNewContext(SOURCE.replace(/^export default \{/m,'module.exports = {'),sandbox,{filename:'chef-secteur-ai.js'});
  return sandbox.module.exports;
}
/* Moteur de test. `workers` est la file des enveloppes rendues par le binding AI, `groq`
   celle des contenus rendus par le repli. `seen` compte les appels FOURNISSEUR réels. */
function engine({workers=[],groq=[],groqKey=false,noBinding=false}={}){
  const seen={workers:[],groq:[]};
  const env={};
  if(!noBinding)env.AI={run:async(model,payload)=>{
    seen.workers.push({model,payload});
    const next=workers.length>1?workers.shift():workers[0];
    if(next instanceof Error)throw next;
    return next===undefined?{response:''}:next;
  }};
  if(groqKey)env.GROQ_API_KEY='cle-de-test';
  const fetchImpl=async(url,init)=>{
    seen.groq.push(JSON.parse(String(init&&init.body||'{}')));
    const next=groq.length>1?groq.shift():groq[0];
    if(next instanceof Error)throw next;
    const content=next===undefined?'':next;
    return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:content?'stop':'length'}]})};
  };
  return {env,seen,worker:loadWorker(fetchImpl)};
}
function post(worker,env,body,origin=ORIGIN){
  return worker.fetch(new Request('https://store-runner.fr/api/ai',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}),env);
}
/* Transport identique à `callAIGateway` de src/chef-secteur.html, troncature à 180
   caractères comprise : c'est elle qui décide si le code interne survit jusqu'au client. */
function gatewayTransport(worker,env,seenHttp){
  return async opts=>{
    if(seenHttp)seenHttp.push({mode:opts.mode,retryEmpty:opts.retryEmpty});
    const res=await post(worker,env,opts);
    const txt=await res.text();
    if(res.status<200||res.status>=300)throw new Error('Passerelle IA : HTTP '+res.status+' · '+txt.substring(0,180));
    const data=JSON.parse(txt);
    if(data.error)throw new Error(data.error);
    return data;
  };
}

/* ------------------------------------------------------------------------- fixtures */
function visit(family,size){
  const p=n=>('Le vendeur signale une rupture sur deux references et juge la gamme moins lumineuse. ').repeat(20).slice(0,n);
  const base={skeleton:'grands-magasins',merged:false,family,date:'2026-09-20',
    store:{enseigne:'Enseigne-Test',ville:'Ville-Test',adresse:'1 rue de Test'},
    context:p(300),noteTerrain:p(1400),actionsRealisees:p(600),massification:p(400),omni:p(350),
    formationProchainPassage:p(400),anomalies:[p(120),p(110),p(130)],
    legacyObservations:Array.from({length:12},(_,i)=>({theme:'Theme '+i,item:'Item '+i,status:'issue',comment:p(90),action:p(80)})),
    openActions:[{description:p(100),owner:'FMT',dueDate:'2026-09-30',status:'open'}],
    photos:{total:4,before:2,after:2,other:0}};
  if(size!=='xl'&&size!=='hors-norme')return base;
  // Volume réaliste HAUT : une visite BLANC très bavarde, toujours 100 % synthétique.
  const xl={...base,noteTerrain:p(6000),actionsRealisees:p(2600),massification:p(1800),omni:p(1600),
    formationProchainPassage:p(1500),anomalies:Array.from({length:8},()=>p(180)),
    legacyObservations:Array.from({length:24},(_,i)=>({theme:'Theme '+i,item:'Item '+i,status:'issue',comment:p(120),action:p(110)}))};
  if(size==='xl')return xl;
  // Volume hors norme, au-delà de tout ce qu'une visite produit : sert uniquement à
  // épingler le plafond d'entrée du Worker, pas à décrire un cas terrain.
  return{...xl,noteTerrain:p(12000),legacyObservations:Array.from({length:60},(_,i)=>
    ({theme:'Theme '+i,item:'Item '+i,status:'issue',comment:p(200),action:p(190)}))};
}
function doc(family){
  return family==='blanc'
    ?{famille:'BLANC',contexte:'Rayon accessible.',lavage:'Presence correcte.',froid:'',cuisson:'',entretien_sols:'',
      retours_vendeurs:['Le vendeur signale une rupture.'],retours_clients:[],concurrence:[],points_positifs:[],
      blocages:[],actions_realisees:[],formation:[],prochain_passage:['Revoir la disponibilite.'],priorite:'',synthese:'Situation stable.'}
    :{famille:'BRUN',contexte:'Tete de gondole occupee.',merchandising:'Visibilite correcte.',
      retours_vendeurs:['Le vendeur signale une rupture.'],retours_clients:[],concurrence:[],audio:'',
      points_positifs:[],blocages:[],actions_realisees:[],formation:[],prochain_passage:['Revoir la disponibilite.'],
      priorite:'',synthese:'Situation stable.'};
}
function answerFor(family){return JSON.stringify(doc(family))}
function truncated(family){
  const full=JSON.stringify(doc(family),null,2),cut=full.slice(0,Math.floor(full.length*0.62));
  assert.equal(cut.includes('}'),false,'la fixture tronquée ne doit porter aucune accolade fermante');
  return cut;
}
function run(transport,family,size){
  return api.wrapGateway(transport)({mode:'assistant',message:'ancien prompt',
    context:{task:'visit_report',visit:visit(family,size)}});
}

(async()=>{

/* ================================================================================== */
/* 0. CAUSE RACINE — pourquoi BLANC échouait là où BRUN passait                        */
/* ================================================================================== */
{
  // a) Ce n'est PAS la longueur du prompt d'entrée.
  const entreeBrun=api.buildPrompt(visit('brun')).length;
  const entreeBlanc=api.buildPrompt(visit('blanc')).length;
  const ecartEntree=entreeBlanc-entreeBrun;
  assert(ecartEntree<120,'l’écart d’entrée BLANC/BRUN doit rester marginal, vu '+ecartEntree+'c');
  assert(ecartEntree/entreeBrun<0.01,'moins de 1 % d’écart en entrée : la longueur du prompt n’est pas la cause');

  // b) C'est la SORTIE attendue : BLANC porte deux rubriques de plus.
  const rubriques=f=>(api.schemaFor(f).match(/"\w+":/g)||[]).length;
  assert.equal(rubriques('brun'),14);
  assert.equal(rubriques('blanc'),16,'BLANC ajoute lavage, froid, cuisson et entretien des sols');

  // Coût de sortie mesuré sur un compte rendu réellement rempli.
  const s=n=>('Le vendeur signale une rupture sur deux references et juge la gamme moins lumineuse que certaines offres concurrentes. ').repeat(4).slice(0,n);
  const brunRempli={famille:'BRUN',contexte:s(260),merchandising:s(240),retours_vendeurs:[s(150),s(140)],
    retours_clients:[s(120)],concurrence:[s(130)],audio:s(170),points_positifs:[s(120),s(115)],
    blocages:[s(140),s(135)],actions_realisees:[s(130),s(125)],formation:[s(120)],
    prochain_passage:[s(130),s(120)],priorite:s(110),synthese:s(230)};
  const c=brunRempli.contexte;
  const blancRempli={...brunRempli,famille:'BLANC',lavage:c.slice(0,240),froid:c.slice(0,230),
    cuisson:c.slice(0,225),entretien_sols:c.slice(0,215)};
  delete blancRempli.merchandising;delete blancRempli.audio;
  const sortieBrun=JSON.stringify(brunRempli,null,2).length;
  const sortieBlanc=JSON.stringify(blancRempli,null,2).length;
  assert(sortieBlanc>sortieBrun*1.10,'la sortie BLANC doit être nettement plus longue, vu +'+
    (100*(sortieBlanc-sortieBrun)/sortieBrun).toFixed(1)+'%');

  // c) À 2600 tokens, le TEXTE VISIBLE garde une marge confortable dans les deux familles :
  //    le plafond n'est pas le facteur limitant, et V238 ne le relève donc pas.
  const budget=Number(SOURCE.match(/VISIT_REPORT_MAX_TOKENS = (\d+)/)[1]);
  assert.equal(budget,2600,'V238 n’augmente pas le budget de tokens sans mesure');
  assert(budget/(sortieBlanc/CHARS_PER_TOKEN)>2,'BLANC garde plus du double de marge sur le texte visible');
  // Ce qui rétrécit, c'est la réserve laissée au raisonnement, facturé sur le même plafond.
  const reserveBrun=budget-sortieBrun/CHARS_PER_TOKEN,reserveBlanc=budget-sortieBlanc/CHARS_PER_TOKEN;
  assert(reserveBlanc<reserveBrun,'BLANC laisse moins de réserve au raisonnement que BRUN');

  console.log('PASS 0 · cause racine mesurée : entrée +'+ecartEntree+'c (<1%), sortie +'+
    (100*(sortieBlanc-sortieBrun)/sortieBrun).toFixed(1)+'%, réserve raisonnement '+
    Math.round(reserveBlanc)+' vs '+Math.round(reserveBrun)+' tokens');
}

/* ================================================================================== */
/* 1 & 2. Une réponse exploitable du premier coup ne coûte qu'un appel                 */
/* ================================================================================== */
for(const family of ['brun','blanc']){
  const {env,seen,worker}=engine({workers:[{response:answerFor(family)}]});
  const http=[];
  const out=await run(gatewayTransport(worker,env,http),family);
  assert.match(out.text,family==='blanc'?/^⚪ Résumé BLANC – Enseigne-Test Ville-Test/:/^⚫ Résumé BRUN – Enseigne-Test Ville-Test/);
  assert.equal(http.length,1,'un seul appel passerelle');
  assert.equal(seen.workers.length,1,'un seul appel fournisseur');
  assert.equal(out.attempts,1,'une seule tentative logique');
  assert.equal(out.retried,false);
  assert.equal(out.repaired,false);
  // La première tentative garde le contrat V232 : message système séparé.
  assert.equal(seen.workers[0].payload.messages[0].role,'system');
  assert.equal(seen.workers[0].payload.max_completion_tokens,2600);
}
console.log('PASS 1+2 · BRUN et BLANC valides au premier appel : 1 appel, 1 tentative');

/* ================================================================================== */
/* 3 & 5. Premier retour VIDE, second valide : succès en exactement 2 tentatives       */
/*        Le mécanisme est générique visit_report, pas câblé sur BLANC.                */
/* ================================================================================== */
for(const family of ['blanc','brun']){
  const {env,seen,worker}=engine({workers:[{response:'',finish_reason:'length'},{response:answerFor(family)}]});
  const http=[];
  const out=await run(gatewayTransport(worker,env,http),family);
  assert.match(out.text,family==='blanc'?/^⚪ Résumé BLANC/:/^⚫ Résumé BRUN/);
  assert.equal(out.attempts,2,'exactement deux tentatives logiques pour '+family);
  assert.equal(out.retried,true,'le second essai doit être signalé à l’interface');
  assert.equal(out.repaired,false,'un cas vide n’est pas une réparation JSON');
  assert.equal(http.length,1,'le second essai reste interne au Worker : un seul aller-retour HTTP');
  assert.equal(seen.workers.length,2,'exactement deux appels fournisseur');
  // Le second essai ne rejoue pas la requête à l'identique : contrat resserré en une
  // seule tournée utilisateur, mêmes données, même schéma, même plafond de tokens.
  assert.equal(seen.workers[1].payload.messages.length,1,'le second essai tient en une tournée utilisateur');
  assert.equal(seen.workers[1].payload.messages[0].role,'user');
  assert.equal(seen.workers[1].payload.temperature,seen.workers[0].payload.temperature,'température basse inchangée');
  assert.equal(seen.workers[1].payload.max_completion_tokens,2600,'aucun token supplémentaire');
  assert.match(seen.workers[1].payload.messages[0].content,/SCHÉMA JSON STRICT/,'même schéma attendu');
  assert.match(seen.workers[1].payload.messages[0].content,/DONNEES_SOURCE/,'mêmes données source');
}
console.log('PASS 3+5 · réponse vide rattrapée en 2 tentatives, sur BLANC comme sur BRUN');

/* ================================================================================== */
/* 4. Deux retours vides : erreur propre, 2 tentatives MAX, rapport local conservé      */
/* ================================================================================== */
{
  const {env,seen,worker}=engine({workers:[{response:'',finish_reason:'length'}]});
  const http=[];
  await assert.rejects(()=>run(gatewayTransport(worker,env,http),'blanc'),err=>{
    // Le code interne survit à la troncature à 180 caractères du transport.
    assert.match(err.message,/ai_empty_response/,'le code interne doit atteindre le client');
    assert.equal(api.emptyResponseFailure(err),true,'le client doit reconnaître un moteur muet');
    assert.equal(api.failureMessage(err),
      'Le résumé IA n’a pas pu être généré après deux tentatives. Le compte rendu local est conservé.');
    return true;
  });
  assert.equal(seen.workers.length,2,'exactement deux tentatives, jamais une troisième');
  assert.equal(http.length,1,'aucun second aller-retour HTTP');
  // Le corps d'erreur porte des diagnostics non sensibles, et rien d'autre.
  const res=await post(worker,env,{mode:'visit_report',message:'prompt de test'});
  const body=await res.json();
  assert.equal(res.status,502,'un moteur muet n’est pas un 500 générique');
  assert.equal(body.code,'ai_empty_response');
  assert.equal(body.attempts,2);
  assert.equal(body.textLength,0);
  assert.equal(body.provider,'cloudflare-workers-ai');
  assert.equal(body.finishReason,'length');
  assert.deepEqual(Object.keys(body).sort(),
    ['attempts','code','error','fallbackUsed','finishReason','model','provider','textLength'],
    'aucun champ de diagnostic non prévu ne doit sortir');
  assert.doesNotMatch(JSON.stringify(body),/vendeur|rupture|DONNEES_SOURCE|prompt de test/i,
    'aucune note terrain ni prompt dans le corps d’erreur');
  console.log('PASS 4 · deux vides : 502 classé, 2 tentatives max, diagnostics non sensibles');
}

/* ================================================================================== */
/* 6 & 7. Réparation V232 : intacte, et jamais cumulée avec le second essai            */
/* ================================================================================== */
{
  // JSON tronqué : la réparation V232 fonctionne toujours, en un second appel passerelle.
  const {env,seen,worker}=engine({workers:[{response:truncated('brun'),finish_reason:'length'},{response:answerFor('brun')}]});
  const http=[];
  const out=await run(gatewayTransport(worker,env,http),'brun');
  assert.equal(out.repaired,true,'la réparation V232 doit rester fonctionnelle');
  assert.match(out.text,/^⚫ Résumé BRUN/);
  assert.equal(http.length,2,'une réparation coûte exactement un second appel passerelle');
  assert.equal(seen.workers.length,2,'et pas un appel fournisseur de plus');
  // Le client interdit explicitement le second essai « vide » sur l'appel de réparation.
  assert.equal(http[0].retryEmpty,true,'la génération a droit au second essai');
  assert.equal(http[1].retryEmpty,false,'la réparation n’y a pas droit : les budgets ne se cumulent pas');

  // JSON invalide : comportement V232 conservé, refus après une réparation unique.
  const ko=engine({workers:[{response:'ceci n’est pas du JSON'},{response:'toujours pas du JSON'}]});
  await assert.rejects(()=>run(gatewayTransport(ko.worker,ko.env),'brun'),/JSON de compte rendu/);
  assert.equal(ko.seen.workers.length,2,'jamais de troisième appel');

  // Plafond dur du pire cas : génération vide + second essai + réparation, rien de plus.
  const pire=engine({workers:[{response:'',finish_reason:'length'},{response:truncated('blanc'),finish_reason:'length'},{response:answerFor('blanc')}]});
  const pireHttp=[];
  const rattrape=await run(gatewayTransport(pire.worker,pire.env,pireHttp),'blanc');
  assert.equal(rattrape.repaired,true);
  assert.equal(pireHttp.length,2,'jamais plus de deux allers-retours passerelle');
  assert.equal(pire.seen.workers.length,3,'plafond dur : 3 tentatives logiques au pire, jamais 4');
  console.log('PASS 6+7 · réparation tronquée OK, JSON invalide refusé, plafond dur à 3 tentatives');
}

/* ================================================================================== */
/* 8. Transport réel : ne jamais confondre avec « le moteur a répondu vide »           */
/* ================================================================================== */
{
  for(const [label,err] of [
    ['HTTP 500 réseau',new Error('Passerelle IA : HTTP 500 · <html>Bad gateway</html>')],
    ['timeout',new Error('The operation was aborted')],
    ['fetch échoué',new Error('Failed to fetch')],
    ['réponse non JSON',new Error('Réponse IA invalide : <html>')]
  ]){
    assert.equal(api.emptyResponseFailure(err),false,'à tort classé « moteur muet » : '+label);
    assert.equal(api.failureMessage(err),'','aucun message « deux tentatives » pour : '+label);
    assert.equal(api.transportFailure(err),true,'doit rester une panne de transport : '+label);
    const gw=async()=>{throw err};
    let appels=0;
    await assert.rejects(()=>api.wrapGateway(async o=>{appels++;return gw(o)})(
      {mode:'assistant',message:'m',context:{task:'visit_report',visit:visit('blanc')}}));
    assert.equal(appels,1,'une panne de transport ne consomme aucun essai supplémentaire : '+label);
  }
  // Et côté Worker : un moteur injoignable n'est pas un moteur muet, donc pas de rejeu.
  const {env,seen,worker}=engine({workers:[new Error('binding indisponible')]});
  const res=await post(worker,env,{mode:'visit_report',message:'prompt'});
  const body=await res.json();
  assert.equal(body.code,'ai_provider_unavailable','un moteur injoignable est classé à part');
  assert.equal(seen.workers.length,1,'un moteur injoignable ne se rejoue pas : le mur est le même');
  // Absence totale de moteur : classée encore autrement, et toujours en 500.
  const vide=loadWorker();
  const sans=await post(vide,{},{mode:'visit_report',message:'prompt'});
  assert.equal(sans.status,500);
  assert.equal((await sans.json()).code,'ai_no_provider');
  console.log('PASS 8 · réseau, timeout, fetch échoué, moteur injoignable, aucun moteur : quatre cas distincts');
}

/* ================================================================================== */
/* 9. Mauvaise famille : validation métier V232 conservée                              */
/* ================================================================================== */
{
  const {env,seen,worker}=engine({workers:[{response:answerFor('blanc')},{response:answerFor('blanc')}]});
  await assert.rejects(()=>run(gatewayTransport(worker,env),'brun'),/famille JSON inattendue/);
  assert.equal(seen.workers.length,2,'une réparation tentée, puis refus : rien de plus');
  // Une famille inattendue n'est pas un cas vide : aucun message « deux tentatives ».
  assert.equal(api.failureMessage(new Error('famille JSON inattendue')),'');
  console.log('PASS 9 · famille inattendue toujours refusée, jamais rendue');
}

/* ================================================================================== */
/* 10. Double tap : un seul flux de génération                                         */
/* ================================================================================== */
{
  const generateAI=SLACK.slice(SLACK.indexOf('async function generateAI'),SLACK.indexOf('async function copy('));
  const lock=generateAI.indexOf('generating=true'),firstAwait=generateAI.indexOf('await');
  assert(lock>0&&firstAwait>0&&lock<firstAwait,'le verrou doit précéder le premier await');
  assert.match(SLACK,/if\(generating\)\{say\('Génération déjà en cours/,'un double tap ne lance pas deux générations');
  assert.match(SLACK,/finally\{generating=false;if\(button\)\{button\.disabled=false/,
    'le bouton reste verrouillé jusqu’à la fin, second essai compris, puis réactivé');
  // Le second essai vit DANS l'appel passerelle : le verrou le couvre sans rien changer.
  assert(generateAI.indexOf('await root.callAIGateway({')<generateAI.indexOf('finally'),
    'l’appel IA, et donc le second essai, vit sous le verrou');
  console.log('PASS 10 · double tap : un seul flux, bouton verrouillé pendant le second essai');
}

/* ================================================================================== */
/* 11. Très gros payload BLANC synthétique, volume réaliste haut                       */
/* ================================================================================== */
{
  const prompt=api.buildPrompt(visit('blanc','xl'));
  assert(prompt.length>18000,'la fixture haute doit être réellement volumineuse, vue '+prompt.length+'c');

  const {env,seen,worker}=engine({workers:[{response:'',finish_reason:'length'},{response:answerFor('blanc')}]});
  const out=await run(gatewayTransport(worker,env),'blanc','xl');
  assert.match(out.text,/^⚪ Résumé BLANC/);
  assert.equal(out.attempts,2);
  assert.equal(seen.workers.length,2,'un gros payload ne change pas le plafond de tentatives');
  assert(seen.workers[1].payload.messages[0].content.length>18000,'le second essai garde toutes les données source');

  /* Plafond d'entrée du Worker, antérieur à V238 et INCHANGÉ ici : le message est coupé à
     24 000 caractères, sans le dire. La surcharge fixe du prompt pesant ~2 575 caractères,
     DONNEES_SOURCE commence à être amputé au-delà d'environ 21 400 caractères — bien
     au-dessus d'une visite normale, atteignable par une visite hors norme. On l'épingle
     pour qu'un futur changement du plafond soit délibéré et non accidentel. */
  const routeVisite=SOURCE.slice(SOURCE.indexOf("if (mode === 'visit_report')"));
  const limite=Number(routeVisite.match(/\.slice\(0, (\d+)\)/)[1]);
  assert.equal(limite,24000,'le plafond d’entrée de la route compte rendu doit rester explicite');
  const surcharge=api.buildPrompt({skeleton:'grands-magasins',family:'blanc'}).length;
  assert(surcharge<3000,'la surcharge fixe du prompt doit rester marginale, vue '+surcharge+'c');
  assert(prompt.length<limite,'une visite bavarde réaliste doit tenir sous le plafond, vue '+prompt.length+'c');

  const horsNorme=api.buildPrompt(visit('blanc','hors-norme'));
  assert(horsNorme.length>limite,'la fixture hors norme doit bien dépasser le plafond');
  const coupe=horsNorme.slice(0,limite);
  assert.equal(coupe.includes('"photos"'),false,
    'au-delà du plafond, la fin de DONNEES_SOURCE est perdue en silence : limite connue, non traitée par V238');
  console.log('PASS 11 · payload BLANC haut ('+prompt.length+'c) rattrapé en 2 tentatives ; plafond d’entrée épinglé à '+limite+'c');
}

/* ================================================================================== */
/* 12. Enveloppes Workers AI : le texte existant ne doit plus être déclaré « vide »     */
/* ================================================================================== */
{
  const json=answerFor('brun');
  // Formes où le texte EST présent. Avant V238, les six premières étaient perdues parce
  // que l'extraction s'arrêtait au premier champ connu présent, même vide.
  const portantes=[
    ['response vide puis choices',{response:'',choices:[{message:{content:json}}]}],
    ['text vide puis choices',{text:'',choices:[{message:{content:json}}]}],
    ['result.response vide puis choices',{result:{response:''},choices:[{message:{content:json}}]}],
    ['result.text',{result:{text:json}}],
    ['choices[0].text',{choices:[{text:json}]}],
    ['output_text',{output_text:json}],
    ['message.content vide puis second choice',{choices:[{message:{content:''}},{message:{content:json}}]}],
    ['message.content en parties',{choices:[{message:{content:[{text:json}]}}]}],
    ['delta.content',{choices:[{delta:{content:json}}]}],
    ['response directe',{response:json}],
    ['result.response directe',{result:{response:json}}],
    ['chaîne nue',json]
  ];
  for(const [label,enveloppe] of portantes){
    const {env,seen,worker}=engine({workers:[enveloppe]});
    const out=await run(gatewayTransport(worker,env),'brun');
    assert.match(out.text,/^⚫ Résumé BRUN/,'enveloppe perdue : '+label);
    assert.equal(seen.workers.length,1,'un texte déjà présent ne doit coûter qu’un appel : '+label);
    assert.equal(out.attempts,1,'aucun second essai quand le texte est là : '+label);
  }
  // Formes réellement vides : elles doivent rester classées « vide », sans invention.
  for(const [label,enveloppe] of [
    ['tout vide',{response:'',text:'',choices:[{message:{content:''}}]}],
    ['aucun champ connu',{unknown_field:json}],
    ['objet nu',{}],
    ['null',null]
  ]){
    const {env,seen,worker}=engine({workers:[enveloppe]});
    await assert.rejects(()=>run(gatewayTransport(worker,env),'brun'),/ai_empty_response/,'devrait être vide : '+label);
    assert.equal(seen.workers.length,2,'un vrai vide déclenche le second essai, une fois : '+label);
  }
  console.log('PASS 12 · 12 enveloppes porteuses récupérées, 4 enveloppes vides correctement classées');
}

/* ================================================================================== */
/* 13 & 14. Repli Groq : Workers muet → Groq valide, puis Workers muet → Groq muet     */
/* ================================================================================== */
{
  // 13. Workers AI vide, Groq répond : succès dès la première tentative logique.
  const ok=engine({workers:[{response:'',finish_reason:'length'}],groq:[answerFor('blanc')],groqKey:true});
  const out=await run(gatewayTransport(ok.worker,ok.env),'blanc');
  assert.match(out.text,/^⚪ Résumé BLANC/);
  assert.equal(out.provider,'groq');
  assert.equal(out.fallbackFrom,'cloudflare-workers-ai','l’origine du repli doit rester exposée');
  assert.equal(out.attempts,1,'un repli réussi n’est pas un second essai : c’est la même tentative');
  assert.equal(ok.seen.workers.length,1);
  assert.equal(ok.seen.groq.length,1);

  // 14. Workers AI vide ET Groq vide : jamais de succès vide, et un second essai unique.
  const ko=engine({workers:[{response:'',finish_reason:'length'}],groq:[''],groqKey:true});
  const http=[];
  await assert.rejects(()=>run(gatewayTransport(ko.worker,ko.env,http),'blanc'),err=>{
    assert.match(err.message,/ai_empty_response/);
    assert.equal(api.failureMessage(err),
      'Le résumé IA n’a pas pu être généré après deux tentatives. Le compte rendu local est conservé.');
    return true;
  });
  assert.equal(ko.seen.workers.length,2,'deux tentatives logiques');
  assert.equal(ko.seen.groq.length,2,'le repli est rejoué une fois lui aussi, jamais plus');
  assert.equal(http.length,1);
  // Le Worker ne rend jamais un objet vide au handler : la sortie est classée.
  const res=await post(ko.worker,ko.env,{mode:'visit_report',message:'prompt'});
  const body=await res.json();
  assert.equal(res.status,502);
  assert.equal(body.code,'ai_empty_response');
  assert.equal(body.fallbackUsed,true,'le repli utilisé doit être dit');
  assert.equal(body.provider,'groq','le fournisseur qui a répondu en dernier doit être nommé');
  assert.equal(body.textLength,0);

  // 14 bis. Workers muet et Groq en panne : c'est un moteur injoignable, pas un muet.
  const panne=engine({workers:[{response:''}],groq:[new Error('Groq HTTP 503')],groqKey:true});
  const casse=await post(panne.worker,panne.env,{mode:'visit_report',message:'prompt'});
  assert.equal((await casse.json()).code,'ai_provider_unavailable');
  assert.equal(panne.seen.groq.length,1,'une panne fournisseur ne se rejoue pas');

  // 14 ter. Sans binding Workers AI, Groq muet reste classé, jamais rendu en succès.
  const seul=engine({noBinding:true,groq:[''],groqKey:true});
  const seulRes=await post(seul.worker,seul.env,{mode:'visit_report',message:'prompt'});
  assert.equal(seulRes.status,502);
  assert.equal((await seulRes.json()).code,'ai_empty_response');
  assert.equal(seul.seen.groq.length,2,'deux tentatives, jamais trois');
  console.log('PASS 13+14 · repli Groq réussi, repli muet classé, panne fournisseur distinguée');
}

/* ================================================================================== */
/* 15. Hygiène : aucune note terrain journalisée, contrats V232 intacts                */
/* ================================================================================== */
{
  assert(!/console\.(log|warn|info|error)\([^)]*(noteTerrain|payload\.messages|body\.message|user)\b/.test(SOURCE),
    'aucune note terrain, aucun prompt ne doit être journalisé par le Worker');
  assert.match(SOURCE,/console\.warn\(`Workers AI indisponible, fallback Groq: \$\{failure\.code\}`\)/,
    'le journal de repli ne doit porter que le code interne');
  assert(!/console\.(log|warn|info)\([^)]*noteTerrain/.test(SLACK+MODULE),'aucune note terrain journalisée côté client');
  // Les routes non concernées gardent leur contrat.
  assert.match(SOURCE,/allowEmpty: true/,'la relecture garde son propre second essai');
  assert.match(SOURCE,/callAI\(env, PROOFREAD_SYSTEM, user, proofreadRetryTokens\(source\), PROOFREAD_OPTIONS\)/);
  assert.match(SOURCE,/const VISIT_REPORT_MAX_ATTEMPTS = 2;/,'le plafond de tentatives doit rester une constante lisible');
  assert.match(MODULE,/BUDGET MAXIMAL/,'le budget d’appels doit rester documenté dans le module client');
  assert.match(SLACK,/Le rapport local est conservé/,'le repli conserve toujours le rapport local');
  assert.match(SLACK,/' généré après une seconde tentative\.'/,'le succès après second essai doit être dit discrètement');
  console.log('PASS 15 · aucun journal sensible, routes proofread/assistant et contrats V232 intacts');
}

})().catch(e=>{console.error(e);process.exitCode=1});
