const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* #511 — la carte de tournée (#freeRouteMap, Leaflet) est une surface à gestes propres : poser le doigt
   dessus et la déplacer ne doit jamais changer le jour du Planning. Le balayage de changement de jour
   (period-day-slider.js, écouté sur tout #planPanel) reste actif partout ailleurs, sur la timeline.
   Le test charge le vrai Leaflet 1.9.4 (npm, installé comme Playwright par Reliability) à la place de
   unpkg ; sans paquet local il retombe sur le réseau, comme en production. */

const TILE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
function leafletFile(name){try{return require.resolve('leaflet/dist/'+name)}catch(_){return null}}

async function stubExternal(page,{leaflet=true}={}){
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/**',route=>{
    if(!leaflet)return route.abort();
    const file=leafletFile(new URL(route.request().url()).pathname.split('/').pop());
    return file?route.fulfill({path:file}):route.continue();
  });
  await page.route('https://*.tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:TILE}));
  /* Sans OSRM, la carte trace son repli en pointillé : le rendu reste déterministe. */
  await page.route('https://router.project-osrm.org/**',route=>route.abort());
}

async function installPlanning(page){
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPeriodDaySlider&&window.state&&typeof window.renderAll==='function'&&document.getElementById('planPanel'));
  /* route-polish.js reconstruit sa carte à 80…2600 ms après le chargement : on laisse ces rafraîchissements
     de démarrage finir, sinon une carte neuve efface le déplacement mesuré en plein geste. */
  await page.waitForFunction(()=>performance.now()>3300);
  await page.evaluate(()=>{
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    const stores=Array.from({length:10},(_,i)=>({id:'e2e-'+(i+1),enseigne:i%2?'Darty':'Boulanger',ville:['Ville-Test A','Ville-Test B','Ville-Test E','Ville-Test C','Ville-Test H'][i%5],adresse:(10+i)+' rue Test Mobile',lat:43.62+i*0.004,lon:-0.7+i*0.006,active:true,priority:5-(i%5)}));
    state.profile=Object.assign({},state.profile||{},{baseName:'Départ E2E',baseAddress:'1 place Bellecour Ville-Test A',baseLat:43.6578,baseLon:-0.668});
    state.settings=Object.assign({},state.settings||{},{weekDate:'2026-09-14',days,target:10,maxVisitsPerDay:4,startTime:'08:30',endTime:'18:00',visitMinutes:60,brands:[]});
    state.stores=stores;state.locks={};state.included={};state.excluded={};
    state.plan={Lundi:[stores[0],stores[1]],Mardi:[stores[2],stores[3]],Mercredi:[stores[4],stores[5]],Jeudi:[stores[6],stores[7]],Vendredi:[stores[8],stores[9]],Samedi:[]};
    state.appointments=[];state.calendarEvents=[];
    (window.__chefStorage||window.localStorage).setItem('chef_sector_range_v1',JSON.stringify({start:'2026-09-14',end:'2026-09-18',workDays:days,weeks:1}));
    try{save()}catch(_){}
    renderAll();goTab('planPanel');
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  });
  await expect(page.locator('#dayTabs .periodDayTab')).toHaveCount(5);
  await page.locator('#dayTabs .periodDayTab').nth(1).click();
  await expect.poll(()=>activeDate(page)).toBe('2026-09-15');
}

const activeDate=page=>page.locator('#dayTabs .periodDayTab.active').getAttribute('data-date');

/* Vrai doigt : événements tactiles CDP, pas des Event synthétiques, pour que Leaflet et le balayage
   voient exactement ce que verrait un téléphone. */
async function finger(page){
  const client=await page.context().newCDPSession(page);
  const send=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  return{
    async drag(from,to,steps=8){
      await send('touchStart',[{x:from.x,y:from.y,id:1}]);
      for(let i=1;i<=steps;i++){
        const t=i/steps;
        await send('touchMove',[{x:Math.round(from.x+(to.x-from.x)*t),y:Math.round(from.y+(to.y-from.y)*t),id:1}]);
        await page.waitForTimeout(18);
      }
      await send('touchEnd',[]);
    },
    async pinch(center,fromGap,toGap,steps=8){
      const pts=gap=>[{x:Math.round(center.x-gap/2),y:center.y,id:1},{x:Math.round(center.x+gap/2),y:center.y,id:2}];
      await send('touchStart',pts(fromGap));
      for(let i=1;i<=steps;i++){await send('touchMove',pts(fromGap+(toGap-fromGap)*i/steps));await page.waitForTimeout(18)}
      await send('touchEnd',[]);
    },
    detach:()=>client.detach()
  };
}

async function mapReady(page,markers){
  const map=page.locator('#freeRouteMap.leaflet-container');
  await expect(map).toBeVisible();
  await expect(map.locator('.chef-route-marker')).toHaveCount(markers);
  /* Le repli en pointillé est tracé juste avant le dernier recadrage : on attend les deux. */
  await expect(page.locator('#freeMapStats')).toContainText('Aperçu géographique');
  await page.waitForTimeout(450);
  await map.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
  await page.waitForTimeout(120);
  return map;
}

async function inside(locator,fx,fy){
  const box=await locator.boundingBox();
  if(!box)throw new Error('Surface introuvable');
  return{x:Math.round(box.x+box.width*fx),y:Math.round(box.y+box.height*fy),box};
}

/* Les animations de zoom de Leaflet (ajustement après pincement, contrôles) durent quelques centaines
   de millisecondes : on ne mesure l'écart entre marqueurs qu'une fois la carte stable. */
async function settledGap(page,map){
  let prev=-1;
  for(let i=0;i<30;i++){
    const gap=await markerGap(map);
    if(Math.abs(gap-prev)<0.5)return gap;
    prev=gap;await page.waitForTimeout(150);
  }
  throw new Error('La carte ne se stabilise pas');
}
const markerX=(map,i)=>map.locator('.chef-route-marker').nth(i).evaluate(n=>n.getBoundingClientRect().x);
async function markerGap(map){
  return map.evaluate(n=>{const m=n.querySelectorAll('.chef-route-marker'),a=m[0].getBoundingClientRect(),b=m[m.length-1].getBoundingClientRect();return Math.hypot(a.x-b.x,a.y-b.y)});
}

test('un geste horizontal commencé dans la carte déplace la carte, jamais le jour',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss().catch(()=>{}));
  await stubExternal(page);
  await installPlanning(page);
  const f=await finger(page);
  try{
    const map=await mapReady(page,3);

    /* 1. Clic sur un marqueur : sa fenêtre s'ouvre et se ferme, le jour ne bouge pas. */
    await map.locator('.chef-route-marker').first().tap();
    await expect(map.locator('.leaflet-popup')).toContainText('Départ');
    await map.locator('.leaflet-popup-close-button').tap();
    await expect(map.locator('.leaflet-popup')).toHaveCount(0);
    expect(await activeDate(page),'clic sur un marqueur').toBe('2026-09-15');
    await settledGap(page,map);

    /* 2. Balayage franc (≥ 80 px) commencé dans la carte, dans les deux sens : le jour ne bouge pas… */
    const x0=await markerX(map,0);
    const left=await inside(map,0.85,0.5);
    await f.drag({x:left.x,y:left.y},{x:left.x-Math.min(160,left.x-20),y:left.y});
    await page.waitForTimeout(500);
    expect(await activeDate(page),'balayage vers la gauche dans la carte').toBe('2026-09-15');
    /* …et la carte, elle, a bien été déplacée par Leaflet. */
    expect(x0-await markerX(map,0),'la carte suit le doigt').toBeGreaterThan(60);

    const right=await inside(map,0.15,0.5);
    await f.drag({x:right.x,y:right.y},{x:right.x+Math.min(160,right.box.x+right.box.width-right.x-20),y:right.y});
    await page.waitForTimeout(500);
    expect(await activeDate(page),'balayage vers la droite dans la carte').toBe('2026-09-15');

    /* 3. Zoom par pincement… */
    const gap0=await settledGap(page,map);
    const mid=await inside(map,0.5,0.5);
    await f.pinch({x:mid.x,y:mid.y},60,160);
    const gap1=await settledGap(page,map);
    expect(gap1,'pincement : la carte zoome').toBeGreaterThan(gap0*1.5);
    expect(await activeDate(page),'pincement dans la carte').toBe('2026-09-15');

    /* …et contrôles de zoom tactiles. */
    await map.locator('.leaflet-control-zoom-out').tap();
    const gap2=await settledGap(page,map);
    expect(gap2,'contrôle − : la carte dézoome').toBeLessThan(gap1*0.7);
    await map.locator('.leaflet-control-zoom-in').tap();
    expect(await settledGap(page,map),'contrôle + : la carte zoome').toBeGreaterThan(gap2*1.5);

    expect(await activeDate(page),'interactions Leaflet').toBe('2026-09-15');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(1);
  }finally{await f.detach()}
  expect(errors).toEqual([]);
});

test('le même balayage commencé dans la timeline charge toujours le jour adjacent',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss().catch(()=>{}));
  await stubExternal(page);
  await installPlanning(page);
  const f=await finger(page);
  try{
    const row=page.locator('#planPanel .timelineRow .tlMain').first();
    await row.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
    await page.waitForTimeout(150);
    const from=await inside(row,0.82,0.5);
    await f.drag({x:Math.min(340,from.x),y:from.y},{x:Math.max(40,Math.min(340,from.x)-140),y:from.y});
    await expect.poll(()=>activeDate(page),{message:'balayage gauche → jour suivant'}).toBe('2026-09-16');

    const back=page.locator('#planPanel .timelineRow .tlMain').first();
    await back.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
    await page.waitForTimeout(150);
    const rb=await inside(back,0.2,0.5);
    await f.drag({x:Math.max(40,rb.x),y:rb.y},{x:Math.max(40,rb.x)+140,y:rb.y});
    await expect.poll(()=>activeDate(page),{message:'balayage droite → jour précédent'}).toBe('2026-09-15');

    /* Le jour a changé deux fois : la carte a été reconstruite, la garde doit tenir pour la nouvelle carte. */
    const map=await mapReady(page,3);
    const m=await inside(map,0.8,0.5);
    await f.drag({x:m.x,y:m.y},{x:m.x-Math.min(160,m.x-20),y:m.y});
    await page.waitForTimeout(500);
    expect(await activeDate(page),'balayage dans la carte reconstruite').toBe('2026-09-15');
  }finally{await f.detach()}
  expect(errors).toEqual([]);
});

test('la carte pas encore chargée ou indisponible est elle aussi protégée du balayage',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.dismiss().catch(()=>{}));
  await stubExternal(page,{leaflet:false});
  await installPlanning(page);
  const f=await finger(page);
  try{
    const holder=page.locator('#freeRouteMap');
    /* Leaflet est refusé : l'hôte n'est jamais devenu .leaflet-container, il affiche son attente ou son erreur. */
    await expect(holder).toContainText(/Calcul du vrai tracé|Carte indisponible/);
    await expect(holder).not.toHaveClass(/leaflet-container/);
    await holder.evaluate(n=>n.scrollIntoView({block:'center',behavior:'instant'}));
    await page.waitForTimeout(150);
    const p=await inside(holder,0.9,0.5);
    await f.drag({x:p.x,y:p.y},{x:p.x-Math.min(160,p.x-20),y:p.y});
    await page.waitForTimeout(500);
    expect(await activeDate(page)).toBe('2026-09-15');
  }finally{await f.detach()}
  expect(errors).toEqual([]);
});
