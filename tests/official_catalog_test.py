import json,math,os,re,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import official_directory_parsers as c
import catalog_coverage_report as report
import update_official_stores as updater
FIX=Path(__file__).parent/'fixtures'
ROOT=Path(__file__).resolve().parents[1]
# Le workflow des annuaires vérifie les parseurs avant la collecte, puis le candidat après.
SKIP_DATA=os.environ.get('OFFICIAL_CATALOG_SKIP_DATA')=='1'

# Extraits fidèles aux pages réelles relevées le 28/09/2026 (run Actions 36454543570).
def darty_place(num,slug,name,street,city,postal,lat,lon):
 return {'@context':'http://schema.org','@type':'LocalBusiness','name':name,'address':{'@type':'PostalAddress','streetAddress':street,'addressLocality':city,'postalCode':postal,'addressCountry':'FR'},'geo':{'@type':'GeoCoordinates','latitude':str(lat),'longitude':str(lon)},'url':'/'+str(num)+'-'+slug}
def ld(*objs):
 return ''.join('<script type="application/ld+json">'+json.dumps(o,ensure_ascii=False)+'</script>' for o in objs)
BREADCRUMB={'@context':'http://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'item':{'@id':'/','name':'Accueil'}}]}
D161=darty_place(161,'darty-sarreguemines','DARTY Sarreguemines','2, rue du Maréchal Kellermann','Sarreguemines','57200',49.1138006,7.0918206)
D613=darty_place(613,'darty-cuisine-rouen-centre','DARTY Cuisine Rouen centre','63 rue Ganterie','ROUEN','76000',49.4436544,1.0930374)
D614=darty_place(614,'darty-rouen-centre','DARTY Rouen centre','63 rue Ganterie','ROUEN','76000',49.4436544,1.0930374)
D700=darty_place(700,'darty-ajaccio','DARTY Ajaccio','Route de Mezzavia','Ajaccio','20090',41.94,8.75)
D17=darty_place(17,'darty-augny-metz','DARTY Augny Metz','ZAC Belle Fontaine','Augny','57685',49.07,6.12)
def darty_site(plan_extra=(),missing_page=True):
 pages={
  'https://magasin.darty.com/fr':'<html><head><link href="https://magasin.darty.com/fr?page=2" rel="next"></head>'+ld(BREADCRUMB,D613,D614,D700)+'</html>',
  'https://magasin.darty.com/fr?page=2':'<html>'+ld(BREADCRUMB,D161)+'</html>',
  'https://magasin.darty.com/plan-du-site':'<html>'+''.join('<a href="'+p+'">x</a>' for p in ['/fr','/fr/grand-est','/electromenager-high-tech/fr/metz','/613-darty-cuisine-rouen-centre','/614-darty-rouen-centre','/700-darty-ajaccio','/161-darty-sarreguemines','/17-darty-augny-metz']+list(plan_extra))+'</html>',
  'https://magasin.darty.com/sitemap.xml':'<sitemapindex><sitemap><loc>https://magasin.darty.com/mainsitemap.xml</loc></sitemap><sitemap><loc>https://magasin.darty.com/locationsitemap1.xml</loc></sitemap></sitemapindex>',
  'https://magasin.darty.com/mainsitemap.xml':'<urlset><url><loc>https://magasin.darty.com/fr</loc></url></urlset>',
  'https://magasin.darty.com/locationsitemap1.xml':'<urlset>'+''.join('<url><loc>https://magasin.darty.com'+p+'</loc></url>' for p in ['/613-darty-cuisine-rouen-centre','/614-darty-rouen-centre','/700-darty-ajaccio','/161-darty-sarreguemines','/17-darty-augny-metz']+list(plan_extra))+'</urlset>',
 }
 if missing_page:pages['https://magasin.darty.com/17-darty-augny-metz']='<html>'+ld(BREADCRUMB,D17)+'</html>'
 return pages
CUIS_STORE='''<html><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"FurnitureStore","@id":"https://www.ma.cuisinella/fr-fr/magasins/ain/amberieu-en-bugey","name":"Cuisinella Ambérieu-en-Bugey","url":"https://www.ma.cuisinella/fr-fr/magasins/ain/amberieu-en-bugey","address":{"@type":"PostalAddress","streetAddress":"370 Avenue Léon Blum","addressLocality":"Ambérieu-en-Bugey","postalCode":"01500","addressCountry":"FR"},"geo":{"@type":"GeoCoordinates","latitude":45.9578,"longitude":5.35883}},{"@type":"BreadcrumbList","itemListElement":[]}]}</script></html>'''
def cuis_store(url,name,street,city,postal,lat,lon):
 return '<html><script type="application/ld+json">'+json.dumps({'@context':'https://schema.org','@graph':[{'@type':'FurnitureStore','@id':url,'name':name,'url':url,'address':{'@type':'PostalAddress','streetAddress':street,'addressLocality':city,'postalCode':postal,'addressCountry':'FR'},'geo':{'@type':'GeoCoordinates','latitude':lat,'longitude':lon}}]},ensure_ascii=False)+'</script></html>'
def cuis_map_entry(url_path,store_name,street,city,postal,lat,lon,brand='Cuisinella',store_id='0003000001'):
 return {'Brand':brand,'StoreName':store_name,'StreetLine1':street,'StreetLine2':None,'StreetLine3':None,'City':city,'PostalCode':postal,'Latitude':lat,'Longitude':lon,'StoreId':store_id,'Url':url_path}
def cuisinella_site(map_missing=('paris/paris-11-nation',)):
 base='https://www.ma.cuisinella/fr-fr/magasins/'
 entries=[cuis_map_entry('/fr-fr/magasins/ain/amberieu-en-bugey','Ambérieu-en-Bugey','370 Avenue Léon Blum','Ambérieu-en-Bugey','01500',45.9578,5.35883),
          cuis_map_entry('/fr-fr/magasins/paris/paris-11-nation','Paris 11 Nation','12 Boulevard Voltaire','Paris','75011',48.86,2.37),
          cuis_map_entry('/fr-fr/magasins/corse-du-sud/ajaccio','Ajaccio','Route','Ajaccio','20090',41.9,8.7)]
 entries=[e for e in entries if not any(e['Url'].endswith(m) for m in map_missing)]
 return {
  'https://www.ma.cuisinella/sitemap.xml':'<urlset>'+''.join('<url><loc>'+u+'</loc></url>' for u in ['https://www.ma.cuisinella/fr-fr','https://www.ma.cuisinella/fr-fr/magasins',base+'ain/amberieu-en-bugey',base+'paris/paris-11-nation',base+'corse-du-sud/ajaccio','https://www.ma.cuisinella/fr-be/magasins/liege/liege'])+'</urlset>',
  'https://www.ma.cuisinella/fr-fr/magasins':'<html><script type="application/javascript">\r\n    var STORES_MAP = '+json.dumps({'Stores':entries})+';\r\n</script></html>',
  base+'ain/amberieu-en-bugey':CUIS_STORE,
  base+'paris/paris-11-nation':cuis_store(base+'paris/paris-11-nation','Cuisinella Paris 11 Nation','12 Boulevard Voltaire','Paris','75011',48.86,2.37),
  base+'corse-du-sud/ajaccio':cuis_store(base+'corse-du-sud/ajaccio','Cuisinella Ajaccio','Route','Ajaccio','20090',41.9,8.7),
 }
def etab(siret,naf,postal,commune,adresse,lat,lon,enseignes=None,etat='A',nom=None,effectif='12',created='2008-01-01'):
 return {'siret':siret,'activite_principale':naf,'code_postal':postal,'libelle_commune':commune,'adresse':adresse,'latitude':str(lat),'longitude':str(lon),'liste_enseignes':enseignes,'nom_commercial':nom,'etat_administratif':etat,'tranche_effectif_salarie':effectif,'date_creation':created}
def sirene_response(results,total_pages=1):
 return json.dumps({'results':results,'total_results':len(results),'total_pages':total_pages})
CARREFOUR_77=sirene_response([
 {'siren':'451321335','nom_complet':'CARREFOUR HYPERMARCHES','nom_raison_sociale':'CARREFOUR HYPERMARCHES','matching_etablissements':[
  etab('45132133500924','47.11F','77420','CHAMPS-SUR-MARNE','AVENUE DES PYRAMIDES 77420 CHAMPS-SUR-MARNE',48.854303419,2.5818270958,['CARREFOUR']),
  etab('45132133500999','47.30Z','77420','CHAMPS-SUR-MARNE','AVENUE DES PYRAMIDES 77420 CHAMPS-SUR-MARNE',48.8544,2.5819,['CARREFOUR']),
  etab('45132133500111','47.11F','77090','COLLEGIEN','AV CHARLES DE GAULLE 77090 COLLEGIEN',48.8371280576464,2.66293565116621,['CARREFOUR'],etat='F'),
  etab('45132133500222','47.11F','91300','MASSY','1 RUE JEAN MERMOZ 91300 MASSY',48.72,2.28,['CARREFOUR'])]},
 {'siren':'805092608','nom_complet':'LA TOURVILLAISE','nom_raison_sociale':'LA TOURVILLAISE','matching_etablissements':[
  etab('80509260800011','47.11F','77130','MONTEREAU-FAULT-YONNE','RUE DE LA GRANDE HAIE 77130 MONTEREAU-FAULT-YONNE',48.39,2.95,['CARREFOUR'])]},
 {'siren':'999999999','nom_complet':'SUPER DISTRIB','nom_raison_sociale':'SUPER DISTRIB','matching_etablissements':[
  etab('99999999900011','47.11F','77100','MEAUX','RUE DU MARCHE 77100 MEAUX',48.96,2.88,['CARREFOUR MARKET'])]},
 # Même hypermarché repris en location-gérance : nouvel exploitant, plus étoffé, à 300 m de l'ancien.
 {'siren':'987654321','nom_complet':'PYRAMIDES DISTRIBUTION','nom_raison_sociale':'PYRAMIDES DISTRIBUTION','matching_etablissements':[
  etab('98765432100017','47.11F','77420','CHAMPS-SUR-MARNE','2 AVENUE DES PYRAMIDES 77420 CHAMPS-SUR-MARNE',48.8565,2.5845,['CARREFOUR'],effectif='22',created='2025-03-01')]},
])
class FakeWeb:
 def __init__(self,pages,blocked=()):self.pages=pages;self.blocked=set(blocked);self.calls=[]
 def __call__(self,url,**kw):
  self.calls.append(url)
  host=re.sub(r'^https://([^/]+).*$',r'\1',url)
  if host in self.blocked:raise c.HttpError(url,403,'cloudflare')
  if url.startswith(c.SIRENE_API):
   dept=re.search(r'departement=(\d+)',url).group(1)
   q=re.search(r'q=(\w+)',url).group(1)
   if q=='carrefour' and dept=='77':return CARREFOUR_77,url
   return sirene_response([]),url
  if url not in self.pages:raise c.HttpError(url,404,'')
  return self.pages[url],url

class CatalogTests(unittest.TestCase):
 def test_boulanger_real_fields_and_no_nearby(self):
  rows,links=c.parse((FIX/'boulanger-store.html').read_text(),'https://www.boulanger.com/magasins/auvergne-rhone-alpes/rhone/bron/centre-commercial-au-shopping-porte-des-alpes','Boulanger','84')
  self.assertEqual(len(rows),1);self.assertIn('6, Bd André Boulloche',rows[0]['adresse']);self.assertEqual(rows[0]['ville'],'BRON');self.assertEqual(rows[0]['lat'],45.7216246);self.assertEqual(links,[])
 def test_darty_real_fields_and_pagination(self):
  rows,links=c.parse((FIX/'darty-region.html').read_text(),'https://magasin.darty.com/fr/auvergne-rhone-alpes','Darty','84')
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['ville'],'Saint-Genis-Laval');self.assertEqual(links,['https://magasin.darty.com/fr/auvergne-rhone-alpes?page=2'])
 def test_empty_not_a_store(self):
  self.assertEqual(c.parse('<html>Erreur</html>','https://magasin.darty.com/','Darty','84')[0],[])
 def test_boulanger_graphql_row_shape(self):
  row=c.make_store('Boulanger','Boulanger Moulins - Yzeure','184 route de Lyon','Yzeure','03400',46.536996402744414,3.347227724011992,c.BOULANGER_SOURCE,site_id='F894')
  self.assertEqual(row['id'],'official-boulanger-f894')
  self.assertEqual(row['dept'],'03')
  self.assertEqual(row['regionCode'],'84')
  self.assertEqual(row['sourceUrl'],c.BOULANGER_SOURCE)
 def test_region_always_from_postal_code(self):
  # Une page régionale qui redirige (Grand Est → Meurthe-et-Moselle) ne décide plus de la région.
  row=c.make_store('Darty','DARTY Metz','x','Metz','57000',49.1,6.2,'https://magasin.darty.com/1-darty-metz',region_code='84')
  self.assertEqual(row['regionCode'],'44');self.assertEqual(row['region'],'Grand Est')
  for postal in ('20000','20200','97100','97400','97600','98000','2A000','7500'):self.assertFalse(c.is_continental_postal(postal),postal)
  self.assertEqual(len(c.REGIONS),12);self.assertEqual(len(c.DEPT_REGION),94)
  self.assertEqual(set(c.DEPT_REGION.values()),set(c.REGIONS))
 def test_conforama_list_links_and_detail_jsonld(self):
  listing='<a href="https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768">Saint-Priest</a>'
  self.assertEqual(c.conforama_links(listing),['https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768'])
  html='''<script id="structured-data-organization">{"@context":"https://schema.org","@type":["FurnitureStore","HomeGoodsStore"],"@id":"https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768","url":"https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768","name":"Conforama Saint-Priest","address":{"@type":"PostalAddress","postalCode":"69800","streetAddress":"211 Route de Grenoble","addressLocality":"Saint-Priest","addressCountry":"FR"},"geo":{"@type":"GeoCoordinates","latitude":45.71331,"longitude":4.96308}}</script>'''
  rows,_=c.parse(html,'https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768','Conforama','84')
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['codePostal'],'69800')
  self.assertEqual(rows[0]['regionCode'],'84')
  row,reason=c.parse_conforama_store(html,'https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768')
  self.assertEqual(reason,'');self.assertEqual(row['ville'],'Saint-Priest')
  # Fiche sans coordonnées : rejet explicite (motif conservé pour l'audit), jamais silencieux.
  nogeo=html.replace(',"geo":{"@type":"GeoCoordinates","latitude":45.71331,"longitude":4.96308}','')
  self.assertEqual(c.parse_conforama_store(nogeo,'u'),(None,'coordonnées absentes ou hors France'))
 def test_conforama_corse_is_not_fallback_to_auvergne_rhone_alpes(self):
  self.assertEqual(c.region_from_conforama_url('https://www.conforama.fr/magasins-conforama/corse/bastia-754'),'')
  html='''<script id="structured-data-organization">{"@context":"https://schema.org","@type":["FurnitureStore","HomeGoodsStore"],"@id":"https://www.conforama.fr/magasins-conforama/corse/bastia-754","url":"https://www.conforama.fr/magasins-conforama/corse/bastia-754","name":"Conforama Bastia","address":{"@type":"PostalAddress","postalCode":"20600","streetAddress":"Route de la Marana","addressLocality":"Bastia","addressCountry":"FR"},"geo":{"@type":"GeoCoordinates","latitude":42.666,"longitude":9.45}}</script>'''
  rows,_=c.parse(html,'https://www.conforama.fr/magasins-conforama/corse/bastia-754','Conforama','')
  self.assertEqual(rows,[])
  self.assertEqual(c.parse_conforama_store(html,'u'),(None,'hors périmètre'))
 def test_darty_listing_jsonld_next_and_scope(self):
  page=darty_site()['https://magasin.darty.com/fr']
  found,nxt=c.parse_darty_listing(page)
  self.assertEqual(nxt,'https://magasin.darty.com/fr?page=2')
  self.assertEqual(set(found),{'/613-darty-cuisine-rouen-centre','/614-darty-rouen-centre','/700-darty-ajaccio'})
  self.assertEqual(found['/700-darty-ajaccio'],(None,'hors périmètre'))
  row=found['/613-darty-cuisine-rouen-centre'][0]
  self.assertEqual(row['id'],c.stable_id('Darty','https://magasin.darty.com/613-darty-cuisine-rouen-centre'),'identifiant historique conservé')
  self.assertEqual((row['regionCode'],row['dept']),('28','76'))
  self.assertEqual(c.rel_next('<link rel="next" href="/fr?page=3">'),'/fr?page=3')
  self.assertEqual(c.darty_store_path('https://magasin.darty.com/fr/grand-est'),'')
  self.assertEqual(c.darty_store_path('/electromenager-high-tech/fr/metz'),'')
 def test_darty_collect_complete_with_proof_and_shared_address(self):
  web=FakeWeb(darty_site())
  rep,rows=c.collect_darty(get=web)
  self.assertTrue(rep['complete'],rep)
  self.assertEqual(rep['listingPages'],2);self.assertEqual(rep['planDuSite'],5);self.assertEqual(rep['sitemap'],5)
  self.assertEqual(rep['fetchedIndividually'],1,'la fiche absente de la liste est lue individuellement')
  self.assertEqual(rep['outOfScope'],1)
  self.assertEqual(sorted(r['sourceName'] for r in rows),['DARTY Augny Metz','DARTY Cuisine Rouen centre','DARTY Rouen centre','DARTY Sarreguemines'])
  # Même adresse, deux fiches officielles distinctes : aucune n'est supprimée.
  self.assertEqual(sum(1 for r in rows if r['adresse']=='63 rue Ganterie'),2)
 def test_darty_collect_incomplete_is_never_complete(self):
  web=FakeWeb(darty_site(plan_extra=['/999-darty-fantome']))
  rep,rows=c.collect_darty(get=web)
  self.assertFalse(rep['complete'])
  self.assertIn('page inaccessible (404)',rep['rejected'])
  self.assertEqual(len(rows),4)
  pages=darty_site();pages['https://magasin.darty.com/plan-du-site']='<html></html>'
  rep,_=c.collect_darty(get=FakeWeb(pages))
  self.assertFalse(rep['complete'],'plan du site ≠ sitemap : pas de preuve')
 def test_cuisinella_store_legacy_id_and_collect(self):
  row,reason=c.parse_cuisinella_store(CUIS_STORE,'https://www.ma.cuisinella/fr-fr/magasins/ain/amberieu-en-bugey')
  self.assertEqual(reason,'')
  self.assertEqual(row['id'],'official-cuisinella-01500-cuisinella-amberieu-en-bugey')
  self.assertEqual((row['lat'],row['lon'],row['regionCode']),(45.9578,5.35883,'84'))
  self.assertEqual(c.cuisinella_store_url('/fr-fr/liste-magasins/magasins-paris'),'')
  self.assertEqual(c.cuisinella_store_url('https://www.ma.cuisinella/fr-be/magasins/liege/liege'),'')
  rep,rows=c.collect_cuisinella(get=FakeWeb(cuisinella_site()))
  self.assertTrue(rep['complete'],rep)
  self.assertEqual((rep['sitemap'],rep['locator'],rep['fetchedIndividually'],rep['outOfScope']),(3,2,1,1))
  self.assertEqual(sorted(r['ville'] for r in rows),['Ambérieu-en-Bugey','Paris'])
  # Même identifiant historique, que la fiche vienne du localisateur ou de sa page.
  self.assertEqual({r['id'] for r in rows},{'official-cuisinella-01500-cuisinella-amberieu-en-bugey','official-cuisinella-75011-cuisinella-paris-11-nation'})
  # Page du sitemap absente du localisateur et en 404 : fiche retirée (magasin fermé), la preuve tient.
  pages=cuisinella_site(map_missing=('paris/paris-11-nation',));del pages['https://www.ma.cuisinella/fr-fr/magasins/paris/paris-11-nation']
  rep,rows=c.collect_cuisinella(get=FakeWeb(pages))
  self.assertTrue(rep['complete'],rep);self.assertEqual(rep['retired'],['https://www.ma.cuisinella/fr-fr/magasins/paris/paris-11-nation'])
  self.assertEqual(len(rows),1)
  # Page du sitemap inaccessible pour une autre raison : jamais « complet ».
  class Down(FakeWeb):
   def __call__(self,url,**kw):
    if url.endswith('paris-11-nation'):raise c.HttpError(url,503,'')
    return super().__call__(url,**kw)
  rep,_=c.collect_cuisinella(get=Down(cuisinella_site()))
  self.assertFalse(rep['complete']);self.assertEqual(rep['rejectedCount'],{'page inaccessible (503)':1})
  # Magasin actif du localisateur sans coordonnées : Base Adresse Nationale, source signalée.
  pages=cuisinella_site(map_missing=());entry=json.loads(pages['https://www.ma.cuisinella/fr-fr/magasins'].split('STORES_MAP = ')[1].split(';')[0])
  entry['Stores'][0]['Latitude']=None;entry['Stores'][0]['Longitude']=None
  pages['https://www.ma.cuisinella/fr-fr/magasins']='<html><script>var STORES_MAP = '+json.dumps(entry)+';</script></html>'
  class Ban(FakeWeb):
   def __call__(self,url,**kw):
    if url.startswith(c.BAN_API):return json.dumps({'features':[{'geometry':{'coordinates':[5.35891,45.95779]},'properties':{'postcode':'01500','score':0.93}}]}),url
    return super().__call__(url,**kw)
  # 1) la fiche magasin (JSON-LD) fournit les coordonnées officielles ;
  rep,rows=c.collect_cuisinella(get=Ban(pages))
  amb=[r for r in rows if r['codePostal']=='01500'][0]
  self.assertEqual((amb['lat'],amb['lon'],amb.get('coordsSource')),(45.9578,5.35883,None))
  self.assertTrue(rep['complete'],rep)
  # 2) sans coordonnées sur la fiche non plus : Base Adresse Nationale, source signalée.
  pages['https://www.ma.cuisinella/fr-fr/magasins/ain/amberieu-en-bugey']=CUIS_STORE.replace(',"geo":{"@type":"GeoCoordinates","latitude":45.9578,"longitude":5.35883}','')
  rep,rows=c.collect_cuisinella(get=Ban(pages))
  amb=[r for r in rows if r['codePostal']=='01500'][0]
  self.assertEqual((amb['lat'],amb['lon'],amb['coordsSource']),(45.95779,5.35891,'Base Adresse Nationale'))
  self.assertTrue(rep['complete'],rep)
  self.assertEqual(c.parse_cuisinella_map('<html>rien</html>'),[])
 def test_sirene_filters_brand_format_and_status(self):
  rep,rows=c.collect_sirene('Carrefour',get=FakeWeb({}),departments=['77'])
  self.assertEqual(sorted(r['id'] for r in rows),['sirene-carrefour-80509260800011','sirene-carrefour-98765432100017'],'hypermarché actif, franchisé inclus ; station, fermé, autre département et Market exclus ; double déclaration fusionnée')
  self.assertEqual((rep['merged'],rep['mergedSample']),(1,['sirene-carrefour-45132133500924 → sirene-carrefour-98765432100017']))
  row=[r for r in rows if r['id'].endswith('100017')][0]
  self.assertEqual((row['sourceName'],row['adresse'],row['ville'],row['regionCode']),('Carrefour Champs-sur-Marne','2 Avenue des Pyramides','Champs-sur-Marne','11'))
  self.assertEqual(row['source'],'Répertoire Sirene (INSEE)')
  self.assertEqual(row['sourceUrl'],'https://annuaire-entreprises.data.gouv.fr/etablissement/98765432100017')
  self.assertFalse(rep['complete'])
  self.assertEqual(c.sirene_store_name('Fnac',{'libelle_commune':'PARIS 8','code_postal':'75008'}),'Fnac Paris 8e')
  fnac=sirene_response([
   {'siren':'334473352','nom_complet':'RELAIS FNAC','nom_raison_sociale':'RELAIS FNAC','matching_etablissements':[
    etab('33447335200011','47.41Z','69003','LYON 3','CTRE COMMERCIAL PART DIEU 69003 LYON 3',45.7612,4.8567,['FNAC'],effectif='21'),
    etab('33447335200029','47.41Z','69003','LYON 3','19 BOULEVARD EUGENE DERUELLE 69003 LYON 3',45.7624,4.8589,None,effectif='03'),
    etab('33447335200037','52.10B','69003','LYON 3','ENTREPOT 69003 LYON 3',45.76,4.85,None)]},
   {'siren':'542095336','nom_complet':'LAGARDERE TRAVEL RETAIL FRANCE','nom_raison_sociale':'LAGARDERE TRAVEL RETAIL FRANCE','matching_etablissements':[
    etab('54209533600017','47.61Z','69003','LYON 3','GARE PART DIEU 69003 LYON 3',45.7606,4.8597,['RELAY FNAC'])]}])
  class FnacWeb(FakeWeb):
   def __call__(self,url,**kw):
    if url.startswith(c.SIRENE_API) and 'departement=69' in url and 'q=fnac' in url:return fnac,url
    return super().__call__(url,**kw)
  rep,rows=c.collect_sirene('Fnac',get=FnacWeb({}),departments=['69'])
  self.assertEqual(sorted(r['id'] for r in rows),['sirene-fnac-33447335200011','sirene-fnac-54209533600017'],'magasin gardé, annexe fusionnée, entrepôt écarté, boutique Relay distincte conservée')
  self.assertEqual(rep['merged'],1)
  self.assertEqual(c.french_title("SAINT-JEAN-DE-LA-RUELLE"),'Saint-Jean-de-la-Ruelle')
 def test_true_duplicates_merged_distinct_stores_kept(self):
  base=dict(enseigne='Boulanger',source='Annuaire officiel Boulanger',codePostal='69500',ville='BRON',adresse='x')
  prev=[dict(base,id='official-boulanger-1a63',sourceName='Boulanger Lyon - Saint Priest',lat=45.7216246,lon=4.9215729,sourceFetchedAt='2026-09-08'),
        dict(base,id='official-boulanger-f040',sourceName='Boulanger Lyon - Saint Priest',lat=45.72169,lon=4.92164,sourceFetchedAt='2026-09-28'),
        dict(base,id='official-boulanger-f159',sourceName='Boulanger Domus - Rosny Sous Bois',codePostal='93110',lat=48.8805,lon=2.4805,sourceFetchedAt='2026-09-28'),
        dict(base,id='official-boulanger-f594',sourceName='Boulanger Domus Rosny sous Bois Cuisine',codePostal='93110',lat=48.8813,lon=2.4806,sourceFetchedAt='2026-09-28'),
        dict(base,id='official-boulanger-corse',sourceName='Boulanger Ajaccio',codePostal='20090',lat=41.9,lon=8.7,sourceFetchedAt='2026-09-28')]
  kept=updater.normalize_previous(prev,'Boulanger')
  self.assertEqual(sorted(r['id'] for r in kept),['official-boulanger-f040','official-boulanger-f159','official-boulanger-f594'])
  near=c.make_store('Boulanger','Boulanger Bron','6 bd','Bron','69500',45.7230,4.9230,'https://annuaire-entreprises.data.gouv.fr/etablissement/1',store_id='sirene-boulanger-1')
  far=c.make_store('Boulanger','Boulanger Lyon 3e','rue','Lyon','69003',45.76,4.85,'https://annuaire-entreprises.data.gouv.fr/etablissement/2',store_id='sirene-boulanger-2')
  self.assertTrue(c.matches_existing(near,kept));self.assertFalse(c.matches_existing(far,kept))
 def test_orchestrator_offline_statuses_and_report(self):
  pages=dict(darty_site());pages.update(cuisinella_site())
  web=FakeWeb(pages,blocked={'www.boulanger.com','www.fnac.com','www.conforama.fr','www.carrefour.fr'})
  real=c.http_get
  c.http_get=web
  try:
   with tempfile.TemporaryDirectory() as tmp:
    out=Path(tmp)/'stores.json';rep=Path(tmp)/'report.md'
    prev=json.loads((ROOT/'data'/'official-stores.json').read_text(encoding='utf-8'))
    out.write_text(json.dumps(prev,ensure_ascii=False),encoding='utf-8')
    old=os.environ.pop('GITHUB_STEP_SUMMARY',None)
    try:updater.main(['--out',str(out),'--report',str(rep)])
    finally:
     if old is not None:os.environ['GITHUB_STEP_SUMMARY']=old
    data=json.loads(out.read_text(encoding='utf-8'))
    src=data['sources']
    self.assertEqual(src['Darty']['status'],'complete');self.assertEqual(src['Cuisinella']['status'],'complete')
    self.assertEqual(src['Fnac']['officialAccess']['status'],'blocked');self.assertEqual(src['Fnac']['officialAccess']['httpStatus'],403)
    self.assertEqual(src['Carrefour']['status'],'partial');self.assertEqual(src['Carrefour']['count'],2)
    self.assertIn(src['Boulanger']['status'],('partial',));self.assertGreater(src['Boulanger']['count'],90,'anciennes fiches Boulanger conservées')
    for brand,s in src.items():
     self.assertEqual(sorted(s['regions']),sorted(c.REGIONS),brand+' : exactement les 12 régions')
     for code,r in s['regions'].items():
      self.assertEqual(r['count'],sum(1 for x in data['stores'] if x['enseigne']==brand and x['regionCode']==code))
      if r['status']=='collected':self.assertEqual(s['status'],'complete')
    self.assertEqual(rep.read_text(encoding='utf-8'),report.build_report(data))
  finally:
   c.http_get=real
 @unittest.skipIf(SKIP_DATA,'contrôle du snapshot fait après la collecte')
 def test_catalog_quality_contract(self):
  data=json.loads((ROOT/'data'/'official-stores.json').read_text(encoding='utf-8'))
  stores=data['stores']
  by_brand={};ids=set();urls=set()
  for store in stores:
   by_brand[store['enseigne']]=by_brand.get(store['enseigne'],0)+1
   self.assertNotIn(store['id'],ids,store);ids.add(store['id'])
   if store['sourceUrl']!=c.BOULANGER_SOURCE:
    self.assertNotIn(store['sourceUrl'],urls,store);urls.add(store['sourceUrl'])
   self.assertTrue(store.get('sourceUrl'),store)
   self.assertRegex(str(store.get('codePostal','')),r'^\d{5}$')
   self.assertFalse(str(store.get('codePostal','')).startswith(('20','97','98')),store)
   self.assertEqual(store.get('dept'),c.dept_from_postal(store.get('codePostal')))
   self.assertEqual(store.get('regionCode'),c.region_code_from_postal(store.get('codePostal')))
   self.assertIn(store.get('regionCode'),c.REGIONS,store)
   self.assertEqual(store.get('region'),c.REGIONS[store['regionCode']][0])
   self.assertTrue(c.valid_coords(store.get('lat'),store.get('lon')),store)
   self.assertTrue(store.get('adresse') and store.get('ville') and store.get('sourceName'),store)
  for brand,src in data['sources'].items():
   self.assertEqual(sorted(src.get('regions',{})),sorted(c.REGIONS),brand+' : clés de région = 12 régions')
   self.assertEqual(src.get('count'),by_brand.get(brand,0),brand)
   if src.get('status')=='complete':
    self.assertTrue(src.get('proof'),brand+' : un statut complet exige une preuve')
    self.assertTrue(all(r['status']=='collected' for r in src['regions'].values()))
   else:
    self.assertFalse(any(r['status']=='collected' for r in src['regions'].values()),brand+' : aucune région complète sans preuve')
  for brand in ('Boulanger','Darty','Fnac','Conforama','Cuisinella','Carrefour'):
   self.assertGreater(by_brand.get(brand,0),0,brand+' : au moins une fiche')
 @unittest.skipIf(SKIP_DATA,'contrôle du snapshot fait après la collecte')
 def test_coverage_report_in_sync(self):
  data=json.loads((ROOT/'data'/'official-stores.json').read_text(encoding='utf-8'))
  self.assertEqual((ROOT/'CATALOGUE_COUVERTURE.md').read_text(encoding='utf-8'),report.build_report(data),'régénérer : python tools/catalog_coverage_report.py > CATALOGUE_COUVERTURE.md')
if __name__=='__main__':unittest.main()
