const { test, expect, devices } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { empty } = require('../store-runner-visit-model.js');
const URL = process.env.STORE_RUNNER_E2E_URL || 'http://127.0.0.1:4173/';
const strip = ({ defaultBrowserType, ...rest }) => rest;
const HOME = '#homeRunnerV270 .srRunner';
const profiles = [
  ['Android390', { ...strip(devices['Pixel 7']), viewport: { width: 390, height: 844 } }],
  ['Android360', strip(devices['Galaxy S8'])],
  ['iPhone14', strip(devices['iPhone 14'])]
];
test.use({ timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
async function prepare(page) {
  await page.clock.setFixedTime(new Date('2026-09-23T10:00:00+02:00'));
  const store = { id: 'presence-test', enseigne: 'Darty', ville: 'Ville Test', adresse: '1 rue Test', dept: '69', lat: 45.75, lon: 4.85, active: true, priority: 3, intervalDays: 30, freq: 'Mensuel', visitMinutes: 60 };
  await page.addInitScript(({ store, business }) => {
    if (!localStorage.getItem('runner-presence-fixture')) {
      localStorage.setItem('store-runner-onboarding-v1', JSON.stringify({ version: 1, status: 'complete', step: 4 }));
      localStorage.setItem('sector_planner_universal_v1', JSON.stringify({ schemaVersion: 5, profile: { sectorName: 'Test', baseName: 'Base Test', baseLat: 45.7, baseLon: 4.8, overnight: 'never' }, settings: { days: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'], startTime: '08:30', endTime: '18:00', weekDate: '2026-09-21', target: 15, visitMinutes: 60 }, stores: [store], plan: { Lundi: [], Mardi: [], Mercredi: [store], Jeudi: [], Vendredi: [], Samedi: [] }, visits: {}, notes: {}, included: {}, excluded: {}, locks: {}, appointments: [], calendarEvents: [], manualWeekEdits: {}, businessV2: business }));
      localStorage.setItem('runner-presence-fixture', '1');
    }
    const audit = window.__presenceAudit = { effects: [], timers: new Set(), intervals: 0, listeners: [] };
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) {
      const effect = animate.call(this, frames, options);
      if (options?.id?.startsWith('runner-')) audit.effects.push({ effect, frames, options, target: this });
      return effect;
    };
    const set = window.setTimeout, clear = window.clearTimeout, interval = window.setInterval;
    window.setTimeout = function(fn, ms, ...args) {
      if (!/runner-visual\.js/.test(new Error().stack)) return set.call(this, fn, ms, ...args);
      let id; id = set.call(this, (...values) => { audit.timers.delete(id); fn(...values); }, ms, ...args); audit.timers.add(id); return id;
    };
    window.clearTimeout = function(id) { audit.timers.delete(id); return clear.call(this, id); };
    window.setInterval = function(...args) { if (/runner-visual\.js/.test(new Error().stack)) audit.intervals++; return interval.apply(this,args); };
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(type, fn, ...args) { if (/runner-visual\.js/.test(new Error().stack)) audit.listeners.push({target:this,type,fn}); return add.call(this, type, fn, ...args); };
    EventTarget.prototype.removeEventListener = function(type, fn, ...args) { if (/runner-visual\.js/.test(new Error().stack)) audit.listeners=audit.listeners.filter(x=>x.target!==this||x.type!==type||x.fn!==fn); return remove.call(this, type, fn, ...args); };
  }, { store, business: empty() });
}
async function boot(page) {
  await prepare(page);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator(HOME)).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#homeRunnerV270 .srRunner')?.getAnimations().length === 1);
  await page.addStyleTag({content:'aside[role="status"]{display:none!important}'});
}
const active = page => page.evaluate(() => __presenceAudit.effects.filter(x => !['idle','finished'].includes(x.effect.playState)).map(x=>({ id:x.options.id, connected:x.target.isConnected, duration:x.options.duration, iterations:x.options.iterations })));
const snapshot = page => page.evaluate(() => JSON.stringify({state, main:__chefStorage.getItem('sector_planner_universal_v1'), archive:__chefStorage.getItem('chef_sector_plan_archive_v1')}));
async function finishScene(page) {
  await page.evaluate(() => document.querySelector('#homeRunnerV270 .srRunner').getAnimations().forEach(a=>a.finish()));
  await expect.poll(async()=> (await active(page)).some(x=>x.id==='runner-idle')).toBe(true);
}
async function pose(page, ms) {
  await page.evaluate(ms => __presenceAudit.effects.filter(x=>x.options.id==='runner-scene' && x.target.closest('#homeRunnerV270')).forEach(x=>{x.effect.pause();x.effect.currentTime=ms}), ms);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function shot(page, name) {
  if (!process.env.RUNNER_SHOTS_DIR) return;
  fs.mkdirSync(process.env.RUNNER_SHOTS_DIR,{recursive:true});
  await page.screenshot({path:path.join(process.env.RUNNER_SHOTS_DIR,name+'.png')});
}
for (const [name, device] of profiles) test.describe(name,()=>{
  test.use(device);
  test('scène lente : masque, tête, clignements, regard, pause, trajet, arrivée',async({page})=>{
    await boot(page);
    const original = await snapshot(page);
    await pose(page,600); await shot(page,name+'-1-cache');
    const meta = await page.evaluate(() => {
      const moves=__presenceAudit.effects.filter(x=>x.options.id==='runner-scene'&&x.target.matches('.srRunner'));
      const a=moves[0]; return {duration:a.options.duration, iterations:a.options.iterations, frames:a.frames, veil:StoreRunnerBoot.settled(), count:moves.length};
    });
    expect(meta).toMatchObject({duration:8000,iterations:1,veil:true,count:1});
    expect(meta.frames.every(f=>f.opacity===1)).toBe(true);
    await pose(page,2800); await shot(page,name+'-2-tete');
    await pose(page,3216); await shot(page,name+'-3-clignement');
    await pose(page,4450); await shot(page,name+'-3b-regard');
    await pose(page,5100);
    const still=await page.locator(HOME).evaluate(el=>getComputedStyle(el).transform);
    const headStill=await page.locator(HOME+' .rnHead').evaluate(el=>getComputedStyle(el).transform);
    await pose(page,5900); expect(await page.locator(HOME).evaluate(el=>getComputedStyle(el).transform)).toBe(still);
    expect(await page.locator(HOME+' .rnHead').evaluate(el=>getComputedStyle(el).transform)).toBe(headStill);
    await shot(page,name+'-4-pause');
    await pose(page,6900); await shot(page,name+'-5-deplacement');
    await finishScene(page); await shot(page,name+'-6-arrivee');
    expect(await snapshot(page)).toBe(original);
    expect(await page.locator(HOME+' .rnArt').count()).toBe(1);
    expect(await page.locator(HOME).evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  });
  test('arrivée : le trajet ralentit sans s’arrêter puis repartir, la tête voyage avec le corps',async({page})=>{
    await boot(page);
    // Échantillonnage de la timeline réelle (10 ms), pas un calcul de courbe : c'est ce que l'œil suit.
    const run=await page.evaluate(()=>{
      const scene=target=>__presenceAudit.effects.find(x=>x.options.id==='runner-scene'&&x.target.matches(target));
      const host=scene('.srRunner'),head=scene('.rnHead');
      host.effect.pause();head.effect.pause();
      const matrix=el=>{const t=getComputedStyle(el).transform;return t==='none'?new DOMMatrix():new DOMMatrix(t)};
      const out=[];
      for(let t=6000;t<=8000;t+=10){
        host.effect.currentTime=t;head.effect.currentTime=t;
        const h=matrix(host.target),g=matrix(head.target);
        out.push({t,left:Math.hypot(h.e,h.f),headX:g.e});
      }
      return out;
    });
    const speed=run.slice(1).map((s,i)=>Math.abs(run[i].left-s.left)/0.01);
    const peak=speed.indexOf(Math.max(...speed));
    // 1. jamais de recul, et le trajet va bien jusqu'à la place finale.
    expect(run.every((s,i)=>i===0||s.left<=run[i-1].left+0.01),'jamais de recul').toBe(true);
    expect(run.at(-1).left,'arrive exactement à sa place').toBeLessThan(0.5);
    // 2. après la pointe, la vitesse ne fait que baisser : pas d'arrêt suivi d'une reprise.
    const reaccel=speed.slice(peak+1).map((v,i)=>v-speed[peak+i]).filter(d=>d>2);
    expect(reaccel,'aucune reprise de vitesse après la pointe').toEqual([]);
    // 3. mouvement doux : pas de saut de vitesse d'une mesure à l'autre, pointe bornée, arrêt à zéro.
    const jump=Math.max(...speed.slice(1).map((v,i)=>Math.abs(v-speed[i])));
    expect(jump,'aucun à-coup de vitesse en 10 ms').toBeLessThan(14);
    expect(speed[peak],'pointe calme : sous 1,4 fois la distance par seconde').toBeLessThan(1.4*run[0].left);
    expect(speed.slice(-5).every(v=>v<6),'stabilisation : vitesse nulle à l’arrivée').toBe(true);
    // 4. la tête revient sur le corps pendant le même trajet, avec la même douceur, et s'arrête avec lui.
    const headSpeed=run.slice(1).map((s,i)=>Math.abs(s.headX-run[i].headX)/0.01);
    expect(Math.max(...headSpeed.slice(0,10)),'la tête ne part pas d’un coup à 6 s').toBeLessThan(10);
    expect(Math.max(...headSpeed.slice(-60)),'la tête ne s’arrête pas net avant le corps').toBeLessThan(headSpeed.reduce((a,b)=>Math.max(a,b),0));
    expect(Math.abs(run.at(-1).headX),'la tête est revenue sur le corps').toBeLessThan(0.5);
    expect(Math.max(...headSpeed.slice(1).map((v,i)=>Math.abs(v-headSpeed[i]))),'aucun à-coup sur la tête').toBeLessThan(12);
  });
  test('idle variable, états prioritaires, reprise neutre et cancellation exhaustive',async({page})=>{
    await boot(page); await finishScene(page);
    const before=await snapshot(page);
    // Un hôte de test utilise exactement le contrat public, sans donnée métier.
    const result=await page.evaluate(()=>{
      const slot=document.createElement('div'); document.body.append(slot);
      const runner=Runner.mount(slot,{decorative:true}); const svg=runner.el.querySelector('.rnArt'); runner.setPresence(true);
      const durations=[], doubles=[], looks=[];
      const random=Math.random;let seed=506;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
      for(let i=0;i<18;i++){
        const cycle=__presenceAudit.effects.filter(x=>x.options.id==='runner-idle'&&x.target.closest('.srRunner')===runner.el&&x.target.matches('.rnEyes')).at(-1);
        durations.push(cycle.options.duration);doubles.push(cycle.frames.filter(f=>f.transform.includes('scaleY')).length);looks.push(cycle.frames.some(f=>f.transform.includes('translateX')));
        cycle.effect.finish(); // callbacks explicitly tested below, without waiting 80 seconds
        cycle.effect.onfinish();
      }
      const states=[];
      for(const state of ['analyzing','alert','success']){
        runner.setState(state);states.push(!runner.isIdle());runner.setState('neutral');states.push(runner.isIdle());
      }
      Math.random=random;
      const sameSvg=runner.el.querySelector('.rnArt')===svg;
      const cycle=__presenceAudit.effects.filter(x=>x.options.id==='runner-idle'&&x.target.closest('.srRunner')===runner.el&&x.target.matches('.rnEyes')).at(-1);
      const stale=cycle.effect.onfinish;
      runner.showMessage('Test',{duration:4000});runner.returnToRest();runner.setPresence(false);stale();
      const stopped=!runner.isIdle()&&!runner.isMoving()&&runner.el.getAnimations({subtree:true}).length===0;
      runner.destroy();slot.remove();
      return {durations,doubles,looks,states,sameSvg,stopped};
    });
    expect(new Set(result.durations).size).toBeGreaterThan(12);
    expect(result.durations.every(x=>x>=2680&&x<=5100)).toBe(true);
    expect(result.doubles).toContain(2);expect(result.looks).toContain(true);
    expect(result).toMatchObject({states:Array(6).fill(true),sameSvg:true,stopped:true});
    await page.waitForTimeout(600);expect(await snapshot(page)).toBe(before);
    expect((await active(page)).every(x=>x.connected&&x.iterations===1)).toBe(true);
    expect(await page.evaluate(()=>__presenceAudit.intervals)).toBe(0);
    await shot(page,name+'-7-idle');
  });
  test('Planning, Magasins, Assistant, Plus → Accueil ; navigation rapide et rerenders',async({page})=>{
    await boot(page); await finishScene(page);
    const before=await snapshot(page);
    for(const screen of ['planPanel','storesPanel','assistant','more']){
      await page.evaluate(screen=>screen==='assistant'?toggleAssistant():screen==='more'?document.querySelector('[data-more]').click():goTab(screen),screen);
      await expect(page.locator(HOME)).toHaveCount(0);
      expect((await active(page)).every(x=>x.connected)).toBe(true);
      await page.evaluate(screen=>screen==='assistant'?toggleAssistant():screen==='more'?document.querySelector('.moreClose').click():goTab('homePanel'),screen);
      await expect(page.locator(HOME)).toHaveCount(1);
      await expect.poll(async()=> (await active(page)).some(x=>x.id==='runner-return')).toBe(true);
      if(screen==='planPanel'||screen==='assistant')await shot(page,name+(screen==='planPanel'?'-8-planning-home':'-9-assistant-home'));
      await page.locator(HOME).evaluate(el=>el.getAnimations().forEach(a=>a.finish()));
    }
    await page.evaluate(()=>{toggleAssistant();toggleAssistant()});
    await expect.poll(async()=> (await active(page)).some(x=>x.id==='runner-return')).toBe(true);
    await page.evaluate(()=>toggleAssistant());
    await expect(page.locator('#srAssistantRunner .srRunner')).toBeVisible();
    await page.evaluate(()=>{window.__oldAssistantEffects=__presenceAudit.effects.filter(x=>x.target.closest('#srAssistantRunner')&&x.options.id==='runner-idle').map(x=>x.effect);toggleAssistant();toggleAssistant()});
    expect(await page.evaluate(()=>__oldAssistantEffects.every(x=>x.playState==='idle'))).toBe(true);
    await page.evaluate(()=>toggleAssistant());
    for(let i=0;i<12;i++){
      await page.evaluate(()=>{goTab('storesPanel');goTab('homePanel')});
      await expect(page.locator(HOME)).toHaveCount(1);
      await page.evaluate(()=>{document.getElementById('premiumHomeV2').__lastMarkup=null;document.dispatchEvent(new CustomEvent('store-runner:opportunities-updated'))});
      await page.waitForTimeout(90);
    }
    expect(await page.evaluate(()=>__presenceAudit.effects.filter(x=>x.options.id==='runner-scene'&&x.target.matches('.srRunner')).length)).toBe(1);
    await page.evaluate(()=>goTab('storesPanel')); await expect(page.locator(HOME)).toHaveCount(0);
    await expect.poll(async()=> (await active(page)).length).toBe(0);
    expect(await page.evaluate(()=>({timers:__presenceAudit.timers.size,listeners:__presenceAudit.listeners.length}))).toEqual({timers:0,listeners:0});
    expect(await snapshot(page)).toBe(before);
  });
  test('succès Planning suspendu puis repris : le délai restant reste celui du propriétaire',async({page})=>{
    await boot(page);await finishScene(page);
    await page.evaluate(()=>{
      const week='2026-09-21',plan={...state.plan,Mercredi:[state.stores[0]]};
      state.settings.weekDate=week;state.plan=plan;
      __chefStorage.setItem('chef_sector_plan_archive_v1',JSON.stringify({[week]:{weekMonday:week,plan}}));
      renderAll();goTab('planPanel');StoreRunnerPeriodDaySlider.openDate('2026-09-23');
    });
    await expect(page.locator('#planningRunnerV269 .srRunner')).toBeVisible();
    // Ce délai appartient à l'hôte : Date doit avancer aussi, contrairement aux poses visuelles.
    await page.clock.setSystemTime(new Date('2026-09-23T10:00:00+02:00'));
    await page.evaluate(()=>dispatchEvent(new CustomEvent('chef-range-generated')));
    await expect(page.locator('#planningRunnerV269 .srRunner')).toHaveAttribute('data-state','success');
    await page.waitForTimeout(500);await page.evaluate(()=>toggleAssistant());await page.waitForTimeout(250);await page.evaluate(()=>toggleAssistant());
    await expect(page.locator('#planningRunnerV269 .srRunner')).toHaveAttribute('data-state','success');
    await expect(page.locator('#planningRunnerV269 .srRunner')).toHaveAttribute('data-state','neutral',{timeout:7500});
    await expect.poll(async()=> (await active(page)).some(x=>x.id==='runner-idle')).toBe(true);
    await page.evaluate(()=>goTab('storesPanel'));await expect.poll(async()=> (await active(page)).length).toBe(0);
  });
  test('reduced motion : changement système coupe immédiatement scène et idle',async({page})=>{
    await boot(page);await page.emulateMedia({reducedMotion:'reduce'});
    await expect.poll(async()=> (await active(page)).length).toBe(0);
    expect(await page.locator(HOME).evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
    await page.emulateMedia({reducedMotion:'no-preference'});
    await expect.poll(async()=> (await active(page)).some(x=>x.id==='runner-idle')).toBe(true);
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));
    await expect.poll(async()=> (await active(page)).length).toBe(0);
    await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow')));
    await expect.poll(async()=> (await active(page)).some(x=>x.id==='runner-idle')).toBe(true);
    await page.evaluate(()=>{const slot=document.createElement('div');document.body.append(slot);const runner=Runner.mount(slot,{decorative:true});runner.returnToRest();dispatchEvent(new PageTransitionEvent('pagehide'));dispatchEvent(new PageTransitionEvent('pageshow'));runner.setPresence(true);if(!runner.isIdle())throw new Error('legacy movement reactivation');runner.setPresence(false);runner.destroy();slot.remove()});
    await page.evaluate(()=>{const slot=document.createElement('div');document.body.append(slot);window.__deadlineRunner=Runner.mount(slot,{decorative:true});__deadlineRunner.setPresence(true);__deadlineRunner.setState('success',{resetAfter:1500});__deadlineRunner.showMessage('Test',{duration:1500})});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(1700);
    expect(await page.evaluate(()=>({state:__deadlineRunner.getState(),hidden:__deadlineRunner.el.querySelector('.srRunnerBubble').hidden}))).toEqual({state:'neutral',hidden:true});
    await page.evaluate(()=>{const slot=__deadlineRunner.el.parentNode;__deadlineRunner.destroy();slot.remove()});
    await page.evaluate(()=>goTab('planPanel'));await page.evaluate(()=>goTab('homePanel'));
    await expect(page.locator(HOME)).toHaveCount(1);expect(await active(page)).toEqual([]);
    await page.waitForLoadState('load');await page.reload({waitUntil:'load'});await expect(page.locator(HOME)).toBeVisible();expect(await active(page)).toEqual([]);
  });
});

test.describe('Preuve en temps réel et stabilité',()=>{
  test.use({ ...strip(devices['Pixel 7']),viewport:{width:390,height:844} });
  test('vidéo réelle : entrée, idle et les deux retours',async({browser},info)=>{
    test.skip(!process.env.RUNNER_SHOTS_DIR,'captures demandées explicitement');test.setTimeout(60000);
    const dir=path.resolve(process.env.RUNNER_SHOTS_DIR);
    const context=await browser.newContext({ ...strip(devices['Pixel 7']),viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'block',recordVideo:{dir,size:{width:390,height:844}} });
    const page=await context.newPage();await boot(page);
    await page.waitForTimeout(18000);
    await page.evaluate(()=>goTab('planPanel'));await page.waitForTimeout(1200);await page.evaluate(()=>goTab('homePanel'));await page.waitForTimeout(3800);
    await page.evaluate(()=>toggleAssistant());await page.waitForTimeout(1500);await page.evaluate(()=>toggleAssistant());await page.waitForTimeout(3800);
    const video=page.video();await context.close();await video.saveAs(path.join(dir,'runner-presence-temps-reel-390.webm'));await info.attach('scène réelle',{path:path.join(dir,'runner-presence-temps-reel-390.webm'),contentType:'video/webm'});
    fs.unlinkSync(await video.path());
  });
  test('Accueil 3 minutes : CPU, DOM, effets et sortie sans fuite',async({page,browserName},info)=>{
    test.skip(!process.env.RUNNER_STABILITY||browserName!=='chromium','mesure longue locale Chromium');test.setTimeout(220000);
    await boot(page);await finishScene(page);const before=await snapshot(page);
    const client=await page.context().newCDPSession(page);await client.send('Performance.enable');
    const measure=async()=>Object.fromEntries((await client.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
    await page.evaluate(()=>{window.__mutations=0;window.__observer=new MutationObserver(records=>__mutations+=records.length);__observer.observe(document.querySelector('#homeRunnerV270'),{subtree:true,attributes:true,childList:true,characterData:true})});
    const a=await measure(),wall=Date.now(),samples=[];
    for(let i=0;i<6;i++){await page.waitForTimeout(30000);samples.push({at:i*30+30,active:await active(page)});}
    const b=await measure();const result={seconds:(Date.now()-wall)/1000,taskSeconds:b.TaskDuration-a.TaskDuration,scriptSeconds:b.ScriptDuration-a.ScriptDuration,heapStart:a.JSHeapUsedSize,heapEnd:b.JSHeapUsedSize,samples,mutations:await page.evaluate(()=>__mutations)};
    expect(samples.every(s=>s.active.length>=2&&s.active.length<=3&&s.active.every(x=>x.connected&&x.iterations===1))).toBe(true);expect(result.mutations).toBe(0);expect(await snapshot(page)).toBe(before);
    await page.evaluate(()=>{__observer.disconnect();goTab('storesPanel')});await expect(page.locator(HOME)).toHaveCount(0);expect(await active(page)).toEqual([]);
    fs.writeFileSync(info.outputPath('presence-stability.json'),JSON.stringify(result,null,2));
    if(process.env.RUNNER_SHOTS_DIR)fs.writeFileSync(path.join(process.env.RUNNER_SHOTS_DIR,'presence-stability.json'),JSON.stringify(result,null,2));
    console.log('PRESENCE_STABILITY',JSON.stringify(result));
  });
});
