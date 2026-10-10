/* Store Runner V289 — locally owned professional events and planning exclusion.
   Events are deliberately independent of Google Calendar and store appointments.
   One explicit date-range block is shared with the existing planning engines. */
(function(root){
'use strict';
const KINDS=['Séminaire','Formation interne','Réunion','Salon','Déplacement professionnel','Congé / absence','Autre'];
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const DAY_NAMES=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
function validDate(s){
  if(!DATE.test(String(s||'')))return false;
  const d=new Date(s+'T12:00:00Z');
  return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===s;
}
function addDay(s,n){
  if(!validDate(s))return '';
  const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}
function rows(state){return Array.isArray(state&&state.professionalEvents)?state.professionalEvents:[]}
function normalize(value){
  const e=value&&typeof value==='object'?value:{};
  const title=String(e.title||'').trim().slice(0,160);
  const kind=KINDS.includes(e.kind)?e.kind:'Autre';
  const startDate=String(e.startDate||'').slice(0,10),endDate=String(e.endDate||e.startDate||'').slice(0,10);
  if(!title||!validDate(startDate)||!validDate(endDate)||endDate<startDate)throw Error('Indique un intitulé et une période de dates valide.');
  return {id:String(e.id||'').slice(0,100),kind,title,startDate,endDate,location:String(e.location||'').trim().slice(0,160),address:String(e.address||'').trim().slice(0,350),notes:String(e.notes||'').trim().slice(0,3000),reminder:e.reminder!==false};
}
function covering(date,state){return validDate(date)?rows(state).filter(e=>e&&validDate(e.startDate)&&validDate(e.endDate)&&e.startDate<=date&&date<=e.endDate):[]}
function coversDate(date,state){return covering(date,state).length>0}
function html(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]))}
function stateNow(){return root.state}
function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function eventDateSummary(e){return e.startDate===e.endDate?e.startDate:e.startDate+' → '+e.endDate}
function mapLink(e){const q=[e.address,e.location].filter(Boolean).join(', ');return q?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q):''}
function plannedConflicts(e,state){
  const a=[];
  for(const appointment of state&&state.appointments||[])if(appointment&&appointment.date>=e.startDate&&appointment.date<=e.endDate)a.push('rendez-vous');
  const iso=String(state&&state.settings&&state.settings.weekDate||'').slice(0,10);
  if(validDate(iso)){
    const d=new Date(iso+'T12:00:00Z'),day=d.getUTCDay()||7;
    const monday=addDay(iso,1-day);
    const plan=state&&state.plan||{};
    for(let i=0;i<6;i++){
      const date=addDay(monday,i),label=DAY_NAMES[(i+1)%7],stores=plan[label]||[];
      if(date>=e.startDate&&date<=e.endDate&&stores.length)a.push(stores.length+' visite(s) le '+date);
    }
  }
  return a;
}
function persist(next){
  const state=stateNow();if(!state)throw Error('Données du secteur indisponibles.');
  const old=state.professionalEvents;
  state.professionalEvents=next;
  try{
    if(typeof root.save!=='function')throw Error('Sauvegarde indisponible.');
    root.save();
  }catch(e){state.professionalEvents=old;throw e}
  try{root.document.dispatchEvent(new CustomEvent('store-runner:professional-events-updated'))}catch(e){}
  refresh();
}
function upsert(value){
  const event=normalize(value),state=stateNow();
  event.id=event.id||'professional-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  const next=rows(state).filter(e=>e&&e.id!==event.id);
  next.push(event);persist(next);return {event,conflicts:plannedConflicts(event,state)};
}
function remove(id){const state=stateNow(),before=rows(state),next=before.filter(e=>e&&e.id!==id);if(next.length===before.length)return false;persist(next);return true}
function css(){
  if(root.document.getElementById('srProEventStyle'))return;
  const el=root.document.createElement('style');el.id='srProEventStyle';
  el.textContent='.srProSection{padding:14px;border-radius:16px;border:1px solid var(--line,#e5e7eb);background:var(--card,#fff);margin:0 0 16px}.srProHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.srProHead h3{font-size:16px;margin:0}.srProNote{font-size:12px;color:var(--muted,#667085);margin:7px 0}.srProRow{padding:10px 0;border-top:1px solid var(--line,#e5e7eb);font-size:13px}.srProRow:first-child{border-top:0}.srProRow strong{display:block;font-size:14px}.srProMeta{color:var(--muted,#667085);font-size:12px;margin-top:3px}.srProActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px}.srProActions button,.srProActions a{font:inherit;font-size:12px;padding:6px 9px;border-radius:9px;border:1px solid var(--line,#ddd);background:var(--card,#fff);color:var(--ink,#111);text-decoration:none}.srProAlert{padding:10px 12px;border-left:3px solid #d88f21;border-radius:10px;background:var(--card,#fff);font-size:13px;margin:10px 0}.srProWarning{color:#ad5429;font-weight:650}.srProDialog{border:1px solid var(--line,#ddd);border-radius:18px;max-height:90dvh;overflow:auto;width:min(92vw,480px);padding:20px;background:var(--card,#fff);color:var(--ink,#111)}.srProDialog::backdrop{background:#15223ca8}.srProDialog h3{margin:0 0 10px}.srProFields{display:grid;gap:10px}.srProFields label{display:grid;gap:4px;font-size:13px}.srProFields input,.srProFields select,.srProFields textarea{width:100%;box-sizing:border-box;min-height:42px;padding:8px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--card,#fff);color:var(--ink,#111)}.srProDates{display:grid;grid-template-columns:1fr 1fr;gap:10px}.srProActionsBar{display:flex;justify-content:flex-end;gap:10px;margin-top:15px}.srProActionsBar button{padding:10px 14px}.srProFormError{color:#b42318;font-weight:650;margin-top:10px;font-size:12px}';
  root.document.head.appendChild(el);
}
function makeUi(){
  const doc=root.document,panel=doc.querySelector('#appointmentsPanel .card');
  if(!panel)return false;
  css();
  if(!doc.getElementById('srProfessionalEvents')){
    const container=doc.createElement('section');container.id='srProfessionalEvents';container.className='srProSection';
    container.innerHTML='<div class="srProHead"><h3>📅 Événements professionnels</h3><button class="secondary" type="button" id="srProAdd">+ Événement</button></div><p class="srProNote">Séminaires, réunions, formations et autres indisponibilités. Les dates sont exclues des tournées automatiques.</p><div id="srProList"></div>';
    panel.insertBefore(container,panel.firstChild);
    container.querySelector('#srProAdd').addEventListener('click',()=>openEditor());
    container.querySelector('#srProList').addEventListener('click',e=>{
      const edit=e.target.closest('[data-sr-pro-edit]'),del=e.target.closest('[data-sr-pro-delete]'),calendar=e.target.closest('[data-sr-pro-calendar]');
      if(calendar){const item=rows(stateNow()).find(x=>x.id===calendar.dataset.srProCalendar);if(item)exportCalendar(item).catch(err=>root.alert('Export calendrier impossible : '+String(err.message||err)));return}
      if(edit){const item=rows(stateNow()).find(x=>x.id===edit.dataset.srProEdit);if(item)openEditor(item)}
      if(del){const item=rows(stateNow()).find(x=>x.id===del.dataset.srProDelete);
        if(item&&root.confirm('Supprimer cet événement professionnel ?'))remove(item.id)}
    });
  }
  if(!doc.getElementById('srProHome')){
    const home=doc.querySelector('#homePanel .homeHero');if(home){const e=doc.createElement('div');e.id='srProHome';home.insertAdjacentElement('afterend',e)}
  }
  if(!doc.getElementById('srProPlanning')){
    const title=doc.getElementById('planningProMonth')||doc.querySelector('#planPanel .applePlanTitle');if(title){const e=doc.createElement('div');e.id='srProPlanning';title.insertAdjacentElement('afterend',e)}
  }
  return true;
}
/* Export manuel, jamais d'écriture cachée dans les agendas externes. */
function icsEscape(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/\r\n|\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')}
function foldICal(line){
  const chunks=[];let buf='',bytes=0;
  for(const ch of line){
    const width=encodeURIComponent(ch).replace(/%[A-F0-9]{2}/gi,'x').length;
    if(bytes+width>70){chunks.push(buf);buf=' ';bytes=1}
    buf+=ch;bytes+=width;
  }
  chunks.push(buf);return chunks.join('\r\n');
}
function toICS(value){
  const e=normalize(value),start=e.startDate.replace(/-/g,''),end=addDay(e.endDate,1).replace(/-/g,'');
  const uid='sr-'+String(e.id||e.startDate+'-'+e.title).replace(/[^a-z0-9_-]/gi,'').slice(0,100)+'@store-runner.fr';
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const location=[e.address,e.location].filter(Boolean).join(', '),description=[e.kind,e.notes].filter(Boolean).join('\n');
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Store Runner//Evenements professionnels//FR','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:'+uid,'DTSTAMP:'+stamp,'DTSTART;VALUE=DATE:'+start,'DTEND;VALUE=DATE:'+end,
    'SUMMARY:'+icsEscape(e.title),'LOCATION:'+icsEscape(location),'DESCRIPTION:'+icsEscape(description),
    'END:VEVENT','END:VCALENDAR'];
  return lines.map(foldICal).join('\r\n')+'\r\n';
}
async function exportCalendar(e){
  const content=toICS(e),name='store-runner-'+e.startDate+'.ics',file=new root.File([content],name,{type:'text/calendar'});
  const nav=root.navigator||{};
  if(nav.share&&(!nav.canShare||nav.canShare({files:[file]}))){
    try{await nav.share({files:[file],title:e.title});return 'partage'}catch(err){if(err&&err.name==='AbortError')return 'annulé'}
  }
  const url=root.URL.createObjectURL(file),a=root.document.createElement('a');
  a.href=url;a.download=name;root.document.body.appendChild(a);a.click();a.remove();
  root.setTimeout(()=>root.URL.revokeObjectURL(url),8000);
  return 'fichier';
}
function openEditor(item){
  makeUi();const doc=root.document,old=doc.getElementById('srProDialog');if(old)old.remove();
  const dlg=doc.createElement('dialog');dlg.id='srProDialog';dlg.className='srProDialog';
  const e=item||{},date=today();
  dlg.innerHTML='<form id="srProForm"><h3>'+html(item?'Modifier':'Ajouter')+' un événement professionnel</h3><div class="srProFields">'+
    '<label>Type<select name="kind">'+KINDS.map(v=>'<option value="'+html(v)+'"'+(v===(e.kind||'Séminaire')?' selected':'')+'>'+html(v)+'</option>').join('')+'</select></label>'+
    '<label>Intitulé *<input name="title" required maxlength="160" placeholder="Ex. Séminaire professionnel à Paris" value="'+html(e.title||'')+'"></label>'+
    '<div class="srProDates"><label>Du *<input name="startDate" type="date" required value="'+html(e.startDate||date)+'"></label><label>Au *<input name="endDate" type="date" required value="'+html(e.endDate||date)+'"></label></div>'+
    '<label>Lieu / ville<input name="location" maxlength="160" placeholder="Ex. Paris" value="'+html(e.location||'')+'"></label>'+
    '<label>Adresse complète<input name="address" maxlength="350" placeholder="Ex. 10 rue Exemple, Paris" value="'+html(e.address||'')+'"></label>'+
    '<label>Notes / indications<textarea name="notes" maxlength="3000" rows="3" placeholder="Horaires, contact, salle…">'+html(e.notes||'')+'</textarea></label>'+
    '<label style="display:flex;align-items:center;gap:10px"><input style="width:auto;min-height:auto" type="checkbox" name="reminder" '+(e.reminder===false?'':'checked')+'>Rappel sur l’accueil la veille et le jour même</label>'+
    '</div><div id="srProFormError" class="srProFormError" role="alert"></div><div class="srProActionsBar"><button type="button" class="secondary" id="srProCancel">Annuler</button><button type="submit" class="primary">Enregistrer</button></div></form>';
  doc.body.appendChild(dlg);
  dlg.querySelector('#srProCancel').addEventListener('click',()=>dlg.close());
  dlg.addEventListener('close',()=>dlg.remove(),{once:true});
  dlg.querySelector('form').addEventListener('submit',ev=>{
    ev.preventDefault();
    const f=ev.currentTarget,fields=new FormData(f);
    try{
      const out=upsert({id:e.id||'',kind:fields.get('kind'),title:fields.get('title'),startDate:fields.get('startDate'),endDate:fields.get('endDate'),location:fields.get('location'),address:fields.get('address'),notes:fields.get('notes'),reminder:fields.get('reminder')==='on'});
      dlg.close();if(out.conflicts.length&&typeof root.storeRunnerToast==='function')root.storeRunnerToast('Événement enregistré. Des visites ou rendez-vous existants sont à vérifier.');
    }catch(err){dlg.querySelector('#srProFormError').textContent=String(err&&err.message||err)}
  });
  dlg.showModal();
}
function renderList(){
  const box=root.document.getElementById('srProList');if(!box)return;
  const state=stateNow(),items=rows(state).slice().sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
  box.innerHTML=items.length?items.map(e=>{
    const conflicts=plannedConflicts(e,state),url=mapLink(e);
    return '<div class="srProRow"><strong>'+html(e.kind)+' · '+html(e.title)+'</strong><div class="srProMeta">'+html(eventDateSummary(e))+
      (e.location?' · '+html(e.location):'')+'</div>'+
      (e.address?'<div class="srProMeta">📍 '+html(e.address)+'</div>':'')+
      (e.notes?'<div class="srProMeta">'+html(e.notes)+'</div>':'')+
      (conflicts.length?'<div class="srProWarning">⚠️ Visites ou RDV déjà prévus : '+html(conflicts.join(', '))+'. À vérifier, rien n’a été supprimé.</div>':'')+
      '<div class="srProActions">'+(url?'<a href="'+html(url)+'" rel="noopener noreferrer" target="_blank">Itinéraire ↗</a>':'')+
      '<button type="button" data-sr-pro-calendar="'+html(e.id)+'">Exporter calendrier Apple (.ics)</button>'+
      '<button type="button" data-sr-pro-edit="'+html(e.id)+'">Modifier</button><button type="button" data-sr-pro-delete="'+html(e.id)+'">Supprimer</button></div></div>';
  }).join(''):'<p class="srProNote">Aucun événement enregistré.</p>';
}
function renderHome(){
  const box=root.document.getElementById('srProHome');if(!box)return;
  const state=stateNow(),now=today(),tomorrow=addDay(now,1);
  const upcoming=rows(state).filter(e=>e.reminder!==false&&(covering(now,{professionalEvents:[e]}).length||e.startDate===tomorrow));
  box.innerHTML=upcoming.map(e=>{
    const todayEvent=coversDate(now,{professionalEvents:[e]});
    return '<div class="srProAlert">📅 <b>'+(todayEvent?"Aujourd’hui : ":"Demain : ")+html(e.kind)+' · '+html(e.title)+'</b> · '+html(eventDateSummary(e))+
      (e.location?' · '+html(e.location):'')+(e.address?' · 📍 '+html(e.address):'')+
      (mapLink(e)?' <a target="_blank" rel="noopener noreferrer" href="'+html(mapLink(e))+'">Itinéraire ↗</a>':'')+'</div>';
  }).join('');
}
function renderPlanning(){
  const box=root.document.getElementById('srProPlanning');if(!box)return;
  const s=stateNow(),raw=String(s&&s.settings&&s.settings.weekDate||today()).slice(0,10);
  if(!validDate(raw)){box.innerHTML='';return}
  const d=new Date(raw+'T12:00:00Z'),first=addDay(raw,1-(d.getUTCDay()||7)),last=addDay(first,6);
  const events=rows(s).filter(e=>e.endDate>=first&&e.startDate<=last);
  box.innerHTML=events.length?'<div class="srProSection"><b>📅 Journées bloquées cette semaine</b>'+
    events.map(e=>'<div class="srProMeta">'+html(e.startDate===e.endDate?e.startDate:eventDateSummary(e))+' · '+html(e.kind)+' · '+html(e.title)+(e.location?' · '+html(e.location):'')+'</div>').join('')+
    '<p class="srProNote">Aucune nouvelle visite automatique sur ces dates. Les visites déjà présentes restent à vérifier.</p></div>':'';
}
function refresh(){if(!root.document||!stateNow())return;if(makeUi()){renderList();renderHome();renderPlanning()}}
function boot(){
  refresh();
  ['store-runner:planning-updated','store-runner:data-restored','store-runner:home-rendered'].forEach(name=>root.document.addEventListener(name,refresh));
  root.addEventListener('focus',refresh);
  root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden)refresh()});
}
const api={KINDS,validDate,addDay,rows,normalize,covering,coversDate,plannedConflicts,upsert,remove,refresh,openEditor,toICS,icsEscape};
root.StoreRunnerProfessionalEvents=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(root.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot()}
})(typeof window!=='undefined'?window:globalThis);
