const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

test('Accueil V204 : cartes utiles, maximum quatre et aucun overflow à 390 px',async({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerHomeV204&&document.querySelector('#premiumHomeV2 .phGrid'));
  await page.waitForTimeout(350);

  const cards=page.locator('#premiumHomeV2 .phGrid .phCard');
  expect(await cards.count()).toBeLessThanOrEqual(4);
  const emptyValues=await cards.evaluateAll(rows=>rows.filter(row=>{
    const value=row.querySelector('.phValue')&&row.querySelector('.phValue').textContent.trim();
    const sub=row.querySelector('.phSub')&&row.querySelector('.phSub').textContent.trim();
    return !value||!sub||value==='Aucun'||/NaN/.test(value+' '+sub);
  }).length);
  expect(emptyValues).toBe(0);

  const model=await page.evaluate(()=>{
    const state={
      stores:[{id:'a',enseigne:'Boulanger',ville:'Alpha',active:true}],
      plan:{Lundi:['a'],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]},
      settings:{target:5},appointments:[],visits:{},
      businessV2:{visits:[],actions:[],opportunities:[],storeSnapshots:{}}
    };
    return StoreRunnerHomeV204.buildActivityCards(state,{now:new Date('2026-09-17T12:00:00+02:00'),pilotage:{rows:[]},performance:{rows:[]},opportunities:[],recommended:null,appointment:null});
  });
  expect(model.some(c=>c.id==='appointment')).toBe(false);
  expect(model).toHaveLength(1);
  expect(model[0].id).toBe('week');

  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
