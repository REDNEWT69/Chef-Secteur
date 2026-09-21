(function(){
  'use strict';
  /* Écran Historique : liste les jours enregistrés et donne accès à la suppression.
     Ce module n'est PAS un second moteur de suppression. Depuis la V231, il délègue
     intégralement à StoreRunnerVisits.deleteHistoryEntry, qui est le point d'entrée
     unique : ciblage par visitId, confirmation nommée, checkpoint, validation,
     sauvegarde atomique et recalcul de l'historique legacy y vivent une seule fois. */
  var historyObserver=null,observedHistoryList=null;
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function rows(){
    var out=[];
    try{
      for(var i=0;i<state.stores.length;i++){
        var s=state.stores[i],v=storeVisit(s),h=(v&&v.history)||[];
        for(var j=0;j<h.length;j++)out.push({date:h[j],store:s,index:j});
      }
    }catch(e){}
    out.sort(function(a,b){return String(b.date).localeCompare(String(a.date))});
    return out;
  }
  window.deleteRecordedVisit=function(storeId,date){
    try{
      var owner=window.StoreRunnerVisits;
      if(!owner||typeof owner.deleteHistoryEntry!=='function'){
        window.alert('Le module Visites n’est pas encore prêt : réessaie dans un instant.');
        return;
      }
      var result=owner.deleteHistoryEntry(storeId,date);
      if(result&&typeof result.then==='function')result.then(function(){setTimeout(render,20)},function(e){console.warn(e)});
    }catch(e){console.warn(e)}
  };
  function render(){
    var hk=document.getElementById('historyKpis'),list=document.getElementById('historyList');if(!hk||!list)return false;
    var r=rows(),today=(typeof todayISO==='function'?todayISO():new Date().toISOString().slice(0,10)),month=today.slice(0,7),todayCount=0,monthCount=0;
    for(var i=0;i<r.length;i++){if(r[i].date===today)todayCount++;if(String(r[i].date).indexOf(month)===0)monthCount++}
    hk.innerHTML='<div class="kpi"><b>'+r.length+'</b><span>visites enregistrées</span></div><div class="kpi"><b>'+monthCount+'</b><span>ce mois</span></div><div class="kpi"><b>'+todayCount+'</b><span>aujourd’hui</span></div><div class="kpi"><b>'+((typeof activeStores==='function'?activeStores():[]).length)+'</b><span>magasins actifs</span></div>';
    var h='';
    for(i=0;i<Math.min(r.length,60);i++){
      var x=r[i];
      h+='<div class="historyRow"><div class="historyDate">'+esc(x.date)+'</div><div class="historyMain"><b>'+esc(x.store.enseigne)+' · '+esc(x.store.ville)+'</b><small>'+esc(x.store.adresse||'')+'</small></div><span class="historyTag">Visité</span><button class="visitDeleteBtn" type="button" onclick="deleteRecordedVisit(\''+esc(x.store.id)+'\',\''+esc(x.date)+'\')">Supprimer</button></div>';
    }
    list.innerHTML=h||'<div class="empty">Aucune visite enregistrée pour le moment.</div>';
    return true;
  }
  function observeHistory(){
    var list=document.getElementById('historyList');if(!list)return false;
    if(historyObserver&&observedHistoryList===list)return true;
    if(historyObserver)historyObserver.disconnect();
    observedHistoryList=list;
    historyObserver=new MutationObserver(function(){
      var current=document.getElementById('historyList');
      if(!current)return;
      if(rows().length&&!current.querySelector('.visitDeleteBtn'))setTimeout(render,20);
    });
    historyObserver.observe(list,{childList:true,subtree:true});
    return true;
  }
  function install(){render();observeHistory();return !!observedHistoryList}
  var st=document.createElement('style');st.textContent='.historyRow{align-items:center}.visitDeleteBtn{border:1px solid #ffd0cb;background:#fff8f7;color:#b42318;border-radius:10px;padding:7px 9px;font-size:10.5px;font-weight:750;min-height:44px}.visitDeleteBtn:active{transform:scale(.98)}@media(max-width:650px){.historyRow{grid-template-columns:auto 1fr auto}.historyTag{display:none}.visitDeleteBtn{grid-column:3}}';document.head.appendChild(st);
  function boot(){
    if(install())return;
    [100,250,600,1200,2400].forEach(function(delay){setTimeout(install,delay)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('load',install,{once:true});
  window.addEventListener('focus',install);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)install()});
  document.addEventListener('store-runner:visit-deleted',function(){setTimeout(render,20)});
  document.addEventListener('store-runner:data-restored',function(){setTimeout(render,20)});
})();
