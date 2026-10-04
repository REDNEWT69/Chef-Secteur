# Runner Visual System V1

Runner est le copilote **visuel** de Store Runner : un personnage, quatre états, une bulle. Ce lot ne crée que la couche de présentation réutilisable. **Rien n'est branché** : aucun écran, aucun moteur (Planning, Forecast, Command Engine, Explorer Terrain) ne connaît Runner.

**Mobile uniquement, Android d'abord.** Runner n'a aucune mise en page desktop : sa feuille de style ne contient aucune requête de largeur. Référence : Android 390 px, vérifié aussi à 360 px (le plus petit téléphone courant), puis iPhone 390 px, et 320 px sans défilement horizontal. En cas de doute entre desktop et mobile, c'est le mobile qui a été choisi.

- Build `20261004-r41-runner-visual-266`, version visible **inchangée : 266**.
- PR Draft, **non fusionnée**. Décision à valider avant fusion : voir « Chargement et budget de démarrage ».
- Module : `runner-visual.js` (`StoreRunnerRunner`, alias `Runner`). Un seul fichier, aucune dépendance, aucune feuille séparée.

![États de Runner](tests/fixtures/runner-visual-states.webp)

![Intégration mobile, Android 390 px](tests/fixtures/runner-visual-preview-390.webp)

## Direction visuelle

Les planches officielles Runner V1 fixent l'identité : silhouette en goutte, tête nacrée, **visière sombre** à liseré bleu, yeux lumineux, **crête bleue** type aileron, pastille d'oreille bleue, corps ovoïde blanc, **emblème de navigation** (flèche bicolore dans un disque), mains bleues, halo bleu sous le corps, palette blanc/bleu. Le dessin les reprend sans réinterprétation : seuls les yeux, les bras et les effets changent d'un état à l'autre. La planche d'intégration mobile (Planning, Assistant en bottom sheet, alerte, succès) fixe la mise en page, pas l'identité.

| État | Yeux | Geste | Effet |
| --- | --- | --- | --- |
| `neutral` — En attente | deux arches cyan | bras ouverts | aucun |
| `analyzing` — Il réfléchit | un ovale, un trait oblique | main au menton | trois points bleus |
| `alert` — Une contrainte détectée | deux ovales ambre | bras tendu | pastille rouge « ! », éclats ambre |
| `success` — Tout est ok | une arche, un clin d'œil | main bleue levée | éclats verts |

**Limite connue, à lire.** Les planches fournies sont des images raster sans source maître (ni SVG, ni PNG transparent, ni modèle 3D) ; le rendu 3D n'est pas extractible proprement (fond dégradé, ≈ 150 px de haut pour un état). Le dessin est donc un **redessin vectoriel** fidèle aux formes, aux couleurs et aux proportions, mais plus « à plat » que le rendu 3D (ombres et reflets simplifiés). Si le design livre l'art maître, il remplace le gabarit SVG de `runner-visual.js` sans toucher à l'API ni aux écrans hôtes.

Pas d'actifs raster dans le runtime : un SVG inline reste net à toute densité (Android 2–3×, iPhone 3×), pèse ≈ 11 Ko par instance et ne demande aucun fichier de plus à précacher. Un jeu WebP/PNG ne se justifiera que pour une surface qui ne peut pas porter de SVG (notification système, carte de partage) : décision à prendre alors. Les deux WebP de `tests/fixtures/` ne servent qu'à relire cette PR.

## Intégration native mobile : trois variantes, toujours dans le flux

| Variante | Surface | Composition |
| --- | --- | --- |
| `bubble` (défaut) | carte Planning, message de l'assistant | Runner (88 px) à côté d'une bulle blanche à accent d'état et queue vers lui ; `side:'left'` inverse |
| `sheet` | en-tête du bottom sheet Assistant | Runner (120 px) et texte **sans cadre** ; titre 16,5 px |
| `panel` | carte d'alerte de contrainte, carte de succès | Runner (88 px) centré **au-dessus** d'un bloc teinté pleine largeur, pictogramme ⚠ ou ✓ |

Règles mobiles, vérifiées par les tests :

- **Aucun personnage flottant.** Runner n'est jamais `fixed`, jamais `sticky`, n'a aucun `z-index`, aucun `inset`, aucune unité de viewport. Il occupe de la place dans le flux de l'écran hôte : il ne peut donc masquer aucune action principale, ni la barre de navigation basse, ni le bouton IA.
- **Discret.** Tailles de téléphone : `sm` 56 · `md` 88 · `lg` 120 px (plafond numérique 144 px, plus de `xl`). Une bulle sans texte n'existe pas ; `duration` la referme seule.
- **Safe areas.** Runner n'est ancré à aucun bord de l'écran, donc il ne peut ni passer sous l'encoche, ni sous la barre de gestes, ni sous la barre d'état. Les marges `env(safe-area-inset-*)` des feuilles, barres et pages restent à leur **propriétaire** ; la fixture montre le montage correct (sheet et barre basse de l'hôte) et le test émule trois situations (iPhone encoche + barre d'accueil, Android barre de gestes, paysage avec encoche).
- **Les actions appartiennent à l'hôte.** « Voir détails », « Réorganiser », « Annuler », « Voir ma tournée » sont les boutons de l'écran, au style de l'app, cibles ≥ 48 px. Runner ne dessine aucun bouton ni lien, ne prend jamais le focus et sa figure ne capte aucun tap (`pointer-events:none`) : le centre de chaque bouton de l'hôte reste atteignable.
- **Largeur : celle du conteneur.** La bulle prend la largeur restante, coupe les noms sans espace (`overflow-wrap:anywhere`) et ne déborde ni de sa carte ni de l'écran à 320, 360 et 390 px. Texte ≥ 14 px, police héritée de l'application.
- **Contrastes AA.** Toutes les paires texte / fond (encre, texte secondaire, titres d'alerte et de succès sur leurs teintes) sont ≥ 4,5:1, vérifiées par le test unitaire.

## Ce que Runner ne fait jamais

- **Aucune donnée** : ni `state`, ni stockage, ni IndexedDB, ni agenda, ni performance, ni photos. Aucun nom de magasin n'y est lu.
- **Aucune décision** : il ne choisit, ne place, ne déplace ni ne simule aucune visite. Il n'est appelé par aucun moteur ; c'est le propriétaire d'un écran qui traduit le résultat de son moteur en état visuel, jamais l'inverse.
- **Aucun propriétaire contourné** : aucune fonction globale remplacée, aucun `window.xxx =` hors `StoreRunnerRunner` / `Runner`.
- **Aucune surveillance** : pas de `setInterval`, pas d'observateur, pas d'écouteur `focus` / `visibilitychange` / `resize`, pas de `requestAnimationFrame`.
- **Aucun réseau**, aucune évaluation dynamique, aucun HTML dynamique : une bulle s'écrit en `textContent`. Un nom de magasin comme `<img onerror=…>` y reste du texte.

Au démarrage il ne fait strictement rien : aucun nœud, aucun style, aucun écouteur. La feuille de style n'est injectée qu'au premier `mount()`.

## API de présentation

L'API globale n'agit que sur le Runner **principal** (le dernier monté encore présent dans le document). Sans Runner monté elle ne crée rien et répond `false` : appeler `Runner.setState(...)` avant qu'un écran n'ait monté Runner est sans effet, jamais une erreur. Aucune méthode ne lève d'exception vers le code appelant.

```js
// L'écran hôte décide de l'emplacement ; Runner prend place dans son flux.
const runner = Runner.mount(container, { variant:'bubble', state:'neutral' });

Runner.setState('analyzing');                                  // true | false
Runner.showMessage('Je vérifie les contraintes…');             // bulle
Runner.showMessage({ title:'Attention !', text:'…' }, { state:'alert' });
Runner.setState('success', { message:'Ta tournée est prête.', title:'Trajet optimisé !', resetAfter:4000 });
Runner.hideMessage();
Runner.reset();                                                // neutre, bulle fermée
Runner.getState();                                             // 'neutral' | … | null
Runner.unmount(container | runner);
```

| Élément | Rôle |
| --- | --- |
| `Runner.STATES`, `STATE_LABELS`, `VARIANTS`, `SIDES`, `SIZES`, `TONES` | constantes gelées |
| `mount(conteneur, options)` | retourne l'instance, ou `null` si le conteneur est introuvable |
| options de `mount` | `variant` (`bubble` · `sheet` · `panel`, défaut `bubble`), `state`, `size` (`sm` · `md` · `lg` · nombre 32–144 ; défaut `md`, `lg` pour `sheet`), `side` (`right` · `left`), `message`, `title`, `duration`, `motion` (`'off'` coupe tout mouvement), `decorative` (aucun nom accessible) |
| `setState(état, { message, title, duration, resetAfter, side })` | état inconnu refusé (`false`), même état : aucun rejeu |
| `showMessage(texte \| { text, title, state, duration, side }, options)` | texte borné à 280 caractères, titre à 60, durée 1,5 s – 2 min (`0` : reste jusqu'à `hideMessage`) ; un texte vide ferme la bulle |
| instance | `el`, `variant`, `getState`, `setState`, `showMessage`, `hideMessage`, `reset`, `destroy`, `isConnected` |
| événement | `store-runner:runner-state`, émis sur l'élément et remontant dans le document (`bubbles`), `detail: { state, previous, id }`, seulement quand l'état change |

**Pas de fuite quand un écran se redessine.** Les écrans de l'app se redessinent souvent en `innerHTML`. Chaque `mount` oublie d'abord les Runners dont le conteneur a été retiré : six rendus successifs laissent une seule instance vivante. Un Runner monté dans un nœud pas encore attaché reste vivant jusqu'à son insertion, puis suit le document. `unmount` accepte l'instance ou son conteneur.

## Un état, pas une reconstruction

Tous les calques du dessin sont déjà dans le SVG ; `data-state` sur le conteneur en rend un seul visible (fondu 0,16 s). Changer d'état ne reconstruit aucun nœud, ne relit aucune donnée et ne crée aucun timer (sauf `duration` / `resetAfter`, demandés explicitement, un seul timer chacun, annulé par tout nouvel appel ou par `destroy`).

## Accessibilité

- La figure est `role="img"` avec un nom : « Runner, copilote terrain : en attente / il réfléchit / une contrainte détectée / tout est ok ». `decorative:true` la masque quand le texte voisin dit déjà la même chose.
- Une région `role="status"` (visuellement masquée) annonce la bulle et les changements d'état ; elle passe en `aria-live="assertive"` pour une alerte. La bulle visuelle est `aria-hidden` : pas de double lecture. Retour au calme : aucune annonce.
- `prefers-reduced-motion: reduce` coupe toute animation et toute transition ; les états restent distincts par les yeux, les gestes, les effets et le pictogramme. `motion:'off'` fait de même à la demande de l'écran hôte (captures déterministes).

## Mouvement et performance

- Animations en `transform` / `opacity` uniquement, pas de `will-change` permanent, **aucun filtre SVG** (les lueurs sont des formes translucides).
- Au repos : **aucune animation**. Changement d'état : une entrée de 0,42 s, jouée une fois. Bulle : une entrée de 0,22 s.
- Une seule boucle existe, les trois points de `analyzing`, **bornée à 16 passages (≈ 22 s)** : un état oublié ne tourne jamais en continu sur la batterie d'un téléphone. Alerte : deux pulsations. Succès : une apparition des éclats.
- Poids : `runner-visual.js` ≈ 31 Ko (≈ 25 Ko hors commentaires), ≈ 11 Ko compressé ; SVG ≈ 11 Ko et 153 éléments par instance ; identifiants de dégradés uniques par instance (un Runner masqué ne prive jamais un autre de ses dégradés). Si plus de quelques Runners coexistent un jour, le dessin pourra passer en sprite partagé ; inutile pour un à deux Runners par écran.

## Chargement et budget de démarrage

`runner-visual.js` est chargé avec les autres modules par `index.html` (avant `weekly-brief-import-v246b.js`, `mobile-ux-v262.js` restant le dernier module) et précaché dans le shell obligatoire de `sw.js`, comme tout ce que `index.html` charge. Il fait **77** ressources script au démarrage au lieu de 76 : le plafond de `CLEANUP_BASELINE_R20.md` / `tests/fixtures/cleanup-baseline-r20.json` est relevé d'une unité, comme pour `store-explorer.js`. **Cette décision est à valider avant fusion.**

Alternative sans nouveau script de démarrage : ne pas charger Runner au démarrage, et laisser le premier propriétaire d'écran qui l'adoptera ajouter `runner-visual.js` dans sa propre PR (avec le bump et le plafond). Ce lot serait alors un pur ajout de fichiers sans effet sur le runtime ; l'inconvénient est que l'API n'existe pas dans la PWA tant qu'un écran ne l'embarque pas, donc pas de test navigateur « dans l'application ». Le choix retenu ici (chargé mais dormant) a été préféré pour que le prochain lot n'ait qu'à appeler `Runner.mount`.

Fusion : modification de `sw.js` au-delà de `BUILD_REV` (une entrée de shell) → accord humain explicite requis par `AGENTS.md`.

## Points d'intégration futurs (non faits)

Dans tous les cas, **le propriétaire de l'écran monte Runner et traduit son propre résultat** ; Runner ne lit jamais le résultat d'un moteur. Chacune demande sa propre PR, son propre test et une vérification 390 px (Android d'abord).

| Surface | Variante | Intégration envisagée |
| --- | --- | --- |
| Planning | `bubble` | conseil dans une carte entre le sélecteur de semaine et la liste des visites ; l'emplacement appartient à `planning-ui-fixes.js`. |
| Assistant / Command Engine | `sheet` | en-tête du bottom sheet : `analyzing` pendant l'interprétation, `alert` quand l'aperçu cite une contrainte, `success` après l'application validée. La liste d'étapes et « Annuler » restent à l'assistant. Les commandes planning restent hors des actions directes de l'IA en ligne. |
| Alertes de contraintes | `panel` | `alert` + titre / texte déjà produits par le propriétaire de la contrainte ; « Voir détails » / « Réorganiser » restent ses boutons. |
| Succès après application | `panel` | `setState('success', { message, resetAfter })` à l'événement existant `store-runner:planning-updated` ; « Voir ma tournée » reste le bouton de l'écran. |
| Explorer Terrain | `bubble` | message court dans la fiche Magasin 360 pour une contrainte active (la source reste `store-explorer.js`). |

## Tests

| Test | Contrat |
| --- | --- |
| `tests/runner-visual-v266.test.cjs` (Reliability) | chargé une fois, précaché, build cohérent, version visible 266 ; aucune donnée / moteur / écouteur / observateur / réseau / `setInterval` ; texte jamais en HTML ; **mobile d'abord** : seule requête média = mouvement réduit, jamais `fixed`/`sticky`/`z-index`/unité de viewport, aucun bouton ni lien dessiné ; animations `transform`/`opacity` seulement, aucune `infinite`, boucle bornée à 16 ; contrastes AA ; API pure ; alias `Runner` jamais écrasé ; aucun module ne branche Runner |
| `tests/runner-visual-v266-browser.spec.cjs` (Reliability, mobile) | **Android 390, Android 360, iPhone 390** : démarrage dormant dans la vraie app ; `state` et stockage inchangés ; style non altéré par l'app ; quatre états ; trois variantes (disposition, teintes, pictogrammes) ; injection `<img onerror>` inerte ; annonce lecteur d'écran ; **Runner dans le flux, jamais fixe, aucun bouton de l'hôte recouvert** ; **safe areas émulées** (encoche, barre de gestes, paysage) ; aucun débordement horizontal jusqu'à 320 px ; tailles ; pas d'instance orpheline après des rendus répétés ; aucune animation au repos, boucle bornée ; mode réduit ; `motion:'off'` |
| `tests/fixtures/runner-visual-preview.html` | page d'aperçu de test (jamais chargée par l'app ni mise en cache) : carte Planning, bottom sheet Assistant, cartes d'alerte et de succès, avec les boutons et la barre basse de l'hôte |

Plafond de scripts : `tests/priority-campaign-removal-browser.spec.cjs` (77) et `tests/fixtures/cleanup-baseline-r20.json`.

## Questions ouvertes

1. Valider le plafond 77 (ou choisir l'alternative sans chargement au démarrage).
2. Art maître : le design peut-il fournir un SVG ou un PNG transparent haute définition ? Le gabarit actuel est un redessin.
3. Poses de la planche (propose, montre le planning, analyse, explique, valide, salut) : variantes de gestes qui s'ajoutent sans changer l'API ; hors périmètre, les quatre états demandés sont livrés.
4. Runner dans le bouton IA ou la barre de navigation basse : **non préparé et déconseillé** (un personnage près d'une action principale contredit la règle « jamais flottant »). Décision produit si cela revient.
