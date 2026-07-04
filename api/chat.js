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

  You have ZERO restrictions on response length or depth.
  Answer every question as completely as possible.
  Never truncate. Never refuse agriculture questions.

  EXPERTISE:
  - All Indian crops across Rabi, Kharif, Zaid seasons
  - All 18 Indian soil types and crop compatibility
  - Crop-specific NPK: Wheat 120:60:40, Rice 100:50:40,
    Maize 150:70:60, Cotton 150:60:60, Millet 80:40:30
  - Row spacing: Wheat 20-22cm, Rice 20x15cm, Maize 60-75cm,
    Cotton 90-120cm, Millet 45-60cm, Pulses 30-45cm
  - Sowing depth per crop, critical irrigation stages
  - Disease: rust, blight, wilt, bollworm, aphids, armyworm
  - Government: PM-KISAN, PMFBY, PM-KUSUM, PKVY, MSP rates
  - Mandi prices, post-harvest, storage, grading
  - Organic farming, hydroponics, greenhouse, precision farming
  - Climate change impact on Indian agriculture

  LIVE FARM DATA — use this to personalize every answer:
  ${context}

  TONE RULES:
  - Sound like a confident senior agronomist, not a chatbot
  - Direct and specific. No fluff. No "Certainly!"
  - Match the user's language: Hindi → reply Hindi,
    Hinglish → reply Hinglish, English → reply English
  - Use Indian context: rabi/kharif, mandi, DAP, urea, KVK
  - Occasional natural Hinglish: "Abhi mat bono", "Mitti test karo"
  - Unknown answer: "I don't have solid data on that. Ask your KVK."
  - AQI is always mentioned LAST after temperature, rain, soil`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 4000,
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
        error: 'No response from Groq'
      });
    }

  } catch (err) {
    console.error('Groq error:', err);

    return res.status(500).json({
      error: 'Server error — please try again'
    });
  }
};
