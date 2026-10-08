# Comptes rendus automatiques — protocole serveur V278

Cette PR reste Draft et ne doit pas être fusionnée sans validation explicite de Redouane. Aucun Worker ni binding Cloudflare n'est déployé par ce chantier.

## Diagnostic vérifié dans le dépôt

`workers/chef-secteur-ai.js` possédait uniquement un handler HTTP synchrone : Workers AI (`AI`) en priorité, Groq en secours facultatif. Aucun stockage serveur, Queue, D1, KV, Durable Object, alarm ou `waitUntil` n'était déclaré. `AI_ONLINE_SETUP.md` documentait un déploiement manuel dans le dashboard. Le workflow `deploy-pages.yml` ne déploie que les fichiers statiques GitHub Pages. La route frontend `/api/ai` existe dans le code, mais sa configuration Cloudflare réelle, les bindings du compte et la version du Worker servi ne sont pas décrits dans Git et n'ont pas pu être inspectés ici.

Le budget existant `visit_report` est **2600 tokens**. La route historique le conserve, ainsi que ses tests de secours et de réponses vides. Le nouveau protocole durable utilise ce même plafond pour **toute la visite**, même si elle contient un rapport BRUN et un rapport BLANC. Il ne relève aucun budget.

## Architecture retenue

Un namespace **Durable Object SQLite `REPORT_JOBS`**, une instance par identité de job. La même instance fournit stockage transactionnel, claim d'exécution et alarme autonome. Il n'y a ni base D1 séparée, ni Queue, ni registre KV éventuel. Cette architecture ajoute un seul service à la passerelle existante et évite une fenêtre entre un stockage externe et une publication dans une Queue.

Le POST persiste la source et programme l'alarme dans une même transaction **avant** de répondre `202 pending`. L'alarme exécute ensuite l'analyse sans requête du téléphone. Le résultat structuré validé est persisté sur l'objet et disponible au retour de l'application. Aucun JavaScript client n'est maintenu actif.

Les [alarmes Cloudflare](https://developers.cloudflare.com/durable-objects/api/alarms/) réveillent l'objet indépendamment des requêtes et garantissent une livraison au moins une fois. Le [stockage SQLite des Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) est transactionnel et fortement cohérent. `waitUntil` seul est insuffisant pour ce parcours : la [limite après réponse ou déconnexion est de 30 secondes](https://developers.cloudflare.com/workers/runtime-apis/context/).

## Contrat et idempotence

`POST /api/ai/report-jobs`, origine Store Runner obligatoire :

```json
{
  "protocolVersion": 1,
  "visitId": "identifiant-visite",
  "storeId": "identifiant-magasin",
  "completedDate": "2026-10-07",
  "sourceSignature": "sha256-<empreinte>",
  "generation": 0,
  "accessToken": "<capacité aléatoire de 32 octets en hexadécimal>",
  "source": {
    "version": 1,
    "visitId": "identifiant-visite",
    "storeId": "identifiant-magasin",
    "completedDate": "2026-10-07",
    "store": { "enseigne": "Enseigne", "ville": "Ville", "channel": "grands-magasins" },
    "reports": [{
      "reportType": "brun",
      "entries": [{ "source": "report.brun.team", "family": "brun", "text": "Notes brutes exactes." }]
    }]
  }
}
```

Le client sauvegarde la source figée, sa signature SHA-256 canonique et la capacité **avant le premier POST**. Le serveur recalcule la signature à partir de l'intégralité des notes et des métadonnées ; une identité ou une signature incohérente est refusée sans IA. Aucun texte n'est tronqué pour faire accepter une source trop volumineuse.

`jobId` est un SHA-256 de protocole + visite + magasin + date + signature + génération. La capacité n'entre **pas** dans l'identité : la changer ne permet pas de créer un deuxième job identique. Le serveur stocke uniquement son hash et refuse la création répétée avec une autre capacité. `generation=0` est la clôture automatique ; seule une régénération explicitement demandée avance ce compteur et autorise un nouvel appel payant.

`GET /api/ai/report-jobs/{jobId}` exige `X-Report-Capability`. Un identifiant connu sans capacité ne donne accès ni au résultat ni aux notes. Les réponses portent `Cache-Control: no-store`, les métadonnées de visite, `createdAt`, `updatedAt`, `expiresAt`, `promptVersion`, et `status` (`pending`, `processing`, `done`, `failed`). `done` fournit `result: {version:1,reports:[...]}` ; `failed` fournit `error: {code,message}` avec un diagnostic contrôlé. Les sources et le hash de capacité ne sont jamais exposés dans ces réponses.

## Appel fournisseur et interruption

Un job effectue **une seule invocation fournisseur**, au maximum **2600 tokens**, avec le prompt versionné du module partagé. Le binding Workers AI existant est utilisé si configuré ; sinon Groq est utilisé si son secret existe. Un échec de Workers AI ne déclenche pas un deuxième appel Groq dans ce protocole. Une réponse vide, tronquée ou non conforme ne déclenche ni réparation ni nouvel essai payant.

Le claim `processing` est durable avant l'appel. Le timeout serveur est de 90 secondes ; Groq reçoit un signal d'annulation. Le binding Workers AI n'offre ici aucun mécanisme d'annulation garanti : un appel tardif peut terminer côté fournisseur, mais son résultat est ignoré après l'échec et aucune nouvelle invocation automatique n'est faite.

Une alarme rejouée après arrêt du serveur sur un job `processing` marque `failed / report_processing_uncertain`, sans appeler le fournisseur. Il est impossible de prouver qu'un fournisseur externe n'a pas facturé une requête déjà envoyée avant un crash ; le système privilégie donc l'absence de double facturation automatique. La régénération reste explicite et les données locales font autorité.

Les sources et résultats serveur expirent après 30 jours. L'alarme d'expiration retire les données métier ; un petit tombstone d'identité, de signature et d'accès reste conservé pour que rejouer le même POST ne provoque jamais une nouvelle facturation. L'application doit enregistrer le résultat localement avant expiration. Une visite supprimée ou rouverte localement ne peut recevoir un résultat obsolète grâce aux gardes du propriétaire visite.

## Configuration et déploiement encore nécessaires

`workers/wrangler.jsonc` versionne le nom `chef-secteur-ai`, son fichier principal, le binding `AI`, le binding `REPORT_JOBS` et la migration `report-jobs-v1` vers SQLite. Les identifiants de compte, de zone et la route de production sont volontairement absents : ils doivent être lus dans la configuration réelle avant toute opération autorisée. Préserver les secrets et modèles existants ; ne jamais les inscrire dans le frontend ou dans Git.

`keep_vars:true` conserve les variables du dashboard. L'absence de `route`/`routes` avec `workers_dev:false` suit le [contrat Wrangler pour conserver des routes gérées dans le dashboard](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth). Cela désactive l'URL `workers.dev` : vérifier ce choix avec la configuration actuelle avant le futur déploiement. Aucun changement de route n'est présumé à partir du code frontend.

Le déploiement doit utiliser le module Worker **et** son import partagé `store-runner-report-renderer.js`, et provisionner le nouveau namespace. Coller seulement le fichier Worker dans un éditeur sans ses imports ne constitue pas un déploiement valide. Le ping expose `reportJobs: {protocolVersion:1,ready:true|false}`. Tant que ce binding n'est pas déployé, les nouvelles routes retournent `503` sans prétendre traiter en arrière-plan ; la clôture, les sources et la mémoire locale restent disponibles.

Le dépôt ne contient aucun déploiement Worker automatique. Déployer Pages seul ne suffit pas à activer les jobs. Après validation humaine et éventuelle fusion, vérifier d'abord la configuration et le ping du backend, puis une visite fabriquée de bout en bout et enfin le build frontend servi. Cette PR n'effectue aucun de ces déploiements.

## Vérifications reproductibles

- `node tests/report-jobs-worker-v278.test.cjs` : acceptation, persistance/alarme atomiques, signatures, capacités, doubles POST, changements de source/génération, erreurs vides/tronquées/inventées, timeout, reprise incertaine, expiration et panne de stockage.
- `node tests/report-jobs-runtime-v278.test.cjs` : vrai `workerd`, vrai SQLite et vraie alarme ; le fournisseur est uniquement simulé à la frontière réseau. Sans page ouverte, l'alarme démarre ; les POST concurrents ne doublent pas l'appel ; le résultat survit à l'arrêt et au redémarrage complets du runtime. Dépendance de test : `miniflare@4.20260730.0`.
- Les suites historiques Worker passent par un loader VM commun qui remplace uniquement les imports/exports. Le fichier Worker réel est vérifié comme module ES par le contrôle syntaxique.

Ces tests ne prouvent ni la disponibilité des bindings de production, ni le comportement d'un vrai fournisseur, ni une recette sur un téléphone Android physique.
