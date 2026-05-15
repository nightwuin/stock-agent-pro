export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const models = [
    'gemini-2.5-flash-preview-04-17',
    'gemini-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash'
  ]

  for (const model of models) {
    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: req.body.prompt }] }],
            generationConfig: { temperature: 0.3 }
          })
        }
      )
      const data = await response.json()
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const text = data.candidates[0].content.parts[0].text || '{}'
        return res.json({ result: text, model: model })
      }
      if (data.error) console.log('Model', model, 'error:', data.error.message)
    } catch(e) {
      console.log('Model', model, 'exception:', e.message)
    }
  }

  res.status(500).json({ error: 'Gemini indisponible. Verifiez votre cle.' })
}
