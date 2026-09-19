# Prochain enchaînement V2

Ce fichier cadence les prochains lots après le socle Visites sans rouvrir la V1 de production.

## Lot en cours

- #355 — V2-08A : socle Visites + migration conservatrice V1.

## Lot suivant, seulement après fusion de #355

### V2-08B — 6P / Actions terrain

Dépendance : utiliser le modèle Visites V2 livré par #355 comme propriétaire des interactions terrain. Ne pas créer un second modèle parallèle.

Périmètre visé :

- actions rattachées explicitement à un magasin et, lorsqu'il y en a une, à une visite ;
- statuts simples et déterministes : à faire, en cours, terminée, annulée si nécessaire ;
- échéance facultative et note courte ;
- historique lisible depuis la fiche magasin et depuis la visite ;
- persistance/reload via le store V2 ;
- migration conservatrice des actions V1 reconnues ;
- import idempotent ;
- mobile 390×844 ;
- aucun Google Calendar, IA, opportunités ou PWA propre à V2 dans ce lot.

Critère clé : une action ne doit jamais modifier le planning ni servir de mécanisme implicite de verrouillage d'une visite.

## Après V2-08B

- rendez-vous + historique ;
- migration des domaines V1 encore non convertis ;
- Google Calendar / OAuth ;
- assistant IA ;
- stratégie PWA/service worker propre à V2 ;
- validation réelle Android/iPhone avant toute bascule.

La V1/V226 reste la production de référence jusqu'à parité et validation terrain.
