# Chef Secteur SAMSUNG — IA en ligne

L'application GitHub Pages ne doit jamais contenir directement une clé API OpenAI.
La passerelle sécurisée est prête dans `workers/chef-secteur-ai.js`.

## Architecture

Chef Secteur (GitHub Pages) → Cloudflare Worker → OpenAI Responses API

Le Worker accepte uniquement l'origine :

`https://rednewt69.github.io`

La clé OpenAI reste dans un secret Cloudflare nommé :

`OPENAI_API_KEY`

Le modèle par défaut est :

`gpt-5.6-luna`

On peut le remplacer plus tard via une variable Cloudflare `OPENAI_MODEL` sans modifier le site.

## Déploiement Cloudflare

1. Créer ou ouvrir un compte Cloudflare.
2. Ouvrir **Workers & Pages**.
3. Créer un Worker, par exemple `chef-secteur-ai`.
4. Remplacer le code du Worker par le contenu de `workers/chef-secteur-ai.js` puis déployer.
5. Dans **Settings / Variables and Secrets**, ajouter un secret nommé `OPENAI_API_KEY`.
6. Coller la clé API OpenAI uniquement dans ce secret Cloudflare.
7. Ne jamais mettre la clé dans GitHub, Chef Secteur, un screenshot public ou une URL.
8. Copier l'URL publique du Worker, par exemple `https://chef-secteur-ai.<compte>.workers.dev`.
9. Dans Chef Secteur, ouvrir la configuration IA, coller uniquement cette URL dans **Passerelle IA**, puis tester la connexion.
10. Passer l'assistant en **IA en ligne**.

## Modes pris en charge

- `ping` : test de connexion.
- `assistant` : questions sur planning, Google Agenda, hôtels, déplacements et magasins.
- `parse_stores` : transformation de notes en magasins structurés.

## Sécurité

- CORS limité au GitHub Pages Chef Secteur.
- Aucun secret dans le navigateur.
- Aucun secret dans le dépôt GitHub.
- Les événements Google Agenda et le planning sont envoyés à la passerelle uniquement lorsqu'une requête IA est faite.
- Les données manquantes ne doivent pas être inventées par l'assistant.
