export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY

  if (!GEMINI_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY non détectée dans Vercel'
    })
  }

  const { prompt } = req.body || {}

  if (!prompt) {
    return res.status(400).json({
      error: 'Prompt manquant'
    })
  }

  const models = [
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-2.5-flash'
  ]

  let lastError = null

  for (const model of models) {
    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          model +
          ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1200
            }
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        lastError = data
        continue
      }

      const text =
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text

      if (!text) {
        lastError = data
        continue
      }

      return res.status(200).json({
        result: text,
        model
      })
    } catch (e) {
      lastError = e.message
    }
  }

  return res.status(500).json({
    error: 'Gemini a échoué avec tous les modèles',
    details: lastError
  })
}
