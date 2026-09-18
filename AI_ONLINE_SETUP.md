# Store Runner — IA en ligne

L'application GitHub Pages ne doit jamais contenir directement une clé API.
La passerelle sécurisée est `workers/chef-secteur-ai.js`.

## Architecture actuelle

Store Runner → Cloudflare Worker → **Cloudflare Workers AI / Gemma 4**

Secours facultatif :

Cloudflare Worker → **Groq / GPT-OSS 20B**

Le moteur principal par défaut est :

`@cf/google/gemma-4-26b-a4b-it`

Il tourne directement via le binding Cloudflare Workers AI nommé `AI`, donc aucune clé Gemini ou Google n'est nécessaire.

## Configuration Cloudflare recommandée

1. Ouvrir le Worker `chef-secteur-ai` dans Cloudflare.
2. Ouvrir **Settings / Bindings**.
3. Ajouter un binding **Workers AI**.
4. Nommer la variable exactement `AI`.
5. Enregistrer la configuration.
6. Déployer le contenu courant de `workers/chef-secteur-ai.js`.
7. Garder le secret `GROQ_API_KEY` pendant la transition : il sert uniquement de secours si Workers AI est indisponible.
8. Optionnel : définir `WORKERS_AI_MODEL` pour remplacer le modèle Workers AI sans modifier le code.
9. Optionnel : conserver `GROQ_MODEL=openai/gpt-oss-20b` pour choisir le modèle de secours Groq.

## Vérification

Ouvrir l'URL publique du Worker ou `?mode=ping`.

Quand le binding est actif, la réponse doit indiquer notamment :

- `ok: true`
- `provider: "cloudflare-workers-ai"`
- `model: "@cf/google/gemma-4-26b-a4b-it"`
- `workersAiBinding: true`

Si `GROQ_API_KEY` est encore présent, le champ `fallback` indique Groq comme moteur de secours.

Sans binding `AI`, le Worker continue temporairement à utiliser Groq si sa clé est disponible. Cette transition évite de couper Store Runner pendant la configuration Cloudflare.

## Modes pris en charge

- `ping` : test de connexion et moteur actif ;
- `assistant` : questions sur planning, Google Agenda, hôtels, déplacements et magasins ;
- `parse_stores` : transformation de notes en magasins structurés ;
- `proofread` : correction légère des notes terrain sans charger le gros contexte assistant.

## Sécurité

- CORS limité à Store Runner et au GitHub Pages historique autorisé.
- Aucun secret dans le navigateur ou dans le dépôt.
- Le binding `AI` ne nécessite pas de clé fournisseur exposée à l'application.
- Les événements Google Agenda et le planning sont envoyés à la passerelle uniquement lorsqu'une requête IA est faite.
- Les données manquantes ne doivent pas être inventées par l'assistant.
