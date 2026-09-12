# Store Runner V2

Store Runner V2 est reconstruit en parallèle de la V1. Ce dossier reste volontairement isolé de `index.html`, du service worker de production et du runtime historique.

> Terminologie : le dossier `v2/` désigne la **nouvelle application Store Runner V2** décidée dans #115. Il ne faut pas le confondre avec la propriété historique `state.businessV2`, déjà utilisée dans la V1 pour le domaine Visit/Action/6P. Aucun code de ce domaine historique n'est recopié ici.

V2-01 a posé le socle de données et de stockage (aucun écran métier). V2-02 construit **uniquement le shell mobile** : structure de page, navigation entre écrans placeholders, points d'extension. Toujours aucune feature métier.

## Choix techniques

Les modules utilisent **ESM natif** (`.mjs`) afin d'être importables directement par Node 22 et par `<script type="module">` dans un navigateur. Il n'y a ni bundler, ni transpilation, ni dépendance npm, ni `package.json` propre à la V2.

Les tests sont des scripts Node autonomes utilisant `node:assert/strict`. Installer jsdom ou toute autre bibliothèque de simulation DOM est interdit ; un faux document minimal, écrit à la main dans `v2/tests/`, est utilisé à la place (voir `v2/tests/fake-dom.mjs`).

## Modèle de données V2 (V2-01)

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

### Données et stockage (V2-01)

- `src/core/state.mjs` : version du schéma, création d'un état vide et clonage JSON.
- `src/core/validate.mjs` : validation explicite du contrat racine avec erreurs indiquant le champ fautif.
- `src/core/store.mjs` : store central minimal, remplacement validé, mise à jour contrôlée et abonnements.
- `src/storage/persistence.mjs` : sauvegarde/chargement/reset avec stockage injectable.
- `src/storage/json-transfer.mjs` : import/export JSON V2 validé.

### Shell mobile (V2-02)

- `src/app/navigation.mjs` : logique de navigation **pure**, sans DOM — la liste des écrans valides (`SCREEN_IDS`) et l'écran actif courant.
- `src/app/shell.mjs` : **propriétaire unique** de la structure globale de la page.
- `src/ui/render.mjs` : aides de rendu DOM pures (construction d'un écran, d'un onglet, bascule d'état actif). Elles ne décident d'aucune structure globale : c'est `shell.mjs` qui les assemble.

## Principe architectural : un seul propriétaire du DOM global

Le shell (`src/app/shell.mjs`) est seul autorisé à créer la structure principale (header / zone principale / navigation basse), créer ou retirer des zones racines, et décider où les écrans sont montés.

Les autres modules ne doivent **pas** :
- déplacer un élément créé par un autre module ;
- faire `appendChild`/`insertAdjacentElement` pour « réparer » l'ordre global ;
- réorganiser la page après le rendu ;
- scanner le DOM global pour corriger ce qu'un autre module a produit ;
- installer un `MutationObserver` global pour remettre l'interface en ordre.

```
structure -> créée une fois
  ↓
slots explicites
  ↓
features montées dans leurs slots
```

Si une feature a besoin de déplacer quelque chose qui appartient au shell, c'est l'API du shell qui est incomplète : on étend cette API, jamais le DOM en douce.

### Points d'extension exposés par le shell

- `getSlot('main')` : la zone principale, contenant les écrans.
- `getSlot('header-actions')` : zone dédiée aux actions d'en-tête (icônes, badges…).
- `mountScreen(screenId, node)` : monte un nœud à l'intérieur d'un écran existant (par ex. pour brancher une future feature dans l'écran « Planning »), sans jamais chercher un élément arbitraire dans tout le document.

### Contrat d'initialisation

`createShell({ document, root, screens, initialScreen })` construit la structure une seule fois et pose un marqueur sur l'élément racine de montage. **Une seconde initialisation sur la même racine est explicitement refusée** (`ShellError`), plutôt que d'être idempotente en silence : appeler `createShell` deux fois sur la même racine ne crée jamais un second header/main/nav et n'installe jamais de listener en double.

Le shell reçoit son document en paramètre (`createShell({ document, ... })`) au lieu d'aller le chercher dans une variable globale, avec un repli sur `globalThis.document` par défaut pour l'usage navigateur — ce qui le rend testable sans navigateur.

## Navigation

4 écrans placeholders : **Accueil**, **Planning**, **Magasins**, **Plus**. Chaque écran affiche seulement son titre et une phrase indiquant qu'il s'agit d'un placeholder V2 — aucune logique métier.

Contrats vérifiés par `v2/tests/shell.test.mjs` et `v2/tests/navigation.test.mjs` :
- un tap sur un onglet change d'écran ;
- un seul onglet et un seul écran actifs à la fois ;
- un écran inconnu est refusé clairement, sans mutation d'état ni de DOM ;
- changer plusieurs fois d'écran n'installe jamais de listener en double ;
- pas de rechargement de page, pas de mutation structurelle globale.

Le navigateur back/forward n'est pas géré dans V2-02.

## Règles anti-rerender (héritées des bugs V1)

Interdits dans `v2/src` — vérifiés par `v2/tests/architecture.test.mjs` (test de source, pas de comportement) :
- `window.addEventListener('focus', ...)` pour redéclencher un rendu ;
- `document.addEventListener('visibilitychange', ...)` pour redéclencher un rendu ;
- `MutationObserver` global utilisé pour remettre le DOM en ordre.

Un écran peut mettre à jour **son** contenu ; il ne peut jamais restructurer le shell global. Pas de `<details>` imbriqué utilisé comme conteneur d'une feature importante.

## Règles mobile

Viewport de référence : **390 × 844** (iPhone). `v2/public/app.css` a été écrit pour ce viewport dès le départ, sans copier les feuilles de style de la V1 :
- `safe-area-inset-top` (en-tête) et `safe-area-inset-bottom` (navigation basse) ;
- la navigation basse ne masque jamais le contenu (la zone principale réserve la hauteur de la navigation dans son `padding-bottom`) ;
- aucune largeur fixe ne provoque de dépassement horizontal (`min-width: 0` sur les conteneurs flex, `overflow-wrap: anywhere` sur les textes) ;
- cibles tactiles principales ≥ 44px (`.srv2-tab`).

## Tests

Depuis la racine du dépôt :

```text
node v2/tests/state.test.mjs
node v2/tests/store.test.mjs
node v2/tests/storage.test.mjs
node v2/tests/json-transfer.test.mjs
node v2/tests/navigation.test.mjs
node v2/tests/shell.test.mjs
node v2/tests/architecture.test.mjs
node v2/tests/isolation.test.mjs
```

Deux familles de tests, à ne pas confondre :
- **comportement** (`shell.test.mjs`, `navigation.test.mjs`, et les tests V2-01) : exécutent le code avec un faux document ou sans DOM, et vérifient ce qu'il fait réellement ;
- **source** (`architecture.test.mjs`, `isolation.test.mjs`) : lisent le code et interdisent un motif précis (focus/visibilitychange, `MutationObserver`, dépendance npm, chemin `/v2/` codé en dur dans `sw.js`) ; ils ne prouvent aucun comportement, seulement l'absence d'un motif.

V2-02 n'introduit ni Playwright, ni npm, ni `package.json` : le dépôt ne possède actuellement aucune infrastructure de test navigateur automatisé. Un ticket dédié (« V2 : test navigateur mobile automatisé ») suit ce besoin séparément.

## Publication : URL de test publique `/v2/public/`

Le workflow GitHub Pages publie le dépôt entier (`path: .`). Après fusion de V2-02, le shell est donc accessible publiquement à `https://store-runner.fr/v2/public/`. C'est volontaire, pour permettre la validation sur un vrai iPhone — `v2/public/index.html` porte `<meta name="robots" content="noindex,nofollow">`.

Important :
- la racine `https://store-runner.fr/` n'est pas modifiée par ce lot ;
- la V1 ne charge et n'importe jamais de code V2 ;
- la publication de `/v2/public/` ne fait pas de la V2 la production principale.

### Tester V2 sur un appareil qui a déjà la PWA V1 installée

1. ouvrir d'abord la racine du site ;
2. laisser la racine se recharger jusqu'à ce que la nouvelle révision soit active (un seul rechargement ne suffit pas toujours selon l'état du service worker) ;
3. seulement ensuite ouvrir `/v2/public/`.

Sinon l'ancien service worker peut encore contrôler la page et servir ou mettre en cache des ressources V2 selon son ancienne logique.

### Données pendant la phase de test

Tant que V2 reste un environnement de test public séparé de la V1 :
- utiliser uniquement des données synthétiques/anonymisées ;
- ne pas saisir le secteur réel ni des données métier réelles ;
- ne pas considérer le stockage V2 comme source de vérité utilisateur.

La bascule vers de vraies données ne pourra commencer qu'après validation explicite de la stratégie de migration et de coexistence V1/V2.

## Validation encore nécessaire sur vrai iPhone

Après fusion et déploiement de V2-02 :
1. d'abord, sur un navigateur de bureau, ouvrir `/v2/public/` et vérifier que le shell s'affiche réellement — aucun test de ce lot ne couvre le chargement réel des modules ESM servis par GitHub Pages ;
2. puis, sur un vrai iPhone (en suivant la procédure PWA ci-dessus si la V1 y est déjà installée) : taps sur les 4 onglets, absence de dépassement horizontal, contenu non masqué par la navigation basse, cibles tactiles confortables.

Si les fichiers `.mjs` ne sont pas servis avec un type MIME JavaScript, les imports échoueront en silence : le signaler et ouvrir un ticket, ne jamais contourner en ajoutant un bundler ou en renommant les fichiers sans décision explicite.

## Migration V1

Voir `MIGRATION_V1.md`. Aucun code de migration n'est introduit dans V2-02.

## Isolation V1 / V2

`v2/tests/isolation.test.mjs` protège la V1 : elle ne charge, n'importe, ne pré-cache et ne sert aucun fichier de `v2/`. Depuis V2-02, `sw.js` connaît le préfixe `/v2/`, mais **uniquement** pour l'exclure explicitement de son interception (calculé depuis `SCOPE`, jamais codé en dur), avant toute logique de cache — cette exception technique est ce qui garantit justement l'isolation des deux applications.

## Hors périmètre de V2-02

- aucun magasin réel, aucun catalogue magasins V2 ;
- aucun planning réel, aucune visite, aucun 6P ;
- aucun Google Calendar / OAuth, aucun assistant ;
- aucune migration V1 réelle ;
- aucune PWA / service worker propre à V2 ;
- aucune modification de `store-runner.fr` en dehors de l'exclusion `sw.js` décrite ci-dessus ;
- aucun test navigateur automatisé (voir le ticket dédié) ;
- pas de routeur SPA complet, pas de back/forward.
