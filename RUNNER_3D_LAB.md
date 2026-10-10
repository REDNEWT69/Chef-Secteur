# Runner 3D Lab — audit d'hébergement et plan

Statut : **prototype publié** (artefact privé, phase 1). Aucune modification de la production.
Base : `main` 033bbf7 (V279). Branche : `claude/runner-3d-lab`. PR Draft « NE PAS FUSIONNER ».

## But
Permettre de comparer sur téléphone « Runner actuel » (`runner-visual.js`, intact) et « Runner 3D »
(image de `runner-whats-new.webp` et variantes), avec des données fictives, avant toute décision de migration.

## Pourquoi pas le workflow actuel
`.github/workflows/deploy-pages.yml` publie **tout le dépôt** (`path: .`) sur `store-runner.fr` à chaque push sur `main`.
GitHub Pages n'offre qu'un site par dépôt et aucune préversion par branche. Tout fichier du Lab fusionné dans `main`
serait donc publié sur la production. Conséquences posées d'emblée :
- le Lab **ne se fusionne jamais dans `main`** ; la PR reste Draft « NE PAS FUSIONNER » ;
- aucun fichier du Lab n'est chargé par `index.html` ni mis en cache par `sw.js` ;
- aucun changement de `BUILD_REV`, de `version.json` ni de `sw.js`.

## Hébergements examinés
| Option | URL indépendante | Accès à fournir | Risque pour la production | Verdict |
|---|---|---|---|---|
| **A. Artifact claude.ai** (page privée par défaut, un domaine propre par artefact) | oui | aucun, déjà disponible dans cette session | nul : origine distincte, pas de `store-runner.fr`, pas de service worker, stockage isolé | **Retenue** |
| B. Second dépôt GitHub avec Pages (`<compte>.github.io/<dépôt>`) | oui | création du dépôt + activation de Pages par le propriétaire | nul si dépôt distinct | Alternative si un lien public est voulu |
| C. Cloudflare Pages / Netlify / Vercel | oui | compte + jeton d'API déposé en secret de l'environnement | nul | Écartée : crée un compte tiers et un secret |
| D. Pages du dépôt actuel (autre dossier ou branche) | non, même domaine | — | **élevé** (publie sur la production) | Exclue |
| E. Tunnel vers un serveur local de la sandbox | éphémère | service tiers | faible, mais fragile | Exclue |

## Solution retenue : A (Artifact)
- Le Lab est une page autonome (`lab/runner-3d/`) publiée comme artefact **privé**, ouvert sur le téléphone depuis le compte de l'utilisateur.
- Isolation : l'artefact vit sur son propre domaine, il ne peut ni lire le `localStorage`, l'IndexedDB, les caches ou le service worker de
  `store-runner.fr`, ni les modifier. Il n'embarque **aucune donnée réelle** : tout est fictif et codé en dur.
- `runner-visual.js` est copié à l'identique (même octets) dans l'artefact comme référence ; un test compare son empreinte à celle de `main`.
- Mise à jour : republier le même artefact. Pas de pipeline, pas de secret.

## Contenu prévu (itérations suivantes, après accord)
1. Bascule « Runner actuel / Runner 3D » (même scène, même état, même instant).
2. Scènes fictives : Accueil, Assistant, cartes, couche ambiante.
3. États neutre, analyse, alerte, succès ; clignement, salut, déplacements, assis, jambes, interaction avec une carte.
   Le 3D n'a qu'une pose : états par lueur des yeux et mouvements de corps ; assis, jambes et « derrière un bord » sont simulés
   (glissement, apparition) et signalés comme tels dans le Lab. Des poses 3D supplémentaires sont une option ultérieure.
4. Mesures intégrées affichées dans la page : images par seconde, tâches longues, temps de décodage de l'image, poids transféré.
5. Parcours de test Android d'abord, puis iPhone/Safari ; résultats consignés ici.

## Accès nécessaires pour la première publication
Aucun avec l'option A. Le lien est privé : il s'ouvre depuis le compte Claude de l'utilisateur (application ou navigateur).
Pour un lien public ou partageable avec Leia : option B (création d'un dépôt dédié) ou partage de l'artefact par l'utilisateur.

## Garde-fous
- Aucune écriture hors `lab/` et ce document ; aucune fusion sans autorisation explicite.
- Aucune requête réseau vers `store-runner.fr`, aucun `fetch` d'API, aucune clé.
- Le 3D n'est jamais activé par défaut dans la production ; le choix de migration est une décision séparée.

## Phase 1 : prototype livré
- Lien (privé, ouvert depuis le compte Claude) : https://claude.ai/artifact/Pm1f2HhSEEPHb142eXsSPB
- Fichiers : `lab/runner-3d/` (page, `runner3d.js`, `lab.js`, `manifest.json`). `runner-visual.js` et `runner-whats-new.webp` sont publiés depuis la racine, sans copie ; l'empreinte sha256 de `runner-visual.js` est vérifiée par `tests/runner-3d-lab.test.cjs` et dans le navigateur (onglet Compte rendu).
- Republication : même chemin de page, mêmes fichiers (`manifest.json`).
- Tests : `tests/runner-3d-lab.test.cjs` (garde-fous statiques) et `tests/runner-3d-lab-browser.spec.cjs` (15 tests), ajoutés à Reliability. Le Lab est servi sur une origine fictive par `tools/runner-lab-routes.cjs`.

## Animations réellement disponibles
Natif : même mécanisme que le Runner actuel. Simulé : calque ou effet sur l'image unique. Indisponible : exige d'autres poses.

| Animation | Runner actuel | Runner 3D |
|---|---|---|
| Clignement | natif | simulé (paupière sur yeux recolorés) |
| Hochement, regard, inclinaison | natif | simulé (calque tête) |
| Salut | absent | simulé (calque bras droit) |
| Saut, secousse | absent | simulé |
| États neutre, analyse, alerte, succès | natif (yeux + bras) | simulé (yeux recolorés, « … », « ! », étincelles) |
| Bras levés par état | natif | indisponible |
| Assis, jambes qui balancent | natif | simulé (jambes en calques) |
| Déplacement d'une carte à l'autre, entrée discrète, présence | natif | natif |
| Marche, course | absent | indisponible |

## Mesures (indicatives)
Banc d'essai de 8 s dans Chromium de bureau sans GPU, processeur ralenti ×1, ×4 et ×6 : les deux Runners restent à ~60 images/s, aucune tâche longue. Coût de montage (décodage des calques) : ~17 ms (3D) contre ~1-4 ms (actuel) à vitesse normale ; 25 nœuds DOM (3D) contre 179 (actuel). Les vraies mesures sont à faire sur téléphone avec l'onglet Mesures (bouton « Copier le rapport »). Pas de WebKit dans cette sandbox : iPhone/Safari non testé.

## Phase 2 (non démarrée)
Site de test permanent via un dépôt GitHub distinct : demander à l'utilisateur la création du dépôt et l'activation de Pages. Le choix Runner actuel / Runner 3D dans Plus → Apparence n'est envisagé qu'après validation du prototype.
