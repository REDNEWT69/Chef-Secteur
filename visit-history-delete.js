(function(){
  'use strict';
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
      var s=byId(storeId);if(!s)return;
      var v=storeVisit(s),h=(v.history||[]).slice();
      var idx=-1;for(var i=h.length-1;i>=0;i--)if(String(h[i])===String(date)){idx=i;break}
      if(idx<0)return;
      if(!confirm('Supprimer la visite de '+(s.enseigne||'ce magasin')+' '+(s.ville||'')+' du '+date+' ?'))return;
      h.splice(idx,1);v.history=h;v.lastVisit=h.length?h[h.length-1]:'';state.visits[storeId]=v;
      if(typeof save==='function')save();
      if(typeof renderAll==='function')renderAll();
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
  function install(){
    if(typeof window.renderHistory==='function'&&!window.__visitDeleteWrapped){
      var old=window.renderHistory;window.renderHistory=function(){try{old.apply(this,arguments)}catch(e){}return render()};window.__visitDeleteWrapped=true;
    }
    render();
    return !!window.__visitDeleteWrapped;
  }
  var st=document.createElement('style');st.textContent='.historyRow{align-items:center}.visitDeleteBtn{border:1px solid #ffd0cb;background:#fff8f7;color:#b42318;border-radius:10px;padding:7px 9px;font-size:10.5px;font-weight:750}.visitDeleteBtn:active{transform:scale(.98)}@media(max-width:650px){.historyRow{grid-template-columns:auto 1fr auto}.historyTag{display:none}.visitDeleteBtn{grid-column:3}}';document.head.appendChild(st);
  function boot(){
    if(install())return;
    [100,250,600,1200,2400].forEach(function(delay){setTimeout(install,delay)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
  window.addEventListener('load',install,{once:true});
  window.addEventListener('focus',install);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)install()});
})();
