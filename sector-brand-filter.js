(function(){
  'use strict';
  var BRANDS=['Boulanger','Darty','Fnac','Conforama','Cuisinella','Carrefour'];
  var observer=null;
  function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
  function getDialog(){var search=document.getElementById('saSearch');return search&&search.closest('dialog.catalogDialog')}
  function getList(){var d=getDialog();return d&&d.querySelector('#saList')}
  function brandOf(card){var metas=card?card.querySelectorAll('.catalogMeta'):[];var label=metas.length?norm(metas[metas.length-1].textContent):norm(card&&card.textContent);for(var i=0;i<BRANDS.length;i++){if(label.indexOf(norm(BRANDS[i]))!==-1)return BRANDS[i]}return ''}
  function apply(){
    var d=getDialog(),box=document.getElementById('saBrandChooser'),list=getList();if(!d||!box||!list)return false;
    var select=box.querySelector('#saBrandFilter'),wanted=select?select.value:'all',visible=0;
    Array.prototype.slice.call(list.querySelectorAll('.catalogCard')).forEach(function(card){
      var brand=brandOf(card),show=wanted==='all'||brand===wanted;card.hidden=!show;card.style.display=show?'grid':'none';if(show)visible++;
    });
    var count=box.querySelector('.saBrandCount');if(count)count.textContent=visible+' magasin'+(visible>1?'s':'')+' affiché'+(visible>1?'s':'');
    return true;
  }
  function fire(input){try{input.dispatchEvent(new Event('change',{bubbles:true}))}catch(e){var evt=document.createEvent('Event');evt.initEvent('change',true,false);input.dispatchEvent(evt)}}
  function ensure(){
    var d=getDialog(),search=d&&d.querySelector('#saSearch'),list=d&&d.querySelector('#saList');if(!d||!search||!list)return false;
    if(!document.getElementById('saBrandChooserStyle')){var s=document.createElement('style');s.id='saBrandChooserStyle';s.textContent='#saBrandChooser{margin:14px 0 16px;padding:14px;border:1px solid #dbe7fb;border-radius:18px;background:rgba(255,255,255,.72)}#saBrandChooser .saBrandTitle{font-size:14px;font-weight:800;margin-bottom:9px}#saBrandChooser .saBrandRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}#saBrandChooser select{min-width:210px;flex:1}#saBrandChooser .saBrandCount{margin-top:8px;font-size:12px;color:#667085}@media(max-width:700px){#saBrandChooser .saBrandRow>*{width:100%}}';document.head.appendChild(s)}
    var box=document.getElementById('saBrandChooser');
    if(!box){box=document.createElement('section');box.id='saBrandChooser';box.innerHTML='<div class="saBrandTitle">Choisir mes magasins</div><div class="saBrandRow"><select id="saBrandFilter" aria-label="Filtrer les magasins par enseigne"><option value="all">Toutes les enseignes</option></select><button type="button" class="secondary" id="saBrandSelect">Sélectionner les visibles</button><button type="button" class="secondary" id="saBrandClear">Retirer les visibles</button></div><div class="saBrandCount">0 magasin affiché</div>';var tools=search.closest('.catalogTools')||search.parentNode;tools.parentNode.insertBefore(box,tools.nextSibling);var select=box.querySelector('#saBrandFilter');BRANDS.forEach(function(b){var o=document.createElement('option');o.value=b;o.textContent=b;select.appendChild(o)});select.addEventListener('change',apply);box.querySelector('#saBrandSelect').addEventListener('click',function(){Array.prototype.slice.call(list.querySelectorAll('.catalogCard')).forEach(function(card){if(card.hidden||card.style.display==='none')return;var input=card.querySelector('input[type=checkbox]');if(input&&!input.checked){input.checked=true;fire(input)}});apply()});box.querySelector('#saBrandClear').addEventListener('click',function(){Array.prototype.slice.call(list.querySelectorAll('.catalogCard')).forEach(function(card){if(card.hidden||card.style.display==='none')return;var input=card.querySelector('input[type=checkbox]');if(input&&input.checked){input.checked=false;fire(input)}});apply()})}
    if(!observer){observer=new MutationObserver(function(){requestAnimationFrame(apply)});observer.observe(list,{childList:true})}
    apply();return true;
  }
  function boot(){if(!ensure())setTimeout(boot,200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('button'):null;if(b&&/gérer mon secteur/i.test(b.textContent||''))setTimeout(ensure,80)},true);
})();