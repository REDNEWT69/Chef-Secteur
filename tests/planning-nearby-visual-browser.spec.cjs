/* V202 — l'allure du bloc « À proximité de cette journée » à 390 px.
   Ce test ne vérifie aucune logique métier : il vérifie qu'il n'y a qu'un seul
   encadrement, que rien ne déborde, et que les cibles tactiles tiennent.
   Fixture inventée. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const DEG_KM=111.19492664455873;

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('Bloc « À proximité » : un seul cadre, aucun débordement, cibles tactiles tenues',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));

  await page.addInitScript(()=>{
    const R=Date,at=R.parse('2026-09-16T09:00:00');
    class F extends R{constructor(...a){super(...(a.length?a:[at]))}static now(){return at}}
    window.Date=F;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&Array.isArray(window.state.stores)&&document.getElementById('planPanel'));

  await page.evaluate(DEG_KM=>{
    const st=window.state,at=km=>({lat:47+km/DEG_KM,lon:1});
    const mk=(id,km,enseigne,ville)=>({id,enseigne,ville,adresse:'1 rue Test',dept:'99',
      lat:at(km).lat,lon:at(km).lon,active:true,priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    st.stores=[
      mk('anc',0,'Enseigne A','Ville-Test 01'),
      mk('v0',0.1,'Enseigne B','Ville-Test 02'),
      mk('v1',3,'Enseigne C','Ville-Test 03'),
      /* un nom volontairement long : la ligne doit rester compacte et tronquer */
      mk('v2',3.5,'Enseigne D au nom particulièrement long','Ville-Test 04 aux Grands Champs')
    ];
    st.businessV2={visits:[{id:'c1',storeId:'v1',status:'completed',completedDate:'2026-08-27'}],actions:[],storeSnapshots:{}};
    st.settings=Object.assign({},st.settings,{days:['Lundi','Mardi','Mercredi','Jeudi','Vendredi'],
      weekDate:'2026-09-14',target:20,maxVisitsPerDay:8});
    st.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[st.stores[0]],Vendredi:[],Samedi:[]};
    st.included={};st.excluded={};st.locks={};st.appointments=[];st.calendarEvents=[];st.manualWeekEdits={};
    try{save()}catch(e){}try{renderAll()}catch(e){}try{goTab('planPanel')}catch(e){}
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
  },DEG_KM);
  await page.waitForTimeout(800);
  const tab=page.locator('#dayTabs .periodDayTab[data-date="2026-09-17"]');
  await expect(tab).toHaveCount(1);
  await tab.click();
  await page.waitForTimeout(800);

  const zone=page.locator('#planPanel .pmvSuggest');
  await expect(zone).toHaveCount(1);
  await expect(zone.locator('.pmvSuggestRow')).toHaveCount(3);

  /* Sur mobile, la visite réelle doit apparaître avant les suggestions et les pavés d'aide. */
  const densite=await page.evaluate(()=>{
    const shell=document.querySelector('#planPanel .timelineShell');
    const timeline=shell&&shell.querySelector('.appleTimeline');
    const suggestions=shell&&shell.querySelector('.pmvSuggest');
    const hint=document.querySelector('#planPanel .pmvHint');
    const legend=document.getElementById('planningHoursLegend');
    const follows=!!(timeline&&suggestions&&(timeline.compareDocumentPosition(suggestions)&Node.DOCUMENT_POSITION_FOLLOWING));
    return {follows,hintHidden:!!hint&&(hint.hidden||getComputedStyle(hint).display==='none'),legend:legend&&legend.textContent||'',head:(document.querySelector('#planPanel .pmvHead span')||{}).textContent||''};
  });
  expect(densite.follows).toBe(true);
  expect(densite.hintHidden).toBe(true);
  expect(densite.legend).toContain('Touchez l’heure');
  expect(densite.head).toBe('Visites');

  /* --- un seul encadrement ---------------------------------------------- */
  const cadres=await page.evaluate(()=>{
    const bordé=el=>{
      const s=getComputedStyle(el);
      const largeurs=['Top','Right','Bottom','Left'].map(c=>parseFloat(s['border'+c+'Width'])||0);
      const visible=['Top','Right','Bottom','Left'].some((c,i)=>largeurs[i]>0
        && s['border'+c+'Style']!=='none' && !/(^|,)\s*rgba\([^)]*,\s*0\)\s*$/.test(s['border'+c+'Color']));
      return visible?largeurs:null;
    };
    const panneau=document.querySelector('#planPanel .pmvSuggest');
    const dedans=[...panneau.querySelectorAll('*')].filter(bordé)
      .map(e=>(e.className||e.tagName)+' → '+JSON.stringify(bordé(e)));
    return {panneauBordé:!!bordé(panneau),descendantsBordés:dedans};
  });
  expect(cadres.panneauBordé).toBe(true);
  /* Les lignes ne portent que leur filet de séparation en haut : aucun cadre complet. */
  const cadresComplets=cadres.descendantsBordés.filter(d=>{
    const l=JSON.parse(d.split(' → ')[1]);
    return l[1]>0||l[2]>0||l[3]>0;                    /* droite, bas ou gauche */
  });
  expect(cadresComplets).toEqual([]);

  /* Le panneau ne reprend pas le fond blanc opaque du conteneur : il s'y fond. */
  const fonds=await page.evaluate(()=>{
    const p=document.querySelector('#planPanel .pmvSuggest');
    const l=document.querySelector('#planPanel .pmvSuggestRow');
    return {panneau:getComputedStyle(p).backgroundImage!=='none'||getComputedStyle(p).backgroundColor,
            ligne:getComputedStyle(l).backgroundColor,
            rayonPanneau:getComputedStyle(p).borderTopLeftRadius,
            rayonLigne:getComputedStyle(l).borderTopLeftRadius,
            ombre:getComputedStyle(p).boxShadow};
  });
  expect(fonds.ligne).toBe('rgba(0, 0, 0, 0)');
  expect(fonds.rayonLigne).toBe('0px');
  expect(parseFloat(fonds.rayonPanneau)).toBeGreaterThanOrEqual(14);
  expect(fonds.ombre).not.toBe('none');

  /* --- aucun débordement horizontal ------------------------------------- */
  const deborde=await page.evaluate(()=>{
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth)return'page';
    const shell=document.querySelector('#planPanel .timelineShell');
    const p=document.querySelector('#planPanel .pmvSuggest');
    if(p.getBoundingClientRect().right>shell.getBoundingClientRect().right+0.5)return'panneau hors du conteneur';
    const bad=[...document.querySelectorAll('#planPanel .pmvSuggest *')]
      .find(e=>e.scrollWidth>e.clientWidth+1&&e.clientWidth>0&&getComputedStyle(e).textOverflow!=='ellipsis');
    return bad?(bad.className||bad.tagName):'';
  });
  expect(deborde).toBe('');

  /* Le nom long est tronqué proprement plutôt que de pousser la ligne. */
  const nomLong=zone.locator('.pmvSuggestRow').nth(2).locator('.pmvSuggestName');
  expect(await nomLong.evaluate(e=>getComputedStyle(e).textOverflow)).toBe('ellipsis');

  /* --- cibles tactiles --------------------------------------------------- */
  const boutons=await zone.locator('.pmvSuggestAdd').evaluateAll(n=>n.map(b=>{
    const r=b.getBoundingClientRect();return {h:Math.round(r.height),w:Math.round(r.width)};
  }));
  expect(boutons).toHaveLength(3);
  for(const b of boutons){
    expect(b.h).toBeGreaterThanOrEqual(44);
    expect(b.w).toBeGreaterThanOrEqual(44);
  }

  /* --- marges régulières : même gouttière des deux côtés ---------------- */
  const gouttieres=await page.evaluate(()=>{
    const shell=document.querySelector('#planPanel .timelineShell').getBoundingClientRect();
    const p=document.querySelector('#planPanel .pmvSuggest').getBoundingClientRect();
    return {gauche:Math.round(p.left-shell.left),droite:Math.round(shell.right-p.right)};
  });
  expect(gouttieres.gauche).toBe(gouttieres.droite);
  expect(gouttieres.gauche).toBeGreaterThan(0);

  /* --- le titre est plus discret que le nom de magasin ------------------- */
  const hierarchie=await page.evaluate(()=>{
    const t=getComputedStyle(document.querySelector('#planPanel .pmvSuggestTitle'));
    const n=getComputedStyle(document.querySelector('#planPanel .pmvSuggestName'));
    const m=getComputedStyle(document.querySelector('#planPanel .pmvSuggestMeta'));
    return {titre:parseFloat(t.fontSize),nom:parseFloat(n.fontSize),meta:parseFloat(m.fontSize)};
  });
  expect(hierarchie.titre).toBeLessThan(hierarchie.nom);
  expect(hierarchie.meta).toBeLessThan(hierarchie.nom);

  /* --- l'idempotence du rendu est conservée ------------------------------ */
  const churn=await page.evaluate(async()=>{
    const host=document.querySelector('#planPanel .pmvSuggest');
    let n=0;const obs=new MutationObserver(m=>{n+=m.length});
    obs.observe(host,{childList:true,subtree:true,characterData:true});
    document.dispatchEvent(new CustomEvent('store-runner:planning-updated'));
    await new Promise(r=>setTimeout(r,2000));
    obs.disconnect();return n;
  });
  expect(churn).toBe(0);

  expect(errors).toEqual([]);
});
