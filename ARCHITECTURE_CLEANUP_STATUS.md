# Store Runner — architecture cleanup status

Checkpoint architecture actualisé après les consolidations des 10 et 11/09/2026.

## Propriétaires actuels

- `profile-controller.js` : profil, point de départ, GPS, `baseObj`/`havBase`, sauvegarde profil.
- `navigation-controller.js` : retour au planning après sauvegarde du départ.
- `calendar-oauth.js` : propriétaire de `syncGoogleCalendar`, OAuth et synchronisation Google Agenda.
- `planning-generation-controller.js` : propriétaire de `generateWeek` et orchestration Agenda avant/après génération.
- `planning-ui-fixes.js` : hiérarchie et compatibilité d’affichage du planning.
- `store-runner-branding.js` : branding Store Runner uniquement.
- `calendar-enhancements.js` : enrichissements Agenda et horaires magasins sans réécrire les fonctions métier principales.
- `assistant-upgrade.js` : propriétaire transitoire de l’enrichissement de l’assistant. Il expose une API d’extensions pour les résolveurs locaux et les transformations de contexte.
- `ai-context-limit.js` : transformation pure qui limite le contexte IA ; il ne remplace plus `sectorContext`.
- `assistant-store-lookup.js` : résolveur de planning magasin et archivage des semaines par événements/observer ; il ne remplace plus `assistantSend`, `renderAll` ni `generateWeek` et ne se réveille plus globalement au focus/retour de visibilité.
- Le domaine métier V2 **Visit + Action + workflow 6P** est intégré dans `main` et protégé par les suites Reliability dédiées.

## Contrats d’extension assistant

Les enrichissements futurs de l’assistant doivent utiliser les points d’extension publics au lieu de wrapper les fonctions métier :

- `storeRunnerRegisterAssistantResolver(fn, priority)` pour ajouter une réponse locale spécialisée.
- `storeRunnerRegisterAssistantContextTransform(fn, priority)` pour enrichir ou réduire le contexte envoyé à l’IA.
- `store-runner:assistant-mode-changed` pour réagir au changement de mode.
- `store-runner:planning-updated` pour réagir à une nouvelle génération de planning.
- `store-runner:data-restored` pour reconstruire les vues/archives qui dépendent des données restaurées.

Le domaine Visit/Action ajoute son contexte à l’assistant en lecture seule sans prendre possession des fonctions historiques de l’assistant.

## Références de travail pour les agents

- `PLAN_METIER_STORE_RUNNER.md` est versionné dans `main` et constitue la référence du métier V2.
- `AGENTS.md` fixe les règles de travail pour Codex et les autres agents : repartir du dernier `main`, préserver la stack actuelle, respecter les propriétaires, éviter les anciennes branches/prototypes appliqués aveuglément et valider chaque lot.
- **Ne pas recréer Visit + Action + 6P depuis un ancien résumé ou une branche locale** : ce lot est déjà intégré.
- `tests/business-v2-architecture.test.cjs` empêche les modules métier V2 de reprendre des fonctions globales qui appartiennent déjà à un autre domaine.
- `tests/runtime-ownership.test.cjs` contrôle les modules réellement chargés par `index.html` et verrouille les propriétaires critiques du runtime.
- `tests/assistant-architecture.test.cjs` verrouille les contrats d’extension assistant, les dates relatives et les cycles de vie événementiels nettoyés.

## Règles de stabilité

Les modules ne doivent plus remplacer une fonction globale métier qui appartient à un autre module. Les enrichissements passent en priorité par événements, observers bornés, fonctions publiques dédiées ou registres d’extensions.

Les tests `tests/architecture.test.cjs`, `tests/assistant-architecture.test.cjs`, `tests/business-v2-architecture.test.cjs` et `tests/runtime-ownership.test.cjs` verrouillent notamment les propriétaires de `generateWeek`, `syncGoogleCalendar`, du profil/départ, plusieurs fonctions de rendu et les extensions assistant nettoyées.

Les archives du planning utilisées par l’assistant passent par `window.__chefStorage` quand il est disponible, avec repli compatible, afin de ne pas dépendre uniquement de `localStorage` sur PWA/iPhone.

Les composants déjà événementiels ne doivent pas réintroduire des boucles de `setTimeout`, des réinstallations au `load`, ni des rafraîchissements globaux au `focus`/`visibilitychange` lorsqu’un événement métier ciblé existe.

## Dette restante

- `assistant-upgrade.js` remplace encore transitoirement `sectorContext` et `assistantHandle`. La suppression de ces deux derniers wrappers demandera d’ajouter les points d’extension directement dans le propriétaire historique de l’assistant, avec validation complète avant publication.
- `src/chef-secteur.html` reste le noyau historique et contient encore beaucoup de logique globale, notamment des couches historiques autour du planning et des rendez-vous. Les extractions doivent rester progressives, ciblées et sans migration de framework.
- La dette documentaire liée à l’ancien statut « Visit + Action à faire » est désormais supprimée. Les agents doivent considérer ce lot comme acquis.

## État métier et ordre de reprise recommandé

1. Conserver le checkpoint architecture vert avant chaque lot.
2. **Appointment** est le prochain domaine métier prioritaire. Il doit prolonger l’existant au lieu de créer un stockage ou registre concurrent.
3. Une fois Appointment stabilisé, poursuivre avec **Opportunity**.
4. Conserver KitchenCRM et ServiceCase hors priorité tant qu’ils ne sont pas explicitement demandés.
5. Valider mobile 390 px, hors ligne/PWA, sauvegarde/restauration et absence de régression à chaque lot.
6. Extraire ensuite les derniers wrappers assistant du noyau historique quand les points d’extension sont suffisamment stabilisés.
