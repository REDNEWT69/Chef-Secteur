# Store Runner

**Store Runner** est une PWA terrain pour le travail de chef de secteur Samsung CE. Elle regroupe le planning, les tournées, les magasins du secteur, les visites, l’historique, Google Agenda et un assistant local/IA dans une interface pensée pour le mobile et l’usage hors ligne.

Le dépôt conserve le nom historique `Chef-Secteur`, mais le nom produit affiché est **Store Runner / S-RUNNER By Red①**.

## Deux choses distinctes dans ce dépôt

| | **Store Runner V1** | **`/v2/`** |
| --- | --- | --- |
| Rôle | **le produit en production** | chantier parallèle de reconstruction (issue #115) |
| Version | V230 (`version.json` : `displayVersion` `230`) | incomplet, aucune bascule prévue à ce jour |
| Adresse | `https://store-runner.fr/` | `https://store-runner.fr/v2/`, environnement de test |
| Point d'entrée | `index.html` + `src/chef-secteur.html` | `v2/public/index.html` + `v2/src/` |
| Statut métier | Visit, Action, workflow 6P, Opportunity, cuisinistes, pilotage performance : **livrés** | socle, magasins, planning, visites V2-08A livrés ; le reste manque |

Tout ce qui suit décrit la **V1 de production**, sauf la section `/v2/`.
Le détail du chantier V2 est dans `v2/STATUS.md` et `v2/PARITY.md`.

## Fonctionnalités livrées en V1 (V230)

Secteur et magasins

- Gestion du secteur et du carnet de magasins, import de secteur, catalogue officiel et scan régional.
- Point de départ personnalisable et géolocalisation.
- Horaires d'ouverture : modèle par enseigne (`state.brandOpeningHours`, V230), exceptions par magasin, repli historique.
- Photos magasin et déplacement d'une photo vers un autre magasin.

Planning et tournées

- Génération et réorganisation du planning hebdomadaire, et génération de trois semaines en tournée escargot.
- Jours travaillés du lundi au samedi, avec samedi optionnel, capacité journalière et crédits de visite par enseigne.
- Ajout manuel, horaires imposés par visite, verrous manuels et recalcul en cascade des semaines suivantes.
- Découchés, hôtels et départ du jour suivant après un découché.
- Estimation des trajets et de la charge de travail.
- Synchronisation Google Agenda en lecture seule, journées bloquées et déplacements détectés dans l'agenda.

Métier terrain

- **Visite, Action et workflow 6P** : intégrés et protégés par des suites Reliability dédiées.
- **Opportunity** (V200) : suivi des opportunités commerciales magasin, sans effet automatique sur le planning, `store.priority` ou les performances.
- **Espace Cuisinistes** (V193 → V229) : contrats expo, propositions et suivi commercial.
- **Pilotage performance** (V190 → V192) : import du classeur hebdomadaire, vue secteur et briefing dans la fiche, la visite et l'assistant.
- Comptes rendus de sortie magasin BLANC / BRUN, partage des photos, correcteur de notes terrain.

Plateforme

- Assistant local avec extensions de contexte et réponses spécialisées.
- Passerelle IA côté serveur, sans clé API exposée dans le frontend.
- Import/export, sauvegarde et restauration des données locales.
- PWA installable, cache hors ligne, gestionnaire de mise à jour et écran « Quoi de neuf ? ».

## Architecture actuelle

L’application reste volontairement en **HTML/CSS/JavaScript**, sans migration React/Vite.

- `index.html` : point d’entrée, stockage de secours, chargement centralisé des modules et démarrage de la PWA.
- `src/chef-secteur.html` : noyau historique de l’application et interface principale.
- `profile-controller.js` : profil, point de départ et GPS.
- `navigation-controller.js` : comportements de navigation extraits du noyau.
- `planning-generation-controller.js` : propriétaire de `generateWeek`.
- `calendar-oauth.js` : OAuth et synchronisation Google Agenda.
- `planning-ui-fixes.js` : hiérarchie et compatibilité de l’affichage planning.
- `assistant-upgrade.js` : extensions de l’assistant et contrats publics associés.
- `reliability-core.js` / `reliability-ui.js` : protections, sauvegardes et récupération.
- `sw.js` : cache et fonctionnement hors ligne.
- `manifest.webmanifest` : manifeste PWA.

- `v2/` : chantier parallèle, **jamais chargé par le runtime V1**.

Les modules complémentaires sont chargés explicitement par `index.html`, qui injecte la liste des `<script>` dans le noyau au moment du chargement. Quelques modules sont chargés à la demande (`cuisiniste-*.js` par `assistant-visit-context.js`, `visit-report-ai-json-v225.js` par `ai-gateway-config.js`). Une ressource ajoutée au runtime doit aussi être prise en compte par le cache PWA de `sw.js`.

## Modèle métier

La référence fonctionnelle est `PLAN_METIER_STORE_RUNNER.md`.

Le parcours cible est :

**Magasin → Préparation → Visite → 360° → 6P → Entretien manager → Plan d’action → Suivi → Historique**

Ce parcours **est en place dans la V1 de production** : Visit, Action et le workflow 6P sont intégrés dans `main`, avec sauvegarde/reprise, historique et protections Reliability. Opportunity a suivi en V200 et l'Espace Cuisinistes en V193 → V229.

**Appointment aussi est en place** : `state.appointments` existe, l'écran Rendez-vous permet de créer, modifier et supprimer un rendez-vous, et le planning, la priorisation, l'accueil et le calcul des horaires le consomment déjà.

Ne pas redévelopper Visit / Action / 6P / Opportunity / Appointment depuis une ancienne branche ou un ancien résumé, et ne jamais créer un second registre de rendez-vous à côté de `state.appointments`. Le seul complément vérifié encore manquant est le lien entre un rendez-vous et sa visite source. Buying Group et SAV viennent ensuite, sans inventer de règles absentes des supports métier.

## `/v2/`

`/v2/` est un **chantier parallèle incomplet**, isolé du runtime V1 : aucun fichier de `v2/` n'est chargé par `index.html` ni mis en cache par `sw.js`. Il a ses propres sources (`v2/src/`), son propre point d'entrée (`v2/public/index.html`) et ses propres tests, tous exécutés par Reliability.

Il ne remplace pas la V1 et aucune date de bascule n'est fixée. Son état réel lot par lot est dans `v2/STATUS.md`, la comparaison V1 → V2 dans `v2/PARITY.md` et le contrat de migration dans `v2/MIGRATION_V1.md`.

## Règles pour Codex et les agents

Lire `AGENTS.md` avant toute modification importante. Le fichier fixe notamment :

- l’obligation de repartir du dernier `main` ;
- les propriétaires des fonctions critiques ;
- l’interdiction de réintroduire des wrappers/overrides concurrents ;
- les règles PWA et de sécurité ;
- les validations obligatoires avant fusion.

`ARCHITECTURE_CLEANUP_STATUS.md` décrit le checkpoint d’architecture et la dette restante.

## Tests Reliability

Le workflow `.github/workflows/reliability-checks.yml` vérifie notamment :

- syntaxe des scripts ;
- sauvegarde/restauration ;
- Google Agenda ;
- génération du planning ;
- magasins par région et parseurs du catalogue officiel ;
- séparation des responsabilités de navigation, profil, planning et assistant ;
- architecture du futur métier V2 ;
- propriétaires globaux des modules réellement chargés au runtime ;
- hygiène du dépôt : aucun reliquat non référencé ne peut revenir.

Chaque lot fonctionnel doit conserver ces contrôles au vert.

### Suite navigateur en local

La suite navigateur (Playwright, Chromium mobile 390 px) se lance par une seule commande :

```bash
node tools/run-browser-tests.mjs
```

Elle démarre le serveur statique de test sur `http://127.0.0.1:4173/`, exécute exactement
les specs listés dans `.github/workflows/reliability-checks.yml` — la CI et le poste local
partagent donc la même liste — puis arrête le serveur. La CI lance ce même script.

Prérequis, identiques à la CI :

```bash
npm install --no-save --no-package-lock @playwright/test@1.55.0
npx playwright install --with-deps chromium
```

`node tools/run-browser-tests.mjs <spec>...` limite l'exécution à certains fichiers, et
`node tools/run-browser-tests.mjs --serve` sert l'application sans lancer de test.

Ne pas servir l'application de test avec `python -m http.server` : ce serveur répond en
HTTP/1.0, sans keep-alive, avec une file d'écoute de 5 connexions. Le boot de Store Runner
ouvre une connexion par module ; sur une longue suite, les rafales finissent par être
refusées et le loader affiche « Erreur de chargement : Failed to fetch » alors que
l'application n'a aucun défaut.

## Google Agenda

L’intégration Google utilise un client OAuth Web et le scope Calendar en **lecture seule**. Les jetons restent limités à la session et aucun secret client ne doit être placé dans le navigateur.

## Données et hors ligne

Les données sont enregistrées localement dans le navigateur avec un mécanisme de secours `localStorage → IndexedDB → mémoire` lorsque nécessaire. Les sauvegardes/restaurations doivent rester compatibles avec les versions existantes.

Le service worker met en cache le noyau et les modules nécessaires. Une première ouverture en ligne reste recommandée avant une utilisation sans réseau.

Les distances affichées sont des estimations à partir des coordonnées disponibles et ne constituent pas une matrice de trafic routier temps réel.

## Publication

Le site est publié automatiquement sur GitHub Pages par `.github/workflows/deploy-pages.yml` et servi publiquement sur le domaine personnalisé :

`https://store-runner.fr/`

Le dépôt GitHub conserve l’infrastructure Pages sous-jacente, mais `store-runner.fr` est l’adresse publique de référence.

## Dépôt

`REDNEWT69/Chef-Secteur`
