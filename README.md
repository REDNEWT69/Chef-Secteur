# Mon activité terrain

Mon activité terrain est une application web autonome de planification terrain pensée pour un chef de secteur Samsung. Elle centralise le planning hebdomadaire, les magasins du secteur, le suivi des visites, le mode terrain, l'historique et les données locales dans une interface adaptée au mobile.

## Fonctionnalités principales

- Secteur Rhône-Alpes préchargé avec ses 83 magasins
- Point de départ personnalisable depuis les réglages ou la position actuelle
- En-tête compact centré sur le secteur et le point de départ
- Accueil avec priorités et prochaine visite recommandée
- Génération automatique d'une semaine de visites
- Sélection du nombre de magasins, des jours travaillés du lundi au samedi, des enseignes et de la stratégie de planification
- Optimisation locale à partir des coordonnées GPS
- Synchronisation en lecture seule avec Google Agenda pour intégrer formations, trajets et rendez-vous au planning
- Gestion des magasins et des fréquences de visite
- Mode terrain avec itinéraire, validation de visite et notes
- Historique local des visites
- Gestion du secteur et de la base de départ
- Import/export JSON et CSV
- Assistant local intégré
- Fonctionnement PWA avec cache hors ligne

## Structure du dépôt

- `index.html` : charge la version complète de l'application
- `src/chef-secteur.html` : source lisible de l'application embarquée
- `tools/build_payload.py` : régénère les fragments compressés depuis la source
- `payload/part01.txt` à `payload/part08.txt` : version compressée de l'application HTML complète
- `manifest.webmanifest` : manifeste PWA
- `sw.js` : service worker et cache hors ligne
- `README.md` : documentation du projet

## Version intégrée

Le dépôt contient la version issue de `Chef_Secteur_V4_3_FUSION_PREMIUM(1).html`, importée depuis la dernière version réalisée dans ChatGPT.

L'application est maintenue dans `src/chef-secteur.html`, puis conservée pour le chargement sous forme gzip + Base64 découpée en huit parties afin de pouvoir être enregistrée intégralement dans le dépôt via le connecteur GitHub. `index.html` reconstitue et charge cette version au démarrage.

## Utilisation

Le projet doit être servi via HTTP/HTTPS pour profiter correctement du manifeste PWA et du service worker. Une fois ouvert dans Safari sur iPhone, il peut être ajouté à l'écran d'accueil depuis le menu Partager.

Les données métier et l'historique sont enregistrés localement dans le navigateur. Les kilomètres calculés par l'application sont des estimations géographiques basées sur les coordonnées GPS et ne correspondent pas à une matrice de trafic routier en temps réel.

## Connexion Google Agenda

Dans les réglages du planning, renseignez un ID client OAuth Google de type « Application Web ». Le projet Google Cloud doit avoir Google Calendar API activée et l’origine de l’application dans les origines JavaScript autorisées. La connexion demande uniquement un accès en lecture aux agendas accessibles. Les journées entièrement occupées ne reçoivent aucune visite et les créneaux horaires décalent les visites suivantes. Une fois connecté, l’agenda est synchronisé à l’ouverture puis toutes les 15 minutes pendant la session.

## Hors ligne

Le service worker met en cache `index.html`, le manifeste et les huit fragments du payload. Après un premier chargement réussi en ligne, l'application peut réutiliser ces ressources depuis le cache.

## Dépôt

`REDNEWT69/Chef-Secteur`
