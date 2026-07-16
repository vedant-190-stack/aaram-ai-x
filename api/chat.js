// ─── Constants ───────────────────────────────────────────────────────────────
const GROQ_API_URL    = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_NAME      = 'llama-3.1-8b-instant';
const MAX_TOKENS      = 600;
const TEMPERATURE     = 0.7;
const TIMEOUT_MS      = 20_000;
const MAX_QUESTION_LEN = 2000;
const MAX_CONTEXT_LEN  = 8000;
const DEFAULT_SYSTEM  = 'You are Aarambh AI X, an expert agricultural advisor for Indian farmers.';

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // API key guard — fail fast with a clear message
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('[chat] GROQ_API_KEY is not set');
    return res.status(500).json({ error: 'Chat service is not configured. Contact support.' });
  }

  // Input validation
  const { question, context } = req.body ?? {};

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'A non-empty question is required.' });
  }
  if (question.length > MAX_QUESTION_LEN) {
    return res.status(400).json({ error: `Question too long (max ${MAX_QUESTION_LEN} characters).` });
  }
  if (context && context.length > MAX_CONTEXT_LEN) {
    return res.status(400).json({ error: `Context too long (max ${MAX_CONTEXT_LEN} characters).` });
  }

  // Groq call with timeout
  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response;
    try {
      response = await fetch(GROQ_API_URL, {
        method:  'POST',
        signal:  controller.signal,
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model:       MODEL_NAME,
          max_tokens:  MAX_TOKENS,
          temperature: TEMPERATURE,
          messages: [
            { role: 'system', content: context?.trim() || DEFAULT_SYSTEM },
            { role: 'user',   content: question.trim() }
          ]
        })
      });
    } finally {
      clearTimeout(timer);
    }

    // Surface non-2xx HTTP errors from Groq
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error('[chat] Groq HTTP error:', response.status, body);
      return res.status(502).json({
        error: body?.error?.message ?? `Groq returned status ${response.status}.`
      });
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;

    if (!answer) {
      console.error('[chat] Unexpected Groq response shape:', JSON.stringify(data));
      return res.status(502).json({ error: 'Unexpected response from AI service.' });
    }

    return res.status(200).json({ answer });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out. Please try again.' });
    }
    console.error('[chat] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Server error — please try again.' });
  }
}
