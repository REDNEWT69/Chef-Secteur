# Découché J1 → J2 — incrément 1 : V189 décide, la route chiffre

PR Draft #528, ne pas fusionner avant validation. Base : `main` `cd2dd46`, build `20261006-r61-overnight-opportunity-276`, version visible inchangée (276).

## Décision produit

Pas deux systèmes visibles de découchage, pas deux recommandations concurrentes. Pour cet incrément :

- **V189 décide** si une nuit est retenue comme découché (`futureOvernightAnalysis`, exposée comme `StoreRunnerOvernightV182.analyze` ; modes Jamais / Automatique / Obligatoire, zone ≥ 55 km, seuil `profile.overnightMinSaving`). Le contrat repris par `terrain-planning-v1.js` (V264) et par le rapport 3 semaines ne change pas.
- **`StoreRunnerRoadMatrixV248.leg` chiffre** seulement ce que la route y gagne, pour la nuit que V189 a retenue.
- **Le bandeau V206 affiche** ces chiffres : la seule surface visible du Planning.

La migration de V189 vers une décision 100 % routière est l'**incrément 2**, après validation terrain.

## Ce que le bandeau montre

```
🌙 Découché Mardi → Mercredi · 15/09 → 16/09          (V206, inchangé)
   Annemasse → secteur Annecy                          (nouveau)
   ≈ 185 km · 1 h 55 de route évités                   (nouveau)
   Hôtel conseillé · toucher pour afficher             (V206, inchangé)
```

Les deux lignes ajoutées sont masquées dès que le propriétaire des distances ne sait pas répondre : le bandeau est alors exactement celui d'avant, sans chiffre. Le tap ouvre toujours la fiche d'hôtel ; la pastille 🌙 de l'onglet et `#overnightBox` (Réglages) restent ceux de V189.

## Formule

```
RETOUR BASE : dernière visite de J1 → base, puis base → première visite de J2
DÉCOUCHAGE  : dernière visite de J1 → première visite de J2
gain        = RETOUR BASE − DÉCOUCHAGE            (km au 0,1 ; minutes à l'unité)
```

Affichage arrondi à 5 près (« ≈ »). Seule la partie positive est montrée ; si la route n'y gagne rien, aucune ligne. Aucun seuil ne filtre l'affichage : une nuit que V189 retient est chiffrée telle qu'elle est.

## Propriétaires

| Rôle | Propriétaire |
| --- | --- |
| Décision « cette nuit est un découché » | `auto-planning-fix.js` (V189) |
| Distances et durées | `StoreRunnerRoadMatrixV248.leg` (`route-polish.js`) : matrice OSRM amorcée, sinon estimation du planning (1,22 × vol d'oiseau, 55 km/h) |
| Calcul du gain (pur, routage injecté) | `terrain-planning-v1.js` : `overnightRoadGain`, `enrichOvernightCandidate`, `describeOvernightRoadGain` |
| Affichage | `period-day-slider.js` : deux lignes dans `#planningOvernightCueV206` |
| Base | `state.profile.baseLat/baseLon`, strictement : jamais `baseObj()` du noyau (qui remplit 0,0), aucun point par défaut |

La génération (cycle 3 semaines, recalcul, commande) ne connaît pas l'enrichissement : il est appelé à l'affichage seulement.

## Ce qui a été retiré du premier essai

Le premier essai (commits `0eaab58`, `3c1a7a8`) ajoutait une **deuxième décision** et une **deuxième surface** : un bloc « Découchage conseillé » dans `planning-ui-fixes.js` (sous la Couverture), recommandé à ≥ 100 km OU ≥ 75 min, avec ses propres règles (mode, nuit passée, hôtel réservé, jour bloqué, meilleure nuit de la semaine). Retiré :

- `planning-ui-fixes.js` : strictement celui de `main` (bloc, CSS, écouteurs). `tests/runner-visual-v269.test.cjs` : celui de `main` (la chaîne Couverture › Runner › liste n'a plus d'étape intermédiaire).
- `terrain-planning-v1.js` : `evaluateOvernightOpportunity`, `overnightOpportunitiesForPlan`, `describeOvernightOpportunity` (statuts `recommended` / `below-threshold` / `blocked-day` / `already-planned`, choix de la « meilleure » nuit). Ces règles appartiennent à V189.
- Les tests et la spec navigateur du bloc, remplacés par `overnight-road-enrichment-i1.test.cjs` et `overnight-road-enrichment-i1-browser.spec.cjs`.

**Constantes : analyse du nettoyage.** `OVERNIGHT_OPPORTUNITY = {100 km, 75 min}` ne décide plus rien. Supprimer ces valeurs obligeait à les redécouvrir à l'incrément 2 ; les garder comme seuil d'affichage recréait une deuxième recommandation. Elles sont donc conservées sous le nom `OVERNIGHT_ROAD_REFERENCE` et exposées comme **diagnostic inerte** (`roadThresholdMet`) : rien ne l'affiche, rien ne le lit, aucune décision n'en dépend. Il permettra, pendant la validation terrain, de comparer ce que V189 retient et ce qu'une décision routière retiendrait. Des tests verrouillent cette inertie (un gain sous la référence est affiché ; un gain au-dessus ne crée ni bandeau ni chiffre quand V189 écarte la nuit). Supprimer la référence est un nettoyage trivial si l'incrément 2 choisit d'autres seuils.

## Correctif de V189 conservé : domicile inconnu

V189 lisait le domicile par `baseObj()` du noyau, qui renvoie (0, 0) quand aucune base n'est enregistrée : chaque paire de jours « économisait » alors ~10 000 km et un découché absurde était proposé. `homeDistance` refuse maintenant un domicile en (0, 0) (`reason: no-future-pair`) ; avec une base enregistrée la décision est strictement inchangée. Tests : section « Base absente » de `overnight-road-enrichment-i1.test.cjs` (base `null`, vide, (0, 0), absente ; modes Automatique et Obligatoire ; positif de contrôle) et spec navigateur « Base absente ».

## Quand il n'y a pas de ligne routière

Le bandeau n'a pas de ligne ajoutée si : V189 ne retient aucune nuit (mode Jamais, zone trop proche, gain sous le seuil V189, pas de J2, base absente…) ; base du profil absente ou en (0, 0) ; dernière visite de J1 ou première de J2 sans coordonnées ; propriétaire des distances incapable de répondre pour l'un des trois trajets (réponse absente, `null`, non numérique, négative, exception) ; la route ne gagne rien de positif. Une valeur absente n'est **jamais** lue comme 0.

## Ce que le lot ne fait pas

Il n'écrit ni `state`, ni le plan, ni un rendez-vous, ni une réservation d'hôtel ; ne déplace aucune visite ; ne choisit aucun hôtel ; ne touche pas à la génération (cycle 3 semaines, position fraîche, RDV, verrous, imposés, jours fériés, samedi, heures : `cleanup-baseline-r20` reste la référence) ; ne lit pas les notes ; n'appelle aucun réseau, aucun Places, aucun moteur IA ; ne modifie pas Runner Intelligence V276. Choix de l'hôtel, repositionnement des visites, validation et génération de J2 depuis l'hôtel : **incrément 2**, non commencé.

## Limites connues

- Les chiffres du bandeau (route) et « économie estimée ~N km » de `#overnightBox` (V189, vol d'oiseau) sont deux mesures différentes de la même nuit ; l'unification est un candidat de l'incrément 2.
- Sans matrice routière amorcée (hors ligne, localhost, avant une première génération), les durées sont l'estimation du planning à 55 km/h : `precision` vaut `estimate` et l'affichage reste « ≈ ».
- Seule la nuit retenue pour la semaine affichée est chiffrée (celle du bandeau). Les nuits d'archive de la bande de période gardent leur pastille V189 sans chiffre.
- Le trajet jusqu'à l'hôtel n'est pas modélisé : la zone de la dernière visite sert de proxy.

## Tests

`tests/overnight-road-enrichment-i1.test.cjs` (Reliability) : calcul et texte, aucun filtre par seuil, diagnostic inerte, base absente (V189 et enrichissement), routage incomplet, précision, lecture seule (états gelés), **V189 réel en VM** (nuit retenue → chiffrée ; routage absent → V189 identique et sans chiffre ; zone trop proche avec gain routier > 100 km → ni candidat ni ligne ; mode Jamais ; Obligatoire), intégration avec le vrai `route-polish.js` (estimation puis matrice amorcée), verrous d'architecture (une seule surface, aucun `hav`, aucun réseau, aucune écriture, aucun appelant côté génération, `planning-ui-fixes.js` identique à `main`). `tests/overnight-road-enrichment-i1-browser.spec.cjs` (job mobile) : une seule surface visible, mêmes chiffres que le propriétaire des distances, aucune double recommandation, nuit écartée par V189 sans trace, base absente, routage coupé puis rétabli, clair et sombre à 390 et 360 px, état inchangé après interaction.
