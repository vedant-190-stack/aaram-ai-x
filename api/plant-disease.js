const { GoogleGenerativeAI } = require('@google/generative-ai');

// Simple in-memory rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_REQUESTS = 10; // 10 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const key = `${ip}`;

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, []);
  }

  const timestamps = rateLimitMap.get(key);
  const recentRequests = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= RATE_LIMIT_REQUESTS) {
    return false;
  }

  recentRequests.push(now);
  rateLimitMap.set(key, recentRequests);

  // Cleanup old entries
  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      const active = v.filter(t => now - t < RATE_LIMIT_WINDOW);
      if (active.length === 0) {
        rateLimitMap.delete(k);
      } else {
        rateLimitMap.set(k, active);
      }
    }
  }

  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get client IP for rate limiting
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

    // Rate limiting check
    if (!checkRateLimit(ip)) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.'
      });
    }

    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image was provided.' });
    }

    // Validate image size (max 4MB)
    const imageSizeInBytes = Buffer.byteLength(imageBase64, 'base64');
    const maxSizeInBytes = 4 * 1024 * 1024; // 4MB

    if (imageSizeInBytes > maxSizeInBytes) {
      return res.status(400).json({
        error: `Image too large. Maximum size is 4MB, received ${(imageSizeInBytes / (1024 * 1024)).toFixed(2)}MB`
      });
    }

    // Validate MIME type
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const finalMimeType = mimeType || 'image/jpeg';

    if (!validMimeTypes.includes(finalMimeType)) {
      return res.status(400).json({
        error: `Invalid image format. Supported formats: ${validMimeTypes.join(', ')}`
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;

    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return res.status(500).json({
        error: 'AI service not configured. Please contact support.'
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Reverted to the active, supported Gemini 2.5 Flash model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an expert agricultural plant pathologist
  with 30 years of field experience across Indian farms.

  Analyze this plant image thoroughly. Be specific and practical.

  Return ONLY raw HTML in exactly this format, no markdown:

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

  If the plant is completely healthy return:
  <b>🌿 Plant:</b> [Name]<br><br>
  <b>✅ Status:</b> Healthy — no disease detected.<br><br>
  <b>💡 Tip:</b> [One practical tip to keep this plant healthy]

  If the image is not a plant return:
  <b>❌ Error:</b> No plant detected. Please upload a clear photo
  of a plant leaf, stem, or affected area.`;

    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType: finalMimeType,
          }
        }
      ]);

      clearTimeout(timeoutId);

      let responseText = result.response.text();
      // Strip markdown formatting if Gemini includes it
      responseText = responseText.replace(/```html/g, '').replace(/```/g, '').trim();

      return res.status(200).json({ answer: responseText });
    } catch (timeoutError) {
      clearTimeout(timeoutId);
      if (timeoutError.name === 'AbortError') {
        return res.status(504).json({
          error: 'Request timeout. The AI service took too long to respond. Please try again.'
        });
      }
      throw timeoutError;
    }

  } catch (error) {
    console.error('Gemini API Error details:', error.message);

    // Sends the exact error string back to the UI so you can debug missing keys/quotas
    return res.status(500).json({
      error: `Server error: ${error.message || 'Check Vercel Runtime Logs'}`
    });
  }
};

// Ensures Vercel allows up to 4MB payloads for the base64 image string
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};
