// Cloudflare Worker - passerelle IA sécurisée pour Store Runner
// Moteur principal : Cloudflare Workers AI via le binding `AI`.
// Secours facultatif : Groq via le secret GROQ_API_KEY.
// Aucune clé API ne doit être placée dans GitHub Pages ou dans le navigateur.

const ALLOWED_ORIGINS = new Set([
  'https://rednewt69.github.io',
  'https://store-runner.fr',
  'https://www.store-runner.fr'
]);

const DEFAULT_WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

function cors(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
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
    businessV2: context.businessV2 || {},
    performanceV192: context.performanceV192 || null,
    instructions: context.instructions || '',
    stores: (context.stores || []).slice(0, 120)
  };
}

function hasWorkersAI(env) {
  return Boolean(env && env.AI && typeof env.AI.run === 'function');
}

function workersAIModel(env) {
  return String((env && env.WORKERS_AI_MODEL) || DEFAULT_WORKERS_AI_MODEL);
}

function groqModel(env) {
  return String((env && env.GROQ_MODEL) || DEFAULT_GROQ_MODEL);
}

function buildMessages(system, user, userOnly = false) {
  if (userOnly) {
    return [{ role: 'user', content: [system, user].filter(Boolean).join('\n\n') }];
  }
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function extractWorkersAIText(data) {
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object') return '';

  if (typeof data.response === 'string') return data.response.trim();
  if (data.result && typeof data.result.response === 'string') return data.result.response.trim();
  if (typeof data.text === 'string') return data.text.trim();

  const choice = Array.isArray(data.choices) && data.choices[0] ? data.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : '';
  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

async function callWorkersAI(env, system, user, maxTokens, options = {}) {
  if (!hasWorkersAI(env)) {
    throw new Error('Binding Workers AI `AI` absent du Worker Cloudflare.');
  }

  const model = workersAIModel(env);
  const payload = {
    messages: buildMessages(system, user, options.userOnly === true),
    temperature: 0.2,
    max_completion_tokens: maxTokens || 900
  };

  if (options.reasoningEffort) payload.reasoning_effort = options.reasoningEffort;

  const data = await env.AI.run(model, payload);
  const text = extractWorkersAIText(data);

  return {
    text,
    finishReason: data && typeof data === 'object'
      ? String(data.finish_reason || (data.choices && data.choices[0] && data.choices[0].finish_reason) || '')
      : '',
    model,
    provider: 'cloudflare-workers-ai'
  };
}

async function callGroq(env, system, user, maxTokens, options = {}) {
  if (!env.GROQ_API_KEY) {
    throw new Error('Secret GROQ_API_KEY absent du Worker Cloudflare.');
  }

  const model = groqModel(env);
  const isGptOss = /^openai\/gpt-oss-/i.test(model);
  const messages = buildMessages(system, user, options.userOnly === true);
  const payload = {
    model,
    messages,
    temperature: 0.2,
    max_completion_tokens: maxTokens || 900
  };
  if (isGptOss && options.reasoningEffort) payload.reasoning_effort = options.reasoningEffort;
  if (isGptOss && options.includeReasoning === false) payload.include_reasoning = false;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data && data.error && data.error.message
      ? data.error.message
      : `Groq HTTP ${response.status}`;
    throw new Error(msg);
  }

  const choice = data && data.choices && data.choices[0] ? data.choices[0] : null;
  const text = choice && choice.message ? choice.message.content : '';

  return {
    text: String(text || '').trim(),
    finishReason: choice ? String(choice.finish_reason || '') : '',
    model,
    provider: 'groq'
  };
}

async function callAI(env, system, user, maxTokens, options = {}) {
  let workersError = null;

  if (hasWorkersAI(env)) {
    try {
      const result = await callWorkersAI(env, system, user, maxTokens, options);
      if (result.text) return result;
      workersError = new Error('Workers AI a renvoyé une réponse vide.');
    } catch (err) {
      workersError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (env && env.GROQ_API_KEY) {
    if (workersError) {
      console.warn(`Workers AI indisponible, fallback Groq: ${workersError.message}`);
    }
    const fallback = await callGroq(env, system, user, maxTokens, options);
    return {
      ...fallback,
      fallbackFrom: workersError ? 'cloudflare-workers-ai' : null
    };
  }

  if (workersError) throw workersError;

  throw new Error(
    'Aucun moteur IA configuré : ajoute le binding Workers AI `AI` ou le secret GROQ_API_KEY.'
  );
}

const ASSISTANT_SYSTEM = `Tu es l'assistant opérationnel d'un chef de secteur.
Tu reçois le planning réel de la semaine et les données internes Store Runner sur les magasins.
Les objets magasins peuvent inclure performance (PDM YTD, cible, écart, évolution, sell-out, tendance, priorité) et terrain (PDL/représentation, conformité 6P, anomalies, actions ouvertes, dernière visite, compte rendu et motifs de priorité).
Règles impératives :
- Considère les données Store Runner fournies dans le contexte comme la source de vérité sur les magasins ; ne les remplace pas par des suppositions générales.
- Le YTD est le statut performance principal. Une tendance hebdomadaire est seulement indicative.
- Ne fabrique jamais un rendez-vous, un horaire, une adresse, une ouverture, une PDM, une PDL, une anomalie ou une action absente du contexte.
- Ne prétends jamais qu'une visite a causé une hausse ou une baisse de PDM sans donnée qui l'établit explicitement.
- Si la question porte sur un magasin, croise d'abord ses chiffres performance et ses constats terrain, puis propose des actions concrètes et directement liées aux données disponibles.
- Si une donnée utile manque, indique clairement qu'elle manque au lieu de combler le vide par une généralité présentée comme un fait.
- Un déplacement, une formation ou une journée bloquée interdit toute visite terrain concurrente lorsqu'ils sont présents dans le contexte.
- Pour une question sur un jour, réponds d'abord avec ce qui est réellement prévu ce jour-là.
- Signale clairement une incohérence du planning au lieu de l'ignorer.
- Réponds en français, brièvement, de façon pratique et exploitable.
- N'effectue aucune modification du planning sans que l'utilisateur le demande explicitement.`;

const STORE_PARSE_SYSTEM = `Transforme les notes fournies en liste structurée de magasins. Réponds UNIQUEMENT avec un objet JSON valide de forme {"stores":[...]}. Chaque magasin peut contenir : enseigne, ville, adresse, codePostal, dept, lat, lon, freq, priority, products, active. N'invente pas les données manquantes.`;

const PROOFREAD_SYSTEM = `Tu corriges et améliores la forme d'une note terrain en français.
Règles impératives :
- N’invente, n’ajoute et ne déduis aucune information absente du texte.
- Ne change aucun fait et ne supprime aucun fait utile.
- Préserve strictement chiffres, noms, enseignes, villes, références produits, marques et termes métier.
- Corrige orthographe, grammaire et ponctuation.
- Fluidifie les phrases et rends le texte plus professionnel, naturel et concis, y compris lorsque le texte est déjà grammaticalement correct.
- Réorganise légèrement une phrase si cela améliore la clarté, sans changer le sens ni transformer la note en résumé.
- Conserve le niveau de détail du texte source.
Réponds uniquement par le texte final, sans introduction, commentaire ni markdown.`;

const PROOFREAD_OPTIONS = {
  userOnly: true,
  reasoningEffort: 'low',
  includeReasoning: false
};

function proofreadMaxTokens(input) {
  const chars = String(input || '').length;
  return Math.min(700, Math.max(320, Math.ceil(chars / 3.5) + 80));
}

function proofreadRetryTokens(input) {
  return Math.min(900, Math.max(520, proofreadMaxTokens(input) + 220));
}

async function handlePing(env, origin) {
  const workersReady = hasWorkersAI(env);
  const groqReady = Boolean(env && env.GROQ_API_KEY);

  if (!workersReady && !groqReady) {
    return json({
      ok: false,
      error: 'Aucun moteur IA configuré : binding Workers AI `AI` absent et secret GROQ_API_KEY absent.'
    }, 500, origin);
  }

  const primaryProvider = workersReady ? 'cloudflare-workers-ai' : 'groq';
  const primaryModel = workersReady ? workersAIModel(env) : groqModel(env);

  return json({
    ok: true,
    provider: primaryProvider,
    model: primaryModel,
    workersAiBinding: workersReady,
    fallback: workersReady && groqReady
      ? { provider: 'groq', model: groqModel(env) }
      : null
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

      if (mode === 'proofread') {
        const raw = String(body.proofreadText || '').trim().slice(0, 12000);
        const label = String(body.proofreadLabel || 'note terrain').trim().slice(0, 120);
        const fallback = String(body.message || '').trim().slice(0, 12000);
        const source = raw || fallback;
        if (!source) return json({ error: 'Message vide.' }, 400, origin);
        const user = raw ? `Champ : ${label}.\nTEXTE :\n${raw}` : fallback;

        let result = await callAI(env, PROOFREAD_SYSTEM, user, proofreadMaxTokens(source), PROOFREAD_OPTIONS);
        if (!result.text) {
          result = await callAI(env, PROOFREAD_SYSTEM, user, proofreadRetryTokens(source), PROOFREAD_OPTIONS);
        }
        if (!result.text) {
          throw new Error('La correction IA n’a pas produit de texte final. Réessaie dans quelques secondes.');
        }

        return json({
          text: result.text,
          reply: result.text,
          answer: result.text,
          message: result.text,
          actions: [],
          model: result.model,
          provider: result.provider,
          fallbackFrom: result.fallbackFrom || null,
          mode: 'proofread'
        }, 200, origin);
      }

      if (mode === 'parse_stores') {
        const user = String(body.message || '').slice(0, 18000);
        const result = await callAI(env, STORE_PARSE_SYSTEM, user, 1600);
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
          provider: result.provider,
          fallbackFrom: result.fallbackFrom || null
        }, 200, origin);
      }

      const message = String(body.message || '').trim().slice(0, 12000);
      if (!message) return json({ error: 'Message vide.' }, 400, origin);

      const context = compactContext(body.context || {});
      const user = `QUESTION UTILISATEUR:\n${message}\n\nCONTEXTE CHEF SECTEUR (JSON):\n${JSON.stringify(context)}`;
      const result = await callAI(env, ASSISTANT_SYSTEM, user, 1000);
      if (!result.text) throw new Error('Réponse IA vide.');

      return json({
        text: result.text,
        reply: result.text,
        answer: result.text,
        message: result.text,
        actions: [],
        model: result.model,
        provider: result.provider,
        fallbackFrom: result.fallbackFrom || null
      }, 200, origin);
    } catch (err) {
      return json({ error: err && err.message ? err.message : String(err) }, 500, origin);
    }
  }
};