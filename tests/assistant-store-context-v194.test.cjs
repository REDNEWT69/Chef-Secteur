const assert=require('node:assert/strict');
const path=require('node:path');

const stores=[];
for(let i=1;i<=56;i++)stores.push({id:'s'+i,enseigne:i===1?'Boulanger':'Darty',ville:i===1?'Test-Nord':'Ville '+i,dept:'69',freq:'30j',products:['TV','BLANC']});

const visit={
  completedDate:'2026-09-10',
  conclusion:'Le rayon reste perfectible et la visibilité Samsung doit être renforcée.',
  preparation:{marketShare:'PDM 31,4 %'},
  arrival:{anomalies:[{family:'brun',text:'OLED Samsung absent de la tête de gondole'}]},
  sixP:{
    place:[{family:'brun',status:'correct',comment:'PDL 24 %',action:'Revoir la représentation TV'}],
    promotion:[{family:'blanc',status:'opportunity',comment:'Peu de mise en avant lavage',action:'Proposer une tête de gondole'}],
    people:[{family:'both',status:'ok',comment:'Équipe disponible',action:''}]
  },
  report:{shared:{context:'Magasin à potentiel'},blanc:{team:'À former sur lavage',actions:'Faire un point gamme'},brun:{team:'Bon contact',actions:'Renforcer OLED'}}
};

const actions=[{id:'a1',storeId:'s1',category:'merch',description:'Revoir implantation OLED',owner:'Responsable test',dueDate:'2026-09-30',status:'open'}];

global.window={
  state:{stores,businessV2:{actions}},
  StoreRunnerPerformanceV192:{
    briefingForStore(id){
      if(String(id)==='s1')return {storeId:'s1',priority:'P1',priorityLabel:'Prio 1',treated:false,statusYtd:'Sous la cible YTD',pdmYtd:31.4,targetPdm:42.5,gapYtd:-11.1,underTarget:true,evolutionYtd:-4.2,weekly:{direction:'baisse',delta:-2.1,volatile:false},sellOutYtd:12400,visitCount:2,mission:'Renforcer visibilité OLED'};
      if(/^s([2-9]|1[0-2])$/.test(String(id)))return {storeId:String(id),priority:'P2',priorityLabel:'Prio 2',treated:false,pdmYtd:39,targetPdm:42.5,gapYtd:-3.5,underTarget:true,evolutionYtd:-1,weekly:{direction:'stable',delta:0.2,volatile:false},sellOutYtd:5000,mission:'Suivi courant'};
      return null;
    }
  },
  StoreRunnerSectorPilotage:{
    compute(){return{rows:[{store:stores[0],visit,lastVisit:'2026-09-10',age:6,late:0,pdm:31.4,pdl:24,compliance:58.3,rated6P:12,alerts:3,openActions:1,priority:72,level:'red',reasons:['PDM parmi les plus basses','Représentation marque faible','3 points terrain à suivre']}]}}
  }
};
let resolver=null,transform=null;
window.storeRunnerRegisterAssistantResolver=(fn,priority)=>{resolver={fn,priority};return true};
window.storeRunnerRegisterAssistantContextTransform=(fn,priority)=>{transform={fn,priority};return true};

delete require.cache[path.resolve(__dirname,'../ai-context-limit.js')];
require('../ai-context-limit.js');

assert.equal(resolver.priority,10,'le briefing magasin enrichi doit passer avant le resolver performance V192');
assert.equal(transform.priority,100,'le garde-fou de contexte reste le dernier transform');

const performanceStores=[];
for(let i=1;i<=12;i++)performanceStores.push({storeId:'s'+i,store:i===1?'Boulanger Test-Nord':'Darty Ville '+i,priority:i===1?'P1':'P2',pdmYtd:i===1?31.4:39,targetPdm:42.5,gapYtd:i===1?-11.1:-3.5,underTarget:true,evolutionYtd:-1,sellOutYtd:5000,mission:'Mission test'});

const sourceContext={
  today:'2026-09-17',
  stores,
  plan:{Lundi:[stores[0],stores[1]],Mardi:[stores[2]]},
  calendarEvents:[{title:'privé'}],
  instructions:'Réponds comme un chef de secteur.',
  businessV2:{openActions:actions,recentVisits:[],activeDrafts:[]},
  performanceV192:{week:'W38',targetPdm:42.5,counts:{P1:1,P2:11,watch:0,nodata:0,unmatched:0},rules:{primaryStatus:'YTD'},stores:performanceStores}
};

const question='Que dois-je travailler chez Boulanger Test-Nord ?';
const context=window.storeRunnerLimitAssistantContext(sourceContext,question);

assert.ok(context.stores.length>0&&context.stores.length<=12,'le contexte online doit être ciblé et borné');
assert.equal(context.contextMeta.totalStores,56,'le modèle doit savoir que le secteur complet est plus large que le sous-ensemble envoyé');
assert.equal(context.contextMeta.specificStore,'s1');
assert.equal(context.stores[0].id,'s1','le magasin explicitement demandé doit passer en premier');
assert.equal(context.calendarEvents.length,0,'les détails Google Agenda restent privés');
assert.equal(context.stores[0].performance.pdmYtd,31.4);
assert.equal(context.stores[0].performance.targetPdm,42.5);
assert.equal(context.stores[0].performance.gapYtd,-11.1);
assert.equal(context.stores[0].terrain.pdl,24);
assert.equal(context.stores[0].terrain.compliance6P,58.3);
assert.equal(context.stores[0].terrain.alerts,3);
assert.equal(context.stores[0].terrain.openActions,1);
assert.match(context.stores[0].terrain.sixPToWork[0].action,/représentation TV/i);
assert.match(context.stores[0].terrain.anomalies[0].text,/OLED Samsung absent/i);
assert.match(context.stores[0].terrain.actions[0].description,/implantation OLED/i);
assert.match(context.stores[0].terrain.conclusion,/visibilité Samsung/i);
assert.match(context.stores[0].terrain.lastReport.sharedContext,/potentiel/i);
assert.ok(context.performanceV192,'le bloc performance reste présent pour le Worker compatible');
assert.equal(context.performanceV192.week,'W38');
assert.equal(context.performanceV192.stores,undefined,'les lignes performance ne doivent pas être dupliquées dans le contexte global');
assert.match(context.instructions,/sous-ensemble ciblé/i);
assert.match(context.instructions,/YTD principal/i);
assert.ok(!context.plan.Lundi[0].performance,'le planning reste compact et ne duplique pas le contexte riche');
assert.ok(JSON.stringify(context).length<=7200,'le contexte sérialisé doit rester sous le budget V196');
assert.ok(context.stores.length<56,'les 56 magasins ne doivent plus partir aveuglément vers le modèle');

const generic=window.storeRunnerLimitAssistantContext(sourceContext,'Quels magasins sont sous la cible ?');
assert.ok(generic.stores.length<=12);
assert.ok(JSON.stringify(generic).length<=7200);
assert.equal(generic.contextMeta.specificStore,null);

const local=window.storeRunnerLocalStoreIntelligence(question);
assert.match(local,/PDM YTD 31,4 %/);
assert.match(local,/cible 42,5 %/);
assert.match(local,/représentation\/PDL 24 %/);
assert.match(local,/conformité 6P 58,3 %/);
assert.match(local,/Revoir la représentation TV/);
assert.match(local,/Revoir implantation OLED/);
assert.match(local,/Dernier compte rendu/);

const workerSource=require('node:fs').readFileSync(path.resolve(__dirname,'../workers/chef-secteur-ai.js'),'utf8');
assert.match(workerSource,/performanceV192:\s*context\.performanceV192/,'le Worker conserve performanceV192');
assert.match(workerSource,/businessV2:\s*context\.businessV2/,'le Worker conserve businessV2');
assert.match(workerSource,/source de vérité sur les magasins/i,'le prompt Worker doit privilégier les données Store Runner');

console.log('assistant-store-context-v196: OK · 56 magasins source · contexte ciblé <= 7 200 caractères · magasin demandé riche');
