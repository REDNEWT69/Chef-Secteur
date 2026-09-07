// Cloudflare Worker - passerelle IA sécurisée pour Chef Secteur SAMSUNG
// Secret requis côté Cloudflare : GROQ_API_KEY
// Aucune clé API ne doit être placée dans GitHub Pages ou dans le navigateur.

const ALLOWED_ORIGINS = new Set(['https://rednewt69.github.io']);
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://rednewt69.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...cors(origin)
    }
  });
}

function stripFence(text) {
  return String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function compactContext(context) {
  if (!context || typeof context !== 'object') return {};
  return {
    today: context.today || null,
    profile: context.profile || {},
    settings: context.settings || {},
    plan: context.plan || {},
    calendarEvents: (context.calendarEvents || []).slice(0, 120),
    awayRanges: context.awayRanges || [],
    daySummaries: context.daySummaries || {},
    overnight: context.overnight || null,
    instructions: context.instructions || '',
    stores: (context.stores || []).slice(0, 120)
  };
}

async function callGroq(env, system, user, maxTokens) {
  if (!env.GROQ_API_KEY) {
    throw new Error('Secret GROQ_API_KEY absent du Worker Cloudflare en Production.');
  }

  const model = env.GROQ_MODEL || DEFAULT_MODEL;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.2,
      max_tokens: maxTokens || 900
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data && data.error && data.error.message
      ? data.error.message
      : `Groq HTTP ${response.status}`;
    throw new Error(msg);
  }

  const text = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';

  return { text: String(text || '').trim(), model, provider: 'groq' };
}

const ASSISTANT_SYSTEM = `Tu es l'assistant opérationnel d'un chef de secteur Samsung Rhône-Alpes.
Tu reçois le planning réel de la semaine, les magasins, Google Agenda, déplacements, hôtels et contraintes.
Règles impératives :
- Ne fabrique jamais un rendez-vous, un horaire, une adresse ou une ouverture de magasin absent du contexte.
- Un déplacement, une formation ou une journée bloquée interdit toute visite terrain concurrente.
- Respecte Google Agenda et les séjours hors secteur.
- Pour une question sur un jour, réponds d'abord avec ce qui est réellement prévu ce jour-là.
- Signale clairement une incohérence du planning au lieu de l'ignorer.
- Réponds en français, brièvement, de façon pratique et exploitable.
- N'effectue aucune modification du planning sans que l'utilisateur le demande explicitement.`;

const STORE_PARSE_SYSTEM = `Transforme les notes fournies en liste structurée de magasins. Réponds UNIQUEMENT avec un objet JSON valide de forme {"stores":[...]}. Chaque magasin peut contenir : enseigne, ville, adresse, codePostal, dept, lat, lon, freq, priority, products, active. N'invente pas les données manquantes.`;

async function handlePing(env, origin) {
  if (!env.GROQ_API_KEY) {
    return json({
      ok: false,
      provider: 'groq',
      error: 'Secret GROQ_API_KEY absent du Worker Cloudflare en Production.'
    }, 500, origin);
  }

  return json({
    ok: true,
    provider: 'groq',
    model: env.GROQ_MODEL || DEFAULT_MODEL
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json({ error: 'Origine non autorisée.' }, 403, origin);
      }
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // Diagnostic simple depuis le navigateur ou l'éditeur Cloudflare.
    if (request.method === 'GET') {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json({ error: 'Origine non autorisée.' }, 403, origin);
      }
      if (url.searchParams.get('mode') === 'ping' || url.pathname === '/' || url.pathname.endsWith('/ping')) {
        return handlePing(env, origin);
      }
      return json({ error: 'Méthode non autorisée.' }, 405, origin);
    }

    if (request.method !== 'POST') {
      return json({ error: 'Méthode non autorisée.', method: request.method }, 405, origin);
    }

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'Origine non autorisée.' }, 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'JSON invalide.' }, 400, origin);
    }

    const mode = String(body.mode || 'assistant');

    try {
      if (mode === 'ping') {
        return handlePing(env, origin);
      }

      if (mode === 'parse_stores') {
        const user = String(body.message || '').slice(0, 18000);
        const result = await callGroq(env, STORE_PARSE_SYSTEM, user, 1600);
        let parsed;
        try {
          parsed = JSON.parse(stripFence(result.text));
        } catch {
          return json({
            error: 'Le modèle n’a pas renvoyé un JSON de magasins valide.',
            raw: result.text.slice(0, 500)
          }, 502, origin);
        }
        return json({
          stores: Array.isArray(parsed.stores) ? parsed.stores : [],
          model: result.model,
          provider: result.provider
        }, 200, origin);
      }

      const message = String(body.message || '').trim().slice(0, 12000);
      if (!message) return json({ error: 'Message vide.' }, 400, origin);

      const context = compactContext(body.context || {});
      const user = `QUESTION UTILISATEUR:\n${message}\n\nCONTEXTE CHEF SECTEUR (JSON):\n${JSON.stringify(context)}`;
      const result = await callGroq(env, ASSISTANT_SYSTEM, user, 1000);
      if (!result.text) throw new Error('Réponse IA vide.');

      return json({
        text: result.text,
        reply: result.text,
        answer: result.text,
        message: result.text,
        actions: [],
        model: result.model,
        provider: result.provider
      }, 200, origin);
    } catch (err) {
      return json({ error: err && err.message ? err.message : String(err) }, 500, origin);
    }
  }
};
