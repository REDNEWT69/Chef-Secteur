# Planning Command Engine — Lot B, V1

Statut : **PR Draft, non fusionnée.** Base `main` `70aa593` (#494, r38). Build proposé :
`20261004-r39-planning-command-engine-264` (`displayVersion` 264 inchangée), monté après une CI
Reliability entièrement verte sur le code du lot.

L'utilisateur pilote le planning par une phrase. Le moteur de commandes **interprète** la phrase,
mais **n'écrit jamais lui-même le planning** : il traduit l'intention en contraintes pour les
moteurs existants, montre ce qu'ils produiraient, puis applique exactement ce qui a été montré,
après validation explicite.

```
texte → parse() → intention JSON stricte → validate() → resolve() (IDs magasin)
      → simulate() par les propriétaires, sur copies → preview() « Voilà ce que Store Runner va faire »
      → [Appliquer] → apply() via les API propriétaires + ChefReliability → relecture → journal
```

## Travail antérieur

Un stash local (« Preserve local Command Engine and audits before r38 hotfix », base r36 `3164256`)
contenait un prototype « Programme mes P1 W42 ». Il n'est **pas réappliqué** : il modifiait
`buildThreeWeekSnail` pour toutes les générations (ancres géographiques sur tout verrou, journées de
réservation figées), donc V264/H2/M1 hors commande ; il ne connaissait qu'une seule phrase ; il
confirmait par `ChefReliability.propose`, qui est remplacé par l'application automatique V189. Ses
bonnes idées sont reprises sous une autre forme : schéma strict, empreinte de la source, refus d'un
aperçu altéré ou obsolète.

## Cartographie des propriétaires

| Étape | Propriétaire | API utilisée | Écrit ? |
| --- | --- | --- | --- |
| A. interpréter | `planning-command-engine.js` | `parse(texte, {today, startDate, brands})` | non |
| B. valider | `planning-command-engine.js` | `validate(intention, {stage, today})`, `acceptModelIntent(json)` | non |
| C. résoudre | `planning-command-engine.js` + couverture V263 | `resolve()` ; P1/P2 = `StoreRunnerVisitCoverage.needOf(...).priority` | non |
| départ (r38) | `profile-controller.js` | `resolvePlanningOrigin()` (lecture seule) | non |
| D. simuler une période | `terrain-planning-v1.js` | `simulateCommandWindow()` = même construction que `generateThreeWeekSnail` (V263, V264/H2, M1, brief V246) | non |
| D. passes du cycle | `v182-fixes.js` (V185), `planning-route-optimizer-v251.js` (V251) | `StoreRunnerGeographyV185.rebalance`, `StoreRunnerRouteOptimizerV251.optimizePlan` | non (retour de plan) |
| D. placement minimal | `planning-manual-visits.js` | `addToPlan(copie, id, jour)`, `scheduleIssue` | non (sur copie) |
| D. recalcul | `planning-cascade-v181.js` | `storeRunnerRecalculateRemainingWeek.build({readControls:false})` | non |
| D. contrôles | horaires `StoreOpeningHoursV1.scheduleRoute`, découché V189 `StoreRunnerOvernightV182.analyze`, km `routeMetrics` | | non |
| E. aperçu | `planning-command-engine.js` (partie interface) | feuille `#srCommandSheet` (textContent seulement) | non |
| F. appliquer une période | `ChefReliability` | `capture` → archive (`generatedArchiveEntry`) + `state.plan` de la semaine affichée → `persist` (journalisé, atomique) | **oui, après validation** |
| F. appliquer un placement | `planning-manual-visits.js`, `range-planner-v2.js`, `period-day-slider.js` | `addStore`, `storeRunnerPinPlannedStore`, `openDate` | **oui, après validation** |
| F. appliquer un recalcul | `planning-cascade-v181.js` | `applyResult(result)` (le chemin du bouton) | **oui, après validation** |
| journal | `planning-command-engine.js` | clé `store-runner-planning-command-log-v1` (30 entrées, via `__chefStorage`) | après validation / annulation |

Aucun second état planning, aucun second moteur : la commande ajoute des contraintes aux points
d'extension **déjà présents** du moteur terrain (`lockDayForWeek`, `dayBlocked`, `dayFits`,
`evaluateDayRoute`, `prepareCrossDayWeeks`) et à son mécanisme d'obligations (échéances du brief).

## Schéma Intent V1

```json
{
  "version": 1,
  "action": "plan_visits | place_stores | recalculate_rest_of_week",
  "scope": { "start": "AAAA-MM-JJ", "end": "AAAA-MM-JJ" },
  "filters": {
    "priorities": ["P1", "P2"],
    "brands": ["Darty"],
    "stores": [{ "query": "Valence" }]
  },
  "constraints": {
    "exactDays":  [{ "stores": [{ "query": "Valence" }], "date": "2026-10-06" }],
    "keepDays":   [{ "stores": [{ "query": "Chambéry" }], "date": "2026-10-07" }],
    "windowDays": [{ "stores": [{ "query": "Chambéry" }], "dates": ["2026-10-06", "2026-10-07"] }],
    "forbidden":  [{ "stores": [{ "query": "Lyon" }], "date": "2026-10-08" }],
    "distribution": "asap | spread",
    "preserveAppointments": true,
    "preserveManualLocks": true,
    "preserveCompletedVisits": true,
    "preservePastDays": true
  }
}
```

- **Deux stades** : brut (`{"query": "..."}`, produit par le parseur ou un modèle) puis résolu
  (`{"id": "..."}` uniquement, IDs existants). Les filtres P1/P2/enseigne sont développés en IDs.
- **Strict** : tout champ absent ou en trop, tout type inattendu, toute valeur hors liste est
  refusé ; les protections valent obligatoirement `true` ; dates calendaires réelles, jamais un
  dimanche, jamais avant aujourd'hui ; période ≤ 6 semaines ; une programmation couvre des semaines
  entières (fin un dimanche) ; un placement porte sur une seule semaine ; un magasin reçoit une seule
  consigne de jour et ne peut pas être exigé et interdit le même jour.
- **Modèle de langage** : `acceptModelIntent(texte)` n'accepte que du JSON conforme (≤ 4 000
  caractères), passé par la même validation. Aucun `eval`, aucun texte exécuté. Le parseur V1 est
  local et déterministe (hors ligne) ; l'adaptateur réseau n'est pas branché (voir Suite).

## Commandes V1 supportées

| Phrase (exemples) | Intention | Moteur qui décide | Application |
| --- | --- | --- | --- |
| « Programme-moi tous mes P1 avant la W42 » | `plan_visits`, P1, du premier jour exploitable (r38) au dimanche précédant W42 | terrain (obligation « une visite dans la période », garde V263) | ChefReliability |
| « Répartis mes Prio 1 sur les trois prochaines semaines » | idem, `distribution: spread` (tranches dans l'ordre escargot du moteur) | terrain | ChefReliability |
| « Fais-moi une semaine autour de Chambéry mardi et mercredi » | `plan_visits`, `windowDays` | terrain + V264/V185 pour la géographie | ChefReliability |
| « Évite Lyon jeudi », « Évite jeudi » | `plan_visits` sur la semaine, `forbidden` | terrain | ChefReliability |
| « Mets Valence mardi », « Ajoute Darty Annemasse vendredi » | `place_stores`, `exactDays` | planning manuel (déplacement minimal + ancre datée M1) | `addStore` |
| « … et garde Chambéry mercredi » | `keepDays` | pose datée (ou placement si absent, annoncé) | `storeRunnerPinPlannedStore` |
| « Recalcule seulement le reste de ma semaine » | `recalculate_rest_of_week` | recalcul V181 ; refus si report sur une autre semaine | `applyResult` |
| « Ne touche pas à mes rendez-vous » | information : garanti par construction | — | — |

Variantes reconnues : majuscules, accents, « prio 1 / priorité 1 / P1 », « W42 / S42 / semaine
42 [2027] », « cette semaine / la semaine prochaine / les N prochaines semaines », « mardi 13 »,
« 13/10 », « 13 octobre », « demain », formules de politesse (« Peux-tu… »), consignes de
protection et d'optimisation reconnues sans effet (« en limitant les km », « optimise les découchés »).

Désignation des magasins : enseigne, ville, adresse ; « St » = « Saint ». **Plusieurs magasins
correspondent → choix présenté** (chaque magasin + « les N magasins »), jamais deviné ; « Valence »
propose aussi « Bourg-lès-Valence ». Magasin désactivé ou introuvable → question.

## Commandes volontairement non supportées (V1)

Suppression ou retrait de visites (« supprime », « retire », « annule », « vide ») ; déplacement ou
modification de rendez-vous ; commandes négatives (« ne programme pas ») ; horaires précis
(« à 10 h », « le matin ») ; règles récurrentes (« tous les mardis » → verrou du magasin) ;
dimanche ; dates passées ; ordre de passage (« commence par ») ; formations/congés (→ Agenda) ;
réglages (objectif, maximum, découché, jours travaillés) ; P3+ ; placements sur plusieurs semaines
en une commande ; quantités (« mets 25 magasins » reste la commande historique de l'assistant).
Les commandes historiques de l'assistant (« impose », « verrouille », « exclue », « refais
jeudi », « ajoute un magasin »…) ne sont pas captées.

## Garde-fous (comment ils sont tenus)

| Garde-fou | Mécanisme |
| --- | --- |
| V264 affectation cross-day, H2 | même `buildThreeWeekSnail` + `optimizeThreeWeekCrossDay` ; parité octet pour octet avec `main` vérifiée (4 jeux de données) |
| V251 ordre intra-journée | `optimizePlan` appliqué dans la simulation comme après une génération ; jamais sur une semaine manuelle ; l'événement émis (`source: planning-command-v1`) ne relance pas V251 |
| V189 découché | décision lue au propriétaire (`StoreRunnerOvernightV182.analyze`) pour l'aperçu ; aucune réservation créée |
| M1 | ancres datées conservées, métadonnées adaptatives réécrites par `generatedArchiveEntry` ; semaine manuelle sans ancre → refus |
| RDV | refus de toute consigne qui les déplacerait ; contrôle final « 0 rendez-vous modifié » |
| verrous | refus d'un jour contraire ; contrôle final ; la commande ne retire jamais un verrou |
| visites réalisées / jours passés | journées passées identiques (sauf la règle V181 « visite ratée replacée ») ; une visite réalisée ne se déplace pas |
| jours fériés / Agenda | `StoreRunnerTerrainPlanningV1.dateBlocked` (même prédicat que la génération) |
| capacité, horaires | crédits ≤ maximum ; `scheduleRoute` : fermeture, RDV, fin de journée — nouveaux problèmes bloquants |
| exclusions, filtres | magasin exclu/hors filtres signalé, jamais planifié en silence |
| P1 / couverture | P1 = fichier performance via V263 ; garde anti-sur-visite respectée (« déjà couvert ») |
| r38 | date locale réelle ; départ = `resolveSnailStart` ; semaine consultée sans effet ; GPS frais lu sans écrire, choix explicite si la position s'écarte de plus d'1 km du départ enregistré |

## Simulation, aperçu, application

- **Simulation** : aucune écriture dans `state`, archive, période, visites, verrous, profil ;
  vérifié octet pour octet dans chaque scénario. Déterministe (mêmes données, date, intention).
- **Aperçu** : jours concernés avec `+` ajouté, `→` déplacé (jour d'origine), `−` retiré,
  `=` conservé ; magasins demandés/placés/déjà couverts ; « 0 rendez-vous modifié » ; km et minutes
  de route (mêmes estimations que le moteur) ; découché V189 ; refus et avertissements en clair.
  Aucun JSON montré. Bouton « Appliquer » désactivé si un garde-fou bloque.
- **Application** : refusée si l'aperçu est altéré (signature), a plus de 10 minutes, si la date a
  changé ou si une donnée a changé (empreinte de `state` + archive + fichier performance).
  Point de restauration `ChefReliability.checkpoint`, écriture par le propriétaire, relecture du
  planning obtenu : **toute différence avec l'aperçu ou toute erreur restaure exactement l'état
  d'avant** (`persist` de la capture). Jamais de demi-planning, y compris pour plusieurs placements.
- **Journal** : 30 dernières commandes (texte, intention résolue, issue :
  appliquée / annulée / refusée / restaurée), hors `state` et hors sauvegarde JSON.

## Extensions de propriétaires (facultatives, sans effet hors commande)

- `terrain-planning-v1.js` : `weekCount` (1–6, défaut 3) ; `requiredVisits` (obligations de
  commande, rendues dans `out.commandVisits` au lieu d'un refus global) ; `horizonEnd` transmis à
  V264 ; `runtimeSnailOptions` partagé par la génération et la simulation ; `simulateCommandWindow`,
  `generatedArchiveEntry`, `routeMetrics`. Lecture du score performance mémorisée par génération
  (mêmes valeurs ; 14,7 s → < 0,1 s mesurés sur 150 magasins avec un fichier importé).
- `profile-controller.js` : `resolvePlanningOrigin` (lecture seule) et `applyPlanningOrigin` ;
  `preparePlanningOrigin` les enchaîne avec les mêmes messages qu'avant.
- `planning-cascade-v181.js` : `build({readControls:false})` et `applyResult(result)`, publiés sur
  la fonction existante `storeRunnerRecalculateRemainingWeek` (aucun nouveau global).
- `src/chef-secteur.html` : `assistantSend` confie d'abord la phrase à
  `storeRunnerPlanningCommand` ; une commande planning n'atteint jamais `applyAIActions` de l'IA
  en ligne.
- `index.html`, `sw.js` : un module ajouté au chargement et au cache hors ligne. Moteur et feuille
  d'aperçu partagent ce fichier : le démarrage charge 75 scripts, exactement le budget figé par
  `tests/fixtures/cleanup-baseline-r20.json` (vérifié par `boot-v234-browser` et
  `priority-campaign-removal-browser`, qui lit ce budget comme plafond). Build `r39` : version.json,
  `index.html` (constante et liens `?rev=`), `manifest.webmanifest`, `sw.js`.

## Tests

| Fichier | Couvre |
| --- | --- |
| `tests/planning-command-engine.test.cjs` | A, B, C, G, H, I : 8 exemples, variantes, frontière assistant, refus, dates ISO, schéma strict, JSON de modèle, résolution et ambiguïtés |
| `tests/planning-command-simulation.test.cjs` | A–N avec les vrais propriétaires : P1, placement, évitement, RDV, verrou, visite réalisée, passé, semaine manuelle, M1, répartition, zone, recalcul, retours arrière, aperçu altéré/périmé, r38, parité génération, V189/V251, déterminisme |
| `tests/planning-command-owners.test.cjs` | contrats des extensions terrain/profil/V181, point d'entrée assistant, absence d'`innerHTML`/`eval`, cache PWA, révision publiée cohérente |
| `tests/planning-command-benchmark.test.cjs` | 150 magasins, 60 visites réelles, cross-day actif : coût par commande, déterminisme |
| `tests/planning-command-browser.spec.cjs` | O : vraie application en 390 px Android, mode IA en ligne jamais sollicité |

## Limites et risques résiduels

- Le parseur est une grammaire française locale : une formulation hors des familles ci-dessus reçoit
  une question ou rend la main à l'assistant ; rien n'est appliqué. Pas encore d'adaptateur LLM.
- « Évite X jeudi » régénère la semaine visée (comme le moteur l'aurait générée avec cette
  contrainte) : l'aperçu peut montrer d'autres déplacements que ceux de X ; l'utilisateur annule.
- Les jours fériés ne sont connus que par l'Agenda (même règle que la génération).
- Le recalcul V181 peut reporter des visites sur la semaine suivante : « seulement le reste de ma
  semaine » refuse alors l'application et renvoie vers le bouton de recalcul.
- La simulation lit le dernier cache Agenda chargé ; elle ne déclenche aucune synchronisation.
- Si la position fraîche s'écarte du départ enregistré, l'utilisateur doit choisir explicitement
  (publication dans le profil par son propriétaire) avant la simulation.

## Suite

- Adaptateur LLM : mode passerelle `planning_intent` (worker) renvoyant **uniquement** le JSON
  brut ci-dessus, consommé par `acceptModelIntent` puis `resolve` ; non branché en V1 (déploiement
  du worker requis).
- Décider si le lot justifie une nouvelle version visible (`displayVersion` 265) au moment de la
  publication ; le build `r39` garde 264.
