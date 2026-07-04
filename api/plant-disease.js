const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image was provided.' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Updated to stable production vision model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType || 'image/jpeg',
        }
      }
    ]);

    let responseText = result.response.text();
    responseText = responseText.replace(/```html/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ answer: responseText });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ error: 'Unable to detect plant disease. Please try another image.' });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};
