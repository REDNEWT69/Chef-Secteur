# Runner Presence System — V271.1

Issue #506 ; base main V271 `6c23591`. Branche `feat/runner-presence-v271-1`. Build `20261005-r49`, **displayVersion 271**. PR **Draft — ne pas fusionner avant validation visuelle humaine**.

## Rythme perceptuel

Home joue une scène de huit secondes, après la levée du voile de boot. Runner garde ses couleurs (opacité 1), reste caché derrière le logo 1,5 s, passe doucement la tête pendant 1,5 s, cligne deux fois avec des durées différentes, regarde la journée et incline légèrement la tête. Une vraie pause sans trajet ni geste occupe 5–6 s. Le déplacement part à 6 s sur **une seule courbe** (`cubic-bezier(.42,0,.25,1)`) qui décélère en continu jusqu'à l'arrêt à 8 s : il n'y a ni palier ni arrêt intermédiaire suivi d'une reprise. La tête revient sur le corps sur la même courbe et le même intervalle, donc elle ne part pas d'un coup à 6 s et n'arrive pas avant lui. Mesuré sur la timeline à 390 px (269 px de trajet) : pointe 317 px/s, plus grand saut de vitesse 7,5 px/s en 10 ms, vitesse 53 px/s à 7,5 s puis 0 à 8 s ; une version à deux segments s'arrêtait presque à 8 px de sa place (4 px/s) avant de glisser les derniers pixels (saut de 25 px/s). Le corps demeure en grande partie masqué pendant la découverte ; le groupe de tête existant avance légèrement. Navigation, défilement, boutons et clavier restent utilisables.

Une seule grande entrée par document, consommée même si elle est interrompue. Rerender : placement direct, aucun rejeu. Retour Planning : léger mouvement depuis la gauche, regard vers la journée puis repos, 2,4 s. Magasins : depuis la droite, 2,4 s. Assistant : mouvement vertical de 4 px, 2,4 s. Plus : très discret, 1,6 s. Aucun nom d'écran n'entre dans Runner.

## Évolution explicite du contrat

L'architecture permet cette présence sans contournement. Le contrat V268 « aucune animation au repos » devient **montage statique par défaut, présence prolongée opt-in**. Les propriétaires restent les seuls décideurs de la surface et de l'état.

```js
const runner = Runner.mount(slot, { size:'sm', decorative:true });
runner.moveTo(slot, { from:logo, entrance:'peek', duration:8000 });
runner.setPresence(true);
// au vrai retour, l'hôte fournit un geste de présentation :
runner.returnToRest({ duration:2400, offsetX:-16 });
// à la sortie/au masquage de la surface :
runner.setPresence(false);
// avant remplacement du DOM :
runner.destroy();
```

`setPresence` est idempotent ; false nettoie même si aucune activation n'a précédé. `isIdle()` et `isMoving()` indiquent les effets détenus. `returnToRest` borne sa durée à 1,5–3 s et ses déplacements à ±24 px horizontalement / ±8 px verticalement. Aucun nouveau moteur ni API métier.

Idle : pauses tirées entre 2,5 et 4,5 s, clignement 180–270 ms, parfois double (22 %), regard occasionnel (32 %), inclinaison occasionnelle (24 %), respiration d'amplitude 0,8 px. Chaque séquence est finie, son callback prépare seulement la suivante. **Aucun setInterval, timer d'idle, polling, observer, requestAnimationFrame ou mutation DOM par image.** Deux ou trois effets maximum au repos. La cancellation retire les handlers avant d'annuler les effets, donc un callback retardé ne peut pas relancer une ancienne instance.

`analyzing`, `alert`, `success` annulent idle et mouvement en cours. Retour à neutral : reprise douce, prochain clignement après sa pause variable. Le SVG n'est jamais reconstruit. Les timers essentiels de bulle/reset restent indépendants de reduced motion ; sortie d'écran/destruction les annule.

Les seules écoutes du composant sont **bornées à l'instance active ou au mouvement en cours** : préférence système, visibilité, pagehide/pageshow. Elles annulent les mouvements immédiatement, sans relire ni rendre de données. Elles sont retirées à la suspension/destruction ou à la fin d'un trajet sans présence. Aucun abonnement au démarrage. Avec reduced motion ou `motion:'off'` : placement direct, présence statique et états essentiels conservés. Après une reprise de page, le propriétaire peut réactiver proprement son instance.

Home détruit avant son remplacement DOM et en quittant sa surface, y compris sous Assistant/Plus. Planning et Assistant gardent leur instance existante mais suspendent ses effets lorsqu'ils sont masqués. Les observations de classe existantes réagissent aux records de navigation, même lors d'un aller-retour dans la même tâche. Chaque écran conserve sa présence locale ; aucun Runner global flottant, second SVG, registre d'écran, logique métier ou changement de state.

## Preuves visuelles

Images du rendu réel, données synthétiques, Android 390/360 et iPhone 14 Chromium. Les instantanés figent les animations à leur temps réel indiqué ; ils ne prouvent pas seuls le rythme. La **[vidéo en temps réel](tests/fixtures/runner-presence-v271-1/runner-presence-temps-reel-390.webm)** montre la scène entière, plusieurs cycles d'idle puis les deux retours. Les toasts transitoires sont masqués uniquement dans les captures de test.

| Exigence | Android 390 | Android 360 | iPhone 14 |
| --- | --- | --- | --- |
| 1. Caché, 0,6 s | [capture](tests/fixtures/runner-presence-v271-1/Android390-1-cache.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-1-cache.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-1-cache.png) |
| 2. Tête, 2,8 s | [capture](tests/fixtures/runner-presence-v271-1/Android390-2-tete.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-2-tete.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-2-tete.png) |
| 3. Clignement, 3,216 s | [capture](tests/fixtures/runner-presence-v271-1/Android390-3-clignement.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-3-clignement.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-3-clignement.png) |
| 3. Regard, 4,45 s | [capture](tests/fixtures/runner-presence-v271-1/Android390-3b-regard.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-3b-regard.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-3b-regard.png) |
| 4. Pause, 5,9 s | [capture](tests/fixtures/runner-presence-v271-1/Android390-4-pause.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-4-pause.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-4-pause.png) |
| 5. Déplacement, 6,9 s | [capture](tests/fixtures/runner-presence-v271-1/Android390-5-deplacement.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-5-deplacement.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-5-deplacement.png) |
| 6. Arrivée | [capture](tests/fixtures/runner-presence-v271-1/Android390-6-arrivee.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-6-arrivee.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-6-arrivee.png) |
| 7. Idle | [capture](tests/fixtures/runner-presence-v271-1/Android390-7-idle.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-7-idle.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-7-idle.png) |
| 8. Planning → Accueil | [capture](tests/fixtures/runner-presence-v271-1/Android390-8-planning-home.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-8-planning-home.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-8-planning-home.png) |
| 9. Assistant → Accueil | [capture](tests/fixtures/runner-presence-v271-1/Android390-9-assistant-home.png) | [capture](tests/fixtures/runner-presence-v271-1/Android360-9-assistant-home.png) | [capture](tests/fixtures/runner-presence-v271-1/iPhone14-9-assistant-home.png) |

## Validation

- Reliability verify : **176 étapes sur 176** exécutées localement sous Linux (contrôle du bit exécutable de `android/gradlew` compris, qui n'était pas validable sous Windows).
- Benchmark Planning V253 : 58/58 magasins, 111 placements sur neuf semaines, 100 % couverture, zéro journée infaisable ; 7 474 → 7 136 km (338 km), 8 154 → 7 785 minutes (369 min), identique à la base.
- Suite navigateur complète (`node tools/run-browser-tests.mjs`, liste de la CI) : **339 tests, 335 passés, 3 ignorés, 1 échec local hors périmètre**. L'échec est `brand-opening-hours-v230-browser.spec.cjs:31` (restauration d'une sauvegarde : la confirmation « Restaurer » n'apparaît pas) ; il échoue **à l'identique sur `main` 6c23591** dans le bac à sable de développement (Chromium 141, Playwright 1.55.0 comme 1.56.1) et passait dans Reliability #1420. La CI reste la référence pour ce test.
- Robustesse sous CPU ralenti ×4 (CDP) des six specs Runner : 34 + 30 + 13 + 19 + 19 + 29 tests passés, aucun échec ; le test « Assistant dormant » reste à 100 % à ×8 et ×12.
- Mesures en temps réel (Chromium, 390 px) : scène **8,04 s** de temps mur, opacité 1 sur toute la timeline ; idle sur **70 s réelles** : 19 séquences sans interruption, intervalles entre clignements 3,02–4,73 s (écart-type 0,55 s, donc pas de métronome), doubles clignements, regards et inclinaisons occasionnels, respiration 0,8 px, 2 à 3 effets vivants, **0 mutation DOM, 0 timer, 0 `setInterval`, scène non rejouée**.
- Présence Chromium et WebKit : scène/pauses, idle variable, priorité des trois états, reprise neutre, mêmes SVG, retours des quatre surfaces, navigation rapide, rerenders, annulation des callbacks retardés, absence de timers/listeners orphelins, reduced motion au chargement et changement système, cycle de page. Résultats finaux dans la PR.
- PWA/hors ligne : suites existantes Home, Planning, Assistant, premier lancement et mises à jour ; budget runtime 77 inchangé, aucun nouveau fichier précaché. `sw.js` ne change que de BUILD_REV.
- Stabilité Home sur **180,36 s** : **0 mutation DOM de Runner**, 2 effets finis aux six mesures, aucun effet détaché, zéro effet après sortie ; script CPU **0,133 s**, tâche globale de la page **9,35 s** (5,2 % du temps mural, sous émulation avec toute l'application). Heap 7,11 → 4,80 Mo. Ces métriques concernent toute la page, pas un coût isolé de Runner. [Données brutes](tests/fixtures/runner-presence-v271-1/presence-stability.json).

Reproduction : `RUNNER_SHOTS_DIR=tests/fixtures/runner-presence-v271-1 RUNNER_STABILITY=1 node tools/run-browser-tests.mjs tests/runner-presence-v271-1-browser.spec.cjs` (variables d'environnement à définir avec la syntaxe du shell). WebKit : servir avec `node tools/run-browser-tests.mjs --serve`, puis le CLI Playwright avec `--browser=webkit` et `STORE_RUNNER_E2E_URL`.

## Reprise du chantier (après l'arrêt de Codex)

- **Reliability #1420, seul échec** : `runner-visual-v268-browser.spec.cjs` « démarrage — l'Accueil monte un seul Runner ». Cause : la barrière de démarrage du test (`#bottomAppNav[data-v2="1"]`) ne suffit plus, puisque l'Accueil monte désormais Runner **à la levée du voile** du shell (exigence de #506), 64–85 ms plus tard (250–400 ms avec un CPU ralenti ×4), alors que sur `main` le montage était synchrone avec la barre (0 ms). Course de timing sur une barrière devenue obsolète, **pas un bug produit** : le test échouait 4 fois sur 4 sous CPU ×4 sur la tête de #507 et passait 4 fois sur 4 sur `main`. Correction dans le helper `bootApp` du spec, qui attend maintenant le voile levé et le Runner de l'Accueil posé ; aucune assertion retirée ni assouplie (20 runs sur 20 passés, 4 sur 4 sous CPU ×4).
- **Fin de trajet de la scène** : la vitesse tombait à 4 px/s à 7,5 s (Runner presque arrêté à 8 px de sa place) puis remontait à 23 px/s pour finir, avec un saut de 25 px/s en 10 ms ; le retour linéaire de la tête de 45 px partait d'un coup à 6 s et s'arrêtait net à 7,52 s. Le corps suit maintenant un seul trajet de 6 à 8 s sur `cubic-bezier(.42,0,.25,1)` et la tête revient sur la même courbe : pointe 387 → 317 px/s, plus grand saut de vitesse 25,3 → 7,5 px/s, décélération monotone jusqu'à zéro. Même durée, mêmes instants de clignements, de regard et d'inclinaison. Nouveau test de non-régression (reproduit d'abord en échec sur les trois profils, puis passant) ; capture « déplacement » (trois profils) et vidéo régénérées, car le rendu change.
- Les gestes de retour (Planning, Magasins, Assistant, Plus) ont été mesurés : au plus 16 px de déplacement et 13 px/s de saut de vitesse, sous le seuil de perception d'un à-coup ; laissés tels quels.

## Limites et validation humaine

Le rythme final doit être validé par une personne sur la vidéo et l'application. WebKit est testé localement sous Windows, ainsi que les profils Android/iPhone ; un téléphone réel et une PWA installée iPhone restent une recette terrain. Les chiffres CPU ne sont pas un profil matériel Android. La couleur, l'apparence, V272/V273, /v2/, le stockage #505 et les décisions Planning ne sont pas modifiés. Aucune fusion automatique.

Limites constatées à la reprise : WebKit n'a pas été rejoué (Chromium seul disponible pour cette reprise ; les résultats WebKit ci-dessus sont ceux obtenus sous Windows avant). Le trajet de **premier lancement guidé** reste à 1,18 s (contrat V271, hors de #506). Une grande entrée interrompue par un changement d'écran est consommée et ne rejoue pas (choix de contrat) : Runner revient alors par le geste de retour. Les captures 5 et la vidéo ont été produites sous Chromium/Linux, les autres captures sous Windows.
