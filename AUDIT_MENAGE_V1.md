# Audit ménage V1

Audit du 29/09/2026 sur `main` = `55abf74` (V264, `BUILD_REV` `20260928-r19-cross-day-planning-264`).
**Document d'audit uniquement.** Ce lot ne modifie aucun code, ne supprime aucun fichier, ne change
pas `BUILD_REV` et ne touche pas `/v2/`. Il prolonge `V231_AUDIT_RUNTIME.md` (V230) et le met à jour pour V264.

Règle appliquée : un élément n'est déclaré mort qu'après recherche des appels directs, des globals
`window`, du HTML (y compris des `onclick` fabriqués en chaîne), des écouteurs, des callbacks, du
chargement dynamique, du service worker et des tests, **puis vérification au runtime** dans Chromium à
390 px lorsque la preuve statique ne suffisait pas.

---

## 0. Baseline et mesures

### 0.1 Tests (avant ménage)

| Suite | Résultat |
| --- | --- |
| Node Reliability (138 commandes du workflow, hors `v2/`) | **138/138 vertes** en local |
| Navigateur (`node tools/run-browser-tests.mjs`, 63 specs, 154 tests) | **153/154** en local. L'échec (`brand-opening-hours-v230-browser.spec.cjs:31`, bouton « Restaurer » introuvable) se reproduit 2/2 en local, mais **Reliability est verte sur ce même SHA en CI** (run 1297). Le flux export → import → dialogue « Restaurer » fonctionne quand je le reproduis à la main. Cause probable : environnement (Playwright 1.56.1 en local contre 1.55.0 en CI). À revérifier dans la CI de chaque lot, sans rien y changer ici. |

### 0.2 Mesures runtime (Chromium, 390 px, serveur `tools/run-browser-tests.mjs`)

| Mesure | Valeur |
| --- | --- |
| Scripts chargés au démarrage | 75 ressources script, **1,70 Mo** de JS décodé, noyau 190 Ko |
| Voile levé (`StoreRunnerBoot.settled`) | 889 ms (poste de dev, sans bridage CPU) |
| `setTimeout` posés pendant les 4,4 premières secondes | **166** (79 à 0 ms ; séries de relance 80/180/350/700/1400/2600, 120/500/1200, 150/600/1400…) |
| `MutationObserver` créés | **51** |
| Écouteurs `document` : `DOMContentLoaded` / `data-restored` / `planning-updated` / `home-rendered` / `visibilitychange` | 58 / 38 / 35 / 17 / 17 (plus 13 `focus` sur `window`) |
| Travail au repos (5 s sans interaction) | **0** (aucun `renderAll`, aucune lecture d'archive) : pas de boucle permanente |
| Retour au premier plan (`visibilitychange` + `focus`) | 0 `renderAll`, 2 `needOf` (166 évaluations de besoin), 8 lectures d'archive, 4 lectures de plage |
| « Générer mes 3 semaines », 80 magasins, sans historique | 245 ms · 3 `planning-updated` (`three-week-snail` → `snail-geo-v185` → `route-opt-v251`) · 4 `renderAll` · **30 lectures + parse JSON de l'archive** · 28 lectures de plage · 12 écritures (239 Ko) · rotation `snail-distance-geo-v185` |
| Idem, 80 magasins avec historique (cross-day V264) | 1 105 ms · 3 `renderAll` · 28 lectures d'archive · 9 écritures (336 Ko) · 732 évaluations cross-day |
| Idem, 150 magasins avec historique | 1 759 ms · 3 `renderAll` · 28 lectures d'archive · 9 écritures (**571 Ko**) · 1 032 évaluations · 2 876 évaluations de besoin |
| Chaîne d'enveloppes sur `generateThreeWeekSnail` | `v184 > v185 > v248 > moteur` (stable, pas de réempilement) |
| **Chaîne d'enveloppes sur `saveProfile`** | **7 couches au lever du voile, 11 à +3,5 s, puis +2 couches par événement** : 31 après 10 `planning-updated`, 51 après 10 `home-rendered`, 71 après 10 `data-restored`. **Un seul appel** à `saveProfile` avec 72 couches déclenche **36 rendus du bandeau découché** et 105 `JSON.stringify` du planning. Fuite non bornée sur la durée d'une session (voir G1). |
| Jours bloqués, congé « Congés » du lundi 05/10 au vendredi 09/10 (événement sur toute la journée, fin exclusive le 10) | `StoreRunnerTerrainPlanningV1.dateBlocked` → `[true,false,false,false,false]` ; `calendarEventsForDate` (propriétaire Agenda) → `[true,true,true,true,true]`. **Le moteur 3 semaines V264 ne bloque que le premier jour d'un événement sur plusieurs jours** (voir G2). |

Scripts de mesure : hors dépôt (scratchpad de session). Ils se rejouent avec Playwright sur `--serve`.

---

## 1. Cartographie d'architecture

### 1.1 Graphe simplifié

```
index.html (bootloader)
 ├─ moteur de stockage V256 (IndexedDB → window.__chefStorage, synchrone en mémoire)
 ├─ register sw.js  ·  fetch src/chef-secteur.html  ·  patch usableStorage + branding (String.replace)
 └─ document.write(noyau + injections) :
     <head>  runtimeScopeShim · assistantUiShim · glass-theme.css
     <body>  voile · store-runner-visit-model.js · reliability-core.js
             [noyau : scripts v35-premium / v36-crm / v37-apple-planning / google-calendar]
     </body> calendarOauthShim (54 modules) · v184RuntimeShim · connection-ui · regionUi (8)
             · reliability-ui · visits.css · visit-store · visits · opportunities · proofreader · slack
             à la demande : cuisiniste ×3 (assistant-visit-context), visit-report-ai-json (ai-gateway-config)

modules métier ─► moteur planning ─► rendu ─► persistance
 VisitCoverage (besoin)        terrain-planning-v1 (3 sem., cross-day)   noyau renderAll/renderWeek   ChefReliability.capture/persist
 visit-counting (crédits)      └ enveloppé V184 › V185 › V248            planning-ui-fixes (hiérarchie) state (sector_planner_universal_v1)
 store-opening-hours (horaires)range-planner-v2 (semaine/période V211)   timeline-end-times, pro-plus  archive chef_sector_plan_archive_v1
 calendar-oauth (Agenda)       planning-cascade-v181 (recalcul)          period-day-slider, summary     plage  chef_sector_range_v1
 planning-day-origin (départ)  V251 (ordre intra-jour, sur événement)    auto-planning-fix (découché)   manualWeekEdits
 performance-data-v190 (P1/P2) planning-manual-visits (gestes manuels)   visit-coverage (bloc)
```

Déclenchement réel d'une génération 3 semaines : clic → `planning-generation-controller.js#generateThreeWeeks`
→ `api.generateThreeWeekSnail` (V184 : drapeau → V185 : drapeau + `persistSnailGeography` → V248 : amorçage matrice routière → moteur)
→ moteur persiste + `planning-updated{reason:'three-week-snail'}` → V185 réécrit les rapports + `planning-updated{source:'snail-geo-v185'}`
→ **V251 ne s'active que sur cette source** → `finalizeRange` + `planning-updated{source:'route-opt-v251'}`.

### 1.2 Modules prioritaires

| Module | Responsabilité réelle | Responsabilité documentée | Appelé par | Appelle | État |
| --- | --- | --- | --- | --- | --- |
| `terrain-planning-v1.js` | allocation magasin → jour sur 3 semaines, cross-day V264, rapports (découché, horaires, diagnostics), bouton « Commencer par ici » | idem | contrôleur (bouton principal), V184/V185/V248 (enveloppes), V251 (`analyzeOvernightWeeks`, `refreshThreeWeekDiagnostics`) | VisitCoverage, `ChefReliability`, `storeRunnerLockDayForWeek`, `StoreOpeningHoursV1`, V248 | **actif** ; règle jours bloqués et découché dupliquées et divergentes (C2, C3) |
| `visit-coverage.js` | besoin, statut, palier, garde `blocked`, bloc Couverture, ligne fiche | idem (V263) | terrain, V211, cascade, V185, pilotage, noyau (`storeRunnerCoverageBlockedOnDay`) | ActivityMetrics, PerformanceV190 | **actif**, propriétaire cible. `needOf` reconstruit toutes les visites à chaque appel (5 à 7 fois par génération) |
| `v182-fixes.js` (V182/V185) | V185 rééquilibrage géographique (semaine et 3 semaines), rapports finaux 3 semaines, **émission `snail-geo-v185` qui déclenche V251**, période partielle, raccourci Pilotage, enveloppes découché/profil | « fiabilisation terrain » | enveloppe les générateurs ; écoute 5 événements + 3 timers | VisitCoverage, terrain, V189 | **doublon + propriétaire ambigu** : sous V264 cross-day, le rééquilibrage est sauté mais le module reste le déclencheur caché de V251 (D1) |
| `planning-route-optimizer-v251.js` | ordre intra-journée, finalisation semaine/plage, rapports recalculés | idem | événement `planning-updated` (`snail-geo-v185`, `generateWeek`), cascade (`explainOptimization`) | V189 (via `StoreRunnerOvernightV182`), terrain | **actif**, propre ; dépend d'une source d'événement émise par V185 |
| `range-planner-v2.js` (V211/V249) | semaine seule (`strictSingleWeek`), période, pose/verrou, remplacement d'un magasin, besoin V211 | générateur de période stable | contrôleur `generateWeek`, noyau, assistant, bouton période | VisitCoverage (garde seulement), PerformanceV190 | **actif** ; recalcule son propre besoin (C1) |
| `planning-cascade-v181.js` | recalcul du reste de la semaine (propriétaire effectif) | idem | bouton Recalculer (via global) | VisitCoverage, V251 | **actif** ; écrase les globals du contrôleur à DCL/load/restore/visibilité |
| `planning-generation-controller.js` | bouton principal 3 semaines, propriétaire `generateWeek`, statut | idem + recalcul | clics, noyau | terrain, `storeRunnerGenerateSingleWeek` | **actif** ; contient ~150 lignes de recalcul **mortes** (B1) |
| `auto-planning-fix.js` (V189) | crédits par magasin, découché futur (décision + rendu `#overnightBox`), réservation hôtel, application auto de `ChefReliability.propose` | idem | événements, noyau (`openStore`/`saveStore` enveloppés) | visit-counting | **actif**, propriétaire du découché affiché |
| `planning-day-origin.js` | départ réel d'une journée après découché | idem | timeline, V251 (`originFor`) | `state.hotelReservations` | **actif**, propre (API pure, 0 écouteur) |
| `priority-campaign-v187.js` (V188) | campagne ponctuelle « Priorités services » | idem | écouteurs planning | — | **clairement mort** (A4) |
| `route-polish.js` (V210/V248) | carte/itinéraire, matrice routière OSRM (`roadMinutes`, `routeCost`), qualité V210 | idem | V251, horaires, noyau | OSRM (hors localhost) | **actif** ; `roadMinutes` V248 bien installé (le `roadMinutes` du noyau est privé à `v37-apple-planning-js`) |
| `daily-capacity.js` | champ « Capacité par jour » + objectif hebdo ; **filet crédits** | idem | événements | visit-counting | actif ; filet crédits redondant (B4) |
| `visit-counting.js` | crédits, durées, stats d'archive | idem | tous moteurs | — | **actif**, propriétaire |
| `planning-ui-fixes.js`, `timeline-end-times.js`, `period-day-slider.js`, `planning-pro-plus.js`, `planning-summary-v219.js` | rendu planning | rendu | événements, observers | calculs locaux (trajet, fréquence) | actifs ; recalculent des règles métier pour l'affichage (C5, C6) |
| `index.html` shims | `runtimeScopeShim` (5 fonctions métier globales), `v184RuntimeShim` (masque GPS, enveloppe escargot, enveloppe `saveProfile`), `assistantUiShim` (CSS) | bootloader | — | — | **compat historique** ; `v184RuntimeShim` provoque la fuite G1 |
| `sw.js` / `version.json` / manifeste | précache `CORE_SHELL` obligatoire par révision, navigation réseau d'abord avec délai de 4 s | idem | navigateur | — | actif ; suffixe `-capacity2612` historique (B9) |
| `region-stores.js` | **API** `RegionStores` (commit, duplicate, complete…) + ancien dialogue « Ajouter une région » + scan Overpass | ajout de magasins par région | `store-add-v261`, `official-catalog` | Overpass | API active ; **UI morte** (bouton retiré au runtime, B6) |
| `national-sectors.js` + `boulanger-national.js` | `loadCatalog` (lu par `sector-admin`) + ancien dialogue « Secteur national » | mode national | `sector-admin.js#catalog` | `data/official-stores.json` | API active ; **UI morte** (bouton `display:none`, B5) ; 13 Boulanger codés en dur (D6) |

Les 75 fichiers `.js` racine (hors `sw.js`) sont tous chargés, statiquement ou à la demande : **aucun fichier JS n'est orphelin**. Le code mort se trouve *à l'intérieur* des modules.

---

## A. Suppressions sûres

| # | Élément | Raison | Preuve | Tests couvrants | Risque |
| --- | --- | --- | --- | --- | --- |
| A1 | `store-runner-logo.jpg` (racine) | plus aucun usage depuis V260 | aucune référence dans `index.html`, le manifeste, le noyau, les modules ou `sw.js` (grep ; `tests/pwa-cache-contract.test.cjs:28`) | `pwa-cache-contract`, `twa-manifest-icons` | nul (pas en cache, pas chargé ; 404 pour un lien externe éventuel) |
| A2 | `status-home-after.png`, `status-plan-after.png`, `status-plan-before.png` | captures d'écran d'un ancien rapport | aucune référence dans le dépôt (fichiers, tests, documentation) | — | nul |
| A3 | branche `terrainSnailBtn` de `v184RuntimeShim#patchThreeWeeks` (`index.html:384`) | le bouton n'existe plus depuis V239 | `terrain-planning-v1.js:985` le retire ; runtime : `#terrainSnailBtn` absent ; `terrain-planning-browser.spec.cjs:58` et `planning-three-week-default-v239-browser.spec.cjs:164` exigent 0 | ces deux specs ; **à adapter** : `v182-field-fixes.test.cjs:29`, `terrain-planning-runtime.test.cjs:39` (ils figent le code mort) | nul ; touche `index.html` → bump `BUILD_REV` dans le lot |
| A4 | `priority-campaign-v187.js` (600 lignes, 28,5 Ko) | campagne ponctuelle échue et vide | `CAMPAIGN.dueDate='2026-09-22'` codé en dur, `targets:[]`, aucune UI n'écrit `settings.priorityCampaignTargets` ; runtime : `targets 0`, `active false`, `expired true`, `apply()` → `no-targets`, `#priorityCampaignV187` absent ; `StoreRunnerPriorityCampaignV187/V188` sans consommateur ; la source `single-week-geo-v185` n'a pas d'autre écouteur | **à adapter** : `priority-campaign-v187.test.cjs` (retirer), `v182-field-fixes.test.cjs:16,21`, `terrain-planning-runtime.test.cjs:21,26,28` (chaînes d'ordre de chargement) | faible : retrait de `index.html` **et** de `CORE_SHELL` (sinon l'installation du SW échoue). Changement de `sw.js` au-delà de `BUILD_REV` → **accord humain requis** (AGENTS.md) |
| A5 | `planning-pro-plus.js:98` : `const old=document.getElementById('planningProPlus');if(old)old.remove()` | nettoyage d'un id qui n'est plus jamais créé | aucun créateur de `#planningProPlus` dans le dépôt ; le module crée `#planningProTop`/`#planningProMonth` | `period-day-tabs-contract`, specs planning | nul |
| A6 | `window.StoreRunnerV184` (`index.html`) | API de diagnostic sans consommateur | 0 référence hors définition, 0 test | — | nul (voyage avec B2) |

---

## B. Suppressions après protection supplémentaire

| # | Élément | Test manquant | Risque | Action requise |
| --- | --- | --- | --- | --- |
| B1 | `planning-generation-controller.js` : `buildRemainingWeekPlan`, `recalculateRemainingWeek`, `persistManualWeek`, `insertRecalculateButton` (garder `overnightStatusSuffix` et `refreshOvernightDecision`, utilisés par `generateWeek` l.410-423 et par V251/V188), helpers réservés au recalcul (`visitedOn`, `lockDayForWeek`, `appointmentDayForWeek`, `eventBlocksPlanning`, `dateBlocked`, `planningCredit`, `routePlanningCredits`, `actualRouteCredits`, `fixedCapacityError`, `candidateName`), exports l.456-457 | test runtime : après `load`, `storeRunnerRecalculateRemainingWeek` et `__storeRunnerBuildRemainingWeekPlan` sont ceux de la cascade (constaté : `recalc`/`build`) ; test qui charge le contrôleur **seul** et vérifie qu'il n'expose plus de recalcul | faible : la cascade écrase ces globals sans condition (`planning-cascade-v181.js:253`) à DCL/load/restore/visibilité ; fenêtre théorique avant DCL, sans bouton cliquable sous le voile | adapter `planning-recalculate-rest.test.cjs` (concatène les deux sources) et `planning-three-week-default-v239.test.cjs` |
| B2 | enveloppe V184 sur `generateThreeWeekSnail` (`patchThreeWeeks`, `v184Wrapped`) | test qui vérifie `__storeRunnerPlanningGenerationActive===true` pendant l'appel du moteur (lu seulement par `calendar-oauth.js:127`) | faible **tant que V185 existe** : V185 (`v182-fixes.js:213`) pose déjà le même drapeau, sous V184 | adapter `v182-field-fixes.test.cjs:27-28`, `terrain-planning-runtime.test.cjs:37-38`. Si V185 disparaît un jour (D1), le drapeau doit passer au contrôleur ou au moteur |
| B3 | `v182-fixes.js` : `renderOvernightV182`, `wrapOnce('overnightCandidate')`, `wrapOnce('renderOvernight')` | spec qui vérifie qu'après boot + événements `renderOvernight`/`overnightCandidate` sont ceux de V189 (constaté : `__v189FutureOnly`) et `StoreRunnerOvernightV182.analyze===futureOvernightAnalysis` | faible : V189 remplace l'API et pose `__v182Wrapped` pour neutraliser ces enveloppes. **Garder `overnightAnalysis`** (utilisé par `terrainOvernightRow`, voir C3) | `overnight-render-owner-v263-5` couvre en partie ; ajouter l'assertion d'identité |
| B4 | `daily-capacity.js:8-17` `bindPlanningCreditsToUserLimit` (et ses rappels l.66, 96-97) | test : `storeVisitCredit(s)===StoreVisitCounting.credit(s)` sans ce module | nul fonctionnellement : `visit-counting.js:77` fait déjà `planningVisitCredit=visitCredit` (V261.2) ; le « filet pour sessions déjà chargées » est caduc depuis V260 (SW : jamais de mélange de révisions) | adapter `visit-credits-planning.test.cjs:16` |
| B5 | `national-sectors.js` : `install()` (bouton `#nationalSectorBtn` + dialogue) | spec : `#nationalSectorBtn` absent/caché et aucun autre ouvreur | faible : runtime `display:none` (masqué par `sector-admin.js:49`). **Garder** `ChefNationalSectors.loadCatalog` (lu par `sector-admin.js:23`) | vérifier l'absence d'accès mobile ; adapter les tests `sector-admin` si besoin |
| B6 | `region-stores.js` : dialogue « Ajouter une région », `osmRows`/`query`/`parseOSM` (scan Overpass) ; `region-fetch-resilience.js` entier (enveloppe globale de `window.fetch` pour Overpass) ; `stores-layout-order.js` : `regionBrands()` et code `.regionDialog` | spec : `#regionDiscover` absent (constaté) et aucun autre ouvreur du dialogue (le `<dialog class="regionDialog">` est créé mais inaccessible) | moyen : **décision produit/légale** — `confidentialite.html` cite Overpass et `privacy-policy-public.test.cjs:21` l'exige. **Garder l'API `RegionStores`** (commit, duplicate, complete, normalize), qui est le seul chemin d'écriture | lot séparé, avec mise à jour de la page de confidentialité validée par Leia |
| B7 | `visual-refresh-v1.js` : 7 écouteurs (focus, visibilité, planning, restore, range, clic onglets) qui relancent un `ensureCss` idempotent et `polishLabels` | capture visuelle à 390 px avant/après | faible ; relances inutiles | fusion de la feuille dans `glass-theme.css` ; `polishLabels` au propriétaire Agenda |
| B8 | `map-layer-fix.js` (feuille de style injectée seulement) | capture carte et assistant à 390 px | faible | fusion dans `glass-theme.css` ; retrait de `index.html` + `CORE_SHELL` (accord humain) |
| B9 | `sw.js:2-5` : suffixe `-capacity2612` et commentaire « Le BUILD_REV reste V261 » | `pwa-update-v260` (déjà là) | nul fonctionnellement (le nom change déjà à chaque bump) | `sw.js` au-delà de `BUILD_REV` → accord humain ; à grouper avec A4 |
| B10 | globals sans consommateur (0 référence hors définition, y compris HTML et tests) : `StoreRunnerGeographicV249`, `storeRunnerPlannedStoreIsPinned`, `storeRunnerEnsureUnifiedPlanningUi`, `storeRunnerVisitAssistantAnswer`, `storeRunnerVisitAssistantContext`, `storeRunnerCheckAssistantHealth`, `chefSecteurCalendarPlanningBlock`, `chefSecteurInstallGoogleDisclosure`, `chefSecteurStoreOpeningWindow`, `storeVisitStoresForPlan` | test « surface publique » qui liste les globals attendus | faible : utilisables depuis la console pour diagnostic | décision : les garder comme API de debug documentée, ou les retirer en bloc |
| B11 | noyau `src/chef-secteur.html` : `saveProfile`, `overnightCandidate`, `renderOvernight` du noyau (remplacés sans rappel de l'original par `profile-controller.js:266` et V189), branche `chefSecteurEnforceBlockedDays` de `generateWeek` (inatteignable : `storeRunnerGenerateSingleWeek` toujours installé) | tests d'identité sur le profil et le découché | moyen : toucher le noyau | **uniquement** dans un lot d'extraction du noyau |

---

## C. Doublons à consolider

| # | Sujet | Copies constatées | Propriétaire cible | Migration nécessaire |
| --- | --- | --- | --- | --- |
| C1 | **Besoin / priorité / fréquence** | `visit-coverage.js` (`intervalDays`, `evaluate`, paliers) ; `range-planner-v2.js:61-116` (`storeIntervalDaysV211`, `visitDateV211`, `planningNeedV211` : palier + score) ; `planning-cascade-v181.js#needOrder` ; `route-polish.js` (`overdue`/`lateness` V210) ; `planning-pro-plus.js:24` et `planning-summary-v219.js:50` (fréquence → jours **différente** : « bimensuel » = 14 j contre 15 j, « trimestriel » = 30 j contre 90 j) ; noyau `freqDays` | `StoreRunnerVisitCoverage` | V211 lit aussi `store.lastVisit` et `completedVisitsFor` (performance), que Coverage ne compte pas : **aligner change le classement**. Étape 1 sans effet : exposer `Coverage.intervalDays` et faire lire pro-plus/summary (corrige un écart d'affichage : décision Leia). Étape 2 : V211 dérive palier et échéance de Coverage, en gardant son score (stratégie, P1/P2) |
| C2 | **Jours bloqués (Agenda)** | 7 listes de mots-clés : `calendar-oauth.js` (propriétaire : `eventCoversDate`, plages déduites), `terrain-planning-v1.js:62`, `range-planner-v2.js:410`, `planning-generation-controller.js:98`, `planning-cascade-v181.js:33`, `priority-campaign-v187.js:237`, `v182-fixes.js:82`. « Fériés » reconnus seulement par terrain et V185. **Terrain lit `state.calendarEvents` par date de début uniquement** | `calendar-oauth.js` (`calendarEventsForDate` + règle `planningBlock`) | **changement de comportement** (voir G2) : décision produit avant tout lot. Puis une fonction unique `storeRunnerDateBlocked(date)` lue par tous les moteurs |
| C3 | **Découché** | `auto-planning-fix.js#futureOvernightAnalysis` (décision affichée, jours futurs) ; `v182-fixes.js#overnightAnalysis` (rapport 3 semaines) ; `terrain-planning-v1.js:600 overnightForPlan` (**`Number(x)\|\|80` : un seuil 0 redevient 80**, pas de minimum de 20 km en mode Obligatoire, pas de règle des 55 km) ; `priority-campaign` ; noyau `overnightCandidate` | `auto-planning-fix.js` (V189), ou un module découché dédié | le rapport 3 semaines est écrit **3 fois par génération** (terrain → V185 → V251), le dernier écrit l'emporte (V251 via V189). Unifier sur V189 en ajoutant un mode « toutes dates » pour le rapport |
| C4 | **Crédits de visite** | `visit-counting.js` (propriétaire) + réimplémentations de repli : terrain, V211, V185, cascade, contrôleur, manual-visits, V189 ; surcharge par `daily-capacity.js` | `visit-counting.js` | B4, puis retrait des replis quand le module est garanti chargé (`CORE_SHELL`) |
| C5 | **Temps de trajet / km** | formule `km×1.22/55` recopiée ≈10 fois (terrain ×3, V251, horaires, route-polish ×3, V211 ×3, pro-plus, summary, reliability-core ×2, `runtimeScopeShim`) ; noyau privé `roadMinutes` = `hav×1.25/55` ; V248 (matrice OSRM) | `route-polish.js` V248 (`roadMinutes`, `routeMetrics`) | brancher les replis sur `StoreRunnerRoadMatrixV248.leg` ; la timeline du noyau reste sur sa formule privée (écart visible possible entre la timeline et V251) |
| C6 | **Verrou / RDV / visite réalisée par date** | `lockDay*` ×7, `appointmentDay*` ×7, `visitedOn*` ×6 | verrou : `range-planner-v2.js` (`storeRunnerLockDayForWeek`, déjà délégué) ; RDV : noyau `state.appointments` ; visite : `StoreRunnerActivityMetrics.completedVisitDays` via Coverage | publier `storeRunnerAppointmentDayForWeek` et `Coverage.visitDays` ; remplacer les copies |
| C7 | **Recalcul de la semaine** | `planning-generation-controller.js` (mort) + `planning-cascade-v181.js` (actif) | cascade | B1 |
| C8 | **Génération d'une semaine** | noyau `generateWeek` (repli inatteignable), `range-planner-v2#strictSingleWeek` (actif) enveloppé V185 > V248, contrôleur (`generateWeek` propriétaire) | contrôleur + V211 | B11 |
| C9 | **`saveProfile`** | noyau (mort), `profile-controller.js` (propriétaire, écrit `parseFloat(pSaving)\|\|80`, **0 → 80**), V182 `wrapOnce` (recorrige 0 **après** l'appel, faux si géocodage asynchrone), V184 (restaure le planning) | `profile-controller.js` | corriger le seuil 0 et la neutralité planning chez le propriétaire, puis retirer les deux enveloppes (supprime la fuite G1) |
| C10 | **Persistance archive** | écritures directes de `chef_sector_plan_archive_v1` par terrain, V185, V251, V211, cascade, `workdays-enforcer`, manual-visits, contrôleur (mort) ; 28-30 lectures + parse par génération | `ChefReliability` (capture/persist) | lot perf : cache d'archive par tâche, invalidé à l'écriture |
| C11 | **Rendu planning** | `renderAll` appelé par 25 modules ; 3-4 par génération ; `planning-pro-plus` réinstalle son DOM sur mutations de `#dayTabs`/timeline | noyau `renderAll` + `planning-ui-fixes.js` (hiérarchie) | un seul rendu en fin de génération ; `planning-updated` terminal unique |

---

## D. Éléments à conserver (avec justification)

| Élément | Pourquoi il paraît vieux | Pourquoi il reste |
| --- | --- | --- |
| `v182-fixes.js` (V185) | numéro V182, rééquilibrage sauté sous cross-day | **seul émetteur de `snail-geo-v185`, donc seul déclencheur de V251** sur 3 semaines ; rééquilibrage encore actif quand il n'y a aucun historique réel (`crossDayEnabled:false`, constaté : `snail-distance-geo-v185`) ; période partielle ; raccourci Pilotage (D1) |
| `planning-cascade-v181.js` | V181 | propriétaire effectif du recalcul |
| `auto-planning-fix.js` (V189) | nom « fix » | propriétaire du découché affiché, des crédits par magasin, de la réservation d'hôtel, et de l'application auto de `propose` |
| `range-planner-v2.js` | nom « v2 » (sans lien avec `/v2/`) | semaine seule, période, pose, verrous (`storeRunnerLockDayForWeek` lu par tous) |
| `route-polish.js` | nom « polish » | matrice routière V248, `routeCost` V210, carte |
| `v184RuntimeShim` : `hideGpsFields`, `patchProfileSave` | shim | masque le GPS interne et protège le planning à l'enregistrement du profil ; à déplacer (C9), pas à supprimer |
| `runtimeScopeShim` | shim | publie 5 fonctions du noyau utilisées par les modules |
| correctifs `usableStorage` et branding dans `index.html` | `String.replace` | branchent le stockage V256 et le nom produit ; le boot échoue volontairement s'ils ne s'appliquent pas |
| `daily-capacity.js` (champ capacité/objectif) | petit module | seul écran de réglage de `maxVisitsPerDay`/`target` |
| `workdays-enforcer.js` | petit module | vide les jours non travaillés du plan et de l'archive (mutation silencieuse au `focus` : à déplacer, pas à supprimer) |
| `boulanger-default-hours.js`, `store-opening-hours.js` | V1 | horaires (propriétaire unique) |
| modules cuisiniste ×3, `visit-report-ai-json-v225.js` | absents de `index.html` | chargés à la demande (`assistant-visit-context.js:60-84`, `ai-gateway-config.js:4-18`), avec `?rev=` |
| `boulanger-national.js` | liste codée en dur | fusionnée dans le catalogue de « Gérer mon secteur » (`sector-admin.js:23`) ; à confronter au carnet #467 (D6) |
| `region-stores.js` (API) | dialogue mort | `RegionStores.commit`/`duplicate` = seul chemin d'écriture de l'ajout de magasins |
| `oauth-home.html`, `privacy.html`, `terms.html`, `confidentialite.html`, `googlef39ef2afcbf19d11.html` | non chargés par l'app | validation Google OAuth, Search Console et Play ; protégés par des tests |
| `android/` | hors runtime | enveloppe TWA |

Refactors préalables à toute suppression (classe D) :
- **D1** V185 : faire émettre par le moteur (ou le contrôleur) un événement terminal explicite qui déclenche V251, puis réduire V185 au repli sans historique.
- **D2** Découché : C3.
- **D3** Jours bloqués : C2 (décision produit d'abord).
- **D4** Besoin V211 : C1.
- **D5** `saveProfile` : C9.
- **D6** `BOULANGER_NATIONAL_STORES` : 13 fiches approximatives (« Zone Commerciale ») fusionnées au catalogue de `sector-admin` ; le dédoublonnage enseigne + ville + adresse laisse passer des doublons avec le carnet officiel. Décision du chantier catalogue.

---

## E. Ordre recommandé des lots Codex

Chaque lot : branche depuis `main`, bump `BUILD_REV` si `index.html`/`sw.js`/runtime changent, Reliability verte, 390 px, et **identité fonctionnelle** avant/après (section 7).

| Lot | Contenu | Touche | Accord humain |
| --- | --- | --- | --- |
| **L0** | **Baseline ménage** : tests d'identité (section 7) sans aucun changement runtime | tests seulement | non |
| **L1** | Fichiers orphelins : A1, A2 | fichiers statiques | non (aucun runtime) |
| **L2** | Correctif de la fuite `saveProfile` (G1) : garde de chaîne commune V184/V182 (`__v184Original`/`__v182Original` suivis par les deux), test de non-croissance | `index.html`, `v182-fixes.js`, bump | non (fiabilité, sans effet métier) |
| **L3** | Fallbacks morts sûrs : A3, A5, A6, B2, B4 | `index.html`, `daily-capacity.js`, tests, bump | non |
| **L4** | Recalcul mort du contrôleur : B1 | contrôleur, 2 tests, bump | non |
| **L5** | Campagne morte + nettoyage SW : A4, B9 | `index.html`, `sw.js`, tests, bump | **oui** (`sw.js`) |
| **L6** | Enveloppes découché V182 mortes : B3 | `v182-fixes.js`, bump | non |
| **L7** | Déclencheur V251 explicite (D1), rapports 3 semaines écrits une seule fois (C3, partie rapport) | terrain, V185, V251, bump | non ; revue Claude |
| **L8** | Perf : cache d'archive par tâche (C10), un seul `renderAll` et un seul `planning-updated` terminal par génération (C11) | moteurs, bump | non |
| **L9** | CSS : B7, B8, `assistantUiShim` vers `glass-theme.css` | CSS, `index.html`, `sw.js`, bump | **oui** si `sw.js` change |
| **L10** | UI mortes catalogue : B5, B6 (+ confidentialité) | modules région/national, page légale | **oui** (confidentialité) |
| **L11** | Consolidations métier C1/C2/C5/C6 | moteurs | **décision Leia** (changements de comportement) |
| **L12** | Docs : `ARCHITECTURE_CLEANUP_STATUS.md`, `V231_AUDIT_RUNTIME.md` (visit-model/reliability-core sont en tête de `<body>`, pas dans `<head>` ; `visit-report-ai-json` se met en cache à la première utilisation en ligne via `ownRevisionAsset`), renommage de `calendarOauthShim` (avec un lot qui bumpe déjà) | docs (+ `index.html`) | non |

---

## F. Liste DO NOT DELETE

1. `v182-fixes.js` tant que D1 n'est pas fait : **retirer V185 éteint V251 sur la génération 3 semaines, sans erreur visible.**
2. Le drapeau `__storeRunnerPlanningGenerationActive` : lu par `calendar-oauth.js:127` (Agenda en cache pendant la génération, jamais d'OAuth).
3. `planning-cascade-v181.js#install` et ses réinstallations : ce sont elles qui rendent le recalcul du contrôleur mort.
4. `auto-planning-fix.js#installAutoApply` : sans lui, `ChefReliability.propose` rouvre la confirmation de `reliability-ui.js`.
5. `range-planner-v2.js` (verrous, `strictSingleWeek`, `generatePlanningRange`, remplacement de magasin).
6. L'API `RegionStores` et `ChefNationalSectors.loadCatalog`.
7. Les chargements à la demande (cuisiniste ×3, `visit-report-ai-json-v225.js`).
8. Les correctifs `usableStorage` / branding et le bloc `STORAGE-ENGINE` d'`index.html` (testé tel quel).
9. `runtimeScopeShim` (5 fonctions globales) et `hideGpsFields`.
10. Toute entrée de `CORE_SHELL` d'un fichier encore chargé ; `OPTIONAL_SHELL` (`data/official-stores.json`).
11. `planning-day-origin.js`, `visit-coverage.js`, `terrain-planning-v1.js`, `planning-route-optimizer-v251.js`, `visit-counting.js`, `store-opening-hours.js`, `planning-manual-visits.js`.
12. Les clés de stockage historiques (`sector_planner_universal_v1`, `chef_sector_plan_archive_v1`, `chef_sector_range_v1`, `store-runner-cuisiniste-contracts-v193`…) et les champs de `state` hérités (`visits[id].history`, `locks` chaîne ou objet, `manualWeekEdits` date ou objet) : ils sont lus par les restaurations de vieilles sauvegardes.
13. Les pages légales et de vérification.

---

## G. Risques invisibles

- **G1 — Fuite de `saveProfile` (constatée).** `v184RuntimeShim#patchProfileSave` ne suit que `__v184PlanNeutral` sur la fonction de tête, et `v182-fixes.js#wrapOnce` que `__v182Wrapped` : chacun enveloppe l'autre à chaque `planning-updated`, `home-rendered` ou `data-restored`. Mesure : +2 couches par événement, 72 couches après 30 événements ; un enregistrement du profil fait alors 36 rendus du découché et 105 sérialisations du planning. Sur une journée terrain (des centaines d'événements), la chaîne grossit sans limite : latence croissante à l'enregistrement du Secteur et, à terme, risque de dépassement de pile. **À corriger avant tout ménage (L2).**
- **G2 — Événements Agenda sur plusieurs jours (constaté).** `terrain-planning-v1.js#dateBlocked` ne regarde que la date de début : un congé du lundi au vendredi ne bloque que le lundi dans la génération 3 semaines V264, alors que le propriétaire Agenda bloque les 5 jours. Le moteur ne voit pas non plus les plages « déplacement Paris » déduites. Unifier la règle **corrige** ce défaut mais **change** le planning : décision Leia, lot dédié, pas dans le ménage.
- **G3 — Cache PWA.** `CORE_SHELL` est obligatoire : supprimer un fichier sans le retirer de `CORE_SHELL` fait échouer l'installation du nouveau SW, et les appareils restent bloqués sur l'ancienne version. À l'inverse, un fichier retiré des deux ne traîne pas : l'activation supprime les anciens caches `chef-secteur-*`. Une PWA installée sur l'ancienne révision continue de servir ses propres fichiers jusqu'à l'activation.
- **G4 — Tests qui figent la forme.** `terrain-planning-runtime`, `v182-field-fixes`, `boot-v234`, `build-revision` vérifient des sous-chaînes exactes d'`index.html` (ordre de chargement, code du shim). Toute suppression de module casse plusieurs assertions de texte : il faut les adapter dans le même lot, sans perdre l'intention (ordre relatif, présence en cache).
- **G5 — Ordre de chargement.** V251 après V185, cascade juste après le contrôleur, `daily-capacity` après `visit-counting`, V189 après V182 : les neutralisations reposent sur l'ordre des écouteurs `DOMContentLoaded` et les `setTimeout(0)`. Déplacer un script peut rallumer une enveloppe morte (ex. V182 découché).
- **G6 — Réinstallations par timers et `focus`.** 166 `setTimeout` au démarrage et 20+ modules qui réagissent à `focus`/`visibilitychange`. `workdays-enforcer.js` **mute `state.plan` au `focus`** sans sauvegarde. Retirer un de ces timers peut exposer une course de montage sur Android lent.
- **G7 — Vieux state.** Les replis `visitedOn*` lisent `state.visits[id].lastVisit/history` (format pré-6P), et V211 lit aussi `store.lastVisit` que Coverage ignore. Supprimer une copie sans passer par Coverage change le « jamais visité » pour d'anciens secteurs importés.
- **G8 — Seuil de découché à 0.** `profile-controller.js` et terrain transforment 0 en 80 ; seules les enveloppes V182 et V189 le rétablissent. Retirer l'enveloppe V182 avant d'avoir corrigé le propriétaire fait réapparaître le bug V185 corrigé en V263.4.
- **G9 — Événements sans `source`.** Terrain publie `planning-updated` avec `detail.reason`, les autres avec `detail.source` : un écouteur qui filtre sur `source` ignore la génération 3 semaines. Tout remplacement de l'événement V185 doit conserver le contrat `reason:'three-week-snail'` (testé).
- **G10 — Globals écrasés.** `storeRunnerRecalculateRemainingWeek`, `__storeRunnerBuildRemainingWeekPlan`, `storeRunnerGenerateSingleWeek`, `storeVisitCredit`, `openStoreQuick`, `saveProfile`, `generateWeek`, `syncGoogleCalendar`, `calendarEventsForDate` ont plusieurs écrivains : le propriétaire réel dépend du moment. Vérifier au runtime, jamais au grep seul.

---

## 7. Tests : état et baseline ménage à figer (lot L0)

**Tests qui valident du code mort ou caduc** (à adapter en même temps que la suppression) : `v182-field-fixes.test.cjs:27-33` (forme du shim V184, bouton fantôme) · `terrain-planning-runtime.test.cjs:37-39` · `visit-credits-planning.test.cjs:16` (filet de compatibilité) · `priority-campaign-v187.test.cjs` (campagne échue) · `planning-recalculate-rest.test.cjs` (concatène le contrôleur et la cascade pour tester la cascade).

**Tests redondants** : `planning-engine-benchmark-v241` et `v253` mesurent chacun une époque du moteur (sans V185 ni horaires) ; à conserver jusqu'à L7, puis à fusionner avec le benchmark V264 (`cross-day-planning-v264`, signatures `9237e415` / `5ff19c5d`).

**Baseline à figer avant le ménage** (aucun n'existe sous forme d'identité complète) :

| Scénario | Couverture actuelle | À ajouter en L0 |
| --- | --- | --- |
| Génération 80 magasins, sans et avec historique | benchmarks unitaires | spec navigateur : signature (magasins × jour × ordre) des 3 semaines + archive + plage, date figée, graine fixe |
| Génération 150 magasins | aucune | idem + budget temps (≤ 2× la mesure du 29/09) et nombre d'écritures |
| Contraintes dures (RDV, verrou, imposé, jour bloqué, capacité, Boulanger) | unitaires dispersés | un scénario combiné en navigateur |
| Cross-day | `cross-day-planning-v264` | signature après le runtime complet (V184 › V185 › V248 › V251) |
| V251 | `visit-coverage-v263-1-browser` (1 passe) | ordre final par jour dans la signature |
| Découché | V263.4/V263.5 | rapport 3 semaines (`range.overnightReport`) figé |
| Semaine manuelle | `planning-manual-week-protection`, `reorder-v254` | aucune réécriture par V185/V251 après génération |
| Reprise d'une semaine entamée | `planning-recalculate-rest` | identité du recalcul (cascade) |
| Enveloppes | `visit-coverage-v263-1-browser` (escargot) | **non-croissance** de `saveProfile`/`fillProfileForm`/`openStore`/`storeRunnerGenerateSingleWeek` après 30 événements |
| PWA | `pwa-update-v260`, `pwa-cache-contract` | inchangé |
| Mobile 390 px | suite navigateur | capture de référence : planning, fiche magasin, Données |
| Catalogue | `official_catalog_test.py`, `official-catalog-regions-v467`, `store-add-*` | inchangé |

Preuve attendue pour chaque lot : **mêmes signatures L0 avant et après**, sauf les lots explicitement fonctionnels (L11, G2).

---

## Synthèse pour Leia

- **10 suppressions les plus sûres** : A1 logo jpg · A2 trois captures png · A3 branche `terrainSnailBtn` · A5 nettoyage `#planningProPlus` · A6 `StoreRunnerV184` · B4 filet crédits de `daily-capacity` · B2 enveloppe V184 de l'escargot · B1 recalcul du contrôleur · A4 campagne V188 (accord humain car `sw.js`) · B3 enveloppes découché V182.
- **10 zones les plus dangereuses** : V185 comme déclencheur caché de V251 · fuite `saveProfile` (G1) · règle des jours bloqués (G2) · `CORE_SHELL` obligatoire (G3) · ordre de chargement et neutralisations (G5) · seuil de découché 0 → 80 (G8) · besoin V211 contre Coverage (C1) · rapport découché écrit 3 fois (C3) · `workdays-enforcer` qui mute au `focus` (G6) · shims d'`index.html` figés par des tests de texte (G4).
- **Premier lot Codex** : L0 (baseline d'identité, tests seulement), puis L2 (fuite `saveProfile`), avant toute suppression.
