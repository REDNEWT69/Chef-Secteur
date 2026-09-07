# IA gratuite pour Chef Secteur SAMSUNG

Option recommandée : **Groq Free Plan** + **Cloudflare Worker gratuit**.

## Pourquoi
- pas besoin d'abonnement OpenAI API ;
- le Free Plan Groq impose des limites de débit, mais convient à un usage personnel de l'application ;
- la clé Groq reste côté Cloudflare et n'est jamais publiée dans GitHub Pages.

## Étapes
1. Créer un compte gratuit sur Groq Console.
2. Créer une API key.
3. Dans Cloudflare Workers, créer/déployer le Worker avec `workers/chef-secteur-ai.js`.
4. Dans les paramètres du Worker > Variables and Secrets, ajouter un **secret** nommé `GROQ_API_KEY` et coller la clé Groq.
5. Optionnel : variable texte `GROQ_MODEL=openai/gpt-oss-20b`.
6. Déployer puis copier l'URL `https://...workers.dev`.
7. Dans Chef Secteur, renseigner cette URL comme passerelle IA puis activer le mode IA en ligne.

Ne jamais coller la clé Groq directement dans l'application ou le dépôt GitHub.