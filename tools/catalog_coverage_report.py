#!/usr/bin/env python3
"""Rapport de couverture du carnet officiel (#467) : enseigne × région × département.

Généré depuis data/official-stores.json par tools/update_official_stores.py ; le test
tests/official_catalog_test.py vérifie que CATALOGUE_COUVERTURE.md reste synchronisé.
Usage : python tools/catalog_coverage_report.py [data/official-stores.json] > CATALOGUE_COUVERTURE.md
"""
import json, math, statistics, sys
from pathlib import Path

BRANDS = ['Boulanger', 'Darty', 'Fnac', 'Conforama', 'Cuisinella', 'Carrefour']
REGIONS = [('84', 'Auvergne-Rhône-Alpes'), ('27', 'Bourgogne-Franche-Comté'), ('53', 'Bretagne'), ('24', 'Centre-Val de Loire'), ('44', 'Grand Est'), ('32', 'Hauts-de-France'), ('11', 'Île-de-France'), ('28', 'Normandie'), ('75', 'Nouvelle-Aquitaine'), ('76', 'Occitanie'), ('52', 'Pays de la Loire'), ('93', "Provence-Alpes-Côte d'Azur")]
DEPARTMENTS = {
 '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes', '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube',
 '11': 'Aude', '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente', '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '21': "Côte-d'Or",
 '22': "Côtes-d'Armor", '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs', '26': 'Drôme', '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute-Garonne',
 '32': 'Gers', '33': 'Gironde', '34': 'Hérault', '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire', '38': 'Isère', '39': 'Jura', '40': 'Landes', '41': 'Loir-et-Cher',
 '42': 'Loire', '43': 'Haute-Loire', '44': 'Loire-Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère', '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne',
 '52': 'Haute-Marne', '53': 'Mayenne', '54': 'Meurthe-et-Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord', '60': 'Oise', '61': 'Orne',
 '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques', '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône', '70': 'Haute-Saône', '71': 'Saône-et-Loire',
 '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie', '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres', '80': 'Somme', '81': 'Tarn',
 '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse', '85': 'Vendée', '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort', '91': 'Essonne',
 '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': "Val-d'Oise"
}
DEPT_REGION = {
 '01': '84', '03': '84', '07': '84', '15': '84', '26': '84', '38': '84', '42': '84', '43': '84', '63': '84', '69': '84', '73': '84', '74': '84',
 '21': '27', '25': '27', '39': '27', '58': '27', '70': '27', '71': '27', '89': '27', '90': '27',
 '75': '11', '77': '11', '78': '11', '91': '11', '92': '11', '93': '11', '94': '11', '95': '11',
 '02': '32', '59': '32', '60': '32', '62': '32', '80': '32', '08': '44', '10': '44', '51': '44', '52': '44', '54': '44', '55': '44', '57': '44', '67': '44', '68': '44', '88': '44',
 '14': '28', '27': '28', '50': '28', '61': '28', '76': '28', '18': '24', '28': '24', '36': '24', '37': '24', '41': '24', '45': '24',
 '16': '75', '17': '75', '19': '75', '23': '75', '24': '75', '33': '75', '40': '75', '47': '75', '64': '75', '79': '75', '86': '75', '87': '75',
 '09': '76', '11': '76', '12': '76', '30': '76', '31': '76', '32': '76', '34': '76', '46': '76', '48': '76', '65': '76', '66': '76', '81': '76', '82': '76',
 '22': '53', '29': '53', '35': '53', '56': '53', '44': '52', '49': '52', '53': '52', '72': '52', '85': '52',
 '04': '93', '05': '93', '06': '93', '13': '93', '83': '93', '84': '93'
}
STATUS_LABEL = {'complete': 'complet (preuve)', 'partial': 'partiel', 'unavailable': 'indisponible'}


def haversine(a, b):
 la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
 h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
 return 6371000 * 2 * math.asin(math.sqrt(min(1, h)))


def cell(n, status):
 if status == 'collected':
  return str(n) + ' ✓'
 return str(n) if n else '—'


def shared_addresses(stores):
 """Fiches distinctes d'une même enseigne à moins de 150 m : signalées, jamais supprimées."""
 out = []
 by_brand = {}
 for s in stores:
  by_brand.setdefault(s['enseigne'], []).append(s)
 for brand in BRANDS:
  rows = by_brand.get(brand, [])
  for i, a in enumerate(rows):
   for b in rows[i + 1:]:
    if abs(a['lat'] - b['lat']) < 0.002 and abs(a['lon'] - b['lon']) < 0.003 and haversine((a['lat'], a['lon']), (b['lat'], b['lon'])) < 150:
     out.append((brand, a, b))
 return out


def sirene_near_directory(stores, meters=3000):
 """Fiches Sirene à moins de 3 km d'une fiche d'annuaire de la même enseigne : gardées
 (adresse ou code postal différents), mais signalées pour vérification."""
 out = []
 for brand in BRANDS:
  directory = [s for s in stores if s['enseigne'] == brand and str(s.get('source', '')).startswith('Annuaire officiel')]
  for s in stores:
   if s['enseigne'] != brand or not str(s.get('source', '')).startswith('Répertoire Sirene'):
    continue
   near = [(haversine((s['lat'], s['lon']), (d['lat'], d['lon'])), d) for d in directory if abs(d['lat'] - s['lat']) < 0.03 and abs(d['lon'] - s['lon']) < 0.045]
   near = [x for x in near if x[0] < meters]
   if near:
    dist, d = min(near, key=lambda x: x[0])
    out.append((brand, s, d, dist))
 return out


def slug(text):
 import unicodedata
 t = unicodedata.normalize('NFD', str(text or '')).encode('ascii', 'ignore').decode().lower()
 return '-'.join(''.join(c if c.isalnum() else ' ' for c in t).split())


def url_department_mismatch(stores):
 """Fiche officielle dont l'URL range le magasin dans un autre département que son code
 postal (ex. /magasins/correze/… publiée avec une adresse des Hautes-Pyrénées)."""
 slugs = {slug(name): dept for dept, name in DEPARTMENTS.items()}
 out = []
 for s in stores:
  parts = [x for x in str(s.get('sourceUrl', '')).split('/') if x]
  for i, part in enumerate(parts[:-1]):
   if part == 'magasins' and parts[i + 1] in slugs and slugs[parts[i + 1]] != s['dept']:
    out.append((s, slugs[parts[i + 1]]))
 return out


def outliers(stores):
 """Fiches à plus de 150 km du centre des magasins de leur département (CP ou coordonnées suspects)."""
 centers = {}
 for dept in DEPARTMENTS:
  pts = [(s['lat'], s['lon']) for s in stores if s['dept'] == dept]
  if len(pts) >= 3:
   centers[dept] = (statistics.median(p[0] for p in pts), statistics.median(p[1] for p in pts))
 return [s for s in stores if s['dept'] in centers and haversine(centers[s['dept']], (s['lat'], s['lon'])) > 150000]


def build_report(snapshot):
 sources = snapshot.get('sources', {})
 stores = snapshot.get('stores', [])
 L = ['# Couverture du carnet officiel', '',
      'Fichier généré par `tools/update_official_stores.py` depuis `data/official-stores.json` — ne pas éditer à la main.', '',
      '- Snapshot : `' + str(snapshot.get('generatedAt')) + '`',
      '- Périmètre : France métropolitaine continentale, 12 régions, 94 départements (ni Corse ni outre-mer).',
      '- Total : **' + str(len(stores)) + '** magasins.',
      '- Légende : `✓` région complète avec preuve d’exhaustivité ; nombre seul = liste partielle ; `—` = aucune fiche.', '',
      '## Synthèse par enseigne', '',
      '| Enseigne | Magasins | Statut | Méthode | Preuve / limite | Annuaire de l’enseigne |',
      '|---|---:|---|---|---|---|']
 for brand in BRANDS:
  src = sources.get(brand, {})
  access = src.get('officialAccess') or {}
  if access.get('status') == 'blocked':
   acc = 'bloqué : HTTP ' + str(access.get('httpStatus')) + (' ' + str(access.get('protection')) if access.get('protection') else '') + ' (' + str(access.get('checkedAt', ''))[:10] + ')'
  else:
   acc = 'accessible'
  count = sum(1 for s in stores if s['enseigne'] == brand)
  L.append('| ' + ' | '.join([brand, str(count), STATUS_LABEL.get(src.get('status'), str(src.get('status') or 'inconnu')), str(src.get('method', '')).replace('|', '/'), str(src.get('proof', '')).replace('|', '/'), acc]) + ' |')
 L += ['', '## Par région', '', '| Région | ' + ' | '.join(BRANDS) + ' | Total |', '|---|' + '---:|' * (len(BRANDS) + 1)]
 for code, name in REGIONS:
  row = [name]
  total = 0
  for brand in BRANDS:
   n = sum(1 for s in stores if s['enseigne'] == brand and s['regionCode'] == code)
   total += n
   row.append(cell(n, ((sources.get(brand, {}).get('regions') or {}).get(code) or {}).get('status')))
  L.append('| ' + ' | '.join(row + [str(total)]) + ' |')
 L += ['', '## Par département', '', '| Dépt | Nom | Région | ' + ' | '.join(BRANDS) + ' | Total |', '|---|---|---|' + '---:|' * (len(BRANDS) + 1)]
 region_names = dict(REGIONS)
 for dept in sorted(DEPARTMENTS):
  counts = [sum(1 for s in stores if s['enseigne'] == brand and s['dept'] == dept) for brand in BRANDS]
  L.append('| ' + ' | '.join([dept, DEPARTMENTS[dept], region_names[DEPT_REGION[dept]]] + [str(n) if n else '—' for n in counts] + [str(sum(counts))]) + ' |')
 L += ['', '## Trous connus et limites', '']
 for brand in BRANDS:
  src = sources.get(brand, {})
  notes = []
  access = src.get('officialAccess') or {}
  if access.get('status') == 'blocked':
   notes.append('annuaire officiel bloqué pour la collecte automatique (' + str(access.get('url')) + ' → HTTP ' + str(access.get('httpStatus')) + (', protection ' + str(access.get('protection')) if access.get('protection') else '') + ')')
  if src.get('status') != 'complete':
   notes.append('aucune preuve d’exhaustivité : statut partiel')
  empty = [name for code, name in REGIONS if not any(s['enseigne'] == brand and s['regionCode'] == code for s in stores)]
  if empty:
   notes.append('aucune fiche en ' + ', '.join(empty))
  for reason, refs in sorted((src.get('rejected') or {}).items()):
   notes.append('fiches rejetées (' + reason + ') : ' + str(len(refs)) + (' dont ' + ', '.join('`' + str(r) + '`' for r in refs[:3]) if refs else ''))
  if src.get('outOfScope'):
   notes.append(str(src['outOfScope']) + ' fiche(s) hors périmètre écartée(s) (Corse, outre-mer)')
  if src.get('retired'):
   notes.append(str(len(src['retired'])) + ' page(s) retirée(s) par l’enseigne (magasin fermé), ex. ' + ', '.join('`' + str(u).split('/fr-fr/')[-1] + '`' for u in src['retired'][:3]))
  if src.get('sireneMerged'):
   notes.append(str(src['sireneMerged']) + ' double(s) déclaration(s) Sirene d’un même point de vente fusionnée(s)')
  for err in (src.get('errors') or [])[:3]:
   notes.append('erreur de collecte : ' + str(err))
  comp = src.get('composition') or {}
  if len(comp) > 1:
   notes.append('composition : ' + ', '.join(k + ' = ' + str(v) for k, v in comp.items()))
  L.append('- **' + brand + '** : ' + ('; '.join(notes) if notes else 'aucun trou connu') + '.')
 pairs = shared_addresses(stores)
 L += ['', '## Adresses partagées (signalées, non supprimées)', '',
       'Fiches distinctes d’une même enseigne à moins de 150 m (ex. Darty et Darty Cuisine d’un même centre). Elles restent toutes les deux dans le carnet ; à l’ajout, `RegionStores.duplicate` considère la seconde comme déjà présente si la première est dans le secteur.', '']
 if pairs:
  for brand, a, b in pairs:
   L.append('- ' + brand + ' : ' + a['sourceName'] + ' / ' + b['sourceName'] + ' (' + a['codePostal'] + ', ' + str(round(haversine((a['lat'], a['lon']), (b['lat'], b['lon'])))) + ' m)')
 else:
  L.append('- aucune')
 near = sirene_near_directory(stores)
 L += ['', '## Fiches Sirene proches d’une fiche d’annuaire (à vérifier)', '',
       'Établissement Sirene à moins de 3 km d’un magasin de l’annuaire de la même enseigne, avec une adresse ou un code postal différents : il est conservé (magasin distinct possible), à vérifier sur le terrain avant ajout.', '']
 if near:
  for brand, s, d, dist in near:
   L.append('- ' + brand + ' : ' + s['sourceName'] + ' (' + s['codePostal'] + ', Sirene `' + str(s['sourceUrl']).rsplit('/', 1)[-1] + '`) ↔ ' + d['sourceName'] + ' (' + d['codePostal'] + ', annuaire) — ' + str(round(dist)) + ' m')
 else:
  L.append('- aucune')
 odd = outliers(stores)
 L += ['', '## Contrôle de cohérence adresse / coordonnées', '']
 for s, dept in url_department_mismatch(stores):
  L.append('- ' + s['enseigne'] + ' : la fiche officielle `' + '/'.join(str(s['sourceUrl']).split('/')[-2:]) + '` (' + DEPARTMENTS[dept] + ') est publiée par l’enseigne avec l’adresse ' + s['adresse'] + ', ' + s['codePostal'] + ' ' + s['ville'] + ' : à vérifier avant ajout (la région suit le code postal).')
 L.append('- ' + (str(len(odd)) + ' fiche(s) à plus de 150 km du centre des magasins de leur département : ' + ', '.join(s['enseigne'] + ' ' + s['sourceName'] + ' (' + s['codePostal'] + ')' for s in odd) if odd else 'aucune fiche à plus de 150 km du centre des magasins de son département'))
 return '\n'.join(L) + '\n'


if __name__ == '__main__':
 path = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / 'data' / 'official-stores.json')
 sys.stdout.write(build_report(json.loads(path.read_text(encoding='utf-8'))))
