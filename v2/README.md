# Store Runner V2

Store Runner V2 est reconstruite en parallèle de la V1, sans recopier sa dette historique. Le dossier `v2/` reste isolé du runtime V1, de son `index.html` et de son service worker, sauf l’exclusion explicite qui empêche justement le service worker V1 d’intercepter `/v2/`.

> Le dossier `v2/` désigne la nouvelle application décidée dans #115. Il ne faut pas le confondre avec l’ancienne propriété V1 `state.businessV2` utilisée pour Visit / Action / 6P.

## État actuel

- **V2-01 — socle + stockage : livré**
- **V2-02 — shell mobile : livré**
- **V2-03 — magasins : livré**
- **V2-04 — planning semaine : prochaine étape**

La V2 publique de test reste accessible sous `https://store-runner.fr/v2/public/`. Elle est en `noindex,nofollow` et ne remplace pas la V1 de production.

## Choix techniques

La V2 utilise uniquement des modules **ESM natifs** (`.mjs`). Il n’y a ni bundler, ni transpilation, ni `package.json` propre à `v2/`, ni dépendance npm de runtime.

Les tests unitaires/comportementaux sont des scripts Node 22 avec `node:assert/strict`. Un faux DOM minimal est maintenu dans `v2/tests/fake-dom.mjs`; aucune dépendance jsdom n’est utilisée.

Le dépôt possède désormais aussi une infrastructure **Playwright + Chromium** dans la Reliability. Elle exécute V1 et V2 sur un viewport mobile **390 × 844** avec interactions tactiles réelles.

## Contrat de données

Le modèle racine reste indépendant du DOM et versionné :

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

Modules du socle :

- `src/core/state.mjs` : création/clonage de l’état V2 ;
- `src/core/validate.mjs` : validation du contrat racine ;
- `src/core/store.mjs` : store central, mises à jour contrôlées et abonnements ;
- `src/storage/persistence.mjs` : sauvegarde/chargement/reset ;
- `src/storage/json-transfer.mjs` : import/export JSON V2 validé.

## Shell mobile

Le shell conserve la propriété exclusive de la structure globale : header, zone principale, écrans et navigation basse.

Modules :

- `src/app/navigation.mjs` : navigation pure, sans DOM ;
- `src/app/shell.mjs` : propriétaire unique de la structure globale ;
- `src/ui/render.mjs` : helpers de rendu DOM ;
- `mountScreen(screenId, node)` : point d’extension officiel pour monter une feature dans un écran.

Règles non négociables :

- une feature ne déplace jamais un élément appartenant au shell ;
- pas de réparation du DOM global après rendu ;
- pas de `MutationObserver` global ;
- pas de rerender déclenché par `focus` ou `visibilitychange` ;
- pas de seconde initialisation silencieuse du shell ;
- un écran métier met à jour uniquement son propre contenu.

## V2-03 — Magasins

`src/stores/stores.mjs` est le propriétaire métier de l’écran Magasins.

Comportement livré :

- lecture de `state.stores` depuis le store central ;
- liste de magasins ;
- recherche enseigne / ville / adresse ;
- recherche insensible aux accents ;
- tap sur une carte pour ouvrir la fiche ;
- fermeture explicite de la fiche ;
- fermeture automatique si le magasin ouvert disparaît du store ;
- aucune recherche ne mute l’état central.

Le shell masque lui-même son placeholder lorsqu’une vraie feature est montée. L’écran Magasins n’est donc plus un placeholder.

Les données publiques de démonstration sont synthétiques et anonymisées. Elles ne doivent jamais être considérées comme des données métier réelles.

## Navigation actuelle

Les quatre onglets restent :

- **Accueil** : placeholder ;
- **Planning** : placeholder, prochaine étape V2-04 ;
- **Magasins** : feature réelle V2-03 ;
- **Plus** : placeholder.

La navigation garantit un seul écran actif et un seul onglet actif. Plusieurs allers-retours ne doivent jamais dupliquer le shell ni installer des listeners en double.

## Mobile

Viewport de référence : **390 × 844**.

Contrats protégés :

- safe-area en haut et en bas ;
- navigation basse fixe ;
- contenu atteignable au-dessus de la navigation ;
- aucune largeur fixe provoquant un overflow horizontal ;
- cibles tactiles principales ≥ 44 px ;
- navigation utilisable après ouverture/fermeture d’un overlay.

## Tests

Tests Node actuellement enregistrés dans la Reliability :

```text
node v2/tests/state.test.mjs
node v2/tests/store.test.mjs
node v2/tests/stores.test.mjs
node v2/tests/storage.test.mjs
node v2/tests/json-transfer.test.mjs
node v2/tests/navigation.test.mjs
node v2/tests/shell.test.mjs
node v2/tests/architecture.test.mjs
node v2/tests/isolation.test.mjs
```

Le job Playwright exécute également :

```text
v2/tests/mobile-browser.spec.cjs
```

Ce test navigateur couvre notamment :

- chargement réel des modules ESM ;
- shell unique ;
- taps sur les 4 onglets ;
- cibles tactiles ;
- absence d’overflow à 390 px ;
- contenu non masqué par la nav basse ;
- V2-03 Magasins : liste, recherche `beta` → `Bêta`, ouverture de fiche, fermeture de l’overlay, navigation encore fonctionnelle ensuite.

Playwright reste **complémentaire** à une validation réelle Safari iOS / Android. Il ne remplace pas #82.

## Publication et isolation

GitHub Pages publie le dépôt entier. `/v2/public/` est donc volontairement accessible comme environnement de test public.

Important :

- `https://store-runner.fr/` reste la V1 ;
- la V1 n’importe aucun module V2 ;
- le service worker V1 exclut `/v2/` de son interception ;
- aucune donnée réelle de secteur ne doit être saisie dans l’environnement V2 public ;
- aucune bascule prod ne sera faite avant parité fonctionnelle, migration sûre et validation mobile réelle.

## Migration V1

Voir `MIGRATION_V1.md`.

Aucun import automatique des vraies données V1 n’est activé à ce stade. La V1 reste la source de vérité utilisateur jusqu’à décision explicite de migration.

## Prochaine étape : V2-04 Planning semaine

Le planning sera reconstruit par couches, sans recopier le moteur historique :

1. contrat de données d’une semaine et des journées ;
2. lecture des magasins depuis le store central ;
3. affichage d’une semaine synthétique ;
4. changement de jour ;
5. génération simple et déterministe ;
6. seulement ensuite trajets, contraintes, multi-semaines et interactions avancées.

Chaque couche doit arriver avec ses tests Node et navigateur avant la suivante.

## Toujours hors périmètre

- vraies données métier ;
- bascule de la V1 ;
- Google Calendar / OAuth ;
- assistant IA ;
- visites / 6P / actions ;
- migration automatique V1 ;
- PWA / service worker propre à V2 ;
- nouvelles fonctionnalités métier non présentes dans la V1.
