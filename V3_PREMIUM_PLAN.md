# Chef Secteur V3 Premium

Branche de travail : `v3-premium`.

Base : `Sector_Planner_PREMIUM_V3_IA.html` retrouvée dans les fichiers du projet.

## Objectif

Reprendre la V3 IA comme base et conserver la version actuellement publiée intacte pendant les tests.

## Première passe prévue / préparée

- design plus proche d'une application iOS : surfaces claires, cartes aérées, navigation compacte, boutons et assistant plus premium ;
- nom d'application `Chef Secteur` ;
- heure de début configurable ;
- durée moyenne d'une visite configurable ;
- heure de fin estimée par journée ;
- estimation routière clairement présentée comme une estimation ;
- assistant renommé en copilote Chef Secteur ;
- diagnostic de semaine plus direct, avec alertes sur les journées longues ;
- conservation du mode local et du mode IA en ligne déjà prévus par la V3 ;
- aucune clé API dans le code public : la vraie IA devra passer par une passerelle sécurisée.

## Sécurité de déploiement

La branche `gh-pages` reste la version publique actuelle jusqu'à validation de la V3 Premium sur iPhone.
