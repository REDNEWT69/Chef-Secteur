# V231-D — audit de la dette runtime Store Runner V1

Audit du 21/09/2026, base `main` = V230 (`BUILD_REV` `20260921-brand-opening-hours230`).
Issue de référence : #377. **Audit : aucun comportement métier n'est modifié par ce document.**

Il porte sur la **V1 de production** (`index.html` + `src/chef-secteur.html` + modules racine).
`/v2/` est hors périmètre : aucun fichier de `v2/` n'est chargé par `index.html` ni mis en cache par `sw.js`.

---

## 1. Ce qui est réellement chargé

`index.html` ne contient aucune balise `<script>` métier. Il récupère `src/chef-secteur.html`,
lui applique des correctifs texte, puis **injecte** les modules avant d'écrire le document.
Chercher les modules avec un simple `grep '<script src'` sur `index.html` ne donne donc rien :
c'est le piège principal de ce bootloader.

### 1.1 Injection dans `<head>`

| Ordre | Ressource | Rôle |
| --- | --- | --- |
| 1 | `store-runner-visit-model.js` | modèle Visit/Action, chargé avant tout le reste |
| 2 | `reliability-core.js` | protections et sauvegardes |
| 3 | *shim* `runtimeScopeShim` | voir §2 |
| 4 | *shim* `assistantUiShim` | voir §2 |
| 5 | *shim* `runtimeBootStyle` | voir §2 |
| 6 | `glass-theme.css` | thème |

### 1.2 Injection en fin de `<body>` — bloc `calendarOauthShim` (47 modules, dans l'ordre)

`calendar-oauth.js`, `planning-generation-controller.js`, `planning-cascade-v181.js`,
`calendar-enhancements.js`, `ui-polish.js`, `route-polish.js`, `navigation-controller.js`,
`profile-controller.js`, `store-runner-branding.js`, `planning-ui-fixes.js`,
`ai-gateway-config.js`, `assistant-upgrade.js`, `assistant-visit-context.js`,
`ai-context-limit.js`, `assistant-store-lookup.js`, `map-layer-fix.js`,
`timeline-end-times.js`, `visit-counting.js`, `planning-day-origin.js`,
`range-planner-v2.js`, `store-opening-hours.js`, `boulanger-default-hours.js`,
`store-photos.js`, `terrain-planning-v1.js`, `working-hours-end.js`, `daily-capacity.js`,
`planning-pro-plus.js`, `period-day-slider.js`, `planning-manual-visits.js`,
`workdays-enforcer.js`, `visit-history-delete.js`, `assistant-sheet-drag.js`,
`visual-refresh-v1.js`, `home-refresh-v2.js`, `sector-pilotage.js`, `v182-fixes.js`,
`priority-campaign-v187.js`, `auto-planning-fix.js`, `planning-summary-v219.js`,
`performance-data-v190.js`, `performance-ui-v190.js`,
`assistant-performance-context-v192.js`, `visit-mobile-ux-v215.js`,
`visit-mobile-tabs-v216.js`, `update-manager.js`, `store-runner-whats-new.js`,
`planning-manual-hours.js`.

**Le nom du bloc ment.** `calendarOauthShim` ne contient plus seulement l'OAuth Agenda :
c'est devenu la liste principale des modules du runtime. Le renommer est une correction
gratuite et sans risque, mais elle touche `index.html` et impose donc un bump `BUILD_REV`.

### 1.3 Reste du `<body>`

`v184RuntimeShim` (§2) · `connection-ui.js` · `region-stores.css` ·
`region-fetch-resilience.js` · `region-stores.js` · `official-catalog.js` ·
`boulanger-national.js` · `national-sectors.js` · `sector-admin.js` ·
`stores-layout-order.js` · `reliability-ui.js` · `store-runner-visits.css` ·
`store-runner-visit-store.js` · `store-runner-visits.js` ·
`store-runner-opportunities.js` · `note-proofreader-v221.js` · `visit-report-slack.js`.

### 1.4 Chargements à la demande

| Module | Chargé par | Déclencheur |
| --- | --- | --- |
| `cuisiniste-contracts-v193.js` | `assistant-visit-context.js` | besoin du contexte cuisinistes |
| `cuisiniste-contract-proposal-v225.js` | `assistant-visit-context.js` | idem |
| `cuisiniste-followup-v229.js` | `assistant-visit-context.js` | idem |
| `visit-report-ai-json-v225.js` | `ai-gateway-config.js` (`VISIT_JSON_MODULE`) | première utilisation de la passerelle IA |

Ces quatre-là sont invisibles pour toute recherche menée sur `index.html` seul.

### 1.5 Conclusion de la cartographie

**63 modules chargés statiquement + 4 à la demande = 67.** Le dépôt contient 68 fichiers `.js`
à la racine : les 67 ci-dessus, plus `sw.js` lui-même.
Les 3 fichiers `.css` de la racine sont tous chargés.

> **Il n'y a aucun module JS ou CSS mort à la racine.** Un nom en `-v181`, `-v187`, `-v190`
> ou `-v229` ne veut pas dire « ancien » : ces modules sont tous dans la chaîne de chargement.
> Toute suppression décidée sur la seule base d'un numéro de version casserait la production.

---

## 2. Shims embarqués dans `index.html`

| Shim | Contenu | Pourquoi il existe encore |
| --- | --- | --- |
| Correctif `usableStorage` | remplace par `String.replace` le corps de `usableStorage()` dans le noyau pour brancher `window.__chefStorage` | le noyau ne connaît que `localStorage`. Le chargement **échoue volontairement** si le correctif ne s'applique pas — garde-fou sain mais fragile : toute réécriture de `usableStorage()` dans le noyau casse le démarrage. |
| Correctif de branding | `Chef Secteur SAMSUNG` → `Store Runner`, puis `Chef Secteur` → `Store Runner` | le noyau porte encore l'ancien nom. Éliminable seulement en renommant dans `src/chef-secteur.html`, ce qui est un vrai lot. |
| `runtimeScopeShim` | redéfinit `ensureTimeSettings`, `dayStartTime`, `hoursLabel`, `routeWorkMinutes`, `weeklyWorkMinutes` sur `window` | ces fonctions étaient locales à un `<script>` du noyau. Le shim les republie globalement. Dette réelle : cinq fonctions métier n'ont pas de module propriétaire. |
| `assistantUiShim` | feuille de style `!important` sur le panneau assistant | couche CSS historique qui surcharge le noyau. Candidate à une fusion dans `glass-theme.css`, à traiter avec une validation 390 px. |
| `runtimeBootStyle` / `runtimeBootMarkup` | écran de chargement runtime | légitime, propre à `index.html`. |
| `v184RuntimeShim` | masque les champs GPS, enveloppe `generateThreeWeekSnail`, enveloppe `saveProfile` pour restaurer le plan | **le shim le plus lourd.** Il réinstalle son correctif sur `DOMContentLoaded`, `load`, trois événements métier **et trois `setTimeout` (150, 600, 1400 ms)**. C'est exactement le motif que `AGENTS.md` demande d'éviter. Chacun de ses trois correctifs a un propriétaire naturel : `profile-controller.js` pour les champs GPS et `saveProfile`, `terrain-planning-v1.js` pour l'escargot 3 semaines. |

Ces shims sont **du code applicatif logé dans le bootloader**. Les déplacer vers leur
propriétaire est le principal gisement de dette. Chaque déplacement touche `index.html` :
bump `BUILD_REV`, cohérence du cache PWA, Reliability, 390 px, hors ligne,
sauvegarde/restauration.

---

## 3. Wrappers de fonctions globales restants

Modules qui remplacent encore une fonction globale plutôt que de passer par un point
d'extension : `auto-planning-fix.js`, `range-planner-v2.js`, `route-polish.js`,
`v182-fixes.js`, `visit-counting.js`, `calendar-oauth.js`, `visit-report-ai-json-v225.js`
(enveloppe `callAIGateway`).

`assistant-upgrade.js` remplace encore transitoirement `sectorContext` et `assistantHandle` :
dette déjà connue et tracée dans `ARCHITECTURE_CLEANUP_STATUS.md`.

Aucune boucle de surveillance permanente n'a été trouvée : les deux seuls `setInterval`
(`note-proofreader-v221.js`) sont des comptes à rebours bornés qui s'arrêtent d'eux-mêmes.
Les seules temporisations de surveillance restantes sont les trois `setTimeout` de
`v184RuntimeShim` (§2).

---

## 4. Écarts entre le runtime et le cache `sw.js`

| Constat | Détail | Effet |
| --- | --- | --- |
| **Manquant dans le cache** | `visit-report-ai-json-v225.js` est chargé à la demande mais absent de `CORE_SHELL` comme de `OPTIONAL_SHELL` | hors ligne, le module ne se charge pas ; le compte rendu retombe sur le rendu local. Contraire à la règle `AGENTS.md` « toute ressource runtime doit être ajoutée au cache de `sw.js` ». **Non corrigé ici** : l'ajouter change le comportement hors ligne, donc c'est une décision produit, pas du nettoyage. |
| **Dans le cache, jamais chargé** | `store-runner-logo.jpg` | `index.html`, `manifest.webmanifest` et le noyau utilisent tous `app-icon.svg`. Le fichier est téléchargé et gardé pour rien. Retrait proposé dans le sous-lot **V231-D2**. |
| Entrées non-script légitimes | `index.html`, `src/chef-secteur.html`, `app-icon.svg`, `manifest.webmanifest`, `data/official-stores.json` | à conserver. |

---

## 5. Noyau `src/chef-secteur.html`

190 Ko, un seul fichier. Il reste le propriétaire de fait du rendu et d'une grande partie
de l'état. Il porte encore l'ancien nom produit, corrigé au chargement par un `replace`
(§2), et des fonctions métier locales republiées par `runtimeScopeShim`.

**Aucune extraction n'est tentée dans le lot V231.** Toute extraction est un lot
fonctionnel à part entière, avec bump `BUILD_REV` et validation complète.

---

## 6. Couverture Reliability : cinq tests invisibles mais bien exécutés

Cinq fichiers de test n'apparaissent nulle part dans
`.github/workflows/reliability-checks.yml` :

- `tests/performance-store-reconcile-v209.test.cjs`
- `tests/planning-consolidation.test.cjs`
- `v2/tests/visits.test.mjs`
- `tests/performance-store-reconcile-v209-browser.spec.cjs`
- `tests/visit-reopen-v214-browser.spec.cjs`

**Ils tournent quand même.** Ils sont tirés par chaînage depuis un test qui, lui, est
enregistré :

| Test | Tiré par |
| --- | --- |
| `performance-store-reconcile-v209.test.cjs` | `tests/performance-v190.test.cjs:409` |
| `planning-consolidation.test.cjs` | `tests/planning-recalculate-rest.test.cjs:1` |
| `v2/tests/visits.test.mjs` | `v2/tests/store.test.mjs:37` |
| `performance-store-reconcile-v209-browser.spec.cjs` | `tests/performance-assistant-browser.spec.cjs:53` |
| `visit-reopen-v214-browser.spec.cjs` | `tests/performance-assistant-browser.spec.cjs:54` |

Le chaînage est volontaire, et pour les deux specs navigateur il est même **obligatoire** :
les ajouter en plus sur la ligne de commande Playwright fait échouer la suite entière avec
`test file "..." should not import test file "..."`. Les brancher « proprement » dans le
workflow **casse** Reliability.

La dette n'est donc pas un trou de couverture, c'est un **problème de lisibilité** : lire la
liste du YAML donne cinq faux orphelins, et rien n'empêchait un sixième test d'être ajouté
sans jamais tourner.

`tests/reliability-coverage.test.cjs` (livré dans ce sous-lot) ferme la question : il exige
que chaque fichier de test du dépôt soit soit nommé dans le workflow, soit tiré en cascade
par un fichier qui l'est. Il affiche la répartition (aujourd'hui 148 nommés + 5 chaînés) et
échoue sur tout test ajouté sans être exécuté.

## 7. Ce qui reste volontairement en place, et pourquoi

| Élément | Pourquoi on n'y touche pas en V231 |
| --- | --- |
| les 67 modules racine | tous chargés. Aucune suppression justifiable. |
| `v184RuntimeShim`, `runtimeScopeShim`, `assistantUiShim` | leur retrait déplace du comportement d'un propriétaire à un autre : c'est un refactor, pas un nettoyage. Interdit par le cadre V231 (« pas de gros refactor »). |
| le `replace` de branding et le correctif `usableStorage` | dépendent du contenu de `src/chef-secteur.html`. Les retirer suppose de modifier le noyau. |
| `visit-report-ai-json-v225.js` absent du cache | le corriger **change** le comportement hors ligne. Décision produit. |
| renommage de `calendarOauthShim` | correct mais touche `index.html` → bump `BUILD_REV` pour du cosmétique. À grouper avec un futur lot qui touche déjà `index.html`. |
| `glass-theme.css` (22 Ko) | entièrement chargé ; aucun moyen sûr de prouver qu'une règle est morte sans couverture visuelle. |
| `workers/chef-secteur-ai.js` | déployé sur Cloudflare, hors dépôt applicatif. Interdit de périmètre. |

---

## 8. Sous-lots proposés

| Sous-lot | Contenu | Touche `index.html` / `sw.js` ? |
| --- | --- | --- |
| **V231-D1** | ce document + `tests/reliability-coverage.test.cjs` | non |
| **V231-D2** | retrait de `store-runner-logo.jpg` et de son entrée `OPTIONAL_SHELL`, bump `BUILD_REV`, test anti-retour | oui — `sw.js` au-delà de `BUILD_REV`, accord humain requis avant fusion |
| non planifié | ajout de `visit-report-ai-json-v225.js` au cache | oui — change le comportement hors ligne, décision produit |
| non planifié | déplacement des shims vers leurs propriétaires | oui — refactor, hors cadre V231 |
