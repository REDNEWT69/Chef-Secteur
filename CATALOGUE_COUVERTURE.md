# Couverture du carnet officiel

Fichier généré par `tools/update_official_stores.py` depuis `data/official-stores.json` — ne pas éditer à la main.

- Snapshot : `2026-09-28T17:36:27Z`
- Périmètre : France métropolitaine continentale, 12 régions, 94 départements (ni Corse ni outre-mer).
- Total : **1486** magasins.
- Légende : `✓` région complète avec preuve d’exhaustivité ; nombre seul = liste partielle ; `—` = aucune fiche.

## Synthèse par enseigne

| Enseigne | Magasins | Statut | Méthode | Preuve / limite | Annuaire de l’enseigne |
|---|---:|---|---|---|---|
| Boulanger | 168 | partiel | Annuaire Boulanger (dernière collecte réussie) + Répertoire Sirene (INSEE) via l’API Recherche d’entreprises : établissements actifs déclarés sous l’enseigne | Annuaire Boulanger : 97 fiches conservées ; Sirene : 71 établissements ajoutés sur 112 reconnus (41 déjà présents). Aucune preuve d’exhaustivité : le répertoire Sirene ne recense que les établissements déclarés sous l’enseigne (112 retenus sur 113 candidats). | bloqué : HTTP 400 akamai (2026-09-28) |
| Darty | 454 | complet (preuve) | Liste nationale paginée magasin.darty.com/fr, contrôlée par le plan du site et le sitemap officiel | Plan du site (458) = sitemap (458) ; 454 fiches continentales, 4 hors périmètre, 0 non exploitables | accessible |
| Fnac | 133 | partiel | Répertoire Sirene (INSEE) via l’API Recherche d’entreprises : établissements actifs déclarés sous l’enseigne | Sirene : 133 établissements ajoutés sur 133 reconnus (0 déjà présents). Aucune preuve d’exhaustivité : le répertoire Sirene ne recense que les établissements déclarés sous l’enseigne (133 retenus sur 138 candidats). | bloqué : HTTP 403 (2026-09-28) |
| Conforama | 174 | partiel | Annuaire Conforama (dernière collecte réussie) + Répertoire Sirene (INSEE) via l’API Recherche d’entreprises : établissements actifs déclarés sous l’enseigne | Annuaire Conforama : 133 fiches conservées ; Sirene : 41 établissements ajoutés sur 104 reconnus (63 déjà présents). Aucune preuve d’exhaustivité : le répertoire Sirene ne recense que les établissements déclarés sous l’enseigne (104 retenus sur 110 candidats). | bloqué : HTTP 403 cloudflare (2026-09-28) |
| Cuisinella | 343 | complet (preuve) | Localisateur officiel ma.cuisinella (données STORES_MAP de /fr-fr/magasins), contrôlé par le sitemap officiel | Localisateur officiel (349 magasins) contrôlé par le sitemap (331 fiches) : 343 fiches continentales, 7 hors périmètre, 24 page(s) du sitemap retirée(s) (404 ou redirection), 0 non exploitable(s) ; 1 coordonnée(s) issue(s) de la Base Adresse Nationale | accessible |
| Carrefour | 214 | partiel | Répertoire Sirene (INSEE) via l’API Recherche d’entreprises : établissements actifs déclarés sous l’enseigne | Sirene : 214 établissements ajoutés sur 214 reconnus (0 déjà présents). Aucune preuve d’exhaustivité : le répertoire Sirene ne recense que les établissements déclarés sous l’enseigne (214 retenus sur 216 candidats). | bloqué : HTTP 403 cloudflare (2026-09-28) |

## Par région

| Région | Boulanger | Darty | Fnac | Conforama | Cuisinella | Carrefour | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Auvergne-Rhône-Alpes | 26 | 63 ✓ | 17 | 20 | 53 ✓ | 32 | 211 |
| Bourgogne-Franche-Comté | 11 | 21 ✓ | 5 | 13 | 20 ✓ | 16 | 86 |
| Bretagne | 10 | 27 ✓ | 8 | 10 | 19 ✓ | 11 | 85 |
| Centre-Val de Loire | 7 | 15 ✓ | 5 | 8 | 15 ✓ | 7 | 57 |
| Grand Est | 16 | 30 ✓ | 11 | 18 | 42 ✓ | 23 | 140 |
| Hauts-de-France | 21 | 33 ✓ | 7 | 15 | 34 ✓ | 29 | 139 |
| Île-de-France | 16 | 67 ✓ | 31 | 19 | 32 ✓ | 38 | 203 |
| Normandie | 6 | 35 ✓ | 7 | 9 | 13 ✓ | 7 | 77 |
| Nouvelle-Aquitaine | 13 | 49 ✓ | 9 | 20 | 29 ✓ | 15 | 135 |
| Occitanie | 15 | 46 ✓ | 11 | 20 | 35 ✓ | 14 | 141 |
| Pays de la Loire | 8 | 28 ✓ | 6 | 10 | 21 ✓ | 8 | 81 |
| Provence-Alpes-Côte d'Azur | 19 | 40 ✓ | 16 | 12 | 30 ✓ | 14 | 131 |

## Par département

| Dépt | Nom | Région | Boulanger | Darty | Fnac | Conforama | Cuisinella | Carrefour | Total |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| 01 | Ain | Auvergne-Rhône-Alpes | 2 | 6 | — | 2 | 5 | 4 | 19 |
| 02 | Aisne | Hauts-de-France | 2 | 4 | — | 3 | 3 | 3 | 15 |
| 03 | Allier | Auvergne-Rhône-Alpes | 2 | 2 | 1 | 3 | 3 | 3 | 14 |
| 04 | Alpes-de-Haute-Provence | Provence-Alpes-Côte d'Azur | — | 2 | — | 1 | 1 | — | 4 |
| 05 | Hautes-Alpes | Provence-Alpes-Côte d'Azur | 2 | 2 | 2 | — | 1 | — | 7 |
| 06 | Alpes-Maritimes | Provence-Alpes-Côte d'Azur | 4 | 9 | 3 | 4 | 5 | 3 | 28 |
| 07 | Ardèche | Auvergne-Rhône-Alpes | 2 | 4 | — | — | 2 | — | 8 |
| 08 | Ardennes | Grand Est | 1 | 1 | 1 | 2 | 1 | 2 | 8 |
| 09 | Ariège | Occitanie | — | 1 | — | 1 | 1 | — | 3 |
| 10 | Aube | Grand Est | 1 | 1 | 1 | 1 | 2 | 2 | 8 |
| 11 | Aude | Occitanie | 1 | 4 | 1 | 2 | 4 | 1 | 13 |
| 12 | Aveyron | Occitanie | — | 3 | 1 | 1 | 2 | — | 7 |
| 13 | Bouches-du-Rhône | Provence-Alpes-Côte d'Azur | 4 | 12 | 5 | 1 | 9 | 4 | 35 |
| 14 | Calvados | Normandie | 1 | 7 | 2 | 2 | 3 | 4 | 19 |
| 15 | Cantal | Auvergne-Rhône-Alpes | 1 | 3 | 1 | 1 | 2 | 1 | 9 |
| 16 | Charente | Nouvelle-Aquitaine | 1 | 4 | — | 1 | 1 | 1 | 8 |
| 17 | Charente-Maritime | Nouvelle-Aquitaine | 3 | 4 | 1 | 2 | 4 | 1 | 15 |
| 18 | Cher | Centre-Val de Loire | 1 | 2 | 1 | 1 | 2 | — | 7 |
| 19 | Corrèze | Nouvelle-Aquitaine | — | 3 | — | 1 | — | 1 | 5 |
| 21 | Côte-d'Or | Bourgogne-Franche-Comté | 2 | 4 | 1 | 2 | 3 | 3 | 15 |
| 22 | Côtes-d'Armor | Bretagne | 2 | 5 | 1 | 2 | 3 | 4 | 17 |
| 23 | Creuse | Nouvelle-Aquitaine | — | 1 | — | — | — | 1 | 2 |
| 24 | Dordogne | Nouvelle-Aquitaine | 2 | 3 | 1 | 2 | 2 | — | 10 |
| 25 | Doubs | Bourgogne-Franche-Comté | 1 | 5 | 2 | 2 | 4 | 3 | 17 |
| 26 | Drôme | Auvergne-Rhône-Alpes | 3 | 3 | 1 | 2 | 2 | — | 11 |
| 27 | Eure | Normandie | 1 | 6 | 2 | 1 | 2 | 1 | 13 |
| 28 | Eure-et-Loir | Centre-Val de Loire | — | 3 | 1 | 1 | 3 | 1 | 9 |
| 29 | Finistère | Bretagne | 3 | 8 | 2 | 4 | 4 | 2 | 23 |
| 30 | Gard | Occitanie | 3 | 5 | 1 | 3 | 4 | 2 | 18 |
| 31 | Haute-Garonne | Occitanie | 5 | 7 | 6 | 5 | 7 | 3 | 33 |
| 32 | Gers | Occitanie | — | 1 | — | 1 | 1 | 1 | 4 |
| 33 | Gironde | Nouvelle-Aquitaine | 2 | 12 | 2 | 4 | 9 | 3 | 32 |
| 34 | Hérault | Occitanie | 1 | 9 | 1 | 2 | 6 | 4 | 23 |
| 35 | Ille-et-Vilaine | Bretagne | 4 | 8 | 2 | 2 | 7 | 4 | 27 |
| 36 | Indre | Centre-Val de Loire | 1 | 1 | 1 | 1 | 1 | 1 | 6 |
| 37 | Indre-et-Loire | Centre-Val de Loire | 2 | 2 | 1 | 1 | 3 | 1 | 10 |
| 38 | Isère | Auvergne-Rhône-Alpes | 5 | 11 | 2 | 2 | 9 | 4 | 33 |
| 39 | Jura | Bourgogne-Franche-Comté | 2 | 3 | 1 | — | 2 | 1 | 9 |
| 40 | Landes | Nouvelle-Aquitaine | — | 4 | — | 2 | 2 | 2 | 10 |
| 41 | Loir-et-Cher | Centre-Val de Loire | 1 | 3 | — | 2 | 2 | 2 | 10 |
| 42 | Loire | Auvergne-Rhône-Alpes | 3 | 5 | 1 | 2 | 3 | 2 | 16 |
| 43 | Haute-Loire | Auvergne-Rhône-Alpes | 1 | 2 | — | — | 1 | — | 4 |
| 44 | Loire-Atlantique | Pays de la Loire | 3 | 11 | 2 | 3 | 8 | 2 | 29 |
| 45 | Loiret | Centre-Val de Loire | 2 | 4 | 1 | 2 | 4 | 2 | 15 |
| 46 | Lot | Occitanie | 1 | 5 | — | 1 | — | 1 | 8 |
| 47 | Lot-et-Garonne | Nouvelle-Aquitaine | 1 | 5 | — | 3 | 3 | — | 12 |
| 48 | Lozère | Occitanie | — | — | — | — | 1 | — | 1 |
| 49 | Maine-et-Loire | Pays de la Loire | 1 | 4 | 2 | 3 | 4 | 3 | 17 |
| 50 | Manche | Normandie | — | 7 | 1 | 2 | 3 | — | 13 |
| 51 | Marne | Grand Est | 3 | 2 | 3 | 1 | 4 | 3 | 16 |
| 52 | Haute-Marne | Grand Est | 1 | 1 | — | 1 | 2 | 1 | 6 |
| 53 | Mayenne | Pays de la Loire | 1 | 2 | — | 1 | 3 | 1 | 8 |
| 54 | Meurthe-et-Moselle | Grand Est | 1 | 5 | 1 | 4 | 7 | 4 | 22 |
| 55 | Meuse | Grand Est | — | 1 | — | 1 | 2 | 1 | 5 |
| 56 | Morbihan | Bretagne | 1 | 6 | 3 | 2 | 5 | 1 | 18 |
| 57 | Moselle | Grand Est | 2 | 7 | 2 | 3 | 7 | 2 | 23 |
| 58 | Nièvre | Bourgogne-Franche-Comté | — | 1 | — | 1 | 2 | 1 | 5 |
| 59 | Nord | Hauts-de-France | 8 | 11 | 4 | 5 | 15 | 13 | 56 |
| 60 | Oise | Hauts-de-France | 2 | 5 | 1 | 3 | 3 | 5 | 19 |
| 61 | Orne | Normandie | 1 | 1 | — | 1 | — | — | 3 |
| 62 | Pas-de-Calais | Hauts-de-France | 7 | 9 | 1 | 3 | 11 | 7 | 38 |
| 63 | Puy-de-Dôme | Auvergne-Rhône-Alpes | 1 | 4 | 2 | 1 | 3 | 4 | 15 |
| 64 | Pyrénées-Atlantiques | Nouvelle-Aquitaine | 1 | 5 | 2 | 2 | 2 | 3 | 15 |
| 65 | Hautes-Pyrénées | Occitanie | 1 | 1 | — | 1 | 2 | — | 5 |
| 66 | Pyrénées-Orientales | Occitanie | 2 | 4 | 1 | 1 | 2 | 2 | 12 |
| 67 | Bas-Rhin | Grand Est | 4 | 6 | 2 | 2 | 10 | 2 | 26 |
| 68 | Haut-Rhin | Grand Est | 2 | 3 | 1 | 2 | 4 | 3 | 15 |
| 69 | Rhône | Auvergne-Rhône-Alpes | 3 | 10 | 6 | 3 | 14 | 7 | 43 |
| 70 | Haute-Saône | Bourgogne-Franche-Comté | 1 | 2 | — | 1 | 1 | 2 | 7 |
| 71 | Saône-et-Loire | Bourgogne-Franche-Comté | 3 | 3 | — | 3 | 5 | 3 | 17 |
| 72 | Sarthe | Pays de la Loire | 1 | 5 | 1 | 1 | 2 | 1 | 11 |
| 73 | Savoie | Auvergne-Rhône-Alpes | 1 | 7 | 1 | 2 | 5 | 3 | 19 |
| 74 | Haute-Savoie | Auvergne-Rhône-Alpes | 2 | 6 | 2 | 2 | 4 | 4 | 20 |
| 75 | Paris | Île-de-France | — | 16 | 9 | 1 | 5 | 1 | 32 |
| 76 | Seine-Maritime | Normandie | 3 | 14 | 2 | 3 | 5 | 2 | 29 |
| 77 | Seine-et-Marne | Île-de-France | 1 | 10 | 5 | 6 | 7 | 7 | 36 |
| 78 | Yvelines | Île-de-France | 4 | 10 | 3 | 2 | 5 | 6 | 30 |
| 79 | Deux-Sèvres | Nouvelle-Aquitaine | 1 | 3 | — | 1 | 2 | 2 | 9 |
| 80 | Somme | Hauts-de-France | 2 | 4 | 1 | 1 | 2 | 1 | 11 |
| 81 | Tarn | Occitanie | — | 4 | — | 2 | 3 | — | 9 |
| 82 | Tarn-et-Garonne | Occitanie | 1 | 2 | — | — | 2 | — | 5 |
| 83 | Var | Provence-Alpes-Côte d'Azur | 6 | 8 | 4 | 4 | 5 | 5 | 32 |
| 84 | Vaucluse | Provence-Alpes-Côte d'Azur | 3 | 7 | 2 | 2 | 9 | 2 | 25 |
| 85 | Vendée | Pays de la Loire | 2 | 6 | 1 | 2 | 4 | 1 | 16 |
| 86 | Vienne | Nouvelle-Aquitaine | 1 | 2 | 1 | 1 | 3 | — | 8 |
| 87 | Haute-Vienne | Nouvelle-Aquitaine | 1 | 3 | 2 | 1 | 1 | 1 | 9 |
| 88 | Vosges | Grand Est | 1 | 3 | — | 1 | 3 | 3 | 11 |
| 89 | Yonne | Bourgogne-Franche-Comté | 1 | 2 | — | 3 | 2 | 2 | 10 |
| 90 | Territoire de Belfort | Bourgogne-Franche-Comté | 1 | 1 | 1 | 1 | 1 | 1 | 6 |
| 91 | Essonne | Île-de-France | 2 | 7 | 3 | 2 | 3 | 8 | 25 |
| 92 | Hauts-de-Seine | Île-de-France | 2 | 7 | 2 | 4 | 5 | 1 | 21 |
| 93 | Seine-Saint-Denis | Île-de-France | 2 | 3 | 3 | 1 | 1 | 3 | 13 |
| 94 | Val-de-Marne | Île-de-France | 2 | 10 | 5 | 1 | 3 | 5 | 26 |
| 95 | Val-d'Oise | Île-de-France | 3 | 4 | 1 | 2 | 3 | 7 | 20 |

## Trous connus et limites

- **Boulanger** : annuaire officiel bloqué pour la collecte automatique (https://www.boulanger.com/magasins/ → HTTP 400, protection akamai); aucune preuve d’exhaustivité : statut partiel; composition : Annuaire officiel Boulanger (2026-09-28) = 97, Répertoire Sirene (INSEE) = 71.
- **Darty** : 4 fiche(s) hors périmètre écartée(s) (Corse, outre-mer).
- **Fnac** : annuaire officiel bloqué pour la collecte automatique (https://www.fnac.com/localiser-magasin-fnac/w-4 → HTTP 403); aucune preuve d’exhaustivité : statut partiel; fiches rejetées (coordonnées absentes ou hors France) : 2 dont `88091319900019`, `95078334000025`.
- **Conforama** : annuaire officiel bloqué pour la collecte automatique (https://www.conforama.fr/liste-des-magasins → HTTP 403, protection cloudflare); aucune preuve d’exhaustivité : statut partiel; composition : Annuaire officiel Conforama (2026-09-28) = 133, Répertoire Sirene (INSEE) = 41.
- **Cuisinella** : 7 fiche(s) hors périmètre écartée(s) (Corse, outre-mer).
- **Carrefour** : annuaire officiel bloqué pour la collecte automatique (https://www.carrefour.fr/magasin/liste → HTTP 403, protection cloudflare); aucune preuve d’exhaustivité : statut partiel.

## Adresses partagées (signalées, non supprimées)

Fiches distinctes d’une même enseigne à moins de 150 m (ex. Darty et Darty Cuisine d’un même centre). Elles restent toutes les deux dans le carnet ; à l’ajout, `RegionStores.duplicate` considère la seconde comme déjà présente si la première est dans le secteur.

- Boulanger : Boulanger Domus - Rosny Sous Bois / Boulanger Domus Rosny sous Bois Cuisine (93110, 91 m)
- Boulanger : Boulanger Toulon - La Garde / Boulanger Toulon Outdoor (83130, 137 m)
- Darty : DARTY Cuisine La Madeleine / DARTY La Madeleine (75008, 36 m)
- Darty : DARTY Cuisine & Literie Cahors / DARTY Cahors (46090, 80 m)
- Darty : DARTY Cuisine & Literie Le-Puy-en-Velay / DARTY Le Puy-en-Velay (43000, 123 m)
- Fnac : Fnac Le Mesnil-Amelot / Fnac Le Mesnil-Amelot (77990, 141 m)
- Fnac : Fnac Le Mesnil-Amelot / Fnac Le Mesnil-Amelot (77990, 100 m)
- Fnac : Fnac Toulouse / Fnac Toulouse (31000, 63 m)
- Cuisinella : Cuisinella Châlons-en-Champagne Fagnières / Cuisinella Fagnières (51510, 41 m)

## Contrôle de cohérence adresse / coordonnées

- aucune fiche à plus de 150 km du centre des magasins de son département
