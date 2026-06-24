export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, context } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'No question provided' });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: context || 'You are Aarambh AI X, an expert agricultural advisor.'
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
}
