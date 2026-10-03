# Hotfix r38 — dates et départ géographique

Base : `main` `d294a139f1970e34cb60e6ba13738f28bbc6b202`, r37.
Build proposé : `20261003-r38-temporal-geographic-coherence-264`, displayVersion 264.
Branche : `hotfix/planning-date-geography-r38`. Livraison en PR Draft, sans fusion.

## Propriétaires et causes racines

| Donnée | Propriétaire conservé | Cause corrigée |
| --- | --- | --- |
| Date affichée et semaine active | `StoreRunnerPeriodDaySlider.openDate`, `state.settings.weekDate` et le plan de cette semaine | Le champ date pouvait réétiqueter un ancien plan sans charger son archive ; l'onglet pouvait privilégier le début de la période plutôt que la semaine active. |
| Date de génération | Contrôleur `storeRunnerGenerateThreeWeeks` et terrain `resolveSnailStart` | r37 prenait encore la semaine consultée en l'absence de choix explicite. Le départ automatique sautait aussi la semaine en cours après lundi. |
| Contraintes et refus | Terrain, V263, V246, propriétaires Agenda/verrous | Le moteur modifiait weekDate avant validation et faisait parcourir S1/S2/S3 à cette donnée pendant la lecture Agenda. Un refus pouvait conserver le plan avec une autre date. |
| Découché | V189 pour la décision et le rendu ; slider pour le bandeau et les badges | Le bandeau cherchait une nuit dans toute la période, même pour une semaine historique différente. |
| Départ et acquisition GPS | `profile-controller.js`, `state.profile.base*`, `baseObj`, `havBase` | La génération acceptait le départ enregistré sans demander de nouvelle position. Paris provient donc d'une donnée enregistrée/restaurée, pas d'un défaut actuel. |
| Matrice routière | V248 dans `route-polish.js` | Aucun changement nécessaire : les clés portent les coordonnées. Le préchauffage existant est appelé après l'acquisition du nouveau départ. |

Le contrôleur capture une date locale réelle au clic, demande au propriétaire terrain le départ exploitable, attend `StoreRunnerProfile.preparePlanningOrigin`, puis appelle le moteur existant avec le départ et `today`. Le GPS utilise `maximumAge:0`, une durée bornée, un horodatage frais, des coordonnées valides et une précision acceptable. Sa surveillance courte est toujours arrêtée ; aucun suivi permanent n'est ajouté.

Le seul départ durable reste le profil existant. Une position fraîche remplace ses champs de départ avant les calculs. Un échec peut utiliser une adresse enregistrée ou un nom explicite de domicile/bureau avec coordonnées valides ; le message indique ce repli. Les valeurs GPS, vides ou génériques sans preuve suffisante ne sont jamais réutilisées silencieusement.

La décision V189, l'ordre V251, l'affectation V264/H2 et M1 restent propriétaires. Aucun nouveau moteur, aucune migration de state, aucun nouveau registre de localisation, aucune modification de `/v2/` ou d'Android natif.

## Contrats temporels

- Samedi 03/10/2026, samedi désactivé : visites sur 05–09/10, 12–16/10 et 19–23/10. La période technique couvre les trois semaines jusqu'au dimanche 25/10.
- Consulter 28/09 ou 12/10 sans choisir explicitement un départ ne change pas ce résultat.
- Mercredi 07/10 : première semaine courante, aucun nouveau passage lundi 05 ou mardi 06. Les données passées déjà présentes sont conservées.
- Un choix explicite futur repousse le cycle ; un choix passé ne peut pas le faire reculer. Le choix conserve la normalisation hebdomadaire existante au lundi de sa semaine.
- Un refus conserve le plan, sa semaine et ses archives. La lecture du cache Agenda ne fait plus circuler la semaine active entre les trois semaines du cycle.
- Une semaine affichée au 28/09 ne montre pas le bandeau de nuit 06–07/10. Le badge daté de cette nuit reste pertinent sur l'onglet futur correspondant.
- Accueil et vue mensuelle continuent d'ouvrir une date par le propriétaire r37 `openDate`.

## Preuves de validation

Tests dédiés ajoutés avant correction :

- `planning-real-date-r38.test.cjs` : départ réel, semaine passée/future consultée, choix explicite, milieu de semaine, jours bloqués, protection des données passées, refus atomique et ordre temps → GPS attendu → moteur. Sept scénarios rouges sur les douze initiaux avant correction ; quinze scénarios verts après les compléments.
- `planning-active-week-r38.test.cjs` : contamination exacte du bandeau, semaine canonique, archive chargée avant changement de date et navigation. Rouge sur r37.
- `planning-fresh-location-r38.test.cjs` : position fraîche, Paris restauré, repli explicite, blocage sans base, cache GPS ancien, précision et arrêt du watch. API absente sur r37 : huit tests rouges ; neuf tests verts après ajout du cas domicile sans adresse.
- `planning-date-location-r38-browser.spec.cjs` : Chromium mobile 390 px avec identité Android, vrai moteur et GPS contrôlé. Quatre scénarios rouges sur r37.
- `planning-active-week-r38-browser.spec.cjs` : navigation historique/future, bandeau V189 et parcours Accueil/vue mensuelle.

Les anciens tests du bouton V239 gardent leurs protections de capacité, verrous et semaine manuelle ; leur départ futur est désormais un choix explicite. Les assertions du bandeau hors semaine sont remplacées par le contrat semaine active et badge futur correctement daté. Les tests de r37 autour de l'ancre manuelle, de Gitem Jayat et de Darty Valence sont conservés.

Reliability complète, benchmark et suite mobile sont exécutés sur ce diff. Le résultat final et les liens CI sont consignés dans la PR et le rapport de livraison ; un test lancé ne vaut pas un résultat vert.

## Limites et points de revue

- La localisation dépend du navigateur, des permissions Android et du service GPS. La recette locale émule Android dans Chromium ; elle ne prouve pas une exécution sur téléphone physique.
- Les données historiques ne portent pas de provenance GPS formelle. Le repli est volontairement prudent ; une base ambiguë peut nécessiter un nouvel enregistrement.
- Après acquisition fraîche, le départ du profil est une position GPS. Cette valeur ne deviendra pas une base fiable de repli lors d'un prochain échec : enregistrer explicitement un domicile/bureau permet de retrouver ce repli. Aucun champ de schéma parallèle n'est introduit pour conserver deux départs.
- Une date future choisie correspond à une semaine, normalisée au lundi comme dans r37 ; ce hotfix n'introduit pas une nouvelle fenêtre partielle future.
- Les kilomètres et horaires gardent les estimations et replis routiers existants.

## Git et travaux antérieurs

Le draft #493 a été comparé au main r37 : contrôleur, build et test de départ sont déjà présents dans main. Ses différences restantes annuleraient des correctifs r37 de navigation/date et de cohérence géographique ; aucun correctif utile unique n'a été repris. Le draft n'est ni fusionné ni réutilisé.

Le travail local antérieur du Command Engine est conservé dans un stash nommé « Preserve local Command Engine and audits before r38 hotfix ». Il n'est pas inclus dans ce hotfix et aucune modification n'est poussée à #490.
