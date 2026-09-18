from pathlib import Path
p=Path('tests/terrain-planning-browser.spec.cjs')
s=p.read_text()
old="""  const chosen=await page.evaluate(() => {
    const route=window.state.plan.Lundi||[];
    const id=route[1]&&route[1].id;
    if(!id)throw new Error('Deuxième magasin du lundi absent');
    window.openStoreQuick(id,'Lundi');
    return {id,before:route.map(s=>s.id)};
  });
  const start=page.locator('#startQuickStoreFirstBtn');
  await expect(start).toBeVisible();
  const startBox=await start.boundingBox();
  if(!startBox)throw new Error('Bouton Commencer par ici introuvable');
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  await start.tap();
  await page.waitForFunction(id => window.state.plan.Lundi[0] && window.state.plan.Lundi[0].id===id, chosen.id);
  const after=await page.evaluate(() => window.state.plan.Lundi.map(s=>s.id));
  expect(after[0]).toBe(chosen.id);
  expect(new Set(after)).toEqual(new Set(chosen.before));
  expect(after).toHaveLength(chosen.before.length);"""
new="""  const chosen=await page.evaluate(() => {
    const days=['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
    const day=days.find(d=>(window.state.plan[d]||[]).length>=2);
    if(!day)throw new Error('Aucune journée avec deux magasins pour tester Commencer par ici');
    const route=window.state.plan[day]||[],id=route[1]&&route[1].id;
    window.openStoreQuick(id,day);
    return {id,day,before:route.map(s=>s.id)};
  });
  const start=page.locator('#startQuickStoreFirstBtn');
  await expect(start).toBeVisible();
  const startBox=await start.boundingBox();
  if(!startBox)throw new Error('Bouton Commencer par ici introuvable');
  expect(startBox.height).toBeGreaterThanOrEqual(44);
  await start.tap();
  await page.waitForFunction(({id,day}) => window.state.plan[day][0] && window.state.plan[day][0].id===id, {id:chosen.id,day:chosen.day});
  const after=await page.evaluate(day => window.state.plan[day].map(s=>s.id), chosen.day);
  expect(after[0]).toBe(chosen.id);
  expect(new Set(after)).toEqual(new Set(chosen.before));
  expect(after).toHaveLength(chosen.before.length);"""
if new not in s:
    if old not in s:
        raise SystemExit('bloc Commencer par ici introuvable')
    s=s.replace(old,new,1)
p.write_text(s)
Path('.github/workflows/v220-test-robust-once.yml').unlink(missing_ok=True)
Path('.github/v220_test_patch.py').unlink(missing_ok=True)
