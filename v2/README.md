# Store Runner V2

Store Runner V2 est reconstruit en parallèle de la V1. Ce dossier reste volontairement isolé de `index.html`, du service worker de production et du runtime historique.

V2-01 pose uniquement le socle de données et de stockage. Aucun écran métier n'est branché ici.

## Choix techniques

Les modules utilisent **ESM natif** (`.mjs`) afin d'être importables directement par Node 22 et, plus tard, par `<script type="module">` dans un navigateur. Il n'y a ni bundler, ni transpilation, ni dépendance npm, ni `package.json` propre à la V2.

Les tests sont des scripts Node autonomes utilisant `node:assert/strict`.

## Modèle de données V2

Le contrat minimal est versionné :

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

Le modèle ne dépend pas du DOM.

## Modules

- `src/core/state.mjs` : version du schéma, création d'un état vide et clonage JSON.
- `src/core/validate.mjs` : validation explicite du contrat racine avec erreurs indiquant le champ fautif.
- `src/core/store.mjs` : store central minimal, remplacement validé, mise à jour contrôlée et abonnements.
- `src/storage/persistence.mjs` : sauvegarde/chargement/reset avec stockage injectable.
- `src/storage/json-transfer.mjs` : import/export JSON V2 validé.

## Stockage

La seule clé V2 utilisée par ce lot est :

```text
store_runner_v2_state
```

Les fonctions de stockage exigent une interface injectable `getItem` / `setItem` / `removeItem`, ce qui permet de tester la persistance sans navigateur. Le reset ne supprime que la clé V2.

## Tests

Depuis la racine du dépôt :

```text
node v2/tests/state.test.mjs
node v2/tests/store.test.mjs
node v2/tests/storage.test.mjs
node v2/tests/json-transfer.test.mjs
node v2/tests/isolation.test.mjs
```

Ces tests vérifient le schéma, l'indépendance des états vides, le store, la persistance, les erreurs d'import, les fixtures et l'absence de chargement/cache de `v2/` par la production actuelle.

## Migration V1

Voir `MIGRATION_V1.md`. Aucun code de migration n'est introduit dans V2-01. Un export V1 réel sera nécessaire avant de définir le mapping, afin de ne pas transformer des suppositions sur le code historique en contrat de données.

## Hors périmètre de V2-01

- aucune UI métier ;
- aucun planning V2 ;
- aucun catalogue magasins V2 ;
- aucune PWA V2 ;
- aucun service worker V2 ;
- aucun Google Calendar / OAuth ;
- aucune modification de `store-runner.fr` ;
- aucun code de migration V1 vers V2.

Principe architectural : **un module crée son comportement, aucun autre module ne vient le réparer silencieusement après coup.**
