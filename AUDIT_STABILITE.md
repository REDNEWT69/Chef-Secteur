# Audit de stabilité — Chef Secteur

Date : 2026-09-09

Objectif : inventorier les risques techniques actuels sans modifier le comportement de l’application.

## Conclusion rapide

L’application a déjà été fortement consolidée : les boucles permanentes identifiées dans le premier audit ont été supprimées, plusieurs initialisations ont été rendues événementielles et le fallback Overpass a été renforcé.

La priorité n’est plus de supprimer des timers globaux inexistants, mais de réduire progressivement la complexité de chargement et les surcharges de fonctions globales, sans régression visuelle ni fonctionnelle.

## Points solides à conserver

### 1. Sauvegardes et restauration

`reliability-core.js` valide les données, bloque les clés dangereuses (`__proto__`, `constructor`, `prototype`), conserve plusieurs points de restauration et utilise un journal de transaction pour revenir à l’état précédent si une écriture échoue.

### 2. Tests automatisés

Le workflow `Reliability checks` contrôle notamment :

- la syntaxe des scripts ;
- les sauvegardes et restaurations ;
- Google Agenda ;
- le moteur de planning ;
- la recherche de magasins par région.

### 3. Passerelle IA

`ai-gateway-config.js` ne contient pas de clé API. La clé Groq reste attendue côté Cloudflare Worker.

### 4. Client OAuth Google

Le token Google principal reste dans `sessionStorage`.

`auto-planning-fix.js` supprime désormais les anciennes clés persistantes :

- `chef_google_token_persist_v1`
- `chef_google_token_persist_expiry_v1`

La persistance OAuth en `localStorage` signalée dans le premier audit n’est donc plus active.

### 5. Recherche magasins par région

`region-fetch-resilience.js` reconnaît les différents endpoints Overpass configurés, conserve les paramètres d’URL pendant un basculement, respecte mieux l’annulation et peut essayer les serveurs de secours successivement.

## Consolidations déjà réalisées

### Boucles permanentes supprimées

Les boucles `setInterval` identifiées auparavant ont été retirées des modules concernés.

`stores-layout-order.js` utilise maintenant :

- un hook ciblé sur `renderStores` ;
- quelques réessais courts au démarrage ;
- des déclenchements sur navigation, focus ou retour dans l’application.

`connection-ui.js` n’exécute plus `healStorage` toutes les 1,5 seconde. La réparation du stockage est maintenant déclenchée au démarrage, après certains rendus et lors du retour dans l’application.

`auto-planning-fix.js` ne contient plus de boucle permanente.

### Observers globaux supprimés ou réduits

`planning-ui-fixes.js` ne surveille plus tout le document avec un `MutationObserver` global. Il s’appuie principalement sur les hooks de rendu et quelques déclenchements ciblés.

`connection-ui.js` conserve seulement des observers ciblés sur les éléments Google Agenda et certains boutons de l’assistant.

## Risques encore actifs

### P0 — Surcharges répétées de fonctions globales

Plusieurs modules remplacent encore ponctuellement des fonctions globales existantes, notamment autour de :

- `renderAll` ;
- `renderWeek` ;
- `renderHeader` ;
- `renderStores` ;
- `syncGoogleCalendar` ;
- `generateWeek` ;
- `baseObj` / `havBase` ;
- `saveProfile` ;
- `ChefReliability.propose`.

Les marqueurs `window.__...` limitent les doubles installations, mais l’ordre de chargement reste important.

Action recommandée : créer progressivement des hooks ou événements officiels, module par module, sans réécriture massive.

### P1 — Révisions de fichiers dispersées dans `index.html`

Le service worker utilise déjà un nom de cache global, mais `index.html` charge encore de nombreux scripts avec des paramètres `?rev=` différents (`safe16`, dates, noms de correctifs, etc.).

Ce double système de versionnement augmente le risque qu’une PWA installée conserve temporairement un mélange de versions lors d’une évolution du chargeur.

Action recommandée : utiliser une révision de build unique dans le chargeur, puis faire correspondre cette révision au cache du service worker.

### P1 — Plusieurs couches de planning

Le planning reste réparti entre plusieurs modules spécialisés. C’est fonctionnel, mais la multiplication des wrappers rend les dépendances difficiles à suivre.

Action recommandée : définir à terme un point d’entrée central pour le calcul et des hooks explicites pour :

1. les contraintes Agenda ;
2. les horaires ;
3. le stockage ;
4. le rendu ;
5. les décorations visuelles.

### P2 — Plusieurs couches d’accueil

L’accueil reste partagé entre plusieurs modules. Ce n’est plus la priorité immédiate tant que le rendu reste stable.

Action recommandée : fusion progressive après stabilisation du chargeur et du planning.

## Ordre de consolidation recommandé à partir de maintenant

### Étape 1 — version de build unique

Centraliser les paramètres `?rev=` de `index.html` autour d’une seule révision de build et vérifier le comportement PWA/cache.

### Étape 2 — hooks de rendu

Commencer par une seule famille de wrappers, idéalement le planning ou les magasins, et introduire un mécanisme de hooks explicite sans changement visuel.

### Étape 3 — accueil

Regrouper progressivement les responsabilités des modules d’accueil après validation des étapes précédentes.

### Étape 4 — planning

Poursuivre la séparation entre moteur, Agenda, contraintes, stockage et rendu.

## Règle pour les prochaines modifications

Pour chaque étape :

1. une seule catégorie de changement ;
2. aucun changement visuel non demandé ;
3. tests existants avant et après ;
4. un commit séparé ;
5. retour arrière immédiat si une fonction existante régresse.

## État actuel

Le dernier contrôle du 9 septembre 2026 confirme que les anciennes boucles permanentes signalées dans l’audit initial ne sont plus présentes dans les modules inspectés. Le prochain chantier technique prioritaire est la centralisation des révisions de build dans le chargeur PWA.
