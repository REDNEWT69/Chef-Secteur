from pathlib import Path

ROOT=Path('.')
OLD='20260917-daytabs208'
NEW='20260917-storereconcile209'

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    if old not in text: raise SystemExit(f'V209 patch: motif introuvable: {label}')
    if text.count(old)!=1: raise SystemExit(f'V209 patch: motif ambigu ({text.count(old)}): {label}')
    return text.replace(old,new,1)

# 1) Géocodeur partagé : même file Nominatim et même conformité que le profil.
p='profile-controller.js'; s=read(p)
s=replace_once(s,
"      return{lat:lat,lon:lon,address:String(row.display_name||text).trim()};",
"      const a=row.address||{},city=String(a.city||a.town||a.village||a.municipality||'').trim(),postcode=String(a.postcode||'').trim();\n      return{lat:lat,lon:lon,address:String(row.display_name||text).trim(),city:city,postcode:postcode};",
'forwardGeocode structuré')
s=replace_once(s,
"  window.storeRunnerToast=toast;\n  window.storeRunnerHasValidBase=validBase;",
"  window.storeRunnerToast=toast;\n  window.StoreRunnerGeocode={forward:forwardGeocode,reverse:reverseGeocode};\n  window.storeRunnerHasValidBase=validBase;",
'export géocodeur')
write(p,s)

# 2) UI performance : rattacher OU créer le magasin manquant, jamais silencieusement.
p='performance-ui-v190.js'; s=read(p)
s=replace_once(s,
"    +'#'+CARD_ID+'{margin-top:8px;padding:10px;border:1px solid #e2e6ed;border-radius:14px;background:#fbfcff;font-size:11.5px;line-height:1.5}'",
"    +'.srPerfCreateV209{margin-top:8px;padding:10px;border:1px solid #cfd9ea;border-radius:14px;background:#f8fbff}.srPerfCreateV209 h4{margin:0 0 8px;font-size:12px}.srPerfCreateGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.srPerfCreateGrid label{font-size:10.5px;color:#667085}.srPerfCreateGrid input{box-sizing:border-box;width:100%;min-height:42px;margin-top:4px;border:1px solid #d8dee8;border-radius:10px;padding:8px;background:#fff}.srPerfCreateWide{grid-column:1/-1}.srPerfCreateV209 small{display:block;margin-top:7px;color:#667085;line-height:1.35}@media(max-width:520px){.srPerfCreateGrid{grid-template-columns:1fr}}'\n    +'#'+CARD_ID+'{margin-top:8px;padding:10px;border:1px solid #e2e6ed;border-radius:14px;background:#fbfcff;font-size:11.5px;line-height:1.5}'",
'CSS création magasin')

anchor="/* Appariement manuel : une liste de candidats, jamais un choix fait à la place de\n   l'utilisateur. Le choix est retenu pour les semaines suivantes. */\n"
helpers=r'''function suggestedStoreFields(r){
  const raw=text(r&&r.retailer),upper=raw.toUpperCase(),labels={ED:'Electro Depot',CONFO:'Conforama',BOULANGER:'Boulanger',DARTY:'Darty',FNAC:'Fnac',BUT:'BUT',CARREFOUR:'Carrefour',AUCHAN:'Auchan'};
  const enseigne=labels[upper]||raw,original=text(r&&r.site);let site=original;
  if(raw&&site.toLowerCase().indexOf(raw.toLowerCase())===0)site=site.slice(raw.length).trim();
  const ville=text((site.split('/')[0]||site)).replace(/^[-–—]+|[-–—]+$/g,'').trim();
  return{enseigne:enseigne,ville:ville,sourceName:original||[enseigne,ville].filter(Boolean).join(' ')};
}
function createStoreEditor(r){
  const P=D(),defaults=suggestedStoreFields(r),box=el('div',undefined,'srPerfCreateV209'),grid=el('div',undefined,'srPerfCreateGrid'),fields={};
  box.append(el('h4','Ajouter ce magasin à mon secteur'));
  function field(label,key,value,type,wide){const l=el('label',label,wide?'srPerfCreateWide':'');const i=el('input');i.type=type||'text';i.value=value||'';i.dataset.v209Field=key;if(type==='number')i.step='any';l.append(i);grid.append(l);fields[key]=i;return i}
  field('Enseigne','enseigne',defaults.enseigne);field('Ville','ville',defaults.ville);
  field('Adresse','adresse','',null,true);field('Code postal','codePostal','');
  field('Latitude','lat','', 'number');field('Longitude','lon','', 'number');
  box.append(grid);
  const lookup=btn('⌕ Rechercher l’adresse',async()=>{
    const G=root.StoreRunnerGeocode;if(!G||typeof G.forward!=='function'){say('Recherche d’adresse indisponible. Tu peux compléter les champs manuellement.',true);return}
    lookup.disabled=true;lookup.textContent='⌕ Recherche…';
    try{
      const q=[text(fields.enseigne.value),text(r.site),text(fields.ville.value)].filter(Boolean).join(' '),found=await G.forward(q);
      fields.adresse.value=found.address||fields.adresse.value;fields.ville.value=found.city||fields.ville.value;fields.codePostal.value=found.postcode||fields.codePostal.value;
      fields.lat.value=Number(found.lat).toFixed(6);fields.lon.value=Number(found.lon).toFixed(6);say('Adresse trouvée ✓ Vérifie puis ajoute le magasin.');
    }catch(e){say(text(e&&e.message)||'Adresse introuvable.',true)}finally{lookup.disabled=false;lookup.textContent='⌕ Rechercher l’adresse'}
  });
  const add=btn('＋ Ajouter au secteur',()=>{
    try{
      const R=root.RegionStores;if(!R||typeof R.commit!=='function')throw new Error('Ajout magasin indisponible. Recharge Store Runner.');
      const enseigne=text(fields.enseigne.value),ville=text(fields.ville.value),adresse=text(fields.adresse.value),codePostal=text(fields.codePostal.value),lat=Number(fields.lat.value),lon=Number(fields.lon.value);
      if(!enseigne||!ville||!adresse||!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Enseigne, ville, adresse et coordonnées sont obligatoires. Utilise « Rechercher l’adresse » ou complète-les manuellement.');
      const slug=(P&&P.norm?P.norm(enseigne+' '+ville):String(enseigne+' '+ville).toLowerCase()).replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').slice(0,46)||'magasin';
      const store={id:'perf-'+slug+'-'+Date.now().toString(36),enseigne:enseigne,ville:ville,adresse:adresse,codePostal:codePostal,dept:codePostal.slice(0,2),lat:lat,lon:lon,freq:'Mensuel',intervalDays:30,priority:3,active:true,products:['À confirmer'],source:'Fichier performance '+text(oWeek()),sourceName:defaults.sourceName,sourceFetchedAt:new Date().toISOString()};
      if(R.duplicate(store,stores()))throw new Error('Doublon probable : rattache plutôt cette ligne à un magasin déjà présent.');
      if(R.commit([store])!==1)throw new Error('Ce magasin existe déjà ou n’a pas pu être ajouté.');
      P.rememberMatch(db(),r.key,store.id);say('Magasin ajouté et rattaché ✓ '+enseigne+' · '+ville);render();
    }catch(e){say(text(e&&e.message)||'Ajout impossible.',true)}
  },'primary');
  box.append(lookup,add,el('small','Aucun ajout automatique : vérifie toujours l’adresse avant validation. Recherche d’adresse : © OpenStreetMap contributors.'));
  return box;
}
function oWeek(){return activeWeek||''}
'''
if anchor not in s: raise SystemExit('V209 patch: ancre resolver absente')
s=s.replace(anchor,helpers+anchor,1)
old_resolver="""function resolver(r,o){
  const P=D(),wrap=el('div'),select=el('select');
  select.append(Object.assign(el('option','Rattacher à un magasin…'),{value:''}));
  for(const s of stores())select.append(Object.assign(el('option',text(s.enseigne)+' · '+text(s.ville)),{value:String(s.id)}));
  select.style.minHeight='44px';select.style.width='100%';select.style.marginTop='8px';
  select.onchange=()=>{if(!select.value)return;P.rememberMatch(db(),r.key,select.value);say('Rattachement enregistré : il sera réutilisé les semaines suivantes.');render()};
  wrap.append(select);return wrap;
}
"""
new_resolver="""function resolver(r,o){
  const P=D(),wrap=el('div'),select=el('select'),create=btn('＋ Ajouter ce magasin à mon secteur',()=>{const old=wrap.querySelector('.srPerfCreateV209');if(old){old.remove();create.textContent='＋ Ajouter ce magasin à mon secteur';return}wrap.append(createStoreEditor(r));create.textContent='Masquer le formulaire'});
  select.append(Object.assign(el('option','Rattacher à un magasin…'),{value:''}));
  for(const s of stores())select.append(Object.assign(el('option',text(s.enseigne)+' · '+text(s.ville)),{value:String(s.id)}));
  select.style.minHeight='44px';select.style.width='100%';select.style.marginTop='8px';
  select.onchange=()=>{if(!select.value)return;P.rememberMatch(db(),r.key,select.value);say('Rattachement enregistré : il sera réutilisé les semaines suivantes.');render()};
  wrap.append(select,create);return wrap;
}
"""
s=replace_once(s,old_resolver,new_resolver,'resolver V209')
s=replace_once(s,
"  const notes=[board.counts.nodata+' sans data',board.counts.unmatched+' non rattaché'+(board.counts.unmatched>1?'s':'')];",
"  const matched=board.counts.total-board.counts.unmatched,notes=[matched+' rattaché'+(matched>1?'s':'')+' sur '+board.counts.total,board.counts.nodata+' sans data',board.counts.unmatched+' non rattaché'+(board.counts.unmatched>1?'s':'')];",
'compteur rattachement')
s=replace_once(s,
"    ['À surveiller',board.rows.filter(r=>r.prio==='watch'),{week:board.week},''],\n    ['Sans data',board.rows.filter(r=>r.prio==='nodata'),{week:board.week},'']",
"    ['À surveiller',board.rows.filter(r=>r.prio==='watch'),{week:board.week,resolve:true},''],\n    ['Sans data',board.rows.filter(r=>r.prio==='nodata'),{week:board.week,resolve:true},'']",
'résolution toutes priorités')
s=replace_once(s,
"const api={open,install,importFile,renderStoreCard,visitsFor};",
"const api={open,install,importFile,renderStoreCard,visitsFor,suggestedStoreFields};",
'export helper V209')
write(p,s)

# 3) Tests V209.
node_test=r'''const assert=require('node:assert/strict');
const fs=require('fs');
const UI=require('../performance-ui-v190.js');
const fields=UI.suggestedStoreFields({retailer:'BOULANGER',site:'BOULANGER AUBIERE / Clermont'});
assert.equal(fields.enseigne,'Boulanger');
assert.equal(fields.ville,'AUBIERE');
assert.equal(fields.sourceName,'BOULANGER AUBIERE / Clermont');
const ui=fs.readFileSync('performance-ui-v190.js','utf8');
assert.match(ui,/Ajouter ce magasin à mon secteur/);
assert.match(ui,/RegionStores/);
assert.match(ui,/R\.commit\(\[store\]\)/);
assert.match(ui,/P\.rememberMatch\(db\(\),r\.key,store\.id\)/);
assert.match(ui,/Doublon probable/);
assert.match(ui,/rattaché.*sur/);
assert.doesNotMatch(ui,/state\.plan\s*=|state\.plan\[/,'V209 ne doit jamais modifier le planning');
const profile=fs.readFileSync('profile-controller.js','utf8');
assert.match(profile,/window\.StoreRunnerGeocode=\{forward:forwardGeocode,reverse:reverseGeocode\}/);
assert.match(profile,/postcode:postcode/);
console.log('performance-store-reconcile-v209: OK · Aubière prérempli, création explicite, dédoublonnage et mapping persisté');
'''
write('tests/performance-store-reconcile-v209.test.cjs',node_test)

browser_test=r'''const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('V209 crée explicitement un magasin performance manquant sans toucher au planning',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e&&e.message||e)));
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.StoreRunnerPerformanceV190&&window.StoreRunnerPerformanceUIV190&&window.RegionStores&&window.state&&window.__chefStorage);
  const before=await page.evaluate(()=>{
    const P=window.StoreRunnerPerformanceV190,db=window.__chefStorage;
    window.state.stores=[];
    window.state.plan={Lundi:[],Mardi:[],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]};
    const plan=JSON.stringify(window.state.plan);
    P.saveSnapshot(db,{week:'W34',targetPdm:42.5,targetSource:'explicite',importedAt:'2026-09-17T12:00:00Z',rows:[{key:'boulanger|boulanger aubiere clermont',retailer:'BOULANGER',site:'BOULANGER AUBIERE / Clermont',prio:'P1',pdmYtd:24.2,deltaYtd:-18.3,evolYtd:-42.5,weeks:{W34:25.8},sellOutWeeks:{},comment:''}]});
    window.StoreRunnerPerformanceUIV190.open();return plan;
  });
  const sheet=page.locator('#srPerfSheet');await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('0 rattaché sur 1');
  await page.getByRole('button',{name:'＋ Ajouter ce magasin à mon secteur'}).click();
  await expect(page.locator('[data-v209-field="ville"]')).toHaveValue('AUBIERE');
  await page.locator('[data-v209-field="adresse"]').fill('10 rue des Chazots');
  await page.locator('[data-v209-field="codePostal"]').fill('63170');
  await page.locator('[data-v209-field="lat"]').fill('45.751');
  await page.locator('[data-v209-field="lon"]').fill('3.112');
  await page.getByRole('button',{name:'＋ Ajouter au secteur'}).click();
  await expect(sheet).toContainText('1 rattaché sur 1');
  const result=await page.evaluate((before)=>{
    const P=window.StoreRunnerPerformanceV190,db=window.__chefStorage,store=window.state.stores[0],mapping=P.readStore(db).mapping;
    return{count:window.state.stores.length,store,mapped:mapping['boulanger|boulanger aubiere clermont'],planStable:JSON.stringify(window.state.plan)===before,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  },before);
  expect(result.count).toBe(1);expect(result.store.enseigne).toBe('Boulanger');expect(result.store.ville).toBe('AUBIERE');expect(result.mapped).toBe(result.store.id);expect(result.planStable).toBe(true);expect(result.overflow).toBeLessThanOrEqual(1);expect(errors).toEqual([]);
});
'''
write('tests/performance-store-reconcile-v209-browser.spec.cjs',browser_test)

# 4) CI : nouveaux gardes Node + 390px.
p='.github/workflows/reliability-checks.yml'; s=read(p)
s=replace_once(s,
"      - run: node tests/performance-inlinestr-v191.test.cjs\n",
"      - run: node tests/performance-inlinestr-v191.test.cjs\n      - run: node tests/performance-store-reconcile-v209.test.cjs\n",
'CI Node V209')
s=replace_once(s,
"tests/performance-assistant-browser.spec.cjs tests/cuisiniste-contracts-browser.spec.cjs",
"tests/performance-assistant-browser.spec.cjs tests/performance-store-reconcile-v209-browser.spec.cjs tests/cuisiniste-contracts-browser.spec.cjs",
'CI mobile V209')
write(p,s)

# 5) Bump de build/version après V208.
for p in ['index.html','sw.js','tests/terrain-planning-runtime.test.cjs','tests/v182-field-fixes.test.cjs']:
    s=read(p)
    if OLD not in s: raise SystemExit(f'V209 patch: {OLD} absent de {p}')
    s=s.replace(OLD,NEW)
    if p.startswith('tests/'):
        s=s.replace("displayVersion, '208'","displayVersion, '209'").replace("displayVersion,'208'","displayVersion,'209'")
    write(p,s)
write('version.json','{\n  "latestBuild": "'+NEW+'",\n  "displayVersion": "209",\n  "channel": "stable",\n  "releasedAt": "2026-09-17"\n}\n')

# Aucun reliquat de l'ancien build dans les fichiers qui figent la version.
for p in ['index.html','sw.js','version.json','tests/terrain-planning-runtime.test.cjs','tests/v182-field-fixes.test.cjs']:
    if OLD in read(p): raise SystemExit('V209 patch: ancien build restant dans '+p)

print('V209 patch appliqué')
