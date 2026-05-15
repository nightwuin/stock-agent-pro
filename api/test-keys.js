export default async function handler(req, res) {
  const results = {}

  results.env = {
    fmpDetected: Boolean(process.env.FMP_KEY),
    fmpLength: process.env.FMP_KEY ? process.env.FMP_KEY.length : 0,
    geminiDetected: Boolean(process.env.GEMINI_API_KEY),
    geminiLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
    alphaDetected: Boolean(process.env.ALPHA_VANTAGE_KEY),
    newsDetected: Boolean(process.env.NEWS_API_KEY),
    fredDetected: Boolean(process.env.FRED_KEY)
  }

  if (process.env.FMP_KEY) {
    try {
      const r = await fetch(
        'https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=' +
          process.env.FMP_KEY
      )

      const text = await r.text()

      results.fmp = {
        status: r.status,
        ok: r.ok,
        response: text.slice(0, 300)
      }
    } catch (e) {
      results.fmp = {
        error: e.message
      }
    }
  } else {
    results.fmp = {
      error: 'FMP_KEY manquante'
    }
  }

  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Say OK'
                  }
                ]
              }
            ]
          })
        }
      )

      const data = await r.json()

      results.gemini = {
        status: r.status,
        ok: r.ok,
        response: JSON.stringify(data).slice(0, 300)
      }
    } catch (e) {
      results.gemini = {
        error: e.message
      }
    }
  } else {
    results.gemini = {
      error: 'GEMINI_API_KEY manquante'
    }
  }

  res.status(200).json(results)
}
