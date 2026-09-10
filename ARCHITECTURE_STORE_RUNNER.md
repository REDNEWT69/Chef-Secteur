# Architecture Store Runner

Objectif : faire évoluer Store Runner par responsabilités clairement séparées, sans réécriture générale, sans migration de framework et sans casser la PWA existante.

## Règle principale

Un comportement critique doit avoir un propriétaire clair. Un module ne doit pas remplacer une fonction globale appartenant à un autre domaine pour ajouter un effet secondaire.

Les extensions passent en priorité par événements, observers bornés, fonctions publiques dédiées ou registres d’extensions.

## Propriétaires actuels

| Domaine | Propriétaire | Rôle |
| --- | --- | --- |
| Branding | `store-runner-branding.js` | nom Store Runner et présentation de marque |
| Profil / GPS / départ | `profile-controller.js` | `saveProfile`, `useCurrentLocation`, `baseObj`, `havBase` |
| Navigation | `navigation-controller.js` | comportements de navigation extraits du noyau et retour au planning après sauvegarde du départ |
| Génération planning | `planning-generation-controller.js` | propriétaire de `generateWeek` et orchestration avant/après génération |
| Planning UI | `planning-ui-fixes.js` | ordre visuel, hero date et outils de tournée |
| Google Agenda | `calendar-oauth.js` | propriétaire de `syncGoogleCalendar`, OAuth et synchronisation lecture seule |
| Enrichissements Agenda | `calendar-enhancements.js` | enrichissements d’affichage et horaires sans reprise des fonctions métier principales |
| Magasins | `stores-layout-order.js` + modules catalogue | affichage, catalogue et sélection du secteur |
| Assistant | `assistant-upgrade.js` | API d’extensions, résolveurs et transformations de contexte ; deux wrappers historiques restent transitoires |
| Fiabilité | `reliability-core.js` + `reliability-ui.js` | garde-fous runtime, sauvegarde, restauration et signalement |

## Contrats d’extension assistant

Les modules spécialisés doivent utiliser :

- `storeRunnerRegisterAssistantResolver(fn, priority)` pour ajouter une réponse locale ;
- `storeRunnerRegisterAssistantContextTransform(fn, priority)` pour enrichir ou limiter le contexte IA ;
- `store-runner:assistant-mode-changed` pour le mode assistant ;
- `store-runner:planning-updated` pour les changements de planning.

`ai-context-limit.js` utilise désormais une transformation de contexte pure. `assistant-store-lookup.js` utilise le registre de résolveurs et les événements/observers, sans wrapper `assistantSend`, `renderAll` ou `generateWeek`.

## Dette technique restante

Le gros fichier `src/chef-secteur.html` reste le noyau historique et contient encore plusieurs couches globales anciennes. Il ne doit pas être réécrit en une fois.

`assistant-upgrade.js` remplace encore transitoirement `sectorContext` et `assistantHandle`. Leur suppression nécessite d’intégrer les points d’extension directement dans le propriétaire historique de l’assistant, puis de valider l’ensemble du parcours.

Certaines ressources historiques restent présentes dans le dépôt sans appartenir au runtime chargé. Elles ne doivent pas être considérées comme propriétaires actuels simplement parce qu’elles existent encore dans l’arbre Git.

## Garde-fous CI

Les tests Reliability vérifient notamment :

1. syntaxe, sauvegardes, Agenda, planning et magasins ;
2. séparation navigation/profil ;
3. propriété de Google Agenda ;
4. architecture de l’assistant ;
5. architecture des futurs modules Visit/Action/6P ;
6. propriétaires globaux des modules réellement chargés par `index.html`.

Le test du runtime suit volontairement le chargeur central de `index.html`, afin d’éviter qu’un ancien fichier non chargé ne soit confondu avec un propriétaire actif.

## Métier V2

La spécification de référence est `PLAN_METIER_STORE_RUNNER.md`. Le premier lot fonctionnel est **Visit + Action + workflow 6P**.

Ce lot doit réutiliser les identifiants magasins existants, conserver la compatibilité avec l’historique, sauvegarder progressivement la visite, reprendre après rechargement, éviter les doublons d’actions et fonctionner en PWA/hors ligne. Il ne doit pas prendre possession des fonctions planning, profil, Agenda ou assistant déjà attribuées.

Les workflows KitchenCRM, ServiceCase, Cuisinistes et Buying Group sont des lots ultérieurs.

## Ordre de reprise

1. Partir du dernier `main` vert et lire `AGENTS.md`, ce document et `PLAN_METIER_STORE_RUNNER.md`.
2. Intégrer Visit + Action + 6P par un lot atomique.
3. Valider mobile 390 px, reprise après rechargement, sauvegarde/restauration et hors ligne.
4. Continuer ensuite l’extraction progressive du noyau historique et des deux derniers wrappers assistant.

## Principe de sécurité

Aucune consolidation ne doit supprimer ou migrer silencieusement les données utilisateur existantes. Le stockage local, les magasins, Google Agenda, les sauvegardes, le fonctionnement hors ligne et la PWA doivent rester compatibles pendant toute l’évolution.
