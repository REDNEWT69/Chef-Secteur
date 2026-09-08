"""Collect factual store fields from public official directory pages, never user data."""
import concurrent.futures, datetime, hashlib, html, json, math, re, subprocess, sys, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
REGIONS={'84':('Auvergne-Rhône-Alpes','auvergne-rhone-alpes'),'27':('Bourgogne-Franche-Comté','bourgogne-franche-comte'),'53':('Bretagne','bretagne'),'24':('Centre-Val de Loire','centre-val-de-loire'),'94':('Corse','corse'),'44':('Grand Est','grand-est'),'32':('Hauts-de-France','hauts-de-france'),'28':('Normandie','normandie'),'75':('Nouvelle-Aquitaine','nouvelle-aquitaine'),'76':('Occitanie','occitanie'),'52':('Pays de la Loire','pays-de-la-loire'),'93':("Provence-Alpes-Côte d'Azur",'provence-alpes-cote-d-azur'),'11':('Île-de-France','ile-de-france')}
ROOTS={'Boulanger':'https://www.boulanger.com/magasins/','Darty':'https://magasin.darty.com/fr/'}
class Page(HTMLParser):
 def __init__(self,text):
  super().__init__(convert_charrefs=True);self.links=[];self.scripts=[];self.script=None;self.feed(text)
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='script' and (a.get('type')=='application/ld+json' or a.get('id')=='js-map-config-dir-map'):self.script=''
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
   if urlparse(source).hostname!=urlparse(url).hostname or not address or not city or not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:continue
   dept=postal[:3] if postal.startswith('97') else ('2A' if postal.startswith(('200','201')) else '2B') if postal.startswith('20') else postal[:2]
   rows.append(dict(id='official-'+brand.lower()+'-'+hashlib.sha256(source.encode()).hexdigest()[:16],enseigne=brand,sourceName=name,adresse=address,ville=city,codePostal=postal,dept=dept,lat=lat,lon=lon,region=REGIONS[code][0],regionCode=code,source='Annuaire officiel '+brand,sourceUrl=source,sourceFetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),freq='Mensuel',intervalDays=30,priority=3,active=True,products=['À confirmer']))
 return rows,([] if brand=='Boulanger' and rows else [urljoin(url,h) for h in page.links])

def fetch(url):
 # Standard public HTTPS request. Refuse redirects to another origin.
 p=subprocess.run(['curl','--location','--max-redirs','3','--proto-redir','=https','--fail','--silent','--show-error','--max-time','25','--write-out','\nFINAL_URL:%{url_effective}',url],capture_output=True)
 if p.returncode:raise RuntimeError('Source inaccessible : '+url)
 text,final=p.stdout.decode('utf-8').rsplit('\nFINAL_URL:',1)
 if urlparse(final).hostname!=urlparse(url).hostname:raise RuntimeError('Redirection hors annuaire : '+url)
 if len(text)<500 or '<html' not in text.lower():raise RuntimeError('Page invalide : '+url)
 return text

def collect(brand,code):
 root=ROOTS[brand]+REGIONS[code][1];pending=[root];seen=set();stores={};errors=[]
 if brand=='Darty' and code=='94':return {'status':'unsupported','count':0,'sourceUrl':ROOTS[brand]},[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  while pending:
   batch=[u for u in pending if u not in seen];pending=[]
   if len(seen)+len(batch)>140:raise RuntimeError('Limite de pages atteinte')
   seen.update(batch)
   for url,result in zip(batch,pool.map(fetch_result,batch)):
    if isinstance(result,Exception):errors.append(str(result));continue
    rows,links=parse(result,url,brand,code)
    if not rows and not links:errors.append('Aucune fiche exploitable : '+url)
    for row in rows:stores[row['id']]=row
    for link in links:
     if urlparse(link).hostname==urlparse(root).hostname and (link.startswith(root+'/') or link.startswith(root+'?')) and link not in seen:pending.append(link)
   pending=list(dict.fromkeys(pending))
   if pending:time.sleep(.25)
 status='partial' if errors and stores else 'unavailable' if not stores else 'collected'
 return {'status':status,'count':len(stores),'sourceUrl':root,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'errors':errors[:4]},list(stores.values())

def fetch_result(url):
 try:return fetch(url)
 except Exception as e:return e

