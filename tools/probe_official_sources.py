#!/usr/bin/env python3
"""Diagnostic d'accès aux annuaires officiels des enseignes (#467).

Pour chaque source candidate : statut HTTP, protection anti-robot détectée et
autorisation robots.txt. Rien n'est écrit dans le dépôt : le tableau produit sert
de preuve datée quand une source est bloquée (journal du run et résumé Actions).
Même client que le collecteur : il s'identifie et ne contourne aucune protection.
"""
import json, os, sys, time, urllib.robotparser
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0, str(Path(__file__).resolve().parent))
import official_directory_parsers as P

TARGETS = {
 'Boulanger': ['https://www.boulanger.com/magasins/', 'https://www.boulanger.com/info/magasins/searchmag'],
 'Darty': ['https://magasin.darty.com/fr', 'https://magasin.darty.com/plan-du-site', 'https://magasin.darty.com/sitemap.xml'],
 'Fnac': ['https://www.fnac.com/localiser-magasin-fnac/w-4'],
 'Conforama': ['https://www.conforama.fr/liste-des-magasins', 'https://www.conforama.fr/magasins-conforama'],
 'Carrefour': ['https://www.carrefour.fr/magasin/liste'],
 'Cuisinella': ['https://www.ma.cuisinella/fr-fr/liste-magasins', 'https://www.ma.cuisinella/sitemap.xml'],
 'Sirene (INSEE)': [P.SIRENE_API + '?q=carrefour&per_page=1'],
}


def robots(url, cache={}):
 base = '{0.scheme}://{0.netloc}'.format(urlparse(url))
 if base not in cache:
  try:
   text, _ = P.http_get(base + '/robots.txt', accept='text/plain,*/*;q=0.5', retries=0)
   rp = urllib.robotparser.RobotFileParser(); rp.parse(text.splitlines()); cache[base] = rp
  except P.HttpError as e:
   cache[base] = e
 rp = cache[base]
 return ('robots.txt HTTP ' + str(rp.status)) if isinstance(rp, P.HttpError) else ('autorisé' if rp.can_fetch(P.UA, url) else 'interdit')


def main():
 rows = []
 for brand, urls in TARGETS.items():
  for url in urls:
   t0 = time.time()
   try:
    text, final = P.http_get(url, retries=0, same_host=False)
    row = {'brand': brand, 'url': url, 'status': 200, 'protection': '-', 'bytes': len(text), 'final': final if final != url else ''}
   except P.HttpError as e:
    row = {'brand': brand, 'url': url, 'status': e.status or 'réseau', 'protection': e.vendor or '-', 'bytes': 0, 'final': e.detail or ''}
   row['robots'] = robots(url); row['seconds'] = round(time.time() - t0, 1)
   rows.append(row); print(json.dumps(row, ensure_ascii=False), flush=True)
 summary = os.environ.get('GITHUB_STEP_SUMMARY')
 if summary:
  with open(summary, 'a', encoding='utf-8') as f:
   f.write('## Accès aux sources officielles\n\n| Source | URL | HTTP | Protection | robots.txt |\n|---|---|---|---|---|\n')
   for r in rows:
    f.write('| %s | %s | %s | %s | %s |\n' % (r['brand'], r['url'], r['status'], r['protection'], r['robots']))
   f.write('\n')


if __name__ == '__main__':
 main()


def cuisinella_structure():
 """TEMPORAIRE (#467) : la page carte embarque-t-elle les fiches magasins ?"""
 import re
 text, _ = P.http_get(P.CUISINELLA_ROOT + '/fr-fr/magasins')
 for label, rx in [('latitude', r'latitude'), ('lat"', r'"lat"'), ('data-lat', r'data-lat'), ('storeId', r'storeId'), ('fiches', r'/fr-fr/magasins/[a-z0-9-]+/[a-z0-9-]+'), ('postalCode', r'postalCode|codePostal|zipCode|"zip"')]:
  hits = [m.start() for m in re.finditer(rx, text)]
  print('### cuis', label, len(hits), flush=True)
  if hits:
   i = hits[0]; print('### cuis ctx', label, json.dumps(text[max(0, i - 300):i + 500]), flush=True)
 for m in re.finditer(r'<script([^>]*)>', text):
  attrs = m.group(1); body = text[m.end():text.find('</script>', m.end())]
  if len(body) > 2000:
   print('### cuis script', attrs[:120], len(body), json.dumps(body[:300]), flush=True)
 t0 = time.time(); codes = []
 for url in [P.CUISINELLA_ROOT + '/fr-fr/magasins/ain/beynost', P.CUISINELLA_ROOT + '/fr-fr/magasins/aisne/laon', P.CUISINELLA_ROOT + '/fr-fr/magasins/allier/moulins']:
  try:
   P.http_get(url, retries=0); codes.append(200)
  except P.HttpError as e:
   codes.append(e.status)
 print('### cuis 3 fiches', codes, round(time.time() - t0, 1), 's', flush=True)


if __name__ == '__main__' and os.environ.get('PROBE_CUISINELLA') == '1':
 cuisinella_structure()
