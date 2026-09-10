# PLAN MÉTIER — STORE RUNNER

Date : 10 septembre 2026  
Dépôt : REDNEWT69/Chef-Secteur  
Base vérifiée : `main`, commit `44deaca4f2fa101e0396463a76f54dae91618a85`  
Statut : plan de réalisation terminé ; développement fonctionnel suspendu à la demande de l’utilisateur.

## 1. Point de reprise et travail conservé

Ce document prolonge l’audit déjà réalisé. Il ne relance pas un audit général et ne modifie pas le fonctionnement de l’application.

### État vérifié avant rédaction

- La version distante a évolué depuis la base du 9 septembre `ea8e7c6a194a91a2d5e585c2df8f0e0461f03d7e`.
- La consolidation a séparé notamment profil/GPS, navigation, génération du planning et synchronisation Agenda. Des wrappers ont été retirés et des gardes Reliability ajoutées.
- Les exécutions [Reliability checks](https://github.com/REDNEWT69/Chef-Secteur/actions/runs/34445940478) et [Deploy Store Runner](https://github.com/REDNEWT69/Chef-Secteur/actions/runs/34445940685) de cette base sont terminées avec succès.
- Aucun `PLAN_METIER_STORE_RUNNER.md` n’était présent dans l’arbre de `main` ni dans les fichiers locaux inspectés. Aucune pull request ouverte n’a été trouvée au contrôle initial.
- La copie locale de travail provient d’une archive GitHub ; elle ne contient pas de répertoire `.git`. L’état distant a donc été vérifié par les références et comparaisons GitHub, et les différences locales par comparaison de fichiers avec l’archive initiale. Un `git status` local n’est pas disponible sur cette copie.

### Travaux antérieurs locaux

L’audit `STORE_RUNNER_V2_AUDIT.md` et un prototype V2 existent localement, sans publication dans `main`. Le prototype comprend modèle, interface, styles et tests métier, ainsi que des adaptations locales du chargeur, de la source HTML, des sauvegardes et du service worker.

Les tests locaux du prototype et une vérification navigateur ont couvert préparation, reprise après rechargement, conversion en action, clôture, rendez-vous local, consultation du cache PWA serveur arrêté et affichage de largeur 390 px. Ces résultats concernent la base antérieure et ne constituent ni une validation sur iPhone physique, ni une validation du prototype sur l’architecture actuelle.

Ces fichiers sont conservés sans modification pendant cette reprise. Ils constituent du travail réutilisable à examiner lors d’une future reprise fonctionnelle, pas un ensemble à appliquer directement à `main`.

### Livraison de cette étape

Un seul fichier de documentation est ajouté au dépôt proposé : `PLAN_METIER_STORE_RUNNER.md`. Aucun fichier applicatif, test, workflow, manifeste, service worker, référentiel ou donnée n’est modifié ou supprimé par cette étape.

## 2. Objectif produit et périmètre métier

STORE RUNNER est une PWA terrain pour un Chef de Secteur Samsung CE travaillant pour Globe Groupe.

Le parcours cible est :

**Magasin → Préparation → Visite → 360° → 6P → Entretien manager → Plan d’action → Suivi → Historique**

Le planning et les tournées restent intégrés à ce parcours. Ils demeurent utilisables indépendamment d’une visite détaillée.

Les seules sources métier autorisées sont les quatre modules opérationnels décrits dans la demande :

| Module | Périmètre |
| --- | --- |
| Mission Chef de Secteur | Préparation, arrivée/360°, six P, entretien manager, fin de visite |
| Enseignes GSS / GSA / Meubliers | FNAC, DARTY, BOULANGER, AUCHAN, CARREFOUR, LECLERC, CONFORAMA, BUT |
| Cuisinistes | SCHMIDT, CUISINELLA |
| Buying Group | PRO&CIE, GITEM |

Les intitulés et champs explicitement transmis peuvent être planifiés dès maintenant. Les supports complets ne sont pas joints à cette reprise : aucune procédure d’enseigne, règle commerciale, règle SAV ou étape CRM spécifique ne doit être inventée.

L’histoire de Samsung et l’organigramme Division CE sont hors périmètre. L’organigramme pourra faire l’objet d’un référentiel contacts ultérieur, distinct de cette V2.

## 3. Contraintes et architecture à respecter

### Invariants

- Faire évoluer l’existant ; conserver la stack HTML/CSS/JavaScript.
- Préserver PWA, GitHub Pages, service worker, URLs relatives et fonctionnement hors ligne.
- Préserver Google Calendar en lecture seule, sans création d’événement distant.
- Préserver les magasins, leurs identifiants, les référentiels et le carnet officiel.
- Préserver profil, paramètres techniques, stockage robuste, sauvegardes et restauration.
- Préserver les fonctions existantes, même absentes des supports onboarding.
- Ne pas renommer de clés internes pour le branding.
- Ne lancer ni migration React/Vite, ni refonte visuelle, ni suppression.
- Conserver les tests Reliability et les gardes de propriété des modules.

### Points d’intégration actuels

Le checkpoint `ARCHITECTURE_CLEANUP_STATUS.md` et le code récent précisent les responsabilités plus fidèlement que les anciennes sections « dette restante » de `ARCHITECTURE_STORE_RUNNER.md`.

| Domaine | Propriétaire existant à respecter | Conséquence pour la V2 |
| --- | --- | --- |
| Profil, GPS, départ | `profile-controller.js` | Ne pas réintroduire cette logique dans la visite ou le planning |
| Navigation | `navigation-controller.js` et points d’entrée existants | Utiliser les événements et fonctions publics |
| Génération planning | `planning-generation-controller.js` | Ne pas remplacer `generateWeek` depuis un module métier |
| Google Agenda | `calendar-oauth.js` | Consommer les événements existants, conserver les permissions de lecture |
| Enrichissement Agenda / horaires | `calendar-enhancements.js` | Ne pas rétablir les wrappers supprimés |
| Présentation planning | `planning-ui-fixes.js` | Insérer l’accès visite au point d’extension approprié |
| Magasins / catalogue | `stores-layout-order.js` et modules catalogue | Réutiliser les identifiants, sans nouvelle base magasins |
| Fiabilité | `reliability-core.js`, `reliability-ui.js` | Intégrer validation, export, restauration et erreurs |
| Noyau historique | `src/chef-secteur.html` | Interventions limitées et ciblées |
| Chargement / cache | `index.html`, `sw.js` | Suivre le chargement centralisé actuel et la révision commune |

Les nouveaux modules devront avoir un propriétaire unique. Privilégier événements explicites et fonctions publiques ; éviter les surcharges de fonctions globales et les boucles de surveillance permanentes.

## 4. Modèle de données V2 proposé

### Organisation

Proposition issue de l’audit : ajouter un domaine métier versionné, par exemple `state.businessV2`, dans l’état déjà protégé par ChefReliability. Conserver le schéma technique actuel et les clés historiques tant que leur compatibilité est démontrée.

Cette organisation est une cible de conception. Elle n’est pas activée par le présent document.

| Entité | Champs et relations minimaux |
| --- | --- |
| **Store** | Identifiant historique, enseigne, ville, adresse, coordonnées et propriétés existantes. Possède plusieurs contacts, visites, actions, rendez-vous et opportunités. Pas de duplication de la base active. |
| **Contact** | `id`, `storeId`, nom, fonction, rôle, pouvoir décisionnel, téléphone facultatif, mail facultatif, notes, dates de création/modification. |
| **Visit** | `id`, `storeId`, statut, dates de création/modification/clôture, étape courante, préparation, relevé 360°, audit des six P, entretien manager, conclusion, prochain rendez-vous éventuel. |
| **Action** | `id`, `storeId`, `visitId` source, catégorie, description, responsable, échéance, statut, date de réalisation, référence de l’élément source. |
| **Appointment** | Identifiant, magasin, contact facultatif, date locale, heure locale, objet, origine, visite source facultative ; conserver la durée et les autres champs existants utilisés par le planning. |
| **Opportunity** | Identifiant, magasin, visite source, catégorie, description, statut de suivi, référence de l’élément source et dates de création/modification. |
| **KitchenCRM** | Contrat réservé : identifiant, magasin cuisiniste, contact/visite éventuels, description et notes. Champs et étapes spécialisés à préciser avec les supports Cuisinistes. |
| **ServiceCase** | Contrat réservé : identifiant, magasin, contact/visite éventuels, description et notes. Processus, catégories, statuts, engagements et escalades SAV à préciser avec une source autorisée. |
| **ReferenceData** | Version, provenance, modules métier, familles d’enseignes, enseignes, six P et catégories d’opportunités. Les catalogues magasins existants restent conservés. |

`Appointment` doit prolonger `state.appointments`, déjà consommé par le planning, plutôt que créer deux registres de rendez-vous concurrents. Les événements Google restent dans leur structure existante, avec leur origine distante clairement distinguée.

Les catégories d’opportunités fournies sont : massification, extra-visibility, gain PDL, formation, théâtralisation, planogramme et contrat d’exposition.

### Règles de cohérence proposées

1. Un identifiant reste stable et unique dans sa collection.
2. Une visite appartient à un seul magasin. Ses contacts, actions et opportunités doivent correspondre à ce magasin.
3. Un brouillon actif par magasin permet au bouton de reprendre la visite en cours. Plusieurs magasins peuvent avoir chacun un brouillon.
4. Les visites ont au minimum les états « brouillon/en cours » et « terminée ». Ne pas assimiler une visite planifiée à une visite réalisée.
5. Les statuts d’action proposés sont « à faire », « en cours », « réalisée », « annulée ». La date de réalisation est renseignée au passage à « réalisée » et retirée en cas de réouverture.
6. Les statuts d’opportunité proposés sont « ouverte », « en cours », « concrétisée », « non retenue ». Ce sont des choix de conception, pas des prescriptions commerciales attribuées aux supports.
7. Une conversion répétée du même constat doit retrouver son action/opportunité ; deux constats distincts doivent pouvoir produire deux éléments distincts.
8. Une action liée à un 6P conserve une référence source stable. Les changements de responsable et d’échéance restent cohérents entre audit et suivi.
9. Dates métier locales au format date, heures locales séparées ; horodatages techniques explicites. Tester les changements de jour et d’heure.
10. Les observations libres ne produisent pas automatiquement des faits chiffrés, des contacts ou des opportunités supposés.

### Historique et compatibilité

`state.visits[storeId]` contient aujourd’hui des dates utilisées par les priorités et compteurs : il doit être conservé. La clôture V2 devra y ajouter une représentation compatible, sans compter deux fois une clôture répétée.

Les visites détaillées constituent l’historique métier. Prévoir un instantané minimal du magasin pour conserver leur lisibilité si le magasin sort ultérieurement du secteur. Le comportement des actions ouvertes, rendez-vous et contacts associés devra être défini et testé avant de faire évoluer le retrait d’un magasin.

Ne pas transformer les anciennes notes ou dates seules en faux comptes rendus détaillés.

## 5. Parcours de visite cible

### Entrées et reprise

Le bouton principal **« Démarrer une visite »** est accessible depuis la fiche magasin, le planning et la tournée du jour. Il reprend le brouillon du magasin lorsqu’il existe.

Un accès aux visites en cours et au suivi permet de revenir au travail après fermeture de la PWA. Sauvegarder les champs et l’étape au fil de la saisie. Un échec doit être visible, conserver la saisie récupérable et permettre une nouvelle tentative.

### Étape 1 — Préparation

Afficher enseigne, magasin, interlocuteur prévu, actualité, dernières visites, actions non terminées, prochain rendez-vous, objectifs et notes.

Champs à prévoir :

- Objectif principal et objectifs secondaires.
- Interlocuteur prévu, actualité magasin et notes de préparation.
- Travail réalisé précédemment, points de satisfaction et points de friction.
- Sell-out, stocks, réapprovisionnement automatique, assortiment.
- Statut magasin, part de marché et opérations en cours.

Lorsque les supports ne fixent pas le format d’un indicateur, commencer par un relevé explicite et contextualisé. Ne pas afficher de valeur de performance calculée sans données et règles définies.

### Étape 2 — Arrivée / 360°

Checklist :

- Procédure d’entrée respectée ; personnel salué ; autorisation avant relevé.
- Part de linéaire / PDL ; PLV ; LDU ; merchandising ; facing.
- Ruptures ; ODR ; Perfect Merch ; concurrence ; incentive / guelte.
- Parcours client réalisé ; échange informel vendeur.

Compléter par constats positifs, anomalies et opportunités identifiées.

Une anomalie peut devenir une Action ; une opportunité identifiée peut devenir une Opportunity. Conserver le constat d’origine et son lien. La conversion ne clôture pas la visite.

### Étape 3 — Les six P

Chaque élément ci-dessous comporte un statut métier **OK / À corriger / Opportunité**, un commentaire, une action, un responsable et une échéance. Un élément non encore évalué reste vide/non évalué : cet état de saisie n’est ni un quatrième résultat métier ni un septième P.

| Section | Éléments à relever |
| --- | --- |
| **PROMOTION** | Visibilité PLV ; dates validées ; mécanisme promotionnel expliqué ; opération locale possible ; opérations concurrentes ; challenges concurrents ; perception vendeurs des promotions Samsung |
| **PRIX** | Relevé prix ; veille concurrentielle ; ajustement nécessaire ; présence étiquette prix |
| **PRODUIT** | LDU / factice ; stocks ; disponibilité ; gamme ; assortiment ; nouveautés ; concurrence ; ventes |
| **PLACE** | Part de linéaire ; emplacement ; respect des accords ; opportunité de gain PDL ; relevé concurrence |
| **PROPRETÉ** | Nettoyage LDU ; expérience client ; vérification des démonstrations ; mise à jour LDU ; mise à jour PLV ; anomalies |
| **PÉDAGOGIE** | Interlocuteurs identifiés ; problématiques identifiées ; objectifs de formation ; connaissances vendeurs ; préférence de marque ; potentiel de recommandation Samsung |

Le statut « Opportunité » ne doit pas créer à lui seul une opportunité commerciale sans description. Prévoir une action explicite de conversion. Les actions effectivement définies doivent être retrouvables dans le plan d’action, avec une prévention des doublons.

### Étape 4 — Entretien manager

Relier le contact rencontré au magasin et à la visite. Prévoir un espace d’échanges, d’accords/engagements et de notes. Faire ressortir les constats du 360° et des 6P ainsi que les actions discutées.

La demande nomme cette étape sans fournir une trame complète : ne pas inventer de script commercial ou de règles d’approbation obligatoires.

### Étape 5 — Fin de visite

Prévoir une conclusion, la vérification des actions et responsables, puis un prochain rendez-vous éventuel.

Proposition de clôture : demander une conclusion ; si un rendez-vous est demandé, vérifier date, heure, objet et cohérence du contact. Ne pas imposer une note à chaque 6P sans exigence métier supplémentaire.

La clôture doit enregistrer de manière cohérente le compte rendu, les actions, les opportunités, l’historique compatible et le rendez-vous local. Une relance après erreur ou un double clic ne doit créer aucun doublon.

### Étape 6 — Plan d’action, suivi et historique

Afficher les actions ouvertes du magasin, leurs responsables, échéances, statuts et dates de réalisation. Distinguer une échéance dépassée d’une action terminée.

Consulter les opportunités et leur suivi. Retrouver les comptes rendus par magasin et date. Alimenter la préparation suivante avec les visites antérieures et les actions restantes.

Un compte rendu terminé doit rester consultable ; le suivi de ses actions peut évoluer ensuite. Les modalités de correction d’un compte rendu et de suppression d’une ancienne visite devront préserver la traçabilité et les fonctions historiques existantes.

## 6. Sauvegarde, migration et hors ligne

### Migration additive

L’application est en préproduction, sans données métier importantes déclarées. Cela autorise une conception cohérente, mais ne dispense pas de conserver magasins, carnet officiel, paramètres, planning et protections.

Prévoir une migration idempotente vers le domaine V2 : ne rien ajouter deux fois au second lancement. L’absence de domaine V2 dans une ancienne sauvegarde doit être acceptée ; une version métier inconnue ou incohérente doit être signalée sans écrasement.

Aucune suppression de structure ou clé n’est prévue dans cette étape. Un éventuel nettoyage futur devra disposer d’une analyse de références techniques et d’un lot distinct.

### Persistance et restauration

- Passer par le stockage et les garde-fous existants.
- Valider l’ensemble candidat avant de remplacer l’état courant.
- Inclure le domaine métier dans les exports complets, points de restauration et récupération transactionnelle.
- Conserver carnet officiel, archives, période de planning et paramètres lors des cycles export/restauration.
- Exclure les jetons OAuth des sauvegardes métier.
- Tester quota dépassé, données corrompues, import malformé et écriture interrompue.
- Signaler clairement un stockage en mémoire seulement : il ne garantit pas la reprise après fermeture.
- Vérifier l’achèvement réel des transactions IndexedDB avant d’annoncer un enregistrement durable.
- Définir la détection d’une édition concurrente dans deux onglets afin d’éviter un écrasement silencieux.
- Une restauration remplaçant l’objet global doit invalider les vues/brouillons en mémoire qui se rapportent à l’ancien état.

### PWA et iPhone

Au moment d’une future intégration, les nouveaux assets nécessaires devront appartenir au cache applicatif cohérent avec la révision de build. Aucun changement de cache n’est nécessaire pour ce document seul.

Vérifier une première installation en ligne, une réouverture hors ligne, une mise à jour depuis l’ancienne version, et la reprise d’un brouillon après fermeture. Les fonctionnalités métier essentielles doivent fonctionner sans API externe.

Sur iPhone : vérifier Safari et l’application ajoutée à l’écran d’accueil, clavier, zones sûres, défilement, taille des champs, fermeture/reprise et stockage. Une simulation de largeur mobile ne remplace pas ces essais.

## 7. Lots futurs, dépendances et critères de sortie

**Seul le lot 0 est exécuté par la présente reprise. Les lots fonctionnels restent suspendus jusqu’à une nouvelle instruction.**

| Lot | Contenu | Critère de sortie |
| --- | --- | --- |
| **0 — Plan métier** | Reprendre l’audit, vérifier Git, rapprocher les nouveaux propriétaires, terminer ce document | Diff limité au plan, travail existant conservé |
| **1 — Contrats et fiabilité** | Définir modèle V2 et migration additive ; intégrer validation et sauvegardes, sans nouvel écran métier | Anciennes sauvegardes compatibles ; aller-retour V2 complet ; erreurs sans perte |
| **2 — Préparation et reprise** | Entrées depuis fiche/planning/tournée ; création/reprise ; préparation et contacts | Brouillon unique par magasin, fermeture/reprise fiable, paramètres préservés |
| **3 — 360°** | Checklist, constats et conversions explicites | Plusieurs constats possibles ; origine conservée ; aucune conversion dupliquée |
| **4 — Six P** | Six sections exactes et champs associés | Couverture complète ; actions synchronisées ; distinction statut/constat/action |
| **5 — Entretien et clôture** | Compte rendu manager, conclusion, rendez-vous local et historique | Clôture cohérente et idempotente ; aucun événement écrit dans Google |
| **6 — Suivi terrain** | Actions, opportunités, historique et préparation suivante | Échéances/statuts exploitables et relations conservées |
| **7 — Spécificités documentées** | Enrichissements enseignes, KitchenCRM et ServiceCase uniquement sur supports complets | Traçabilité des règles métier ; aucun processus supposé |

Chaque lot repart du commit courant et respecte les propriétaires consolidés. Le prototype local sera comparé à cette base pour récupérer les éléments utiles ; ne pas réappliquer ses anciens fichiers `index.html`, `sw.js`, workflows ou wrappers en bloc.

Un lot doit rester réversible et faire l’objet d’une validation adaptée avant de passer au suivant. Revenir sur le code ne doit pas impliquer l’effacement des données déjà saisies.

## 8. Recette à prévoir lors du développement

Les contrôles suivants constituent des critères futurs, pas des tests prétendument exécutés par ce document.

| Axe | Scénarios de validation |
| --- | --- |
| Non-régression | Suites syntax, backups, calendar, planning, region-stores, architecture, navigation-architecture, calendar-ownership actuellement exécutées par Reliability |
| Modèle | Identifiants uniques, magasin/contact cohérents, visite source valide, versions inconnues refusées |
| Reprise | Saisie partielle, changement d’étape, fermeture, réouverture et reprise du même brouillon |
| Actions / opportunités | Constats distincts, conversion répétée, modification du responsable, échéance, réalisation/réouverture |
| Clôture | Double clic, relance après interruption, historique sans doublon, rendez-vous sans doublon |
| Stockage | localStorage, IndexedDB, mémoire temporaire, quota, interruption, édition concurrente |
| Sauvegardes | Export V2, restauration navigateur vide, sauvegarde ancienne, catalogue/archives conservés, absence de jeton |
| Magasins | Base et identifiants conservés, retrait/réintégration sans historique illisible ni lien orphelin |
| Planning / Agenda | Contraintes et rendez-vous existants conservés ; aucune nouvelle permission Google |
| PWA / mobile | Cache complet, mise à jour cohérente, hors ligne, Safari iPhone et mode installé |

## 9. Informations encore nécessaires et limites

Le plan commun de visite est suffisamment détaillé pour organiser les lots 1 à 6. Avant le lot 7, il faudra disposer des supports opérationnels complets et valider les champs/processus spécifiques cuisinistes, buying groups et SAV.

À préciser dans les lots concernés : corrections d’une visite terminée, traitement de plusieurs visites du même magasin le même jour, conservation du suivi après retrait d’un magasin, politique de conflits entre onglets. Les choix devront rester compatibles avec les usages historiques ; aucun de ces comportements n’est changé ici.

Le plan ne vaut pas validation du prototype local, autorisation de déploiement, ni lancement d’une refonte.

## 10. Références et traçabilité

- Demande utilisateur jointe du 9 septembre : exigences métier et contraintes de conservation.
- Instruction du 10 septembre : terminer le plan uniquement, préserver le travail et ne pas modifier le fonctionnel.
- [Base GitHub vérifiée](https://github.com/REDNEWT69/Chef-Secteur/commit/44deaca4f2fa101e0396463a76f54dae91618a85).
- [Checkpoint architecture](https://github.com/REDNEWT69/Chef-Secteur/blob/44deaca4f2fa101e0396463a76f54dae91618a85/ARCHITECTURE_CLEANUP_STATUS.md).
- [Documentation architecture](https://github.com/REDNEWT69/Chef-Secteur/blob/44deaca4f2fa101e0396463a76f54dae91618a85/ARCHITECTURE_STORE_RUNNER.md), à lire avec le checkpoint et les évolutions ultérieures.
- [Workflow Reliability de référence](https://github.com/REDNEWT69/Chef-Secteur/blob/44deaca4f2fa101e0396463a76f54dae91618a85/.github/workflows/reliability-checks.yml).
- Audit local antérieur `STORE_RUNNER_V2_AUDIT.md`, conservé comme trace de la base initiale.
