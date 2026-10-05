# Runner — Personnalité et comportements (V273) : fondation

Issue #509. **État : fondation isolée, non intégrée au runtime, en attente de la fusion de V272 (#508).**

Base : `main` `04431e5` (V271.1, `BUILD_REV` `20261005-r49-runner-presence-271`, `displayVersion` 271). Rien de ce qui est décrit ici n'est chargé par l'application : `index.html`, `sw.js`, `BUILD_REV`, `displayVersion`, `version.json`, les budgets de scripts, `runner-visual.js`, `home-refresh-v2.js` et la bottom sheet de V272 ne sont pas modifiés. Aucun comportement visible n'existe tant que l'intégration (W1 à W4, plus bas) n'a pas été faite sur le `main` qui contient V272.

Livré par cette fondation :

| Fichier | Rôle |
| --- | --- |
| `runner-behavior.js` | module pur `StoreRunnerBehavior` (non chargé) |
| `tests/runner-behavior-v273.test.cjs` | suite unitaire Node (ajoutée à Reliability) |
| `RUNNER_PERSONALITY_V273.md` | ce contrat |
| `.github/workflows/reliability-checks.yml` | une ligne : la suite est exécutée (exigé par `tests/reliability-coverage.test.cjs`) |

## Ce que c'est, ce que ce n'est pas

`StoreRunnerBehavior` décide **quelle réaction ambiante, s'il y en a une, Runner peut avoir à un instant donné**, selon la personnalité choisie, des faits fournis par l'écran hôte et un petit registre anti-spam. C'est tout. Il ne dessine rien, ne lit aucune donnée métier, ne parle à aucun moteur et ne choisit aucune visite.

- **Pur** : aucun DOM, aucune référence à Runner, aucun accès au `state`, aucun timer, listener, observer, polling, réseau, IA en ligne, `Math.random`, ni lecture de l'horloge (`Date.now`, `new Date`). L'heure (`now`, en millisecondes) et la date locale (`facts.date`, `AAAA-MM-JJ`) sont fournies par l'hôte.
- **Déterministe** : même entrée, même sortie. Les variantes de texte tournent selon un hachage et la dernière variante affichée, jamais selon un tirage.
- **Sans effet de bord** : `decide()` ne modifie rien. Les fonctions qui produisent un nouvel état (`record`, `touch`, `setPersonality`) renvoient **un nouveau registre gelé** ; aucune ne modifie ses arguments (vérifié sur objets gelés **et** ordinaires).
- **Sans exception** : toutes les fonctions publiques absorbent les entrées invalides (`null` / valeurs par défaut).
- **Il n'enrichit que l'état neutre.** Les états métier (`analyzing`, `alert`, `success`) restent produits et ordonnés par leurs propriétaires (Planning V269, Assistant V268, guide V271). `decide()` renvoie `null` dès que `view.state` n'est pas exactement `'neutral'`.

### Nom du module

Le global est **`StoreRunnerBehavior`** et non `StoreRunnerRunnerBehavior` (nom évoqué dans #509). Le détecteur de `tests/runner-visual-v269.test.cjs` (« liste exacte des fichiers qui branchent Runner ») cherche le texte `StoreRunnerRunner` ; le nom long fait prendre le module pour un hôte de Runner et fait échouer ce test (vérifié). Renommer en `StoreRunnerRunnerBehavior` demande d'affiner ce pin (`StoreRunnerRunner(?!Behavior)`) : à faire en W1, dans le `main` post-V272, pour ne pas entrer en collision avec V272 qui peut modifier ce même test. Le fichier s'appelle `runner-behavior.js`.

## API publique

| Fonction | Rôle |
| --- | --- |
| `decide(input, registry, options?)` | réaction gagnante (descripteur gelé) ou `null` |
| `record(registry, reaction, {now, date}, options?)` | `{ registry, dirty }` : à appeler **quand la réaction est réellement montrée** |
| `touch(registry, {now, date}, options?)` | `{ registry, dirty }` : « l'utilisateur est actif aujourd'hui » (chaque hôte, à son affichage) |
| `setPersonality(registry, id, options?)` | `{ registry, dirty }` ; id inconnu : inchangé |
| `title(personalityId, surface, state, options?)` | titre d'un état métier (`analyzing`, `alert`, `success`) pour `'planning'` ou `'assistant'` ; `null` sinon |
| `listPersonalities(options?)` | métadonnées pour la future section de la sheet (sans le texte) |
| `defaultRegistry()`, `normalizeRegistry(raw, ctx?, options?)` | registre par défaut ; lecture tolérante |
| `serializeRegistry(registry, ctx?, options?)`, `parseRegistry(text, ctx?, options?)` | sérialisation bornée / lecture tolérante |
| `loadRegistry(adapter, ctx?, options?)`, `saveRegistry(adapter, registry, ctx?, options?)` | persistance abstraite (adaptateur injecté) |
| constantes | `VERSION`, `STORAGE_KEY`, `DEFAULT_PERSONALITY`, `STATES`, `SURFACES`, `TRIGGERS`, `GESTURES`, `ATTENTION_KINDS`, `CONFIG`, `PERSONALITIES`, `REACTIONS` (toutes gelées) |

`dirty` vaut `true` seulement si la **partie persistée** du registre a changé : l'hôte n'écrit que dans ce cas. `options` (facultatif) accepte `{ config, personalities }` pour remplacer des seuils ou le catalogue (tests, futures expériences) ; les valeurs invalides sont ignorées.

### Séquence côté hôte (future)

```js
const B = window.StoreRunnerBehavior;                    // chargé après l'intégration, pas avant
let reg = B.loadRegistry(adapter, { now, date });        // adapter = { getItem, setItem, removeItem } fourni par l'hôte
const reaction = B.decide({
  surface: 'home', trigger: 'arrive', now, view: { state: 'neutral' },
  facts: { date, workday, mode, tour, attention, lastVisitDaysAgo, returnFrom }
}, reg);
if (reaction) {
  // l'hôte applique le descripteur avec l'API de présentation de Runner, sans que ce module la connaisse
  const r = B.record(reg, reaction, { now, date });
  reg = r.registry;
  if (r.dirty) B.saveRegistry(adapter, reg, { now, date });
}
const t = B.touch(reg, { now, date }); reg = t.registry; if (t.dirty) B.saveRegistry(adapter, reg, { now, date });
```

### Entrée de `decide`

| Champ | Valeurs | Remarque |
| --- | --- | --- |
| `surface` | `home` · `planning` · `assistant` · `sheet` | `planning` et `assistant` n'ont aucune réaction ambiante en V273 (seulement `title()`) |
| `trigger` | `arrive` · `rerender` · `touch` · `personality` | `rerender` ne concerne que `tour.finished` |
| `now` | millisecondes | nombre fini obligatoire |
| `view.state` | doit valoir `'neutral'` | absent ou autre : `null` (fermé par défaut) |
| `view.keyboard / firstRun / updating / overlay` | booléens | l'un d'eux à `true` : `null` ; `overlay` est ignoré pour la surface `sheet` (elle est elle-même une feuille) |
| `facts.date` | `AAAA-MM-JJ` valide (calendrier vérifié) | sans date valide, aucune réaction ambiante |
| `facts.workday` | booléen | jour travaillé |
| `facts.mode` | `today` · `next` | contexte « Aujourd'hui » ou « prochaine journée » de l'Accueil |
| `facts.afterHours`, `facts.busy` | booléens | après 20 h ; génération en cours |
| `facts.tour` | `{ total, done, finished }` entiers | tournée du jour, telle que la donne son propriétaire |
| `facts.attention` | `{ kind, key, label, reason? }` | `kind` : `action-overdue` · `late` · `visit-open` ; `label` ≤ 32 caractères, `reason` ≤ 40 (bornés, nettoyés) |
| `facts.lastVisitDaysAgo` | entier ≥ 0 ou absent | |
| `facts.returnFrom` | texte ou absent | origine d'un vrai retour (le texte n'est pas interprété) |

Les faits sont des **primitives** que l'hôte tire de ce que ses propriétaires ont déjà calculé ; ce module n'en calcule aucun et n'en lit aucun. Les textes des propriétaires (`label`, `reason`) sont du texte brut : l'hôte les affiche en `textContent`, jamais en HTML.

### Sortie de `decide` (descripteur gelé)

`{ id, kind, weight, surface, personality, state, gesture, gestureMs, look, text, messageMs, silent, meta }`

- `state` : `neutral`, ou `success` pour `tour.finished`.
- `gesture` : `acknowledge` · `nod` · `lookToward` · `settle` · `null` (vocabulaire de présentation, voir plus bas) ; `look` : `card` · `down` · `null` (cible du regard ; l'ancre DOM appartient à l'hôte).
- `text` : texte déjà rendu, ou `null` (geste ou état seul).
- `messageMs` : durée d'affichage du message ou de l'état (`CONFIG.messageMs`), `0` s'il n'y en a pas ; `gestureMs` : durée indicative du geste.
- `silent` : toujours `true` (le texte ambiant n'est pas annoncé aux lecteurs d'écran).
- `meta` : usage de `record` (`variantIndex`, `key`, `textCounted`, `absorbs`).

## Personnalités (données)

Quatre personnalités, **noms provisoires** (⚖ à valider). Ce sont des données gelées dans `PERSONALITIES` ; la logique n'en dépend pas et les tests n'assertent aucun texte (invariants et gabarits seulement).

| `id` | Label | Ton | Proactivité | Textes ambiants / jour | Idle | Réactions permises |
| --- | --- | --- | --- | --- | --- | --- |
| `copilote` (défaut) | Copilote | factuel | 1 | 2 | oui | toutes |
| `coequipier` | Coéquipier | chaleureux | 2 | 3 | oui | toutes |
| `coach` | Coach | énergique | 2 | 3 | oui | toutes |
| `discret` | Discret | minimal | 0 | **0** | **non** | `tour.finished` (état seul), `personality.changed` |

Par personnalité : `label`, `blurb`, `tone`, `proactivity` (0 à 2, plafond d'attentions par jour), `textBudgetPerDay`, `idle` (l'hôte appelle `setPresence(false)` pour `false`), `titles` (par surface hôte), `reactions` (réaction permise = présente ; `copy` vide = geste ou état seul).

- **Un texte est un gabarit** : `{fait}` insère un fait fourni par l'hôte, `{fait:mot}` ajoute le mot (« 1 jour », « 6 jours »). Faits connus : `done`, `total`, `days`, `lastVisit`, `label`, `reason`. Une variante dont un fait manque est **inutilisable** (jamais de gabarit brut affiché) ; si aucune variante n'est utilisable et que la réaction vit du texte, elle n'a pas lieu.
- **Le corps des messages métier reste celui du propriétaire** ; la personnalité ne fournit que les **titres** des états métier (`titles`), les lignes ambiantes et le budget. Aucun titre ne dit un fait métier.
- **Copilote reprend exactement les titres V271** (Planning : « Génération en cours… », « Contrainte détectée », « C'est fait ! » ; Assistant : « Analyse en cours… », « Attention ! », « C'est fait ! »). Un test lit `planning-ui-fixes.js` et `assistant-upgrade.js` pour le prouver ; il devra être adapté à l'intégration (W2), quand les hôtes demanderont leurs titres à `title()`.
- **Lint de copy** (testé) : ≤ 90 caractères dans le pire cas (faits au maximum), un seul « ! », pas d'emoji, tutoiement, ponctuation finale, mots interdits (« optimal », « optimisé », « meilleur », « urgent », « vite »…), au moins deux variantes (sauf `discret`) et au moins deux variantes utilisables avec les seuls faits obligatoires.
- Les noms, les textes et les titres se modifient sans toucher à la logique ; seules les assertions de gabarits et de lint les encadrent.

## Réactions

| `id` | `kind` | Poids | Surfaces | Déclencheur | État | Geste / regard | Condition (faits) | Cooldown |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `personality.changed` | user | 90 | sheet | `personality` | neutral | `acknowledge` | aperçu après choix explicite | 1 aperçu / `previewGapMs` ; **hors budget et hors écarts** |
| `tour.finished` | ambient | 70 | home | `arrive`, `rerender` | **success** | — | `tour.total ≥ 1` et `tour.finished` | 1 / date locale ; l'état suffit si le texte est refusé |
| `attention.notice` | ambient | 60 | home | `arrive` | neutral | `lookToward` / `card` | `attention` valide, sous le plafond du jour | 1 / magasin tous les `attentionRepeatDays` jours ; ≤ `min(proactivité, attentionMaxPerDay)` / jour |
| `welcome.back` | ambient | 55 | home | `arrive` | neutral | `acknowledge` / `down` | absence ≥ `absenceDays` jours calendaires | une fois par absence ; **absorbe** `day.ready` |
| `day.ready` | ambient | 40 | home | `arrive` | neutral | `lookToward` / `card` | tournée non commencée, jour travaillé, avant 20 h, mode `today` | 1 / date locale |
| `day.empty` | ambient | 40 | home | `arrive` | neutral | `lookToward` / `down` | jour travaillé, aucune tournée, mode `today`, pas de génération | 1 / date locale |
| `home.return` | presence | 30 | home | `arrive` | neutral | `settle` | `returnFrom` présent | rafale : `returnBurstMax` / `returnBurstWindowMs`, au-delà placement direct |
| `touch.runner` | social | 20 | home, sheet | `touch` | neutral | échelle `touchLadder` | personnalité qui le permet | série, fenêtre et silence (voir CONFIG) |

Pas de `day.loaded` (journée chargée) : le seuil appartient à `planning-pro-plus.js` (`l-f<30`) et n'est pas exposé ; ne pas dupliquer la constante (reporté, voir plus bas).

## Arbitrage et anti-spam (ce que le code fait réellement)

1. **Une seule réaction gagnante** : parmi celles qui sont éligibles, le plus grand `weight` gagne ; l'ordre du catalogue départage. Pas de file d'attente. L'hôte applique ce qu'il reçoit ; ce qui n'est pas retenu n'est pas rejoué.
2. **Le métier gagne toujours** : `view.state !== 'neutral'` ⇒ `null`. Une alerte ou un succès métier n'est jamais écrasé, et ne passe jamais par un budget ni un cooldown (ils ne passent pas par ce module).
3. **Blocages** : clavier ouvert, guide de premier lancement ouvert, mise à jour en cours, overlay ouvert (sauf la sheet) ⇒ `null`.
4. **Budget de texte ambiant** par date locale et par personnalité, **et** écart minimal `textGapMs` entre deux textes. Un texte refusé par le budget ou l'écart empêche la réaction, sauf `tour.finished` qui garde son état de réussite sans texte et sans consommer le budget.
5. **Écart entre deux gestes ambiants** (`gestureGapMs`) : le geste est supprimé, le texte reste.
6. **Garde d'arrivée** (`arrivalGuardMs`) : pas de seconde réaction ambiante sur la même surface juste après la précédente (navigation rapide).
7. **Rotation déterministe sans répétition** : première variante tirée d'un hachage (réaction + date + clé + personnalité), puis variante suivante utilisable après la dernière affichée ; jamais deux fois la même d'affilée ; une variante unique n'est pas réaffichée avant `repeatWindowMs`. (L'aperçu de personnalité, action de l'utilisateur, n'est pas soumis à cette fenêtre.)
8. **Attention** : par magasin, tous les `attentionRepeatDays` jours ; plafond quotidien = `min(proactivité de la personnalité, attentionMaxPerDay)` ; le fait disparu ne produit rien.
9. **Absence** : calculée sur les **dates** (`AAAA-MM-JJ`), pas sur des heures : insensible au changement d'heure, aux fuseaux et aux années bissextiles. `touch` mémorise l'absence détectée (`welcome`) pour qu'un autre écran ouvert avant l'Accueil ne la fasse pas disparaître ; elle expire à la fin de la date et est consommée par `record`. Une date de dernière activité dans le futur ne déclenche jamais rien.
10. **Toucher borné** : échelle `touchLadder` (par défaut `acknowledge` puis `nod`) pour les touchers d'une même série (`touchChainMs`), au plus `touchMaxReactions` par `touchWindowMs`, puis silence `touchLockoutMs` ; rien n'est persisté ; l'action principale de l'hôte n'est jamais retardée par ce module.
11. **Retour animé borné** : `returnBurstMax` retours par `returnBurstWindowMs`, ensuite placement direct.
12. **Aucun son, aucune vibration, aucune notification** : ce module n'a aucun moyen d'en produire. **Aucun mouvement permanent** : il ne produit que des descripteurs ponctuels ; l'idle V271.1 reste à Runner (`idle:false` de `discret` signifie « l'hôte coupe la présence »).
13. **Horloge qui recule** : un horodatage dans le futur ne bloque jamais définitivement (traité comme « assez ancien »).

## Configuration (`CONFIG`)

Tous les seuils encore soumis à décision humaine (⚖) sont regroupés dans `CONFIG` (gelé) et remplaçables par `options.config`. Un test vérifie que **chaque** clé est exercée : ajouter un seuil sans test fait échouer la suite. Aucun de ces nombres n'est écrit dans la logique.

| Clé | Défaut | Rôle |
| --- | --- | --- |
| `absenceDays` ⚖ | 5 | jours calendaires sans activité avant un « retour » |
| `textGapMs` ⚖ | 10 min | écart minimal entre deux textes ambiants |
| `gestureGapMs` | 20 s | écart minimal entre deux gestes ambiants |
| `arrivalGuardMs` | 3 s | navigation rapide sur une même surface |
| `repeatWindowMs` | 24 h | un même texte n'est pas réaffiché dans cette fenêtre |
| `attentionRepeatDays` ⚖ | 3 | même magasin : au plus une fois tous les N jours |
| `attentionMaxPerDay` ⚖ | 2 | plafond global (la personnalité peut être plus basse) |
| `touchLadder` | `['acknowledge','nod']` | réactions successives d'une série de touchers |
| `touchChainMs` | 10 s | écart maximal dans une série |
| `touchWindowMs` | 60 s | fenêtre de comptage |
| `touchMaxReactions` ⚖ | 3 | réactions au toucher par fenêtre |
| `touchLockoutMs` | 20 s | silence après la dernière réaction permise |
| `returnBurstMax` ⚖ | 3 | retours animés par fenêtre |
| `returnBurstWindowMs` | 60 s | fenêtre de la rafale |
| `previewGapMs` | 2 s | un aperçu de personnalité par intervalle |
| `activeWriteGapMs` | 30 min | écriture de « dernière activité » au plus toutes les N minutes |
| `shownTtlDays` | 14 | durée de vie des entrées du registre |
| `shownMax` | 24 | nombre maximal d'entrées |
| `registryMaxChars` | 2048 | taille maximale du registre sérialisé |
| `labelMaxChars` / `reasonMaxChars` | 32 / 40 | longueur maximale des textes fournis par un propriétaire |
| `messageMs` | 6 s | durée d'affichage d'un message ou d'un état de réaction |

Les budgets par jour (2 / 3 / 3 / 0) et la proactivité sont des **données de personnalité** (⚖), pas des constantes de la logique.

## Registre et persistance

Clé prévue : `store-runner-runner-v1`, dans le moteur durable de l'application (comme `store-runner-home-cards-v1` et `store-runner-onboarding-v1`), **hors `state`, hors sauvegarde JSON, hors `schemaVersion`**. Absence de clé = Copilote et aucun historique. **Cette fondation ne la connecte à rien** : `loadRegistry`/`saveRegistry` reçoivent un adaptateur fourni par l'hôte (`getItem`, `setItem`, `removeItem`) et ne touchent aucun stockage directement.

Schéma (partie persistée) :

```json
{ "v": 1, "personality": "copilote", "lastActiveDate": null, "lastActiveAt": null, "lastTextAt": null,
  "textDay": { "date": null, "n": 0 }, "shown": { "<clé>": { "d": "AAAA-MM-JJ", "t": 0 } },
  "variant": { "<réaction>": { "i": 0, "t": 0 } }, "welcome": null }
```

La mémoire de session (`session` : derniers gestes, touchers, retours, aperçu) vit dans le registre en mémoire mais **n'est jamais sérialisée ni lue sur disque**.

- **Tolérance** : lecture champ par champ ; une valeur invalide revient à sa valeur par défaut sans emporter les autres champs. Texte illisible, JSON invalide, valeur non objet, **version future** (`v` > 1) ou texte de plus de 4 × `registryMaxChars` ⇒ valeurs par défaut.
- **Sécurité** : clés restreintes à `[A-Za-z0-9._:-]{1,64}` et `__proto__`, `constructor`, `prototype` refusées (aucune pollution de prototype) ; personnalité inconnue ⇒ Copilote.
- **Bornes** : entrées expirées (`shownTtlDays`) purgées, au plus `shownMax` entrées (les plus récentes), sérialisation ≤ `registryMaxChars` (les plus anciennes entrées sortent d'abord, puis les variantes ; en dessous de la taille minimale d'un registre, valeurs par défaut).
- **Écritures** : `dirty` n'est vrai que si la partie persistée change ; un toucher, un retour animé ou une écriture de « dernière activité » de moins de `activeWriteGapMs` n'écrivent rien. `saveRegistry` retire la clé quand le registre est celui par défaut, ne lève jamais et renvoie `false` si l'écriture est refusée.
- Aucun changement du schéma de `state`, aucune donnée métier, aucune suppression de données.

## Vocabulaire de présentation (à fournir par Runner en W1)

Ce module ne nomme que des gestes **génériques** : `acknowledge`, `nod`, `lookToward`, `settle`. `settle` existe (`returnToRest`, V271.1) ; `acknowledge`, `nod` et `lookToward` n'existent pas encore et seront ajoutés à `runner-visual.js` en W1, en `transform`/`opacity`, Web Animations finies, no-op sous `prefers-reduced-motion` et `motion:'off'`, sans nom d'écran ni de réaction. Le plafond de 44 KiB de `runner-visual.js` est conservé (D3) ; si les trois gestes ne tiennent pas dans la marge, le sujet revient avec des chiffres avant tout relèvement.

## Tests

`node tests/runner-behavior-v273.test.cjs` (Node, ajouté à Reliability) :

- **Interdictions architecturales** (sur le code sans commentaires) : DOM, listeners, observers, timers, réseau, évaluation dynamique, aléa, horloge, stockage direct, référence à Runner, accès au `state`, accès au global, moteurs Planning/métier ; le module s'exécute dans un contexte vide ; il n'est nommé ni par `index.html` ni par `sw.js` ; le global ne déclenche pas le pin de câblage de `runner-visual-v269` ; taille bornée (brut et gzip).
- **Données** : personnalités gelées, invariants, quatre voix distinctes, `discret` muet et sans idle, Copilote = titres V271, lint de copy.
- **Portes** : tout état ≠ `neutral`, clavier, guide, mise à jour, overlay, entrées invalides, dates invalides, entrées piégées.
- **Priorité** : un gagnant, ordre des poids, absorption, budget par personnalité.
- **Déterminisme et non-mutation** : 25 appels identiques, indépendance de l'ordre des clés, entrées **gelées et ordinaires** inchangées, sorties gelées.
- **Cooldowns, budgets, dates** : minuit, un seul jour par date locale, écarts exacts, garde d'arrivée, geste supprimé et texte conservé, attention (répétition, plafond, disparition), absence (4 ou 5 jours, années bissextile et ordinaire, passage d'année, changements d'heure), absence consommée / expirée / mémorisée par un autre écran, écriture limitée.
- **Textes** : gabarits et pluriels, rotation sans répétition, variante unique, nettoyage et bornes des textes fournis (contrôles, emoji, HTML brut), catalogue personnalisé.
- **Toucher, retour, aperçu** : échelle, série, fenêtre, silence, rafale, Discret, aperçu hors budget.
- **Registre** : défaut, 20 entrées hostiles, tolérance champ par champ, prototype, TTL, bornes, taille, aller-retour sans la session, adaptateur défaillant, horloge qui recule.
- **Configuration** : valeurs invalides ignorées, et **chaque** clé de `CONFIG` exercée.

La suite est indépendante du fuseau horaire (rejouée sous `UTC`, `Europe/Paris`, `America/Los_Angeles`, `Pacific/Auckland`, `Asia/Kolkata`).

## Intégration prévue (après la fusion de V272, **pas avant**)

| Vague | Contenu |
| --- | --- |
| W0 | re-audit sur l'API réelle de V272 : bottom sheet, toucher sur Runner, tokens et CSS de bulle (mode sombre), persistance, pins de tests ; rebase de cette branche ; rapport des collisions |
| W1 | chargement du module (78ᵉ script : `index.html`, `CORE_SHELL` de `sw.js`, budgets 77 → 78, bump `BUILD_REV`) ; primitives de présentation de Runner ; affinage du pin de câblage ; assertions « non chargé » de la suite de ce module à retourner en assertions « chargé et mis en cache » |
| W2 | section « Personnalité » dans la sheet de V272 ; titres par personnalité sur les états métier existants (Planning, Assistant) via `title()` |
| W3 | Accueil : `tour.finished`, `welcome.back`, `attention.notice`, `day.ready`, `day.empty` (et le slot de texte, décision D6) |
| W4 | toucher sur Runner et aperçu de personnalité |
| W5 | `day.loaded`, quand `planning-pro-plus.js` exposera son seuil (lot du propriétaire) |

D1 (V272 livre le toucher et la sheet), D2 (78ᵉ script et `sw.js`) et D3 (plafond de `runner-visual.js` conservé) sont tranchées dans #509. **Ces autorisations ne valent qu'après la fusion de V272** : cette fondation n'y touche pas.

## Points volontairement en attente de V272

- l'API réelle de la bottom sheet et son point d'extension pour une section « Personnalité » ;
- la façon dont Runner devient tactile sur l'Accueil (bouton posé par l'hôte, rappel) ;
- le CSS final des bulles (mode sombre) avant d'écrire le moindre texte visible ;
- la convention de préférence retenue par V272 (clé, moteur durable) ;
- les pins de tests que V272 modifie (`#homeRunnerV270{pointer-events:none}`, liste des fichiers qui branchent Runner, budget de scripts) ;
- le slot de texte de l'Accueil (D6) ;
- tout fichier de build ou de cache : `index.html`, `sw.js`, `version.json`, `BUILD_REV`, `displayVersion`, budgets de scripts.

## Décisions encore ouvertes

D4 (convention de clé, hors `state` et hors sauvegarde), D5 (nouveaux comportements activés par défaut avec Copilote, à faible intensité), D6 (ligne de texte dans le flux de l'Accueil ou gestes seuls), D7 (noms et textes des personnalités), D8 (seuil d'absence et budgets), D9 (aucun événement propriétaire nouveau en V273), et le nom du global (`StoreRunnerBehavior` ou `StoreRunnerRunnerBehavior` avec affinage du pin).

## Ce qui n'est pas fait, volontairement

Aucun branchement à l'application, aucun nouveau script de démarrage, aucune modification de `runner-visual.js`, de l'Accueil, du Planning, de l'Assistant, de la sheet de V272, de `index.html` ou de `sw.js`, aucun bump de `BUILD_REV` ni de `displayVersion`, aucun événement propriétaire nouveau, aucune IA en ligne pour décider des animations, aucune lecture de position ni de donnée métier.
