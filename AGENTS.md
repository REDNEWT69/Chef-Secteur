# Store Runner — règles pour les agents de code

Ce dépôt est l’application **Store Runner**. Le dépôt historique s’appelle encore `Chef-Secteur` : ne pas renommer les clés internes ou les chemins uniquement pour harmoniser le branding.

## Avant toute modification

1. Travailler sur le `main` GitHub le plus récent, ou sur une branche créée depuis ce `main`.
2. Vérifier l’état du dépôt avant d’écrire. Ne jamais réappliquer aveuglément un ancien prototype, un ancien diff ou une branche `v3-premium`.
3. Lire au minimum `ARCHITECTURE_CLEANUP_STATUS.md` pour l'état réel, et `PLAN_METIER_STORE_RUNNER.md` pour le modèle métier cible.
4. Vérifier les PR déjà fusionnées avant de reprendre un ancien lot : **Visit + Action + workflow 6P, Opportunity, l'Espace Cuisinistes et le pilotage performance sont déjà intégrés** et ne doivent pas être recréés depuis une ancienne branche locale.
5. Conserver les fonctionnalités existantes et les données locales. Les changements doivent être progressifs et réversibles.

## Architecture à respecter

- Stack actuelle : HTML/CSS/JavaScript. Pas de migration React/Vite sans décision explicite.
- `profile-controller.js` possède le profil, le point de départ et la géolocalisation.
- `navigation-controller.js` possède les comportements de navigation ajoutés hors noyau historique, et le **premier lancement guidé par Runner** (V271) : cinq étapes (présentation, secteur, point de départ, génération des 3 premières semaines, fin), préférence `store-runner-onboarding-v1` du moteur durable (hors `state`, hors sauvegarde JSON), étape toujours **déduite de l'état réel**, utilisateurs existants protégés, jamais rejoué après avoir vidé ou régénéré son planning. Il appelle `StoreRunnerStoreAdd`, l'écran Données, `StoreRunnerProfile` / `openDepartureSettings` et `storeRunnerGenerateThreeWeeks` sans les contourner : il ne lit jamais la position lui-même (elle n'est demandée qu'au tap « Utiliser ma position » ou au clic explicite de génération), ne choisit et ne simule aucune visite et n'écrit ni `state` ni planning. Aucun script de démarrage ajouté, `sw.js` limité à `BUILD_REV`. Contrat : `RUNNER_FIRST_RUN_V271.md`.
- `calendar-oauth.js` possède `syncGoogleCalendar` et l’OAuth Google Agenda.
- `planning-generation-controller.js` possède `generateWeek`.
- `planning-ui-fixes.js` possède la hiérarchie d’affichage du planning.
- `planning-manual-visits.js` possède les modifications manuelles du planning (ajout, retrait, déplacement, ordre de passage) ; `planning-reorder-v254.js` ne possède que le geste tactile qui les déclenche.
- `planning-command-engine.js` (`StoreRunnerPlanningCommandEngine`, Lot B) possède les commandes planning en langage naturel : intention JSON stricte, résolution des magasins, simulation sans écriture par les propriétaires ci-dessus, aperçu, application après validation explicite et journal. Il ne choisit aucune visite et n'écrit jamais `state` en place ; la feuille d'aperçu vit dans le même fichier (le démarrage est au budget de 75 scripts de `cleanup-baseline-r20` : tout nouveau module de démarrage demande une décision). Une commande planning ne passe jamais par les actions directes de l'IA en ligne. Contrat : `PLANNING_COMMAND_ENGINE.md`.
- `store-runner-branding.js` ne doit gérer que le branding.
- V272 : `navigation-controller.js` possède `StoreRunnerAppearance`, la préférence UI `store-runner-appearance-v1` du moteur durable (hors `state`) et la sheet native Runner commune à l’Accueil et Plus → Apparence. `index.html` possède `StoreRunnerAppearanceBoot` et le miroir UI de démarrage appliqué avant peinture ; `home-refresh-v2.js` possède le bouton hôte. `runner-visual.js` ne possède que la réaction de présentation `react()` (240 ms, neutral uniquement, annulable et mouvement réduit respecté), jamais les préférences. Contrat : `APPEARANCE_V272.md`.
- `runner-behavior.js` (`StoreRunnerBehavior`, V273, 78ᵉ script de démarrage, chargé avant `navigation-controller.js` et précaché dans le shell obligatoire de `sw.js`) possède la **personnalité de Runner** : cinq personnalités en données (Copilote par défaut, Complice, Coach, Taquin, Discret), la décision pure de la réaction ambiante de l’Accueil, les budgets, cooldowns et l’anti-spam, et un petit registre `store-runner-runner-v1` du moteur durable (hors `state`, hors sauvegarde JSON), branché par `navigation-controller.js`, qui ajoute la section « Personnalité » **dans la feuille Apparence de V272** (aucune seconde feuille). C’est de la décision pure : ni DOM, ni timer, ni écouteur, ni lecture de `state`, ni écriture métier, ni référence à `runner-visual.js` (qui ignore ce module et ne reçoit que deux gestes génériques `react('nod')` et `react('look')`). Chaque hôte fournit ses **faits** déjà calculés par ses propriétaires (l’Accueil : tournée, carte « À traiter maintenant », visites ouvertes, dernière visite réelle) et applique la réaction qu’il reçoit : une ligne `#homeRunnerLineV273` dans le flux de l’Accueil (`textContent`, jamais flottante) et un geste. Planning (`planning-ui-fixes.js`) et Assistant (`assistant-upgrade.js`) ne lui demandent que les **titres** de leurs états métier (repli sur les titres V271) ; les états métier restent prioritaires et ne passent jamais par un budget, et une contrainte métier du Planning n’est jamais plaisantée (règle Taquin). Aucun planning intelligent, quiz, gamification ni événement propriétaire nouveau ; `touch.runner` et `day.loaded` ne sont pas branchés. Contrat : `RUNNER_PERSONALITY_V273.md`.
- `mobile-ux-v262.js` (`StoreRunnerMobileUX`) possède la coque mobile transverse : état clavier (`html[data-sr-keyboard]`), bouton retour Android (une seule entrée d'historique « sentinelle » pour refermer assistant, menu Plus, fiche magasin puis revenir à l'accueil) et retouches visuelles ≤ 700 px. Il ne lit ni n'écrit aucune donnée et ne remplace aucune fonction globale. La disposition des actions de la fiche magasin reste dans `store-runner-visits.css` ; tout nouveau bouton ajouté à `#storeQuickSheet .sheetActions` est rangé par défaut dans « Plus d'actions ».
- `visit-coverage.js` (`StoreRunnerVisitCoverage`) possède la **couverture réelle** et le **besoin de visite commun** (V263). Visite réalisée = visite 6P `completed` ou « Visité » coché (lecture de `StoreRunnerActivityMetrics.completedVisitDays`), jamais une visite planifiée ni une archive. Il donne pour chaque magasin et chaque date un statut relatif à sa fréquence (Jamais visité, En retard, À visiter bientôt, À jour, Déjà suffisamment visité, Sur-visité), un palier `tier` et une garde `blocked` (visité trop récemment pour sa fréquence). Tous les moteurs la lisent — cycle 3 semaines, semaine/période V211, recalcul en cascade, recentrage d'une journée, `regenerateDay` — et seules les contraintes explicites (rendez-vous, magasin posé/verrouillé, imposé) passent outre. Exception décidée (Explorer Terrain, revue #496) : un **P1 du fichier performance** a besoin d'au moins 2 visites depuis l'import (SEF), la garde cède donc tant qu'il en a moins ; la priorité P1/P2 est stable jusqu'au prochain import et « traité » n'en sort jamais. Il ne choisit aucun magasin et n'écrit jamais `state`. Il affiche le bloc Couverture du planning (placé par `planning-ui-fixes.js`) et la ligne couverture de la fiche magasin. Le résumé visuel (anneau, taux, restants, semaine, filtres) est le graphique existant du Pilotage secteur (`sector-pilotage.js`), qui lit ce module : ne pas créer de second tableau de bord ni de second jeu de statuts.
- `store-explorer.js` (`StoreRunnerStoreExplorer`, Explorer Terrain V1) possède la **lecture transverse d'un magasin** : filtres et ligne de « Mes magasins », fiche Magasin 360 (section `#srStore360` de `#storeQuickSheet`), contraintes actives et frise. Il **ne possède aucune donnée** et n'écrit jamais `state` : couverture et prochaine date viennent de `visit-coverage.js`, rendez-vous et heures d'arrivée de `state.appointments`, poses de `storeRunnerLockInfo`, photos de `StorePhotosV1`, navigation de `StoreRunnerPeriodDaySlider.openDate`. Il n'ajoute ni statut, ni second tableau de bord, ni registre. `renderStores` (noyau) reste seul propriétaire de `#storeList`. La navigation par semaine (précédente, suivante, Aujourd'hui, calendrier) appartient à `period-day-slider.js` et ne régénère jamais une semaine ; `planning-ui-fixes.js` la range. **« Pourquoi ce jour » (V274)** : `placementFor` explique en lecture seule, en tête de la fiche 360 ouverte depuis une carte du Planning (jour d'aujourd'hui ou à venir), ce qui fixe le jour puis le besoin de visite lu à cette date ; que des faits déjà produits par leurs propriétaires, jamais « le plus court » ni « le meilleur », aucun moteur rejoué, aucune écriture. Le noyau publie le jour de la carte (`data-sr-day` sur `#srQuickStart`). La distinction Auto / Flexible / Strict de l'heure d'arrivée est **préparée** dans `planning-manual-hours.js` (`arrivalMode`) sans effet sur l'ordonnanceur. Contrat : `EXPLORER_TERRAIN.md`.
- `store-add-v261.js` (`StoreRunnerStoreAdd`) possède l’ajout de magasins au secteur : une seule porte (« + Ajouter un magasin »), sélection multiple assistée, recherche à la demande via Nominatim, aperçu, doublons et saisie manuelle réduite. Le noyau, l’import IA et le pilotage performance l’ouvrent ; aucun autre écran n’écrit directement dans le secteur. La recherche libre individuelle Nominatim n’embarque et ne met en cache aucune base de magasins : cette règle reste inchangée. Le mode assisté de sélection multiple peut lire le carnet officiel déjà existant (`official-catalog.js` et `data/official-stores.json`) ; il ne crée ni nouveau catalogue ni nouveau chemin d’écriture, et passe toujours par `RegionStores.commit`.
- `runner-visual.js` (`StoreRunnerRunner`, alias `Runner`, Runner Visual System V1, livré en V268, étendu au Planning en V269, à l'Accueil en V270 puis au premier lancement en V271) possède la **couche visuelle du copilote Runner**, **mobile uniquement, Android d'abord** (aucune mise en page desktop, aucune requête de largeur) : personnage SVG, quatre états (`neutral`, `analyzing`, `alert`, `success`), bulle contextuelle, trois variantes natives (`bubble`, `sheet`, `panel`) et petite API de présentation (`mount`, `setState`, `showMessage`, `hideMessage`, `reset`, `unmount`, `moveTo`, `returnToRest`, `setPresence`). C'est de la présentation pure : il ne lit ni n'écrit aucune donnée, ne choisit ni ne simule aucune visite, n'est appelé par aucun moteur et ne remplace aucune fonction globale. Le propriétaire d'un écran le monte et traduit son propre résultat en état visuel, jamais l'inverse. **Il est branché dans quatre surfaces, par leurs propriétaires, et nulle part ailleurs.** L'Assistant (V268) : `assistant-upgrade.js` le monte à la première ouverture du panneau (`#srAssistantRunner`, variante `sheet`) et dérive l'état de ce que le chat montre (« ✦ Je réfléchis… », erreurs, actions appliquées, `.ai-status.bad`) par trois observateurs bornés, sans timer, sans persistance, sans modifier le Command Engine ni le noyau. Le Planning (V269) : `planning-ui-fixes.js`, propriétaire de la hiérarchie du Planning, pose `#planningRunnerV269` entre le bloc Couverture et la liste des visites (variante `bubble`, 56 px, masqué quand il n'y a rien d'utile) et y traduit des faits **déjà produits** par leurs propriétaires — le plan affiché, `StoreOpeningHoursV1.scheduleRoute` (RDV, créneau, fin estimée), `StoreRunnerVisitCoverage.forecastThreeWeeks` (magasins à surveiller, contraintes explicites), les événements publics de génération 3 semaines / recalcul / commande, le marqueur d'occupation du bouton de génération — sans second calcul de couverture, sans écriture, sans justification inventée (« trajet le plus court », « meilleur choix ») et sans conseil sur un jour passé ; Forecast, Command Engine, moteurs de planning et Explorer Terrain l'ignorent. L'Accueil (V270) : `home-refresh-v2.js` monte Runner près du titre de la journée et joue une seule entrée (`moveTo(..., { entrance: 'peek' })`, `RUNNER_MOVEMENT_V270.md`) ; elle est **gardée pour la fermeture du guide** de premier lancement (`store-runner:first-run-closed`) et jamais jouée dessous. Le premier lancement (V271) : `navigation-controller.js` monte Runner (`sheet`, 88 px, décoratif) dans la scène de la carte du guide, joue une seule fois la sortie de derrière le logo après la levée du voile du shell, et traduit en état visuel ce que l'état réel ou un propriétaire a produit (magasins ajoutés, position trouvée ou refusée, génération en cours, réussie ou en échec) sans second Runner ni donnée écrite. **Jamais flottant** : toujours dans le flux de l'écran hôte, ni `fixed`, ni `sticky`, ni `z-index`, ni bouton ni lien dessinés, `pointer-events:none` dans l'Assistant et le Planning (les actions et les marges `env(safe-area-inset-*)` appartiennent à l'hôte). Aucune surveillance permanente, mouvement `transform`/`opacity` seulement, `prefers-reduced-motion` respecté. V271.1 (#506) étend explicitement le contrat : présence neutre opt-in, séquences Web Animations finies et variables, suspendues par les états métier et entièrement annulées par `setPresence(false)` / destruction ; écoutes de présentation bornées à la présence ou au trajet actif (visibilité, cycle de page, préférence système), aucun observer dans Runner. Accueil : scène de 8 s après le voile, puis idle ; vrais retours de 1,6–2,4 s distincts des rerenders. Assistant et Planning activent/suspendent via leurs observations existantes, sans déplacer le personnage entre écrans. Contrat et preuves : `RUNNER_PRESENCE_V271_1.md`, texte de bulle toujours en `textContent`. Contrat : `RUNNER_VISUAL_SYSTEM.md`.
- `android/` est l’enveloppe Trusted Web Activity pour Google Play (`fr.storerunner.app` → `https://store-runner.fr/`). Elle ne contient aucune logique métier, ne suit pas `BUILD_REV` et n’est ni chargée par `index.html` ni mise en cache par `sw.js`. Ne pas y lancer `bubblewrap update` ; aucune clé, aucun `assetlinks.json` sans empreinte réelle validée. Voir `android/README.md`.
- Les enrichissements assistant utilisent `storeRunnerRegisterAssistantResolver`, `storeRunnerRegisterAssistantContextTransform` et les événements publics existants.
- Les rafraîchissements doivent être événementiels et ciblés. Éviter les réinstallations globales au `focus`, au `visibilitychange` ou par boucles de temporisation quand un événement métier existe déjà.

Ne pas remplacer une fonction globale métier appartenant à un autre module. Préférer événements, observers bornés, fonctions publiques ou registres d’extensions. Ne pas ajouter de `setInterval` de surveillance permanent.

## PWA et sécurité

- Préserver GitHub Pages, le domaine public `https://store-runner.fr`, les URLs relatives et le fonctionnement hors ligne.
- Toute nouvelle ressource runtime chargée par `index.html` doit être ajoutée au cache de `sw.js`.
- Si le cache/runtime change, maintenir `BUILD_REV` identique dans `index.html` et `sw.js`.
- Google Calendar reste en lecture seule côté application.
- Aucun `client_secret`, token persistant ou clé API ne doit être exposé dans le frontend.

## CI/CD et automatisations

- Le workflow normal reste : issue → branche → PR Draft → Reliability → Ready → merge → vérification de `main` et du déploiement.
- Aucun agent ni workflow planifié ne doit pousser un changement fonctionnel ou un snapshot directement sur `main`.
- Le dépôt interdit actuellement à `GITHUB_TOKEN` de créer des pull requests. Ne pas réintroduire `gh pr create` dans un workflow en supposant que cela fonctionnera.
- `.github/workflows/update-official-stores.yml` doit rester en lecture seule sur Git : il collecte et teste les annuaires, puis publie un `official-stores-candidate-*` comme artefact Actions lorsqu’un snapshot diffère. Un agent reprend ensuite cet artefact via une branche/PR normale.
- Un simple scan d’annuaires ne doit pas déclencher un déploiement Pages ; le site est publié après un vrai push fusionné sur `main` ou un lancement manuel.
- `.github/workflows/build-native-calendar.yml` est un workflow **legacy/manual-only** qui cible encore `v3-premium`. Ne pas le réactiver sur les pushes `main` et ne pas utiliser `v3-premium` comme source de vérité du produit actuel.
- `tests/ci-policy.test.cjs` protège ces règles et doit rester dans Reliability.

### Qui fusionne

- L'agent qui a ouvert une PR la sort du brouillon et **la fusionne lui-même**
  dès que Reliability est verte et que le rapport de la PR est complet.
  Il n'attend pas une validation humaine pour ça.
- Il supprime la branche juste après la fusion.
- Il ne fusionne **jamais** une PR ouverte par un autre agent.
- Exceptions qui exigent un accord humain explicite avant fusion :
  suppression de données, changement du schéma de `state`, modification de
  `sw.js` au-delà de `BUILD_REV`, ou toute PR marquée « ne pas fusionner »
  dans son titre.
- Après fusion : vérifier que `main` est vert et que la version déployée est
  bien la nouvelle.

### Le bump de build voyage avec le code

- Le bump `BUILD_REV` se fait dans **la même PR que le code**, partout où la
  révision est écrite : `version.json` (`latestBuild`), la constante
  d'`index.html`, tous les liens `?rev=` d'`index.html`, `sw.js`, et les tests
  qui figent le littéral — aujourd'hui `tests/terrain-planning-runtime.test.cjs`
  **et** `tests/v182-field-fixes.test.cjs`, qui en fige cinq à lui seul.
- `displayVersion` n'est pas un miroir de `BUILD_REV` : c'est la version produit
  visible, actuellement un entier. Elle n'avance que lorsqu'une nouvelle version
  produit visible est publiée (par exemple 263 → 264). Un hotfix, patch ou lot de
  fiabilisation peut donc avancer `latestBuild`/`BUILD_REV` tout en conservant le
  même `displayVersion`.
- Le nombre d'emplacements n'est pas une constante : avant de pousser, vérifier
  qu'aucune occurrence de l'ancienne révision ne subsiste dans le dépôt plutôt
  que de se fier à un compte appris par cœur.
- **Une PR fonctionnelle sans bump ne se fusionne pas.** Séparer le bump laisse
  `main` publier une version qui ne contient pas le correctif : les appareils
  déjà installés ne le reçoivent jamais par le gestionnaire de mise à jour.
  C'est le défaut qui a produit les décalages 188/189 et 193/194.

## Métier

Le plan de référence est `PLAN_METIER_STORE_RUNNER.md`. Attention : ce document décrit le **modèle cible**, il n'est pas un état d'avancement. L'état réel est ci-dessous.

Déjà intégré dans `main` et protégé par Reliability — **à ne pas redévelopper** depuis une ancienne branche ou un ancien résumé Codex :

- **Visit + Action + workflow 6P**, avec sauvegarde/reprise et historique. L’assistant lit un contexte Visit/Action sans mutation métier.
- **Opportunity**, livré en V200 (priorité décidée le 17/09/2026, PR #275). Il reste neutre pour la planification : aucune opportunité ne déplace un magasin, ne change `store.priority` ni ne fabrique une performance. L'assistant le lit en lecture seule ; les mutations passent par `store-runner-opportunities.js`.
- **Espace Cuisinistes** (V193 → V229) et **pilotage performance** (V190 → V192).
- **Appointment**. `state.appointments` existe et est déjà consommé par le planning, la priorisation et l'accueil. Le noyau possède l'écran Rendez-vous complet : `renderAppointments`, `saveAppointment`, `openAppointment`, `deleteAppointment`, `ensureAppointments`, `appointmentStore`. Un rendez-vous stocké porte `id`, `storeId`, `date`, `time`, `duration`, `type` et `note`.

**Il n'y a donc pas de module Appointment à construire.** Ne créer en aucun cas un second registre de rendez-vous à côté de `state.appointments` : tout complément prolonge le registre existant et son propriétaire.

Complément vérifié encore manquant, et seul point ouvert à ce jour : **un rendez-vous n'est pas relié à sa visite source.** `saveAppointment` ne stocke aucun `visitId`, et les modules visite (`store-runner-visits.js`, `store-runner-visit-store.js`, `store-runner-visit-model.js`) n'écrivent jamais dans `state.appointments`. C'est le « prochain rendez-vous éventuel » de la clôture de visite décrit par `PLAN_METIER_STORE_RUNNER.md`. Si ce lien est demandé un jour, il s'ajoute aux enregistrements existants sans changer leur forme pour les rendez-vous déjà saisis.

Ne pas développer KitchenCRM, ServiceCase ou des workflows spécialisés tant qu’ils ne sont pas explicitement demandés.

## V1 de production et `/v2/`

Ce sont deux choses distinctes et elles ne se mélangent pas.

- **V1 = la production.** `index.html` + `src/chef-secteur.html` + les modules racine, publiés sur `https://store-runner.fr/`. Version courante V273 (`version.json`).
- **`/v2/` = chantier parallèle incomplet** (issue #115), isolé : aucun fichier de `v2/` n'est chargé par `index.html` ni mis en cache par `sw.js`. Il a son propre point d'entrée `v2/public/index.html` et ses propres tests, exécutés par Reliability. Aucune bascule n'est décidée.

Un lot V1 ne touche pas `v2/`, et un lot V2 ne touche pas le runtime V1. L'état réel du chantier V2 est dans `v2/STATUS.md`.

## Validation obligatoire

Avant de proposer une fusion ou un push fonctionnel :

- lancer les tests Reliability du dépôt ;
- vérifier syntaxe JavaScript ;
- vérifier sauvegarde/restauration des données touchées ;
- vérifier mobile à 390 px lorsque l’UI change ;
- lancer la suite navigateur avec `node tools/run-browser-tests.mjs`, jamais `python -m http.server` : ce dernier est en HTTP/1.0 avec une file d’écoute de 5 et produit de faux `Failed to fetch` ;
- vérifier PWA/hors ligne lorsque le runtime ou le stockage change ;
- contrôler qu’aucun propriétaire de fonction critique n’a été contourné.

Privilégier un commit atomique par lot. Dans le compte rendu final, fournir le SHA, les fichiers modifiés, les tests exécutés et les limites restantes.
