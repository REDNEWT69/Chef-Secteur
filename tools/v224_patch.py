from pathlib import Path
import json,re

ROOT=Path('.')
OLD='20260918-proofreader223'
NEW='20260918-proofreadquota224'

# Correcteur client: prompt beaucoup plus court + mode proofread dédié.
p=ROOT/'note-proofreader-v221.js'
s=p.read_text()
pattern=r"function buildPrompt\(value,label\)\{[\s\S]*?\n\}\nfunction errorText"
replacement="""function buildPrompt(value,label){
  const source=text(value),field=text(label)||'note terrain';
  return [
    'Corrige cette note terrain en français professionnel, sans changer le sens.',
    'Corrige orthographe, grammaire, accords, conjugaison, ponctuation et mots manifestement mal saisis.',
    'N’invente rien. Conserve exactement faits, chiffres, noms, enseignes, villes, références produits, marques et termes métier.',
    'Préserve tels quels OLED, QLED, Neo QLED, Mini LED, Q-Symphony, SmartThings, Samsung et TCL lorsqu’ils sont présents.',
    'Reformule seulement si nécessaire pour la lisibilité. Ne fais ni analyse, ni résumé, ni recommandation.',
    'Réponds uniquement avec le texte corrigé, sans introduction, guillemets ni markdown.',
    'Champ : '+field+'.',
    '',
    'TEXTE :',
    source
  ].join('\\n')
}
function errorText"""
s2,n=re.subn(pattern,lambda _m: replacement,s,count=1)
assert n==1,'buildPrompt introuvable'
s=s2
old="mode:'assistant',message:buildPrompt(source,options.label),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}"
new="mode:'proofread',message:buildPrompt(source,options.label),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}"
assert old in s,'appel assistant du correcteur introuvable'
s=s.replace(old,new,1)
p.write_text(s)

# Worker: chemin ultra-léger dédié, sans compactContext ni gros ASSISTANT_SYSTEM.
p=ROOT/'workers/chef-secteur-ai.js'
s=p.read_text()
anchor="const STORE_PARSE_SYSTEM = `Transforme les notes fournies en liste structurée de magasins. Réponds UNIQUEMENT avec un objet JSON valide de forme {\"stores\":[...]}. Chaque magasin peut contenir : enseigne, ville, adresse, codePostal, dept, lat, lon, freq, priority, products, active. N'invente pas les données manquantes.`;"
assert anchor in s,'STORE_PARSE_SYSTEM introuvable'
addition=anchor+"""

const PROOFREAD_SYSTEM = `Tu corriges uniquement une note terrain en français.
N’invente aucune information et ne change aucun fait.
Préserve chiffres, noms, enseignes, villes, références produits, marques et termes métier.
Corrige orthographe, grammaire et ponctuation, avec seulement une légère reformulation si nécessaire.
Réponds uniquement par le texte corrigé, sans introduction ni markdown.`;

function proofreadMaxTokens(input) {
  const chars = String(input || '').length;
  // Le plafond est dynamique : une note courte ne réserve plus 1000 tokens de sortie.
  // 160 couvre une petite note ; 700 garde une marge pour les notes terrain longues.
  return Math.min(700, Math.max(160, Math.ceil(chars / 3.5) + 40));
}"""
s=s.replace(anchor,addition,1)
branch="""      if (mode === 'proofread') {
        const user = String(body.message || '').trim().slice(0, 12000);
        if (!user) return json({ error: 'Message vide.' }, 400, origin);
        const result = await callGroq(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens(user));
        if (!result.text) throw new Error('Réponse IA vide.');
        return json({
          text: result.text,
          reply: result.text,
          answer: result.text,
          message: result.text,
          actions: [],
          model: result.model,
          provider: result.provider,
          mode: 'proofread'
        }, 200, origin);
      }

"""
needle="      if (mode === 'parse_stores') {"
assert needle in s,'branche parse_stores introuvable'
s=s.replace(needle,branch+needle,1)
p.write_text(s)

# Contrats tests correcteur.
p=ROOT/'tests/note-proofreader-v221.test.cjs'
s=p.read_text()
assert "assert.equal(request.body.mode,'assistant');" in s,'assert mode assistant introuvable'
s=s.replace("assert.equal(request.body.mode,'assistant');","assert.equal(request.body.mode,'proofread');\n  assert.ok(request.body.message.length<900,'Le prompt correcteur doit rester compact pour préserver le quota TPM');",1)
p.write_text(s)

# Le test passerelle existant devient aussi garde de consommation du mode proofread.
p=ROOT/'tests/ai-gateway-cors.test.cjs'
s=p.read_text()
extra=r"""

if(!/mode === 'proofread'/.test(worker))throw new Error('Passerelle IA: mode proofread dédié absent');
if(!/const PROOFREAD_SYSTEM/.test(worker))throw new Error('Passerelle IA: prompt proofread léger absent');
if(!/function proofreadMaxTokens/.test(worker))throw new Error('Passerelle IA: plafond dynamique proofread absent');
if(!/callGroq\(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens\(user\)\)/.test(worker))throw new Error('Passerelle IA: proofread doit utiliser son prompt et son plafond dédiés');
if(worker.indexOf("mode === 'proofread'")>worker.indexOf('const context = compactContext'))throw new Error('Passerelle IA: proofread ne doit pas traverser le contexte assistant');
"""
assert "console.log('AI gateway CORS guards:" in s,'fin test CORS introuvable'
s=s.replace("console.log('AI gateway CORS guards: OK · production custom domain + GitHub Pages are authorized');",extra+"\nconsole.log('AI gateway CORS + proofread quota guards: OK');",1)
p.write_text(s)

# Bump PWA / build.
for name in ['index.html','sw.js']:
    p=ROOT/name
    s=p.read_text()
    assert OLD in s,f'{name}: ancienne révision absente'
    p.write_text(s.replace(OLD,NEW))

p=ROOT/'version.json'
data=json.loads(p.read_text())
assert data.get('displayVersion')=='223','version de départ inattendue'
data['latestBuild']=NEW
data['displayVersion']='224'
data['releasedAt']='2026-09-18'
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# Le script est temporaire, il ne doit pas finir dans la PR.
Path('tools/v224_patch.py').unlink()
