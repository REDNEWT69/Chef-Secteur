# Runner Presence System — V271.1

Issue #506 ; base main V271 `6c23591`. Branche `feat/runner-presence-v271-1`. Build `20261005-r48-runner-presence-271`, **displayVersion 271**. PR **Draft — ne pas fusionner avant validation visuelle humaine**.

## Rythme perceptuel

Home joue une scène de huit secondes, après la levée du voile de boot. Runner garde ses couleurs (opacité 1), reste caché derrière le logo 1,5 s, passe doucement la tête pendant 1,5 s, cligne deux fois avec des durées différentes, regarde la journée et incline légèrement la tête. Une vraie pause sans trajet ni geste occupe 5–6 s. Le déplacement part à 6 s, ralentit à 7,5 s et finit à 8 s. Le corps demeure en grande partie masqué pendant la découverte ; le groupe de tête existant avance légèrement. Navigation, défilement, boutons et clavier restent utilisables.

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

- Reliability verify : 176 étapes exécutées ; 175 passent localement après correction du manifeste. Seul contrôle restant spécifique à Windows : bit exécutable de `android/gradlew` invisible par `fs.stat`, alors que Git garde **100755**. CI Linux requise pour ce contrôle, sans modification du test.
- Benchmark Planning V253 : 58/58 magasins, 111 placements sur neuf semaines, 100 % couverture, zéro journée infaisable ; 7 474 → 7 136 km (338 km), 8 154 → 7 785 minutes (369 min), identique à la base.
- Présence Chromium et WebKit : scène/pauses, idle variable, priorité des trois états, reprise neutre, mêmes SVG, retours des quatre surfaces, navigation rapide, rerenders, annulation des callbacks retardés, absence de timers/listeners orphelins, reduced motion au chargement et changement système, cycle de page. Résultats finaux dans la PR.
- PWA/hors ligne : suites existantes Home, Planning, Assistant, premier lancement et mises à jour ; budget runtime 77 inchangé, aucun nouveau fichier précaché. `sw.js` ne change que de BUILD_REV.
- Stabilité Home sur **180,36 s** : **0 mutation DOM de Runner**, 2 effets finis aux six mesures, aucun effet détaché, zéro effet après sortie ; script CPU **0,133 s**, tâche globale de la page **9,35 s** (5,2 % du temps mural, sous émulation avec toute l'application). Heap 7,11 → 4,80 Mo. Ces métriques concernent toute la page, pas un coût isolé de Runner. [Données brutes](tests/fixtures/runner-presence-v271-1/presence-stability.json).

Reproduction : `RUNNER_SHOTS_DIR=tests/fixtures/runner-presence-v271-1 RUNNER_STABILITY=1 node tools/run-browser-tests.mjs tests/runner-presence-v271-1-browser.spec.cjs` (variables d'environnement à définir avec la syntaxe du shell). WebKit : servir avec `node tools/run-browser-tests.mjs --serve`, puis le CLI Playwright avec `--browser=webkit` et `STORE_RUNNER_E2E_URL`.

## Limites et validation humaine

Le rythme final doit être validé par une personne sur la vidéo et l'application. WebKit est testé localement sous Windows, ainsi que les profils Android/iPhone ; un téléphone réel et une PWA installée iPhone restent une recette terrain. Les chiffres CPU ne sont pas un profil matériel Android. La couleur, l'apparence, V272/V273, /v2/, le stockage #505 et les décisions Planning ne sont pas modifiés. Aucune fusion automatique.
