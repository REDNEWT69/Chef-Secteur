# Store Runner — architecture cleanup status

Checkpoint architecture après consolidation du 10/09/2026.

## Propriétaires actuels

- `profile-controller.js` : profil, point de départ, GPS, `baseObj`/`havBase`, sauvegarde profil.
- `navigation-controller.js` : retour au planning après sauvegarde du départ.
- `calendar-oauth.js` : propriétaire de `syncGoogleCalendar`, OAuth et synchronisation Google Agenda.
- `planning-generation-controller.js` : propriétaire de `generateWeek` et orchestration Agenda avant/après génération.
- `planning-ui-fixes.js` : hiérarchie et compatibilité d’affichage du planning.
- `store-runner-branding.js` : branding Store Runner uniquement.
- `calendar-enhancements.js` : enrichissements Agenda et horaires magasins sans réécrire les fonctions métier principales.
- `assistant-upgrade.js` : propriétaire transitoire de l’enrichissement de l’assistant. Il expose maintenant une API d’extensions pour les résolveurs locaux et les transformations de contexte.
- `ai-context-limit.js` : transformation pure qui limite le contexte IA ; il ne remplace plus `sectorContext`.
- `assistant-store-lookup.js` : résolveur de planning magasin et archivage des semaines par événements/observer ; il ne remplace plus `assistantSend`, `renderAll` ni `generateWeek`.

## Contrats d’extension assistant

Les enrichissements futurs de l’assistant doivent utiliser les points d’extension publics au lieu de wrapper les fonctions métier :

- `storeRunnerRegisterAssistantResolver(fn, priority)` pour ajouter une réponse locale spécialisée.
- `storeRunnerRegisterAssistantContextTransform(fn, priority)` pour enrichir ou réduire le contexte envoyé à l’IA.
- `store-runner:assistant-mode-changed` pour réagir au changement de mode.
- `store-runner:planning-updated` pour réagir à une nouvelle génération de planning.

Cette structure permet notamment au domaine Visit/Action d’ajouter son contexte ou ses réponses sans prendre possession des fonctions historiques de l’assistant.

## Références de travail pour les agents

- `PLAN_METIER_STORE_RUNNER.md` est désormais versionné dans `main` et constitue la référence du métier V2.
- `AGENTS.md` fixe les règles de travail pour Codex et les autres agents : repartir du dernier `main`, préserver la stack actuelle, respecter les propriétaires, éviter les anciennes branches/prototypes appliqués aveuglément et valider chaque lot.
- `tests/business-v2-architecture.test.cjs` empêche les futurs modules Visit/Action/6P de reprendre des fonctions globales qui appartiennent déjà à un autre domaine.
- `tests/runtime-ownership.test.cjs` contrôle les modules réellement chargés par `index.html` et verrouille les propriétaires critiques du runtime. Les deux wrappers encore autorisés dans `assistant-upgrade.js` sont explicitement traités comme dette transitoire.

## Règles de stabilité

Les modules ne doivent plus remplacer une fonction globale métier qui appartient à un autre module. Les enrichissements passent en priorité par événements, observers, fonctions publiques dédiées ou registres d’extensions.

Les tests `tests/architecture.test.cjs`, `tests/assistant-architecture.test.cjs`, `tests/business-v2-architecture.test.cjs` et `tests/runtime-ownership.test.cjs` verrouillent notamment les propriétaires de `generateWeek`, `syncGoogleCalendar`, du profil/départ, plusieurs fonctions de rendu et les extensions assistant nettoyées.

Les archives du planning utilisées par l’assistant passent par `window.__chefStorage` quand il est disponible, avec repli compatible, afin de ne pas dépendre uniquement de `localStorage` sur PWA/iPhone.

## Dette restante

- `assistant-upgrade.js` remplace encore transitoirement `sectorContext` et `assistantHandle`. La suppression de ces deux derniers wrappers demandera d’ajouter les points d’extension directement dans le propriétaire historique de l’assistant, avec validation complète avant publication.
- `src/chef-secteur.html` reste le noyau historique et contient encore beaucoup de logique globale, notamment des couches historiques autour du planning et des rendez-vous. Les extractions doivent rester progressives, ciblées et sans migration de framework.
- Le prochain gros chantier fonctionnel est le domaine métier V2 Visit + Action + workflow 6P. Codex dispose déjà d’un travail local testé partiellement ; il devra être rebasé sur le dernier `main` avant toute fusion.

## Ordre de reprise recommandé

1. Conserver le checkpoint architecture vert avant chaque lot fonctionnel.
2. Reprendre puis intégrer Visit + Action avec sauvegarde/reprise, 6P, historique et compatibilité des données existantes.
3. Valider mobile 390 px, hors ligne/PWA, sauvegarde/restauration et absence de régression.
4. Extraire ensuite les derniers wrappers assistant du noyau historique quand les points d’extension sont stabilisés.
