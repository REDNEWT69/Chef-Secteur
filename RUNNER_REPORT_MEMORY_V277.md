# Runner — mémoire des rapports V277

PR Draft, ne pas fusionner. Audit initial sur main `a363db4` après #531, puis reprise des modifications locales et intégration de main `869f9c3` après #539. La version produit visible reste 276 ; build technique `20261007-r69-report-memory-276`.

## Audit du parcours réel

V276 possède déjà `StoreRunnerBehavior.remarks/brief`, les événements de visite, `tour.finished` et `StoreRunnerStoreExplorer.insightsFor`. Ce dernier compare statuts 6P, nombres d'actions et dates ; il n'analyse pas les notes. Ces fonctions restent en place.

Le formulaire actuel de `store-runner-visits.js` saisit `report.shared.context`, `report.blanc/brun.team` et `report.blanc/brun.training`. Les anciens champs `actions`, `massification`, `omni`, les commentaires 6P, anomalies et conclusion existent toujours. Une conclusion vide est automatiquement copiée du premier texte disponible : ce doublon ne doit ni répéter un rappel ni transformer un texte BRUN en information BLANC. Les cases cochées et statuts OK ne prouvent aucune réalisation.

`VisitModel.complete` crée les Actions 6P puis clôture la visite. `VisitStore.edit` valide et enregistre le candidat avec Reliability, attend le flush et publie ensuite l'état. Les sauvegardes complètes incluent déjà businessV2. Réouverture et suppression sont possédées par les modules visite. Le Point du jour ne lisait que les rapports J/J-1, ce qui excluait une promesse faite plusieurs semaines avant le prochain passage.

## Architecture minimale

- **Modèle visite** : `analyzeReport(visit)` extrait uniquement d'une visite clôturée ; `reportMemoryOf` vérifie la mémoire contre les textes sources ; `reportMemoryFor(state, storeId, options)` agrège les rapports et Actions du magasin ; `reportMemoryLines` fournit des rappels datés.
- **Persistance** : `visit.runnerMemory = {version:1, items:[...]}`, facultatif, dans la même transaction que la clôture. Chaque item garde catégorie, thème, texte source exact, chemin du champ, famille et état de la formulation. Le magasin, la visite et la date viennent de la visite propriétaire. Aucun registre parallèle, nouvelle clé de stockage, nouveau script ni nouveau réseau.
- **Rétrocompatibilité** : schéma 5 et businessV2 version 2 inchangés. Les visites anciennes sans mémoire sont analysées en lecture seule. Le cache est dérivé : inconnu, altéré ou périmé, il est ignoré au profit des sources ; aucun fait importé n'est cru sur le seul cache. La sauvegarde, restauration et suppression suivent la visite existante. La réouverture retire le cache et exclut la source ; une re-clôture le remplace.
- **Actions** : leurs statuts actuels font autorité. Ouvertes/en cours, elles peuvent être rappelées ; terminées, elles restent consultables sans rappel ; annulées, elles sont exclues. Un doublon textuel exact ne réactive pas une Action terminée/annulée.
- **Surfaces** : deux extraits visibles, reste dépliable dans la mémoire terrain existante et le rapport, avec origine et lien vers le rapport. Un brouillon lit la mémoire précédente de sa famille. Le Point du jour privilégie le prochain magasin déjà prévu, même si son rapport date de plusieurs semaines. Les remarques V276 restent le repli ; le décor s'efface quand un rappel métier pertinent existe.

## Extraction et prudence

L'analyse locale repère les formulations explicites d'actions, suivis, formations, exposition/merchandising, références, SAV, ruptures/stock, blocages, objections/concurrence, interlocuteurs et priorités/prochain passage. Elle ne complète ni modèle produit ni quantité ni responsable ni échéance. Aucun OCR, interprétation des photos ou appel à l'IA de compte rendu existante.

Les extraits gardent leurs mots. Les négations, questions et hypothèses ne deviennent pas des obligations ou réalisations. Une note est datée et présentée comme un fait **noté**, jamais comme un suivi dont le statut serait automatiquement connu. Seules les Actions suivies ont un statut vivant ; pas de rapprochement sémantique hasardeux entre deux tâches de formulations différentes.

Bornes : 48 éléments par rapport, phrases complètes de 600 caractères maximum, champs de 20 000 caractères maximum ; les sources restent intégralement conservées. Le Point du jour omet une citation dépassant 360 caractères au lieu de la couper en perdant une réserve. Les rappels textuels utilisent les trois derniers rapports ; les Actions ouvertes gardent tout leur historique. Les rapports plus anciens restent consultables. La classification est volontairement limitée aux règles explicites, pas une compréhension générale du langage.

## Intégration avec #539

#539 était fusionnée à la reprise. Aucun changement V277 dans `store-explorer.js`, contrats, photos ou parcours Cuisinistes. Les modifications indispensables à `store-runner-visits.js` ont été isolées dans le commit `3348053`. Le conflit de fusion sur la longue fonction `renderQuickMemory` conserve strictement la garde Cuisinistes de #539 : sa fiche ciblée continue de masquer l'ancienne mémoire terrain, et son rapport unique reste consultable avec la mémoire du rapport.

## Vérification

Tests dédiés : `runner-report-memory-v277` (extraction, sources exactes, statuts, négations, séparation magasins/familles, rétrocompatibilité, cache altéré, idempotence, réouverture, suppression), `runner-report-memory-storage-v277` (flush, quota, reprise, export/restauration), `runner-report-home-v277` (prochain magasin et priorité sur décor). Les tests navigateur sont exécutés par le lanceur HTTP/1.1 habituel et intégrés à Reliability. Vérifications V276, historique et Cuisinistes conservées.

Limites de recette : l'émulation mobile Chromium ne remplace pas une validation sur un appareil Android physique. Aucun changement aux moteurs Planning, génération trois semaines, GPS r38 ou au service worker hors BUILD_REV.
