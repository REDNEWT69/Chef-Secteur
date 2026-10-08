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
- Avis humains attribués, voix active/passive, alternatives et responsabilités
  conservées ; les abréviations de dictée connues restent corrigeables.
- Négation/possibilité/incertitude conservées ; un contrat
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

Build proposé `20261008-r83-partial-report-safety-276`, version produit affichée
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


## Provider Gemini 3.8 Flash (backend-only)

Le Worker choisit un seul moteur par job : Gemini si `GEMINI_API_KEY` est défini,
Groq sinon si `GROQ_API_KEY` est défini, Workers AI sinon si le binding `AI` existe.
Modèle par défaut : `gemini-3.8-flash` (option `GEMINI_MODEL`). Aucun fallback payant,
aucune seconde tentative automatique sur réponse vide, quota ou panne. Les notes source
restent locales et le job en échec conserve son code d'erreur contrôlé.
Le déploiement du frontend GitHub Pages ne publie pas `workers/chef-secteur-ai.js` :
redéployer le Worker Cloudflare indépendamment après validation.


## Diagnostic fournisseur et sélection explicite (R81)

Le job durable conserve **un seul** appel fournisseur et aucune reprise payante silencieuse.
Le champ optionnel `REPORT_AI_PROVIDER` (variable texte du Worker, pas un secret)
peut sélectionner `gemini`, `groq` ou `workers-ai`. Sans ce champ, la priorité
reste Gemini → Groq → Workers AI. Un fournisseur explicitement sélectionné mais non
configuré échoue sans basculer silencieusement vers un autre moteur.

Pour les échecs HTTP de Gemini uniquement, le job expose un diagnostic maîtrisé :
`error.provider='gemini'`, `error.httpStatus` (400–599) et message équivalent.
**Jamais** de corps de réponse Google, de notes source, de prompt ou de clé API.
Les jobs déjà échoués restent inchangés ; seule une future génération afficherait
le nouveau code HTTP. Le backend Cloudflare doit être déployé séparément de Pages.


### Rejet V278 expliqué sans exposer les notes

Le validateur partagé renvoie plusieurs erreurs fixes. Le Worker ne stocke et
n'affiche que leur **catégorie autorisée**, par exemple
`source_context_missing` (« citation incomplète ou sortie de son contexte »),
`source_quote_missing` ou `cleanup_semantics_changed`.
Il n'enregistre jamais le texte brut, la proposition IA, le prompt ni le corps
de réponse fournisseur dans le champ `error`.

Une fixture synthétique sans ponctuation reproduit un cas de rejet :
une citation partielle prélevée dans une longue note doit rester refusée tant
que ses limites sémantiques ne sont pas établies. Le test démontre le diagnostic,
**pas** une cause confirmée des échecs terrain antérieurs. La correction de
cette règle exige un exemple d'erreur précis et des tests métier dédiés,
pour protéger les négations, les attributions et les accords commerciaux.


### V278 — réconciliation de la dictée naturelle et du diagnostic Gemini (#547)

Le correctif conserve les diagnostics contrôlés de #546 sur le Worker, tout en
assouplissant l'extraction de citations issues de notes dictées sans ponctuation
et en permettant une reformulation professionnelle bornée. Les tests protègent
les chiffres, références, marques, rôles, négations et nuances commerciales.
Gemini reste le fournisseur prioritaire sans paramètre explicite. Aucun fallback
payant automatique, aucune altération des notes originales.

Build front-end : `20261008-r83-partial-report-safety-276`. Le Worker Cloudflare doit être redéployé
séparément après la fusion autorisée. Les tests simulés ne garantissent pas
encore la recette du compte rendu terrain sur Android avec Gemini.


### #548 — validation partielle et conservation intégrale des sources (r83)

L'inférence payante reste unique. Le Worker applique `validateBestEffort` : la
structure du JSON est vérifiée, puis chaque observation est contrôlée
individuellement. Les citations hors source ou hors contexte sont écartées.
Une reformulation dont la relation commerciale ou l'attribution ne peut être
prouvée **n'est jamais publiée telle quelle** : seule sa citation source,
inchangée, est conservée sous « Notes terrain ». En cas d'item écarté ou
d'absence de faits sûrs, la note originale correspondante est ajoutée pour
éviter toute disparition silencieuse d'informations.

Le navigateur vérifie à son tour le résultat du Worker via
`validateDelivered` avant de l'enregistrer. Les résultats portent un état
`complete`, `partial` ou `source-only` et des compteurs bornés. Le texte
copiable avertit d'une relecture nécessaire lorsqu'une observation n'a pas pu
être reformulée ; la fiche de visite distingue aussi ces situations. Il ne
s'agit pas d'une seconde validation IA ni d'une garantie d'exhaustivité
sémantique : un utilisateur doit relire les textes avant diffusion.

La validation stricte antérieure `validate()` et ses tests golden restent
disponibles comme contrat de référence. Tests de régression synthétiques :
BRUN long, inversion de prix, d'attribution, de disponibilité, citation inventée,
résultat `source-only` et contrôle client indépendant. Pas d'appel réel
Gemini/Groq et aucune modification de leur configuration. Worker Cloudflare
à redéployer séparément seulement après recette et fusion approuvées.
