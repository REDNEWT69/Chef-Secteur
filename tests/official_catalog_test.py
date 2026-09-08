import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools'))
import official_directory_parsers as c
FIX=Path(__file__).parent/'fixtures'
class CatalogTests(unittest.TestCase):
 def test_boulanger_real_fields_and_no_nearby(self):
  rows,links=c.parse((FIX/'boulanger-store.html').read_text(),'https://www.boulanger.com/magasins/auvergne-rhone-alpes/rhone/bron/centre-commercial-au-shopping-porte-des-alpes','Boulanger','84')
  self.assertEqual(len(rows),1);self.assertIn('6, Bd André Boulloche',rows[0]['adresse']);self.assertEqual(rows[0]['ville'],'BRON');self.assertEqual(rows[0]['lat'],45.7216246);self.assertEqual(links,[])
 def test_darty_real_fields_and_pagination(self):
  rows,links=c.parse((FIX/'darty-region.html').read_text(),'https://magasin.darty.com/fr/auvergne-rhone-alpes','Darty','84')
  self.assertEqual(len(rows),1);self.assertEqual(rows[0]['ville'],'Saint-Genis-Laval');self.assertEqual(links,['https://magasin.darty.com/fr/auvergne-rhone-alpes?page=2'])
 def test_empty_not_a_store(self):
  self.assertEqual(c.parse('<html>Erreur</html>','https://magasin.darty.com/','Darty','84')[0],[])
if __name__=='__main__':unittest.main()
