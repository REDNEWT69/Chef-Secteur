# Statut V2

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

La V2 reste isolée sous `/v2/` et ne remplace pas la V1 de production.

## Ce qui manque encore avant une bascule

- visites / 6P / actions ;
- rendez-vous + historique ;
- Google Calendar / OAuth ;
- assistant IA ;
- migration complète des domaines V1 encore non convertis ;
- stratégie PWA/service worker propre à V2 ;
- validation réelle iPhone + Android et plusieurs jours d’usage sans régression bloquante.

Voir `PARITY.md` pour le détail V1 → V2 et `MIGRATION_V1.md` pour le contrat de migration.
