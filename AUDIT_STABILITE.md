# Audit de stabilité — Store Runner

Date : 2026-09-12

Objectif : décrire l’état technique actuel de Store Runner, distinguer les consolidations déjà acquises des risques encore actifs et fixer l’ordre de stabilisation sans lancer de réécriture massive.

## Conclusion rapide

Store Runner est désormais une PWA fonctionnelle et fortement consolidée : sauvegarde/restauration protégées, Google Agenda en lecture seule, génération du planning, domaine métier Visit + Action + 6P, cache PWA versionné et CI Reliability étendue.

Le produit reste toutefois en phase de stabilisation avancée. Les risques principaux ne viennent plus de boucles globales permanentes, mais de trois zones :

1. l’expérience mobile réelle à 390 px ;
2. le noyau historique `src/chef-secteur.html` et le bootloader qui injecte encore des correctifs autour de ce noyau ;
3. quelques responsabilités encore dupliquées ou enveloppées par des wrappers transitoires.

La règle reste : consolidation progressive, réversible et testée. Pas de migration de framework ni de grand refactor transversal tant que les parcours terrain ne sont pas verrouillés.

## Points solides à conserver

### 1. Sauvegardes et restauration

`reliability-core.js` valide les données, refuse les clés dangereuses (`__proto__`, `constructor`, `prototype`), conserve plusieurs points de restauration et utilise un journal de transaction pour restaurer l’état précédent si une écriture échoue.

Les sauvegardes n’exportent pas les jetons OAuth Google.

### 2. Stockage PWA

Le bootloader utilise une stratégie de secours :

`localStorage → IndexedDB → mémoire`

et demande la persistance du stockage lorsque le navigateur la supporte.

### 3. BUILD_REV et cache PWA

`index.html` et `sw.js` partagent désormais une seule valeur `BUILD_REV`. `tests/build-revision.test.cjs` empêche leur divergence et vérifie le rechargement borné après prise de contrôle d’un nouveau service worker.

Le service worker supprime les anciens caches Store Runner lors de l’activation d’une nouvelle révision.

L’ancien risque « plusieurs révisions dispersées dans le chargeur » est donc considéré comme corrigé.

### 4. Tests automatisés

Le workflow `.github/workflows/reliability-checks.yml` contrôle notamment :

- syntaxe JavaScript ;
- sauvegardes et restauration ;
- Visit/Action/6P ;
- Google Agenda et OAuth production ;
- moteur de planning ;
- compatibilité mobile structurelle ;
- BUILD_REV ;
- magasins par région ;
- propriétaires d’architecture ;
- assistant ;
- horaires, timeline et capacité quotidienne ;
- parseurs du catalogue officiel via `tests/official_catalog_test.py`.

Le déploiement GitHub Pages dépend de Reliability.

### 5. OAuth Google

Le jeton Google principal reste en `sessionStorage`. Les anciennes clés persistantes sont purgées. La génération du planning ne déclenche plus d’OAuth implicite et peut utiliser le dernier cache Agenda disponible.

La validation Google OAuth External a été soumise le 12 septembre 2026. Pendant son examen, ne modifier le scope, le branding ou la configuration OAuth qu’en réponse à une demande précise de Google.

### 6. Architecture déjà nettoyée

Les propriétaires principaux sont documentés dans `ARCHITECTURE_CLEANUP_STATUS.md` et protégés par des tests :

- profil/GPS : `profile-controller.js` ;
- navigation : `navigation-controller.js` ;
- génération : `planning-generation-controller.js` ;
- synchronisation Agenda : `calendar-oauth.js` ;
- affichage planning : `planning-ui-fixes.js` ;
- Visit + Action + 6P : modules Store Runner dédiés.

Les anciennes boucles `setInterval` de surveillance et plusieurs observers globaux ont été supprimés ou bornés.

## CI/CD consolidé le 12/09

Le lot #87 / PR #88 a corrigé deux faiblesses du pipeline :

- la mise à jour automatique des annuaires officiels n’a plus vocation à pousser directement ses changements sur `main` ; elle crée une branche/PR et relance Reliability explicitement ;
- l’ancien workflow natif ciblant `v3-premium` est désormais manuel uniquement et clairement marqué legacy.

Le test Python du catalogue officiel est également exécuté par Reliability sur les PR normales.

## Risques encore actifs

### P0 — Validation mobile réelle

Le principal risque produit est l’UX mobile du planning. L’issue #86 couvre notamment :

- swipe entre les jours depuis la liste ;
- nav basse et safe-area ;
- cartes trop hautes ;
- bande des jours tronquée à 390 px.

L’issue #82 reste la validation globale Android/iOS de la PWA.

Le test `mobile-compatibility.test.cjs` est utile mais structurel : il inspecte le code/CSS et ne prouve pas le comportement dans un navigateur réel. L’issue #89 prévoit un test E2E mobile 390 px après stabilisation de #86.

### P0 — Noyau historique et bootloader

`src/chef-secteur.html` reste un gros noyau historique contenant encore beaucoup de logique globale.

`index.html` charge ce noyau, applique plusieurs transformations/injections puis ajoute les modules Store Runner. Cette stratégie fonctionne et est testée, mais elle reste sensible aux changements de structure du HTML historique.

Action recommandée : retirer les patchs/injections progressivement, un domaine à la fois, uniquement lorsqu’un propriétaire stable existe déjà. Pas de réécriture massive.

### P1 — Validation du point de départ dupliquée

`profile-controller.js` et `planning-generation-controller.js` contiennent encore une logique équivalente de validation des coordonnées du départ.

L’issue #80 prévoit de faire de `profile-controller.js` l’unique propriétaire et d’exposer une API minimale consommée par le planning.

### P1 — Conformité Nominatim

Le géocodage du départ utilise Nominatim/OpenStreetMap pour la recherche texte et le reverse geocoding GPS.

L’issue #83 doit encore :

- limiter explicitement la cadence partagée ;
- afficher l’attribution adaptée ;
- compléter la politique de confidentialité pour l’adresse/les coordonnées envoyées à Nominatim ;
- ajouter les garde-fous/tests associés.

Ce chantier doit rester séparé de Google Agenda.

### P1 — Wrappers résiduels

Des wrappers transitoires restent présents, notamment autour de l’assistant et de certaines fonctions historiques Agenda/planning. Les contrats d’extension publics ont déjà réduit ce risque.

Action recommandée : supprimer les derniers wrappers seulement après ajout d’un point d’extension dans le propriétaire historique correspondant et avec Reliability vert avant/après.

### P2 — Accueil et présentation

Plusieurs couches historiques participent encore au rendu d’accueil et à certaines décorations. Tant que le comportement terrain reste stable, ce nettoyage est moins prioritaire que mobile, conformité et E2E.

## Ordre de consolidation recommandé

1. Terminer #86 puis valider réellement le planning sur iPhone/Android.
2. Fermer #82 uniquement après vérification installation PWA, stockage, offline, Agenda, génération et mise à jour du service worker.
3. Implémenter #89 : vrai smoke test navigateur mobile 390 px dans Reliability.
4. Traiter #83 : conformité Nominatim.
5. Traiter #80 : mutualisation de la validation du point de départ.
6. Après décision Google OAuth, consolider progressivement le propriétaire OAuth sans changement de scope ni de comportement utilisateur.
7. Réduire ensuite, par petits lots, les patchs du bootloader et les responsabilités encore présentes dans `src/chef-secteur.html`.
8. Reprendre seulement ensuite les nouveaux domaines métier importants.

## Conditions avant de considérer la V1 stable

Avant d’archiver l’ancienne application de secours, vérifier au minimum :

- parcours mobile réel Android/iOS validé ;
- Reliability et test navigateur E2E verts ;
- sauvegarde/export/restauration testés sur données réelles ;
- Nominatim mis en conformité ;
- aucune perte de données ni bug bloquant observé pendant plusieurs semaines d’usage terrain ;
- rollback connu et ancienne application encore disponible pendant cette période.

## Règles pour les prochaines modifications

Pour chaque lot :

1. repartir du dernier `main` ;
2. une seule catégorie de changement ;
3. issue → branche → PR Draft → tests → Ready → merge ;
4. aucun push fonctionnel direct sur `main` ;
5. respecter les propriétaires définis dans `AGENTS.md` ;
6. tester à 390 px quand l’UI change ;
7. vérifier PWA/hors ligne quand le runtime, le stockage ou le cache changent ;
8. retour arrière immédiat si un parcours existant régresse.
