# Runner Visual System V1

Runner est le copilote **visuel** de Store Runner : un personnage, quatre états, une bulle. Ce lot ne crée que la couche de présentation réutilisable. **Rien n'est branché** : aucun écran, aucun moteur (Planning, Forecast, Command Engine, Explorer Terrain) ne connaît Runner.

- Build `20261004-r41-runner-visual-266`, version visible **inchangée : 266**.
- PR Draft, **non fusionnée**. Décision à valider avant fusion : voir « Chargement et budget de démarrage ».
- Module : `runner-visual.js` (`StoreRunnerRunner`, alias `Runner`). Un seul fichier, aucune dépendance, aucune feuille séparée.

![États de Runner](tests/fixtures/runner-visual-states.webp)

![Aperçu 390 px](tests/fixtures/runner-visual-preview-390.webp)

## Direction visuelle

Les deux planches officielles Runner V1 fixent la direction : silhouette en goutte, tête nacrée, **visière sombre** à liseré bleu, yeux lumineux, **crête bleue** type aileron, pastille d'oreille bleue, corps ovoïde blanc, **emblème de navigation** (flèche bicolore dans un disque), mains bleues, halo bleu sous le corps, palette blanc/bleu. Le dessin les reprend sans réinterprétation : seuls les yeux, les bras et les effets changent d'un état à l'autre.

| État | Yeux | Geste | Effet |
| --- | --- | --- | --- |
| `neutral` — En attente | deux arches cyan | bras ouverts | aucun |
| `analyzing` — Il réfléchit | un ovale, un trait oblique | main au menton | trois points bleus |
| `alert` — Une contrainte détectée | deux ovales ambre | bras tendu | pastille rouge « ! », éclats ambre |
| `success` — Tout est ok | une arche, un clin d'œil | main bleue levée | éclats verts |

**Limite connue, à lire.** Les planches fournies sont des images raster sans source maître (ni SVG, ni PNG transparent, ni modèle 3D) ; le rendu 3D n'est pas extractible proprement (fond dégradé, résolution ≈ 150 px pour un état). Le dessin est donc un **redessin vectoriel** fidèle aux formes, aux couleurs et aux proportions, mais plus « à plat » que le rendu 3D (ombres et reflets simplifiés, pas de matière). Si le design livre un jour l'art maître, il remplace le gabarit SVG de `runner-visual.js` sans toucher à l'API ni aux écrans hôtes.

Pas d'actifs raster dans le runtime : un SVG inline reste net à toute densité (iPhone 3×, Android), pèse ≈ 11 Ko par instance et ne demande aucun fichier de plus à précacher. Un jeu WebP/PNG ne se justifiera que pour une surface qui ne peut pas porter de SVG (notification système, carte de partage) : décision à prendre alors, pas maintenant.

## Ce que Runner ne fait jamais

- **Aucune donnée** : ni `state`, ni stockage, ni IndexedDB, ni agenda, ni performance, ni photos. Aucun nom de magasin n'y est lu.
- **Aucune décision** : il ne choisit, ne place, ne déplace ni ne simule aucune visite. Il n'est appelé par aucun moteur ; c'est le propriétaire d'un écran qui traduit le résultat de son moteur en état visuel, jamais l'inverse.
- **Aucun propriétaire contourné** : aucune fonction globale remplacée, aucun `window.xxx =` hors `StoreRunnerRunner` / `Runner`.
- **Aucune surveillance** : pas de `setInterval`, pas d'observateur, pas d'écouteur `focus` / `visibilitychange` / `resize`, pas de `requestAnimationFrame`.
- **Aucun réseau**, aucune évaluation dynamique, aucun HTML dynamique : une bulle s'écrit en `textContent`. Un nom de magasin comme `<img onerror=…>` y reste du texte.

Au démarrage il ne fait strictement rien : aucun nœud, aucun style, aucun écouteur. La feuille de style n'est injectée qu'au premier `mount()`.

## API de présentation

L'API globale n'agit que sur le Runner **principal** (le dernier monté encore présent dans le document). Sans Runner monté elle ne crée rien et répond `false` : appeler `Runner.setState(...)` depuis un moteur avant qu'un écran n'ait monté Runner est donc sans effet, jamais une erreur. Aucune méthode ne lève d'exception vers le code appelant.

```js
// L'écran hôte décide de l'emplacement.
const runner = Runner.mount(container, { state:'neutral', size:'md', side:'right' });

Runner.setState('analyzing');                                  // true | false
Runner.showMessage('Je vérifie les contraintes…');             // bulle
Runner.showMessage({ title:'Attention', text:'…' }, { state:'alert' });
Runner.setState('success', { message:'Tournée optimisée', title:'Parfait !', resetAfter:4000 });
Runner.hideMessage();
Runner.reset();                                                // neutre, bulle fermée
Runner.getState();                                             // 'neutral' | … | null
Runner.unmount(container | runner);
```

| Élément | Rôle |
| --- | --- |
| `Runner.STATES`, `STATE_LABELS`, `SIDES`, `SIZES` | constantes gelées |
| `mount(conteneur, options)` | retourne l'instance, ou `null` si le conteneur est introuvable |
| options de `mount` | `state`, `size` (`sm` 56 · `md` 88 · `lg` 128 · `xl` 176 · nombre 32–320), `side` (`right` · `left` · `top` · `bottom`, côté de la bulle), `message`, `title`, `duration`, `motion` (`'off'` coupe tout mouvement), `decorative` (aucun nom accessible) |
| `setState(état, { message, title, duration, resetAfter, side })` | état inconnu refusé (`false`), même état : aucun rejeu |
| `showMessage(texte \| { text, title, state, duration, side }, options)` | texte borné à 280 caractères, titre à 60, durée 1,5 s – 2 min (`0` : reste jusqu'à `hideMessage`) ; un texte vide ferme la bulle |
| instance | `el`, `getState`, `setState`, `showMessage`, `hideMessage`, `reset`, `destroy`, `isConnected` |
| événement | `store-runner:runner-state`, émis sur l'élément et remontant dans le document (`bubbles`), `detail: { state, previous, id }`, seulement quand l'état change |

Un Runner dont le conteneur est retiré par un rendu de l'écran hôte est oublié au prochain appel : pas de fuite, pas d'observateur. `unmount` accepte l'instance ou son conteneur.

## Un état, pas une reconstruction

Tous les calques du dessin sont déjà dans le SVG ; `data-state` sur le conteneur en rend un seul visible (fondu 0,16 s). Changer d'état ne reconstruit aucun nœud, ne relit aucune donnée et ne crée aucun timer (sauf `duration` / `resetAfter`, demandés explicitement, un seul timer chacun, annulé par tout nouvel appel ou par `destroy`).

## Accessibilité

- La figure est `role="img"` avec un nom : « Runner, copilote terrain : en attente / il réfléchit / une contrainte détectée / tout est ok ». `decorative:true` la masque quand le texte voisin dit déjà la même chose.
- Une région `role="status"` (visuellement masquée) annonce la bulle et les changements d'état ; elle passe en `aria-live="assertive"` pour une alerte. La bulle visuelle est `aria-hidden` : pas de double lecture. Retour au calme : aucune annonce.
- Runner est **décoratif au toucher** : `pointer-events:none`, aucun élément focusable. Il ne capte jamais un tap destiné à l'écran dessous, et n'ajoute aucune cible de 44 px à garantir.
- Texte de bulle ≥ 14 px, contraste encre `#10224d` sur blanc.
- `prefers-reduced-motion: reduce` coupe toute animation et toute transition ; les états restent distincts par les yeux, les gestes et les effets. `motion:'off'` fait de même à la demande de l'écran hôte (captures déterministes).

## Mouvement et performance

- Animations en `transform` / `opacity` uniquement, pas de `will-change` permanent, **aucun filtre SVG** (les lueurs sont des formes translucides).
- Au repos : **aucune animation**. Changement d'état : une entrée de 0,42 s, jouée une fois. Bulle : une entrée de 0,22 s.
- Une seule boucle existe, les trois points de `analyzing`, **bornée à 16 passages (≈ 22 s)** : un état oublié ne tourne jamais en continu. Alerte : deux pulsations. Succès : une apparition des éclats.
- Poids : `runner-visual.js` ≈ 27 Ko, ≈ 9 Ko compressé (dessin ≈ 10 Ko, style ≈ 5 Ko, logique), SVG ≈ 153 éléments par instance, identifiants de dégradés uniques par instance (un Runner masqué ne prive jamais un autre de ses dégradés).
- Si plus de quelques Runners coexistent un jour, le dessin pourra passer en sprite partagé (`<symbol>`) ; inutile pour un à deux Runners par écran.

## Chargement et budget de démarrage

`runner-visual.js` est chargé avec les autres modules par `index.html` (avant `weekly-brief-import-v246b.js`, `mobile-ux-v262.js` restant le dernier module) et précaché dans le shell obligatoire de `sw.js`, comme tout ce que `index.html` charge. Il fait **77** ressources script au démarrage au lieu de 76 : le plafond de `CLEANUP_BASELINE_R20.md` / `tests/fixtures/cleanup-baseline-r20.json` est relevé d'une unité, comme pour `store-explorer.js`. **Cette décision est à valider avant fusion.**

Alternative sans nouveau script de démarrage : ne pas charger Runner au démarrage, et laisser le premier propriétaire d'écran qui l'adoptera ajouter `runner-visual.js` dans sa propre PR (avec le bump et le plafond). Ce lot serait alors un pur ajout de fichiers sans effet sur le runtime ; l'inconvénient est que l'API n'existe pas dans la PWA tant qu'un écran ne l'embarque pas, donc pas de test navigateur « dans l'application ». Le choix retenu ici (chargé mais dormant) a été préféré pour que le prochain lot n'ait qu'à appeler `Runner.mount`.

Fusion : modification de `sw.js` au-delà de `BUILD_REV` (une entrée de shell) → accord humain explicite requis par `AGENTS.md`.

## Points d'intégration futurs (non faits)

Dans tous les cas, **le propriétaire de l'écran monte Runner et traduit son propre résultat** ; Runner ne lit jamais le résultat d'un moteur.

| Surface | Intégration envisagée |
| --- | --- |
| Assistant / Command Engine | `mount` dans l'en-tête de la feuille ; `analyzing` pendant l'interprétation, `alert` quand l'aperçu cite une contrainte, `success` après l'application validée. Les commandes planning restent hors des actions directes de l'IA en ligne. |
| Planning | bulle de proposition sur l'accueil ou le jour actif ; propriétaire : `planning-ui-fixes.js` pour l'emplacement. |
| Explorer Terrain | message court dans la fiche Magasin 360 pour une contrainte active (la source reste `store-explorer.js`). |
| Alertes de contraintes | `alert` + `showMessage` à partir du texte déjà produit par le propriétaire de la contrainte. |
| Succès après application | `setState('success', { message, resetAfter })` à l'événement existant `store-runner:planning-updated`. |

Chacune demande sa propre PR, son propre test et, si l'écran change, une vérification 390 px.

## Tests

| Test | Contrat |
| --- | --- |
| `tests/runner-visual-v266.test.cjs` (Reliability) | chargé une fois, précaché, build cohérent, version visible 266 ; aucune donnée / moteur / écouteur / observateur / réseau / `setInterval` ; texte jamais en HTML ; animations `transform`/`opacity` seulement, aucune `infinite`, boucle bornée à 16 ; API pure (normalisation, bornes, emoji, état inconnu) ; alias `Runner` jamais écrasé ; aucun module ne branche Runner |
| `tests/runner-visual-v266-browser.spec.cjs` (mobile 390 px, Android puis iPhone) | démarrage dormant dans la vraie app ; `state` et stockage strictement inchangés ; style de la bulle non altéré par l'app ; quatre états et un seul calque visible ; injection `<img onerror>` inerte ; annonce lecteur d'écran ; durées et retour automatique ; aucun débordement horizontal, rien de focusable ; tailles et dessin dans le cadre ; Runner principal et oubli ; aucune animation au repos, boucle bornée ; mode réduit d'animations ; `motion:'off'` |
| `tests/fixtures/runner-visual-preview.html` | page d'aperçu de test (jamais chargée par l'app ni mise en cache) : les cinq contextes d'écran à 390 px |

Plafond de scripts : `tests/priority-campaign-removal-browser.spec.cjs` (77) et `tests/fixtures/cleanup-baseline-r20.json`.

## Questions ouvertes

1. Valider le plafond 77 (ou choisir l'alternative sans chargement au démarrage).
2. Art maître : le design peut-il fournir un SVG ou un PNG transparent haute définition ? Le gabarit actuel est un redessin.
3. Faut-il une pose « salut » (bras levé, hero de la planche) pour l'accueil ? Hors périmètre : les quatre états demandés sont livrés ; les poses (propose, montre le planning, analyse, explique, valide) sont des variantes de gestes qui s'ajoutent sans changer l'API.
4. Placement d'un éventuel Runner flottant (bouton IA) : décision produit, non préparée ici.
