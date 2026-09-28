#!/usr/bin/env python3
"""Diagnostic d'accès aux annuaires officiels des enseignes (#467).

Pour chaque source candidate : statut HTTP, protection anti-robot détectée,
autorisation robots.txt, taille, titre et indices de structure (JSON-LD,
liens, entrées de sitemap). Aucune donnée n'est écrite : le rapport sert de
preuve quand une source est bloquée. Le collecteur s'identifie honnêtement et
ne contourne aucune protection.
"""
import json, re, sys, time, urllib.robotparser
from urllib.parse import urlparse
import requests

UA = 'Mozilla/5.0 (compatible; StoreRunnerCatalogue/1.0; +https://store-runner.fr)'
HEADERS = {'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5'}
TARGETS = {
 'Boulanger': ['https://www.boulanger.com/magasins/', 'https://www.boulanger.com/magasins/ile-de-france', 'https://www.boulanger.com/magasins/sitemap.xml', 'https://www.boulanger.com/info/magasins/searchmag'],
 'Darty': ['https://magasin.darty.com/fr', 'https://magasin.darty.com/fr?page=10', 'https://magasin.darty.com/plan-du-site', 'https://magasin.darty.com/sitemap.xml', 'https://magasin.darty.com/fr/grand-est', 'https://magasin.darty.com/fr/grand-est/moselle'],
 'Fnac': ['https://www.fnac.com/localiser-magasin-fnac/w-4', 'https://www.fnac.com/aide?question=comment-trouver-un-magasin'],
 'Conforama': ['https://www.conforama.fr/liste-des-magasins', 'https://www.conforama.fr/magasins-conforama'],
 'Carrefour': ['https://www.carrefour.fr/magasin/liste', 'https://www.carrefour.fr/magasin'],
 'Cuisinella': ['https://www.ma.cuisinella/fr-fr/liste-magasins', 'https://www.ma.cuisinella/fr-fr/magasins', 'https://www.ma.cuisinella/sitemap.xml'],
}
ANTIBOT = [('datadome', re.compile(r'datadome|captcha-delivery', re.I)), ('cloudflare', re.compile(r'cf-ray|cf-chl|challenge-platform|cloudflare', re.I)), ('akamai', re.compile(r'akamai|_abck|bm_sz', re.I)), ('imperva', re.compile(r'incapsula|imperva|_incap_', re.I))]
_robots = {}

def robots_allows(url):
 base = '{0.scheme}://{0.netloc}'.format(urlparse(url))
 if base not in _robots:
  rp = urllib.robotparser.RobotFileParser()
  try:
   r = requests.get(base + '/robots.txt', headers=HEADERS, timeout=20)
   rp.parse(r.text.splitlines() if r.status_code == 200 else [])
   sitemaps = [l.split(':', 1)[1].strip() for l in r.text.splitlines() if l.lower().startswith('sitemap:')] if r.status_code == 200 else []
   _robots[base] = (rp, r.status_code, sitemaps)
  except Exception as e:
   _robots[base] = (None, 'erreur ' + type(e).__name__, [])
 rp, status, _ = _robots[base]
 return (rp.can_fetch(UA, url) if rp else None), status

def antibot(resp):
 blob = ' '.join('%s: %s' % kv for kv in resp.headers.items()) + ' ' + resp.text[:4000]
 return ','.join(name for name, rx in ANTIBOT if rx.search(blob)) or '-'

def describe(url):
 allowed, rstatus = robots_allows(url)
 try:
  t0 = time.time(); r = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True); dt = time.time() - t0
 except Exception as e:
  return {'url': url, 'robots': allowed, 'error': type(e).__name__ + ': ' + str(e)[:160]}
 text = r.text
 title = re.search(r'<title[^>]*>(.*?)</title>', text, re.S | re.I)
 out = {'url': url, 'status': r.status_code, 'final': r.url if r.url != url else '', 'robots': allowed, 'robotsStatus': rstatus,
        'server': r.headers.get('server', ''), 'antibot': antibot(r), 'bytes': len(r.content), 'seconds': round(dt, 1),
        'title': (title.group(1).strip()[:90] if title else ''), 'jsonld': len(re.findall(r'application/ld\+json', text)),
        'sitemapLocs': len(re.findall(r'<loc>', text)), 'links': len(re.findall(r'<a\s[^>]*href=', text, re.I))}
 return out

def main():
 only = set(sys.argv[1:])
 report = []
 for brand, urls in TARGETS.items():
  if only and brand not in only: continue
  for url in urls:
   row = describe(url); row['brand'] = brand; report.append(row)
   print(json.dumps(row, ensure_ascii=False), flush=True)
   time.sleep(1.0)
 for base, (_, status, sitemaps) in _robots.items():
  print(json.dumps({'robots': base, 'status': status, 'sitemaps': sitemaps[:12]}, ensure_ascii=False))
 return report

if __name__ == '__main__':
 main()
