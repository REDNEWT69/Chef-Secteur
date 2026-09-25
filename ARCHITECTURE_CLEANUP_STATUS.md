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
- `planning-manual-visits.js` (`StoreRunnerManualPlanning`) est propriétaire de toutes les modifications manuelles du planning : ajout, retrait, déplacement, ordre de passage dans la journée (`reorderStore`, `undoEdit`, V254.3). Chaque écriture passe par une seule transaction avec retour arrière et marque la semaine comme manuelle, ce qui empêche l’optimiseur V251 de la réordonner. Un ordre qui rend un rendez-vous, une ouverture ou la fin de journée intenable est enregistré tel quel, avec un avertissement : il n’est jamais réécrit en silence.
- `planning-reorder-v254.js` ne possède que le geste « appui long puis glisser » et son retour visuel ; il n’écrit jamais `state.plan` et délègue règles et écriture à `StoreRunnerManualPlanning`.
- `planning-reorder-v254.js` ne change jamais l’ensemble des magasins d’une journée : crédits, maximum journalier et règle Boulanger restent donc ceux de la journée d’origine. Le déplacement vers un autre jour n’est pas proposé (issue #426).
- `store-photos.js` (`StorePhotosV1`) est le seul propriétaire du stockage photo (IndexedDB `store-runner-store-photos-v1`, hors `state` et hors sauvegarde JSON) et de sa galerie. V255 : une photo est classée d’après le contexte déjà connu (magasin, visite en cours, famille active, date) ; les champs facultatifs `thumb` (miniature ~360 px) et `category` s’ajoutent aux nouvelles photos sans migration. Une ancienne photo reçoit sa miniature à la première apparition dans la galerie, rien d’autre n’est réécrit. La galerie charge des miniatures par paquets de 24 ; seule la visionneuse plein écran lit l’original. V255.1 : « 📤 Sortie magasin » (`visit-report-slack.js`) ne lit que les photos portant le `visitId` de la visite ouverte, pour le partage comme pour le compte rendu local et la charge IA ; une photo sans `visitId` n’y est jamais rattachée par déduction. V257 : archive photo hors appareil (`exportArchives` / `importArchive`, section Photos de l’écran Données) — .zip « stocké » lisible par tout outil, `manifest.json` portant toutes les métadonnées (magasin, visite, famille, moment, catégorie, note, dates, dimensions, CRC32), découpage à 150 Mo / 2 000 photos par archive, restauration par fusion (une photo existante n’est jamais remplacée), lecture par tranches sans charger l’archive, index des photos exportées (`store-runner-photo-export-v1`) pour « nouvelles photos ».
- **Stockage durable (V256)** — `index.html` (bloc `STORAGE-ENGINE`, testé tel quel par `tests/storage-engine-v256.test.cjs`) possède le moteur `window.__chefStorage`. Base principale : IndexedDB `chef-secteur-storage` / `kv`, servie par une copie mémoire synchrone (interface Storage inchangée pour tous les modules). Toutes les écritures d'une même tâche partagent une transaction : une sauvegarde multi-clés est atomique sur disque (`atomic:true`), sans journal. Une écriture refusée (quota, connexion fermée par iOS) n'est jamais avalée : la clé reste à écrire, `store-runner:storage-status` est publié, `flush()` rejette, la prochaine écriture la réessaie après réouverture. Premier démarrage V256 : les clés localStorage sont **copiées** (jetons OAuth exclus), relues, comparées ; localStorage n'est ni vidé ni réécrit et reste la copie d'avant bascule (`legacy()`). Base IndexedDB perdue → reprise de cette copie, signalée. Sans IndexedDB → localStorage ; sans rien → mémoire, signalée. Aucune donnée métier ne doit être lue ou écrite directement dans `localStorage` (verrouillé par `tests/storage-durability-v256.test.cjs`).
- `reliability-core.js` reste propriétaire de la sauvegarde/restauration. V256 : export compact et scellé (`seal`, empreinte FNV-1a de l'état et de l'archive, comptes) relu avant téléchargement ; restauration relue sur disque (`verify`) avant d'être annoncée ; import jusqu'à 100 Mo ; les imports performance, crédits de visite forcés et profil national voyagent avec la sauvegarde (champs facultatifs, non destructifs sur une ancienne sauvegarde) ; une clé auxiliaire illisible est écartée (`skipped`) sans bloquer l'export. Historique automatique : 8 versions, borné à 24 Mo sur IndexedDB (1,5 Mo sur localStorage).
- `home-refresh-v2.js` (`StoreRunnerHomeV204`) possède l'accueil « Votre activité ». V259 : catalogue complet des cartes (`buildActivityCatalog`), préférences d'affichage dans une seule clé du moteur durable (`store-runner-home-cards-v1` : `pinned` ordonné, `hidden`), hors `state` et hors sauvegarde JSON. Sans clé, l'accueil garde le classement automatique `rankCards` d'avant V259 ; avec une clé, les cartes épinglées passent en tête puis le classement complète les places restantes. Les nouvelles cartes (À surveiller, Actions ouvertes, Ce mois) et les états vides n'entrent jamais dans le classement automatique. La mise en forme de « Cette semaine » est `StoreRunnerActivityMetrics.weekSummary` (`visit-counting.js`), partagée avec le bandeau `#smartBrief` du noyau : plus aucun compteur semaine lu directement dans `state.plan`.
- **Cycle PWA / mise à jour (V260)** — `sw.js` ne sert que des versions complètes et cohérentes : précache de l'URL versionnée (`?rev=BUILD_REV`, jamais une copie CDN périmée), installation refusée si `index.html` publié n'est pas celui de sa révision, tous les modules injectés par `index.html` obligatoires (`CORE_SHELL`), plus aucune copie d'une autre révision servie en secours, page d'accueil réseau d'abord bornée à `NAVIGATION_TIMEOUT_MS` puis version installée, page réseau plus ancienne que la version installée ignorée, `cache.put` refusé toléré, clés sans paramètre anti-cache (cache borné). Le bootloader d'`index.html` ne recharge plus jamais la page. `update-manager.js` possède seul la prise de contrôle : worker en attente de la même révision que la page activé sans rechargement (alignement), autre révision proposée (« Mettre à jour » / « Plus tard »), rechargement retardé tant qu'un `dialog` est ouvert, `__chefStorage.flush()` réussi exigé avant tout rechargement. Aucune donnée (IndexedDB, photos, localStorage) n'est touchée par une mise à jour. Protégé par `tests/pwa-update-v260.test.cjs` (vrai `sw.js` en bac à sable) et `tests/pwa-update-v260-browser.spec.cjs` (vrai déploiement simulé).
- **Ajout d'un magasin (V261)** — `store-add-v261.js` (`StoreRunnerStoreAdd`) est le propriétaire unique de l'ajout d'un magasin : « + Ajouter un magasin » (Magasins), l'assistant, l'import IA (`openStoreCreation(drafts)`, un brouillon après l'autre) et le pilotage performance (`onAdded` retient le rattachement) ouvrent le même écran chercher → choisir → ajouter. Source : Nominatim/OpenStreetMap à la demande (validation explicite, jamais d'autocomplétion, une requête par seconde au plus, aucune clé, aucun résultat persisté ; le secteur sert seulement à classer via `viewbox`). Le magasin garde la forme historique et passe par `RegionStores.commit` (sauvegarde préalable, refus des doublons). Doublons : `same` (même fiche OSM, même enseigne à moins de 250 m ou à la même adresse) bloque l'ajout et propose la fiche existante ; `probable` (même enseigne dans la même ville ou à moins de 2,5 km, même nom, même adresse) exige « Ajouter quand même ». Saisie manuelle : nom, adresse, ville ; hors ligne, la position GPS situe le magasin. L'ancien formulaire `createStoreDlg` est retiré du noyau ; import IA/CSV, Carnet officiel et « Gérer mon secteur » sont rangés dans Données › Outils avancés (`#storeToolsHost`). Protégé par `tests/store-add-v261.test.cjs` et `tests/store-add-v261-browser.spec.cjs`.
- `applyAppointmentsToPlan` (noyau) laisse désormais à sa place un magasin déjà prévu le jour de son rendez-vous ; il ne le renvoie plus en fin de journée à chaque ouverture.

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
- **Opportunity est livré** (V200). **Appointment est livré lui aussi** : `state.appointments` et l'écran Rendez-vous existent dans le noyau. Aucun des deux n'est à reconstruire.
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
- Cinq tests n'apparaissent pas dans `.github/workflows/reliability-checks.yml` mais **sont bien exécutés**, tirés par `require`/`import` depuis un test enregistré : `performance-store-reconcile-v209.test.cjs` (par `performance-v190.test.cjs`), `planning-consolidation.test.cjs` (par `planning-recalculate-rest.test.cjs`), `v2/tests/visits.test.mjs` (par `v2/tests/store.test.mjs`), `performance-store-reconcile-v209-browser.spec.cjs` et `visit-reopen-v214-browser.spec.cjs` (par `performance-assistant-browser.spec.cjs`). Pour les deux specs navigateur ce chaînage est obligatoire : les nommer en plus sur la ligne Playwright fait échouer toute la suite. La dette est de lisibilité, pas de couverture.
- Le garde-fou `branding-relics.test.cjs` dépend actuellement de la liste des modules découverte depuis `index.html`. Si le bootloader V1 change, ce test devra être adapté afin de ne pas devenir silencieusement aveugle.

## État métier et ordre de reprise recommandé

1. Conserver le checkpoint architecture vert avant chaque lot.
2. **Opportunity est livré** (V200, PR #275) : création depuis magasin/visite, suivi des statuts, mémoire magasin, vue secteur et contexte assistant, sans effet automatique sur le planning. Ce lot ne doit pas être redéveloppé.
3. **Appointment existe déjà en V1** : `state.appointments` est consommé par le planning, la priorisation et l'accueil, et le noyau porte l'écran Rendez-vous (`renderAppointments`, `saveAppointment`, `openAppointment`, `deleteAppointment`). Ne pas le reconstruire et ne jamais ouvrir un second registre concurrent. Le seul complément vérifié encore manquant est le lien entre un rendez-vous et sa visite source : `saveAppointment` ne stocke pas de `visitId` et les modules visite n'écrivent pas dans `state.appointments`.
4. Conserver KitchenCRM et ServiceCase hors priorité tant qu’ils ne sont pas explicitement demandés.
5. Valider mobile 390 px, hors ligne/PWA, sauvegarde/restauration et absence de régression à chaque lot.
6. Extraire ensuite les derniers wrappers assistant du noyau historique quand les points d’extension sont suffisamment stabilisés.
