import { GoogleGenerativeAI } from '@google/generative-ai';

// Increase the body size limit so users can upload high-res plant photos
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb', 
    },
  },
};

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image was provided.' });
    }

    // Initialize Gemini using your Vercel Environment Variable
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an agricultural plant pathologist.
Analyze the provided image and identify the plant and any potential diseases.
Return ONLY raw HTML. Do NOT wrap it in markdown block quotes like \`\`\`html.

Format the output strictly like this:

<b>🌿 Plant:</b> [Plant Name]<br><br>
<b>🦠 Disease:</b> [Disease Name]<br><br>
<b>📈 Confidence:</b> [Confidence %]<br><br>

<b>Symptoms:</b><br>
[Brief description of visual symptoms]<br><br>

<b>Cause:</b><br>
[Underlying cause (e.g., fungal, environmental)]<br><br>

<b>🌱 Organic Treatment:</b><br>
[Organic solutions]<br><br>

<b>🧪 Chemical Treatment:</b><br>
[Chemical solutions/fungicides]<br><br>

<b>✅ Prevention:</b><br>
[Prevention tips like watering habits]

If the plant appears completely healthy, return:
<b>🌿 Plant:</b> [Plant Name]<br><br>
<b>✅ Status:</b> Healthy Plant. Keep up the good work!`;

    const imageParts = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType || 'image/jpeg',
        },
      },
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    let responseText = result.response.text();

    // Clean up any accidental markdown formatting from Gemini
    responseText = responseText.replace(/```html/g, '').replace(/```/g, '').trim();

    return res.status(200).json({ answer: responseText });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({ error: 'Unable to detect plant disease. Please try another image.' });
  }
}
