from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]
OLD='20260918-pilotagesnail220'
NEW='20260918-noteproof221'
TEXT_SUFFIXES={'.js','.cjs','.html','.json','.yml','.yaml','.md'}

# Bump exact partout où l'ancienne révision est figée, hors workflows GitHub.
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts or '.github' in path.parts or path.suffix.lower() not in TEXT_SUFFIXES:
        continue
    src=path.read_text(encoding='utf-8',errors='ignore')
    if OLD in src:
        path.write_text(src.replace(OLD,NEW),encoding='utf-8')

# Charger le correcteur juste après le domaine Visit, sans toucher au planning.
index=ROOT/'index.html'
s=index.read_text(encoding='utf-8')
anchor="scriptTag('./store-runner-visits.js')+scriptTag('./store-runner-opportunities.js')"
replacement="scriptTag('./store-runner-visits.js')+scriptTag('./note-proofreader-v221.js')+scriptTag('./store-runner-opportunities.js')"
if './note-proofreader-v221.js' not in s:
    if anchor not in s: raise SystemExit('ancre index StoreRunnerVisits introuvable')
    s=s.replace(anchor,replacement,1)
index.write_text(s,encoding='utf-8')

# Le nouveau runtime doit faire partie du cache PWA.
sw=ROOT/'sw.js'
s=sw.read_text(encoding='utf-8')
if './note-proofreader-v221.js' not in s:
    anchors=["'./store-runner-visits.js',",'"./store-runner-visits.js",']
    for a in anchors:
        if a in s:
            quote=a[0]
            s=s.replace(a,a+'\n  '+quote+'./note-proofreader-v221.js'+quote+',',1)
            break
    else: raise SystemExit('ancre cache store-runner-visits.js introuvable dans sw.js')
sw.write_text(s,encoding='utf-8')

# Version applicative atomique.
version=ROOT/'version.json'
data=json.loads(version.read_text(encoding='utf-8'))
data.update({'latestBuild':NEW,'displayVersion':'221','channel':'stable','releasedAt':'2026-09-18'})
version.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Contrôles de contrat avant commit. Les workflows seront mis à jour directement via GitHub.
remaining=[]
for path in ROOT.rglob('*'):
    if not path.is_file() or '.git' in path.parts or '.github' in path.parts or path.suffix.lower() not in TEXT_SUFFIXES:
        continue
    if OLD in path.read_text(encoding='utf-8',errors='ignore'):
        remaining.append(str(path.relative_to(ROOT)))
if remaining:
    raise SystemExit('ancienne révision encore présente: '+', '.join(remaining))
if './note-proofreader-v221.js' not in index.read_text(encoding='utf-8'):
    raise SystemExit('module non chargé par index')
if './note-proofreader-v221.js' not in sw.read_text(encoding='utf-8'):
    raise SystemExit('module absent du cache PWA')
print('V221 patch OK')
