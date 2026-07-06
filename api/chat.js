module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'No question provided' });
  }

  try {
    // Optimized system prompt to stay within token limits
    const systemPrompt = `You are Aarambh AI X, an agricultural intelligence assistant for Indian farming.
You provide expert advice on crops, soil, weather, and farming practices.

EXPERTISE: Indian crops (Wheat, Rice, Maize, Millet, Pulses, Soybean, Cotton), soil types, seasonal farming (Rabi/Kharif/Zaid), government schemes (PM-KISAN, PMFBY), disease management, irrigation, and organic farming.

TONE: Direct, practical, knowledgeable. Use Hindi/Hinglish when appropriate. Reference local context (mandi, DAP, urea, KVK). If unsure, say so.

LIVE FARM DATA (use to personalize answers):
${context ? context.substring(0, 500) : 'No location data available'}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1024,
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
        error: data.error.message || 'Groq API error'
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
