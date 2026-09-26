const {test,expect}=require('@playwright/test');

const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
const TEXT_FIELDS='input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="tel"],input[type="url"],input[type="password"],input[type="number"],input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"],select,textarea';

test.use({
  viewport:{width:390,height:844},
  isMobile:true,
  hasTouch:true,
  deviceScaleFactor:1,
  serviceWorkers:'block',
  screenshot:'only-on-failure',
  trace:'retain-on-failure'
});

async function assertStableViewport(page,stage){
  const state=await page.evaluate(selector=>{
    const visible=[...document.querySelectorAll(selector)].filter(el=>{
      const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
      return rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden';
    });
    return{
      fields:visible.map(el=>({id:el.id||el.name||el.tagName,fontSize:parseFloat(getComputedStyle(el).fontSize)})),
      scale:window.visualViewport?window.visualViewport.scale:1,
      innerWidth:window.innerWidth,
      clientWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      htmlTouchAction:getComputedStyle(document.documentElement).touchAction,
      bodyTouchAction:getComputedStyle(document.body).touchAction,
      htmlTransform:getComputedStyle(document.documentElement).transform,
      bodyTransform:getComputedStyle(document.body).transform
    };
  },TEXT_FIELDS);
  expect(state.fields.length,stage+' doit exposer au moins un champ').toBeGreaterThan(0);
  expect(state.fields.filter(field=>field.fontSize<16),stage+' ne doit contenir aucun champ sous 16 px').toEqual([]);
  expect(state.scale,stage+' doit conserver l’échelle normale').toBe(1);
  expect(state.innerWidth,stage+' doit conserver le viewport 390 px').toBe(390);
  expect(state.clientWidth,stage+' doit conserver la largeur du document').toBe(390);
  expect(state.scrollWidth,stage+' ne doit pas créer de débordement horizontal').toBeLessThanOrEqual(391);
  expect(state.htmlTouchAction).not.toBe('none');
  expect(state.bodyTouchAction).not.toBe('none');
  expect(state.htmlTransform).toBe('none');
  expect(state.bodyTransform).toBe('none');
}

async function focusAndBlur(page,selector,value,stage){
  const field=page.locator(selector);
  await expect(field).toBeVisible();
  await field.focus();
  if(value!==undefined)await field.fill(value);
  await expect(field).toBeFocused();
  await assertStableViewport(page,stage+' focus');
  await field.blur();
  await expect(field).not.toBeFocused();
  await assertStableViewport(page,stage+' blur/clavier fermé');
}

test('V262 empêche l’auto-zoom des champs sans bloquer le zoom accessible',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error&&error.message||error)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&typeof window.renderAll==='function'&&window.StoreRunnerNavigation);

  const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
  expect(viewport).toContain('initial-scale=1');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/(?:maximum|minimum)-scale/i);

  await page.evaluate(()=>{
    const store={id:'zoom-store',enseigne:'Darty',ville:'Lyon',adresse:'1 rue Test',lat:45.76,lon:4.83,active:true,priority:3,products:['Blanc','Brun']};
    state.stores=[store];
    state.notes={};
    state.plan={Lundi:[store],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    state.appointments=[];
    state.calendarEvents=[];
    renderAll();
    goTab('planPanel');
  });

  await page.locator('#planningSettingsShortcut').click();
  await focusAndBlur(page,'#target','12','réglages planning input');
  await focusAndBlur(page,'#strategy',undefined,'réglages planning select');
  await page.locator('[data-planning-settings-close]').click();
  await expect(page.locator('#planningSettings')).not.toBeVisible();

  await page.evaluate(()=>toggleAssistant());
  await focusAndBlur(page,'#assistantInput','Test zoom','assistant bottom sheet input');
  await page.evaluate(()=>toggleAssistant());
  await expect(page.locator('#assistantPanel')).not.toBeVisible();

  await page.evaluate(()=>openStoreQuick('zoom-store'));
  await focusAndBlur(page,'#sqNote','Note terrain','fiche magasin bottom sheet textarea');
  await page.evaluate(()=>closeStoreQuick());
  await expect(page.locator('#storeQuickSheet')).not.toHaveClass(/open/);

  await page.evaluate(()=>openAppointment(null,'zoom-store'));
  await focusAndBlur(page,'#aStore',undefined,'rendez-vous modal select');
  await focusAndBlur(page,'#aNote','Préparer la visite','rendez-vous modal textarea');
  await page.locator('#apptDlg').evaluate(dialog=>dialog.close());
  await expect(page.locator('#apptDlg')).not.toBeVisible();

  await assertStableViewport(page,'après fermeture des panneaux et du clavier');
  expect(errors).toEqual([]);
});
