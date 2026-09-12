(function(){
  'use strict';
  const DAYS=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const SHORT={Lundi:'Lun',Mardi:'Mar',Mercredi:'Mer',Jeudi:'Jeu',Vendredi:'Ven',Samedi:'Sam'};
  let scheduled=false;
  // Verrou explicite posé dès qu'on interagit avec un champ des réglages, levé au `change`
  // ou à la fermeture du panneau - pas seulement en observant document.activeElement.
  // Sur iOS, ouvrir un <input type="date"> fait perdre le focus à la page (le champ n'est
  // plus document.activeElement pendant que le sélecteur natif est affiché) tout en
  // déclenchant plusieurs événements de perte de focus au niveau de la fenêtre : sans ce
  // verrou, le panneau était réorganisé pendant la saisie et le sélecteur natif se
  // refermait aussitôt.
  let editingLocked=false;
  const SETTINGS_FIELD='#planningSettings input, #planningSettings select, #planningSettings textarea';

  function dateOnly(v){const m=String(v||'').match(/^(\d{4}-\d{2}-\d{2})/);return m?m[1]:''}
  function weekMonday(){try{const raw=(state.settings&&state.settings.weekDate)||new Date().toISOString().slice(0,10),d=new Date(raw+'T12:00:00'),w=d.getDay()||7;d.setDate(d.getDate()-w+1);return d}catch(e){return new Date()}}
  function isoForIndex(i){const d=weekMonday();d.setDate(d.getDate()+i);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function eventCovers(e,date){if(typeof window.chefSecteurEventCoversDate==='function')try{return window.chefSecteurEventCoversDate(e,date)}catch(err){}const s=dateOnly(e&&(e.date||e.start));if(!s)return false;let end=dateOnly(e&&e.end)||s;if(e&&e.allDay&&end>s){const d=new Date(end+'T12:00:00');d.setDate(d.getDate()-1);end=d.toISOString().slice(0,10)}return date>=s&&date<=end}
  function hasHotel(date){try{return (state.calendarEvents||[]).some(e=>eventCovers(e,date)&&/(hotel|hôtel|hebergement|hébergement|b&b|b\s*&\s*b)/i.test((e.title||'')+' '+(e.location||'')))}catch(e){return false}}

  function restoreHotelStars(){
    document.querySelectorAll('#dayTabs .dayTab').forEach((btn,i)=>{
      btn.querySelectorAll('.hotelStarBadge').forEach(x=>x.remove());
      if(!hasHotel(isoForIndex(i)))return;
      const s=document.createElement('span');s.className='hotelStarBadge';s.textContent='✦ hôtel';s.style.cssText='display:block;margin-top:4px;font-size:9px;font-weight:850;color:#9a6200';btn.appendChild(s);
    });
    const banner=document.getElementById('planningHotelBanner');
    if(banner&&!banner.querySelector('.hotelCornerStar')){const s=document.createElement('div');s.className='hotelCornerStar';s.textContent='✦';s.style.cssText='position:absolute;right:14px;top:10px;font-size:18px;color:#c98a00';banner.style.position='relative';banner.appendChild(s)}
  }

  function selectedDayIndex(){const tabs=[...document.querySelectorAll('#dayTabs .dayTab')],idx=tabs.findIndex(b=>b.classList.contains('active'));return idx>=0?idx:0}
  /* La bande de jours peut couvrir plusieurs semaines : l'index de l'onglet actif ne
     suffit plus, il faut lire sa date réelle quand elle est disponible. Sans cela un
     onglet de la 2e semaine affichait un en-tête décalé de plusieurs jours. */
  function selectedDayDate(){
    const active=document.querySelector('#dayTabs .dayTab.active[data-date]');
    if(active){const dated=new Date(String(active.dataset.date)+'T12:00:00');if(!isNaN(dated))return dated}
    const d=weekMonday();d.setDate(d.getDate()+selectedDayIndex());return d;
  }
  function dayHeroLabel(){const d=selectedDayDate(),day=new Intl.DateTimeFormat('fr-FR',{weekday:'long'}).format(d);return day.charAt(0).toUpperCase()+day.slice(1)+' '+d.getDate()}
  function fullDayLabel(){return new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(selectedDayDate())}
  function weekLabel(){const m=weekMonday(),end=new Date(m);end.setDate(end.getDate()+5);const a=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long'}).format(m),b=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric'}).format(end);return 'Semaine du '+a+' au '+b}

  function ensurePlanningHero(plan,title){
    let hero=document.getElementById('planningHeroV2');
    if(!hero){hero=document.createElement('section');hero.id='planningHeroV2';hero.className='planningHeroV2';hero.innerHTML='<div class="planningHeroTop"><span class="planningHeroPill">Cette semaine</span><span id="planningHeroWeek" class="planningHeroWeek"></span></div><div id="planningHeroDay" class="planningHeroDay"></div><div id="planningHeroFull" class="planningHeroFull"></div>'}
    if(hero.parentNode!==plan)plan.insertBefore(hero,plan.firstChild);
    const day=document.getElementById('planningHeroDay'),full=document.getElementById('planningHeroFull'),week=document.getElementById('planningHeroWeek');
    if(day)day.textContent=dayHeroLabel();if(full)full.textContent=fullDayLabel();if(week)week.textContent=weekLabel();if(title)title.style.display='none';return hero;
  }

  function syncSmartBrief(){const brief=document.getElementById('smartBrief'),plan=document.getElementById('planPanel');if(!brief||!plan)return;brief.style.display=plan.classList.contains('active')?'none':''}
  function activePlanningControl(){const el=document.activeElement;return !!(el&&el.matches&&el.matches(SETTINGS_FIELD))}
  // Le verrou explicite est la source de vérité ; document.activeElement reste un filet de
  // sécurité pour les navigateurs où il suit correctement le focus pendant une saisie.
  function isEditingLocked(){return editingLocked||activePlanningControl()}
  function moveAfter(anchor,node){if(!anchor||!node||anchor.nextElementSibling===node)return;anchor.insertAdjacentElement('afterend',node)}

  function reorderPlanning(){
    const plan=document.querySelector('#planPanel .applePlan'),title=plan&&plan.querySelector('.applePlanTitle'),tabs=document.getElementById('dayTabs'),timeline=plan&&plan.querySelector('.timelineShell'),metrics=document.getElementById('planMetrics'),saturday=document.getElementById('saturdayRecommendation'),departure=plan&&plan.querySelector('.departureCard'),settings=document.getElementById('planningSettings');
    if(!plan||!tabs||!timeline)return;
    const editing=isEditingLocked(),hero=ensurePlanningHero(plan,title);moveAfter(hero,tabs);
    let tools=document.getElementById('planningToolsV2');
    if(!tools){tools=document.createElement('div');tools.id='planningToolsV2';tools.className='planningToolsV2';tools.innerHTML='<button class="secondary" type="button" onclick="showPlanMap()">⌖ Ouvrir la tournée</button><button class="primary" type="button" onclick="generateWeek()">✦ Générer ma semaine</button>'}
    const generation=tools.querySelector('button[onclick*="generateWeek"]');if(generation){generation.className='primary';generation.textContent='✦ Générer ma semaine'}
    moveAfter(tabs,tools);moveAfter(tools,timeline);
    const monthly=document.querySelector('#planPanel #managerPlanningMonth, #planPanel .managerPlanningMonth, #planPanel .monthPlanning, #planPanel [data-planning-month]');let anchor=timeline;
    if(monthly){moveAfter(anchor,monthly);anchor=monthly}if(metrics){moveAfter(anchor,metrics);anchor=metrics}if(saturday){moveAfter(anchor,saturday);anchor=saturday}if(departure){moveAfter(anchor,departure);anchor=departure}
    if(settings&&!editing&&(settings.parentNode!==plan||settings.nextElementSibling))plan.appendChild(settings);
  }

  function choiceSummary(boxId,type){
    const all=[...document.querySelectorAll('#'+boxId+' input[type="checkbox"]')],checked=all.filter(x=>x.checked);
    if(type==='days')return checked.length?checked.map(x=>SHORT[x.value]||x.value).join(', '):'Aucun jour';
    if(!all.length||checked.length===all.length)return'Toutes';
    if(!checked.length)return'Aucune';
    if(checked.length<=2)return checked.map(x=>x.value).join(', ');
    return checked.length+' sélectionnées';
  }

  function ensureChoiceDetails(boxId,detailsId,title,type){
    const box=document.getElementById(boxId);if(!box)return;
    let details=document.getElementById(detailsId);
    if(!details){
      const parent=box.parentNode,label=box.previousElementSibling&&box.previousElementSibling.tagName==='LABEL'?box.previousElementSibling:null;
      details=document.createElement('details');details.id=detailsId;details.className='planningChoice';
      const summary=document.createElement('summary');summary.innerHTML='<span>'+title+'</span><small data-choice-summary></small>';
      const body=document.createElement('div');body.className='planningChoiceBody';
      parent.insertBefore(details,label||box);details.appendChild(summary);details.appendChild(body);if(label)body.appendChild(label);body.appendChild(box);
    }
    const summary=details.querySelector('[data-choice-summary]');if(summary)summary.textContent=choiceSummary(boxId,type);
  }

  function ensureAdvancedDetails(){
    const settings=document.querySelector('#planningSettings .settingsInner'),strategy=document.getElementById('strategy');if(!settings||!strategy)return;
    let details=document.getElementById('planningAdvancedDetails');
    if(!details){
      const label=strategy.previousElementSibling&&strategy.previousElementSibling.tagName==='LABEL'?strategy.previousElementSibling:null,grid=settings.querySelector('.premium-time');
      details=document.createElement('details');details.id='planningAdvancedDetails';details.className='planningChoice planningAdvancedDetails';details.innerHTML='<summary><span>Horaires & stratégie</span><small>Avancé</small></summary><div class="planningChoiceBody"></div>';
      settings.insertBefore(details,label||strategy);const body=details.querySelector('.planningChoiceBody');if(label)body.appendChild(label);body.appendChild(strategy);
      if(grid){const hint=grid.nextElementSibling&&grid.nextElementSibling.classList.contains('tiny')?grid.nextElementSibling:null;body.appendChild(grid);if(hint)body.appendChild(hint)}
    }
  }

  function ensureCalendarDetails(){
    const card=document.querySelector('#planningSettings .calendarConnect');if(!card)return;
    let details=document.getElementById('planningCalendarDetails');
    if(!details){details=document.createElement('details');details.id='planningCalendarDetails';details.className='planningChoice planningCalendarDetails';details.innerHTML='<summary><span>Google Agenda</span><small data-calendar-summary>Connexion</small></summary><div class="planningChoiceBody"></div>';card.parentNode.insertBefore(details,card);details.querySelector('.planningChoiceBody').appendChild(card)}
    const badge=document.getElementById('googleCalendarBadge'),small=details.querySelector('[data-calendar-summary]');if(small)small.textContent=badge&&badge.textContent?badge.textContent:'Connexion';
  }

  function suppressDuplicateGeneration(){
    const settings=document.querySelector('#planningSettings .settingsInner');if(!settings)return;
    settings.querySelectorAll('button[onclick*="generateWeek"]').forEach(btn=>btn.classList.add('planningDuplicateGenerate'));
    const target=document.getElementById('target');if(target){const label=target.previousElementSibling;if(label&&label.tagName==='LABEL')label.textContent='Objectif de visites par semaine'}
  }

  function syncDynamicStoreCount(){
    let total=0,active=0;
    try{const stores=Array.isArray(state.stores)?state.stores:[];total=stores.length;active=stores.filter(s=>s&&s.active!==false).length}catch(e){}
    // Ciblage par id plutôt qu'une regex sur le texte affiché : un motif de correspondance
    // sur le libellé se désynchronise dès que celui-ci change (c'est ce qui avait laissé
    // passer un compteur figé « 83 magasins » sans que rien ne le détecte).
    const notice=document.getElementById('departureStoreNotice');
    if(notice){const label=active+' magasin'+(active>1?'s':'')+' actif'+(active>1?'s':'')+' dans ton secteur'+(total!==active?' · '+total+' au total':'')+'. Le compteur suit automatiquement tes données.';if(notice.textContent!==label)notice.textContent=label}
    const settings=document.querySelector('#planningSettings .settingsInner');if(settings){let line=document.getElementById('planningDynamicStoreCount');if(!line){line=document.createElement('div');line.id='planningDynamicStoreCount';line.className='planningStoreCount tiny';const target=document.getElementById('target');if(target)target.insertAdjacentElement('afterend',line)}if(line)line.textContent=active+' magasin'+(active>1?'s':'')+' actif'+(active>1?'s':'')+' disponible'+(active>1?'s':'')+' pour le planning.'}
  }

  function compactSettings(){ensureChoiceDetails('daysBox','planningDaysDetails','Jours travaillés','days');ensureChoiceDetails('brandsBox','planningBrandsDetails','Enseignes','brands');ensureAdvancedDetails();ensureCalendarDetails();suppressDuplicateGeneration();syncDynamicStoreCount()}

  function css(){if(document.getElementById('planning-fix-css'))return;const s=document.createElement('style');s.id='planning-fix-css';s.textContent=`
    #planPanel .timelineRow{min-width:0!important}#planPanel .tlMain{min-width:0!important}#planPanel .timelineRow *{max-width:100%}
    #planPanel .applePlan{padding-top:2px!important}body:has(#planPanel.active) #smartBrief{display:none!important}#planPanel #iosDayHero{display:none!important}
    .planningHeroV2{margin:0 0 8px;padding:8px 2px 2px;background:transparent;border:0;box-shadow:none}.planningHeroTop{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}.planningHeroPill{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.78);border:1px solid rgba(60,60,67,.12);font-size:11px;font-weight:800;color:#667085;box-shadow:0 4px 14px rgba(31,41,55,.04)}.planningHeroWeek{font-size:11px;color:#8a93a2;font-weight:650;text-align:right}.planningHeroDay{font-family:Georgia,"Times New Roman",serif;font-size:44px;line-height:.98;letter-spacing:-.045em;font-weight:500;color:#111318;margin:0}.planningHeroFull{font-size:14px;color:#717987;margin-top:8px;font-weight:600}
    #planPanel #dayTabs{margin:10px 0 8px;padding-bottom:2px;display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;touch-action:pan-x;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none}#planPanel #dayTabs::-webkit-scrollbar{display:none}#planPanel #dayTabs .dayTab{flex:1 1 0!important;min-width:56px!important;max-width:96px!important;scroll-snap-align:center;touch-action:pan-x}
    .planningToolsV2{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.planningToolsV2 button{min-height:42px;padding:9px 13px;flex:1 1 180px}#planPanel .timelineShell{margin-bottom:20px}#planPanel #planMetrics{margin:18px 0 14px!important}#planPanel .departureCard{margin:8px 0 14px!important}#planPanel #saturdayRecommendation:empty{display:none}
    #planningSettings[open]>.settingsInner{display:block!important}.planningChoice{margin:10px 0;border:1px solid rgba(120,125,140,.15);border-radius:16px;background:rgba(255,255,255,.58);overflow:hidden}.planningChoice>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:12px 14px;cursor:pointer;font-weight:800;color:#1f2937}.planningChoice>summary::-webkit-details-marker{display:none}.planningChoice>summary:after{content:'＋';font-size:18px;color:#1674d9;margin-left:6px}.planningChoice[open]>summary:after{content:'−'}.planningChoice>summary small{margin-left:auto;color:#7a8290;font-size:11px;font-weight:650;white-space:nowrap;max-width:58%;overflow:hidden;text-overflow:ellipsis}.planningChoiceBody{padding:0 12px 13px}.planningChoiceBody>label:first-child{display:none}.planningChoiceBody .checkgrid{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;max-height:170px;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:2px}.planningChoiceBody .checkitem{min-height:42px;margin:0}#planningDaysDetails .planningChoiceBody #daysBox{max-height:none!important;overflow:visible!important;-webkit-overflow-scrolling:auto;touch-action:auto}.planningAdvancedDetails .premium-time{margin-top:6px}.planningCalendarDetails .calendarConnect{margin:0!important;border:0!important;box-shadow:none!important;background:transparent!important;padding:4px 0!important}.planningRangeDetails .formgrid{margin-top:4px}.planningDuplicateGenerate{display:none!important}.planningStoreCount{margin:6px 0 2px;color:#697386}.planningRangeDetails{order:20}
    @media(max-width:650px){.planningHeroV2{padding-top:2px}.planningHeroTop{align-items:flex-start}.planningHeroWeek{max-width:58%;line-height:1.3}.planningHeroDay{font-size:50px}.planningHeroFull{font-size:13px}.planningToolsV2{margin-bottom:10px}.planningToolsV2 button{flex:1 1 0;min-width:0}.planningChoice{border-radius:15px}.planningChoice>summary{padding:11px 12px}.planningChoiceBody{padding:0 10px 11px}.planningChoiceBody .checkgrid{max-height:150px}#planningDaysDetails .planningChoiceBody #daysBox{max-height:none!important;overflow:visible!important}.planningAdvancedDetails .formgrid,.planningRangeDetails .formgrid{grid-template-columns:1fr!important}}
  `;document.head.appendChild(s)}

  function run(){css();syncSmartBrief();if(isEditingLocked())return;reorderPlanning();compactSettings();restoreHotelStars()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(function(){scheduled=false;run()})}
  function observeDayTabs(){const tabs=document.getElementById('dayTabs');if(!tabs||tabs.__planningFixObserver)return;const observer=new MutationObserver(schedule);observer.observe(tabs,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});tabs.__planningFixObserver=observer}
  function observePlanPanel(){const plan=document.getElementById('planPanel');if(!plan||plan.__planningActiveObserver)return;const observer=new MutationObserver(schedule);observer.observe(plan,{attributes:true,attributeFilter:['class']});plan.__planningActiveObserver=observer}
  function boot(){run();observeDayTabs();observePlanPanel();[120,500,900].forEach(function(delay){setTimeout(function(){run();observeDayTabs();observePlanPanel()},delay)})}
  document.addEventListener('click',e=>{if(e.target&&e.target.closest&&(e.target.closest('#dayTabs .dayTab')||e.target.closest('.tab')))setTimeout(schedule,60)},true);
  // Pose du verrou dès l'intention d'interagir (pointerdown/focusin), pas seulement au focus
  // in fine : sur iOS, l'ouverture du sélecteur natif d'un <input type="date"> peut survenir
  // entre les deux, et document.activeElement ne suit plus le champ pendant que le sélecteur
  // est affiché.
  document.addEventListener('pointerdown',e=>{if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD))editingLocked=true},true);
  document.addEventListener('focusin',e=>{if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD))editingLocked=true},true);
  function releaseEditingLock(){if(!editingLocked)return;editingLocked=false;schedule()}
  document.addEventListener('pointerdown',e=>{if(editingLocked&&!(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD)))releaseEditingLock()},true);
  document.addEventListener('focusin',e=>{if(editingLocked&&!(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD)))releaseEditingLock()},true);
  document.addEventListener('change',e=>{
    if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD)){editingLocked=false;schedule()}
    if(e.target&&e.target.matches&&(e.target.matches('[data-day],[data-brand]')||e.target.matches('#rangeStart,#rangeEnd')))setTimeout(schedule,20);
  },true);
  // Le focusout que provoque l'ouverture du sélecteur natif iOS ne doit pas relancer un
  // rendu tant que le verrou tient : il ne se lève qu'au `change` (date choisie) ou à la
  // fermeture du panneau, jamais sur un simple changement de focus.
  document.addEventListener('focusout',e=>{if(editingLocked)return;if(e.target&&e.target.matches&&e.target.matches(SETTINGS_FIELD))setTimeout(schedule,80)},true);
  document.addEventListener('toggle',e=>{if(e.target&&e.target.id==='planningSettings'&&!e.target.open){editingLocked=false;schedule()}},true);
  document.addEventListener('store-runner:planning-updated',schedule);document.addEventListener('store-runner:data-restored',schedule);document.addEventListener('store-runner:calendar-updated',schedule);
  // Les réinstallations globales sur le focus de la fenêtre ou la visibilité de l'onglet
  // sont interdites par AGENTS.md quand un événement métier existe déjà - ce sont elles qui
  // déclenchaient la réorganisation du panneau pendant la saisie sur iOS.
  window.addEventListener('load',function(){setTimeout(run,180)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else setTimeout(boot,0);
})();