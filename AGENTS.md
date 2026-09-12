# Store Runner — règles pour les agents de code

Ce dépôt est l’application **Store Runner**. Le dépôt historique s’appelle encore `Chef-Secteur` : ne pas renommer les clés internes ou les chemins uniquement pour harmoniser le branding.

## Avant toute modification

1. Travailler sur le `main` GitHub le plus récent, ou sur une branche créée depuis ce `main`.
2. Vérifier l’état du dépôt avant d’écrire. Ne jamais réappliquer aveuglément un ancien prototype, un ancien diff ou une branche `v3-premium`.
3. Lire au minimum `ARCHITECTURE_CLEANUP_STATUS.md` et, pour le métier V2, `PLAN_METIER_STORE_RUNNER.md`.
4. Vérifier les PR déjà fusionnées avant de reprendre un ancien lot : **Visit + Action + workflow 6P sont déjà intégrés** et ne doivent pas être recréés depuis une ancienne branche locale.
5. Conserver les fonctionnalités existantes et les données locales. Les changements doivent être progressifs et réversibles.

## Architecture à respecter

- Stack actuelle : HTML/CSS/JavaScript. Pas de migration React/Vite sans décision explicite.
- `profile-controller.js` possède le profil, le point de départ et la géolocalisation.
- `navigation-controller.js` possède les comportements de navigation ajoutés hors noyau historique.
- `calendar-oauth.js` possède `syncGoogleCalendar` et l’OAuth Google Agenda.
- `planning-generation-controller.js` possède `generateWeek`.
- `planning-ui-fixes.js` possède la hiérarchie d’affichage du planning.
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

## Métier V2

Le plan de référence est `PLAN_METIER_STORE_RUNNER.md`.

État actuel : **Visit + Action + workflow 6P sont intégrés dans `main`** avec sauvegarde/reprise, historique et protections Reliability. L’assistant peut également lire un contexte Visit/Action sans mutation métier.

Priorité métier suivante : **Appointment**, en prolongeant l’existant au lieu de créer un second registre concurrent. Une fois Appointment stabilisé, le prochain domaine prévu est **Opportunity**.

Ne pas redévelopper Visit/Action/6P depuis une ancienne branche ou un ancien résumé Codex. Ne pas développer KitchenCRM, ServiceCase ou des workflows spécialisés tant qu’ils ne sont pas explicitement demandés.

## Validation obligatoire

Avant de proposer une fusion ou un push fonctionnel :

- lancer les tests Reliability du dépôt ;
- vérifier syntaxe JavaScript ;
- vérifier sauvegarde/restauration des données touchées ;
- vérifier mobile à 390 px lorsque l’UI change ;
- vérifier PWA/hors ligne lorsque le runtime ou le stockage change ;
- contrôler qu’aucun propriétaire de fonction critique n’a été contourné.

Privilégier un commit atomique par lot. Dans le compte rendu final, fournir le SHA, les fichiers modifiés, les tests exécutés et les limites restantes.
