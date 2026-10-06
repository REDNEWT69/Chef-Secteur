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
dernier fichier performance importé (`performancePriorities`, V263) ; la priorité est **stable jusqu'au prochain import** : « traité » est un flag de suivi, jamais une sortie de priorité (voir « Priorité P1/P2 et traité » ci-dessous) ; **P3 = tout le reste** (aucun P3 n'existe
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

### Pourquoi ce jour (V274, Planning intelligent — incrément 1)

Quand la fiche est ouverte **depuis une carte du Planning** pour un jour d'aujourd'hui ou à venir, `placementFor`
(`store-explorer.js`) explique le placement en tête de la section : d'abord ce qui **fixe le jour** (rendez-vous,
arrivée imposée, pose manuelle datée, verrou récurrent de ce jour, « Imposé » — celles d'une autre date ne comptent pas,
la plus forte ouvre le bloc), puis le **besoin de visite lu à la date de la carte** (`StoreRunnerVisitCoverage.need` avec
`ref` = cette date : jamais visité, en retard / très en retard avec les jours de retard, bientôt dû, à jour, priorité P1/P2,
2ᵉ passage attendu), et la garde « visité récemment » citée telle quelle (et dite « passée outre » quand une contrainte
explicite fixe le jour). Sans contrainte, la phrase le dit : « Aucune contrainte ne fixe ce jour ».

Règles : **des faits, pas des raisons inventées.** Aucun moteur n'est rejoué, rien n'est déduit de l'optimisation (jamais
« le plus court », « le meilleur », « optimal »), aucune trace de décision n'est écrite (`state`, archive), aucune sortie du
planning ne change. Pas d'explication sur un jour passé, pas de « pourquoi plutôt un autre jour ». Le jour de la carte
vient du noyau : `openStoreQuick(id, jour, arrivée)` publie `data-sr-day` à côté de `data-sr-start` sur `#srQuickStart`
(une ligne chez le propriétaire de la fiche, aucune fonction enveloppée) ; vide hors Planning (liste « Mes magasins »,
indicateurs), donc aucun bloc. Protégé par `tests/planning-placement-why-v274.test.cjs` (10 mutants tués) et
`tests/planning-placement-why-v274-browser.spec.cjs`. Suite du chantier : issue #517.

## Priorité P1/P2 et « traité » (correction métier, revue #496)

Un magasin P1/P2 **conserve sa priorité jusqu'au prochain fichier performance** ; « traité » est un flag de
suivi (`performance-data-v190.js`, indexé par semaine d'import, donc remis à zéro par un nouvel import), pas
une sortie de priorité. Corrigé à la source, dans chaque lecteur :

- `visit-coverage.js` : `performancePriorities` ne filtre plus les traités (`.since` = date d'import).
- `performance-data-v190.js` : `planningBoost` garde le coup de pouce d'un magasin traité ; `completedVisitsFor`
  expose `days`, `crossVisits` expose `visitsSinceImport`.
- `weekly-brief-v246.js` et `range-planner-v2.js` (V211) : le P1/P2 d'un magasin traité compte toujours.
- `assistant-performance-context-v192.js` : un P1 traité reste « à faire » tant qu'il a moins de 2 visites
  depuis l'import (la question explicite « P1 non traités » garde son sens).

**Garde V263 et SEF.** Le SEF demande au moins 2 visites pour un P1. Tant qu'un P1 a moins de
`RULES.p1MinVisits` (2) visites réalisées **depuis l'import**, la garde « visité trop récemment » cède
(`secondVisit`, « 2e passage P1 attendu ») ; dès 2 visites depuis l'import, elle reprend. Sans effet sur P2 et
sur les magasins sans priorité. Décisions validées par le propriétaire du dépôt. Test : `p1-treated-priority-v266.test.cjs`.

Comportement de planification modifié (assumé) : les P1 traités reprennent leur palier/boost, et un P1 à une
seule visite peut être reprogrammé avant la moitié de sa fréquence.

## Refus du planning

Le refus d'un placement manuel nomme la contrainte et comment la lever (`refusalFor`) : exclu → « Réactiver
dans Mes magasins », désactivé → « Actif dans sa fiche », inconnu. Le dialogue « Ajouter un magasin » ne cache
plus silencieusement ces magasins : une recherche les montre grisés avec leur raison. Un ordre qui rend un
rendez-vous ou une arrivée imposée intenable le dit avec sa cause (trajet trop long, fermeture ou Agenda) et
renvoie `constraint:{kind,time,storeId}`. Ces refus ne touchent pas le Command Engine ; son seul changement
(2e passage P1) est décrit dans « Priorité P1/P2 et traité » et « Préservé ».

## Auto / Flexible / Strict — préparation, sans effet moteur

`planning-manual-hours.js` expose `ARRIVAL_MODES`, `arrivalMode(entry)` et `arrivalModeFor(state,storeId,date)`.
Pas d'entrée → `auto` (l'heure est calculée). Une entrée « Horaire manuel » existante → `strict`, sans
migration : c'est ce que fait déjà l'ordonnanceur. `flexible` est un champ facultatif `arrivalMode` d'une
entrée, **écrit par aucun écran** ; `buildEntry` ne l'écrit que pour `flexible`, donc la forme des entrées
déjà saisies est inchangée. `StoreOpeningHoursV1.scheduleRoute` ne le distingue pas : il reste lu comme
imposé, et la fiche l'annonce honnêtement. Brancher le moteur sera une décision séparée.

## Préservé

V265 (Command Engine), r38/r39 (départ, semaine active), V264, H2, V189, V251, M1 : leur comportement est
préservé, vérifié par leurs tests (`cross-day-planning-v264`, `cross-day-overnight-h2`,
`planning-command-simulation`, V251, M1…). Aucun de ces fichiers moteur n'est modifié : `terrain-planning-v1.js`,
`auto-planning-fix.js`, `planning-route-optimizer-v251.js`, `v182-fixes.js`, `planning-cascade-v181.js`,
`store-opening-hours.js`.

**Exception : `planning-command-engine.js` est modifié, a minima, par conséquence de la règle P1.** Depuis la
règle « P1 sous 2 visites réelles depuis l'import : la garde V263 cède » (revue #496), un P1 déjà visité une
fois devient une cible éligible d'une commande comme « Programme mes P1 cette semaine ». Le moteur terrain
ne place pas toujours ce 2e passage dans la période ; sans adaptation, la commande entière était refusée
(`required_unplaced`). Le Command Engine range donc ce 2e passage parmi les passages **souhaités** :

- cible éligible avec `needOf(...).secondVisit` → suivie dans un ensemble `secondIds` ;
- si elle n'est pas placée, le code `second_visit_unplaced` est un **avertissement** (`warnings`), jamais un
  blocage : la commande reste applicable ;
- toute autre cible non placée reste bloquante (`required_unplaced`), inchangé ;
- ni l'intention JSON, ni le schéma, ni la simulation, ni l'application ne changent.

Couverture : `planning-command-simulation.test.cjs` (scénario F + G : un P1 visité une fois dans la semaine
n'est plus « déjà couvert », la commande reste applicable et ne crée aucune seconde visite dans la semaine d'une
visite réalisée). Le correctif est dans le commit `d454408`.
