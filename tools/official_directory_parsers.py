"""Collecte des annuaires officiels des enseignes (#467).

Faits publics sur les magasins uniquement, jamais de données utilisateur.

Principes :
- une source officielle par enseigne, avec preuve d'exhaustivité quand la source
  en publie une (plan du site, sitemap) ; sans preuve, le statut reste « partial » ;
- la région vient toujours du code postal : France métropolitaine continentale,
  12 régions, jamais la Corse ni l'outre-mer ;
- aucune déduplication par adresse : deux fiches officielles distinctes restent
  distinctes (Darty et Darty Cuisine d'un même centre), seuls les vrais doublons
  d'une même fiche (même identifiant, ou même nom au même endroit) sont fusionnés ;
- une source bloquée (anti-robot, HTTP 4xx) est déclarée avec sa preuve ; le
  collecteur s'identifie honnêtement et ne contourne aucune protection ;
- quand l'annuaire de l'enseigne est bloqué, le répertoire Sirene de l'INSEE
  (source publique officielle, API Recherche d'entreprises) fournit les
  établissements actifs déclarés sous l'enseigne, marqués comme tels.

Bibliothèque standard uniquement : les tests Reliability l'importent sans dépendance.
"""
import concurrent.futures, datetime, gzip, hashlib, html, json, math, re, socket, threading, time, unicodedata, urllib.error, urllib.parse, urllib.request
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

REGIONS={'84':('Auvergne-Rhône-Alpes','auvergne-rhone-alpes'),'27':('Bourgogne-Franche-Comté','bourgogne-franche-comte'),'53':('Bretagne','bretagne'),'24':('Centre-Val de Loire','centre-val-de-loire'),'44':('Grand Est','grand-est'),'32':('Hauts-de-France','hauts-de-france'),'28':('Normandie','normandie'),'75':('Nouvelle-Aquitaine','nouvelle-aquitaine'),'76':('Occitanie','occitanie'),'52':('Pays de la Loire','pays-de-la-loire'),'93':("Provence-Alpes-Côte d'Azur",'provence-alpes-cote-d-azur'),'11':('Île-de-France','ile-de-france')}
ROOTS={'Boulanger':'https://www.boulanger.com/magasins/','Darty':'https://magasin.darty.com/fr/'}
DEPT_REGION={
 '01':'84','03':'84','07':'84','15':'84','26':'84','38':'84','42':'84','43':'84','63':'84','69':'84','73':'84','74':'84',
 '21':'27','25':'27','39':'27','58':'27','70':'27','71':'27','89':'27','90':'27',
 '75':'11','77':'11','78':'11','91':'11','92':'11','93':'11','94':'11','95':'11',
 '02':'32','59':'32','60':'32','62':'32','80':'32','08':'44','10':'44','51':'44','52':'44','54':'44','55':'44','57':'44','67':'44','68':'44','88':'44',
 '14':'28','27':'28','50':'28','61':'28','76':'28','18':'24','28':'24','36':'24','37':'24','41':'24','45':'24',
 '16':'75','17':'75','19':'75','23':'75','24':'75','33':'75','40':'75','47':'75','64':'75','79':'75','86':'75','87':'75',
 '09':'76','11':'76','12':'76','30':'76','31':'76','32':'76','34':'76','46':'76','48':'76','65':'76','66':'76','81':'76','82':'76',
 '22':'53','29':'53','35':'53','56':'53','44':'52','49':'52','53':'52','72':'52','85':'52',
 '04':'93','05':'93','06':'93','13':'93','83':'93','84':'93'
}
UA='Mozilla/5.0 (compatible; StoreRunnerCatalogue/1.0; +https://store-runner.fr)'
BOULANGER_SOURCE='https://www.boulanger.com/info/magasins/searchmag'
DARTY_ROOT='https://magasin.darty.com'
CUISINELLA_ROOT='https://www.ma.cuisinella'
CONFORAMA_ROOT='https://www.conforama.fr/magasins-conforama'
SIRENE_API='https://recherche-entreprises.api.gouv.fr/search'
SIRENE_PAGE='https://annuaire-entreprises.data.gouv.fr/etablissement/'
OFFICIAL_ENTRY={
 'Boulanger':'https://www.boulanger.com/magasins/',
 'Darty':'https://magasin.darty.com/fr',
 'Fnac':'https://www.fnac.com/localiser-magasin-fnac/w-4',
 'Conforama':'https://www.conforama.fr/liste-des-magasins',
 'Carrefour':'https://www.carrefour.fr/magasin/liste',
 'Cuisinella':'https://www.ma.cuisinella/fr-fr/liste-magasins',
}

# ---------------------------------------------------------------- géographie

def dept_from_postal(postal):
 postal=str(postal or '').strip()
 return postal[:2]

def region_code_from_postal(postal):
 postal=str(postal or '').strip()
 return DEPT_REGION.get(postal[:2],'') if re.fullmatch(r'\d{5}',postal) else ''

def is_continental_postal(postal):
 return bool(region_code_from_postal(postal))

def now_iso():
 return datetime.datetime.now(datetime.timezone.utc).isoformat()

def norm(s):
 s=unicodedata.normalize('NFD',str(s or ''))
 return ''.join(c for c in s if unicodedata.category(c)!='Mn').lower().strip()

def slug(s):
 return re.sub(r'[^a-z0-9]+','-',norm(s)).strip('-')

def haversine(a,b):
 la1,lo1,la2,lo2=map(math.radians,(a[0],a[1],b[0],b[1]))
 h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
 return 6371000*2*math.asin(math.sqrt(min(1,h)))

def valid_coords(lat,lon):
 return isinstance(lat,(int,float)) and isinstance(lon,(int,float)) and math.isfinite(lat) and math.isfinite(lon) and 41<=lat<=51.5 and -5.5<=lon<=10

def to_float(v):
 try:
  f=float(str(v).strip().replace(',','.'))
  return f if math.isfinite(f) else None
 except (TypeError,ValueError):
  return None

def clean(s):
 return re.sub(r'\s+',' ',html.unescape(str(s or ''))).strip(' ,')

def stable_id(brand,source):
 return 'official-'+brand.lower()+'-'+hashlib.sha256(source.encode()).hexdigest()[:16]

def make_store(brand,name,address,city,postal,lat,lon,source_url,region_code=None,site_id=None,store_id=None,fetched_at=None,source=None):
 # La région vient du code postal ; region_code n'est gardé que pour compatibilité d'appel.
 dept=dept_from_postal(postal)
 code=region_code_from_postal(postal)
 return dict(
  id=store_id or (('official-'+brand.lower()+'-'+str(site_id).lower()) if site_id else stable_id(brand,source_url)),
  enseigne=brand,sourceName=name,adresse=address,ville=city,codePostal=postal,dept=dept,
  lat=lat,lon=lon,region=REGIONS.get(code,('',))[0],regionCode=code,
  source=source or ('Annuaire officiel '+brand),sourceUrl=source_url,sourceFetchedAt=fetched_at or now_iso(),
  freq='Mensuel',intervalDays=30,priority=3,active=True,products=['À confirmer'])

# ---------------------------------------------------------------- HTTP

ANTIBOT=[('datadome',re.compile(r'datadome|captcha-delivery',re.I)),('cloudflare',re.compile(r'cf-ray|cf-chl|challenge-platform|cloudflare|just a moment',re.I)),('akamai',re.compile(r'akamai|_abck|bm_sz|reference&#32;&#35;',re.I)),('imperva',re.compile(r'incapsula|imperva|_incap_',re.I))]

class HttpError(RuntimeError):
 def __init__(self,url,status=0,vendor='',detail=''):
  self.url=url;self.status=status;self.vendor=vendor;self.detail=detail
  label=('HTTP '+str(status)) if status else 'réseau'
  super().__init__(label+(' ('+vendor+')' if vendor else '')+' : '+url+(' — '+detail if detail else ''))
 def evidence(self):
  return {'url':self.url,'httpStatus':self.status,'protection':self.vendor or None,'detail':self.detail or None}

def antibot_vendor(headers,body):
 blob=' '.join('%s: %s'%kv for kv in (headers.items() if headers else []))+' '+(body or '')[:6000]
 return ','.join(name for name,rx in ANTIBOT if rx.search(blob))

_throttle_lock=threading.Lock();_last_hit={}

def _throttle(host,delay):
 with _throttle_lock:
  wait=_last_hit.get(host,0)+delay-time.monotonic()
  _last_hit[host]=time.monotonic()+max(0,wait)
 if wait>0:time.sleep(wait)

def http_get(url,accept='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5',timeout=30,retries=2,delay=0.35,same_host=True):
 """GET poli et honnête. Renvoie (texte, url finale). Lève HttpError avec la preuve du blocage."""
 host=urlparse(url).hostname
 for attempt in range(max(retries,4)+1):
  _throttle(host,delay)
  req=urllib.request.Request(url,headers={'User-Agent':UA,'Accept':accept,'Accept-Language':'fr-FR,fr;q=0.9'})
  try:
   with urllib.request.urlopen(req,timeout=timeout) as r:
    body=r.read();final=r.geturl();charset=r.headers.get_content_charset() or 'utf-8'
   if body[:2]==b'\x1f\x8b':body=gzip.decompress(body)  # sitemap .xml.gz
   if same_host and urlparse(final).hostname!=host:raise HttpError(url,0,'','redirection hors annuaire vers '+final)
   return body.decode(charset,'replace'),final
  except urllib.error.HTTPError as e:
   try:body=e.read(8000).decode('utf-8','replace')
   except Exception:body=''
   if e.code==429 and attempt<max(retries,4):
    # Limitation de débit : on respecte Retry-After (plafonné) avant de réessayer.
    try:wait=float(e.headers.get('Retry-After') or 0)
    except ValueError:wait=0
    time.sleep(min(30,max(wait,2*(attempt+1))));continue
   if e.code in (500,502,503,504) and attempt<retries:time.sleep(2+3*attempt);continue
   raise HttpError(url,e.code,antibot_vendor(e.headers,body))
  except (urllib.error.URLError,socket.timeout,TimeoutError,ConnectionError) as e:
   if attempt<retries:time.sleep(2+3*attempt);continue
   raise HttpError(url,0,'',str(getattr(e,'reason',e))[:120])

def fetch(url):
 """Compatibilité : page HTML d'un annuaire (lève RuntimeError si inexploitable)."""
 text,_=http_get(url)
 if len(text)<500 or '<html' not in text.lower():raise RuntimeError('Page invalide : '+url)
 return text

def fetch_result(url):
 try:return fetch(url)
 except Exception as e:return e

def probe_access(brand,get=None):
 """Preuve d'accès à l'annuaire officiel : None si accessible, sinon la preuve du blocage."""
 url=OFFICIAL_ENTRY.get(brand)
 if not url:return None
 try:(get or http_get)(url,retries=0);return None
 except HttpError as e:return dict(e.evidence(),checkedAt=now_iso())

# ---------------------------------------------------------------- JSON-LD et pages

_LD_RX=re.compile(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',re.S|re.I)

def jsonld_blocks(text):
 out=[]
 for raw in _LD_RX.findall(text or ''):
  try:out.append(json.loads(raw,strict=False))
  except ValueError:
   try:out.append(json.loads(html.unescape(raw),strict=False))
   except ValueError:continue
 return out

def iter_places(obj):
 """Objets schema.org portant une adresse (géo facultative), quelle que soit l'imbrication."""
 if isinstance(obj,list):
  for x in obj:yield from iter_places(x)
 elif isinstance(obj,dict):
  if isinstance(obj.get('address'),dict):yield obj
  for key in ('@graph','itemListElement','item','mainEntity','hasPart','subOrganization','department'):
   if key in obj:yield from iter_places(obj[key])

def place_fields(place):
 a=place.get('address') or {};g=place.get('geo') if isinstance(place.get('geo'),dict) else {}
 street=clean(a.get('streetAddress'))
 return dict(name=clean(place.get('name')),address=street,city=clean(a.get('addressLocality')),postal=re.sub(r'\s','',str(a.get('postalCode') or '')),
  country=str(a.get('addressCountry') or '').upper(),lat=to_float(g.get('latitude')),lon=to_float(g.get('longitude')),url=str(place.get('url') or place.get('@id') or ''))

def check_fields(f,brand):
 """Motif de rejet d'une fiche, ou '' si elle est exploitable."""
 if not norm(f['name']).startswith(norm(brand)):return 'nom hors enseigne'
 if f['country'] and f['country'] not in ('FR','FRA','FRANCE'):return 'hors périmètre'
 if re.fullmatch(r'\d{4}',f['postal']):return 'hors périmètre'
 if not re.fullmatch(r'\d{5}',f['postal']):return 'code postal invalide'
 if not is_continental_postal(f['postal']):return 'hors périmètre'
 if not f['address'] or not f['city']:return 'adresse incomplète'
 if not valid_coords(f['lat'],f['lon']):return 'coordonnées absentes ou hors France'
 return ''

class Page(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.links=[];self.scripts=[];self.script=None;self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='script' and (a.get('type')=='application/ld+json' or a.get('id') in ('js-map-config-dir-map','structured-data-organization')):self.script=''
  if tag in ('a','link') and a.get('href') and (set(a.get('class','').split())&{'Directory-listLink','Teaser-titleLink'} or a.get('rel')=='next'):self.links.append(a['href'])
 def handle_data(self,text):
  if self.script is not None:self.script+=text
 def handle_endtag(self,tag):
  if tag=='script' and self.script is not None:self.scripts.append(self.script);self.script=None

def objects(obj):
 if isinstance(obj,list):
  for x in obj:yield from objects(x)
 elif isinstance(obj,dict):
  if isinstance(obj.get('address'),dict) and isinstance(obj.get('geo'),dict):yield obj
  for key in ('@graph','itemListElement','item'):
   if key in obj:yield from objects(obj[key])

def parse(text,url,brand,code):
 """Annuaires de type « Directory » (Boulanger/Yext, anciennes pages Darty, fiches Conforama)."""
 page=Page(text);rows=[]
 for raw in page.scripts:
  try:obj=json.loads(raw,strict=False)
  except ValueError:continue
  if brand=='Boulanger' and isinstance(obj,dict) and 'entities' in obj:
   converted=[]
   for entry in obj['entities']:
    profile=entry.get('profile',{});a=profile.get('address',{});g=profile.get('yextRoutableCoordinate') or profile.get('geocodedCoordinate') or {}
    if profile.get('closed') is True:continue
    converted.append({'name':profile.get('name',''),'address':{'streetAddress':', '.join(a.get(k) for k in ('line1','line2','line3') if a.get(k)),'addressLocality':a.get('city',''),'postalCode':a.get('postalCode','')},'geo':{'latitude':g.get('lat'),'longitude':g.get('long')},'url':url})
   obj=converted
  for x in objects(obj):
   a=x['address'];g=x['geo'];name=html.unescape(x.get('name',''))
   if not name.casefold().startswith(brand.casefold()):continue
   try:lat=float(g['latitude']);lon=float(g['longitude'])
   except (KeyError,ValueError,TypeError):continue
   address=html.unescape(str(a.get('streetAddress',''))).strip();city=html.unescape(str(a.get('addressLocality',''))).strip();postal=str(a.get('postalCode',''))
   source=urljoin(url,x.get('url') or url)
   if not is_continental_postal(postal):continue
   if urlparse(source).hostname!=urlparse(url).hostname or not address or not city or not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:continue
   rows.append(make_store(brand,name,address,city,postal,lat,lon,source,code))
 return rows,([] if brand=='Boulanger' and rows else [urljoin(url,h) for h in page.links])

def sitemap_locs(xml):
 return [html.unescape(x).strip() for x in re.findall(r'<loc>\s*([^<]+?)\s*</loc>',xml or '')]

def page_hrefs(text):
 return [html.unescape(h) for h in re.findall(r'<a\s[^>]*?href\s*=\s*["\']([^"\']+)["\']',text or '',re.I)]

def rel_next(text):
 for tag in re.findall(r'<link\b[^>]*>',text or '',re.I):
  if re.search(r'rel\s*=\s*["\']next["\']',tag,re.I):
   m=re.search(r'href\s*=\s*["\']([^"\']+)["\']',tag,re.I)
   if m:return html.unescape(m.group(1))
 return ''

def _report(method,**kw):
 base=dict(method=method,checkedAt=now_iso(),errors=[],rejected={},rejectedCount={},outOfScope=0)
 base.update(kw);return base

def _reject(report,reason,ref):
 bucket=report['rejected'].setdefault(reason,[])
 report['rejectedCount'][reason]=report['rejectedCount'].get(reason,0)+1
 if len(bucket)<12:bucket.append(ref)

def _unresolved(report):
 return sum(report.get('rejectedCount',{}).values())

BAN_API='https://api-adresse.data.gouv.fr/search/'

def ban_geocode(address,postal,city,get=None):
 """Coordonnées d'une adresse par la Base Adresse Nationale (API officielle), ou None."""
 q=' '.join(x for x in (address,postal,city) if x)
 if not q or not re.fullmatch(r'\d{5}',postal or ''):return None
 try:data=json.loads((get or http_get)(BAN_API+'?'+urllib.parse.urlencode({'q':q,'postcode':postal,'limit':1}),accept='application/json',delay=0.2,retries=1)[0])
 except (HttpError,ValueError):return None
 for feat in data.get('features') or []:
  props=feat.get('properties') or {};coords=(feat.get('geometry') or {}).get('coordinates') or []
  if props.get('postcode')==postal and float(props.get('score') or 0)>=0.5 and len(coords)==2 and valid_coords(float(coords[1]),float(coords[0])):
   return round(float(coords[1]),7),round(float(coords[0]),7)
 return None

# ---------------------------------------------------------------- Darty

DARTY_STORE_PATH=re.compile(r'^/(\d+)-[a-z0-9-]+$')

def darty_store_path(href):
 p=urlparse(urljoin(DARTY_ROOT+'/',str(href or '').strip()))
 if p.hostname!='magasin.darty.com':return ''
 path=p.path.rstrip('/')
 return path if DARTY_STORE_PATH.match(path) else ''

def darty_store_from_place(place,fetched_at):
 f=place_fields(place);path=darty_store_path(f['url'])
 if not path:return None,'fiche sans URL magasin',path
 reason=check_fields(f,'Darty')
 if reason:return None,reason,path
 src=DARTY_ROOT+path
 return make_store('Darty',f['name'],f['address'],f['city'],f['postal'],f['lat'],f['lon'],src,fetched_at=fetched_at),'',path

def parse_darty_listing(text,fetched_at=None):
 """Page de la liste nationale : {chemin: (fiche|None, motif)} et lien de page suivante."""
 found={}
 for block in jsonld_blocks(text):
  for place in iter_places(block):
   row,reason,path=darty_store_from_place(place,fetched_at)
   if path:found[path]=(row,reason)
 return found,rel_next(text)

def collect_darty(get=None,fetched_at=None,max_pages=40,workers=2):
 get=get or http_get;fetched_at=fetched_at or now_iso()
 report=_report('Liste nationale paginée magasin.darty.com/fr, contrôlée par le plan du site et le sitemap officiel',sourceUrl=DARTY_ROOT+'/fr')
 found={};url=DARTY_ROOT+'/fr';pages=0;seen=set()
 while url and pages<max_pages and url not in seen:
  seen.add(url)
  try:text,_=get(url)
  except HttpError as e:report['errors'].append(str(e));break
  pages+=1;rows,nxt=parse_darty_listing(text,fetched_at);found.update(rows)
  url=urljoin(DARTY_ROOT+'/',nxt) if nxt else ''
 report['listingPages']=pages;report['listing']=len(found)
 plan=set();sitemap=set()
 try:plan={p for p in (darty_store_path(h) for h in page_hrefs(get(DARTY_ROOT+'/plan-du-site')[0])) if p}
 except HttpError as e:report['errors'].append(str(e))
 try:
  index=get(DARTY_ROOT+'/sitemap.xml',accept='application/xml,text/xml;q=0.9,*/*;q=0.5')[0]
  for loc in sitemap_locs(index):
   if urlparse(loc).hostname!='magasin.darty.com':continue
   xml=get(loc,accept='application/xml,text/xml;q=0.9,*/*;q=0.5')[0]
   sitemap|={p for p in (darty_store_path(l) for l in sitemap_locs(xml)) if p}
 except HttpError as e:report['errors'].append(str(e))
 report['planDuSite']=len(plan);report['sitemap']=len(sitemap)
 reference=plan|sitemap
 missing=sorted(reference-set(found),key=lambda p:int(DARTY_STORE_PATH.match(p).group(1)))
 report['fetchedIndividually']=len(missing)
 def one(path):
  try:
   text,_=get(DARTY_ROOT+path);rows,_=parse_darty_listing(text,fetched_at)
   return path,rows.get(path,(None,'fiche magasin sans données structurées'))
  except HttpError as e:return path,(None,'page inaccessible ('+str(e.status)+')')
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
  for path,res in pool.map(one,missing):found[path]=res
 rows=[]
 for path,(row,reason) in sorted(found.items()):
  if row:rows.append(row)
  elif reason=='hors périmètre':report['outOfScope']+=1
  else:_reject(report,reason,path)
 report['notInReference']=sorted(set(found)-reference)[:20]
 report['parsed']=len(rows)
 unresolved=_unresolved(report)
 report['complete']=bool(reference) and plan==sitemap and not report['errors'] and unresolved==0 and set(found)>=reference
 report['proof']=('Plan du site ('+str(len(plan))+') = sitemap ('+str(len(sitemap))+') ; '+str(len(rows))+' fiches continentales, '+str(report['outOfScope'])+' hors périmètre, '+str(unresolved)+' non exploitables')
 return report,rows

# ---------------------------------------------------------------- Cuisinella

CUISINELLA_STORE=re.compile(r'^/fr-fr/magasins/[a-z0-9-]+/[a-z0-9-]+$')

def cuisinella_store_url(href):
 p=urlparse(urljoin(CUISINELLA_ROOT+'/',str(href or '').strip()))
 if p.hostname!='www.ma.cuisinella':return ''
 path=p.path.rstrip('/')
 return CUISINELLA_ROOT+path if CUISINELLA_STORE.match(path) else ''

def cuisinella_legacy_id(postal,name):
 # Identifiant historique du carnet (conservé pour les magasins déjà enregistrés).
 return 'official-'+re.sub(r'[^a-z0-9]+','-',norm('Cuisinella-'+postal+'-'+name)).strip('-')

def parse_cuisinella_store(text,url,fetched_at=None,geocode=None):
 for block in jsonld_blocks(text):
  for place in iter_places(block):
   f=place_fields(place)
   if not f['name']:continue
   reason=check_fields(f,'Cuisinella');located=False
   if reason=='coordonnées absentes ou hors France' and geocode:
    point=geocode(f['address'],f['postal'],f['city'])
    if point:f['lat'],f['lon']=point;reason=check_fields(f,'Cuisinella');located=True
   if reason:return None,reason
   row=make_store('Cuisinella',f['name'],f['address'],f['city'],f['postal'],f['lat'],f['lon'],url,store_id=cuisinella_legacy_id(f['postal'],f['name']),fetched_at=fetched_at)
   if located:row['coordsSource']='Base Adresse Nationale'
   return row,''
 return None,'fiche magasin sans données structurées'

def parse_cuisinella_map(text):
 """Données du localisateur officiel : `var STORES_MAP = {"Stores":[…]}` de la page carte."""
 # La déclaration elle-même : d'autres mentions (gabarits Vue) peuvent la précéder.
 for m in re.finditer(r'STORES_MAP\s*=\s*(?=\{)',text or ''):
  try:obj,_=json.JSONDecoder(strict=False).raw_decode(text,m.end())
  except ValueError:continue
  stores=obj.get('Stores') if isinstance(obj,dict) else None
  if isinstance(stores,list):return stores
 return []

def cuisinella_from_map(store,fetched_at=None,geocode=None):
 """(fiche|None, motif, url) pour une entrée STORES_MAP."""
 url=cuisinella_store_url(store.get('Url'))
 if norm(store.get('Brand'))!='cuisinella':return None,'autre enseigne',url
 label=clean(store.get('StoreName'))
 name=label if norm(label).startswith('cuisinella') else 'Cuisinella '+label
 address=', '.join(clean(store.get(k)) for k in ('StreetLine1','StreetLine2','StreetLine3') if clean(store.get(k)))
 f=dict(name=name,address=address,city=clean(store.get('City')),postal=re.sub(r'\s','',str(store.get('PostalCode') or '')),country='',lat=to_float(store.get('Latitude')),lon=to_float(store.get('Longitude')),url=url)
 if not url:return None,'fiche sans URL magasin',''
 reason=check_fields(f,'Cuisinella')
 located=False
 if reason=='coordonnées absentes ou hors France' and geocode:
  point=geocode(f['address'],f['postal'],f['city'])
  if point:f['lat'],f['lon']=point;reason=check_fields(f,'Cuisinella');located=True
 if reason:return None,reason,url
 row=make_store('Cuisinella',f['name'],f['address'],f['city'],f['postal'],f['lat'],f['lon'],url,store_id=cuisinella_legacy_id(f['postal'],f['name']),fetched_at=fetched_at)
 if located:row['coordsSource']='Base Adresse Nationale'
 return row,'',url

def collect_cuisinella(get=None,fetched_at=None,workers=1):
 get=get or http_get;fetched_at=fetched_at or now_iso()
 report=_report('Localisateur officiel ma.cuisinella (données STORES_MAP de /fr-fr/magasins), contrôlé par le sitemap officiel',sourceUrl=CUISINELLA_ROOT+'/fr-fr/magasins')
 sitemap=set();found={};refetch=set()
 try:sitemap={u for u in (cuisinella_store_url(l) for l in sitemap_locs(get(CUISINELLA_ROOT+'/sitemap.xml',accept='application/xml,text/xml;q=0.9,*/*;q=0.5')[0])) if u}
 except HttpError as e:report['errors'].append(str(e))
 try:
  stores=parse_cuisinella_map(get(CUISINELLA_ROOT+'/fr-fr/magasins')[0])
  for store in stores:
   row,reason,url=cuisinella_from_map(store,fetched_at)
   # Magasin actif sans coordonnées dans la carte : sa fiche (JSON-LD) est lue ensuite.
   if reason=='coordonnées absentes ou hors France' and url:refetch.add(url);continue
   if url and (url not in found or row):found[url]=(row,reason)
   elif not url:_reject(report,reason,str(store.get('StoreId')))
  report['locator']=len(stores)
  if not stores:report['errors'].append('Données STORES_MAP absentes de la page carte')
 except HttpError as e:report['errors'].append(str(e))
 report['sitemap']=len(sitemap)
 # Fiche du sitemap absente du localisateur : lue une à une (JSON-LD de la fiche).
 missing=sorted((sitemap|refetch)-set(found));report['fetchedIndividually']=len(missing)
 def one(url):
  # Page du sitemap absente du localisateur : 404 ou redirection = fiche retirée (magasin fermé).
  # Magasin du localisateur sans coordonnées : JSON-LD de sa fiche, puis Base Adresse Nationale.
  try:
   text,final=get(url,delay=0.8)
   if urlparse(final).path.rstrip('/')!=urlparse(url).path.rstrip('/'):return url,(None,'retirée')
   return url,parse_cuisinella_store(text,url,fetched_at,geocode=lambda a,p,c:ban_geocode(a,p,c,get))
  except HttpError as e:return url,(None,'retirée' if e.status in (404,410) and url not in refetch else 'page inaccessible ('+str(e.status)+')')
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
  for url,res in pool.map(one,missing):found[url]=res
 rows=[];retired=[]
 for url,(row,reason) in sorted(found.items()):
  if row:rows.append(row)
  elif reason=='hors périmètre':report['outOfScope']+=1
  elif reason=='retirée':retired.append(url)
  else:_reject(report,reason,url)
 report['retired']=retired;report['parsed']=len(rows)
 unresolved=_unresolved(report)
 located=sum(1 for r in rows if r.get('coordsSource'))
 # Preuve : chaque magasin du localisateur est collecté, et chaque page du sitemap est soit
 # collectée, soit retirée (404/redirection). Le localisateur fait foi pour les magasins actifs.
 report['complete']=bool(sitemap) and bool(report.get('locator')) and not report['errors'] and unresolved==0
 report['proof']=('Localisateur officiel ('+str(report.get('locator',0))+' magasins) contrôlé par le sitemap ('+str(len(sitemap))+' fiches) : '+str(len(rows))+' fiches continentales, '+str(report['outOfScope'])+' hors périmètre, '+str(len(retired))+' page(s) du sitemap retirée(s) (404 ou redirection), '+str(unresolved)+' non exploitable(s)'+(' ; '+str(located)+' coordonnée(s) issue(s) de la Base Adresse Nationale' if located else ''))
 return report,rows

# ---------------------------------------------------------------- Sirene (INSEE)

# Règles de reconnaissance de l'enseigne dans le répertoire Sirene. Les codes NAF
# visés sont ceux du commerce de détail ; l'enseigne doit apparaître dans la raison
# sociale, l'enseigne ou le nom commercial de l'établissement. anyOperator : deux
# grandes surfaces de l'enseigne ne coexistent pas à moins d'un kilomètre dans une même
# commune postale, donc deux déclarations y sont un même magasin quel que soit
# l'exploitant (reprise, location-gérance) ; faux pour Fnac (boutiques de gare,
# d'aéroport ou de centre commercial voisines d'un magasin).
SIRENE_RULES={
 'Fnac':dict(q='fnac',params={'section_activite_principale':'G'},brand=r'\bFNAC\b',naf=r'^47\.',exclude=r'\bFNAC\s*(LOGISTIQUE|ACCES|DIRECT|TOURISME|JEUNES)\b|ANCIENS COMBATTANTS',anyOperator=False),
 'Carrefour':dict(q='carrefour',params={'activite_principale':'47.11F'},brand=r'\bCARREFOUR\b',naf=r'^47\.11F$',exclude=r'\bCARREFOUR\s+(MARKET|CITY|EXPRESS|CONTACT|PROXI|MONTAGNE|BIO|DRIVE|BON\s*APP)\b',anyOperator=True),
 'Boulanger':dict(q='boulanger',params={'activite_principale':'47.54Z'},brand=r'^BOULANGER(\s+[A-Z0-9\'\- ]+)?$|\(BOULANGER\)$',naf=r'^47\.(54Z|43Z|42Z|41Z)$',exclude=r'LOCATION|B LOC',anyOperator=True),
 'Conforama':dict(q='conforama',params={'section_activite_principale':'G'},brand=r'\bCONFORAMA\b',naf=r'^47\.',exclude=r'',anyOperator=True),
}
SIRENE_MAX_PAGES=6
SMALL=('de','des','du','la','le','les','l','d','et','sur','sous','en','aux','au','lès','les')

def french_title(s):
 words=re.split(r'(\s+|-|\')',str(s or '').lower())
 out=[];first=True
 for w in words:
  if not w or re.fullmatch(r'\s+|-|\'',w):out.append(w);continue
  out.append(w if (w in SMALL and not first) else w[:1].upper()+w[1:]);first=False
 return ''.join(out)

def sirene_street(etab):
 full=clean(etab.get('adresse'));cp=str(etab.get('code_postal') or '')
 street=full.split(' '+cp+' ')[0] if cp and (' '+cp+' ') in full else full
 return french_title(street)

def sirene_store_name(brand,etab):
 commune=french_title(etab.get('libelle_commune') or '')
 cp=str(etab.get('code_postal') or '')
 m=re.match(r'^(PARIS|LYON|MARSEILLE)\b',str(etab.get('libelle_commune') or ''),re.I)
 if m and re.fullmatch(r'(75|69|13)\d{3}',cp):
  arr=int(cp[-2:]) if cp[:2]=='75' or cp[:2]=='69' else int(cp[-2:])
  if arr:commune=french_title(m.group(1))+' '+str(arr)+('er' if arr==1 else 'e')
 return brand+' '+commune

def sirene_fields(company,etab):
 return [str(x) for x in [company.get('nom_complet'),company.get('nom_raison_sociale'),etab.get('nom_commercial')]+list(etab.get('liste_enseignes') or []) if x]

def sirene_candidates(brand,get=None,departments=None):
 """Établissements actifs Sirene reconnus pour l'enseigne, département par département.
 Renvoie (candidats, écartés par motif, erreurs, nombre de requêtes)."""
 get=get or http_get;rule=SIRENE_RULES[brand];brand_rx=re.compile(rule['brand'],re.I);naf_rx=re.compile(rule['naf'])
 exclude_rx=re.compile(rule['exclude'],re.I) if rule['exclude'] else None
 seen={};rejected={};errors=[];queries=0
 def reject(reason,etab,evidence):
  bucket=rejected.setdefault(reason,{})
  bucket.setdefault(etab.get('siret'),'|'.join([str(etab.get('siret')),str(etab.get('activite_principale')),evidence[:80],str(etab.get('code_postal')),str(etab.get('libelle_commune'))]))
 def one_dept(dept):
  found=[];errs=[];count=0;page=1
  while True:
   params=dict(q=rule['q'],departement=dept,per_page=25,page=page,limite_matching_etablissements=100,**rule['params'])
   url=SIRENE_API+'?'+urllib.parse.urlencode(params)
   try:data=json.loads(get(url,accept='application/json',delay=0.2)[0]);count+=1
   except (HttpError,ValueError) as e:errs.append(str(e)[:200]);break
   for company in data.get('results') or []:
    for etab in company.get('matching_etablissements') or []:
     found.append((company,etab))
   if page>=int(data.get('total_pages') or 1):break
   if page>=SIRENE_MAX_PAGES:
    errs.append('Requête Sirene trop large pour le département '+dept+' : '+str(data.get('total_pages'))+' pages, lecture arrêtée à '+str(page));break
   page+=1
  return dept,found,errs,count
 results=[one_dept(d) for d in (departments or sorted(DEPT_REGION))]
 for dept,found,errs,count in results:
  errors.extend(errs);queries+=count
  for company,etab in found:
   fields=sirene_fields(company,etab);evidence=' | '.join(fields)
   if str(etab.get('code_postal') or '')[:2]!=dept:continue
   if etab.get('etat_administratif')!='A':continue
   if not any(brand_rx.search(f) for f in fields):reject('enseigne non reconnue',etab,evidence);continue
   if exclude_rx and exclude_rx.search(evidence):reject('autre format ou activité de l’enseigne',etab,evidence);continue
   if not naf_rx.search(str(etab.get('activite_principale') or '')):reject('activité hors commerce de détail visé ('+str(etab.get('activite_principale'))+')',etab,evidence);continue
   seen[etab['siret']]=dict(company=company,etab=etab,evidence=evidence)
 return list(seen.values()),{k:sorted(v.values()) for k,v in rejected.items()},errors,queries

def sirene_store(brand,cand,fetched_at):
 etab=cand['etab'];postal=str(etab.get('code_postal') or '')
 lat=to_float(etab.get('latitude'));lon=to_float(etab.get('longitude'))
 if not is_continental_postal(postal):return None,'hors périmètre'
 if not valid_coords(lat,lon):return None,'coordonnées absentes ou hors France'
 street=sirene_street(etab);city=french_title(etab.get('libelle_commune'))
 if not street or not city:return None,'adresse incomplète'
 row=make_store(brand,sirene_store_name(brand,etab),street,city,postal,lat,lon,SIRENE_PAGE+etab['siret'],store_id='sirene-'+brand.lower()+'-'+etab['siret'],fetched_at=fetched_at,source='Répertoire Sirene (INSEE)')
 return row,''

EFFECTIF_ORDER={'NN':-1,'00':0,'01':1,'02':2,'03':3,'11':4,'12':5,'21':6,'22':7,'31':8,'32':9,'41':10,'42':11,'51':12,'52':13,'53':14}

def collect_sirene(brand,get=None,fetched_at=None,departments=None):
 fetched_at=fetched_at or now_iso()
 report=_report('Répertoire Sirene (INSEE) via l’API Recherche d’entreprises : établissements actifs déclarés sous l’enseigne',sourceUrl=SIRENE_API)
 cands,rejected,errors,queries=sirene_candidates(brand,get,departments)
 report['errors']=errors[:6];report['queries']=queries;report['candidates']=len(cands)
 report['sireneRejected']={k:len(v) for k,v in rejected.items()};report['sireneRejectedSample']={k:v[:40] for k,v in rejected.items()}
 # Établissement le plus étoffé d'abord (le magasin plutôt qu'une annexe), puis le plus récent
 # (nouvel exploitant d'un hypermarché passé en location-gérance) ; tris stables successifs.
 ordered=sorted(cands,key=lambda c:c['etab']['siret'])
 ordered.sort(key=lambda c:str(c['etab'].get('date_creation') or ''),reverse=True)
 ordered.sort(key=lambda c:EFFECTIF_ORDER.get(str(c['etab'].get('tranche_effectif_salarie') or 'NN'),-1),reverse=True)
 rows=[];kept=[];merged=[]
 for cand in ordered:
  row,reason=sirene_store(brand,cand,fetched_at)
  if not row:
   if reason=='hors périmètre':report['outOfScope']+=1
   else:_reject(report,reason,cand['etab']['siret'])
   continue
  # Un même point de vente déclaré deux fois : même code postal, moins d'un kilomètre, et même
  # entreprise (annexe, ancien local) — ou tout exploitant pour une grande surface (anyOperator).
  twin=next((k for k,c in kept if k['codePostal']==row['codePostal'] and haversine((k['lat'],k['lon']),(row['lat'],row['lon']))<1000 and (SIRENE_RULES[brand].get('anyOperator') or c['company'].get('siren')==cand['company'].get('siren'))),None)
  if twin:merged.append(row['id']+' → '+twin['id']);continue
  kept.append((row,cand));rows.append(row)
 rows.sort(key=lambda r:r['id'])
 report['merged']=len(merged);report['mergedSample']=merged[:20]
 report['parsed']=len(rows);report['complete']=False
 report['proof']='Aucune preuve d’exhaustivité : le répertoire Sirene ne recense que les établissements déclarés sous l’enseigne ('+str(len(rows))+' retenus sur '+str(len(cands))+' candidats, '+str(len(merged))+' doublon(s) de déclaration fusionné(s)).'
 return report,rows

def merge_close(rows,meters):
 """Un même point de vente déclaré deux fois (mêmes coordonnées) ne compte qu'une fois."""
 out=[]
 for r in rows:
  if any(o['enseigne']==r['enseigne'] and haversine((o['lat'],o['lon']),(r['lat'],r['lon']))<meters and o['codePostal']==r['codePostal'] for o in out):continue
  out.append(r)
 return out

def matches_existing(row,existing,meters=600):
 """Vrai si une fiche d'annuaire de la même enseigne décrit déjà ce point de vente."""
 for o in existing:
  if o['enseigne']!=row['enseigne']:continue
  d=haversine((o['lat'],o['lon']),(row['lat'],row['lon']))
  if d<meters or (o['codePostal']==row['codePostal'] and d<2000):return True
 return False

# ---------------------------------------------------------------- Boulanger et Conforama (annuaires bloqués en CI)

class ConforamaLinks(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.links=[];self.feed(text)
 def handle_starttag(self,tag,attrs):
  if tag!='a':return
  href=dict(attrs).get('href')
  if href and re.search(r'/magasins-conforama/[^/]+/[^"\']+-\d+$',href):
   self.links.append(href)

def conforama_links(text,base='https://www.conforama.fr/magasins-conforama'):
 return list(dict.fromkeys(urljoin(base,h) for h in ConforamaLinks(text).links))

def region_from_conforama_url(url):
 parts=[p for p in urlparse(url).path.split('/') if p]
 try:region_slug=parts[parts.index('magasins-conforama')+1]
 except (ValueError,IndexError):return ''
 for code,(_,known) in REGIONS.items():
  if region_slug==known:return code
 return ''

def parse_conforama_store(text,url,fetched_at=None):
 """Fiche Conforama : JSON-LD (FurnitureStore) ; motif de rejet explicite sinon."""
 blocks=jsonld_blocks(text)
 for raw in re.findall(r'<script[^>]*id=["\']structured-data-organization["\'][^>]*>(.*?)</script>',text or '',re.S|re.I):
  try:blocks.append(json.loads(raw,strict=False))
  except ValueError:pass
 for block in blocks:
  for place in iter_places(block):
   f=place_fields(place)
   if not f['name']:continue
   reason=check_fields(f,'Conforama')
   if reason:return None,reason
   return make_store('Conforama',f['name'],f['address'],f['city'],f['postal'],f['lat'],f['lon'],url,fetched_at=fetched_at),''
 return None,'fiche magasin sans données structurées'

def collect_boulanger():
 try:
  source_html=fetch(BOULANGER_SOURCE)
  bff_path=re.search(r'"clientBffHostname"\s*:\s*"([^"]+)"',source_html).group(1)
  api_key=re.search(r'"clientBffApiKey"\s*:\s*"([^"]+)"',source_html).group(1)
 except Exception as e:
  return {'status':'unavailable','count':0,'sourceUrl':BOULANGER_SOURCE,'checkedAt':now_iso(),'errors':['Configuration BFF introuvable : '+str(e)]},[]
 graphql_url=urljoin(BOULANGER_SOURCE,bff_path.rstrip('/')+'/graphql')
 query='''query ($filter: FetchSitesFilter!, $filters: String) {
  sites(filter: $filter, filters: $filters) {
    results { label siteId address { streetAddress postalCode addressLocality addressRegion addressDepartment location { lat lon } } }
  }
}'''
 payload=json.dumps({'query':query,'variables':{'filter':{'active':True,'type':'M'},'filters':'address,label,siteId'}}).encode()
 req=urllib.request.Request(graphql_url,data=payload,headers={'User-Agent':UA,'Content-Type':'application/json','x-api-key':api_key})
 try:
  data=json.loads(urllib.request.urlopen(req,timeout=30).read().decode('utf-8'))
 except Exception as e:
  return {'status':'unavailable','count':0,'sourceUrl':BOULANGER_SOURCE,'checkedAt':now_iso(),'errors':[str(e)]},[]
 if data.get('errors'):
  return {'status':'unavailable','count':0,'sourceUrl':BOULANGER_SOURCE,'checkedAt':now_iso(),'errors':[e.get('message','Erreur GraphQL') for e in data['errors'][:4]]},[]
 results=((data.get('data') or {}).get('sites') or {}).get('results') or []
 rows=[];errors=[]
 for item in results:
  a=item.get('address') or {};loc=a.get('location') or {}
  try:lat=float(loc.get('lat'));lon=float(loc.get('lon'))
  except (TypeError,ValueError):errors.append('Coordonnées invalides : '+str(item.get('siteId') or item.get('label')));continue
  postal=str(a.get('postalCode') or '').strip();address=html.unescape(str(a.get('streetAddress') or '')).strip();city=html.unescape(str(a.get('addressLocality') or '')).strip()
  if not is_continental_postal(postal):continue
  if not postal or not address or not city or not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:
   errors.append('Fiche incomplète : '+str(item.get('siteId') or item.get('label')));continue
  rows.append(make_store('Boulanger',html.unescape(str(item.get('label') or 'Boulanger')).strip(),address,city,postal,lat,lon,BOULANGER_SOURCE,site_id=item.get('siteId')))
 # La requête `sites` n'expose aucune pagination : un résultat rond signale une troncature.
 if len(results)>=100 and len(results)%50==0:errors.insert(0,'Résultat probablement tronqué à '+str(len(results))+' sites (requête sans pagination)')
 return {'status':'partial','count':len(rows),'sourceUrl':BOULANGER_SOURCE,'checkedAt':now_iso(),'errors':errors[:4]},rows

def collect_conforama(fetched_at=None):
 root=CONFORAMA_ROOT
 try:links=conforama_links(fetch(root),root)
 except Exception as e:return {'status':'unavailable','count':0,'sourceUrl':root,'checkedAt':now_iso(),'errors':[str(e)]},[]
 report=_report('Fiches magasin conforama.fr (JSON-LD)',sourceUrl=root,listed=len(links))
 rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for url,result in zip(links,pool.map(fetch_result,links)):
   if isinstance(result,Exception):_reject(report,'page inaccessible',url);continue
   row,reason=parse_conforama_store(result,url,fetched_at)
   if row:rows.append(row)
   elif reason=='hors périmètre':report['outOfScope']+=1
   else:_reject(report,reason,url)
 report.update(status='partial',count=len(rows))
 return report,rows

def collect_brand(brand):
 if brand=='Boulanger':return collect_boulanger()
 if brand=='Conforama':return collect_conforama()
 return {'status':'unsupported','count':0,'sourceUrl':'','checkedAt':now_iso(),'errors':['Collecteur de marque non disponible']},[]
