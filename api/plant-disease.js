const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Constants ────────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS  = 60_000;   // 1 minute
const RATE_LIMIT_MAX        = 10;        // requests per window per IP
const RATE_LIMIT_MAP_MAX    = 1_000;     // prune map above this size
const MAX_IMAGE_BYTES       = 4 * 1024 * 1024; // 4 MB
const API_TIMEOUT_MS        = 20_000;    // 20 s per model attempt

const VALID_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// Correct Gemini model names (gemini-3.5-* does not exist)
const PRIMARY_MODEL  = 'gemini-1.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-pro';

// ─── Rate limiter ─────────────────────────────────────────────────────────────
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now  = Date.now();
  const prev = rateLimitMap.get(ip) ?? [];
  const recent = prev.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) return false;

  recent.push(now);
  rateLimitMap.set(ip, recent);

  // Periodic cleanup to prevent unbounded memory growth
  if (rateLimitMap.size > RATE_LIMIT_MAP_MAX) {
    for (const [k, timestamps] of rateLimitMap) {
      const active = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
      active.length === 0 ? rateLimitMap.delete(k) : rateLimitMap.set(k, active);
    }
  }

  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Race an async call against a timeout.
 * @param {Promise} promise
 * @param {number}  ms
 * @param {string}  label  – used in the rejection message
 */
function withTimeout(promise, ms, label = 'Request') {
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timer]);
}

/** Strip data-URL prefix and return clean base64, or throw if clearly invalid. */
function cleanBase64(raw) {
  const b64 = raw.includes(',') ? raw.split(',')[1] : raw;
  if (!/^[A-Za-z0-9+/=]+$/.test(b64.slice(0, 64))) {
    throw Object.assign(new Error('Invalid base64 data.'), { status: 400 });
  }
  return b64;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
const ANALYSIS_PROMPT = `
You are an expert agricultural plant pathologist with 30 years of field
experience across Indian farms.

Analyse the supplied plant image carefully. Return ONLY raw HTML — no markdown,
no code fences, no surrounding text — in exactly this structure:

<b>🌿 Plant:</b> [Exact plant name + local Indian name if known]<br><br>
<b>🦠 Disease:</b> [Disease name or "No disease detected"]<br><br>
<b>📈 Confidence:</b> [X%]<br><br>
<b>📍 Affected parts:</b> [leaves / stem / root / fruit etc.]<br><br>
<b>🔬 Symptoms:</b> [2–3 key visible symptoms]<br><br>
<b>💡 Immediate Action:</b> [1–2 practical, safe steps a farmer can take today]
`.trim();

// ─── Core Gemini call ─────────────────────────────────────────────────────────
async function analyseImage(genAI, modelName, b64, mimeType) {
  const model  = genAI.getGenerativeModel({ model: modelName });
  const result = await withTimeout(
    model.generateContent([
      ANALYSIS_PROMPT,
      { inlineData: { data: b64, mimeType } },
    ]),
    API_TIMEOUT_MS,
    modelName,
  );
  return result.response.text();
}

// ─── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── 1. Validate inputs early (cheap, before rate-limit bookkeeping) ─────────
  const { imageBase64, mimeType } = req.body ?? {};

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'No image was provided.' });
  }

  let b64;
  try {
    b64 = cleanBase64(imageBase64);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const imageSizeBytes = Buffer.byteLength(b64, 'base64');
  if (imageSizeBytes > MAX_IMAGE_BYTES) {
    return res.status(400).json({
      error: `Image too large. Maximum is 4 MB; received ${(imageSizeBytes / 1024 / 1024).toFixed(2)} MB.`,
    });
  }

  const finalMimeType = mimeType || 'image/jpeg';
  if (!VALID_MIME_TYPES.has(finalMimeType)) {
    return res.status(400).json({
      error: `Unsupported image format "${finalMimeType}". Accepted: ${[...VALID_MIME_TYPES].join(', ')}.`,
    });
  }

  // ── 2. Rate limiting ────────────────────────────────────────────────────────
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
          || req.socket?.remoteAddress
          || 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a moment before trying again.',
    });
  }

  // ── 3. API key guard ────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
  if (!apiKey) {
    console.error('[plant-api] GEMINI_API_KEY is not configured');
    return res.status(500).json({ error: 'AI service is not configured. Please contact support.' });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // ── 4. Primary model, then fallback ────────────────────────────────────────
  let rawText;

  try {
    console.log(`[plant-api] Trying primary model: ${PRIMARY_MODEL}`);
    rawText = await analyseImage(genAI, PRIMARY_MODEL, b64, finalMimeType);
    console.log(`[plant-api] Primary model succeeded`);
  } catch (primaryErr) {
    console.warn(`[plant-api] Primary model failed (${primaryErr.message}). Trying fallback: ${FALLBACK_MODEL}`);

    try {
      rawText = await analyseImage(genAI, FALLBACK_MODEL, b64, finalMimeType);
      console.log(`[plant-api] Fallback model succeeded`);
    } catch (fallbackErr) {
      console.error('[plant-api] Both models failed.', {
        primary:  primaryErr.message,
        fallback: fallbackErr.message,
      });
      return res.status(500).json({
        error: 'Image analysis failed on all available models. Please try again shortly.',
      });
    }
  }

  // Strip any stray markdown fences the model may have included
  const answer = rawText.replace(/```html?/gi, '').replace(/```/g, '').trim();

  return res.status(200).json({ answer });
};
