# Store Runner — règles pour les agents de code

Ce dépôt est l’application **Store Runner**. Le dépôt historique s’appelle encore `Chef-Secteur` : ne pas renommer les clés internes ou les chemins uniquement pour harmoniser le branding.

## Avant toute modification

1. Travailler sur le `main` GitHub le plus récent, ou sur une branche créée depuis ce `main`.
2. Vérifier l’état du dépôt avant d’écrire. Ne jamais réappliquer aveuglément un ancien prototype, un ancien diff ou une branche `v3-premium`.
3. Lire au minimum `ARCHITECTURE_CLEANUP_STATUS.md` et, pour le métier V2, `PLAN_METIER_STORE_RUNNER.md`.
4. Conserver les fonctionnalités existantes et les données locales. Les changements doivent être progressifs et réversibles.

## Architecture à respecter

- Stack actuelle : HTML/CSS/JavaScript. Pas de migration React/Vite sans décision explicite.
- `profile-controller.js` possède le profil, le point de départ et la géolocalisation.
- `navigation-controller.js` possède les comportements de navigation ajoutés hors noyau historique.
- `calendar-oauth.js` possède `syncGoogleCalendar` et l’OAuth Google Agenda.
- `planning-generation-controller.js` possède `generateWeek`.
- `planning-ui-fixes.js` possède la hiérarchie d’affichage du planning.
- `store-runner-branding.js` ne doit gérer que le branding.
- Les enrichissements assistant utilisent `storeRunnerRegisterAssistantResolver`, `storeRunnerRegisterAssistantContextTransform` et les événements publics existants.

Ne pas remplacer une fonction globale métier appartenant à un autre module. Préférer événements, observers bornés, fonctions publiques ou registres d’extensions. Ne pas ajouter de `setInterval` de surveillance permanent.

## PWA et sécurité

- Préserver GitHub Pages, les URLs relatives et le fonctionnement hors ligne.
- Toute nouvelle ressource runtime chargée par `index.html` doit être ajoutée au cache de `sw.js`.
- Si le cache/runtime change, maintenir `BUILD_REV` identique dans `index.html` et `sw.js`.
- Google Calendar reste en lecture seule côté application.
- Aucun `client_secret`, token persistant ou clé API ne doit être exposé dans le frontend.

## Métier V2

Le plan de référence est `PLAN_METIER_STORE_RUNNER.md`.

Priorité actuelle : **Visit + Action + workflow 6P**. Le premier lot doit couvrir création/reprise d’une visite, sauvegarde progressive, Préparation, 360°, six P, conversion d’anomalie en Action sans doublon, clôture, historique compatible et reprise après rechargement.

Ne pas développer KitchenCRM, ServiceCase ou les workflows spécialisés avant le lot demandé. `Appointment` doit prolonger l’existant au lieu de créer un second registre concurrent.

## Validation obligatoire

Avant de proposer une fusion ou un push fonctionnel :

- lancer les tests Reliability du dépôt ;
- vérifier syntaxe JavaScript ;
- vérifier sauvegarde/restauration des données touchées ;
- vérifier mobile à 390 px lorsque l’UI change ;
- vérifier PWA/hors ligne lorsque le runtime ou le stockage change ;
- contrôler qu’aucun propriétaire de fonction critique n’a été contourné.

Privilégier un commit atomique par lot. Dans le compte rendu final, fournir le SHA, les fichiers modifiés, les tests exécutés et les limites restantes.
