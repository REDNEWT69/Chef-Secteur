/* Runner 3D Lab : garde-fous statiques. Le Lab est un environnement de comparaison isolé ; ce test prouve que
   la production n'en dépend pas, que le Runner actuel est intact et que le Lab ne sort pas de son bac à sable. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const manifest=JSON.parse(read('lab/runner-3d/manifest.json'));

// 1. Runner actuel : octets identiques à l'empreinte attendue par le Lab (et publiés sans copie).
const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'runner-visual.js'))).digest('hex');
assert(read('lab/runner-3d/lab.js').includes("EXPECTED_SHA='"+sha+"'"),'le Lab attend l’empreinte exacte de runner-visual.js (Runner actuel modifié ?)');
assert.equal(manifest.files['runner-visual.js'],'runner-visual.js','runner-visual.js est publié depuis la racine, jamais copié');
assert(!fs.existsSync(path.join(root,'lab/runner-3d/runner-visual.js')),'aucune copie de runner-visual.js dans lab/');

// 2. Le manifeste ne pointe que sur des fichiers existants, et la page n'en charge pas d'autres.
for(const [pub,src] of Object.entries(manifest.files))assert(fs.existsSync(path.join(root,src)),'fichier publié manquant : '+pub);
const page=read(manifest.page);
for(const m of page.matchAll(/<script[^>]*src="([^"]+)"/g))assert(manifest.files[m[1]],'script non publié : '+m[1]);
assert(!/<link[^>]+stylesheet/i.test(page),'CSS inline : aucune feuille externe');

// 3. La production ne connaît pas le Lab : ni index.html, ni sw.js, ni manifest PWA, ni version.
for(const f of ['index.html','sw.js','manifest.webmanifest','version.json','update-manager.js'])
  assert(!/lab\/runner-3d|runner3d|Runner3D|r3lab/.test(read(f)),f+' ne doit jamais référencer le Lab');
assert(!/lab\//.test(read('sw.js')),'sw.js ne met rien du Lab en cache');

// 4. Isolation du Lab : aucun réseau, aucun domaine de production, aucun stockage hors de ses deux préférences.
const labCode=['lab/runner-3d/lab.js','lab/runner-3d/runner3d.js'].map(read).join('\n')+page;
/* Seuls deux textes affichés citent le domaine pour dire qu'on ne le contacte jamais ; aucune URL ni hôte. */
const sansTextes=labCode.replace('Isolé de store-runner.fr','').replace('Requêtes vers store-runner.fr : aucune','');
assert(!/store-runner\.fr|chef-secteur|github\.io/i.test(sansTextes),'aucun domaine de production utilisable dans le Lab');
assert(!/XMLHttpRequest|WebSocket|sendBeacon|importScripts|serviceWorker\.register|indexedDB|eval\(|document\.write/.test(labCode),'aucune API réseau, worker ou stockage lourd');
const fetches=[...labCode.matchAll(/fetch\(([^)]*)\)/g)].map(m=>m[1]);
assert.deepEqual(fetches,["'runner-visual.js',{cache:'no-store'}"],'le seul fetch est la vérification d’empreinte de runner-visual.js');
const keys=new Set([...labCode.matchAll(/localStorage\.(?:get|set)Item\(([^,)]+)/g)].map(m=>m[1]));
assert.deepEqual([...keys].sort(),['k'],'le stockage passe par une seule fonction store(k,v)');
assert(/mode:'r3lab:mode',tab:'r3lab:tab'/.test(read('lab/runner-3d/lab.js')),'deux clés seulement, préfixées r3lab:');
assert(!/https?:\/\//.test(labCode.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,'')),'aucune URL absolue dans le Lab');

// 5. Vérité des animations : ce qui est annoncé natif/simulé/absent est cohérent entre module et compte rendu.
const R3=require('../lab/runner-3d/runner3d.js');
for(const k of ['blink','nod','look','tilt','wave','hop','shake','seated','legs'])assert.equal(R3.SUPPORT[k].level,'sim',k+' est simulé en 3D');
for(const k of ['moveTo','peek','presence'])assert.equal(R3.SUPPORT[k].level,'native',k+' est natif en 3D');
assert.equal(R3.SUPPORT.stateArms.level,'na','les bras d’état sont indisponibles en 3D');
assert.deepEqual(R3.STATES,['neutral','analyzing','alert','success']);
const lab=read('lab/runner-3d/lab.js');
assert(/'Salut','absent'|id:'wave',label:'Salut',c:'absent'/.test(lab),'le salut est déclaré absent du Runner actuel');
assert(lab.includes('Indisponible')&&lab.includes('Absent')&&lab.includes('Simulé'),'les trois statuts sont affichés');

// 6. Le texte variable passe par textContent : les gabarits innerHTML sont statiques.
for(const m of lab.matchAll(/html\([^,]+,\s*('(?:[^'\\]|\\.)*'(?:\s*\+\s*'(?:[^'\\]|\\.)*')*)\)/g))assert(!/\$\{/.test(m[1]),'gabarit html() statique');
assert(!/innerHTML\s*=[^;]*\+\s*[a-zA-Z_]/.test(lab),'pas d’innerHTML concaténé avec une variable');

console.log('PASS: Runner 3D Lab — Runner actuel intact, production sans lien avec le Lab, isolation et vérité des animations');
