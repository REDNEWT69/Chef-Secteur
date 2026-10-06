# Découché J1 → J2 — incrément 1 (information seule)

PR Draft, ne pas fusionner avant validation. Base : `main` `cd2dd46`, build `20261006-r61-overnight-opportunity-276`, version visible inchangée (276).

## Ce qui existait déjà (à ne pas recréer)

Le découché n'est pas nouveau dans Store Runner. Avant ce lot :

- **Analyse** : `futureOvernightAnalysis` (V189, `auto-planning-fix.js`), exposée comme `StoreRunnerOvernightV182.analyze(plan, weekKey)`. Elle compare les paires de jours consécutifs d'une semaine **en km à vol d'oiseau** (`hav`), exige une zone à ≥ 55 km du domicile et une économie ≥ `profile.overnightMinSaving` (80 km par défaut), selon le mode Jamais / Automatique / Obligatoire. Contrat repris par `terrain-planning-v1.js` (`overnightContractAnalysis`, `analyzeOvernightWeeks`) et par le bonus découché du cycle 3 semaines (`overnightWeek`).
- **Affichage** : pastille 🌙 sur l'onglet du jour (`period-day-slider.js`), bandeau jaune `#planningOvernightCueV206` dans l'en-tête, bandeau `#overnightBox` dans les Réglages avec la fiche de réservation d'hôtel.
- **Conséquences** : `state.hotelReservations`, `StoreRunnerDayOrigin` (le lendemain repart de l'hôtel, ou on demande), jours de nuit gelés à la génération.

Ce lot n'y touche pas : aucune de ces décisions ni de ces écrans ne change.

## Ce que le lot ajoute

Une **lecture supplémentaire** d'un enchaînement précis J1 → J2, en **km ET en minutes de route**, avec de quoi l'expliquer :

```
RETOUR BASE : dernière visite de J1 → base, puis base → première visite de J2
DÉCOUCHAGE  : dernière visite de J1 → première visite de J2
gain        = RETOUR BASE − DÉCOUCHAGE            (km, minutes)
recommandé  = gain ≥ 100 km  OU  gain ≥ 75 min
```

Propriétaires :

| Rôle | Propriétaire |
| --- | --- |
| Évaluation pure, paires de la semaine, texte | `terrain-planning-v1.js` : `evaluateOvernightOpportunity`, `overnightOpportunitiesForPlan`, `describeOvernightOpportunity`, `OVERNIGHT_OPPORTUNITY` (à côté du contrat découché, aucun nouveau script de démarrage) |
| Distances et durées | `StoreRunnerRoadMatrixV248.leg` (`route-polish.js`), injecté dans l'évaluateur : matrice routière OSRM quand elle est amorcée, estimation du planning (1,22 × vol d'oiseau, 55 km/h) sinon. **Aucun second moteur de distances.** |
| Affichage | `planning-ui-fixes.js` (hiérarchie du Planning) : un bloc `#planningOvernightOpportunity` sous « Couverture du secteur » |
| Base | `state.profile.baseLat/baseLon`, strictement : jamais `baseObj()` du noyau, qui remplit 0,0, ni aucun point par défaut |

`evaluateOvernightOpportunity(day1, day2, base, routing, options)` renvoie `{recommended, status, savedKm, savedMinutes, from:{zone,storeId}, to:{zone,storeId}, fromDate, toDate, fromDay, toDay, trigger, precision, thresholds, reason}`. `status` dit toujours pourquoi : `recommended`, `below-threshold`, `no-day`, `no-visits`, `blocked-day`, `already-planned`, `no-base`, `no-routing`, `incomplete-data`. `reason` n'est rempli que si recommandé.

## Seuils (une seule définition)

`OVERNIGHT_OPPORTUNITY = {minSavedKm: 100, minSavedMinutes: 75}` en tête du bloc de `terrain-planning-v1.js`. Ils sont indépendants de `profile.overnightMinSaving` (seuil Automatique de V189) : cet incrément ne change ni ce réglage ni sa décision. Les bornes sont inclusives et se lisent sur les valeurs exposées (km au 0,1, minutes à l'unité).

## Quand rien n'est affiché

Aucune trace (le bloc n'existe pas) si : pas de J2 ; J1 ou J2 sans visite ; jour férié, en absence ou bloqué par l'Agenda (`dateBlocked`, propriétaire terrain) ; mode Jamais ; réservation d'hôtel déjà posée sur la nuit ; nuit déjà passée ; jours non consécutifs ; base absente ou en 0,0 ; dernière visite de J1 ou première de J2 sans coordonnées ; propriétaire des distances incapable de répondre pour l'un des trois trajets (réponse absente, `null`, non numérique, négative, exception) ; gain sous les deux seuils. Une valeur absente n'est **jamais** lue comme 0.

## Texte

```
Découchage conseillé · Mardi → Mercredi
Annemasse → secteur Annecy
≈ 185 km et 1 h 55 de route évités
Raison : retour à la base puis nouveau départ nettement moins efficace.
```

km et minutes sont arrondis à 5 près pour l'affichage (« ≈ »). Même zone des deux côtés : « secteur Annecy » seul. Texte posé en `textContent`. Pas de Runner, pas de bouton, pas de modal, pas de toast.

## Ce que le lot ne fait pas

Il n'écrit ni `state`, ni le plan, ni un rendez-vous, ni une réservation d'hôtel ; ne déplace aucune visite ; ne touche pas à la génération (ni le cycle 3 semaines, ni la position fraîche, ni RDV / verrous / imposés / jours fériés / samedi / heures — `cleanup-baseline-r20` reste la référence) ; ne lit pas les notes ; n'appelle aucun réseau, aucun hôtel, aucun Places, aucun moteur IA ; ne modifie pas Runner Intelligence V276. Réservation d'hôtel, choix de l'hôtel, repositionnement des visites, validation par l'utilisateur et génération de J2 depuis l'hôtel : **incrément 2**, non commencé.

## Un correctif adjacent, hors périmètre mais nécessaire

`auto-planning-fix.js` (V189) lisait le domicile par `baseObj()` du noyau, qui renvoie (0, 0) quand aucune base n'est enregistrée : chaque paire de jours « économisait » alors ~10 000 km et un découché absurde était proposé. `homeDistance` refuse maintenant un domicile en (0, 0) (`reason: no-future-pair`). Une base enregistrée donne exactement la même décision qu'avant (`terrain-overnight-contract`, `mandatory-overnight-v263-4`, `cross-day-overnight-h2`, `overnight-render-owner-v263-5` inchangés).

## Limites connues

- **Deux surfaces disent la même nuit** quand V189 retient aussi cette paire : le bandeau jaune V206 (« Découché Mardi → Mercredi · Hôtel conseillé ») et ce bloc (les chiffres et la raison). Fusionner les deux est une décision produit pour l'incrément 2.
- **Deux seuils** : V189 (80 km à vol d'oiseau, zone ≥ 55 km, réglable) et ce lot (100 km OU 75 min de route, constantes). Le bloc peut apparaître sans la pastille, ou l'inverse.
- Sans matrice routière amorcée (hors ligne, localhost, avant une première génération), les minutes sont l'estimation du planning à 55 km/h : 75 min équivalent alors à ≈ 69 km de route. `precision` vaut `estimate`, jamais `road`, et l'affichage reste « ≈ ».
- Une seule nuit affichée par semaine (la plus au-dessus de son seuil), semaine affichée seulement (pas d'archive ni de période) ; nuits entre deux semaines non traitées ; les hôtels posés comme événements Agenda ne sont pas lus, seulement `state.hotelReservations`.
- Le trajet jusqu'à l'hôtel lui-même n'est pas modélisé : la zone de la dernière visite sert de proxy (« ≈ »).

## Tests

`tests/overnight-opportunity-i1.test.cjs` (Reliability) : dix cas du brief, bornes inclusives, règles de la semaine, RDV gelés, texte exact, intégration avec le vrai `route-polish.js` (estimation puis matrice amorcée), rendu dans le faux DOM, verrous d'architecture (aucun `hav`, aucun réseau, aucun appelant côté génération) et garde V189. `tests/overnight-opportunity-i1-browser.spec.cjs` (job mobile 390 px) : rendu réel, mêmes nombres que le propriétaire des distances, aucun élément interactif, aucune superposition avec la pastille V206, état inchangé, absence de trace dans six situations, lisibilité en mode sombre.
