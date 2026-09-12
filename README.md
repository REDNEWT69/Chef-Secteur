# Store Runner

**Store Runner** est une PWA terrain pour le travail de chef de secteur Samsung CE. Elle regroupe le planning, les tournées, les magasins du secteur, les visites, l’historique, Google Agenda et un assistant local/IA dans une interface pensée pour le mobile et l’usage hors ligne.

Le dépôt conserve le nom historique `Chef-Secteur`, mais le nom produit affiché est **Store Runner / S-RUNNER By Red①**.

## Fonctionnalités actuelles

- Gestion du secteur et du carnet de magasins.
- Point de départ personnalisable et géolocalisation.
- Génération et réorganisation du planning hebdomadaire.
- Jours travaillés du lundi au samedi, avec samedi optionnel.
- Estimation des trajets et de la charge de travail.
- Synchronisation Google Agenda en lecture seule.
- Prise en compte des journées bloquées, déplacements et hôtels détectés dans l’agenda.
- Vue planning, tournée, magasins, historique et rendez-vous.
- Assistant local avec extensions de contexte et réponses spécialisées.
- Passerelle IA côté serveur, sans clé API exposée dans le frontend.
- Import/export, sauvegarde et restauration des données locales.
- PWA installable et cache hors ligne.

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

Les modules complémentaires sont chargés explicitement par `index.html`. Une ressource ajoutée au runtime doit aussi être prise en compte par le cache PWA.

## Métier V2

La référence fonctionnelle est `PLAN_METIER_STORE_RUNNER.md`.

Le parcours cible est :

**Magasin → Préparation → Visite → 360° → 6P → Entretien manager → Plan d’action → Suivi → Historique**

Le premier lot métier porte sur **Visit + Action + workflow 6P**. Les processus spécialisés Cuisinistes, Buying Group et SAV viennent ensuite, sans inventer de règles qui ne sont pas présentes dans les supports métier.

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
- propriétaires globaux des modules réellement chargés au runtime.

Chaque lot fonctionnel doit conserver ces contrôles au vert.

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
