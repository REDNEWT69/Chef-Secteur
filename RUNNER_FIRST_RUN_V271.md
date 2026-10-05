# Premier lancement guidé par Runner — V271

Runner guide le **tout premier démarrage** de Store Runner : présentation, secteur, point de départ, génération des 3 premières semaines, entrée dans l'Accueil. Runner reste de la **présentation pure** : chaque étape appelle le propriétaire existant de l'action et Runner traduit son résultat réel en état visuel. Cahier des charges : issue #503.

> Statut : **PR Draft**, en cours de chantier. Ce document est le contrat ; la section « Preuves » est complétée en fin de chantier.

## Décision d'architecture

Un premier lancement existe déjà dans `navigation-controller.js` (depuis V234) : quatre écrans de formulaire, le marqueur `store-runner-onboarding-v1` du moteur durable, le nettoyage de la graine de démonstration et la protection des utilisateurs existants (`hasRealUserData`). V271 **remplace ces quatre écrans par cinq étapes guidées** dans le même propriétaire. Rien n'est ajouté à côté.

| Sujet | Décision |
| --- | --- |
| Propriétaire | `navigation-controller.js`, déjà propriétaire du premier lancement. Aucun nouveau module. |
| Scripts de démarrage | **77, inchangé.** Aucune ressource runtime ajoutée. |
| `sw.js` | `BUILD_REV` seulement. Aucune entrée de cache ajoutée : tout ce que le guide utilise est déjà dans le shell obligatoire. |
| Runner | `runner-visual.js` tel quel, variante `sheet`, taille `md` (comme l'Assistant), mouvement V270 `moveTo(..., { entrance: 'peek' })` pour la présentation. Aucun second Runner, aucun clone SVG. |
| Schéma `state` | **Inchangé.** Le marqueur de complétion est la préférence UI existante (`store-runner-onboarding-v1`, moteur durable, hors `state`, hors sauvegarde JSON). Champs facultatifs ajoutés au marqueur : `startSkipped`, `generated`. |
| Accueil | `home-refresh-v2.js` ne joue plus l'entrée de Runner V270 *sous* le guide ; elle est jouée à la fermeture du guide (événement `store-runner:first-run-closed`). Sans guide, comportement strictement inchangé. |

## Parcours (cinq étapes)

Une action principale par étape, un bouton Retour quand il a un sens, « Plus tard » ferme le guide (marqueur `dismissed`, comme avant).

| # | Étape | Runner | Action principale | Propriétaire appelé | Fait réel lu |
| --- | --- | --- | --- | --- | --- |
| 1 | Présentation | neutre — « Je suis Runner, ton copilote terrain. » | Commencer | — | — |
| 2 | Ton secteur | neutre, puis succès dès qu'un magasin existe | Ajouter mes magasins · Importer mes données | `StoreRunnerStoreAdd.open` (`store-add-v261.js`) · écran Données (`importPanel`) | nombre de magasins réels de `state.stores` |
| 3 | Ton point de départ | neutre · analyse pendant la recherche de position · alerte si refus/indisponible · succès | Utiliser ma position · Saisir une adresse · Passer cette étape | `StoreRunnerProfile.resolvePlanningOrigin` / `applyPlanningOrigin` (`profile-controller.js`) · `openDepartureSettings()` | `storeRunnerHasValidBase()`, résultat de l'API de position |
| 4 | Ton planning | neutre — « Ton secteur est prêt. Générons tes 3 prochaines semaines. » · analyse · alerte | Générer mes 3 semaines | `storeRunnerGenerateThreeWeeks()` (`planning-generation-controller.js`) | résultat `{ ok, error, result.totalVisits, result.uniqueStores }` du propriétaire |
| 5 | Fin | succès — « C'est prêt. Je t'accompagnerai dans le Planning, l'Assistant et tes magasins. » | Ouvrir mon accueil | `goTab('homePanel')` | — |

Règles :

- **La position GPS n'est jamais demandée au lancement.** Elle n'est demandée qu'au tap sur « Utiliser ma position » (étape 3) ou, comme avant V271, au clic explicite « Générer mes 3 semaines » (le propriétaire de la génération relit une position fraîche ; l'étape 4 le dit avant le clic quand aucun départ n'est enregistré). Aucune lecture `navigator.geolocation` dans `navigation-controller.js` : tout passe par `StoreRunnerProfile`.
- **La génération reste une action explicite.** Le guide appelle `storeRunnerGenerateThreeWeeks()` au tap, une seule fois à la fois, et affiche ce que le propriétaire a renvoyé. Il ne choisit aucun magasin, ne simule rien, n'écrit aucun planning.
- **Succès = fait du propriétaire.** « C'est prêt » n'apparaît que si le propriétaire répond `ok` et annonce au moins une visite. Un échec montre son message tel quel (état `alert`), avec « Réessayer » ; le planning précédent reste conservé par le propriétaire.
- **Aucune promesse non fournie.** Pas de « planning optimisé », « meilleur trajet » ou « optimal » : le test les interdit dans le guide. Les chiffres affichés (magasins, visites planifiées) viennent de l'état ou du propriétaire.
- **Départ par adresse.** Le guide ouvre l'écran existant du point de départ (`openDepartureSettings()`), attend `store-runner:profile-saved` et reprend à l'étape suivante. Il n'écrit pas le profil lui-même.
- **Import.** Le guide ouvre l'écran Données existant (marqueur `importing`). Une restauration (`store-runner:data-restored`) termine le guide (utilisateur existant). Des magasins arrivés par un autre chemin d'import sont détectés au retour sur l'Accueil (`store-runner:home-rendered`, une seule fois, seulement tant que le guide attend un import) : le guide reprend alors à l'étape suivante.

## Reprise : l'étape se déduit de l'état réel

Le marqueur n'est qu'un indice (`step`, `startSkipped`, `generated`). À chaque ouverture, l'étape est recalculée depuis ce qui existe vraiment :

| État réel | Étape |
| --- | --- |
| aucun magasin réel, présentation pas encore dépassée | 1 |
| aucun magasin réel, présentation dépassée | 2 |
| des magasins, aucun point de départ valide, étape pas passée | 3 |
| des magasins, point de départ valide ou étape passée, planning pas généré par le guide | 4 |
| planning généré par le guide (`generated`), fin pas encore validée | 5 |

Un marqueur écrit par l'ancien parcours (étapes 0 à 3) est lu de la même façon : seule la déduction compte.

### Utilisateurs existants protégés

- Marqueur `complete` ou `dismissed` : le guide ne revient **jamais** (vider ou régénérer son planning ne le rouvre pas).
- Sans marqueur : toute donnée réelle (`hasRealUserData` : magasins non démo, visites, notes, plan, rendez-vous, profil renseigné, réglages modifiés…) écrit `complete` (`existing-user`) en silence.
- Marqueur `in-progress` mais activité qui dépasse l'installation (visites, rendez-vous, notes, opportunités, données métier) : `complete` (`existing-user`) en silence. Un secteur + départ + planning déjà faits ailleurs que dans le guide : `complete` (`setup-complete`) en silence.
- Restauration de sauvegarde : `complete` (`restored-data`), comme avant.

## Mouvement et accessibilité

- Présentation : Runner sort de derrière le logo (`entrance: 'peek'`, 1 180 ms, V270) **une seule fois par document**. Retour à la présentation, nouveau rendu, changement d'étape : placement direct, aucun rejeu.
- `prefers-reduced-motion` : aucun mouvement (Runner et transitions du guide). Placement direct, états toujours distincts par les yeux, les gestes et le texte.
- Runner n'est jamais flottant, jamais focusable, `pointer-events:none` ; il est monté dans le flux de la carte du guide. Il est détruit à la fermeture.
- Boîte de dialogue : titre d'étape en `h2`, focus placé dessus à chaque **changement** d'étape (pas aux mises à jour d'une même étape), voix de Runner annoncée à chaque changement d'étape ou d'état (sa bulle visuelle est masquée aux lecteurs d'écran : elle EST le contenu du guide), sauf l'alerte, dont la note `role="alert"` porte le message du propriétaire, tabulation bouclée dans la carte, cibles ≥ 48 px, aucun champ de saisie (donc pas de zoom automatique iOS).
- Aucun `setTimeout`, `setInterval`, observer ou écouteur permanent ajouté : événements métier existants seulement, écoutés tant que le guide est en cours.

## Ce que le guide ne fait pas

Il n'écrit ni `state` ni planning, n'ajoute aucun registre, ne remplace aucune fonction globale, ne choisit ni ne simule aucune visite, n'appelle aucun moteur autrement que par le point d'entrée public du propriétaire, ne demande pas la position au démarrage, ne touche pas `/v2/`.

Hors périmètre (issue #503) : couleur/apparence de Runner (V272), personnalité (V273), nouvelles règles de planning, refonte Home/Planning/Assistant, nouveau moteur d'import.

## Preuves

À compléter en fin de chantier : tests exécutés, captures 390 / 360 / iPhone, limites.
