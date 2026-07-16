import { GoogleGenerativeAI } from '@google/generative-ai';

// ─── Constants ───────────────────────────────────────────────────────────────
const PRIMARY_MODEL     = 'gemini-3.5-flash';
const FALLBACK_MODEL    = 'gemini-3.1-flash-lite';
const RATE_LIMIT_WINDOW = 60_000;   // 1 minute
const RATE_LIMIT_MAX    = 10;       // requests per window per IP
const RATE_LIMIT_MAP_MAX = 1_000;
const MAX_IMAGE_BYTES   = 4 * 1024 * 1024;
const API_TIMEOUT_MS    = 20_000;   // 20s per model attempt
const VALID_MIME_TYPES  = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// ─── Rate limiter (in-memory, per IP) ────────────────────────────────────────
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now  = Date.now();
  const hits = (rateLimitMap.get(ip) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW);

  if (hits.length >= RATE_LIMIT_MAX) return false;

  hits.push(now);
  rateLimitMap.set(ip, hits);

  // Prune stale IPs to avoid unbounded memory growth
  if (rateLimitMap.size > RATE_LIMIT_MAP_MAX) {
    for (const [k, v] of rateLimitMap) {
      if (v.every(t => now - t >= RATE_LIMIT_WINDOW)) rateLimitMap.delete(k);
    }
  }

  return true;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────
const ANALYSIS_PROMPT = `You are an expert agricultural plant pathologist with 30 years of
field experience across Indian farms. Analyze this plant image thoroughly. Be specific and practical.

Return ONLY raw HTML in exactly this format — no markdown, no code fences:

<b>🌿 Plant:</b> [Exact plant name + local Indian name if known]<br><br>
<b>🦠 Disease:</b> [Disease name or "No disease detected"]<br><br>
<b>📈 Confidence:</b> [X%]<br><br>
<b>📍 Affected parts:</b> [leaves/stem/root/fruit etc]<br><br>
<b>🔬 Symptoms:</b><br>
[Detailed visual symptoms — color, texture, pattern, spread]<br><br>
<b>⚗️ Cause:</b><br>
[Pathogen name + scientific name + conditions that triggered it]<br><br>
<b>🚨 Severity:</b> [Mild / Moderate / Severe] — [brief reason]<br><br>
<b>🌱 Organic Treatment:</b><br>
• [Treatment 1 with dosage and timing]<br>
• [Treatment 2]<br>
• [Treatment 3 if applicable]<br><br>
<b>🧪 Chemical Treatment:</b><br>
• [Chemical name + dosage + frequency]<br>
• [Alternative chemical]<br><br>
<b>✅ Prevention:</b><br>
• [Tip 1]<br>
• [Tip 2]<br>
• [Tip 3]<br><br>
<b>📅 Expected recovery:</b> [Timeframe if treated properly]<br><br>
<b>⚠️ Watch out for:</b> [Secondary infections or complications]

If the plant is healthy, return:
<b>🌿 Plant:</b> [Name]<br><br>
<b>✅ Status:</b> Healthy — no disease detected.<br><br>
<b>💡 Tip:</b> [One practical tip to keep this plant healthy]

If no plant is visible, return:
<b>❌ Error:</b> No plant detected. Please upload a clear photo of a plant leaf, stem, or affected area.`;

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
    ?? req.socket?.remoteAddress
    ?? 'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  // Input validation
  const { imageBase64, mimeType } = req.body ?? {};

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided.' });
  }

  const cleanBase64   = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
  const finalMimeType = mimeType || 'image/jpeg';

  if (!VALID_MIME_TYPES.has(finalMimeType)) {
    return res.status(400).json({
      error: `Unsupported image format. Accepted: ${[...VALID_MIME_TYPES].join(', ')}`
    });
  }

  const imageSizeBytes = Buffer.byteLength(cleanBase64, 'base64');
  if (imageSizeBytes > MAX_IMAGE_BYTES) {
    return res.status(400).json({
      error: `Image too large (${(imageSizeBytes / 1024 / 1024).toFixed(2)} MB). Maximum is 4 MB.`
    });
  }

  // API key check
  const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
  if (!apiKey) {
    console.error('[plant-disease] GEMINI_API_KEY is not set');
    return res.status(500).json({ error: 'AI service is not configured. Contact support.' });
  }

  // Gemini call — tries PRIMARY_MODEL first, falls back to FALLBACK_MODEL
  try {
    const genAI   = new GoogleGenerativeAI(apiKey);
    const content = [
      ANALYSIS_PROMPT,
      { inlineData: { data: cleanBase64, mimeType: finalMimeType } }
    ];

    const callModel = (modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName });
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), API_TIMEOUT_MS)
      );
      return Promise.race([model.generateContent(content), timeout]);
    };

    let result;
    try {
      result = await callModel(PRIMARY_MODEL);
    } catch (primaryErr) {
      console.warn(`[plant-disease] Primary model (${PRIMARY_MODEL}) failed: ${primaryErr.message}. Trying fallback…`);
      result = await callModel(FALLBACK_MODEL); // throws if fallback also fails
    }

    // Strip any accidental markdown wrappers Gemini may add
    const answer = result.response.text()
      .replace(/^```html\s*/i, '')
      .replace(/```$/,         '')
      .trim();

    return res.status(200).json({ answer });

  } catch (err) {
    if (err.message === 'TIMEOUT') {
      return res.status(504).json({ error: 'Analysis timed out. Please try again.' });
    }

    console.error('[plant-disease] Gemini error:', err.message);
    return res.status(500).json({ error: `Analysis failed: ${err.message}` });
  }
}

// Allow up to 4 MB request bodies on Vercel
export const config = {
  api: { bodyParser: { sizeLimit: '4mb' } }
};
