// Cloudflare Worker - passerelle IA sécurisée pour Store Runner
// Jobs de comptes rendus : Gemini prioritaire si configuré, puis Groq, puis Workers AI.
// Autres routes IA : comportement historique Workers AI + secours Groq inchangé.
// Aucune clé API ne doit être placée dans GitHub Pages ou dans le navigateur.
import { DurableObject } from 'cloudflare:workers';
import '../store-runner-report-renderer.js';

const REPORTS = globalThis.StoreRunnerReportRenderer;

const ALLOWED_ORIGINS = new Set([
  'https://rednewt69.github.io',
  'https://store-runner.fr',
  'https://www.store-runner.fr'
]);

const DEFAULT_WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

function cors(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Report-Capability',
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
      'Cache-Control': 'no-store',
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

// ---------------------------------------------------------------------------------
// V238 — taxonomie d'échec des fournisseurs IA.
//
// Jusqu'ici tout finissait en `Error` nue. « Réponse IA vide. » couvrait donc aussi bien
// « aucun moteur n'est configuré » que « les deux moteurs ont répondu 200 sans produire
// un seul caractère » : le terrain ne pouvait pas les distinguer, et le client ne pouvait
// pas décider si une seconde tentative avait un sens.
//
// Les diagnostics transportés sont volontairement non sensibles — fournisseur, modèle,
// finishReason, longueur du texte, repli utilisé, code interne. JAMAIS une note terrain,
// jamais le prompt, jamais la charge utile.
const AI_NO_PROVIDER = 'ai_no_provider';
const AI_PROVIDER_UNAVAILABLE = 'ai_provider_unavailable';
const AI_EMPTY_RESPONSE = 'ai_empty_response';

function aiError(code, message, diagnostics) {
  const err = new Error(message);
  err.code = code;
  err.diagnostics = diagnostics || {};
  return err;
}

function diagnosticsOf(result) {
  return {
    provider: (result && result.provider) || '',
    model: (result && result.model) || '',
    finishReason: (result && result.finishReason) || '',
    textLength: String((result && result.text) || '').length,
    fallbackUsed: Boolean(result && result.fallbackFrom)
  };
}

function asAiError(err, provider, model, previous) {
  if (err && err.code) return err;
  return aiError(AI_PROVIDER_UNAVAILABLE, err && err.message ? err.message : String(err), {
    provider,
    model,
    finishReason: '',
    textLength: 0,
    fallbackUsed: Boolean(previous)
  });
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

function geminiModel(env) {
  return String((env && env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL);
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

/* V238 — l'extraction s'arrêtait au PREMIER champ connu PRÉSENT, même vide.
   Une enveloppe parfaitement légitime comme {response:'', choices:[{message:{content:
   '<json>'}}]} était donc rapportée « vide » alors que le JSON attendait deux champs plus
   loin ; `{text:''}`, `{result:{response:''}}` et une `message.content` vide doublée d'un
   canal de raisonnement produisaient la même perte. On balaie maintenant toutes les formes
   connues et on retient la première qui porte réellement du texte. Un champ inconnu reste
   ignoré : on ne devine rien. */
function firstText(...values) {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function partsText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      if (part && Array.isArray(part.content)) return partsText(part.content);
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function choiceText(choice) {
  if (!choice || typeof choice !== 'object') return '';
  const message = choice.message && typeof choice.message === 'object' ? choice.message : null;
  const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : null;
  return firstText(
    message ? message.content : '',
    message ? partsText(message.content) : '',
    delta ? delta.content : '',
    choice.text,
    partsText(choice.content)
  );
}

function envelopeText(data) {
  if (typeof data === 'string') return data.trim();
  if (!data || typeof data !== 'object') return '';

  const direct = firstText(data.response, data.text, data.output_text, partsText(data.output));
  if (direct) return direct;

  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    const value = choiceText(choice);
    if (value) return value;
  }
  return '';
}

function extractWorkersAIText(data) {
  const own = envelopeText(data);
  if (own) return own;
  // Certaines enveloppes Workers AI emboîtent la charge utile sous `result`.
  if (data && typeof data === 'object' && data.result) return envelopeText(data.result);
  return '';
}

function envelopeFinishReason(data) {
  if (!data || typeof data !== 'object') return '';
  const choice = Array.isArray(data.choices) && data.choices[0] ? data.choices[0] : null;
  return String(
    data.finish_reason
    || data.finishReason
    || (choice && (choice.finish_reason || choice.finishReason))
    || (data.result && (data.result.finish_reason || data.result.finishReason))
    || ''
  );
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
    finishReason: envelopeFinishReason(data),
    model,
    provider: 'cloudflare-workers-ai'
  };
}

// Gemini is only used for durable report jobs. API credentials stay in the Worker,
// never in the PWA. An API error is reduced to a status code before it is persisted.
async function callGemini(env, system, user, maxTokens, options = {}) {
  if (!env || !env.GEMINI_API_KEY) throw new Error('Secret GEMINI_API_KEY absent du Worker Cloudflare.');
  const model = geminiModel(env);
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: maxTokens || 900,
      thinkingConfig: { thinkingLevel: 'low' },
      responseMimeType: 'application/json'
    }
  };
  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': env.GEMINI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: options.signal
    }
  );
  const data = await response.json().catch(() => ({}));
  // Do not propagate provider errors: they may contain note text or other secrets.
  if (!response.ok) throw new Error('Gemini HTTP ' + response.status);
  const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
  const parts = candidate && candidate.content && Array.isArray(candidate.content.parts) ? candidate.content.parts : [];
  const answerText = parts.map(part => part && typeof part.text === 'string' ? part.text : '').join('').trim();
  return {
    text: answerText,
    finishReason: candidate ? String(candidate.finishReason || '') : '',
    model,
    provider: 'gemini'
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
    body: JSON.stringify(payload),
    signal: options.signal
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

/* V238 — `callAI` ne rend plus jamais un objet sans texte au handler.
   Elle rendait `{...fallback}` sans regarder `fallback.text` : quand Workers AI ET Groq
   répondaient 200 sans un seul caractère, le handler héritait d'un objet vide et le
   traduisait par un « Réponse IA vide. » indistinct. Les quatre situations sont désormais
   séparées : aucun moteur configuré, moteur injoignable, moteur muet, sortie tronquée
   (celle-ci n'est pas une erreur — elle voyage sur un 200 avec `truncated`).
   `options.allowEmpty` n'est conservé que pour la relecture, qui gère elle-même son
   second essai avec plus de marge. */
async function callAI(env, system, user, maxTokens, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  let failure = null;
  let emptyResult = null;

  if (hasWorkersAI(env)) {
    try {
      const result = await callWorkersAI(env, system, user, maxTokens, options);
      if (result.text) return { ...result, fallbackFrom: null };
      emptyResult = { ...result, fallbackFrom: null };
      failure = aiError(AI_EMPTY_RESPONSE, 'Le moteur IA n’a produit aucun texte.', diagnosticsOf(emptyResult));
    } catch (err) {
      failure = asAiError(err, 'cloudflare-workers-ai', workersAIModel(env));
    }
  }

  if (env && env.GROQ_API_KEY) {
    // Journal de diagnostic : uniquement le code interne, jamais le message d'un moteur
    // ni la moindre part de la requête. Un fallback Groq reste explicite dans les logs.
    if (failure) console.warn(`Workers AI indisponible, fallback Groq: ${failure.code}`);
    let fallback;
    try {
      fallback = await callGroq(env, system, user, maxTokens, options);
    } catch (err) {
      throw asAiError(err, 'groq', groqModel(env), failure);
    }
    const shaped = { ...fallback, fallbackFrom: failure ? 'cloudflare-workers-ai' : null };
    if (shaped.text) return shaped;
    emptyResult = shaped;
    failure = aiError(AI_EMPTY_RESPONSE, 'Le moteur IA n’a produit aucun texte.', {
      ...diagnosticsOf(shaped),
      fallbackUsed: Boolean(shaped.fallbackFrom)
    });
  }

  if (!failure) {
    throw aiError(
      AI_NO_PROVIDER,
      'Aucun moteur IA configuré : ajoute le binding Workers AI `AI` ou le secret GROQ_API_KEY.',
      {}
    );
  }
  if (allowEmpty && emptyResult) return emptyResult;
  throw failure;
}

/* V238 — une panne IA sort classée. `callAIGateway` ne conserve que les 180 premiers
   caractères du corps : le code interne est donc écrit EN TÊTE pour survivre toujours à
   cette troncature, quel que soit le message. Aucun diagnostic n'expose de note terrain. */
function aiFailure(err, origin) {
  const code = err && err.code ? err.code : '';
  const diagnostics = (err && err.diagnostics) || {};
  const message = err && err.message ? err.message : String(err);

  if (code === AI_EMPTY_RESPONSE) {
    return json({
      code,
      error: message,
      attempts: Number(diagnostics.attempts) || 1,
      provider: diagnostics.provider || '',
      model: diagnostics.model || '',
      finishReason: diagnostics.finishReason || '',
      textLength: 0,
      fallbackUsed: Boolean(diagnostics.fallbackUsed)
    }, 502, origin);
  }
  if (code === AI_PROVIDER_UNAVAILABLE) {
    return json({
      code,
      error: message,
      provider: diagnostics.provider || '',
      model: diagnostics.model || '',
      fallbackUsed: Boolean(diagnostics.fallbackUsed)
    }, 502, origin);
  }
  if (code) return json({ code, error: message }, 500, origin);
  return json({ error: message }, 500, origin);
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
  // La relecture gère elle-même son second essai avec plus de marge : `callAI` doit donc
  // continuer à lui rendre un résultat vide au lieu de lever. C'est la seule exception.
  allowEmpty: true,
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

// V232 — route dédiée au compte rendu de visite.
//
// Cette requête passait par la branche `assistant`, avec trois effets cumulés qui la
// rendaient systématiquement inexploitable :
//   1. ASSISTANT_SYSTEM décrit un assistant de planning qui doit répondre « brièvement » ;
//      le message, lui, exige un objet JSON nu. Le modèle ajoutait de la prose.
//   2. le plafond de sortie était 1000 tokens, alors qu'un compte rendu réellement rempli
//      pèse ~970 tokens pour BRUN — moins de 4 % de marge — et dépasse 1000 tokens pour
//      BLANC, plus long de deux rubriques.
//   3. `max_completion_tokens` couvre la réponse ET le raisonnement, et le raisonnement
//      n'était coupé que pour la relecture. Sur le repli gpt-oss il consommait donc une
//      part du budget avant le premier caractère de JSON : la marge de BRUN disparaissait
//      et la troncature devenait certaine sur les deux familles.
// Le schéma étant plat, une sortie coupée ne contient plus aucune accolade fermante : le
// client ne pouvait que lever « JSON de compte rendu invalide ».
//
// La route ci-dessous corrige le contrat, et rien d'autre : CORS, origines autorisées et
// authentification sont inchangés.
const VISIT_REPORT_SYSTEM = `Tu structures des notes de visite terrain en JSON.
Règles impératives :
- Réponds UNIQUEMENT par un objet JSON valide, complet, refermé. Aucun markdown, aucun préambule, aucun commentaire.
- N'invente aucune information absente des notes fournies.
- Respecte exactement le schéma demandé dans le message, y compris le nom des champs.
- Pour toute donnée absente : chaîne vide "" ou tableau vide [].
- Reste concis pour que la réponse tienne entièrement dans la limite de tokens.`;

// Un compte rendu rempli mesure ~3 100 caractères, soit ~980 tokens en français. La marge
// couvre la famille BLANC, plus longue de deux rubriques, et la réponse de réparation.
const VISIT_REPORT_MAX_TOKENS = 2600;

// Le raisonnement est facturé sur le même budget que la réponse : sur gpt-oss il doit être
// coupé, sinon il consomme les tokens destinés au JSON.
const VISIT_REPORT_OPTIONS = {
  userOnly: false,
  reasoningEffort: 'low',
  includeReasoning: false
};

// V238 — un compte rendu revenu VIDE est le seul cas qui mérite une seconde tentative.
//
// Mesures reproduites par tests/visit-report-empty-retry-v238.test.cjs :
//   - le prompt d'ENTRÉE BLANC ne dépasse celui de BRUN que de 37 caractères, soit 0,4 % :
//     la longueur d'entrée n'est donc pas la cause de l'écart constaté sur le terrain ;
//   - la SORTIE attendue, elle, est 17,2 % plus longue — BLANC porte quatre univers
//     produits (lavage, froid, cuisson, entretien des sols) là où BRUN en porte deux
//     (merchandising, audio) : 16 rubriques contre 14 ;
//   - à 2600 tokens, la marge sur le texte visible reste de 2,28x pour BLANC contre 2,68x
//     pour BRUN. Le plafond n'est donc PAS le facteur limitant du texte visible et n'est
//     pas relevé ici. Ce qui rétrécit, c'est la réserve laissée au raisonnement, facturé
//     sur le même plafond : 1462 tokens pour BLANC contre 1629 pour BRUN.
//
// Le second essai ne rejoue donc pas la requête à l'identique — ce serait repartir dans le
// même mur. Il resserre le contrat en une seule tournée utilisateur, la forme déjà retenue
// pour la relecture. Mêmes données source, même schéma attendu, même température basse,
// aucune invention supplémentaire autorisée, aucun token de plus.
const VISIT_REPORT_RETRY_OPTIONS = {
  userOnly: true,
  reasoningEffort: 'low',
  includeReasoning: false
};

// Plafond dur. Deux tentatives logiques pour un cas vide, jamais trois, jamais de boucle.
const VISIT_REPORT_MAX_ATTEMPTS = 2;

// V278 — one persisted server job per immutable source version and explicit generation.
// A Durable Object alarm, rather than an HTTP request or waitUntil, owns the inference.
const REPORT_JOB_PROTOCOL = 1;
const REPORT_JOB_TIMEOUT_MS = 90000;
const REPORT_JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const REPORT_JOB_PATH = '/api/ai/report-jobs';
const JOB_TYPES = new Set(['brun', 'blanc', 'cuisiniste', 'buying-groups']);

function jobsReady(env) {
  return Boolean(env && env.REPORT_JOBS && typeof env.REPORT_JOBS.idFromName === 'function'
    && typeof env.REPORT_JOBS.get === 'function');
}

function jobError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function sha256(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
}

async function prepareJob(body) {
  if (!body || body.protocolVersion !== REPORT_JOB_PROTOCOL) throw jobError('report_protocol', 'Protocole de compte rendu incompatible.');
  const source = body.source;
  if (!exactKeys(source, ['version', 'visitId', 'storeId', 'completedDate', 'store', 'reports']) || source.version !== 1
    || !exactKeys(source.store, ['enseigne', 'ville', 'channel'])
    || !Array.isArray(source.reports) || !source.reports.length || source.reports.length > 4) {
    throw jobError('report_source', 'Source de compte rendu invalide.');
  }
  for (const key of ['visitId', 'storeId']) {
    if (typeof body[key] !== 'string' || !body[key] || body[key].length > 160 || source[key] !== body[key]) {
      throw jobError('report_identity', 'Identité de visite invalide.');
    }
  }
  if (!validDate(body.completedDate) || source.completedDate !== body.completedDate
    || !Number.isSafeInteger(body.generation) || body.generation < 0 || body.generation > 1000000) {
    throw jobError('report_identity', 'Date ou génération de visite invalide.');
  }
  for (const key of ['enseigne', 'ville', 'channel']) {
    if (typeof source.store[key] !== 'string' || source.store[key].length > 200) throw jobError('report_source', 'Magasin source invalide.');
  }
  const types = new Set();
  let entries = 0;
  for (const report of source.reports) {
    if (!exactKeys(report, ['reportType', 'entries']) || !JOB_TYPES.has(report.reportType) || types.has(report.reportType)
      || !Array.isArray(report.entries) || report.entries.length > 96) throw jobError('report_source', 'Rubriques sources invalides.');
    types.add(report.reportType);
    for (const entry of report.entries) {
      if (!exactKeys(entry, ['source', 'family', 'text']) || typeof entry.source !== 'string' || !entry.source || entry.source.length > 240
        || typeof entry.family !== 'string' || entry.family.length > 40 || typeof entry.text !== 'string' || entry.text.length > 20000) {
        throw jobError('report_source', 'Note source invalide.');
      }
      entries += 1;
    }
  }
  if (entries > 192 || REPORTS.canonicalJSON(source).length > 64000) throw jobError('report_source_too_large', 'Notes trop volumineuses pour cette analyse.', 413);
  if (typeof body.accessToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.accessToken)) throw jobError('report_capability', 'Accès au compte rendu invalide.');
  const sourceSignature = await REPORTS.sourceSignature(source);
  if (body.sourceSignature !== sourceSignature) throw jobError('report_source_signature', 'La signature ne correspond pas aux notes.');
  const capabilityHash = await sha256(body.accessToken);
  const identity = REPORTS.canonicalJSON({ protocolVersion: REPORT_JOB_PROTOCOL, visitId: body.visitId, storeId: body.storeId,
    completedDate: body.completedDate, sourceSignature, generation: body.generation });
  const jobId = await sha256(identity);
  return { protocolVersion: REPORT_JOB_PROTOCOL, jobId, visitId: body.visitId, storeId: body.storeId,
    completedDate: body.completedDate, sourceSignature, generation: body.generation, capabilityHash,
    promptVersion: REPORTS.PROMPT_VERSION, source };
}

function publicJob(job) {
  const { protocolVersion, jobId, visitId, storeId, completedDate, sourceSignature, generation,
    promptVersion, status, createdAt, updatedAt, expiresAt, result, error, provider, model } = job;
  return { protocolVersion, jobId, visitId, storeId, completedDate, sourceSignature, generation,
    promptVersion, status, createdAt, updatedAt, expiresAt,
    ...(status === 'done' ? { result, provider, model } : {}), ...(error ? { error } : {}) };
}

function jobFailure(err) {
  const code = err && err.code ? String(err.code) : 'report_invalid_result';
  // Provider messages can echo notes or credentials. Persist only controlled diagnostics.
  const messages = {
    ai_no_provider: 'Aucun moteur IA disponible.', ai_provider_unavailable: 'Le moteur IA est indisponible.',
    ai_empty_response: 'Le moteur IA a renvoyé une réponse vide.', report_provider_timeout: 'Le délai du moteur IA est dépassé.',
    report_truncated: 'Le moteur IA a renvoyé un JSON tronqué.', report_processing_uncertain: 'Traitement interrompu : une régénération explicite est nécessaire.',
    report_invalid_result: 'La réponse IA ne respecte pas les sources ou le format attendu.'
  };
  return { code: Object.hasOwn(messages, code) ? code : 'report_invalid_result', message: messages[code] || messages.report_invalid_result };
}

async function oneJobInference(env, source) {
  const controller = new AbortController();
  let timeout;
  try {
    const expired = new Promise((resolve, reject) => {
      timeout = setTimeout(() => { controller.abort(); reject(jobError('report_provider_timeout', 'Délai IA dépassé.')); }, REPORT_JOB_TIMEOUT_MS);
    });
    const options = { ...VISIT_REPORT_OPTIONS, signal: controller.signal };
    const message = REPORTS.buildPrompt(source);
    let inference;
    // Choose exactly one provider for the immutable job. No paid fallback, empty
    // retry or JSON repair; the failed job remains readable and source notes intact.
    if (env && env.GEMINI_API_KEY) inference = callGemini(env, VISIT_REPORT_SYSTEM, message, VISIT_REPORT_MAX_TOKENS, options);
    else if (env && env.GROQ_API_KEY) inference = callGroq(env, VISIT_REPORT_SYSTEM, message, VISIT_REPORT_MAX_TOKENS, options);
    else if (hasWorkersAI(env)) inference = callWorkersAI(env, VISIT_REPORT_SYSTEM, message, VISIT_REPORT_MAX_TOKENS, options);
    else throw jobError('ai_no_provider', 'Aucun moteur IA disponible.');
    let answer;
    try { answer = await Promise.race([inference, expired]); }
    catch (err) { throw err && err.code ? err : jobError('ai_provider_unavailable', 'Moteur IA indisponible.'); }
    if (!answer.text) throw jobError('ai_empty_response', 'Réponse IA vide.');
    if (['length', 'max_tokens'].includes(String(answer.finishReason || '').toLowerCase())) throw jobError('report_truncated', 'JSON tronqué.');
    return { answer, result: REPORTS.validate(answer.text, source) };
  } finally {
    clearTimeout(timeout);
  }
}

// Each object has one source/version. Storage and alarm scheduling share a transaction.
// Alarm delivery is at-least-once. A processing record is NEVER inferred again: after a
// crash we cannot tell whether an external provider already billed its first invocation.
export class VisitReportJob extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.storage = ctx.storage; }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/create') {
      const candidate = await request.json();
      let created = false;
      const job = await this.storage.transaction(async () => {
        const prior = await this.storage.get('job');
        if (prior) return prior;
        const now = Date.now();
        const value = { ...candidate, status: 'pending', createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(), expiresAt: new Date(now + REPORT_JOB_RETENTION_MS).toISOString() };
        await this.storage.put('job', value);
        await this.storage.setAlarm(now + 1);
        created = true;
        return value;
      });
      if (job.capabilityHash !== candidate.capabilityHash) return json({ error: { code: 'report_capability', message: 'Accès refusé.' } }, 403);
      const visible = Date.now() >= Date.parse(job.expiresAt) ? this.expired(job) : job;
      if (visible !== job) await this.storage.put('job', visible);
      return json(publicJob(visible), created ? 202 : 200);
    }
    if (request.method === 'GET') {
      const job = await this.storage.get('job');
      if (!job) return json({ error: { code: 'report_not_found', message: 'Compte rendu introuvable.' } }, 404);
      const token = request.headers.get('X-Report-Capability') || '';
      if (!/^[a-f0-9]{64}$/.test(token) || await sha256(token) !== job.capabilityHash) return json({ error: { code: 'report_capability', message: 'Accès refusé.' } }, 403);
      if (Date.now() >= Date.parse(job.expiresAt)) {
        const expired = this.expired(job);
        await this.storage.put('job', expired);
        return json(publicJob(expired));
      }
      return json(publicJob(job));
    }
    return json({ error: { code: 'report_method', message: 'Méthode non autorisée.' } }, 405);
  }

  expired(job) {
    const { source, result, provider, model, ...tombstone } = job;
    return { ...tombstone, status: 'failed', updatedAt: new Date().toISOString(),
      error: { code: 'report_job_expired', message: 'Résultat serveur expiré. Les notes locales restent conservées.' } };
  }

  async alarm() {
    let job = await this.storage.get('job');
    if (!job) return;
    if (Date.now() >= Date.parse(job.expiresAt)) {
      await this.storage.put('job', this.expired(job));
      return;
    }
    if (job.status === 'done' || job.status === 'failed') return;
    if (job.status === 'processing') {
      job = { ...job, status: 'failed', updatedAt: new Date().toISOString(), error: jobFailure({ code: 'report_processing_uncertain' }) };
      await this.storage.put('job', job);
      await this.storage.setAlarm(Date.parse(job.expiresAt));
      return;
    }
    job = { ...job, status: 'processing', updatedAt: new Date().toISOString() };
    await this.storage.transaction(async () => {
      await this.storage.put('job', job);
      await this.storage.setAlarm(Date.now() + REPORT_JOB_TIMEOUT_MS + 1000);
    });
    try {
      const { answer, result } = await oneJobInference(this.env, job.source);
      job = { ...job, status: 'done', result, provider: answer.provider, model: answer.model, updatedAt: new Date().toISOString() };
    } catch (err) {
      job = { ...job, status: 'failed', error: jobFailure(err), updatedAt: new Date().toISOString() };
    }
    await this.storage.transaction(async () => {
      await this.storage.put('job', job);
      await this.storage.setAlarm(Date.parse(job.expiresAt));
    });
  }
}

async function reportJobRoute(request, env, origin, jobId) {
  if (!jobsReady(env)) return json({ error: { code: 'report_jobs_unavailable', message: 'Le traitement serveur est indisponible. Les notes restent enregistrées.' } }, 503, origin);
  try {
    let response;
    if (request.method === 'POST' && !jobId) {
      // Enforce a byte limit before JSON parsing; do not truncate an immutable source.
      const reader = request.body && request.body.getReader(), chunks = [];
      let length = 0;
      if (reader) for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 160000) { await reader.cancel(); throw jobError('report_source_too_large', 'Notes trop volumineuses.', 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw jobError('report_source', 'JSON source invalide.'); }
      const job = await prepareJob(body);
      const stub = env.REPORT_JOBS.get(env.REPORT_JOBS.idFromName(job.jobId));
      response = await stub.fetch(new Request('https://report-job/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) }));
    } else if (request.method === 'GET' && /^[a-f0-9]{64}$/.test(jobId || '')) {
      const stub = env.REPORT_JOBS.get(env.REPORT_JOBS.idFromName(jobId));
      response = await stub.fetch(new Request('https://report-job/status', { headers: { 'X-Report-Capability': request.headers.get('X-Report-Capability') || '' } }));
    } else return json({ error: { code: 'report_method', message: 'Méthode ou identifiant invalide.' } }, 405, origin);
    return json(await response.json(), response.status, origin);
  } catch (err) {
    return json({ error: { code: err.code || 'report_job_storage', message: err.status ? err.message : 'Impossible de persister le traitement serveur.' } }, err.status || 503, origin);
  }
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
    reportJobs: { protocolVersion: REPORT_JOB_PROTOCOL, ready: jobsReady(env) },
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

    if (url.pathname === REPORT_JOB_PATH || url.pathname.startsWith(REPORT_JOB_PATH + '/')) {
      if ((origin && !ALLOWED_ORIGINS.has(origin)) || (request.method === 'POST' && !origin)) {
        return json({ error: 'Origine non autorisée.' }, 403, origin);
      }
      const jobId = url.pathname === REPORT_JOB_PATH ? '' : url.pathname.slice(REPORT_JOB_PATH.length + 1);
      return reportJobRoute(request, env, origin, jobId);
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

    // Les routes IA consommatrices ne sont utilisables que depuis Store Runner.
    // Un POST direct sans Origin est refusé avant tout appel Workers AI ou Groq.
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
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

      if (mode === 'visit_report') {
        const message = String(body.message || '').trim().slice(0, 24000);
        if (!message) return json({ error: 'Message vide.' }, 400, origin);

        // Le client coupe le second essai sur son appel de RÉPARATION V232 : une réponse
        // déjà revenue puis mal formée relève de la réparation, pas du cas vide, et le
        // plafond global d'appels fournisseur reste ainsi borné.
        const maxAttempts = body.retryEmpty === false ? 1 : VISIT_REPORT_MAX_ATTEMPTS;

        let result = null;
        let attempts = 0;
        for (;;) {
          attempts += 1;
          try {
            result = await callAI(
              env,
              VISIT_REPORT_SYSTEM,
              message,
              VISIT_REPORT_MAX_TOKENS,
              attempts === 1 ? VISIT_REPORT_OPTIONS : VISIT_REPORT_RETRY_OPTIONS
            );
            break;
          } catch (err) {
            // Seule une réponse RÉELLEMENT vide se rejoue. Une panne de transport, un
            // moteur injoignable ou l'absence de moteur repartiraient dans le même mur.
            if (!err || err.code !== AI_EMPTY_RESPONSE || attempts >= maxAttempts) {
              if (err && err.diagnostics) err.diagnostics.attempts = attempts;
              throw err;
            }
          }
        }

        // finishReason est renvoyé au client : une réponse coupée doit être reconnaissable
        // comme telle, jamais confondue avec une réponse absurde.
        return json({
          text: result.text,
          model: result.model,
          provider: result.provider,
          fallbackFrom: result.fallbackFrom || null,
          finishReason: result.finishReason || '',
          truncated: String(result.finishReason || '').toLowerCase() === 'length',
          attempts,
          retried: attempts > 1,
          mode: 'visit_report'
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
      // `callAI` classe désormais elle-même un moteur muet : plus aucun « Réponse IA
      // vide. » indistinct ne peut sortir d'ici.
      const result = await callAI(env, ASSISTANT_SYSTEM, user, 1000);

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
      return aiFailure(err, origin);
    }
  }
};
