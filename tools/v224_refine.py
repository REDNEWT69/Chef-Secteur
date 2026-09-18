from pathlib import Path

# Client: garder message pour compatibilité ancien Worker, mais fournir le texte brut au nouveau mode dédié.
p=Path('note-proofreader-v221.js')
s=p.read_text()
old="JSON.stringify({mode:'proofread',message:buildPrompt(source,options.label),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}})"
new="JSON.stringify({mode:'proofread',message:buildPrompt(source,options.label),proofreadText:source,proofreadLabel:text(options.label).slice(0,120),context:{instructions:'Correction de note uniquement. Ne modifier aucune donnée métier.'}})"
assert old in s,'payload proofread client introuvable'
p.write_text(s.replace(old,new,1))

# Worker: utiliser le texte brut si le client V224 le fournit ; fallback au message pour compatibilité.
p=Path('workers/chef-secteur-ai.js')
s=p.read_text()
old="""      if (mode === 'proofread') {
        const user = String(body.message || '').trim().slice(0, 12000);
        if (!user) return json({ error: 'Message vide.' }, 400, origin);
        const result = await callGroq(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens(user));
"""
new="""      if (mode === 'proofread') {
        const raw = String(body.proofreadText || '').trim().slice(0, 12000);
        const label = String(body.proofreadLabel || 'note terrain').trim().slice(0, 120);
        const fallback = String(body.message || '').trim().slice(0, 12000);
        const source = raw || fallback;
        if (!source) return json({ error: 'Message vide.' }, 400, origin);
        const user = raw ? `Champ : ${label}.\\nTEXTE :\\n${raw}` : fallback;
        const result = await callGroq(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens(source));
"""
assert old in s,'branche proofread Worker introuvable'
p.write_text(s.replace(old,new,1))

# Tests client: le nouveau Worker reçoit seulement la note brute en plus du fallback.
p=Path('tests/note-proofreader-v221.test.cjs')
s=p.read_text()
needle="  assert.equal(request.body.mode,'proofread');\n  assert.ok(request.body.message.length<900,'Le prompt correcteur doit rester compact pour préserver le quota TPM');"
repl=needle+"\n  assert.equal(request.body.proofreadText,'vendeur trouve image tro sombre');\n  assert.equal(request.body.proofreadLabel,'Note terrain BRUN');"
assert needle in s,'contrat client proofread introuvable'
p.write_text(s.replace(needle,repl,1))

# Test Worker : le chemin léger doit consommer proofreadText et non compactContext.
p=Path('tests/ai-gateway-cors.test.cjs')
s=p.read_text()
needle="if(!/function proofreadMaxTokens/.test(worker))throw new Error('Passerelle IA: plafond dynamique proofread absent');"
repl=needle+"\nif(!/body\\.proofreadText/.test(worker))throw new Error('Passerelle IA: proofread doit accepter le texte brut dédié');"
assert needle in s,'garde proofread worker introuvable'
s=s.replace(needle,repl,1)
old_guard="if(!/callGroq\\(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens\\(user\\)\\)/.test(worker))throw new Error('Passerelle IA: proofread doit utiliser son prompt et son plafond dédiés');"
new_guard="if(!/callGroq\\(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens\\(source\\)\\)/.test(worker))throw new Error('Passerelle IA: proofread doit utiliser son prompt et son plafond dédiés');"
assert old_guard in s,'garde callGroq proofread introuvable'
p.write_text(s.replace(old_guard,new_guard,1))

Path('tools/v224_refine.py').unlink()
