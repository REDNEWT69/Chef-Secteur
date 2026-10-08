# Compte rendu automatique — chantier de fiabilisation

PR Draft, **ne pas fusionner sans validation explicite de Redouane**.

## Base vérifiée avant modification

- `main` : `c243b8b5b910927e032a0e05d448a736a6ee12ec`, fusion de #542.
- Production contrôlée en lecture seule le 08/10/2026 : index, service worker et
  `version.json` servent `20261007-r77-ai-report-branding-276`.
- CI de cette base : Reliability `37683294769`, Planning benchmark `37683294634`
  et Deploy Store Runner `37683295509`, tous `success`.
- La clôture attendait déjà la queue VisitStore et `IndexedDB.flush()` ; V277
  construisait sa mémoire locale dans cette transaction. V277.1 lançait ensuite
  un appel IA depuis le navigateur, sans persistance serveur.
- Les rapports professionnels et leurs éditions étaient dans `aiDrafts`, en RAM.
  Le correcteur proposait une correction puis remplaçait effectivement les notes
  au clic sur Appliquer. Les Cuisinistes recevaient encore du texte libre.
- Le dépôt n'avait ni configuration Wrangler, ni binding de stockage serveur,
  ni workflow de déploiement du Worker. Pages ne déploie pas le Worker.

## Architecture et responsabilités

`VisitModel` porte les sources, l'intention durable du job, les gardes et le
rapport professionnel. `VisitStore` reste l'unique queue d'écriture de ce parcours.
`Visits` publie les opérations bornées nécessaires. Le module V277.1 devient
l'outbox et le réconciliateur POST/statut ; il n'appelle plus le fournisseur IA.
`StoreRunnerReportRenderer` partage le prompt versionné et la validation entre
Worker et navigateur, puis contrôle localement toute la présentation.

Le choix serveur est un Durable Object SQLite `REPORT_JOBS` par version de visite.
Il réunit état, stockage transactionnel, verrou et alarme durable dans un seul
service. `waitUntil` seul est limité à 30 secondes après la réponse/déconnexion ;
KV ne fournit pas le claim strict nécessaire ; Queue + D1 ajouterait deux services
et une coordination supplémentaires pour ce besoin.

Références Cloudflare : [alarmes](https://developers.cloudflare.com/durable-objects/api/alarms/),
[stockage SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[limite waitUntil](https://developers.cloudflare.com/workers/runtime-apis/context/).

## Terminer la visite

1. Poser le verrou de clôture dès le tap ; les appels concurrents sont coalescés.
2. Attendre la persistance réelle des derniers inputs, déjà sérialisés.
3. Clôturer, inscrire l'historique, construire `runnerMemory` V277 et créer
   l'intention `reportJob.pending`, dans une sauvegarde durable.
4. Afficher la visite clôturée immédiatement après cette sauvegarde, sans attendre
   une réponse IA. L'utilisateur peut quitter l'application.
5. Charger à la demande renderer et coordinateur, calculer SHA-256 et persister
   signature/capacité avant tout POST.
6. POST `/api/ai/report-jobs` : accepter seulement après stockage du job et de son
   alarme dans la même transaction ; retourner rapidement `jobId` et `pending`.
7. L'alarme écrit `processing` avant un unique appel au fournisseur configuré,
   valide son JSON et conserve `done` ou `failed` indépendamment du téléphone.
8. Au retour, GET du statut, contrôle des liens source/génération/révision,
   validation locale, rendu puis persistance atomique du rapport et de la mémoire.

La génération ne conditionne jamais la clôture. `Régénérer le compte rendu`
réutilise un job courant pending/processing ; après done/failed ou édition, elle
crée une nouvelle génération explicite. Modifier le texte persiste un rapport
distinct ; cela n'écrit jamais dans les notes.

## Sources, stockage et compatibilité

Les notes d'une visite clôturée sont en lecture seule. L'intention conserve les
métadonnées gelées et un manifeste des chemins source, sans doubler le texte de
tous les historiques. Avant réouverture/édition des notes, l'ancien instantané
complet est archivé. Cette représentation protège le budget de sauvegarde annuel
existant, qui n'est pas augmenté.

`reportJob` contient version, visitId, storeId, completedDate, signature locale
V277, signature SHA-256 du JSON source canonique, génération, révision finale,
capacité aléatoire de 256 bits, jobId, createdAt/updatedAt et statut. Le serveur
recalcule SHA-256 ; son identifiant hash inclut visite, magasin, date, signature
et génération. Des POST répétés retournent le même objet.

`professionalReport` conserve le JSON validé, les textes par famille, la révision,
la provenance source et le marqueur d'édition manuelle. Ces clés facultatives
sont validées dans les sauvegardes/restaurations sans changement de schemaVersion.
Les anciennes visites restent lisibles ; un ancien V277.1 pending est migré par
la queue existante. La suppression/réouverture rend un résultat en vol inapplicable.

La capacité est enregistrée avant le réseau et exigée pour lire le statut ; le
jobId ne donne pas accès au rapport. Elle n'est pas dans l'URL. Les réponses sont
`no-store` ; les notes/capacités ne sont pas journalisées. Après 30 jours, le
serveur supprime sources et résultat, en conservant un tombstone d'idempotence.
La copie locale reste disponible ; une régénération explicite est possible.

## JSON et renderer

Le prompt `visit-report-v278-1` demande extraction, nettoyage et classification.
Le budget existant de `visit_report`, **2600 tokens**, reste inchangé. Un job
utilise un seul fournisseur configuré : aucun repair, retry vide ou fallback
payant caché. Les routes IA historiques gardent leurs contrats.

```json
{
  "version": 1,
  "reports": [{
    "reportType": "cuisiniste",
    "items": [{
      "section": "showroom",
      "text": "Un réfrigérateur américain Samsung RS68A882 présent.",
      "source": "report.shared.context",
      "quote": "un américain Samsung RS68A882 présent"
    }]
  }]
}
```

Chaque texte est relié à une citation réellement présente dans les notes. Les
types et rubriques autorisés sont figés. Le renderer impose titres, emojis,
ordre, séparateurs, listes et synthèse. BLANC suit Lavage/Cuisson/Froid/Aspiration.
Cuisiniste produit un seul rapport, avec date, sans BRUN/BLANC visible.
Les rubriques vides disparaissent ; synthèse et actions ne sont pas inventées
pour remplir un modèle.

Le fallback affiche uniquement les sources déterministes sous des rubriques
sûres. Aucun diagnostic commercial n'est produit artificiellement.

## Protections contre les déformations

- JSON strict, version, familles attendues, unicité des rapports, chemins sources
  et citations exactes ; réponse vide/tronquée rejetée.
- Références, chiffres, prix, noms, marques, dates et ordinaux vérifiés par citation.
- Nettoyage borné : aucun nouveau mot porteur d'un fait, ni inversion des sujets
  ou de la comparaison ; les paraphrases ambitieuses sont volontairement refusées.
- Avis humains attribués, négation/possibilité/incertitude conservées ; un contrat
  non validé n'est pas un refus, une ouverture commerciale n'est pas un accord.
- Qualification « réfrigérateur américain/combiné » uniquement avec contexte
  électroménager confirmé ; sans preuve, le terme original reste prudent.
- Rubrique métier et statut d'action doivent être étayés ; aucun emoji, titre ou
  format libre du fournisseur dans le texte accepté.
- Ancien résultat ignoré après modification des sources, réouverture, suppression,
  nouvelle génération ou édition manuelle du rapport. Recontrôle dans la queue
  d'écriture, pas seulement avant l'attente réseau.

Ces contrôles réduisent fortement les inventions ; ils ne constituent pas une
preuve générale de compréhension sémantique. Une relecture terrain reste utile.

## Hors ligne, fermeture et erreurs

Hors ligne, la clôture, les notes, le job pending et Runner local sont sauvegardés.
Le retour réseau ou le prochain lancement reprend l'envoi ; aucune boucle ne
cherche à maintenir le JavaScript vivant en arrière-plan.

**Après acceptation durable du POST**, le serveur continue quand l'application
est fermée, suspendue ou le téléphone verrouillé. **Avant l'envoi**, un téléphone
tué immédiatement ne peut pas transmettre ses notes : l'outbox les conserve et
reprend au retour. Ce cas, comme la clôture hors ligne, ne garantit pas un rapport
déjà calculé pendant l'absence. L'interface distingue attente et traitement.

Timeout fournisseur, JSON vide/tronqué, validation refusée ou incident IA : failed,
notes/clôture/mémoire locale et rapport précédent conservés. Panne réseau de
soumission/récupération : pending/processing conservé pour reprise.

Les alarmes ont une livraison au moins une fois. Après crash avec processing
durable, le fournisseur a peut-être déjà facturé son appel : le job devient failed
sans nouveau paiement automatique. Une régénération explicite peut refaire un
appel. Il n'existe pas de garantie exactly-once d'un fournisseur externe.

## PWA, déploiement et recette

Build proposé `20261008-r78-reliable-auto-report-276`, version produit affichée
276 conservée. Aucun script de démarrage ajouté, budget 79 inchangé. Renderer,
coordinateur et adaptateur JSON historique sont précachés pour le chargement à la
demande hors ligne. Le bump accompagne index/SW/manifest/version.

`workers/wrangler.jsonc` déclare AI, REPORT_JOBS et sa migration SQLite.
**Aucun déploiement Worker ni Pages n'est effectué par ce chantier.** La route,
le compte/zone, les variables et secrets réellement configurés dans Cloudflare
doivent encore être vérifiés avant un déploiement autorisé. Le compte Cloudflare
n'a pas de connecteur disponible ici. Un binding manquant conserve l'outbox ;
Pages seul ne peut pas activer les jobs serveur.

Les tests couvrent les trois golden samples, validations adversariales, sources
et éditions immuables, stockage annuel/IndexedDB, exports/restaurations, double tap,
source obsolète, reopen/delete, reprise offline/reload, Worker et runtime workerd
SQLite/alarme avec un fournisseur simulé à la frontière réseau (aucun appel payant).
Android 390/360, cache et mise à jour PWA sont vérifiés par Playwright.

Recette physique encore nécessaire par Redouane après déploiement approuvé :
TWA Android, fermeture/force-stop immédiatement après tap et après acceptation,
verrouillage plusieurs minutes, perte réseau/reconnexion, dictée terrain réelle,
références/prix/avis/nuances Cuisiniste, installation et retour après mise à jour.
iOS vient ensuite. Aucun test émulé ne remplace ces vérifications physiques ni
une validation du fournisseur réel.

## Résultats locaux avant publication de la Draft

- Golden/adversariaux BRUN, BLANC et Cuisiniste : pass ; six groupes Worker : pass.
- Coordinateur : 18/18 ; mémoire V277 : 22/22 ; stockage/Workflow/legacy : pass.
- Runtime workerd : vrai SQLite + alarme sans client + redémarrage + un appel, pass.
- Android Playwright : 36 scénarios concernés pass, dont 390/360, neuf cycles de
  job, huit parcours de rapport/notes, trois IndexedDB, cinq PWA, quatre V277,
  quatre suppressions, une réouverture et deux photos/rapport édité.
- Stockage annuel : 1040 visites, 3024 actions, environ 21 Mo ; export/restauration
  et dix cycles de transfert identiques ; plafond checkpoint 24 MiB conservé.
- Planning benchmark : 58/58 magasins, 105 placements sur neuf semaines ;
  6921 km optimisés contre 7335 km, gain 414 km et 452 minutes, aucune journée
  infaisable. Signatures de référence inchangées.
- Catalogue Python : 18/18. Syntaxe, cache/build, architecture et couverture : pass.
- Démarrage : budget 79 conservé. Tous les 288 fichiers de tests sont rattachés
  à Reliability (280 directs, huit par chaînage).

La vérification du bit exécutable Android est propre à Linux : elle est laissée
à la CI, sans modifier le test. Les résultats GitHub sur le HEAD final sont
rapportés dans la PR et le compte rendu de livraison.

## Régression de concurrence trouvée en CI

La première CI complète a révélé qu’une sauvegarde effective du job d’une autre
visite pouvait remplacer « Visite supprimée » par « Enregistré localement ».
Les écritures de jobs passent désormais leur contexte à la notification de la
queue : elles restent durables, mais leurs statuts techniques positifs ne
remplacent pas le message de l’action utilisateur. Une erreur disque reste
visible. Les opérations manuelles gardent leurs notifications habituelles.

Le test navigateur de suppression force maintenant la progression du job d’une
visite conservée après suppression : il vérifie à la fois sa persistance réelle
et le maintien de la confirmation. Toutes les assertions de suppression et de
protection des photos sont conservées. Les 13 cas suppression/jobs concernés
passent localement après correction ; la CI complète est relancée sur le nouveau
HEAD.
