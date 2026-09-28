"""Collect factual store fields from public official directory pages, never user data."""
import concurrent.futures, datetime, hashlib, html, json, math, re, subprocess, sys, time, urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
REGIONS={'84':('Auvergne-Rhône-Alpes','auvergne-rhone-alpes'),'27':('Bourgogne-Franche-Comté','bourgogne-franche-comte'),'53':('Bretagne','bretagne'),'24':('Centre-Val de Loire','centre-val-de-loire'),'94':('Corse','corse'),'44':('Grand Est','grand-est'),'32':('Hauts-de-France','hauts-de-france'),'28':('Normandie','normandie'),'75':('Nouvelle-Aquitaine','nouvelle-aquitaine'),'76':('Occitanie','occitanie'),'52':('Pays de la Loire','pays-de-la-loire'),'93':("Provence-Alpes-Côte d'Azur",'provence-alpes-cote-d-azur'),'11':('Île-de-France','ile-de-france')}
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
 '04':'93','05':'93','06':'93','13':'93','83':'93','84':'93','2A':'94','2B':'94'
}
UA='Chef-Secteur-SAMSUNG/1.0 (+https://github.com/REDNEWT69/Chef-Secteur)'
BOULANGER_SOURCE='https://www.boulanger.com/info/magasins/searchmag'

def dept_from_postal(postal):
 postal=str(postal or '').strip()
 if postal.startswith('97'):return postal[:3]
 if postal.startswith(('200','201')):return '2A'
 if postal.startswith('20'):return '2B'
 return postal[:2]

def region_code_from_postal(postal):
 return DEPT_REGION.get(dept_from_postal(postal),'')

def now_iso():
 return datetime.datetime.now(datetime.timezone.utc).isoformat()

def stable_id(brand,source):
 return 'official-'+brand.lower()+'-'+hashlib.sha256(source.encode()).hexdigest()[:16]

def make_store(brand,name,address,city,postal,lat,lon,source_url,region_code=None,site_id=None):
 dept=dept_from_postal(postal)
 code=region_code or DEPT_REGION.get(dept,'')
 return dict(
  id=('official-'+brand.lower()+'-'+str(site_id).lower()) if site_id else stable_id(brand,source_url),
  enseigne=brand,sourceName=name,adresse=address,ville=city,codePostal=postal,dept=dept,
  lat=lat,lon=lon,region=REGIONS.get(code,('',))[0],regionCode=code,
  source='Annuaire officiel '+brand,sourceUrl=source_url,sourceFetchedAt=now_iso(),
  freq='Mensuel',intervalDays=30,priority=3,active=True,products=['À confirmer'])

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
   rows.append(make_store(brand,name,address,city,postal,lat,lon,source,code))
 return rows,([] if brand=='Boulanger' and rows else [urljoin(url,h) for h in page.links])

def fetch(url):
 # Standard public HTTPS request. Refuse redirects to another origin.
 p=subprocess.run(['curl','--location','--max-redirs','3','--proto-redir','=https','--fail','--silent','--show-error','--max-time','25','--user-agent',UA,'--header','Accept-Language: fr-FR,fr;q=0.9','--write-out','\nFINAL_URL:%{url_effective}',url],capture_output=True)
 if p.returncode:raise RuntimeError('Source inaccessible : '+url)
 text,final=p.stdout.decode('utf-8').rsplit('\nFINAL_URL:',1)
 if urlparse(final).hostname!=urlparse(url).hostname:raise RuntimeError('Redirection hors annuaire : '+url)
 if len(text)<500 or '<html' not in text.lower():raise RuntimeError('Page invalide : '+url)
 return text

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
 try:slug=parts[parts.index('magasins-conforama')+1]
 except (ValueError,IndexError):return ''
 for code,(_,region_slug) in REGIONS.items():
  if slug==region_slug:return code
 return ''

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
 rows=[];errors=[]
 for item in ((data.get('data') or {}).get('sites') or {}).get('results') or []:
  a=item.get('address') or {};loc=a.get('location') or {}
  try:lat=float(loc.get('lat'));lon=float(loc.get('lon'))
  except (TypeError,ValueError):errors.append('Coordonnées invalides : '+str(item.get('siteId') or item.get('label')));continue
  postal=str(a.get('postalCode') or '').strip();address=html.unescape(str(a.get('streetAddress') or '')).strip();city=html.unescape(str(a.get('addressLocality') or '')).strip()
  if not postal or not address or not city or not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180:
   errors.append('Fiche incomplète : '+str(item.get('siteId') or item.get('label')));continue
  rows.append(make_store('Boulanger',html.unescape(str(item.get('label') or 'Boulanger')).strip(),address,city,postal,lat,lon,BOULANGER_SOURCE,site_id=item.get('siteId')))
 status='partial' if errors else 'partial'
 return {'status':status,'count':len(rows),'sourceUrl':BOULANGER_SOURCE,'checkedAt':now_iso(),'errors':errors[:4]},rows

def collect_conforama():
 root='https://www.conforama.fr/magasins-conforama'
 try:links=conforama_links(fetch(root),root)
 except Exception as e:return {'status':'unavailable','count':0,'sourceUrl':root,'checkedAt':now_iso(),'errors':[str(e)]},[]
 rows=[];errors=[];regional={}
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  for url,result in zip(links,pool.map(fetch_result,links)):
   code=region_from_conforama_url(url)
   regional.setdefault(code,{'status':'partial','count':0,'sourceUrl':root,'checkedAt':now_iso(),'errors':[]})
   if isinstance(result,Exception):
    msg=str(result);errors.append(msg);regional[code]['errors'].append(msg);continue
   found,_=parse(result,url,'Conforama',code or '84')
   if not found:
    msg='Aucune fiche exploitable : '+url;errors.append(msg);regional[code]['errors'].append(msg);continue
   rows.extend(found);regional[code]['count']+=len(found)
 for value in regional.values():value['errors']=value['errors'][:4]
 return {'status':'partial','count':len(rows),'sourceUrl':root,'checkedAt':now_iso(),'errors':errors[:4],'regions':regional},rows

def collect_brand(brand):
 if brand=='Boulanger':return collect_boulanger()
 if brand=='Conforama':return collect_conforama()
 return {'status':'unsupported','count':0,'sourceUrl':'','checkedAt':now_iso(),'errors':['Collecteur de marque non disponible']},[]

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
