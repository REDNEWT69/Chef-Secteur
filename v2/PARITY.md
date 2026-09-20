# Parité V1 → V2

Cette matrice décrit l’état réellement présent dans le dépôt. Elle sert à éviter de reconstruire deux fois ce qui existe déjà et à empêcher une bascule prématurée de la V1.

## Fonctionnalités

| Domaine | V1 production | V2 actuelle | État V2 | Reste avant parité |
|---|---|---|---|---|
| Socle / état central | oui | `src/core/*` | livré | validation continue |
| Stockage local | oui | `src/storage/*` | livré | valider sur vrais appareils et gros états |
| Import / export V2 | oui | `src/storage/json-transfer.mjs` | livré | maintenir la compatibilité du schéma |
| Magasins | oui | `src/stores/stores.mjs` | livré | compléter uniquement les comportements V1 réellement utilisés qui manquent |
| Planning semaine | oui | `src/planning/planning.mjs`, `week.mjs` | livré | reprendre les règles métier validées en V1 sans recopier son architecture |
| Navigation jours / swipe | oui | `src/ui/horizontal-swipe.mjs` | livré | validation réelle tactile |
| Multi-semaines | oui | `src/planning/range.mjs`, `range-ui.mjs` | livré | consolider les contraintes métier finales |
| Tournée 3 semaines / rotation | oui | moteur V2 planning | livré | validation terrain |
| Outils terrain planning | oui | `terrain-tools.mjs`, `teamhaven.mjs` | livré en test | vérifier la parité d’usage réelle |
| Visites | oui | `src/visits/*`, fiche magasin, stockage local | socle natif V2-08A (#355) | observer un export V1 peuplé avant sa migration ; validation terrain |
| 6P / Actions | oui | conteneur `actions` dans le schéma seulement | manquant | reconstruire après Visit |
| Opportunités | oui | non migrées depuis `businessV2` | manquant | décider du modèle V2 après Visit / Action |
| Rendez-vous / historique | oui | conteneur `appointments` seulement | manquant | construire UI + persistance + migration |
| Google Calendar / OAuth | oui | absent | volontairement différé | intégrer après stabilité du cœur |
| Assistant IA | oui | absent | volontairement différé | intégrer en dernier |
| PWA / mise à jour V2 | V1 possède son SW | aucun SW V2 propre | manquant | définir stratégie de cache/version distincte |

## Migration V1 déjà opérationnelle

`src/migration/v1-backup.mjs` convertit localement un backup V1 sans réseau et sans modifier la source.

Actuellement migrés :

- profil ;
- magasins ;
- réglages ;
- exclusions de magasins connues ;
- persistance du nouvel état V2.

Actuellement non migrés et signalés dans le rapport :

- visites V1 peuplées ou ambiguës (seul `{}` est reconnu, avec zéro visite) ;
- notes ;
- inclusions / locks ;
- rendez-vous ;
- actions ;
- `businessV2` ;
- cache Google Agenda ;
- archive / range / catalog lorsque présents.

Le réimport conserve les visites V2 existantes sans doublons ; il refuse un secteur qui omet un magasin lié à ces visites. Aucun historique V1 n’est inféré de `lastVisit` ou `history`.

Le convertisseur doit rester conservateur : aucune donnée non comprise ne doit être transformée par approximation.

## Conditions de bascule

La V1 reste la source de vérité jusqu’à ce que les points suivants soient tous satisfaits :

- fonctions métier réellement utilisées disponibles en V2 ;
- migration d’un export V1 réel complet sans perte des domaines conservés ;
- sauvegarde / fermeture / réouverture fiables ;
- tests Node + navigateur verts ;
- validation manuelle Android et iPhone ;
- pas d’overflow ou de blocage tactile à 390 px ;
- stratégie de mise à jour V2 testée ;
- plusieurs jours d’utilisation terrain sans régression bloquante ;
- retour arrière vers la V1 encore possible pendant la période de validation.

## Règle de développement

Les corrections de V1 sont un **cahier des charges vivant**. Elles peuvent révéler une règle métier ou un cas limite à reproduire dans V2, mais le correctif V1 lui-même ne doit pas être copié aveuglément dans le nouveau moteur.
