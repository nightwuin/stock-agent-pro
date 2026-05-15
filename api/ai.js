export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    const geminiModels = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash']
    for (const model of geminiModels) {
      try {
        const r = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-goog-api-key': process.env.GEMINI_API_KEY },
            body: JSON.stringify({
              contents: [{ parts: [{ text: req.body.prompt }] }],
              generationConfig: { temperature: 0.3 }
            })
          }
        )
        const d = await r.json()
        if (d.candidates && d.candidates[0] && d.candidates[0].content) {
          return res.json({ result: d.candidates[0].content.parts[0].text || '{}', model })
        }
        // If 429 quota, stop trying Gemini and fall to Groq
        if (d.error && d.error.code === 429) break
      } catch(e) {}
    }
  }

  // Fallback: Groq (free, 14400 req/day)
  if (process.env.GROQ_API_KEY) {
    const groqModels = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
    for (const model of groqModels) {
      try {
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.GROQ_API_KEY
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'Tu es un expert analyste financier. Reponds UNIQUEMENT en JSON valide, sans markdown, sans backticks.' },
              { role: 'user', content: req.body.prompt }
            ],
            temperature: 0.3,
            max_tokens: 1000
          })
        })
        const d = await r.json()
        if (d.choices && d.choices[0]) {
          return res.json({ result: d.choices[0].message.content || '{}', model: 'groq/' + model })
        }
      } catch(e) {}
    }
  }

  res.status(500).json({ error: 'IA indisponible. Quota Gemini depasse et Groq non configure. Ajoutez GROQ_API_KEY sur Vercel.' })
}
