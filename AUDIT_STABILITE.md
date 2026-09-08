# Audit de stabilité — Chef Secteur

Date : 2026-09-09

Objectif : inventorier les risques techniques actuels sans modifier le comportement de l’application.

## Conclusion rapide

L’application possède déjà de bonnes protections de données et des tests automatisés, mais elle est devenue fragile à cause d’un grand nombre de scripts correctifs qui se superposent, remplacent des fonctions globales et réappliquent régulièrement des modifications d’interface.

Priorité générale : conserver le fonctionnement actuel, puis réduire progressivement les surcharges de fonctions et les boucles permanentes.

## Points solides à conserver

### 1. Sauvegardes et restauration

`reliability-core.js` valide les données, bloque les clés dangereuses (`__proto__`, `constructor`, `prototype`), conserve jusqu’à huit points de restauration et utilise un journal de transaction pour revenir à l’état précédent si une écriture échoue.

### 2. Tests automatisés

Le workflow `Reliability checks` exécute déjà :

- contrôle syntaxique de tous les scripts ;
- tests des sauvegardes et restaurations ;
- tests Google Agenda ;
- tests du moteur de planning ;
- tests de recherche de magasins par région.

### 3. Passerelle IA

`ai-gateway-config.js` ne contient pas de clé API. La clé Groq est attendue dans `env.GROQ_API_KEY` côté Cloudflare Worker. C’est le bon modèle de sécurité pour GitHub Pages.

### 4. Client OAuth Google

L’identifiant client OAuth Google est public par nature et peut rester côté navigateur. Le token d’accès principal est placé dans `sessionStorage` par `calendar-oauth.js`.

## Risques identifiés

### P0 — Token Google recopié dans localStorage

`auto-planning-fix.js` contient un mécanisme qui copie le token Google depuis `sessionStorage` vers :

- `chef_google_token_persist_v1`
- `chef_google_token_persist_expiry_v1`

Cela rend la session Google persistante dans le stockage local du navigateur. Ce n’est pas cohérent avec le principe plus sûr utilisé ailleurs, où le token reste dans `sessionStorage` et n’est pas inclus dans les sauvegardes.

Action recommandée : supprimer progressivement cette persistance locale tout en conservant la reconnexion utilisateur normale.

### P0 — Surcharge répétée des fonctions globales

Plusieurs scripts remplacent des fonctions déjà existantes :

- `renderAll`
- `renderWeek`
- `renderHeader`
- `syncGoogleCalendar`
- `generateWeek`
- `calendarEventsForDate`
- `baseObj`
- `havBase`
- `saveProfile`
- `ChefReliability.propose`
- fonctions de l’assistant

Chaque wrapper possède généralement un marqueur (`window.__...`) pour éviter une double installation, ce qui limite le danger, mais l’ordre de chargement devient critique.

Action recommandée : créer à terme des hooks/events officiels au lieu de remplacer les fonctions les unes après les autres.

### P1 — Boucles permanentes inutiles

Scripts actuellement concernés :

- `stores-layout-order.js` : `MutationObserver` sur tout le document + `setInterval(..., 1000)` permanent ;
- `auto-planning-fix.js` : `setInterval(..., 1200)` permanent ;
- `connection-ui.js` : `setInterval(healStorage, 1500)` permanent.

Ces mécanismes continuent de travailler même lorsque rien ne change. Sur iPhone/PWA, ils peuvent participer aux gels, à la consommation CPU et à des conflits de rendu.

Action recommandée : les remplacer progressivement par des événements ciblés et des appels après les vrais rendus.

### P1 — MutationObservers trop larges

`planning-ui-fixes.js` observe tout `.wrap` (ou `document.body`) avec `{childList:true, subtree:true}`.

`stores-layout-order.js` observe `document.documentElement` avec `{childList:true, subtree:true}`.

Les observateurs ciblés sur un élément précis, comme celui de `assistant-sheet-drag.js` qui ne surveille que la classe de la fenêtre IA, sont beaucoup plus sûrs.

Action recommandée : réduire le périmètre des observers et les supprimer lorsqu’un hook de rendu existe déjà.

### P1 — Plusieurs couches d’interface d’accueil

`home-refresh-v2.js`, `manager-showcase-home.js`, `manager-home-fixes.js` et `connection-ui.js` interviennent tous sur l’accueil, la navigation ou le statut Google.

Action recommandée : fusionner à terme ces responsabilités dans un seul module d’accueil.

### P1 — Plusieurs couches de planning

Le planning est actuellement complété ou modifié par plusieurs scripts :

- `calendar-oauth.js`
- `calendar-enhancements.js`
- `planning-ui-fixes.js`
- `range-planner-v2.js`
- `working-hours-end.js`
- `daily-capacity.js`
- `planning-pro-plus.js`
- `period-day-slider.js`
- `workdays-enforcer.js`
- `auto-planning-fix.js`
- `planning-autofix.js`

Action recommandée : séparer à terme clairement :

1. moteur de calcul ;
2. contraintes Agenda ;
3. stockage ;
4. rendu de l’interface.

### P2 — Cache PWA très dépendant des numéros de révision

`sw.js` met en cache une longue liste de fichiers portant chacun leur propre paramètre `?rev=...`.

C’est fonctionnel, mais chaque changement important doit être reflété à la fois dans le chargeur et dans le service worker. Une incohérence peut laisser un iPhone sur un mélange d’anciennes et de nouvelles versions.

Action recommandée : centraliser plus tard un numéro de build/version unique.

## Ordre de consolidation recommandé

### Étape 1 — sécurité Google

Supprimer la copie persistante du token OAuth dans `localStorage`, puis adapter la reconnexion sans casser la synchronisation.

### Étape 2 — magasins

Nettoyer `stores-layout-order.js` :

- retirer le `setInterval` permanent ;
- supprimer l’observer global si les hooks `renderStores` suffisent ;
- conserver uniquement les actions `Carnet officiel` et `Gérer mon secteur`.

### Étape 3 — accueil

Fusionner les responsabilités de `home-refresh-v2.js`, `manager-showcase-home.js`, `manager-home-fixes.js` et la partie accueil de `connection-ui.js`.

### Étape 4 — planning

Créer un module central de planning et convertir les scripts de correctifs en fonctions explicites appelées par ce module.

### Étape 5 — cache PWA

Remplacer les nombreuses révisions indépendantes par une version de build globale afin d’éviter les mélanges de cache.

## Règle pour les prochaines modifications

Pour chaque étape :

1. une seule catégorie de changement ;
2. aucun changement visuel non demandé ;
3. tests existants avant et après ;
4. un commit séparé ;
5. retour arrière immédiat si une fonction existante régresse.

## État actuel

Aucun comportement de l’application n’a été modifié par cet audit. Ce fichier documente uniquement les risques et l’ordre de nettoyage recommandé.
