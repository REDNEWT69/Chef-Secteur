# Store Runner — architecture cleanup status

Checkpoint architecture actualisé au 21/09/2026, base `main` = V230 (`version.json` : `displayVersion` `230`).

Ce document décrit la **V1 de production**. `/v2/` est un chantier parallèle isolé, décrit par `v2/STATUS.md` : aucun fichier de `v2/` n'est chargé par `index.html` ni mis en cache par `sw.js`.

## Propriétaires actuels

- `profile-controller.js` : profil, point de départ, GPS, `baseObj`/`havBase`, sauvegarde profil.
- `navigation-controller.js` : navigation hors noyau historique.
- `calendar-oauth.js` : propriétaire de `syncGoogleCalendar`, OAuth et synchronisation Google Agenda.
- `planning-generation-controller.js` : propriétaire de `generateWeek` et orchestration Agenda avant/après génération.
- `planning-ui-fixes.js` : hiérarchie et compatibilité d’affichage du planning.
- `store-runner-branding.js` : branding Store Runner uniquement.
- `calendar-enhancements.js` : enrichissements Agenda et horaires magasins sans réécrire les fonctions métier principales.
- `store-opening-hours.js` : propriétaire unique de la résolution, du parseur et de l’ordonnancement des horaires. V230 ajoute `state.brandOpeningHours` (facultatif) et les éditeurs enseigne/magasin : magasin > enseigne > fallback historique. `boulanger-default-hours.js` délègue ses règles historiques à ce propriétaire. Voir `V230_BRAND_OPENING_HOURS.md`.
- `assistant-upgrade.js` : propriétaire transitoire de l’enrichissement de l’assistant. Il expose une API d’extensions pour les résolveurs locaux et les transformations de contexte.
- `ai-context-limit.js` : transformation pure qui limite le contexte IA ; il ne remplace plus `sectorContext`.
- `assistant-store-lookup.js` : résolveur de planning magasin et archivage des semaines par événements/observer ; il ne remplace plus `assistantSend`, `renderAll` ni `generateWeek` et ne se réveille plus globalement au focus/retour de visibilité.
- Le domaine métier **Visit + Action + workflow 6P** est intégré dans la V1 de `main` et protégé par les suites Reliability dédiées.
- `store-runner-opportunities.js` est propriétaire de l’interface et des mutations Opportunity V200. Il ne doit pas écrire le planning, `store.priority` ni les performances.

## Contrats d’extension assistant

Les enrichissements futurs de l’assistant doivent utiliser les points d’extension publics au lieu de wrapper les fonctions métier :

- `storeRunnerRegisterAssistantResolver(fn, priority)` pour ajouter une réponse locale spécialisée.
- `storeRunnerRegisterAssistantContextTransform(fn, priority)` pour enrichir ou réduire le contexte envoyé à l’IA.
- `store-runner:assistant-mode-changed` pour réagir au changement de mode.
- `store-runner:planning-updated` pour réagir à une nouvelle génération de planning.
- `store-runner:data-restored` pour reconstruire les vues/archives qui dépendent des données restaurées.
- `store-runner:opportunities-updated` pour rafraîchir les surfaces qui affichent les opportunités après une mutation.

Le domaine Visit/Action ajoute son contexte à l’assistant en lecture seule sans prendre possession des fonctions historiques de l’assistant. Opportunity suit le même contrat : lecture seule côté assistant, mutation uniquement via son module propriétaire.

## Références de travail pour les agents

- `PLAN_METIER_STORE_RUNNER.md` est versionné dans `main` et constitue la référence du **modèle métier cible**. Ce n'est pas un état d'avancement : l'avancement réel est décrit ici et dans `AGENTS.md`.
- `AGENTS.md` fixe les règles de travail pour Codex et les autres agents : repartir du dernier `main`, préserver la stack actuelle, respecter les propriétaires, éviter les anciennes branches/prototypes appliqués aveuglément et valider chaque lot.
- **Ne pas recréer Visit + Action + 6P depuis un ancien résumé ou une branche locale** : ce lot est déjà intégré.
- **Opportunity est livré** (V200). Le chantier métier suivant est **Appointment**.
- `tests/business-v2-architecture.test.cjs` empêche les modules métier V2 de reprendre des fonctions globales qui appartiennent déjà à un autre domaine.
- `tests/runtime-ownership.test.cjs` contrôle les modules réellement chargés par `index.html` et verrouille les propriétaires critiques du runtime.
- `tests/assistant-architecture.test.cjs` verrouille les contrats d’extension assistant, les dates relatives et les cycles de vie événementiels nettoyés.

## Règles de stabilité

Les modules ne doivent plus remplacer une fonction globale métier qui appartient à un autre module. Les enrichissements passent en priorité par événements, observers bornés, fonctions publiques dédiées ou registres d’extensions.

Les tests `tests/architecture.test.cjs`, `tests/assistant-architecture.test.cjs`, `tests/business-v2-architecture.test.cjs` et `tests/runtime-ownership.test.cjs` verrouillent notamment les propriétaires de `generateWeek`, `syncGoogleCalendar`, du profil/départ, plusieurs fonctions de rendu et les extensions assistant nettoyées.

Les archives du planning utilisées par l’assistant passent par `window.__chefStorage` quand il est disponible, avec repli compatible, afin de ne pas dépendre uniquement de `localStorage` sur PWA/iPhone.

Les composants déjà événementiels ne doivent pas réintroduire des boucles de `setTimeout`, des réinstallations au `load`, ni des rafraîchissements globaux au `focus`/`visibilitychange` lorsqu’un événement métier ciblé existe.

Opportunity doit rester neutre pour la planification : aucune création ou mise à jour d’opportunité ne déplace un magasin, ne change une priorité magasin et ne fabrique une valeur de performance.

## Dette restante

- `assistant-upgrade.js` remplace encore transitoirement `sectorContext` et `assistantHandle`. La suppression de ces deux derniers wrappers demandera d’ajouter les points d’extension directement dans le propriétaire historique de l’assistant, avec validation complète avant publication.
- `src/chef-secteur.html` reste le noyau historique et contient encore beaucoup de logique globale, notamment des couches historiques autour du planning et des rendez-vous. Les extractions doivent rester progressives, ciblées et sans migration de framework.
- La dette documentaire liée aux anciens statuts « Visit + Action à faire » et « Opportunity à faire » est supprimée. Les agents doivent considérer ces deux lots comme acquis.
- `visit-report-ai-json-v225.js` est chargé à la demande par `ai-gateway-config.js` mais **absent de la liste de cache de `sw.js`** : hors ligne, le compte rendu structuré retombe sur le rendu local. Corriger cet écart touche `sw.js` et impose donc un bump `BUILD_REV` complet.
- Les trois répertoires de fragments compressés du noyau et leur script de génération ont été retirés en V231-B (#378) : `index.html` charge `src/chef-secteur.html` directement. `tests/repo-hygiene.test.cjs` empêche leur retour — et refuse aussi qu'un fichier du dépôt les nomme à nouveau, y compris une documentation, d'où la formulation de cette ligne.
- `store-runner-logo.jpg` n'est chargé par aucune surface (`index.html`, `manifest.webmanifest` et le noyau utilisent tous `app-icon.svg`) : sa seule référence est la liste `OPTIONAL_SHELL` de `sw.js`.
- Cinq tests n'apparaissent pas dans `.github/workflows/reliability-checks.yml` mais **sont bien exécutés**, tirés par `require`/`import` depuis un test enregistré : `performance-store-reconcile-v209.test.cjs` (par `performance-v190.test.cjs`), `planning-consolidation.test.cjs` (par `planning-recalculate-rest.test.cjs`), `v2/tests/visits.test.mjs` (par `v2/tests/store.test.mjs`), `performance-store-reconcile-v209-browser.spec.cjs` et `visit-reopen-v214-browser.spec.cjs` (par `performance-assistant-browser.spec.cjs`). Pour les deux specs navigateur ce chaînage est obligatoire : les nommer en plus sur la ligne Playwright fait échouer toute la suite. La dette est de lisibilité, pas de couverture.
- Le garde-fou `branding-relics.test.cjs` dépend actuellement de la liste des modules découverte depuis `index.html`. Si le bootloader V1 change, ce test devra être adapté afin de ne pas devenir silencieusement aveugle.

## État métier et ordre de reprise recommandé

1. Conserver le checkpoint architecture vert avant chaque lot.
2. **Opportunity est livré** (V200, PR #275) : création depuis magasin/visite, suivi des statuts, mémoire magasin, vue secteur et contexte assistant, sans effet automatique sur le planning. Ce lot ne doit pas être redéveloppé.
3. Le chantier métier suivant est **Appointment**, en prolongeant `state.appointments` et sans créer de registre concurrent.
4. Conserver KitchenCRM et ServiceCase hors priorité tant qu’ils ne sont pas explicitement demandés.
5. Valider mobile 390 px, hors ligne/PWA, sauvegarde/restauration et absence de régression à chaque lot.
6. Extraire ensuite les derniers wrappers assistant du noyau historique quand les points d’extension sont suffisamment stabilisés.
