# Baseline fonctionnelle r20 avant ménage V1

Cette baseline part de `main` à `b4a8137628098279532565b7da5be9d4c612cf1a`, build `20260929-r20-runtime-stabilization-264`. Elle complète l’audit documentaire de la Draft PR #470 sans modifier le runtime, le state schema, le catalogue, le service worker, le manifeste ni `/v2/`.

La source machine est `tests/fixtures/cleanup-baseline-r20.json`. Les durées CPU n’y figurent pas : seules les sorties métier déterministes sont figées.

## Planning trois semaines

| Fixture | Visites | Couverts | Dus | Urgents | Jamais visités | Distance | Route | Violations | Signature |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 80 sans historique, samedi off | 38 | 38 | 38/78 | 0/0 | 38/78 | 3 626,9 km | 3 956,6 min | 0 | `4d4e2308` |
| 80 avec historique, samedi off | 33 | 31 | 29/76 | 14/16 | 1/13 | 3 806,5 km | 4 152,5 min | 0 | `dc30f653` |
| 150 avec historique, samedi on | 40 | 38 | 36/146 | 22/29 | 1/28 | 4 642,1 km | 5 064,1 min | 0 | `54837c86` |

Chaque plan complet fige magasin → semaine → journée → rang dans la journée, les trois semaines archivées, la plage et les workdays. Reliability exécute chaque fixture avec quatre ordres de magasins (`natural`, inverse, rotation de 17, hash stable) ; chaque exécution effectue encore trois replays internes. Les plans, métriques et forecasts doivent rester strictement identiques.

## Contraintes et propriétaires figés

La fixture `sector-80-saturday-off` combine dans une même génération : rendez-vous, verrou, imposé, semaine manuelle, jours passés, indisponibilité Agenda multi-jours, jour férié chevauchant, visite réalisée, magasin exclu, magasin inactif, capacité saturée, samedi désactivé et réservation découché existante. `sector-150-saturday-on` exerce en complément le samedi activé, la capacité serrée et un découché sur une semaine automatique. Le test compare l’identité des placements protégés avant/après V264, interdit les doublons et exige zéro violation.

Les protections spécialisées restent propriétaires :

- V251 transforme réellement `A → C → B` en `A → B → C`, sans sélectionner, retirer ni déplacer de magasin entre journées, et rejoue dix fois le même ordre.
- VisitCoverage garde `très en retard > jamais visité > en retard > bientôt dû > à jour`; P1 ne départage qu’un même statut. Le forecast et les non-aggravations late/never sont reliés à la baseline Planning.
- Le découché conserve les modes Automatique, Obligatoire et Jamais, les seuils/profils, les réservations et le propriétaire de rendu du bandeau.
- `saveProfile` garde exactement `V184 > V182 > owner`; dix événements planning, dix home et dix data-restored ne changent pas la chaîne, et un save déclenche exactement un rendu découché tout en conservant profil et plan.
- Agenda reste propriétaire de la borne exclusive : `2026-10-05 → 2026-10-10` bloque exactement les 5, 6, 7, 8 et 9 octobre, jamais le 10. Une journée, chevauchements, ordre inversé, hors horizon, férié et semaine entamée sont couverts.
- Trois cycles capture → archive/plage → restauration → retour applicatif conservent le plan, son ordre et les workdays à empreinte identique.

Le test de boot mobile existant mesure 75 ressources script sur r20 (76 depuis Explorer Terrain V1 : `store-explorer.js` ; 77 avec Runner Visual System V1 : `runner-visual.js`, plafond relevé d'une unité, décision explicitement validée et tracée dans `RUNNER_VISUAL_SYSTEM.md`). Ce nombre est un plafond de référence, pas un objectif après ménage : une suppression pourra le réduire, mais aucune duplication ou croissance silencieuse n’est admise. Les protections existantes de boot, PWA, migration de cache, mobile 390 px et catalogue sont référencées explicitement dans le JSON et leur présence dans Reliability est vérifiée. V269 (Runner dans le Planning) : **77 stable**, aucun script ajouté (l'adaptateur vit dans `planning-ui-fixes.js`).

## Commandes de référence

```text
node tests/cross-day-planning-v264.test.cjs
node tests/cross-day-planning-v264.test.cjs --store-order=reverse
node tests/cross-day-planning-v264.test.cjs --store-order=rotate
node tests/cross-day-planning-v264.test.cjs --store-order=stable-hash
node tests/agenda-multiday-v264.test.cjs
node tests/cleanup-baseline-r20.test.cjs
```

Les protections navigateur restent dans la suite `mobile-browser` existante, notamment boot, saveProfile, découché, PWA et mobile 390 px.

## Zones de l’audit non supprimables avec cette seule baseline

Ces zones demandent encore une preuve ciblée ou une décision produit avant suppression :

- **B5/B6 — anciens tiroirs catalogue** : les données et imports officiels sont testés, mais l’absence d’usage légal/métier de chaque ancienne surface UI n’est pas prouvée. Une décision produit et un scénario de navigation par surface restent nécessaires.
- **B7/B8 — CSS historique et doublons visuels** : la suite protège le 390 px, l’overflow et les propriétaires structuraux, pas l’identité pixel de toutes les vues, thèmes et états. Il manque des références visuelles ciblées avant une purge CSS large.
- **B10/G10 — globals et writers multiples** : les propriétaires principaux sont couverts, mais aucun inventaire ne prouve que chaque symbole global n’a aucun consommateur externe, bookmarklet ou intégration terrain.
- **G5 — ordre complet des 75 scripts** : le boot et l’inventaire sont protégés, mais tous les effets de bord d’ordre de chargement ne sont pas observables. Ne pas réordonner ou fusionner en masse sans tests d’ownership par groupe.
- **G6 — timers/focus/enforcers** : les événements r20 critiques sont couverts, mais pas toutes les combinaisons focus/visibility/timers et workdays-enforcer. Toute suppression dans ce graphe exige un test événementiel dédié.
- **G7 — états historiques non inventoriés** : les schémas pris en charge et les migrations existantes sont testés, mais les variantes réelles anciennes non cataloguées ne peuvent pas être déclarées mortes uniquement à partir de cette baseline.

Ces limites n’empêchent pas un ménage ciblé ; elles interdisent seulement de considérer toute la zone comme supprimable sans preuve supplémentaire.
