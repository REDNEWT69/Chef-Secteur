#!/usr/bin/env python3
"""TEMPORAIRE (#467, développement) : transport texte vérifiable d'un snapshot candidat.

L'environnement de l'agent ne peut pas télécharger les artefacts Actions. Le workflow
imprime donc le candidat sous forme de différences contre le snapshot de base
(fiches ajoutées/modifiées, fiches retirées, sources), une ligne JSON par
enregistrement avec un CRC32. `decode` reconstruit le fichier à l'octet près et
vérifie le SHA-256 annoncé par la CI.

  python tools/_dev_catalog_transport.py encode NEW.json BASE.json > transport.txt
  python tools/_dev_catalog_transport.py decode transport.txt BASE.json OUT.json
"""
import hashlib, json, sys, zlib
from collections import Counter
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import official_directory_parsers as P

BRANDS = ['Boulanger', 'Darty', 'Fnac', 'Conforama', 'Cuisinella', 'Carrefour']
SIRENE = 'Répertoire Sirene (INSEE)'


def dump(snapshot):
 return (json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def sha(b):
 return hashlib.sha256(b).hexdigest()


def sort_key(r):
 return (r['enseigne'], r['regionCode'], r['dept'], P.norm(r['ville']), P.norm(r['sourceName']), r['id'])


def keep_asis(row):
 s = dict(row); postal = str(s.get('codePostal') or '')
 s['dept'] = P.dept_from_postal(postal); s['regionCode'] = P.region_code_from_postal(postal); s['region'] = P.REGIONS[s['regionCode']][0]
 return s


def fresh(brand, name, street, city, postal, lat, lon, url, t, store_id=None, source=None):
 return P.make_store(brand, name, street, city, postal, lat, lon, url, store_id=store_id, fetched_at=t, source=source)


def build(item, t, base_by_id):
 kind = item[0]
 if kind == 'AD':
  _, path, name, street, city, postal, lat, lon = item
  return fresh('Darty', name, street, city, postal, lat, lon, P.DARTY_ROOT + path, t)
 if kind == 'AC':
  _, path, name, street, city, postal, lat, lon = item
  return fresh('Cuisinella', name, street, city, postal, lat, lon, P.CUISINELLA_ROOT + path, t, store_id=P.cuisinella_legacy_id(postal, name))
 if kind == 'AS':
  _, brand, siret, name, street, city, postal, lat, lon = item
  return fresh(brand, name, street, city, postal, lat, lon, P.SIRENE_PAGE + siret, t, store_id='sirene-' + brand.lower() + '-' + siret, source=SIRENE)
 if kind == 'KR':
  b = base_by_id[item[1]]
  if b['enseigne'] == 'Cuisinella':
   return fresh('Cuisinella', b['sourceName'], b['adresse'], b['ville'], b['codePostal'], b['lat'], b['lon'], b['sourceUrl'], t, store_id=b['id'])
  return fresh(b['enseigne'], b['sourceName'], b['adresse'], b['ville'], b['codePostal'], b['lat'], b['lon'], b['sourceUrl'], t, store_id=b['id'], source=b.get('source'))
 if kind == 'A':
  return item[1]
 raise ValueError('ligne inconnue : ' + kind)


def line(item):
 text = json.dumps(item, ensure_ascii=False, separators=(',', ':'))
 return '%08x %s' % (zlib.crc32(text.encode('utf-8')), text)


def implicit(b, policy, t):
 return keep_asis(b) if policy == 'asis' else build(['KR', b['id']], t, {b['id']: b})


def same(a, b):
 return json.dumps(a, ensure_ascii=False) == json.dumps(b, ensure_ascii=False)


def encode(new, base):
 base_by_id = {s['id']: s for s in base.get('stores', [])}
 out = ['#T1 base=' + sha(dump(base)) + ' target=' + sha(dump(new)) + ' stores=' + str(len(new['stores']))]
 out.append(line(['G', new['generatedAt'], new.get('scope')]))
 for brand in BRANDS:
  if brand in new['sources']:
   out.append(line(['SRC', brand, new['sources'][brand]]))
 new_ids = {s['id'] for s in new['stores']}
 for brand in BRANDS:
  rows = [s for s in new['stores'] if s['enseigne'] == brand]
  t = Counter(r['sourceFetchedAt'] for r in rows).most_common(1)[0][0] if rows else ''
  olds = [r for r in rows if r['id'] in base_by_id and base_by_id[r['id']]['enseigne'] == brand]
  votes = Counter('asis' if same(keep_asis(base_by_id[r['id']]), r) else 'refresh' if same(implicit(base_by_id[r['id']], 'refresh', t), r) else 'none' for r in olds)
  policy = 'asis' if votes['asis'] >= votes['refresh'] else 'refresh'
  out.append(line(['B', brand, t, policy]))
  for b in base.get('stores', []):
   if b['enseigne'] == brand and P.is_continental_postal(b.get('codePostal')) and b['id'] not in new_ids:
    out.append(line(['D', b['id']]))
  for r in rows:
   b = base_by_id.get(r['id'])
   if b and b['enseigne'] == brand and P.is_continental_postal(b.get('codePostal')):
    try:
     if same(implicit(b, policy, t), r):
      continue
    except (KeyError, ValueError):
     pass
   candidates = []
   if r['sourceUrl'].startswith(P.DARTY_ROOT + '/'):
    candidates.append(['AD', r['sourceUrl'][len(P.DARTY_ROOT):], r['sourceName'], r['adresse'], r['ville'], r['codePostal'], r['lat'], r['lon']])
   if r['sourceUrl'].startswith(P.CUISINELLA_ROOT + '/'):
    candidates.append(['AC', r['sourceUrl'][len(P.CUISINELLA_ROOT):], r['sourceName'], r['adresse'], r['ville'], r['codePostal'], r['lat'], r['lon']])
   if r['id'].startswith('sirene-'):
    candidates.append(['AS', brand, r['id'].rsplit('-', 1)[1], r['sourceName'], r['adresse'], r['ville'], r['codePostal'], r['lat'], r['lon']])
   chosen = ['A', r]
   if r['sourceFetchedAt'] == t:
    for item in candidates:
     if same(build(item, t, base_by_id), r):
      chosen = item; break
   out.append(line(chosen))
 out.append('#END')
 return out


def decode(lines, base):
 base_by_id = {s['id']: s for s in base.get('stores', [])}
 header = lines[0].split()
 assert header[0] == '#T1', 'en-tête inconnu'
 meta = dict(x.split('=', 1) for x in header[1:])
 if meta['base'] != sha(dump(base)):
  raise SystemExit('Base différente de celle de la CI : ' + sha(dump(base)))
 bad = []; items = []
 for n, raw in enumerate(lines[1:], 2):
  if raw.startswith('#END'):
   break
  if not raw.strip():
   continue
  crc, text = raw.split(' ', 1)
  if '%08x' % zlib.crc32(text.encode('utf-8')) != crc:
   bad.append(n); continue
  items.append(json.loads(text))
 if bad:
  raise SystemExit('CRC invalide aux lignes : ' + ', '.join(map(str, bad)))
 state = {'generated': None, 'scope': None, 'brand': None, 't': '', 'policy': 'asis', 'explicit': set(), 'dropped': set()}
 sources = {}; stores = []
 def flush():
  if state['brand'] is None:
   return
  for b in base.get('stores', []):
   if b['enseigne'] == state['brand'] and b['id'] not in state['dropped'] and b['id'] not in state['explicit'] and P.is_continental_postal(b.get('codePostal')):
    stores.append(implicit(b, state['policy'], state['t']))
 for item in items:
  kind = item[0]
  if kind == 'G':
   state['generated'], state['scope'] = item[1], item[2]
  elif kind == 'SRC':
   sources[item[1]] = item[2]
  elif kind == 'B':
   flush(); state.update(brand=item[1], t=item[2], policy=item[3], explicit=set(), dropped=set())
  elif kind == 'D':
   state['dropped'].add(item[1])
  else:
   row = build(item, state['t'], base_by_id)
   state['explicit'].add(row['id']); stores.append(row)
 flush()
 out = {'generatedAt': state['generated'], 'scope': state['scope'], 'sources': sources, 'stores': sorted(stores, key=sort_key)}
 got = sha(dump(out))
 if got != meta['target']:
  raise SystemExit('SHA-256 différent : ' + got + ' ≠ ' + meta['target'])
 return out


if __name__ == '__main__':
 cmd = sys.argv[1]
 if cmd == 'encode':
  new = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8')); base = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))
  out = encode(new, base)
  assert decode(out, base) == new
  print('\n'.join(out))
 elif cmd == 'decode':
  base = json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))
  out = decode(Path(sys.argv[2]).read_text(encoding='utf-8').splitlines(), base)
  Path(sys.argv[4]).write_bytes(dump(out))
  print('OK', sha(dump(out)), len(out['stores']), 'magasins')
