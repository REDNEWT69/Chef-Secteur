# Store Runner — architecture cleanup status

Checkpoint architecture après consolidation du 10/09/2026.

## Propriétaires actuels

- `profile-controller.js` : profil, point de départ, GPS, `baseObj`/`havBase`, sauvegarde profil.
- `navigation-controller.js` : retour au planning après sauvegarde du départ.
- `calendar-oauth.js` : OAuth et synchronisation Google Agenda.
- `planning-generation-controller.js` : propriétaire de `generateWeek` et orchestration Agenda avant/après génération.
- `planning-ui-fixes.js` : hiérarchie et compatibilité d’affichage du planning.
- `store-runner-branding.js` : branding Store Runner uniquement.
- `calendar-enhancements.js` : enrichissements Agenda et horaires magasins sans réécrire les fonctions métier principales.

## Règles de stabilité

Les modules ne doivent plus remplacer une fonction globale métier qui appartient à un autre module. Les enrichissements d’interface passent en priorité par événements, observers ou fonctions publiques dédiées.

Les tests `tests/architecture.test.cjs` verrouillent notamment les propriétaires de `generateWeek`, `syncGoogleCalendar`, du profil/départ et plusieurs fonctions de rendu.

## Dette restante

Le gros `src/chef-secteur.html` reste le noyau historique et contient encore beaucoup de logique métier globale. La prochaine étape de consolidation consiste à extraire progressivement les responsabilités sans réécriture générale ni migration de framework.
