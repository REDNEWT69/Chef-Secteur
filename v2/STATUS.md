# Statut V2

## À ne pas confondre

- **Store Runner V1 = la production.** `index.html`, `src/chef-secteur.html` et les modules racine, publiés sur `https://store-runner.fr/`. Version courante **V230**. Visit, Action, 6P, Opportunity, Espace Cuisinistes et pilotage performance y sont **livrés**.
- **`/v2/` = ce document.** Chantier parallèle **incomplet**, isolé du runtime V1 : aucun fichier de `v2/` n'est chargé par `index.html` ni mis en cache par `sw.js`. Aucune date de bascule n'est décidée.

Un lot V1 ne touche pas `v2/`, et un lot V2 ne touche pas le runtime V1.

État réel du chantier #115 sur `main` :

- V2-01 — socle + stockage : livré
- V2-02 — shell mobile : livré
- V2-03 — magasins : livré
- V2-04 — planning semaine déterministe : livré
- V2-04b — navigation entre les semaines : livré
- V2-04c — rotation équilibrée entre les semaines : livré
- V2-05a — swipe tactile entre les jours : livré
- V2-06 — génération de 3 semaines en tournée escargot : livré
- V2-07 — import local d’une sauvegarde V1 + persistance : livré
- Outils terrain du planning (départ, préparation TeamHaven, workflow mobile) : livrés dans l’environnement V2 de test

La V2 reste isolée sous `/v2/` et ne remplace pas la V1 de production. Les lots livrés côté V2 le sont **dans l'environnement V2**, pas en production : un lot marqué « livré » ci-dessus ne dit rien de la V1, qui possède déjà ses propres versions de ces fonctions.

## Lot V2-08A — #355 / PR #364

Socle Visites natif implémenté dans cette PR : démarrage, fin, annulation,
historique terminé par magasin et dernière visite dans la fiche. La sauvegarde
locale précède la mise à jour du store ; une erreur reste visible sans faux succès.
Les tests Node et mobile 390×844 couvrent le reload, la réouverture et les réimports.

Migration limitée au contrat réellement observé : `state.visits: {}` donne zéro
visite. Tout contenu peuplé ou ambigu est signalé comme non migré, sans déduire
`lastVisit` ou `history`. Les visites V2 existantes sont conservées au réimport.
Cette étape ne constitue pas une parité Visites V1 ni une bascule de production.

## Ce qui manque encore avant une bascule

- parité complète Visites V1, puis 6P / actions ;
- rendez-vous + historique **côté V2** — la V1 de production les a déjà, cette ligne ne parle que du chantier `/v2/` ;
- Google Calendar / OAuth ;
- assistant IA ;
- migration complète des domaines V1 encore non convertis ;
- stratégie PWA/service worker propre à V2 ;
- validation réelle iPhone + Android et plusieurs jours d’usage sans régression bloquante.

Voir `PARITY.md` pour le détail V1 → V2 et `MIGRATION_V1.md` pour le contrat de migration.
