# IA gratuite de Store Runner — secours Groq

Le moteur principal recommandé est désormais **Cloudflare Workers AI** avec `@cf/google/gemma-4-26b-a4b-it`.

Groq reste utile comme **moteur de secours** pendant la transition ou si Workers AI rencontre une erreur.

## Configuration de secours

1. Créer une API key dans Groq Console.
2. Dans le Worker Cloudflare `chef-secteur-ai`, ouvrir **Variables and Secrets**.
3. Ajouter un secret nommé `GROQ_API_KEY`.
4. Optionnel : ajouter la variable texte `GROQ_MODEL=openai/gpt-oss-20b`.
5. Déployer le Worker.

Quand le binding Workers AI `AI` est présent, Gemma 4 est utilisé en priorité. Groq n'est appelé que si Workers AI est absent, renvoie une erreur ou ne produit pas de texte exploitable.

Ne jamais coller la clé Groq directement dans Store Runner, dans GitHub ou dans une URL.
