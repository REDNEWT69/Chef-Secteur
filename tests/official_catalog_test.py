import json,math,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import official_directory_parsers as c
FIX=Path(__file__).parent/'fixtures'
ROOT=Path(__file__).resolve().parents[1]
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
 def test_conforama_list_links_and_detail_jsonld(self):
  listing='<a href="https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768">Saint-Priest</a>'
  self.assertEqual(c.conforama_links(listing),['https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768'])
  html='''<script id="structured-data-organization">{"@context":"https://schema.org","@type":["FurnitureStore","HomeGoodsStore"],"@id":"https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768","url":"https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768","name":"Conforama Saint-Priest","address":{"@type":"PostalAddress","postalCode":"69800","streetAddress":"211 Route de Grenoble","addressLocality":"Saint-Priest","addressCountry":"FR"},"geo":{"@type":"GeoCoordinates","latitude":45.71331,"longitude":4.96308}}</script>'''
  rows,_=c.parse(html,'https://www.conforama.fr/magasins-conforama/auvergne-rhone-alpes/saint-priest-768','Conforama','84')
  self.assertEqual(len(rows),1)
  self.assertEqual(rows[0]['codePostal'],'69800')
  self.assertEqual(rows[0]['regionCode'],'84')
 def test_conforama_corse_is_not_fallback_to_auvergne_rhone_alpes(self):
  self.assertEqual(c.region_from_conforama_url('https://www.conforama.fr/magasins-conforama/corse/bastia-754'),'')
  html='''<script id="structured-data-organization">{"@context":"https://schema.org","@type":["FurnitureStore","HomeGoodsStore"],"@id":"https://www.conforama.fr/magasins-conforama/corse/bastia-754","url":"https://www.conforama.fr/magasins-conforama/corse/bastia-754","name":"Conforama Bastia","address":{"@type":"PostalAddress","postalCode":"20600","streetAddress":"Route de la Marana","addressLocality":"Bastia","addressCountry":"FR"},"geo":{"@type":"GeoCoordinates","latitude":42.666,"longitude":9.45}}</script>'''
  rows,_=c.parse(html,'https://www.conforama.fr/magasins-conforama/corse/bastia-754','Conforama','')
  self.assertEqual(rows,[])
 def test_catalog_quality_contract(self):
  data=json.loads((ROOT/'data'/'official-stores.json').read_text(encoding='utf-8'))
  stores=data['stores']
  by_brand={}
  seen=set()
  for store in stores:
   by_brand[store['enseigne']]=by_brand.get(store['enseigne'],0)+1
   key=(store.get('enseigne'),store.get('codePostal'),c.html.unescape(store.get('adresse','')).casefold().strip(),c.html.unescape(store.get('ville','')).casefold().strip())
   self.assertNotIn(key,seen)
   seen.add(key)
   self.assertTrue(store.get('sourceUrl'),store)
   self.assertRegex(str(store.get('codePostal','')),r'^\d{5}$')
   self.assertFalse(str(store.get('codePostal','')).startswith(('20','97','98')),store)
   self.assertEqual(store.get('dept'),c.dept_from_postal(store.get('codePostal')))
   self.assertEqual(store.get('regionCode'),c.region_code_from_postal(store.get('codePostal')))
   self.assertNotEqual(store.get('regionCode'),'94',store)
   self.assertTrue(isinstance(store.get('lat'),(int,float)) and math.isfinite(store['lat']) and -90<=store['lat']<=90,store)
   self.assertTrue(isinstance(store.get('lon'),(int,float)) and math.isfinite(store['lon']) and -180<=store['lon']<=180,store)
  self.assertGreater(by_brand.get('Boulanger',0),0)
  self.assertGreater(by_brand.get('Conforama',0),0)
  self.assertGreaterEqual(by_brand.get('Darty',0),394)
  self.assertGreaterEqual(by_brand.get('Cuisinella',0),250)
  self.assertNotIn('"94"',json.dumps(data.get('sources',{})))
  self.assertIn(data['sources']['Boulanger']['status'],('partial','partial (previous records retained)'))
  self.assertIn(data['sources']['Conforama']['status'],('partial','partial (previous records retained)'))
  self.assertNotIn('complete',json.dumps(data.get('sources',{})).lower())
if __name__=='__main__':unittest.main()
