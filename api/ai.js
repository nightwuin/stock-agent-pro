export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const models = [
    'gemini-flash-latest',
    'gemini-2.0-flash',
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
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json' }
          })
        }
      )
      const data = await response.json()
      if (data.candidates && data.candidates[0]) {
        const text = data.candidates[0].content.parts[0].text || '{}'
        return res.json({ result: text, model: model })
      }
    } catch(e) {}
  }

  res.status(500).json({ error: 'Gemini indisponible. Verifiez votre cle.' })
}
