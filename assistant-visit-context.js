/* Read-only assistant bridge for Visit / Action V2. */
(function(root){
'use strict';

function norm(v){return String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function todayISO(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function business(){try{const b=root.state&&root.state.businessV2;return b&&Array.isArray(b.visits)&&Array.isArray(b.actions)?b:null}catch(e){return null}}
function storeName(storeId){
  try{
    const id=String(storeId),live=(root.state.stores||[]).find(s=>String(s.id)===id),snap=(business()&&business().storeSnapshots||{})[id],s=live||snap;
    return s?String((s.enseigne||'Magasin')+(s.ville?' '+s.ville:'')):'Magasin archivé';
  }catch(e){return'Magasin'}
}
function dateLabel(iso){if(!iso)return'Sans échéance';const p=String(iso).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(iso)}
function draftRows(){const b=business();if(!b)return[];return b.visits.filter(v=>v.status==='draft').slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))}
function openActions(){const b=business();if(!b)return[];return b.actions.filter(a=>a.status==='open'||a.status==='in_progress').slice().sort((a,b)=>{
  const ad=a.dueDate||'9999-12-31',bd=b.dueDate||'9999-12-31';return ad.localeCompare(bd)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
})}
function recentVisits(){const b=business();if(!b)return[];return b.visits.filter(v=>v.status==='completed').slice().sort((a,b)=>String(b.completedAt||b.updatedAt||'').localeCompare(String(a.completedAt||a.updatedAt||'')))}
function compactContext(context){
  const b=business();if(!b)return context||{};
  const out=context||{},today=todayISO();
  out.businessV2={
    activeDrafts:draftRows().slice(0,8).map(v=>({id:v.id,storeId:v.storeId,store:storeName(v.storeId),step:v.step,updatedAt:v.updatedAt||null})),
    openActions:openActions().slice(0,20).map(a=>({id:a.id,storeId:a.storeId,store:storeName(a.storeId),category:a.category||'',description:a.description||'',owner:a.owner||'',dueDate:a.dueDate||'',status:a.status,overdue:!!(a.dueDate&&a.dueDate<today)})),
    recentVisits:recentVisits().slice(0,8).map(v=>({id:v.id,storeId:v.storeId,store:storeName(v.storeId),completedDate:v.completedDate||null,conclusion:v.conclusion||''}))
  };
  return out;
}
function answer(text){
  const b=business();if(!b)return null;const n=norm(text),today=todayISO();
  const asksDraft=/(visite|visites).*(en cours|brouillon|reprendre|commence|commencee)|(?:en cours|reprendre).*(visite|visites)/.test(n);
  if(asksDraft){const rows=draftRows();if(!rows.length)return'Aucune visite détaillée en cours.';return'Visites en cours :\n'+rows.slice(0,8).map(v=>'• '+storeName(v.storeId)+' · étape '+(Number(v.step||0)+1)+'/5').join('\n')}
  const asksAction=/\baction|plan d action|echeance/.test(n);
  if(asksAction){let rows=openActions();const overdue=/retard|depasse|echeance depassee/.test(n);if(overdue)rows=rows.filter(a=>a.dueDate&&a.dueDate<today);if(!rows.length)return overdue?'Aucune action Visit/6P en retard.':'Aucune action Visit/6P ouverte.';const heading=overdue?'Actions en retard :':'Actions ouvertes :';return heading+'\n'+rows.slice(0,8).map(a=>'• '+storeName(a.storeId)+' · '+(a.description||a.category||'Action')+' · '+(a.owner||'responsable à définir')+' · '+dateLabel(a.dueDate)).join('\n')}
  if(/dernier.*(compte rendu|visite detaillee)|derniere.*(visite detaillee|visite 6p)/.test(n)){const v=recentVisits()[0];return v?'Dernière visite détaillée : '+storeName(v.storeId)+' · '+dateLabel(v.completedDate)+(v.conclusion?' · '+v.conclusion:''):'Aucune visite détaillée terminée.'}
  return null;
}

root.storeRunnerVisitAssistantContext=compactContext;
root.storeRunnerVisitAssistantAnswer=answer;
if(typeof root.storeRunnerRegisterAssistantResolver==='function')root.storeRunnerRegisterAssistantResolver(answer,10);
if(typeof root.storeRunnerRegisterAssistantContextTransform==='function')root.storeRunnerRegisterAssistantContextTransform(compactContext,60);

const api={answer,compactContext,draftRows,openActions,recentVisits};
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
