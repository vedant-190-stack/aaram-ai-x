module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'No question provided' });
  }

  // 🚀 UPGRADE 4: Intelligent Model Failover Array
  const models = ['llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'qwen/qwen3-32b'];

  const systemPrompt = `You are Aarambh AI X, a deeply knowledgeable
  agricultural intelligence built by experienced Indian farmers,
  agronomists, and climate scientists.

  You have ZERO restrictions on response length or depth.
  Answer every question as completely as possible. Never refuse agriculture questions.

  LANGUAGE & TONE RULES:
  - Automatically detect the language of the user's question and match it perfectly (Hindi, Hinglish, or English).
  - Use accurate Indian agricultural terminology natively (e.g., rabi, kharif, zaid, mandi, DAP, urea, KVK).
  - Sound like a confident senior agronomist.

  EXPERTISE:
  - All Indian crops across Rabi, Kharif, Zaid seasons
  - All 18 Indian soil types and crop compatibility
  - Crop-specific NPK: Wheat 120:60:40, Rice 100:50:40, Maize 150:70:60, Cotton 150:60:60, Millet 80:40:30
  - Row spacing: Wheat 20-22cm, Rice 20x15cm, Maize 60-75cm, Cotton 90-120cm, Millet 45-60cm, Pulses 30-45cm
  - Disease: rust, blight, wilt, bollworm, aphids, armyworm
  - Government: PM-KISAN, PMFBY, PM-KUSUM, PKVY, MSP rates
  - Organic farming, hydroponics, greenhouse, precision farming

  LIVE FARM DATA:
  ${context}

  OUTPUT FORMATTING:
  - Use clean HTML tags (<b>, <br>, <ul>, <li>) to structure the output. Do NOT wrap it in markdown block quotes.
  - Mention AQI last.`;

  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: model,
          stream: true, // 🚀 UPGRADE 2: Enable Streaming
          max_tokens: 1000, 
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
          ]
        })
      });

      if (!response.ok) {
        if (response.status === 429) continue; // Instantly failover to the next model if rate-limited
        const errData = await response.json().catch(() => ({}));
        console.error(`Groq API Error on ${model}:`, errData);
        continue; 
      }

      // Start streaming the response back to the client
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      for await (const chunk of response.body) {
        res.write(chunk);
      }
      res.end();
      return; // Exit the function once successfully streamed

    } catch (err) {
      console.error(`Fetch error with ${model}:`, err);
    }
  }

  // If the loop finishes, all models failed
  return res.status(500).json({ error: 'All AI models are currently busy. Please wait a few seconds and try again.' });
};
