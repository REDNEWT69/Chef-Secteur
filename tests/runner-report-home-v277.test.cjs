const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Home=require('../home-refresh-v2.js');
const B=require('../runner-behavior.js');
const M=require('../store-runner-visit-model.js');

const TODAY='2026-10-07',NOW=Date.UTC(2026,9,7,8);
const stores=[{id:'a',enseigne:'Darty',ville:'Alpha'},{id:'b',enseigne:'Boulanger',ville:'Beta'}];
const fresh=()=>({stores,visits:{},businessV2:M.empty()});
const env={model:M,behavior:B};
function complete(s,store,date,text){
  const id=M.start(s,store);
  M.editReport(s,id,'brun','training',text);
  M.editVisit(s,id,'conclusion',null,'Visite terrain enregistrée');
  M.complete(s,id,date);
  return id;
}
const current={total:1,done:0,finished:false,current:stores[0]};
const memory=(s,context={mode:'today'},tour=current)=>Home.upcomingReportRemarks(s,context,tour,env);

// La prochaine visite relit son propre historique, même ancien ; aucune donnée d'un autre magasin.
{
  const s=fresh();
  complete(s,'a','2026-08-01','Formation Neo QLED à prévoir avec Julie.');
  complete(s,'b','2026-10-06','Formation OLED à prévoir avec Marc.');
  const before=JSON.stringify(s),result=memory(s);
  assert.equal(result.storeId,'a');
  assert.match(result.lines[0].text,/2026-08-01.*Formation Neo QLED à prévoir avec Julie\./);
  assert.doesNotMatch(result.lines[0].text,/Marc/);
  assert.equal(JSON.stringify(s),before,'la lecture n’écrit rien');
  const next=memory(s,{mode:'next',next:{route:[stores[1],stores[0]]}});
  assert.equal(next.storeId,'b','le premier magasin de la prochaine tournée remplace le courant du jour');
  assert.match(next.lines[0].text,/Marc/);
  assert.equal(memory(s,{mode:'today'},{...current,finished:true}),null,'pas de prochaine visite inventée');
  assert.equal(memory(s,{mode:'next',next:{route:[]}}),null,'aucun repli sur une tournée différente');
  assert.equal(memory(fresh()),null,'historique absent : silence');
}

// Le statut vivant d’une Action prime sur le rapport source, sans inventer une clôture textuelle.
{
  const s=fresh(),id=M.start(s,'a');
  M.edit6P(s,id,'produit',1,'action','Vérifier le stock du QE55S95F.');
  M.editVisit(s,id,'conclusion',null,'Visite terrain enregistrée');M.complete(s,id,'2026-08-01');
  const action=s.businessV2.actions[0];
  assert.match(memory(s).lines[0].text,/Action ouverte.*QE55S95F/);
  M.editAction(s,action.id,'status','done');
  assert.equal(memory(s),null,'une action terminée ne revient pas dans le point du jour');
}

// Les citations sont complètes : le plafond de 140 caractères des constats V276 ne les coupe pas.
{
  const quote='Formation · noté le 2026-08-01 : « '+('Formation prévue avec l’équipe. ').repeat(5)+'Ne pas former avant livraison. »';
  assert.ok(quote.length>140&&quote.length<360);
  const item={id:'memory:visit:training',kind:'report-memory',severity:1,tone:'neutral',text:quote};
  const rem=B.remarks({items:[{id:'count',kind:'overdue-action',severity:3,text:'2 actions en retard.'},item]});
  assert.deepEqual(rem.lines.map(x=>x.text),[quote],'la citation métier passe avant le compteur générique');
  const brief=B.brief({mode:'today',tour:{total:1,done:0,finished:false,next:{key:'a',label:'Darty Alpha'}},remarks:{store:'Darty Alpha',storeId:'a',lines:rem.lines},attention:{kind:'action-overdue',key:'a',label:'Darty Alpha',reason:'action échue'}});
  assert.equal(brief.lines.length,2,'pas de troisième ligne répétant le même magasin');
  assert.equal(brief.lines[1].text,'Darty Alpha · '+quote);
  assert.equal(brief.lines[1].action,null,'un seul accès fiche pour ce magasin');
  assert.match(brief.lines[1].text,/Ne pas former avant livraison\. »$/,'la réserve de fin reste visible');
  const alone=B.brief({remarks:{store:'Darty Alpha',storeId:'a',lines:rem.lines}});
  assert.deepEqual(alone.lines[0].action,{type:'open-store',storeId:'a'},'un rappel isolé mène à sa fiche source');
  const tooLong={...item,text:quote+'x'.repeat(361)};
  assert.deepEqual(B.remarks({items:[tooLong]}).lines,[],'citation trop longue : omission, jamais troncature');
  const dup=B.remarks({items:[item,{...item,id:'duplicate'}, {...item,id:'second',text:'Autre sujet explicitement noté.'}]});
  assert.equal(dup.lines.length,2,'citations identiques dédupliquées, sujets distincts autorisés');
}

// La mémoire retire le décor aussi lors d’un rerender ; les faits métier V276 restent prioritaires.
{
  const facts={date:TODAY,workday:true,mode:'today',tour:{total:1,done:0,finished:false}};
  const input={surface:'home',trigger:'arrive',now:NOW,view:{state:'neutral'},facts};
  const registry=B.defaultRegistry();
  assert.equal(B.decide(input,registry).id,'day.ready','absence de mémoire : comportement V276 conservé');
  const withMemory={...facts,reportMemoryKey:'a|visit-1|Formation à prévoir'};
  assert.equal(B.decide({...input,facts:withMemory},registry),null,'mémoire utile : aucun décor à l’arrivée');
  assert.equal(B.decide({...input,trigger:'rerender',facts:withMemory},registry),null);
  assert.notEqual(B.signature(facts),B.signature(withMemory),'une ligne préexistante devient périmée dès que la mémoire apparaît');
  assert.notEqual(B.signature(withMemory),B.signature({...withMemory,reportMemoryKey:'a|visit-2|Formation faite'}));
  assert.equal(B.decide({...input,trigger:'rerender',facts:{...withMemory,tour:{total:1,done:1,finished:true}}},registry).id,'tour.finished');
  const home=fs.readFileSync(path.join(__dirname,'..','home-refresh-v2.js'),'utf8');
  assert.match(home,/facts\.remarks=upcomingReportRemarks\(state,context,tour\)\|\|lastVisitRemarks\(now\)/,'mémoire prochaine visite avant le récent rapport');
  assert.match(home,/homeFacts=\{tour,context,catalog\};scheduleContextBoundary\(today\);dropStaleLine\(\)/,'revalidation au rerender, même sans remonter Runner');
}
console.log('PASS: V277 — mémoire du prochain magasin, citations complètes, statuts vivants et priorité métier sur le décor.');
