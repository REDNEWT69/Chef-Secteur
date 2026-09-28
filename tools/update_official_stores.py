#!/usr/bin/env python3
"""Régénère data/official-stores.json et le rapport de couverture (#467).

Pour chaque enseigne : meilleure source officielle accessible, preuve d'exhaustivité
quand elle existe, sinon statut « partial » explicite avec la preuve du blocage.
Usage : python tools/update_official_stores.py [--brands Darty,Cuisinella] [--out data/official-stores.json]
"""
import argparse, json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import official_directory_parsers as P
import catalog_coverage_report as R

ROOT = Path(__file__).resolve().parents[1]
BRANDS = ['Boulanger', 'Darty', 'Fnac', 'Conforama', 'Cuisinella', 'Carrefour']
SIRENE_LABEL = 'Répertoire Sirene (INSEE)'


def load_previous(path):
 try:
  return json.loads(Path(path).read_text(encoding='utf-8'))
 except (OSError, ValueError):
  return {'stores': [], 'sources': {}}


def normalize_previous(rows, brand):
 """Fiches d'annuaire d'une collecte antérieure : continentales, région recalculée,
 vrais doublons (même nom au même endroit, collectés par deux méthodes) fusionnés."""
 out = []
 for row in sorted((r for r in rows if r.get('enseigne') == brand and str(r.get('source', '')).startswith('Annuaire officiel')), key=lambda r: str(r.get('sourceFetchedAt', '')), reverse=True):
  s = dict(row); postal = str(s.get('codePostal') or '')
  if not P.is_continental_postal(postal) or not P.valid_coords(s.get('lat'), s.get('lon')):
   continue
  s['dept'] = P.dept_from_postal(postal); s['regionCode'] = P.region_code_from_postal(postal); s['region'] = P.REGIONS[s['regionCode']][0]
  if any(P.norm(o['sourceName']) == P.norm(s['sourceName']) and P.haversine((o['lat'], o['lon']), (s['lat'], s['lon'])) < 80 for o in out):
   continue
  out.append(s)
 return out


def region_message(brand, meta):
 kind = meta['kind']
 if kind == 'complete':
  return 'Liste officielle complète, contrôlée contre ' + meta['reference'] + ' de l’enseigne.'
 if kind == 'official-partial':
  return 'Liste officielle collectée sans preuve d’exhaustivité : ' + meta['why'] + '.'
 if kind == 'retained':
  return 'Liste partielle : l’annuaire ' + brand + ' bloque la collecte automatique ; fiches de la dernière collecte réussie' + (' complétées par le répertoire Sirene (INSEE)' if meta.get('sirene') else '') + '.'
 if kind == 'sirene':
  return 'Liste partielle issue du répertoire Sirene (INSEE) : l’annuaire ' + brand + ' bloque la collecte automatique. Vérifie l’adresse avant d’ajouter.'
 return 'Aucune liste exploitable pour cette enseigne dans cette région.'


def summarize(brand, rows, report, meta, access):
 regions = {}
 for code in P.REGIONS:
  count = sum(1 for r in rows if r['regionCode'] == code)
  status = 'collected' if meta['kind'] == 'complete' else ('partial' if count else 'unavailable')
  regions[code] = {'status': status, 'count': count, 'message': region_message(brand, meta) if count or meta['kind'] == 'complete' else region_message(brand, {'kind': 'none'})}
 departments = {}
 for r in rows:
  departments[r['dept']] = departments.get(r['dept'], 0) + 1
 composition = {}
 for r in rows:
  label = r['source'] + ('' if r['source'] == SIRENE_LABEL else ' (' + str(r.get('sourceFetchedAt', ''))[:10] + ')')
  composition[label] = composition.get(label, 0) + 1
 status = 'complete' if meta['kind'] == 'complete' else ('partial' if rows else 'unavailable')
 return {
  'url': P.OFFICIAL_ENTRY[brand], 'count': len(rows), 'status': status,
  'method': meta.get('method') or report.get('method', ''), 'proof': report.get('proof', ''),
  'officialAccess': access or {'status': 'ok'},
  'checkedAt': report.get('checkedAt') or P.now_iso(), 'errors': report.get('errors', [])[:6],
  'rejected': {k: v[:6] for k, v in (report.get('rejected') or {}).items()},
  'outOfScope': report.get('outOfScope', 0),
  'sireneRejected': report.get('sireneRejected', {}),
  'composition': dict(sorted(composition.items())),
  'regions': regions, 'departments': dict(sorted(departments.items())),
 }


def collect_with_proof(brand, collector, previous_rows, fetched_at, reference):
 access = P.probe_access(brand)
 if access:
  access = dict(access, status='blocked')
 report, rows = collector(fetched_at=fetched_at)
 if report.get('complete'):
  return rows, report, {'kind': 'complete', 'reference': reference}, access
 prev = normalize_previous(previous_rows, brand)
 new_ids = {x['id'] for x in rows}
 if rows and len(rows) >= 0.9 * len(prev):
  why = '; '.join(report.get('errors', [])[:2] + [k + ' : ' + str(len(v)) for k, v in (report.get('rejected') or {}).items()]) or 'contrôle croisé incomplet'
  return rows, report, {'kind': 'official-partial', 'why': why}, access
 # Collecte nettement plus petite que la précédente : on garde aussi les anciennes fiches.
 return rows + [r for r in prev if r['id'] not in new_ids], report, {'kind': 'retained', 'sirene': False}, access


def collect_blocked_with_sirene(brand, previous_rows, fetched_at, official_collector=None):
 access = P.probe_access(brand)
 rows, report = [], {}
 if not access and official_collector:
  report, rows = official_collector()
 if access:
  access = dict(access, status='blocked')
 kept = normalize_previous(previous_rows, brand) if access or not rows else rows
 sirene_report, sirene_rows = P.collect_sirene(brand, fetched_at=fetched_at)
 if not sirene_rows and sirene_report.get('errors'):
  # API Sirene indisponible : on garde les établissements Sirene du snapshot précédent.
  sirene_rows = [dict(r) for r in previous_rows if r.get('enseigne') == brand and r.get('source') == SIRENE_LABEL and P.is_continental_postal(r.get('codePostal'))]
 extra = [r for r in sirene_rows if not P.matches_existing(r, kept)]
 rows = kept + extra
 method = ('Annuaire ' + brand + ' (dernière collecte réussie) + ' if kept else '') + sirene_report['method']
 report = dict(sirene_report, method=method, proof=(('Annuaire ' + brand + ' : ' + str(len(kept)) + ' fiches conservées ; ') if kept else '') + 'Sirene : ' + str(len(extra)) + ' établissements ajoutés sur ' + str(len(sirene_rows)) + ' reconnus (' + str(len(sirene_rows) - len(extra)) + ' déjà présents). ' + sirene_report['proof'])
 kind = 'retained' if kept else 'sirene'
 return rows, report, {'kind': kind, 'sirene': bool(extra), 'method': method}, access


def main(argv=None):
 ap = argparse.ArgumentParser()
 ap.add_argument('--brands', default=','.join(BRANDS))
 ap.add_argument('--out', default=str(ROOT / 'data' / 'official-stores.json'))
 ap.add_argument('--report', default=str(ROOT / 'CATALOGUE_COUVERTURE.md'))
 args = ap.parse_args(argv)
 wanted = [b for b in args.brands.split(',') if b]
 previous = load_previous(args.out)
 prev_rows = previous.get('stores', [])
 fetched_at = P.now_iso()
 sources, stores = {}, []
 # Sources prouvables d'abord ; l'ordre du JSON reste celui de BRANDS.
 for brand in ['Darty', 'Cuisinella', 'Boulanger', 'Conforama', 'Fnac', 'Carrefour']:
  if brand not in wanted:
   keep = [r for r in prev_rows if r.get('enseigne') == brand]
   stores.extend(keep)
   if brand in previous.get('sources', {}):
    sources[brand] = previous['sources'][brand]
   continue
  if brand == 'Darty':
   rows, report, meta, access = collect_with_proof(brand, P.collect_darty, prev_rows, fetched_at, 'le plan du site et le sitemap')
  elif brand == 'Cuisinella':
   rows, report, meta, access = collect_with_proof(brand, P.collect_cuisinella, prev_rows, fetched_at, 'le sitemap officiel')
  elif brand == 'Boulanger':
   rows, report, meta, access = collect_blocked_with_sirene(brand, prev_rows, fetched_at, P.collect_boulanger)
  elif brand == 'Conforama':
   rows, report, meta, access = collect_blocked_with_sirene(brand, prev_rows, fetched_at, lambda: P.collect_conforama(fetched_at))
  else:
   rows, report, meta, access = collect_blocked_with_sirene(brand, prev_rows, fetched_at)
  rows = sorted(rows, key=lambda r: (r['regionCode'], r['dept'], P.norm(r['ville']), P.norm(r['sourceName']), r['id']))
  ids = set()
  rows = [r for r in rows if not (r['id'] in ids or ids.add(r['id']))]
  sources[brand] = summarize(brand, rows, report, meta, access)
  stores.extend(rows)
  print(brand, sources[brand]['status'], len(rows), '|', sources[brand]['proof'], flush=True)
  if os.environ.get('CATALOG_VERBOSE') == '1':
   print(json.dumps({'brand': brand, 'errors': report.get('errors'), 'rejected': report.get('rejected'), 'sireneRejectedSample': report.get('sireneRejectedSample'), 'access': access}, ensure_ascii=False), flush=True)
 stores = sorted(stores, key=lambda r: (r['enseigne'], r['regionCode'], r['dept'], P.norm(r['ville']), P.norm(r['sourceName']), r['id']))
 sources = {b: sources[b] for b in BRANDS if b in sources}
 out = {'generatedAt': fetched_at[:19] + 'Z', 'scope': 'France métropolitaine continentale (12 régions)', 'sources': sources, 'stores': stores}
 Path(args.out).write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
 markdown = R.build_report(out)
 Path(args.report).write_text(markdown, encoding='utf-8')
 summary = os.environ.get('GITHUB_STEP_SUMMARY')
 if summary:
  with open(summary, 'a', encoding='utf-8') as f:
   f.write(markdown + '\n')
 print('stores', len(stores))


if __name__ == '__main__':
 main()
