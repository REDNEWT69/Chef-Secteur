#!/usr/bin/env python3
import json,re,time,unicodedata
from urllib.parse import urljoin,urlparse
import requests
from bs4 import BeautifulSoup

SOURCES={
 'Boulanger':('https://www.boulanger.com/info/magasins/france',r'/info/magasins/'),
 'Darty':('https://magasin.darty.com/fr',r'/fr/'),
 'Fnac':('https://www.fnac.com/localiser-magasin-fnac/w-4',r'(magasin|localiser-magasin-fnac)'),
 'Conforama':('https://www.conforama.fr/magasins-conforama',r'magasins-conforama'),
 'Carrefour':('https://www.carrefour.fr/magasin',r'/magasin/'),
 'Cuisinella':('https://www.ma.cuisinella/fr-fr/liste-magasins',r'/fr-fr/(liste-magasins|magasins/)')
}
REGION={
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
UA={'User-Agent':'Chef-Secteur-SAMSUNG/1.0 (+https://github.com/REDNEWT69/Chef-Secteur)'}

def norm(s):
 s=unicodedata.normalize('NFD',str(s or ''));return ''.join(c for c in s if unicodedata.category(c)!='Mn').lower().strip()

def flatten(x):
 if isinstance(x,list):
  for i in x: yield from flatten(i)
 elif isinstance(x,dict):
  yield x
  for v in x.values():
   if isinstance(v,(dict,list)): yield from flatten(v)

def address_obj(a):
 if isinstance(a,str): return a,'','',''
 if not isinstance(a,dict): return '','','',''
 street=' '.join(str(a.get(k,'')).strip() for k in ('streetAddress',) if a.get(k)).strip()
 city=str(a.get('addressLocality') or '').strip();pc=str(a.get('postalCode') or '').strip();country=str(a.get('addressCountry') or '').strip()
 return street,city,pc,country

def store_from_obj(brand,o,url):
 typ=o.get('@type'); types=[typ] if isinstance(typ,str) else (typ or [])
 good={'Store','LocalBusiness','ElectronicsStore','HomeGoodsStore','DepartmentStore','FurnitureStore','ShoppingCenter'}
 if not any(t in good for t in types): return None
 name=str(o.get('name') or '').strip();
 if brand.lower() not in norm(name) and brand not in ('Carrefour','Fnac'): return None
 street,city,pc,_=address_obj(o.get('address'))
 if len(pc)<5 or not city or not street:return None
 dept=pc[:2]; geo=o.get('geo') if isinstance(o.get('geo'),dict) else {}
 try: lat=float(geo.get('latitude')) if geo.get('latitude') is not None else None
 except: lat=None
 try: lon=float(geo.get('longitude')) if geo.get('longitude') is not None else None
 except: lon=None
 return {'id':'official-'+re.sub(r'[^a-z0-9]+','-',norm(brand+'-'+pc+'-'+name)).strip('-'),'enseigne':brand,'sourceName':name or brand,'ville':city,'adresse':street,'codePostal':pc,'dept':dept,'regionCode':REGION.get(dept,''),'lat':lat,'lon':lon,'source':'Annuaire officiel '+brand,'sourceUrl':url,'sourceFetchedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'freq':'Mensuel','intervalDays':30,'priority':3,'active':True,'products':['À confirmer']}

def parse_page(brand,url,html):
 soup=BeautifulSoup(html,'html.parser'); rows=[]
 for tag in soup.find_all('script',attrs={'type':'application/ld+json'}):
  try:data=json.loads(tag.string or tag.get_text() or '{}')
  except:continue
  for o in flatten(data):
   s=store_from_obj(brand,o,url)
   if s:rows.append(s)
 return rows,soup

def crawl_brand(brand,seed,pat):
 host=urlparse(seed).netloc; q=[seed]; seen=set(); rows=[]; max_pages=260
 while q and len(seen)<max_pages:
  url=q.pop(0)
  if url in seen:continue
  seen.add(url)
  try:r=requests.get(url,headers=UA,timeout=20); r.raise_for_status()
  except Exception as e:
   print(brand,'skip',url,e);continue
  found,soup=parse_page(brand,url,r.text); rows.extend(found)
  if len(seen)<80 or not rows:
   for a in soup.find_all('a',href=True):
    u=urljoin(url,a['href']).split('#')[0]
    if urlparse(u).netloc!=host or not re.search(pat,urlparse(u).path,re.I):continue
    if u not in seen and u not in q:q.append(u)
  time.sleep(.08)
 return rows

def dedupe(rows):
 out=[]; seen=set()
 for s in rows:
  k=(norm(s['enseigne']),s.get('codePostal',''),norm(s.get('adresse','')),norm(s.get('ville','')))
  if k in seen:continue
  seen.add(k);out.append(s)
 return sorted(out,key=lambda x:(x['enseigne'],x.get('regionCode',''),x.get('dept',''),x.get('ville','')))

def main():
 previous={}
 try:
  previous=json.load(open('data/official-stores.json',encoding='utf-8'))
 except:pass
 all_rows=[]; stats={}
 for brand,(seed,pat) in SOURCES.items():
  rows=dedupe(crawl_brand(brand,seed,pat))
  if not rows:
   old=[x for x in previous.get('stores',[]) if x.get('enseigne')==brand]
   rows=old; status='previous snapshot retained' if old else 'no high-confidence store parsed'
  else: status='ok'
  stats[brand]={'url':seed,'count':len(rows),'status':status}; all_rows.extend(rows)
 out={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sources':stats,'stores':dedupe(all_rows)}
 with open('data/official-stores.json','w',encoding='utf-8') as f:json.dump(out,f,ensure_ascii=False,indent=2)
 print('stores',len(out['stores']),stats)
if __name__=='__main__':main()
