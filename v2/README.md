# Store Runner V2

Store Runner V2 est reconstruite en parallèle de la V1, sans recopier sa dette historique. Le dossier `v2/` reste isolé du runtime V1. Le service worker V1 connaît uniquement `/v2/` pour l’exclure explicitement de son interception.

> Le dossier `v2/` désigne la nouvelle application décidée dans #115. Il ne faut pas le confondre avec l’ancienne propriété V1 `state.businessV2` utilisée par Visit / Action / Opportunity.

## État réel

Le chantier est plus avancé que l’ancien README ne l’indiquait :

- **V2-01 — socle + stockage : livré**
- **V2-02 — shell mobile : livré**
- **V2-03 — magasins : livré**
- **V2-04 — planning semaine déterministe : livré**
- **V2-04b — navigation entre semaines : livré**
- **V2-04c — rotation équilibrée : livré**
- **V2-05a — swipe tactile entre jours : livré**
- **V2-06 — génération 3 semaines en tournée escargot : livré**
- **V2-07 — import local V1 + persistance : livré**
- **Outils terrain du planning : livrés dans l’environnement de test**

La V2 publique de test reste accessible sous `https://store-runner.fr/v2/public/`. Elle est en `noindex,nofollow` et ne remplace pas la V1 de production.

## Choix techniques

La V2 utilise des modules **ESM natifs** (`.mjs`) sans bundler ni dépendance npm de runtime.

Le contrat racine reste indépendant du DOM et versionné :

```json
{
  "version": 2,
  "profile": {},
  "stores": [],
  "visits": [],
  "actions": [],
  "appointments": [],
  "planning": {},
  "settings": {}
}
```

Socle principal :

- `src/core/state.mjs` : état V2 ;
- `src/core/validate.mjs` : validation du contrat ;
- `src/core/store.mjs` : store central et abonnements ;
- `src/storage/persistence.mjs` : sauvegarde / chargement / reset ;
- `src/storage/json-transfer.mjs` : import / export JSON validé ;
- `src/migration/v1-backup.mjs` : pont local et explicite depuis une sauvegarde V1.

## Shell et écrans

`src/app/shell.mjs` reste l’unique propriétaire de la structure globale : header, zone principale, écrans et navigation basse. Une feature ne doit modifier que son propre contenu.

Les quatre onglets sont toujours :

- **Accueil** : encore léger / non paritaire avec la V1 ;
- **Planning** : feature réelle ;
- **Magasins** : feature réelle ;
- **Plus** : contient les outils de données, notamment l’import local V1.

Le point d’entrée public monte actuellement :

- `createPlanningFeature` ;
- `createTerrainToolsFeature` ;
- `createPlanningRangeFeature` ;
- `createStoresFeature` ;
- `createDataToolsFeature`.

## Planning V2

Le planning n’est plus un placeholder. Les modules actuels sont :

- `src/planning/planning.mjs` : écran et génération semaine ;
- `src/planning/week.mjs` : contrat / logique semaine ;
- `src/planning/range.mjs` : génération multi-semaines ;
- `src/planning/range-ui.mjs` : UI de période ;
- `src/planning/terrain-tools.mjs` : outils terrain ;
- `src/planning/teamhaven.mjs` : préparation TeamHaven.

Les jalons déjà livrés couvrent une génération déterministe, la navigation entre semaines, une rotation équilibrée, le swipe tactile entre jours et une tournée escargot sur trois semaines. Les apprentissages récents de la V1 servent de contrat métier vivant, mais le code V1 ne doit pas être recopié dans la V2.

## Magasins

`src/stores/stores.mjs` est le propriétaire métier de l’écran Magasins.

Comportement livré : liste, recherche enseigne / ville / adresse, recherche insensible aux accents, fiche magasin, fermeture explicite et mise à jour sûre lorsque le magasin disparaît du store.

Les données publiques de démonstration sont synthétiques et anonymisées. Elles ne doivent jamais être considérées comme des données métier réelles.

## Migration V1

Le pont `src/migration/v1-backup.mjs` est déjà opérationnel pour le sous-ensemble sûr nécessaire au démarrage de la V2 :

- profil ;
- magasins ;
- réglages ;
- exclusions planning connues ;
- persistance locale du résultat.

Il valide explicitement le format `ChefSecteurBackup`, la version d’enveloppe et le schéma V1 attendu. Il ne modifie jamais le fichier source.

Les domaines encore non migrés sont signalés dans le rapport plutôt qu’ignorés silencieusement, notamment visites, notes, locks, rendez-vous, actions, `businessV2` et cache Google Agenda. Voir `MIGRATION_V1.md` et `PARITY.md`.

La V1 reste la source de vérité utilisateur tant qu’une migration complète et la parité fonctionnelle ne sont pas validées.

## Mobile et tests

Viewport de référence : **390 × 844**.

Contrats protégés : safe-area, navigation basse fixe, absence d’overflow horizontal, cibles tactiles principales ≥ 44 px, swipe horizontal sans casser le scroll vertical et navigation utilisable après overlays.

La Reliability contient les tests V2 du socle, du store, du stockage, des magasins, du shell, de l’isolation, de la migration V1 et du planning. Les tests navigateur couvrent également le shell, les magasins, le planning, les périodes, les outils terrain et l’import V1.

Playwright reste complémentaire à une validation réelle Safari iOS / Android. Il ne remplace pas le ticket #82.

## Publication et isolation

- `https://store-runner.fr/` reste la V1 de production ;
- `/v2/public/` reste un environnement de test ;
- la V1 n’importe aucun module V2 ;
- le service worker V1 n’intercepte pas `/v2/` ;
- aucune donnée réelle ne doit être saisie dans l’environnement public de démonstration ;
- aucune bascule production ne doit être faite avant parité, migration sûre et validation mobile réelle.

## Reste à construire avant parité

La priorité n’est plus de reconstruire le planning de base : il existe déjà. Le reste principal est désormais :

1. visites / 6P / actions ;
2. rendez-vous + historique ;
3. migration V1 de ces domaines sans perte ;
4. Google Calendar / OAuth une fois le cœur stable ;
5. assistant IA en dernier ;
6. stratégie PWA / mise à jour propre à V2 ;
7. validation réelle iPhone + Android ;
8. plusieurs jours d’utilisation sans régression bloquante avant toute bascule.

Le détail de parité est maintenu dans `PARITY.md`.
