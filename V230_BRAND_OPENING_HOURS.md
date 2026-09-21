# V230 — horaires magasins par enseigne

Base GitHub vérifiée avant création de `codex/v230-brand-opening-hours` :
`a3c160944523ea63e13bbb62be156571196d782e` (hotfix V229).

Version visible : **230**. BUILD_REV : **20260921-brand-opening-hours230**.
Cette livraison attend la revue finale de Leia ; **ne pas fusionner**.

## Stockage et résolution

Clé additive facultative : `state.brandOpeningHours`. Le schéma historique de l’état
reste inchangé. La clé n’est créée qu’à l’enregistrement volontaire d’un modèle.
Elle est incluse dans le stockage normal, les sauvegardes complètes, les points de
restauration et le journal transactionnel existants de ChefReliability.

Exemple synthétique :

```json
{
  "brandOpeningHours": {
    "darty": {
      "Lundi": [{"open": "09:30", "close": "19:30"}],
      "Mardi": [],
      "Mercredi": [{"open": "09:00", "close": "12:30"}, {"open": "14:00", "close": "19:00"}],
      "Dimanche": []
    }
  }
}
```

`brandKey(store.enseigne)` normalise casse, accents, espaces et ponctuation.
`store.type` n’intervient jamais. Le modèle est un objet de jours : propriété
absente = inconnu, `[]` = fermé, intervalles = connu. Un modèle vide `{}` est
volontairement inconnu sur tous ses jours ; il ne ressuscite aucun ancien défaut.

`intervalsFor(store, day, state)` reste le point de résolution central :

1. Override spécifique du jour (y compris fermeture), sauf ancienne source
   `brand-default`. Les champs quotidiens historiques `openTime`/`closeTime`
   explicites restent prioritaires dans les conditions V229.
2. Modèle de l’enseigne. Un jour absent du magasin hérite ; un jour absent du
   modèle reste inconnu.
3. En l’absence de modèle, comportement V229 exact : `openingHours`, effacement
   manuel, anciens champs quotidiens, ou inconnu selon leurs règles existantes.

Aucun modèle n’est copié dans `state.stores` ni dans le planning. La résolution
relit l’état courant à chaque appel, y compris après remplacement de l’objet par
une restauration. Les signatures antérieures restent utilisables ; le paramètre
`state` optionnel est propagé par `scheduleRoute`, `fitWithBlocks` et `fitOpening`.
Les copies `{id}` du planning continuent de consulter les magasins canoniques.

## Compatibilité Darty / Boulanger

Il n’existe pas de fichier runtime `darty-default-hours.js` dans cette base.
`boulanger-default-hours.js` couvrait déjà les deux enseignes.

Les règles et constantes de ce module sont maintenant dans
`StoreOpeningHoursV1.legacyBrandDefaults`. Son API publique, ses événements et son
indication historique restent compatibles. Pour un état sans modèle, il conserve
exactement son comportement V229, y compris les anciennes heures matérialisées et
la protection des saisies manuelles. Avec un modèle, il ne remplit ni ne réécrit
aucun magasin héritier. Les anciens objets `brand-default` sont conservés sans
migration destructive mais passent après le modèle dans la résolution.

Les suites historiques Darty/Boulanger conservent toutes leurs assertions.

## Interface et planning

Accès : **Planning → Réglages → Horaires par enseigne**. Le dialogue affiche
enseigne, nombre de magasins et nombre d’exceptions. Sept jours sont éditables
avec `parseDayHours` et `serializeDayHours` existants. Les jours destinataires de
la copie du lundi se cochent individuellement. Un nouveau modèle propose seulement
le dimanche fermé ; les autres jours restent inconnus jusqu’à la saisie.

Le dialogue **Horaires du magasin** indique l’héritage ou la personnalisation,
affiche les horaires actuellement résolus et propose **Revenir aux horaires de
l’enseigne**. Cette action retire uniquement les propriétés horaires spécifiques
de ce magasin, y compris les anciens champs quotidiens, et sauvegarde.

Les formulaires sont bornés à la largeur de l’écran, les champs ont une taille de
texte de 16 px et les boutons une hauteur minimale de 44 px. La touche Entrée
enregistre ; Échap ferme hors enregistrement. Une erreur conserve la saisie.

Aucune fonction d’écrasement collectif des exceptions n’est proposée. Modifier
un modèle change uniquement le modèle. Aucun dimanche travaillé ni aucune visite
n’est ajouté au planning ; `state.settings.target` reste inchangé.

Timeline, attente, fermeture, conflits de rendez-vous, arrivée, fin estimée,
`scheduleRoute`, `routeFits`, alertes et optimisation consomment le moteur
existant. Aucun propriétaire de fonction globale ni moteur de trajet n’est
remplacé. Les wrappers historiques `routeFits` restent des délégations.
`timeline-end-times.js` lit également la durée du résultat de `scheduleRoute` :
le rendu historique pouvait encore afficher 60 minutes pour une visite dont
l’arrivée et le départ imposés donnent réellement 90 minutes. L’assertion
historique de `planning-manual-hours-browser.spec.cjs` protège cette correction
d’affichage ; aucune donnée de rendez-vous n’est modifiée.

## Durabilité et PWA

L’enregistrement passe par `save()` et attend `__chefStorage.flush()` si IndexedDB
est utilisé. Une erreur annule la mutation en mémoire et réenregistre l’état
précédent ; le formulaire reste ouvert. Le mode mémoire temporaire ne prétend
pas avoir sauvegardé. Une restauration ferme les éditeurs de l’ancien état.

ChefReliability valide les modèles avec le propriétaire horaires lorsque celui-ci
est disponible, et accepte les anciens états sans cette clé. L’ordre de chargement
historique est conservé. Le module horaires, déjà présent dans le cache PWA,
rejoint le cache essentiel. Aucun stockage parallèle ni nouvel asset runtime.

## Recette

- `tests/brand-opening-hours-v230.test.cjs` : hiérarchie par jour, normalisation,
  fermeture, deux créneaux, inconnu, 15 héritiers sans duplication, modification,
  override conservé et supprimé, anciennes sauvegardes, reload du module,
  sauvegarde/restauration, dimanche et invariants du planning, compatibilité
  Darty/Boulanger et propriétaire unique.
- `tests/brand-opening-hours-v230-browser.spec.cjs` : parcours à 390 px,
  dimensions et cibles tactiles, quota, édition, retour enseigne, export réel et
  restauration par l’UI, reload, cache PWA/offline, IndexedDB et transaction rejetée.
- `tests/opening-hours-browser.spec.cjs` : toutes les assertions historiques
  conservées ; attente du démarrage complet et clé de reload du build courant
  pour éviter de poser la fixture avant le chargement de l’état.
- Les deux suites V230 sont ajoutées à Reliability.

Les essais navigateur utilisent Chromium avec émulation mobile. Ils ne constituent
pas une validation sur iPhone physique ni une installation Play Store. Les tests
d’update-manager restent la protection de la mise à jour PWA ; aucune mise à jour
de production n’est déclenchée par cette PR.
