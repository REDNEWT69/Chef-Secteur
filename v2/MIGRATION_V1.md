# Migration V1 vers V2

## Statut pendant V2-01

**Export V1 réel non disponible pendant V2-01.**

Aucun fichier d'export utilisateur V1 n'a été fourni à ce lot et la recherche dans le dépôt n'a pas identifié de fixture d'export réel pouvant servir de preuve. En conséquence, aucun champ V1 n'est déclaré comme confirmé à partir d'un export réel.

Le code applicatif V1 n'est pas utilisé comme substitut à un export réel pour inventer un contrat de migration.

## Confirmé par lecture d'un export réel

Aucun champ pour l'instant.

## À vérifier avec un export réel

- enveloppe racine et éventuel numéro de version ;
- profil / secteur ;
- magasins et leurs identifiants ;
- historique des visites ;
- visites métier / 6P ;
- actions ;
- rendez-vous ;
- planning et archives de semaines ;
- réglages utilisateur ;
- notes et exclusions éventuelles ;
- données Google Calendar éventuellement persistées ;
- métadonnées de sauvegarde.

## Règle pour le prochain lot de migration

La future migration devra partir d'au moins un export V1 réel, documenter chaque champ observé, conserver les données inconnues ou les signaler explicitement, et échouer de manière lisible plutôt que supprimer ou convertir silencieusement une donnée non comprise.

Aucun code de migration V1 vers V2 n'est inclus dans V2-01.
