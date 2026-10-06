# Runner — Intelligence métier (V276)

**État : PR Draft, non fusionnée.** Base : `main` `8738cb4` (V275). Version visible **276**, `BUILD_REV` `20261006-r58-runner-intelligence-276`.

Runner devient un copilote **contextualisé** : ce qu'il affirme est toujours vrai pour les faits du moment, il lit un rapport clôturé en le croisant avec l'historique du magasin, et un tap sur lui ouvre son point du jour. Rien n'est écrit dans `state`, aucun script de démarrage n'est ajouté (budget de 78 inchangé), `sw.js` ne change que par `BUILD_REV`.

| Fichier | Rôle V276 |
| --- | --- |
| `runner-behavior.js` | couche **métier** pure à côté de la couche décorative : `kind: 'business'`, `signature(facts)`, `remarks(input)`, `brief(input)` ; `blocked(inp, kind)` |
| `store-explorer.js` | `insightsFor(state, storeId, options)` : lecture croisée d'un magasin, en lecture seule (le module n'affiche rien) |
| `store-runner-visits.js` | annonce la clôture et la réouverture (`store-runner:visit-completed` / `visit-reopened`) ; bloc « À retenir » dans le rapport clôturé |
| `home-refresh-v2.js` | garde de ligne périmée, déclencheur `rerender`, tap sur Runner = point du jour, faits du point du jour |
| `navigation-controller.js` | le retour de focus de la feuille Apparence cible le nouveau bouton ; la feuille reste le seul lieu des réglages |
| `planning-generation-controller.js`, `src/chef-secteur.html` | messages de géolocalisation : l'écran nommé est « Mon secteur » (il n'existe pas d'écran « Mon activité ») |
| `tests/runner-intelligence-v276.test.cjs`, `tests/runner-insights-v276.test.cjs`, `tests/generation-location-v276.test.cjs`, `tests/runner-intelligence-v276-browser.spec.cjs` | Node + navigateur (Android 390 / 360, iPhone émulé), exécutés par Reliability |

## Diagnostic (avant)

1. **Ligne périmée.** L'Accueil gardait le texte de la ligne ambiante et le repeignait à chaque rendu. Rien n'avertissait l'Accueil d'une clôture de visite : « 1 magasin au programme » pouvait rester affiché une fois le passage terminé. Un nouveau montage du même écran était, de plus, décidé comme une vraie arrivée.
2. **Aucune distinction décor / métier.** « Tournée terminée » partageait le budget du jour, l'écart de 10 minutes entre deux textes et la garde d'arrivée de 3 s avec les petites réactions d'ambiance : une réaction décorative déjà dite, ou une bannière de mise à jour, la faisait taire.
3. **Pas de lecture croisée.** Un rapport clôturé n'était jamais comparé aux passages précédents, aux actions ouvertes ou au planning.
4. **Tap = réglages.** Toucher Runner sur l'Accueil ouvrait la feuille Apparence + Personnalité : aucune interaction « Runner », seulement des préférences.
5. **Géolocalisation.** Le contrat « position fraîche avant génération » était déjà tenu et couvert (r38) ; seuls trois messages renvoyaient vers un écran inexistant (« Mon activité »).

## Principe : décoratif ≠ métier

| | Décoratif (V273) | Métier (V276) |
| --- | --- | --- |
| Source | humeur, présence, ambiance | faits déjà produits par leurs propriétaires |
| Budget du jour, écart entre textes, garde d'arrivée | oui | **non** |
| Persistance | registre `store-runner-runner-v1` | seulement « dit aujourd'hui » (`shown[id] = {d, t}`) |
| Bloqué par | clavier, premier lancement, feuille ouverte, état de Runner, **bannière de mise à jour** | clavier, premier lancement, feuille ouverte, état de Runner (**pas** la bannière) |
| Déclencheurs Accueil | `arrive` | `arrive` **et** `rerender` |

`tour.finished` est la réaction métier de l'Accueil. Un événement métier n'est donc jamais bloqué par un cooldown décoratif, et ne consomme jamais le budget décoratif.

## Ligne périmée : jamais repeinte

`signature(facts)` est l'empreinte des faits dont une ligne ambiante dépend (jour, tournée total/faites/terminée, point d'attention, dernière visite). L'Accueil la garde avec la ligne affichée ; au rendu suivant, si elle a changé, la ligne est **retirée** et jamais repeinte, même quand la nouvelle décision se tait. Un nouveau montage sur le même écran est un `rerender` : seuls les faits métier peuvent alors parler, jamais le décor. Une vraie arrivée (premier affichage, retour d'un autre écran) reste `arrive`. Les événements `store-runner:visit-completed` et `store-runner:visit-reopened` déclenchent le rendu de l'Accueil.

## « À retenir » : 1 ou 2 remarques, ou aucune

`StoreRunnerStoreExplorer.insightsFor` ne lit que des **statuts, des comptes et des dates** (lignes 6P `ok` / `correct` / `opportunity`, actions `open` / `in_progress` / `done` / `cancelled`, jours de visite, rendez-vous, prochaine date planifiée) — jamais le texte libre d'un rapport : il ne peut donc pas le paraphraser. Constats possibles : point récurrent (« Stocks (Produit) : à corriger pour la 4ᵉ visite de suite. »), régression, amélioration, tendance, action ouverte ou en retard, incohérence (points à corriger sans action notée), point à revoir au prochain passage. `StoreRunnerBehavior.remarks` en retient au plus deux (un seul pour Discret), par ordre d'utilité ; **rien d'utile = aucune remarque** (première visite, tout est bon). Chaque hôte garde la parole :

- le **rapport clôturé** (`store-runner-visits.js`) affiche le bloc « À retenir » avec une bulle Runner **dans le flux** (jamais flottante), seulement pour le dernier rapport clôturé du magasin ;
- le **point du jour** de l'Accueil reprend ces remarques pour la dernière visite clôturée aujourd'hui ou hier.

## Tap sur Runner = point du jour

`#homeRunnerTapV276` ouvre `#homeRunnerBriefV276`, dans le flux de l'Accueil, au plus trois lignes recalculées sur les faits à chaque rendu : l'état de la tournée (« 1 visite restante aujourd’hui · prochaine : … », « Tournée terminée : 1 sur 1. »), la lecture du dernier passage, le point d'attention, avec « Voir la fiche » (le propriétaire de la fiche l'ouvre). Les réglages et la personnalité ne sont plus l'effet du tap : ils restent à un geste explicite, **« Personnaliser Runner »** dans cette carte, ou Plus → Apparence. Le point du jour est refermé par la feuille Apparence, par un changement d'écran et par ses boutons ; cibles tactiles d'au moins 44 px.

## Contrainte planning (inchangée, désormais gardée)

« Générer mes 3 semaines » attend `storeRunnerPreparePlanningOrigin()` **avant** tout contrôle de base et tout moteur ; aucune ancienne position silencieuse, aucune base par défaut (profil neuf : `baseLat/baseLon` nuls ; aucune coordonnée de Paris dans le runtime) ; géolocalisation indisponible = uniquement une base explicitement enregistrée, annoncée à l'utilisateur ; sinon blocage avec un message qui nomme **Mon secteur**. `tests/generation-location-v276.test.cjs` garde l'ordre, la porte unique, l'absence de défaut et le vocabulaire ; l'acquisition et les replis restent à `profile-controller.js` (r38).

## Tests

- `tests/runner-intelligence-v276.test.cjs` : classification décor / métier, absence de cooldown pour le métier, signature, remarques, point du jour, pureté, taille ;
- `tests/runner-insights-v276.test.cjs` : `insightsFor` sur de vrais rapports (récurrence, régression, amélioration, actions, incohérence, rien d'utile, entrées invalides) ;
- `tests/generation-location-v276.test.cjs` : contrat de position fraîche, messages, porte unique ;
- `tests/runner-intelligence-v276-browser.spec.cjs` : clôture et réouverture réelles par le dialogue de visite, ligne périmée retirée, métier malgré budget et bannière, remarque dans le rapport, tap = point du jour, « Personnaliser Runner », aucune écriture, aucun débordement, cibles ≥ 44 px ;
- `tests/runner-behavior-v273.test.cjs`, `tests/appearance-v272-browser.spec.cjs`, `tests/runner-personality-v273-browser.spec.cjs` : adaptés au nouveau geste.

## Hors périmètre, volontairement

Aucun planning intelligent, quiz, gamification, persistance des remarques, notification ni analyse du texte libre. Aucun nouvel événement hors `visit-completed` / `visit-reopened`. `runner-visual.js` ne change pas. Les actions créées depuis l'interface (hors rapport 6P) n'alimentent pas `insightsFor` tant qu'elles ne sont pas liées à une visite.
