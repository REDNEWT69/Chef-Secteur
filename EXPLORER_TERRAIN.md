# Explorer Terrain V1

Statut : **PR Draft, non fusionnée.** Base `main` `37f01a3` (#495, V265). Build proposé
`20261004-r40-explorer-terrain-266`, version visible **V266** (Nouveautés V266).

Store Runner devient un explorateur terrain : on navigue dans le temps (semaines passées et à venir), on
parcourt ses magasins (« Mes magasins »), on ouvre une fiche Magasin 360 qui relie planning, visites, photos
et pilotage. **Aucun second propriétaire de données** : ce lot lit ce qui existe et rouvre l'écran du
propriétaire.

## Cartographie des propriétaires

| Donnée / geste | Propriétaire (inchangé) | Ce que fait Explorer Terrain |
| --- | --- | --- |
| Semaine chargée, plan, archive | `period-day-slider.js` (`state.settings.weekDate`, `state.plan`, `chef_sector_plan_archive_v1`) | ajoute une **navigation** (précédente, suivante, Aujourd'hui, calendrier) qui appelle `loadDate` — le même point d'entrée que `openDate` |
| Hiérarchie d'affichage du planning | `planning-ui-fixes.js` | range la navigation entre l'en-tête du jour et la bande des jours |
| Besoin de visite, dernière visite, échéance, prochaine date planifiée | `visit-coverage.js` (V263) | lecture seule (`needOf`, `plannedDates`) ; mêmes statuts que le Pilotage |
| Rendez-vous, heures d'arrivée imposées | `state.appointments` (noyau, `planning-manual-hours.js`) | lecture seule ; `arrivalMode` ajouté **sans effet moteur** (voir plus bas) |
| Poses (verrous), Imposé, Exclu, Actif | `range-planner-v2.js` (`storeRunnerLockInfo`), `state.included/excluded`, `store.active` | lecture seule |
| Visites, actions, opportunités | `state.businessV2` ; visites cochées `state.visits` (via V263) | lecture seule ; ouvre la visite par `StoreRunnerVisits.openVisit` |
| Contacts | `state.storeContacts` (`stores-layout-order.js`) | lecture seule |
| Photos | `StorePhotosV1` (IndexedDB) | `list(storeId)` pour le compte et la frise ; `open(storeId)` pour la galerie |
| Pilotage | `sector-pilotage.js` | `open(window,{coverage})` |
| Liste `#storeList` | `renderStores` (noyau, seul propriétaire) | appelle `StoreRunnerStoreExplorer` (filtre, tri, ligne, barre) s'il est chargé |
| Fiche magasin rapide | `#storeQuickSheet` (noyau + modules) | une section `#srStore360`, remplie par un observateur borné à la feuille |
| Refus de placement manuel | `planning-manual-visits.js` | `refusalFor` : contrainte en cause et comment la lever |

## Navigation Planning

`period-day-slider.js` expose `openWeek(±1)`, `openToday()` et `renderWeekNav()` en plus de `openDate`. Barre
`#periodWeekNavV266` : ‹ semaine › · Aujourd'hui · calendrier. Libellé : « Semaine passée · consultation »,
« Semaine en cours », « Semaine à venir », suivi de « · non générée » quand la semaine n'a aucune visite.

- Une semaine **passée** s'ouvre depuis son archive, à l'octet près : naviguer n'écrit pas l'archive d'une
  autre semaine et n'appelle jamais `generateWeek`, `ChefReliability.propose` ni le moteur terrain.
- Une semaine **sans archive** s'ouvre vide, annoncée « non générée » (message existant `periodDayNotice`).
  Elle ne se remplit que par « Générer mes 3 semaines » (action explicite).
- Le jour ouvert est le même jour de la semaine que le jour courant s'il est consultable, sinon le premier.
- Aujourd'hui un dimanche ouvre le lundi à venir (la bande ne compte pas le dimanche).

## Mes magasins

`store-explorer.js` (`StoreRunnerStoreExplorer`) ajoute au-dessus de la liste un titre, des compteurs et deux
rangées de filtres : **P1 · P2 · P3 / autres** et **À visiter · En retard · Jamais visité**. P1/P2 sont ceux du
dernier fichier performance importé (`performancePriorities`, V263) ; **P3 = tout le reste** (aucun P3 n'existe
dans le fichier). « À visiter » = jamais visité, en retard ou à revoir bientôt ; « En retard » = ratio ≥ 100 %
de la fréquence. Chaque ligne affiche statut, priorité, **dernière** et **prochaine** visite (date planifiée,
sinon échéance) et le nombre de contraintes. Un filtre de statut trie par palier métier (V263.3).

## Fiche Magasin 360

Section `#srStore360` de la fiche rapide : statut, cadence, dernière et prochaine visite, compteurs
(actions, opportunités, photos), liens **Planning · Dernière visite · Photos · Pilotage**, bloc
**Contraintes actives**, contacts, **frise** (à venir croissant, historique décroissant : visites 6P, visites
cochées, brouillon, rendez-vous, arrivées imposées, planifiée, actions, opportunités, photos par jour).

### Contraintes actives

Lues, jamais écrites (`constraintsFor`) : désactivé, exclu, imposé, pose récurrente, pose manuelle datée
(expirée si la semaine est passée), rendez-vous, arrivée imposée (avec son mode), et la **garde de couverture**
« visité récemment » (douce : un rendez-vous, une pose ou « Imposé » passent outre). Chaque ligne dit sa
force (`hard` / `soft`) et renvoie à son propriétaire.

## Refus du planning

Le refus d'un placement manuel nomme la contrainte et comment la lever (`refusalFor`) : exclu → « Réactiver
dans Mes magasins », désactivé → « Actif dans sa fiche », inconnu. Le dialogue « Ajouter un magasin » ne cache
plus silencieusement ces magasins : une recherche les montre grisés avec leur raison. Un ordre qui rend un
rendez-vous ou une arrivée imposée intenable le dit avec sa cause (trajet trop long, fermeture ou Agenda) et
renvoie `constraint:{kind,time,storeId}`. Le Command Engine n'est pas modifié.

## Auto / Flexible / Strict — préparation, sans effet moteur

`planning-manual-hours.js` expose `ARRIVAL_MODES`, `arrivalMode(entry)` et `arrivalModeFor(state,storeId,date)`.
Pas d'entrée → `auto` (l'heure est calculée). Une entrée « Horaire manuel » existante → `strict`, sans
migration : c'est ce que fait déjà l'ordonnanceur. `flexible` est un champ facultatif `arrivalMode` d'une
entrée, **écrit par aucun écran** ; `buildEntry` ne l'écrit que pour `flexible`, donc la forme des entrées
déjà saisies est inchangée. `StoreOpeningHoursV1.scheduleRoute` ne le distingue pas : il reste lu comme
imposé, et la fiche l'annonce honnêtement. Brancher le moteur sera une décision séparée.

## Préservé

V265 (Command Engine), r38/r39 (départ, semaine active), V264, H2, V189, V251, M1 : aucun fichier moteur
(`terrain-planning-v1.js`, `auto-planning-fix.js`, `planning-route-optimizer-v251.js`, `v182-fixes.js`,
`planning-cascade-v181.js`, `planning-command-engine.js`, `store-opening-hours.js`) n'est modifié.

## Décision à valider

`store-explorer.js` est un **module de démarrage supplémentaire** (76 scripts au lieu de 75, budget de
`cleanup-baseline-r20`) et une entrée de `CORE_SHELL` dans `sw.js` au-delà de `BUILD_REV` — deux cas qui
demandent un accord humain avant fusion (AGENTS.md). Alternative écartée : loger 500 lignes de lecture
transverse dans `visit-coverage.js` ou le noyau, ce qui aurait fait de la couverture le propriétaire d'écrans
qu'elle ne possède pas.

## Tests

`tests/store-explorer-v266.test.cjs` (contraintes, frise, filtres, absence d'écriture, échappement),
`tests/explorer-week-nav-browser.spec.cjs` et `tests/explorer-stores-browser.spec.cjs` (390 px), ainsi que
les contrats mis à jour : `period-day-tabs-contract` (ordre héros › navigation › bande), `planning-reorder-v254`
(cause du refus), `planning-manual-visits` (`refusalFor`), `priority-campaign-removal-browser` (76 scripts).

## Limites connues

- P1/P2 absents sans fichier performance importé : les chips affichent 0.
- Pas de test automatisé de bascule `flexible` (aucun écran ne l'écrit).
- Les photos de la frise sont groupées par jour et lues à l'ouverture de la fiche (IndexedDB, asynchrone).
- Le libellé du bouton de la barre basse reste « Magasins » (largeur 390 px) ; le titre de l'écran est « Mes magasins ».
