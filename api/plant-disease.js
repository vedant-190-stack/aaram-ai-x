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

    // CRITICAL FIX: Ensure the base64 string is perfectly clean.
    // If the frontend accidentally sent the 'data:image/jpeg;base64,' prefix, strip it here.
    let cleanBase64 = imageBase64;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }

    // Validate image size (max 4MB)
    const imageSizeInBytes = Buffer.byteLength(cleanBase64, 'base64');
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

    // Using gemini-1.5-flash as it is highly stable and fast for image analysis
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are an expert agricultural plant pathologist with 30 years of field experience across Indian farms.

    Analyze this plant image thoroughly. Be specific and practical.

    Return ONLY raw HTML in exactly this format, no markdown formatting blocks, no backticks:

    <b>🌿 Plant:</b> [Exact plant name + local Indian name if known]<br><br>
    <b>🦠 Disease:</b> [Disease name or "No disease detected"]<br><br>
    <b>📈 Confidence:</b> [X%]<br><br>
    <b>📍 Affected parts:</b> [leaves/stem/root/fruit etc]<br><br>
    <b>🔬 Symptoms:</b> [List 2-3 key visible symptoms]<br><br>
    <b>💡 Immediate Action:</b> [1-2 practical, safe steps for the farmer]`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: cleanBase64,
          mimeType: finalMimeType
        }
      }
    ]);

    const responseText = result.response.text();
    
    // Clean up any potential markdown backticks from the LLM's response
    const cleanResponse = responseText.replace(/```html/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ answer: cleanResponse });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ error: 'AI image analysis failed. Please try again or check server logs.' });
  }
};
