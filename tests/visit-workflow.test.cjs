const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const M=require('../store-runner-visit-model.js'),R=require('../reliability-core.js');
const original={schemaVersion:5,profile:{baseName:'Ville-Test A'},settings:{days:['Lundi']},stores:[{id:'x',enseigne:'Darty',ville:'Ville-Test A'},{id:'y',enseigne:'Fnac',ville:'Ville-Test A'}],notes:{x:'Conserver'},visits:{x:{history:['2026-09-01'],lastVisit:'2026-09-01'}},plan:{Lundi:[{id:'x'}]},appointments:[{id:'rdv',storeId:'x',date:'2026-09-14',time:'10:00'}],calendarEvents:[]};
const s=M.clone(original),id=M.start(s,'x');assert.equal(M.start(s,'x'),id);assert.notEqual(M.start(s,'y'),id);
M.editVisit(s,id,'preparation','mainGoal','Revoir les ruptures');M.editVisit(s,id,'check',0,true);M.editVisit(s,id,'step',null,2);
for(const p of Object.keys(M.SIX_P)){M.edit6P(s,id,p,0,'status','correct');M.edit6P(s,id,p,0,'comment','À vérifier')}
M.edit6P(s,id,'prix',0,'action','Corriger étiquette');M.edit6P(s,id,'prix',0,'owner','Alice');M.edit6P(s,id,'prix',0,'dueDate','2026-09-15');const a=M.actionFrom6P(s,id,'prix',0);assert.equal(M.actionFrom6P(s,id,'prix',0),a);
M.edit6P(s,id,'prix',0,'owner','Bob');assert.equal(s.businessV2.actions[0].owner,'Bob');M.editAction(s,a,'owner','Chloé');M.editAction(s,a,'dueDate','2026-09-16');assert.equal(M.getVisit(s,id).sixP.prix[0].owner,'Chloé');assert.equal(M.getVisit(s,id).sixP.prix[0].dueDate,'2026-09-16');M.edit6P(s,id,'prix',0,'dueDate','2026-09-17');assert.equal(s.businessV2.actions[0].dueDate,'2026-09-17');
const anomaly=M.addAnomaly(s,id);M.editAnomaly(s,id,anomaly,'Démo éteinte');const aa=M.actionFromAnomaly(s,id,anomaly);assert.equal(M.actionFromAnomaly(s,id,anomaly),aa);const second=M.addAnomaly(s,id);M.editAnomaly(s,id,second,'Autre démo éteinte');assert.notEqual(M.actionFromAnomaly(s,id,second),aa);assert.equal(s.businessV2.actions.length,3);
assert.throws(()=>M.complete(s,id,'2026-09-10'),/conclusion/);M.editVisit(s,id,'conclusion',null,'Priorités convenues');M.complete(s,id,'2026-09-10');M.complete(s,id,'2026-09-10');assert.deepEqual(s.visits.x.history,['2026-09-01','2026-09-10']);assert.equal(s.businessV2.actions.length,3);assert.throws(()=>M.editVisit(s,id,'step',null,0),/terminée/);
M.editAction(s,a,'owner','David');assert.equal(M.getVisit(s,id).sixP.prix[0].owner,'David');M.editAction(s,a,'status','done');assert(s.businessV2.actions[0].completedAt);M.editAction(s,a,'status','open');assert.equal(s.businessV2.actions[0].completedAt,null);
const sameDay=M.start(s,'x');assert.notEqual(sameDay,id);M.editVisit(s,sameDay,'conclusion',null,'Second passage');M.complete(s,sameDay,'2026-09-10');assert.equal(s.visits.x.history.length,2);
for(const key of ['profile','settings','notes','plan','appointments','calendarEvents'])assert.deepEqual(s[key],original[key]);R.validateState(s);
const bad=M.clone(s);bad.businessV2.actions[0].owner='désynchronisé';assert.throws(()=>R.validateState(bad),/désynchronisé/);assert.throws(()=>M.editAction(s,a,'dueDate','2026-02-30'));const duplicate=M.clone(s);duplicate.businessV2.actions.push(M.clone(duplicate.businessV2.actions[0]));assert.throws(()=>R.validateState(duplicate));
class DB{constructor(){this.map=new Map()}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
const db=new DB();global.state=s;global.__chefStorage=db;R.save(s);const bundle=R.capture();assert.deepEqual(bundle.state,s);const clean=new DB();R.persist(R.decode(JSON.stringify(bundle),original),clean);assert.deepEqual(R.load(clean),s);assert.equal(M.start(R.load(clean),'y'),s.businessV2.visits.find(v=>v.storeId==='y').id);assert.deepEqual(R.restore(bundle),s);assert.equal(R.decode(JSON.stringify(original),s).state.businessV2,undefined);
const removed=M.clone(s);removed.stores=removed.stores.filter(x=>x.id!=='x');removed.plan={};removed.appointments=[];R.validateState(removed);
const root=path.join(__dirname,'..'),ui=fs.readFileSync(path.join(root,'store-runner-visits.js'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
// Un simple `===` ne doit pas être confondu avec une réappropriation de fonction globale.
assert(!/window\.(renderAll|renderWeek|save|openStore|saveStore|saveAppointment|goTab|switchTab)\s*=(?!=)/.test(ui));assert(!/setInterval\s*\(/.test(ui));for(const asset of ['store-runner-visit-model.js','store-runner-visit-store.js','store-runner-visits.js','store-runner-visits.css'])assert(sw.split('const OPTIONAL_SHELL')[0].includes(asset));
assert(ui.includes('window.StoreRunnerVisits={start,openVisit,openHub,memoryFor,renderQuickMemory,activeVisitId:()=>activeId}'),'le module Visit doit publier un accès borné aux visites archivées, activeVisitId compris et rien de plus');
assert(ui.includes("data.visits.slice(0,3)"),'la fiche magasin doit commencer par les trois dernières visites');
assert(ui.includes("Voir tout l’historique"),'la fiche magasin doit permettre d’ouvrir tout l’historique');
assert(ui.includes("!['done','cancelled'].includes(a.status)"),'la mémoire terrain doit garder uniquement les actions encore ouvertes');
assert(ui.includes("quickMemoryObserver.observe(sheet,{attributes:true,attributeFilter:['class','aria-hidden']})"),'l’observation doit rester bornée à la feuille magasin');
assert(ui.includes("row.dataset.srHistoryVisit=v.id"),'chaque visite historique doit rester ouvrable dans son détail');
// Le modèle 6P reste testé ci-dessus pour la compatibilité des anciennes visites, mais le
// parcours terrain V170 ne doit plus l'exposer comme un second TeamHaven.
assert(ui.includes('const VISIBLE_STEPS=[3]'),'le parcours visible se réduit au seul carnet Terrain');
// L'onglet Suivi ne pouvait plus rien afficher : aucun chemin ne crée plus d'action.
assert(!/function actions\(/.test(ui),'la vue Suivi, devenue inatteignable, ne doit plus subsister');
assert(!ui.includes("STEP_LABELS={3:'Terrain',5:'Suivi'}"),'le libellé Suivi disparaît avec son onglet');
assert(/if\(VISIBLE_STEPS\.length<2\)return/.test(ui),'un onglet Terrain orphelin ne doit pas rester en haut de l’écran');
// La promesse précédente remplace l'onglet : lecture seule, famille par famille, jamais la visite courante.
assert(ui.includes('function lastPromise(v,family)'),'l’écran Terrain doit rappeler la promesse précédente');
assert(ui.includes("x.id!==v.id&&x.status==='completed'"),'la promesse doit venir d’une autre visite, déjà terminée');
assert(ui.includes("(M.reportOf(row)[family]||{}).training"),'la promesse reste cloisonnée par famille');
assert(!/lastPromise[\s\S]{0,400}?M\.edit/.test(ui),'le rappel de promesse ne doit rien écrire dans l’état');
assert(!ui.includes('Méthode 6P'),'la Méthode 6P n’est plus une étape visible');
assert(!ui.includes('function sixP('),'aucun formulaire 6P ne doit être rendu');
assert(ui.includes('Famille active : '),'le changement BLANC / BRUN doit donner un retour visuel persistant');
assert(ui.includes("'Note terrain '+family.toUpperCase()"),'une grande note terrain remplace les sous-options');
assert(ui.includes("'Prochain passage / formation '+family.toUpperCase()"),'le prochain passage reste directement saisissable');
assert(ui.includes('api.open(v.storeId)'),'les photos restent accessibles directement depuis la visite');
console.log('PASS: Visit/Action model legacy, carnet terrain V170, history compatibility, store memory surface, V2 backup/restore, invalid data and module ownership.');