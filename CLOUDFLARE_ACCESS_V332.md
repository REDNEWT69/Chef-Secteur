# Store Runner V332 — Cloudflare Access

Objectif : empêcher l'ouverture de Store Runner et l'utilisation de son IA sans authentification, sans stocker de mot de passe ou de secret dans le JavaScript public.

## Architecture cible

```text
Utilisateur iPhone
  ↓ Cloudflare Access
https://store-runner.fr
  ├─ application Store Runner → origine GitHub Pages
  └─ /api/ai* → Worker chef-secteur-ai → Workers AI / Gemma 4
                                      ↘ Groq en fallback
```

Le frontend utilise uniquement `/api/ai`. L'URL publique `*.workers.dev` n'est plus nécessaire en production.

## Ordre de déploiement obligatoire

Ne pas fusionner la V332 avant que les étapes Cloudflare 1 à 4 soient validées. Cet ordre évite de publier un frontend qui pointerait vers `/api/ai` avant que la route existe.

### 1. Préparer Cloudflare Access

Dans Cloudflare Zero Trust :

1. `Integrations` → `Identity providers`.
2. Ajouter `One-time PIN` si cette méthode n'est pas déjà disponible.
3. `Access controls` → `Applications` → ajouter une application `Self-hosted`.
4. Domaine de l'application : `store-runner.fr`.
5. Ajouter également `www.store-runner.fr` si cette variante peut être utilisée directement.
6. Créer une policy `Allow` limitée aux adresses e-mail autorisées. Ne jamais utiliser une règle OTP ouverte à n'importe quelle adresse.
7. Si OTP est retenu, ajouter `Login methods = One-time PIN` en règle `Require`.
8. Régler la durée de session de l'application/policy à la durée souhaitée. Pour l'iPhone principal, un mois est le maximum pris en charge par Access et évite une reconnexion quotidienne.

Alternative : pour un utilisateur déjà membre du compte Cloudflare, l'Identity Provider Cloudflare peut être utilisé à la place d'OTP et bénéficie de la sécurité du compte Cloudflare, dont la MFA si elle est activée.

Documentation :
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
- https://developers.cloudflare.com/cloudflare-one/access-controls/policies/

### 2. Vérifier que le domaine passe réellement par Cloudflare

Une Worker Route exige un enregistrement DNS du hostname proxyfié par Cloudflare (nuage orange).

Avant la bascule :

1. Vérifier que `store-runner.fr` est bien dans une zone Cloudflare active.
2. Vérifier que l'enregistrement DNS qui mène vers l'origine GitHub Pages est proxyfié par Cloudflare.
3. Vérifier que `https://store-runner.fr` continue de charger Store Runner via Cloudflare.
4. Ne pas modifier ou supprimer le domaine personnalisé GitHub Pages pendant cette migration.

Documentation :
- https://developers.cloudflare.com/workers/configuration/routing/routes/

### 3. Ajouter la route IA même domaine

Dans `Workers & Pages` → `chef-secteur-ai` → `Settings` → `Domains & Routes` → `Add` → `Route` :

- Zone : `store-runner.fr`
- Pattern : `store-runner.fr/api/ai*`

Si `www.store-runner.fr` sert réellement l'application sans redirection préalable, ajouter aussi :

- `www.store-runner.fr/api/ai*`

Le `*` final est important pour que les requêtes avec query-string, par exemple `/api/ai?mode=ping`, correspondent à la route.

### 4. Tester la route avant la fusion

Une fois authentifié dans Access :

1. Ouvrir `https://store-runner.fr/api/ai?mode=ping`.
2. Attendre `ok: true`.
3. Vérifier `provider: "cloudflare-workers-ai"`.
4. Vérifier le modèle Gemma attendu.
5. Vérifier `workersAiBinding: true`.
6. Vérifier que ce ping n'appelle ni Gemma ni Groq pour générer du texte.

Tester ensuite dans une fenêtre privée non authentifiée : l'accès à `https://store-runner.fr` doit être intercepté par Access.

### 5. Fusionner et déployer V332

Après validation des étapes précédentes :

1. Fusionner la PR V332.
2. Attendre le déploiement Store Runner vert.
3. Ouvrir Store Runner sur iPhone et laisser le nouveau service worker prendre le contrôle.
4. Tester l'assistant IA et le correcteur de compte rendu.
5. Tester le navigateur mobile 390 px via la CI.

Le service worker V332 ne sert plus une ancienne page d'accueil depuis le cache lors d'une navigation. C'est volontaire : une application protégée par Access ne doit pas pouvoir redémarrer hors ligne en contournant l'authentification.

Il continue à pouvoir utiliser son cache pour certains assets après ouverture authentifiée, mais `/api/ai` n'est jamais intercepté ni mis en cache.

### 6. Supprimer le bypass `workers.dev`

Après confirmation que `/api/ai` fonctionne en production :

1. `Workers & Pages` → `chef-secteur-ai` → `Settings` → `Domains & Routes`.
2. Sur la route `workers.dev`, sélectionner `Disable`.
3. Désactiver également les Preview URLs si elles ne sont pas nécessaires.
4. Confirmer que l'ancienne URL `https://chef-secteur-ai.rednewtizi.workers.dev` n'est plus publiquement utilisable.

Documentation :
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

Cette étape est indispensable : CORS/Origin n'est pas une authentification et un client manuel peut forger un header `Origin`.

### 7. Nettoyage final du Worker

Une fois la bascule validée :

- retirer `https://rednewt69.github.io` des origines IA autorisées ;
- conserver seulement `https://store-runner.fr` et, si nécessaire, `https://www.store-runner.fr` ;
- redéployer `workers/chef-secteur-ai.js` dans Cloudflare ;
- vérifier qu'un POST sans `Origin` reste rejeté avant Workers AI/Groq ;
- vérifier qu'une origine inconnue reste rejetée ;
- vérifier que `/ping` se comporte comme prévu derrière Access.

## Vérification de l'ancien GitHub Pages

Le dépôt reste public, donc le code source public ne devient pas secret. L'objectif d'Access est de protéger l'application déployée et l'API, pas le contenu du dépôt GitHub.

Après activation d'Access, tester explicitement l'ancienne URL GitHub Pages dans une fenêtre privée. Elle doit rediriger vers le domaine personnalisé protégé. Si elle sert encore directement l'application sans passer par `store-runner.fr`, ne pas considérer le chantier terminé : il faudra supprimer cette exposition directe ou migrer l'hébergement du frontend derrière Cloudflare.

## Checklist de sortie

- [ ] Store Runner non authentifié → écran Cloudflare Access
- [ ] Adresse non autorisée → aucun accès
- [ ] Adresse autorisée → connexion réussie
- [ ] Session iPhone persistante selon la durée configurée
- [ ] `/api/ai?mode=ping` → OK après connexion
- [ ] Assistant IA → Gemma principal
- [ ] Groq → fallback uniquement
- [ ] Correcteur IA → OK
- [ ] `workers.dev` → désactivé
- [ ] GitHub Pages historique → redirige vers le domaine protégé
- [ ] POST IA sans Origin → 403, zéro appel IA
- [ ] POST IA origine étrangère → 403, zéro appel IA
- [ ] Reliability → vert
- [ ] navigateur mobile 390 px → vert
