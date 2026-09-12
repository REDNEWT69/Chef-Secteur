# Migration V1 vers V2

## Statut

Un export V1 réel a été fourni et lu : fichier « Sauvegarde complète » produit par l'onglet Données
de la V1 (bouton `Sauvegarde complète`), généré le 2026-09-12 depuis un secteur de 83 magasins.

Ce document décrit ce qui a été **observé dans cet export**. Les champs restés vides dans cet export
sont explicitement marqués « À vérifier » : leur structure interne n'est pas connue et ne doit pas
être devinée depuis le code applicatif.

Aucune donnée personnelle n'est reproduite ici : les exemples sont anonymisés.

## 1. Enveloppe de sauvegarde

Racine du fichier :

| Champ | Type | Observé | Note |
|---|---|---|---|
| `format` | string | `"ChefSecteurBackup"` | constante d'identification du fichier |
| `version` | number | `1` | version de **l'enveloppe**, à ne pas confondre avec `state.schemaVersion` |
| `createdAt` | string | ISO 8601 UTC | horodatage de l'export |
| `state` | object | voir §2 | l'état applicatif complet |
| `archive` | object | voir §3 | archives de planning par semaine |
| `range` | object \| null | `null` | période multi-semaines ; **À vérifier** quand non nulle |
| `catalog` | array | `[]` | **À vérifier** |

**Point d'attention pour le convertisseur** : il y a deux numéros de version indépendants.
`version` (enveloppe) vaut 1, `state.schemaVersion` vaut 5. La migration doit s'appuyer sur
`state.schemaVersion`, pas sur `version`.

## 2. `state`

| Champ | Type | Observé | Destination V2 |
|---|---|---|---|
| `schemaVersion` | number | `5` | sert à router la migration |
| `profile` | object | §2.1 | `profile` |
| `stores` | array | 83 entrées, §2.2 | `stores` |
| `visits` | object (map) | `{}` | `visits` — **À vérifier** |
| `notes` | object (map) | `{}` | **À vérifier** |
| `included` | object (map) | `{}` | **À vérifier** |
| `excluded` | object (map) | `{}` | **À vérifier** |
| `locks` | object (map) | `{}` | **À vérifier** |
| `plan` | object | §2.4 | `planning` |
| `settings` | object | §2.5 | `settings` |
| `ui` | object | `{ "firstRun": false }` | non migré (état d'interface) |
| `appointments` | array | `[]` | `appointments` — **À vérifier** |
| `calendarEvents` | array | §2.6 | voir §4, décision à prendre |
| `calendarLastSync` | string | ISO 8601 UTC | cache Agenda, voir §4 |

Il n'existe pas de champ `actions` à la racine de `state`. Le domaine Actions du workflow 6P n'a
donc pas de conteneur propre dans cet export : soit il est imbriqué dans `visits`, soit il n'était
pas encore alimenté. **À vérifier** avec un export contenant au moins une visite terminée.

### 2.1 `profile`

| Champ | Type | Exemple anonymisé |
|---|---|---|
| `sectorName` | string | `"Rhône-Alpes"` |
| `repName` | string | `""` (vide dans cet export) |
| `baseName` | string | `"ville"` — saisi par l'utilisateur, casse non normalisée |
| `baseAddress` | string | adresse longue renvoyée par Nominatim, avec pays et région |
| `baseLat` | number | `45.738018` |
| `baseLon` | number | `4.756211` |
| `overnightMode` | string | `"auto"` |
| `overnightMinSaving` | number | `80` |

`baseName` est brut (minuscules possibles) : la V2 ne doit pas supposer une capitalisation.

### 2.2 `stores`

83 entrées. **Les 15 champs suivants sont présents sur la totalité des entrées, aucun n'est optionnel
dans cet export** :

| Champ | Type | Valeurs observées |
|---|---|---|
| `id` | string | `"s1"` … `"s83"`, plus `"s100"` — numérotation non continue (`s58` absent), tous uniques |
| `enseigne` | string | Boulanger, Carrefour, Conforama, Cuisinella, Darty, Fnac |
| `ville` | string | libre |
| `adresse` | string | libre, parfois vide de numéro |
| `dept` | string | code sur deux caractères, `"01"` … `"73"` — **string, pas number** (zéro initial significatif) |
| `deptName` | string | `"Ain"`, `"Rhône"`, … |
| `type` | string | `"Gros"`, `"Moyen"`, `"Petit"` |
| `freq` | string | `"Hebdo"`, `"Bi-mensuel"`, `"Mensuel"` |
| `lat` | number | |
| `lon` | number | |
| `priority` | number | `2`, `3`, `5` |
| `intervalDays` | number | `7`, `15`, `30` |
| `products` | array de string | `"À confirmer"`, `"Blanc"`, `"Brun"`, `"Encastrable"` |
| `active` | boolean | `true` partout dans cet export ; `false` **À vérifier** |
| `source` | string | `"Secteur initial"` ; les autres valeurs (import IA, annuaire OpenStreetMap) sont **À vérifier** |

Corrélations observées, à ne pas coder en dur sans confirmation : `type: Gros` va avec
`freq: Hebdo` / `priority: 5` / `intervalDays: 7`, `Moyen` avec `Bi-mensuel` / `3` / `15`,
`Petit` avec `Mensuel` / `2` / `30`.

### 2.3 Conteneurs vides

`visits`, `notes`, `included`, `excluded`, `locks` sont des **objets** (des tables indexées), pas des
tableaux. Leurs clés et la forme de leurs valeurs sont **À vérifier** : cet export les livre vides.
C'est la lacune principale de ce document, et elle concerne le domaine métier V2 (Visit / Action / 6P).

### 2.4 `plan`

Objet indexé par nom de jour en français. Dans cet export il ne contient **qu'une seule clé**,
`"Samedi": []`, alors que les jours travaillés configurés sont Lundi à Vendredi.

Le convertisseur ne doit donc pas supposer que `plan` contient les six jours, ni que ses clés
correspondent à `settings.days`. Les valeurs sont des tableaux de magasins ; leur forme exacte
(objet magasin complet ou référence par `id`) est **À vérifier** sur un export avec un planning
non vide.

### 2.5 `settings`

| Champ | Type | Observé |
|---|---|---|
| `target` | number | `20` |
| `days` | array de string | `["Lundi","Mardi","Mercredi","Jeudi","Vendredi"]` |
| `brands` | array de string | les 6 enseignes |
| `products` | array | `[]` |
| `strategy` | string | `"balanced"` |
| `weekDate` | string | `"2026-09-11"` — c'est un **vendredi**, donc pas nécessairement un lundi |
| `startTime` / `endTime` | string | `"08:30"` / `"18:00"` |
| `visitMinutes` | number | `60` |
| `saturdayStart` / `saturdayEnd` | string | `"08:00"` / `"12:00"` |
| `visitCreditsByBrand` | object | clés en **minuscules** : `{"darty":2,"boulanger":2,"carrefour":2}` |
| `maxVisitsPerDay` | number | `4` |

Deux pièges : `weekDate` n'est pas garanti être un lundi, et les clés de `visitCreditsByBrand` sont
en minuscules alors que `stores[].enseigne` et `settings.brands` sont capitalisés. Toute
correspondance entre les deux doit normaliser la casse.

### 2.6 `calendarEvents`

Tableau d'événements Google Agenda mis en cache localement. Champs observés sur chaque entrée :

`id`, `title`, `location`, `calendar`, `date`, `start`, `end`, `allDay`, `source`.

- `allDay: true` → `start` et `end` sont des dates `YYYY-MM-DD`, et `end` est **exclusif**
  (un événement du 8 au 10 inclus porte `end: "2026-09-11"`).
- `allDay: false` → `start` et `end` sont des horodatages ISO avec décalage horaire.
- `source` vaut `"google"`.
- `calendar` et `id` contiennent l'adresse e-mail du compte Google.

## 3. `archive`

Objet indexé par date ISO du lundi de la semaine. Chaque entrée observée :

```
"2026-09-07": { "weekMonday": "2026-09-07", "plan": { "Lundi": [], ... "Samedi": [] } }
```

Contrairement à `state.plan`, le `plan` archivé contient bien les six jours. La clé de l'objet et
le champ `weekMonday` sont redondants dans cet export ; on ignore s'ils peuvent diverger.

## 4. Données personnelles — décision à prendre avant d'écrire le convertisseur

L'export contient des données qui ne sont pas du référentiel métier :

- `calendarEvents` : titres, lieux et horaires d'événements privés (hôtels, trains, rendez-vous) ;
- `calendar` et `id` d'événement : l'adresse e-mail du compte Google ;
- `profile.baseAddress`, `baseLat`, `baseLon` : l'adresse de départ, souvent le domicile.

Recommandation : la V2 **ne migre pas** `calendarEvents` ni `calendarLastSync`. Ce sont des données
de cache reconstructibles par une synchronisation Agenda, et les recopier dans un nouveau stockage
prolonge leur durée de vie sans bénéfice. Décision à valider explicitement avant le lot migration.

Aucun export réel ne doit être versionné dans le dépôt, qui est public. Les fixtures de test doivent
être synthétiques et anonymisées.

## 5. Ce qui reste à obtenir

Un second export, pris après usage réel, contenant au minimum :

- une semaine générée (pour `plan` et `archive` non vides) ;
- une visite préparée, en cours et terminée (pour `visits`, et pour localiser les Actions et le 6P) ;
- un rendez-vous (pour `appointments`) ;
- un magasin désactivé, un magasin verrouillé, un magasin exclu (pour `active: false`, `locks`, `excluded`) ;
- un magasin ajouté autrement que par le secteur initial (pour les autres valeurs de `source`) ;
- une période multi-semaines enregistrée (pour `range` non nul).

Tant que ces cas ne sont pas observés, le convertisseur ne doit traiter que `profile`, `stores`,
`settings`, `plan` et `archive`, et **refuser bruyamment** tout champ inconnu ou non vide qu'il ne
sait pas convertir — jamais l'ignorer en silence.
