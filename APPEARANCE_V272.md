# Apparence & personnalisation visuelle — V272

Issue #508. Base imposée et vérifiée : main `04431e55720f533980a9f0d6514f455df1df36d0`.
PR Draft, ne pas fusionner avant validation visuelle humaine.

## Audit avant modification

- Plus : `home-refresh-v2.js`. Réglages Planning et premier lancement : `navigation-controller.js`. Profil/départ : `profile-controller.js`. Aucune préférence d’apparence transverse existante.
- Tokens existants : `--bg`, `--card`, `--ink`, `--muted`, `--line`, `--brand`, `--brandSoft`, familles `--apple-*` et `--ios-*`. Les couches Glass et Visual Refresh ainsi que les styles locaux imposaient des couleurs claires, souvent avec `!important` : changer seulement les tokens du noyau ne suffisait pas.
- Bloqueurs : fonds/texte de l’Accueil, navigation basse, timeline Planning, cartes/champs Magasins, saisie/messages Assistant, Plus et feuilles de réglages. Les couleurs métier n’appartiennent pas à la palette d’accent.
- Aucun `prefers-color-scheme` ni `color-scheme` existant. Clair/Sombre/Système peut s’intégrer avec une seule résolution du mode et un abonnement MediaQueryList borné au choix Système.
- Le moteur durable `__chefStorage` possède les préférences UI existantes (cartes Accueil, premier lancement), hors `state` et sauvegarde métier. Il reste l’autorité pour l’apparence.
- Le shell réécrit le document par `document.write` : le mode résolu doit être présent aussi dans le nouvel HTML avant peinture. Le voile initial et `theme-color` étaient clairs. Le manifeste garde sa couleur d’installation par défaut ; le document suit l’apparence active.

## Contrat minimal

`index.html` possède `StoreRunnerAppearanceBoot.normalize/apply` : données bornées, attributs `data-sr-mode`, `data-sr-theme`, `data-sr-accent` et `theme-color`. Le miroir UI `store-runner-appearance-boot-v1` est lu synchroniquement dans le head avant la première peinture ; la clé durable `store-runner-appearance-v1` est relue après l’ouverture du moteur, sous le voile. Les attributs sont transmis au document réécrit. Aucune donnée métier ne passe par ce miroir.

`navigation-controller.js` possède `StoreRunnerAppearance.open/close/get/set/reset`, la clé durable et le dialogue unique `runnerAppearanceSheet`. `set/reset` affichent immédiatement le choix, lancent l’écriture durable et renvoient une promesse indiquant si elle a réussi. Une erreur est visible dans la feuille. Aucun bouton Appliquer. Aucun champ de `state` ajouté ou modifié.

Défaut Store Runner : Clair + Bleu. Modes : Clair, Sombre, Système. Accents bornés : Bleu, Indigo, Turquoise, Rose. Les tokens existants sont reliés à ces choix ; des tokens de surface et de remplissage distinguent texte d’accent et bouton plein pour conserver le contraste.

L’abonnement `prefers-color-scheme` existe seulement en mode Système, est retiré en mode explicite et à `pagehide`, puis réarmé à `pageshow`. Aucun polling, observer ni timer ajouté pour l’apparence.

## Runner et UX

- L’Accueil contient un bouton hôte nommé « Personnaliser Runner », avec le libellé visible Runner. Le personnage interne reste décoratif et ne capte aucun toucher ; le défilement reste natif.
- `instance.react()` est une extension de présentation pure : un clignement de 240 ms, sans déplacement ni timer. La réaction réutilise le cycle d’annulation existant, se termine aussi lors d’une interruption et ne démarre qu’à l’état neutre. Les états `analyzing`, `alert`, `success` et le mouvement réduit gardent la priorité.
- L’hôte attend la réaction puis ouvre la feuille si l’utilisateur est toujours sur l’Accueil. Une navigation ou un remplacement du DOM invalide l’ouverture en attente. La présence Home est suspendue pendant la feuille.
- La feuille Runner contient aperçu compact, apparence, accents et réinitialisation. L’aperçu est monté à l’ouverture, statique, puis détruit à la fermeture. Plus → Apparence ouvre exactement la même feuille.
- Dialogue natif : focus, Escape et retour Android suivent le comportement des autres dialogues de l’application ; aucune entrée d’historique supplémentaire.
- V273 pourra ajouter sa section Personnalité dans cette même feuille. Aucune personnalité n’est implémentée en V272.

Le corps, la visière, l’emblème et les couleurs métier de Runner sont conservés. Les bulles sombres adaptent leur surface/texte sans recolorer les états. Erreurs, alertes et succès restent sémantiques. Aucune règle Planning, V2, ni correction du stockage #505.

## Livraison et recette

BUILD_REV `20261005-r51-appearance-272`, displayVersion `272`. Budget inchangé : 77 scripts, aucune ressource de cache ajoutée ; `sw.js` ne change que de BUILD_REV. Le budget du composant Runner augmente de 44 à 45 Kio pour l’API de réaction, sans nouveau dessin ni dépendance.

## Validation et preuves

- Les 177 commandes `verify` du workflow Reliability ont été exécutées. 176 passent localement après relance du catalogue Python en UTF-8 ; le contrôle restant du bit exécutable de `android/gradlew` est incompatible avec NTFS. Le mode Git est bien `100755`, identique au main, et aucun fichier Android n’est modifié.
- Suite navigateur officielle lancée par `node tools/run-browser-tests.mjs`, même liste et Playwright 1.55.0 que la CI : 355 cas exécutés, dont 3 ignorés par leur configuration. Les échecs locaux et leurs rejeux sont détaillés dans la PR ; le workflow Reliability sur Linux reste la référence pour le résultat complet.
- Les 16 scénarios V272 couvrent Android 390, Android 360, profil iPhone, les trois modes, les quatre accents, les gestes réels, la sheet commune, les cibles tactiles, l’aperçu, le focus, la réinitialisation, les erreurs de stockage, le reload, le miroir périmé et le service worker réellement hors ligne. Les octets métier sont comparés avant/après.
- WebKit/iPhone : 7 scénarios passent ; le scénario service worker hors ligne est volontairement réservé à Chromium. La capture iPhone est issue de WebKit.
- Contraste : tous les textes actifs de la sheet sont contrôlés à au moins 4,5:1 dans les huit combinaisons explicites. Les 64 combinaisons état/variante de bulle/thème/accent de Runner et les bannières Assistant erreur/succès passent également 4,5:1. Une revue ciblée des cinq écrans vérifie les couleurs sémantiques indépendantes de l’accent ; elle ne constitue pas un audit WCAG exhaustif de l’application.
- Benchmark Planning inchangé : 58/58 magasins, 111 placements sur 9 semaines, couverture 100 %, 7 474 → 7 136 km, 8 154 → 7 785 minutes de conduite, zéro journée infaisable. Aucun fichier du moteur ni du benchmark n’est modifié.
- Revue indépendante du cycle de vie : réaction annulée à la navigation, état métier prioritaire, `pagehide/pageshow`, mouvement réduit, Assistant/Plus ouverts pendant le tap, destruction de l’aperçu et retour du focus.

Neuf [captures représentatives](tests/fixtures/appearance-v272/README.md) montrent les cinq surfaces, la sheet à 390/360 px et WebKit. Les scénarios utilisent uniquement un secteur synthétique.

## Validation humaine restante

La PR reste en Draft : contrôler le rythme du clignement, le toucher de Runner, la lisibilité et le confort visuel des cinq écrans sur Android/iPhone réels. Vérifier une PWA installée au démarrage à froid, après reload et hors ligne, ainsi que la barre système. Le document et son voile suivent le thème ; le splash fourni par l’OS conserve la couleur claire d’installation du manifeste. V272 ne change pas ce contrat de packaging.
