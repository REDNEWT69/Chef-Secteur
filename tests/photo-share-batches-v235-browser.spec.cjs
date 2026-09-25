const {test,expect}=require('@playwright/test');

/* V235 — le partage par lots, dans un vrai navigateur mobile à 390 px.
   Aucun partage système n'est déclenché : `navigator.share` et `navigator.canShare`
   sont remplacés avant tout chargement de page, et on relit ce qui leur a été remis.
   Fixtures inventées : ni magasin, ni note, ni photo réels. */

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

/* Le mock note chaque appel et peut rejouer une annulation Android (AbortError). */
async function mockPartage(page){
  await page.addInitScript(()=>{
    window.__shares=[];
    window.__shareMode='ok';
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{
      const noms=(data.files||[]).map(f=>f.name);
      if(window.__shareMode==='abort'){
        const e=new Error('Share canceled');e.name='AbortError';throw e;
      }
      window.__shares.push(noms);
    }});
  });
}

/* Les photos sont écrites directement dans IndexedDB : la caméra n'est pas le sujet,
   et 20 prises de vue par l'interface rendraient le test interminable. */
/* V255.1 — seules les photos rattachées à la visite partent : le semis les rattache à
   la visite ouverte, comme une prise de vue faite pendant cette visite. */
async function semerPhotos(page,plan,visitId){
  return await page.evaluate(async({lots,visitId})=>{
    const PIXEL=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    const api=window.StorePhotosV1,db=await api.openDb(),ids=[];
    const tx=db.transaction(api.STORE,'readwrite'),os=tx.objectStore(api.STORE);
    let n=0;
    for(const [family,combien] of lots){
      for(let i=0;i<combien;i++){
        n++;
        const id='v235-'+(family||'nu')+'-'+String(n).padStart(3,'0');
        const minute=String(n%60).padStart(2,'0'),heure=String(6+Math.floor(n/60)).padStart(2,'0');
        os.put({id,storeId:'v235-store',visitId,family,moment:n%2?'avant':'apres',note:'',
          createdAt:'2026-09-20T'+heure+':'+minute+':00.000Z',updatedAt:'2026-09-20T'+heure+':'+minute+':00.000Z',
          type:'image/png',blob:new Blob([PIXEL],{type:'image/png'})});
        ids.push(id);
      }
    }
    await new Promise((ok,ko)=>{tx.oncomplete=()=>ok();tx.onerror=tx.onabort=()=>ko(tx.error||new Error('semis photo interrompu'))});
    return ids;
  },{lots:plan,visitId});
}

async function creerVisite(page){
  return await page.evaluate(()=>{
    const st=window.state,M=window.StoreRunnerVisitModel;
    st.stores=[{id:'v235-store',enseigne:'Enseigne-Test',ville:'Ville-Test',adresse:'4 rue de Test',
      dept:'99',lat:45.4,lon:4.4,active:true,priority:3,products:['Blanc','Brun']}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=M.empty();
    const v=M.start(st,'v235-store');
    M.editReport(st,v,'shared','context','Rayon accessible, responsable present.');
    if(typeof window.save==='function')window.save();
    return v;
  });
}
async function ouvrirSortieMagasin(page,id){
  await page.evaluate(v=>window.StoreRunnerVisitReport.open(v),id);
  const feuille=page.locator('#srReportSheet');
  await expect(feuille).toBeVisible();
  return feuille;
}

async function prepare(page,plan){
  await mockPartage(page);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.StoreRunnerVisitReport&&window.StoreRunnerVisitModel&&window.state&&typeof window.save==='function');
  const visitId=await creerVisite(page);
  await semerPhotos(page,plan,visitId);
  return await ouvrirSortieMagasin(page,visitId);
}
const lots=page=>page.evaluate(()=>window.__shares.map(n=>n.slice()));
const sansDebordement=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

test('31 photos BRUN partent en 10 / 10 / 10 / 1, sans doublon, à 390 px',async({page})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));

  const feuille=await prepare(page,[['brun',31]]);
  const bouton=feuille.locator('#srReportSharePhotos');

  await expect(feuille.locator('[data-family="brun"]')).toHaveAttribute('aria-selected','true');
  await expect(bouton).toBeEnabled();
  await expect(bouton).toHaveText('Partager 10 / 31 photos BRUN');
  const boite=await bouton.boundingBox();
  expect(boite.height,'la cible tactile doit rester confortable').toBeGreaterThanOrEqual(44);
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x+boite.width).toBeLessThanOrEqual(390);

  await bouton.tap();
  await expect(bouton).toHaveText('Partager les 10 suivantes · 21 restantes');
  await expect(feuille.locator('#srReportStatus')).toContainText('10 photos BRUN partagées · 21 restantes');

  await bouton.tap();
  await expect(bouton).toHaveText('Partager les 10 suivantes · 11 restantes');
  await bouton.tap();
  await expect(bouton).toHaveText('Partager la dernière photo BRUN');
  await bouton.tap();
  await expect(bouton).toHaveText('Toutes les photos BRUN ont été partagées');
  await expect(bouton).toBeDisabled();

  const envois=await lots(page);
  expect(envois.map(l=>l.length),'la découpe doit être 10 / 10 / 10 / 1').toEqual([10,10,10,1]);
  const tous=envois.flat();
  expect(tous).toHaveLength(31);
  expect(new Set(tous).size,'aucun fichier ne doit partir deux fois').toBe(31);
  expect(tous.every(n=>n.includes('_brun_')),'seules les photos BRUN sont envoyées').toBe(true);

  await sansDebordement(page);
  expect(pageErrors).toEqual([]);
});

test('Une annulation Android ne fait pas avancer les lots',async({page})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));

  const feuille=await prepare(page,[['brun',20]]);
  const bouton=feuille.locator('#srReportSharePhotos');
  await expect(bouton).toHaveText('Partager 10 / 20 photos BRUN');

  await page.evaluate(()=>{window.__shareMode='abort'});
  await bouton.tap();
  await expect(feuille.locator('#srReportStatus')).toHaveText('Partage annulé.');
  await expect(bouton).toHaveText('Partager 10 / 20 photos BRUN');
  await expect(bouton).toBeEnabled();
  expect(await lots(page),'une annulation n’enregistre aucun envoi').toEqual([]);

  await page.evaluate(()=>{window.__shareMode='ok'});
  await bouton.tap();
  await expect(bouton).toHaveText('Partager les 10 suivantes · 10 restantes');
  const premier=(await lots(page))[0];
  expect(premier).toHaveLength(10);

  await bouton.tap();
  await expect(bouton).toHaveText('Toutes les photos BRUN ont été partagées');
  const envois=await lots(page);
  expect(envois[1]).toHaveLength(10);
  expect(envois[0].filter(n=>envois[1].includes(n)),'le lot 2 ne reprend rien du lot 1').toEqual([]);

  await sansDebordement(page);
  expect(pageErrors).toEqual([]);
});

test('BLANC et BRUN gardent des files séparées et ignorent les photos non classées',async({page})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));

  const feuille=await prepare(page,[['brun',20],['blanc',7],['',4]]);
  const bouton=feuille.locator('#srReportSharePhotos');
  const ongletBlanc=feuille.locator('.sr-reportTab[data-family="blanc"]');
  const ongletBrun=feuille.locator('.sr-reportTab[data-family="brun"]');

  await expect(bouton).toHaveText('Partager 10 / 20 photos BRUN');
  await bouton.tap();
  await expect(bouton).toHaveText('Partager les 10 suivantes · 10 restantes');
  const brun1=(await lots(page))[0];

  await ongletBlanc.tap();
  await expect(bouton).toHaveText('Partager les 7 photos BLANC');
  await bouton.tap();
  await expect(bouton).toHaveText('Toutes les photos BLANC ont été partagées');
  const blanc1=(await lots(page))[1];
  expect(blanc1).toHaveLength(7);

  await ongletBrun.tap();
  await expect(bouton,'BRUN doit reprendre à la photo 11').toHaveText('Partager les 10 suivantes · 10 restantes');
  await bouton.tap();
  await expect(bouton).toHaveText('Toutes les photos BRUN ont été partagées');

  const envois=await lots(page);
  const brun2=envois[2];
  expect(envois.map(l=>l.length)).toEqual([10,7,10]);
  expect(brun1.filter(n=>brun2.includes(n)),'jamais deux fois la même photo BRUN').toEqual([]);
  expect(brun2.filter(n=>blanc1.includes(n)),'les deux files ne se mélangent pas').toEqual([]);

  const tous=envois.flat();
  expect(tous).toHaveLength(27);
  expect(new Set(tous).size).toBe(27);
  expect(tous.filter(n=>n.includes('_brun_'))).toHaveLength(20);
  expect(tous.filter(n=>n.includes('_blanc_'))).toHaveLength(7);
  expect(tous.some(n=>!n.includes('_brun_')&&!n.includes('_blanc_')),'aucune photo non classée ne doit partir').toBe(false);

  await sansDebordement(page);
  expect(pageErrors).toEqual([]);
});

/* V255.1 — parcours réel : photos prises par l'interface pendant la visite, une
   ancienne visite du même magasin avec ses photos, et d'anciennes photos sans visitId.
   Seules les photos de la visite courante partent, BRUN et BLANC restant séparés. */
test('Sortie magasin ne partage que les photos de la visite courante, à 390 px',async({page})=>{
  test.setTimeout(90000);
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e&&e.message||e)));
  const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');
  await mockPartage(page);
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StorePhotosV1&&window.StoreRunnerVisitReport&&window.StoreRunnerVisits&&window.StoreRunnerVisitModel&&window.state&&typeof window.save==='function');
  const ancienne=await page.evaluate(()=>{
    const st=window.state,M=window.StoreRunnerVisitModel;
    st.stores=[{id:'v235-store',enseigne:'Enseigne-Test',ville:'Ville-Test',adresse:'4 rue de Test',
      dept:'99',lat:45.4,lon:4.4,active:true,priority:3,products:['Blanc','Brun']}];
    st.notes={};st.visits={};st.included={};st.excluded={};st.locks={};st.plan={};st.appointments=[];st.calendarEvents=[];
    st.businessV2=M.empty();
    const old=M.start(st,'v235-store');M.editVisit(st,old,'conclusion',null,'Visite précédente.');M.complete(st,old,'2026-09-10');
    st.businessV2.visits.find(v=>v.id===old).createdAt='2026-09-10T08:00:00.000Z';
    window.save();return old;
  });
  /* Semis direct : 3 BRUN et 1 BLANC de l'ancienne visite, 2 BRUN sans visitId (champ absent / null). */
  await page.evaluate(async old=>{
    const PIXEL=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
    const api=window.StorePhotosV1,db=await api.openDb(),tx=db.transaction(api.STORE,'readwrite'),os=tx.objectStore(api.STORE);
    const base={storeId:'v235-store',moment:'',note:'',type:'image/png'};
    const rows=[['ancienne-brun-1','brun',old,'2026-09-10T09:01:00.000Z'],['ancienne-brun-2','brun',old,'2026-09-10T09:02:00.000Z'],['ancienne-brun-3','brun',old,'2026-09-10T09:03:00.000Z'],['ancienne-blanc-1','blanc',old,'2026-09-10T09:04:00.000Z'],['legacy-brun-1','brun',undefined,'2026-08-01T10:01:00.000Z'],['legacy-brun-2','brun',null,'2026-08-01T10:02:00.000Z']];
    for(const [id,family,visitId,createdAt] of rows){const r=Object.assign({},base,{id,family,createdAt,updatedAt:createdAt,blob:new Blob([PIXEL],{type:'image/png'})});if(visitId!==undefined)r.visitId=visitId;os.put(r)}
    await new Promise((ok,ko)=>{tx.oncomplete=()=>ok();tx.onerror=tx.onabort=()=>ko(tx.error)});
  },ancienne);

  /* Visite du jour : 2 photos BRUN puis 1 BLANC, prises par l'interface. */
  await page.evaluate(()=>window.StoreRunnerVisits.start('v235-store'));
  const visite=page.locator('#srVisitDialog');await expect(visite).toBeVisible();
  const galerie=page.locator('#storePhotosDialog');
  await visite.locator('.sr-photoEntry').tap();await expect(galerie).toBeVisible();
  await galerie.locator('#srPhotoCameraInput').setInputFiles({name:'b1.png',mimeType:'image/png',buffer:PNG});
  await expect(galerie.locator('.sr-photoCard')).toHaveCount(1);
  await galerie.locator('#srPhotoCameraInput').setInputFiles({name:'b2.png',mimeType:'image/png',buffer:PNG});
  await expect(galerie.locator('.sr-photoCard')).toHaveCount(2);
  await galerie.locator('#srPhotoClose').tap();
  await visite.locator('.sr-familyBtn',{hasText:'BLANC'}).tap();
  await visite.locator('.sr-photoEntry').tap();await expect(galerie).toBeVisible();
  await galerie.locator('#srPhotoCameraInput').setInputFiles({name:'w1.png',mimeType:'image/png',buffer:PNG});
  await expect(galerie.locator('.sr-photoCard')).toHaveCount(3);
  await galerie.locator('#srPhotoClose').tap();
  await visite.locator('.sr-familyBtn',{hasText:'BRUN'}).tap();

  /* Sortie magasin depuis la visite. */
  await visite.locator('#srReportBtn').tap();
  const feuille=page.locator('#srReportSheet');await expect(feuille).toBeVisible();
  const bouton=feuille.locator('#srReportSharePhotos');
  await expect(feuille.locator('.sr-reportTab[data-family="brun"]')).toHaveAttribute('aria-selected','true');
  await expect(bouton,'2 photos BRUN de la visite, pas les 3 anciennes ni les 2 sans visite').toHaveText('Partager les 2 photos BRUN');
  await expect(feuille.locator('#srReportText')).toHaveValue(/2 sans moment jointes à ce message\./);
  await bouton.tap();
  await expect(bouton).toHaveText('Toutes les photos BRUN ont été partagées');
  await feuille.locator('.sr-reportTab[data-family="blanc"]').tap();
  await expect(bouton,'1 photo BLANC de la visite, pas l’ancienne').toHaveText('Partager la photo BLANC');
  await bouton.tap();
  await expect(bouton).toHaveText('Toutes les photos BLANC ont été partagées');

  const envois=await lots(page);
  expect(envois.map(l=>l.length)).toEqual([2,1]);
  const tous=envois.flat();
  expect(tous.filter(n=>n.includes('_brun_'))).toHaveLength(2);
  expect(tous.filter(n=>n.includes('_blanc_'))).toHaveLength(1);
  expect(tous.some(n=>n.includes('2026-09-10')||n.includes('2026-08-01')),'aucune photo d’une ancienne visite ni sans visitId').toBe(false);

  /* Rien n'est réécrit : anciennes photos intactes, toujours visibles dans la galerie. */
  const stock=await page.evaluate(async()=>(await window.StorePhotosV1.list('v235-store')).map(r=>({id:r.id,visitId:r.visitId===undefined?'(absent)':r.visitId,family:r.family})));
  expect(stock).toHaveLength(9);
  expect(stock.find(r=>r.id==='legacy-brun-1').visitId).toBe('(absent)');
  expect(stock.find(r=>r.id==='legacy-brun-2').visitId).toBeNull();
  expect(stock.filter(r=>r.visitId===ancienne)).toHaveLength(4);
  await sansDebordement(page);
  expect(pageErrors).toEqual([]);
});
