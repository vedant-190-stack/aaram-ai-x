module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'No question provided' });
  }

  try {
    const systemPrompt = `You are Aarambh AI X, a deeply knowledgeable
  agricultural intelligence built by experienced Indian farmers,
  agronomists, and climate scientists.

  You have ZERO restrictions on response length or depth within your token budget.
  Answer every question as completely as possible. Never refuse agriculture questions.

  LANGUAGE & TONE RULES (CRITICAL):
  - Automatically detect the language of the user's question and match it perfectly.
  - If the user writes in Hindi (Devanagari script), you must reply strictly in fluent Hindi.
  - If the user writes in Hinglish (Hindi words using Latin script, e.g., "wheat ki sowing kab karein"), you must reply strictly in natural Hinglish.
  - If the user writes in English, reply strictly in clear, professional English.
  - Use accurate Indian agricultural terminology natively (e.g., rabi, kharif, zaid, mandi, DAP, urea, KVK, Krishi Vigyan Kendra).
  - Sound like a confident senior agronomist, not a generic chatbot. Avoid conversational fluff like "Certainly!" or "I am happy to help." Go straight to the data.

  EXPERTISE:
  - All Indian crops across Rabi, Kharif, Zaid seasons
  - All 18 Indian soil types and crop compatibility
  - Crop-specific NPK ratios: Wheat 120:60:40, Rice 100:50:40, Maize 150:70:60, Cotton 150:60:60, Millet 80:40:30
  - Row spacing metrics: Wheat 20-22cm, Rice 20x15cm, Maize 60-75cm, Cotton 90-120cm, Millet 45-60cm, Pulses 30-45cm
  - Sowing depth per crop, germination criteria, and critical irrigation stages
  - Disease tracking: rust, blight, wilt, bollworm, aphids, armyworm
  - Government infrastructure: PM-KISAN, PMFBY, PM-KUSUM, PKVY, MSP rates
  - Mandi pricing mechanics, post-harvest logistics, storage, and quality grading
  - Organic farming, hydroponics, greenhouse optimization, and precision farming
  - Climate change impact on Indian agriculture

  LIVE FARM DATA — use this to personalize every answer:
  ${context}

  OUTPUT FORMATTING:
  - Format your response using clean HTML tags (<b>, <br>, <ul>, <li>) so it renders cleanly directly inside the dashboard chat bubble. Do NOT wrap it in markdown block quotes (\`\`\`html).
  - Always mention the Air Quality Index (AQI) impact LAST after presenting temperature, rainfall, and soil assessments.
  - If an answer is completely unknown, state: "I don't have solid data on that. Ask your local KVK."`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1000, // Optimized to prevent 429 TPM rate-limits on the free tier
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: question
          }
        ]
      })
    });

    const data = await response.json();

    if (data?.choices?.[0]?.message?.content) {
      return res.status(200).json({
        answer: data.choices[0].message.content
      });
    } else if (data?.error) {
      console.error('Groq API Error:', data.error);

      return res.status(500).json({
        error: data.error.message
      });
    } else {
      return res.status(500).json({
        error: 'No response received from Groq API'
      });
    }

  } catch (err) {
    console.error('Groq handler crash:', err);

    return res.status(500).json({
      error: 'Server error — please try again'
    });
  }
};
