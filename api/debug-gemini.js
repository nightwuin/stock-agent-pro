export default async function handler(req, res) {
  const key = process.env.GEMINI_API_KEY
  
  const result = {
    key_exists: !!key,
    key_length: key ? key.length : 0,
    key_start: key ? key.slice(0, 8) : 'MISSING',
    tests: {}
  }

  const models = ['gemini-2.5-flash-preview-04-17', 'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash-latest']

  for (const model of models) {
    try {
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': key
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Say the word OK' }] }],
            generationConfig: { temperature: 0 }
          })
        }
      )
      const d = await r.json()
      if (d.candidates && d.candidates[0]) {
        result.tests[model] = 'OK - ' + d.candidates[0].content.parts[0].text
        result.working_model = model
        break
      } else {
        result.tests[model] = 'FAIL: ' + JSON.stringify(d).slice(0, 200)
      }
    } catch(e) {
      result.tests[model] = 'ERROR: ' + e.message
    }
  }

  res.json(result)
}
