/* Store Runner V192 — performance briefing + read-only assistant bridge. */
(function(root){
'use strict';

const MAX_CONTEXT_ROWS=12;
const PRIO_LABEL={P1:'Prio 1',P2:'Prio 2',watch:'À surveiller',nodata:'Pas de data'};
let visitObserver=null,quickObserver=null,renderQueued=false;

function norm(v){return String(v==null?'':v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function P(){return root.StoreRunnerPerformanceV190||null}
function db(){try{return root.__chefStorage||root.localStorage||null}catch(e){return null}}
function stores(){try{return Array.isArray(root.state&&root.state.stores)?root.state.stores:[]}catch(e){return[]}}
function visitsFor(storeId){const api=P();try{return api?api.completedVisitsFor(root.state,storeId):null}catch(e){return null}}
function pct(v){return v==null?'—':(Math.round(Number(v)*10)/10).toString().replace('.',',')+' %'}
function signed(v,unit){if(v==null)return'—';const n=Math.round(Math.abs(Number(v))*10)/10;return(Number(v)>0?'+':Number(v)<0?'−':'')+String(n).replace('.',',')+(unit||' pt')}
function euro(v){if(v==null)return'—';const n=Math.round(Number(v));return(n<0?'−':'')+Math.abs(n).toLocaleString('fr-FR')+' €'}
function storeLabel(r){const s=r&&r.store;return s?String((s.enseigne||r.retailer||'Magasin')+(s.ville?' '+s.ville:'')):String((r&&r.retailer||'Magasin')+((r&&r.site)?' '+r.site:''))}

function currentView(){
  const api=P(),storage=db();
  if(!api||!storage)return null;
  try{
    const snap=api.latestSnapshot(storage);if(!snap)return null;
    return api.dashboard(storage,{stores:stores(),week:snap.week,visitsFor:visitsFor});
  }catch(e){return null}
}
function compactWeekly(w){
  if(!w)return null;
  return {direction:w.direction||'indéterminée',delta:w.delta==null?null:w.delta,volatile:!!w.volatile,
    points:(w.points||[]).slice(-3).map(p=>({week:p.week,value:p.value}))};
}
function record(r,view){
  if(!r)return null;
  const so={};for(const k of Object.keys(r.sellOutWeeks||{}).sort())if(r.sellOutWeeks[k]!=null)so[k]=r.sellOutWeeks[k];
  return {
    storeId:r.storeId==null?null:String(r.storeId),store:storeLabel(r),retailer:r.retailer||'',site:r.site||'',
    priority:r.prio||null,priorityLabel:PRIO_LABEL[r.prio]||'Non classé',treated:!!r.treated,
    statusYtd:r.status&&r.status.label?r.status.label:null,pdmYtd:r.pdmYtd==null?null:r.pdmYtd,
    targetPdm:view&&view.targetPdm!=null?view.targetPdm:null,gapYtd:r.status&&r.status.gap!=null?r.status.gap:(r.deltaYtd==null?null:r.deltaYtd),
    underTarget:r.status?r.status.underTarget:null,evolutionYtd:r.evolYtd==null?null:r.evolYtd,
    weekly:compactWeekly(r.weekly),sellOutYtd:r.sellOutYtd==null?null:r.sellOutYtd,sellOutWeeks:so,
    lastVisit:r.visits&&r.visits.lastVisit?r.visits.lastVisit:null,visitCount:r.visits&&r.visits.count?Number(r.visits.count):0,
    mission:r.comment||''
  };
}
function actionableRows(view){return view?view.rows.filter(r=>r.storeId&&!r.treated&&(r.prio==='P1'||r.prio==='P2')):[]}
function contextRows(view){
  if(!view)return[];
  const out=[],seen=new Set();
  const add=r=>{if(!r||!r.storeId||seen.has(String(r.storeId))||out.length>=MAX_CONTEXT_ROWS)return;seen.add(String(r.storeId));out.push(record(r,view))};
  actionableRows(view).forEach(add);
  view.rows.filter(r=>r.storeId&&r.underTarget===true).forEach(add);
  return out;
}
function compactContext(context){
  const view=currentView();if(!view)return context||{};
  const out=context||{};
  out.performanceV192={
    week:view.week,targetPdm:view.targetPdm,
    counts:{P1:view.counts.P1,P2:view.counts.P2,watch:view.counts.watch,nodata:view.counts.nodata,unmatched:view.counts.unmatched},
    rules:{primaryStatus:'YTD',weeklyTrend:'indicative seulement',causality:'aucun lien de cause attribué aux visites'},
    stores:contextRows(view)
  };
  return out;
}
function findRequestedRow(text,view){
  if(!view)return null;const n=norm(text);let best=null,bestScore=0;
  for(const r of view.rows){
    if(!r.storeId)continue;
    const s=r.store||{},candidates=[s.ville,r.site,(s.enseigne||'')+' '+(s.ville||''),(r.retailer||'')+' '+(r.site||'')].map(norm).filter(Boolean);
    let score=0;
    for(const c of candidates){if(c.length>=4&&n.includes(c))score=Math.max(score,c.length+30);else{const toks=c.split(' ').filter(x=>x.length>3),hits=toks.filter(x=>n.includes(x)).length;if(hits)score=Math.max(score,hits*8)}}
    if(score>bestScore){best=r;bestScore=score}
  }
  return bestScore>=8?best:null;
}
function detailLine(r,view){
  const x=record(r,view),parts=[x.priorityLabel,x.treated?'traité '+view.week:'non traité'];
  if(x.pdmYtd!=null)parts.push('PDM YTD '+pct(x.pdmYtd));else parts.push('PDM YTD indisponible');
  if(x.gapYtd!=null)parts.push('écart cible '+signed(x.gapYtd));
  if(x.evolutionYtd!=null)parts.push('vs N-1 '+signed(x.evolutionYtd,' %'));
  if(x.weekly&&x.weekly.delta!=null)parts.push('tendance hebdo '+x.weekly.direction+' '+signed(x.weekly.delta)+' (indicative)');
  if(x.lastVisit)parts.push('dernière visite '+x.lastVisit);else parts.push('aucune visite terminée enregistrée');
  return x.store+' · '+parts.join(' · ');
}
function tipsFor(r,view){
  const x=record(r,view),tips=[];
  if(x.mission)tips.push('Mission du fichier : '+x.mission);
  if(x.underTarget===true)tips.push('Vérifier sur place visibilité, implantation, disponibilité et argumentaire vendeur autour de l’écart YTD.');
  if(x.evolutionYtd!=null&&x.evolutionYtd<0)tips.push('Creuser avec l’équipe ce qui peut expliquer la baisse vs N-1, sans conclure avant le constat terrain.');
  if(!x.lastVisit)tips.push('Faire un point terrain complet : aucune visite terminée récente n’est enregistrée.');
  if(x.weekly&&x.weekly.direction==='baisse')tips.push('La tendance hebdo est en baisse, à utiliser comme signal secondaire uniquement.');
  if(!tips.length)tips.push('Vérifier visibilité, disponibilité, implantation et retours vendeurs ; les données ne suffisent pas à diagnostiquer une cause.');
  return tips.slice(0,4);
}
function dayFromQuestion(n){
  const map=[['lundi','Lundi'],['mardi','Mardi'],['mercredi','Mercredi'],['jeudi','Jeudi'],['vendredi','Vendredi'],['samedi','Samedi']];
  for(const p of map)if(n.includes(p[0]))return p[1];
  if(n.includes('aujourd')){const d=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];return d[new Date().getDay()]}
  if(n.includes('demain')){const x=new Date();x.setDate(x.getDate()+1);const d=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];return d[x.getDay()]}
  return null;
}
function routePerformance(day,view){
  if(!day||!view)return[];const plan=(root.state&&root.state.plan&&root.state.plan[day])||[];
  const ids=new Set(plan.map(s=>String(s&&((s.storeId!=null&&s.storeId)||s.id)||'')));
  return view.rows.filter(r=>r.storeId&&ids.has(String(r.storeId)));
}
function answer(text){
  const view=currentView();if(!view)return null;const n=norm(text),specific=findRequestedRow(text,view);
  const asksTips=/(tip|tips|piste|conseil|prepar|prépar|travailler)/.test(n);
  const day=dayFromQuestion(n);
  if(day&&/(tournee|tournée|demain|aujourd|planning|piste|tip)/.test(n)){
    const rows=routePerformance(day,view);
    if(!rows.length)return'Aucune donnée performance rattachée aux magasins de la tournée '+day+'.';
    return'Brief performance '+day+' :\n'+rows.map(r=>'• '+detailLine(r,view)+(asksTips?'\n  ↳ '+tipsFor(r,view).join(' '):'')).join('\n');
  }
  if(specific){
    let out='Performance '+view.week+' — '+detailLine(specific,view);
    if(specific.comment)out+='\nMission : '+specific.comment;
    if(asksTips)out+='\nPistes à vérifier :\n'+tipsFor(specific,view).map(x=>'• '+x).join('\n');
    return out;
  }
  if(/\bp1\b/.test(n)&&/(rest|reste|restant|non traite|traiter)/.test(n)){
    const rows=view.rows.filter(r=>r.storeId&&r.prio==='P1'&&!r.treated);
    return rows.length?'P1 non traités '+view.week+' :\n'+rows.map(r=>'• '+detailLine(r,view)).join('\n'):'Aucun P1 non traité pour '+view.week+'.';
  }
  if(/sous la cible|sous cible|ecart.*cible/.test(n)){
    const rows=view.rows.filter(r=>r.storeId&&r.underTarget===true);
    return rows.length?'Magasins sous la cible YTD '+pct(view.targetPdm)+' :\n'+rows.slice(0,12).map(r=>'• '+detailLine(r,view)).join('\n'):'Aucun magasin rattaché sous la cible YTD dans le dernier import.';
  }
  if(/top\s*5|5 magasins|priorit|a travailler|à travailler/.test(n)){
    const rows=actionableRows(view).slice(0,5);
    return rows.length?'À travailler en priorité '+view.week+' :\n'+rows.map((r,i)=>(i+1)+'. '+detailLine(r,view)).join('\n'):'Aucun P1/P2 non traité rattaché dans le dernier import.';
  }
  return null;
}

function briefingForStore(storeId){
  const view=currentView();if(!view||storeId==null)return null;
  const r=view.rows.find(x=>String(x.storeId)===String(storeId));return r?record(r,view):null;
}
function ensureStyle(){
  if(!root.document||root.document.getElementById('sr-performance-v192-style'))return;
  const s=root.document.createElement('style');s.id='sr-performance-v192-style';
  s.textContent='.srPerfBrief192{margin:10px 0 14px;padding:12px;border:1px solid #dfe5ef;border-radius:16px;background:#f8faff;color:#1d2939}.srPerfBrief192Head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.srPerfBrief192Head b{font-size:13px}.srPerfBrief192Badge{display:inline-block;padding:3px 8px;border-radius:9px;font-size:10px;font-weight:850;background:#e8eefc;color:#213a8f}.srPerfBrief192Badge.p1{background:#fdecea;color:#a3261c}.srPerfBrief192Badge.p2{background:#fff5e6;color:#8a5200}.srPerfBrief192Grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.srPerfBrief192Cell{padding:7px 8px;border-radius:11px;background:#fff;border:1px solid #e5e9f0}.srPerfBrief192Cell span{display:block;font-size:9px;color:#667085}.srPerfBrief192Cell b{display:block;margin-top:2px;font-size:12px}.srPerfBrief192Note{margin:8px 0 0;font-size:11px;line-height:1.4;color:#475467;white-space:normal}@media(max-width:420px){.srPerfBrief192{padding:10px}.srPerfBrief192Grid{grid-template-columns:1fr 1fr}.srPerfBrief192Cell{min-width:0}.srPerfBrief192Cell b{overflow-wrap:anywhere}}';
  root.document.head.appendChild(s);
}
function createBriefing(storeId,mode){
  const x=briefingForStore(storeId);if(!x||!root.document)return null;ensureStyle();
  const section=root.document.createElement('section');section.className='srPerfBrief192';section.dataset.storeId=String(storeId);section.dataset.mode=mode||'visit';section.setAttribute('aria-label','Brief performance magasin');
  const head=root.document.createElement('div');head.className='srPerfBrief192Head';
  const badge=root.document.createElement('span');badge.className='srPerfBrief192Badge '+(x.priority==='P1'?'p1':x.priority==='P2'?'p2':'');badge.textContent=x.priorityLabel+(x.treated?' · traité':'');
  const title=root.document.createElement('b');title.textContent='Brief performance · '+x.store;head.append(badge,title);section.append(head);
  const grid=root.document.createElement('div');grid.className='srPerfBrief192Grid';
  const cell=(label,value)=>{const c=root.document.createElement('div');c.className='srPerfBrief192Cell';const a=root.document.createElement('span');a.textContent=label;const b=root.document.createElement('b');b.textContent=value;c.append(a,b);grid.append(c)};
  cell('PDM YTD',pct(x.pdmYtd));cell('Écart cible',x.gapYtd==null?'—':signed(x.gapYtd));
  cell('Évolution vs N-1',x.evolutionYtd==null?'—':signed(x.evolutionYtd,' %'));
  cell('Tendance hebdo',x.weekly&&x.weekly.delta!=null?(x.weekly.direction+' '+signed(x.weekly.delta)+' · indicative'):'—');
  section.append(grid);
  if(x.sellOutYtd!=null){const p=root.document.createElement('p');p.className='srPerfBrief192Note';p.textContent='Sell-out YTD : '+euro(x.sellOutYtd);section.append(p)}
  if(x.mission){const p=root.document.createElement('p');p.className='srPerfBrief192Note';p.textContent='Mission : '+x.mission;section.append(p)}
  const p=root.document.createElement('p');p.className='srPerfBrief192Note';p.textContent=x.lastVisit?'Dernière visite terminée : '+x.lastVisit:'Aucune visite terminée enregistrée';section.append(p);
  return section;
}
function activeVisitStoreId(){
  try{const id=root.StoreRunnerVisits&&typeof root.StoreRunnerVisits.activeVisitId==='function'?root.StoreRunnerVisits.activeVisitId():null;if(!id)return null;const rows=(root.state&&root.state.businessV2&&root.state.businessV2.visits)||[];const v=rows.find(x=>String(x.id)===String(id));return v&&v.storeId!=null?String(v.storeId):null}catch(e){return null}
}
function renderVisitBriefing(){
  if(!root.document)return false;const dialog=root.document.getElementById('srVisitDialog');if(!dialog||!dialog.open)return false;
  const intro=dialog.querySelector('.sr-terrainIntro');if(!intro)return false;const storeId=activeVisitStoreId();if(!storeId)return false;
  const old=dialog.querySelector('.srPerfBrief192');if(old&&old.dataset.storeId===String(storeId))return true;if(old)old.remove();
  const box=createBriefing(storeId,'visit');if(!box)return false;intro.insertAdjacentElement('beforebegin',box);return true;
}
function queueVisitRender(){if(renderQueued)return;renderQueued=true;const run=()=>{renderQueued=false;renderVisitBriefing()};if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(run);else setTimeout(run,0)}
function attachVisitObserver(){
  if(!root.document||visitObserver)return false;const dialog=root.document.getElementById('srVisitDialog');if(!dialog)return false;
  visitObserver=new MutationObserver(queueVisitRender);visitObserver.observe(dialog,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});queueVisitRender();return true;
}
function attachQuickObserver(){
  if(!root.document||quickObserver)return false;const sheet=root.document.getElementById('storeQuickSheet');if(!sheet)return false;
  const refresh=()=>{try{if(root.StoreRunnerPerformanceUIV190&&typeof root.StoreRunnerPerformanceUIV190.renderStoreCard==='function')root.StoreRunnerPerformanceUIV190.renderStoreCard()}catch(e){}};
  quickObserver=new MutationObserver(refresh);quickObserver.observe(sheet,{attributes:true,subtree:true,attributeFilter:['class','aria-hidden','data-sr-start']});refresh();return true;
}
function install(){ensureStyle();attachVisitObserver();attachQuickObserver();}
function scheduleInstall(){setTimeout(install,0);setTimeout(install,350);setTimeout(install,1200)}

root.StoreRunnerPerformanceV192={answer,compactContext,briefingForStore,createBriefing,renderVisitBriefing,install,contextRows};
if(typeof root.storeRunnerRegisterAssistantResolver==='function')root.storeRunnerRegisterAssistantResolver(answer,20);
if(typeof root.storeRunnerRegisterAssistantContextTransform==='function')root.storeRunnerRegisterAssistantContextTransform(compactContext,70);
if(typeof module!=='undefined'&&module.exports)module.exports=root.StoreRunnerPerformanceV192;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',scheduleInstall,{once:true});else scheduleInstall();root.document.addEventListener('store-runner:data-restored',scheduleInstall);root.document.addEventListener('store-runner:planning-updated',queueVisitRender)}
})(typeof window!=='undefined'?window:globalThis);
