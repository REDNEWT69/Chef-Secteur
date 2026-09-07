# Chef Secteur

Chef Secteur est une application web autonome de planification terrain pensée pour un chef de secteur Samsung. Elle centralise le planning hebdomadaire, les magasins du secteur, le suivi des visites, le mode terrain, l'historique et les données locales dans une interface adaptée au mobile.

## Fonctionnalités principales

- Accueil avec priorités et prochaine visite recommandée
- Génération automatique d'une semaine de visites
- Sélection du nombre de magasins, des jours travaillés, des enseignes et de la stratégie de planification
- Optimisation locale à partir des coordonnées GPS
- Gestion des magasins et des fréquences de visite
- Mode terrain avec itinéraire, validation de visite et notes
- Historique local des visites
- Gestion du secteur et de la base de départ
- Import/export JSON et CSV
- Assistant local intégré
- Fonctionnement PWA avec cache hors ligne

## Structure du dépôt

- `index.html` : charge la version complète de l'application
- `payload/part01.txt` à `payload/part05.txt` : version compressée de l'application HTML complète
- `manifest.webmanifest` : manifeste PWA
- `sw.js` : service worker et cache hors ligne
- `README.md` : documentation du projet

## Version intégrée

Le dépôt contient la version issue de `Chef_Secteur_V4_3_FUSION_PREMIUM(1).html`, importée depuis la dernière version réalisée dans ChatGPT.

L'application originale est conservée sous forme gzip + Base64 découpée en cinq parties afin de pouvoir être enregistrée intégralement dans le dépôt via le connecteur GitHub. `index.html` reconstitue et charge cette version au démarrage.

## Utilisation

Le projet doit être servi via HTTP/HTTPS pour profiter correctement du manifeste PWA et du service worker. Une fois ouvert dans Safari sur iPhone, il peut être ajouté à l'écran d'accueil depuis le menu Partager.

Les données métier et l'historique sont enregistrés localement dans le navigateur. Les kilomètres calculés par l'application sont des estimations géographiques basées sur les coordonnées GPS et ne correspondent pas à une matrice de trafic routier en temps réel.

## Hors ligne

Le service worker met en cache `index.html`, le manifeste et les cinq fragments du payload. Après un premier chargement réussi en ligne, l'application peut réutiliser ces ressources depuis le cache.

## Dépôt

`REDNEWT69/Chef-Secteur`
