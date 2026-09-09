# Architecture Store Runner

Objectif : réduire progressivement les surcharges globales et les scripts qui se remplacent entre eux, sans réécrire l'application ni casser la PWA existante.

## Règle principale

Un comportement critique doit avoir un propriétaire clair. Un module ne doit pas remplacer une fonction globale appartenant à un autre domaine pour ajouter un effet secondaire.

## Propriétaires actuels

| Domaine | Propriétaire cible | Rôle |
| --- | --- | --- |
| Branding | `store-runner-branding.js` | logo, nom Store Runner, métadonnées et présentation de marque |
| Navigation | `navigation-controller.js` | transitions entre onglets et retour au planning après édition du départ |
| Planning UI | `planning-ui-fixes.js` | ordre visuel du planning, hero date, outils de tournée |
| Calendrier Google | `calendar-oauth.js` + `calendar-enhancements.js` | OAuth lecture seule, événements et enrichissement agenda |
| Magasins | `stores-layout-order.js` + modules catalogue | affichage, catalogue et sélection du secteur |
| Fiabilité | `reliability-core.js` + `reliability-ui.js` | garde-fous runtime, sauvegarde et signalement |

## Dette technique encore présente

`planning-ui-fixes.js` contient encore des responsabilités de profil/géolocalisation (`saveProfile`, `useCurrentLocation`, base de départ). Elles devront être extraites dans un contrôleur profil dédié avant d'ajouter davantage de logique métier.

`calendar-enhancements.js` et `stores-layout-order.js` utilisent encore certains wrappers de fonctions historiques. Ils doivent être réduits progressivement, avec tests à chaque déplacement.

Le gros fichier `src/chef-secteur.html` reste la base historique. Il ne sera pas réécrit en une fois. Les migrations doivent être petites, testées, réversibles et compatibles iPhone/PWA hors ligne.

## Ordre de nettoyage

1. Séparer navigation et branding. ✅
2. Extraire profil + géolocalisation de `planning-ui-fixes.js`.
3. Réduire les wrappers `renderHeader`, `renderHome`, `renderWeek`, `renderStores`.
4. Définir un point d'entrée explicite pour les modules au lieu de dépendre de l'ordre implicite des scripts.
5. Ajouter des gardes CI pour interdire le retour des surcharges critiques.
6. Reprendre ensuite la V2 métier Visit / Action / CRM.

## Principe de sécurité

Aucune étape de nettoyage ne doit supprimer ou migrer les données utilisateur existantes. Le stockage local, le catalogue magasins, Google Agenda, les sauvegardes, le fonctionnement hors ligne et la PWA doivent rester compatibles pendant toute la consolidation.
