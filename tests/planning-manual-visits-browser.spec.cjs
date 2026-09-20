const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'});

test('Planning V174 : + déplace un magasin et swipe le retire avec confirmation',async({page})=>{
  page.on('dialog',d=>d.accept());
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerManualPlanning&&window.state&&typeof window.renderAll==='function');
  await page.evaluate(()=>{
    const mk=(id,enseigne,ville)=>({id,enseigne,ville,adresse:'1 rue test',dept: '99',active:true,lat:43.6,lon:-0.6,priority:3});
    const a=mk('a','Auchan','Ville-Test C'),b=mk('b','Boulanger','Ville-Test C'),c=mk('c','Darty','Ville-Test B');
    state.stores=[a,b,c];state.excluded={};state.locks={};state.manualWeekEdits={};
    state.settings=Object.assign({},state.settings,{weekDate:'2026-09-14',days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],maxVisitsPerDay:8,startTime:'08:30',endTime:'18:00',visitMinutes:60});
    state.plan={Lundi:[a,b],Mardi:[c],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    renderAll();if(typeof goTab==='function')goTab('planPanel');if(typeof selectPlanningDay==='function')selectPlanningDay('Lundi');
  });
  await page.waitForTimeout(250);
  const add=page.locator('#planPanel .pmvAdd');await expect(add).toBeVisible();
  const polish=await page.evaluate(()=>{
    const head=document.querySelector('#planPanel .pmvHead');
    const hint=document.querySelector('#planPanel .pmvHint');
    const first=document.querySelector('#planPanel .appleTimeline .timelineRow');
    if(!head||!hint||!first)return null;
    const hs=getComputedStyle(head),is=getComputedStyle(hint),hr=head.getBoundingClientRect(),fr=first.getBoundingClientRect();
    return{headBg:hs.backgroundColor,hintDisplay:is.display,hintHidden:hint.hidden,gap:Math.round(fr.top-hr.bottom)};
  });
  expect(polish).toBeTruthy();
  expect(polish.headBg).toBe('rgba(0, 0, 0, 0)');
  /* V229 : le swipe fonctionne toujours, mais son tutoriel n'occupe plus l'écran. */
  expect(polish.hintHidden).toBe(true);
  expect(polish.hintDisplay).toBe('none');
  expect(polish.gap).toBeGreaterThanOrEqual(12);
  await add.click();await expect(page.locator('#pmvDialog')).toBeVisible();
  await page.locator('#pmvSearch').fill('Darty Ville-Test B');
  const darty=page.locator('#pmvResults .pmvStore').filter({hasText:'Darty Ville-Test B'});await expect(darty).toBeVisible();await expect(darty.locator('em')).toContainText('Déplacer de Mardi');
  await darty.click();
  await page.waitForFunction(()=>state.plan.Lundi.some(s=>s.id==='c')&&!state.plan.Mardi.some(s=>s.id==='c'));
  const mondayIds=await page.evaluate(()=>state.plan.Lundi.map(s=>s.id));expect(mondayIds.filter(x=>x==='c')).toHaveLength(1);
  await expect(page.locator('#planPanel .tlName').filter({hasText:'Darty Ville-Test B'})).toBeVisible();

  const row=page.locator('#planPanel .timelineRow:not(.calendarEvent)').filter({hasText:'Darty Ville-Test B'}).first();
  await row.evaluate(el=>{
    const fire=(type,x,y,has=true)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:has?[{clientX:x,clientY:y}]:[]});el.dispatchEvent(e)};
    fire('touchstart',300,220,true);fire('touchmove',180,222,true);fire('touchend',180,222,false);
  });
  await page.waitForFunction(()=>!state.plan.Lundi.some(s=>s.id==='c'));
  await expect(page.locator('#planPanel .tlName').filter({hasText:'Darty Ville-Test B'})).toHaveCount(0);
  const manual=await page.evaluate(()=>state.manualWeekEdits&&state.manualWeekEdits['2026-09-14']);expect(manual).toBeTruthy();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
});