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
- `navigation-controller.js` possède les comportements de navigation ajoutés hors noyau historique.
- `calendar-oauth.js` possède `syncGoogleCalendar` et l’OAuth Google Agenda.
- `planning-generation-controller.js` possède `generateWeek`.
- `planning-ui-fixes.js` possède la hiérarchie d’affichage du planning.
- `planning-manual-visits.js` possède les modifications manuelles du planning (ajout, retrait, déplacement, ordre de passage) ; `planning-reorder-v254.js` ne possède que le geste tactile qui les déclenche.
- `store-runner-branding.js` ne doit gérer que le branding.
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
  révision est écrite : `version.json` (`latestBuild` **et** `displayVersion`),
  la constante d'`index.html`, tous les liens `?rev=` d'`index.html`, `sw.js`,
  et les tests qui figent le littéral — aujourd'hui
  `tests/terrain-planning-runtime.test.cjs` **et**
  `tests/v182-field-fixes.test.cjs`, qui en fige cinq à lui seul.
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

- **V1 = la production.** `index.html` + `src/chef-secteur.html` + les modules racine, publiés sur `https://store-runner.fr/`. Version courante V255 (`version.json`).
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
