const ALLOWED_ORIGIN = "https://rednewt69.github.io";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

function systemPrompt(mode) {
  if (mode === "parse_stores") {
    return `Tu transformes une liste de magasins en JSON strict. Réponds uniquement avec {"stores":[...]}. Chaque magasin peut contenir enseigne, ville, adresse, codePostal, dept, lat, lon, freq, priority et products. N'invente aucune information absente.`;
  }
  return `Tu es l'assistant de Chef Secteur SAMSUNG. Réponds en français, de façon concise et opérationnelle. Utilise uniquement le contexte fourni. Réponds en JSON strict avec {"text":"...","actions":[]}. Les actions autorisées sont set_target, regenerate_week, regenerate_day, overnight_mode, filter_product, exclude_store, include_store et lock_store.`;
}

function parseModelContent(content, mode) {
  try {
    return JSON.parse(content);
  } catch {
    return mode === "parse_stores" ? { stores: [], error: "Réponse Groq non structurée" } : { text: content, actions: [] };
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (origin !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "Origine non autorisée" }, 403, ALLOWED_ORIGIN);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Méthode non autorisée" }, 405, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: "Corps JSON invalide" }, 400, origin);
    }

    if (!env.GROQ_API_KEY) {
      return json({ ok: false, error: "Secret GROQ_API_KEY non configuré" }, 500, origin);
    }

    const model = env.GROQ_MODEL || DEFAULT_MODEL;
    if (payload.mode === "ping") {
      return json({ ok: true, provider: "groq", model }, 200, origin);
    }

    const mode = payload.mode === "parse_stores" ? "parse_stores" : "assistant";
    const userContent = JSON.stringify({ message: payload.message || "", context: payload.context || {} });
    const groqResponse = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(mode) },
          { role: "user", content: userContent },
        ],
      }),
    });

    const groqBody = await groqResponse.json().catch(() => ({}));
    if (!groqResponse.ok) {
      const message = groqBody?.error?.message || `Erreur Groq HTTP ${groqResponse.status}`;
      return json({ ok: false, error: message }, 502, origin);
    }

    const content = groqBody?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ ok: false, error: "Réponse Groq vide" }, 502, origin);
    }
    return json({ ok: true, provider: "groq", model, ...parseModelContent(content, mode) }, 200, origin);
  },
};
