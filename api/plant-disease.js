// No external packages required! Bypassing Vercel's broken cache completely.

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

  if (rateLimitMap.size > 1000) {
    for (const [k, v] of rateLimitMap.entries()) {
      const active = v.filter(t => now - t < RATE_LIMIT_WINDOW);
      if (active.length === 0) rateLimitMap.delete(k);
      else rateLimitMap.set(k, active);
    }
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image was provided.' });
    }

    let cleanBase64 = imageBase64;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }

    const imageSizeInBytes = Buffer.byteLength(cleanBase64, 'base64');
    if (imageSizeInBytes > 4 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large. Maximum size is 4MB.' });
    }

    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const finalMimeType = mimeType || 'image/jpeg';
    if (!validMimeTypes.includes(finalMimeType)) {
      return res.status(400).json({ error: 'Invalid image format.' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return res.status(500).json({ error: 'AI service not configured.' });
    }

    const prompt = `You are an expert agricultural plant pathologist with 30 years of field experience across Indian farms.
    Analyze this plant image thoroughly. Be specific and practical.
    Return ONLY raw HTML in exactly this format, no markdown formatting blocks, no backticks:

    <b>🌿 Plant:</b> [Exact plant name + local Indian name if known]<br><br>
    <b>🦠 Disease:</b> [Disease name or "No disease detected"]<br><br>
    <b>📈 Confidence:</b> [X%]<br><br>
    <b>📍 Affected parts:</b> [leaves/stem/root/fruit etc]<br><br>
    <b>🔬 Symptoms:</b> [List 2-3 key visible symptoms]<br><br>
    <b>💡 Immediate Action:</b> [1-2 practical, safe steps for the farmer]`;

    // ─────────────────────────────────────────────────────────────────
    // DIRECT FETCH API CALL (BYPASSING THE GOOGLE SDK ENTIRELY)
    // ─────────────────────────────────────────────────────────────────
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: finalMimeType, data: cleanBase64 } }
        ]
      }]
    };

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await googleResponse.json();

    // If Google still throws an error, catch it directly
    if (!googleResponse.ok) {
      console.error('Direct Google API Error:', data);
      throw new Error(data.error?.message || 'Google API refused the connection.');
    }

    // Extract the text
    const responseText = data.candidates[0].content.parts[0].text;
    const cleanResponse = responseText.replace(/```html/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ answer: cleanResponse });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ error: `AI analysis failed: ${error.message}` });
  }
};
