#!/usr/bin/env python3
"""TEMPORAIRE (#467, développement) : échantillons de structure des sources accessibles."""
import json, re, sys, time
from urllib.parse import urljoin, urlparse
import requests
UA = 'Mozilla/5.0 (compatible; StoreRunnerCatalogue/1.0; +https://store-runner.fr)'
H = {'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9'}
S = requests.Session(); S.headers.update(H)

def get(url, **kw):
 r = S.get(url, timeout=30, **kw); time.sleep(0.6); return r

def hrefs(text):
 return re.findall(r'<a\s[^>]*href="([^"]+)"', text, re.I)

def jsonld(text):
 out = []
 for raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', text, re.S | re.I):
  try: out.append(json.loads(raw, strict=False))
  except Exception as e: out.append({'_error': str(e)[:80], '_raw': raw[:200]})
 return out

def show(label, value, n=600):
 print('### ' + label + ' ' + (json.dumps(value, ensure_ascii=False)[:n] if not isinstance(value, str) else value[:n]), flush=True)

def darty():
 r = get('https://magasin.darty.com/fr'); t = r.text
 ld = jsonld(t); show('darty/fr jsonld count', len(ld)); show('darty/fr jsonld[0]', ld[0] if ld else None, 900); show('darty/fr jsonld[1]', ld[1] if len(ld) > 1 else None, 900)
 links = hrefs(t); show('darty/fr links sample', links[:60], 3000)
 show('darty/fr rel next', re.findall(r'<link[^>]+rel="(?:next|prev)"[^>]*>', t)[:3])
 show('darty/fr script ids', re.findall(r'<script[^>]*id="([^"]+)"', t)[:20])
 r = get('https://magasin.darty.com/plan-du-site'); t = r.text; links = hrefs(t)
 stores = [l for l in links if re.match(r'^(https://magasin\.darty\.com)?/\d+-', l)]
 show('plan links total/stores', [len(links), len(stores), len(set(stores))]); show('plan store sample', stores[:15], 1500)
 other = [l for l in links if l not in stores]; show('plan other sample', other[:80], 4000)
 r = get('https://magasin.darty.com/sitemap.xml'); show('sitemap index', r.text, 800)
 for loc in re.findall(r'<loc>([^<]+)</loc>', r.text)[:3]:
  rr = get(loc); locs = re.findall(r'<loc>([^<]+)</loc>', rr.text)
  st = [l for l in locs if re.search(r'/\d+-[a-z]', l)]
  show('sub ' + loc, [rr.status_code, len(locs), len(st), locs[:5], st[:5]], 1500)
 r = get('https://magasin.darty.com/fr?page=10'); ld = jsonld(r.text); show('page10 jsonld', [len(ld), [x.get('name') for x in ld if isinstance(x, dict)][:10]], 1500)
 r = get('https://magasin.darty.com/fr/grand-est/moselle'); ld = jsonld(r.text); show('moselle jsonld names', [x.get('name') for x in ld if isinstance(x, dict)], 1500)
 st = [l for l in hrefs(r.text) if re.match(r'^(https://magasin\.darty\.com)?/\d+-', l)]; show('moselle store links', st, 1500)
 one = 'https://magasin.darty.com' + (st[0] if st and st[0].startswith('/') else '') if st else ''
 if one:
  rr = get(one); show('store page status/jsonld', [rr.status_code, one, jsonld(rr.text)[:2]], 2500)

def cuisinella():
 r = get('https://www.ma.cuisinella/fr-fr/liste-magasins'); t = r.text; links = hrefs(t)
 show('cuis liste links count', len(links)); show('cuis liste sample', links[:40], 3000); show('cuis liste tail', links[-40:], 3000)
 show('cuis liste jsonld', jsonld(t)[:1], 1200)
 r = get('https://www.ma.cuisinella/sitemap.xml'); locs = re.findall(r'<loc>([^<]+)</loc>', r.text)
 fr = [l for l in locs if '/fr-fr/' in l]; mag = [l for l in fr if '/magasins/' in l]
 show('cuis sitemap total/fr/magasins', [len(locs), len(fr), len(mag)]); show('cuis sitemap magasins sample', mag[:25], 3000)
 depth = {}
 for l in mag:
  k = len([p for p in urlparse(l).path.split('/') if p]); depth[k] = depth.get(k, 0) + 1
 show('cuis magasin url depth', depth)
 cand = [l for l in mag if len([p for p in urlparse(l).path.split('/') if p]) == max(depth or {0: 0})]
 if cand:
  rr = get(cand[0]); show('cuis store page', [rr.status_code, cand[0], jsonld(rr.text)[:2]], 3000)
  show('cuis store scripts', re.findall(r'<script[^>]*(?:id|type)="([^"]+)"', rr.text)[:25], 1500)

def sirene():
 base = 'https://recherche-entreprises.api.gouv.fr/search'
 for params in [{'q': 'fnac', 'per_page': 10, 'limite_matching_etablissements': 100},
                {'q': 'carrefour', 'activite_principale': '47.11F', 'departement': '77', 'per_page': 25, 'limite_matching_etablissements': 100},
                {'q': 'boulanger', 'activite_principale': '47.54Z', 'per_page': 10, 'limite_matching_etablissements': 100}]:
  r = get(base, params=params)
  try: d = r.json()
  except Exception: show('sirene error', [r.status_code, r.text[:300]]); continue
  show('sirene ' + json.dumps(params), [r.status_code, d.get('total_results'), d.get('total_pages')], 300)
  for res in (d.get('results') or [])[:10]:
   me = res.get('matching_etablissements') or []
   show('  UL', [res.get('siren'), res.get('nom_complet'), res.get('activite_principale'), res.get('nombre_etablissements_ouverts'), len(me)], 400)
  first = next((res for res in d.get('results') or [] if res.get('matching_etablissements')), None)
  if first: show('  etab sample', first['matching_etablissements'][:2], 1600)

if __name__ == '__main__':
 for name in (sys.argv[1:] or ['darty', 'cuisinella', 'sirene']):
  try: globals()[name]()
  except Exception as e: show(name + ' FAILED', repr(e))
