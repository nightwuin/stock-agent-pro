export default async function handler(req, res) {
  const results = {}

  const safeJson = async (url, options = {}) => {
    const r = await fetch(url, options)
    const text = await r.text()

    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text.slice(0, 200) }
    }

    return {
      status: r.status,
      ok: r.ok,
      data
    }
  }

  // ENV check sans exposer les clés
  results.env = {
    yahoo: true,
    alphavantage: Boolean(process.env.ALPHA_VANTAGE_KEY),
    fmp: Boolean(process.env.FMP_KEY),
    newsapi: Boolean(process.env.NEWS_API_KEY),
    fred: Boolean(process.env.FRED_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY)
  }

  // Yahoo Finance
  try {
    const { data } = await safeJson(
      'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    )

    results.yahoo = data.chart?.result ? '✅ OK' : '❌ Erreur'
    if (!data.chart?.result) results.yahoo_details = JSON.stringify(data).slice(0, 200)
  } catch (e) {
    results.yahoo = '❌ ' + e.message
  }

  // Alpha Vantage
  if (process.env.ALPHA_VANTAGE_KEY) {
    try {
      const { data } = await safeJson(
        'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=' +
          process.env.ALPHA_VANTAGE_KEY
      )

      if (data.Note) {
        results.alphavantage = '⚠️ Limite atteinte, clé OK'
      } else if (data['Global Quote']?.['05. price']) {
        results.alphavantage = '✅ OK - Prix: $' + data['Global Quote']['05. price']
      } else {
        results.alphavantage = '❌ ' + JSON.stringify(data).slice(0, 200)
      }
    } catch (e) {
      results.alphavantage = '❌ ' + e.message
    }
  } else {
    results.alphavantage = '⚠️ Clé manquante dans Vercel'
  }

  // FMP
  if (process.env.FMP_KEY) {
    const fmpEndpoints = [
      {
        name: 'stable quote',
        url:
          'https://financialmodelingprep.com/stable/quote?symbol=AAPL&apikey=' +
          process.env.FMP_KEY
      },
      {
        name: 'stable profile',
        url:
          'https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=' +
          process.env.FMP_KEY
      },
      {
        name: 'v3 quote',
        url:
          'https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=' +
          process.env.FMP_KEY
      }
    ]

    let fmpOk = false

    for (const endpoint of fmpEndpoints) {
      try {
        const { status, data } = await safeJson(endpoint.url)

        const arr = Array.isArray(data) ? data : []
        const first = arr[0] || data

        if (first?.symbol || first?.companyName || first?.price) {
          results.fmp = '✅ OK - ' + endpoint.name
          fmpOk = true
          break
        }

        results['fmp_' + endpoint.name.replaceAll(' ', '_')] = {
          status,
          response: JSON.stringify(data).slice(0, 250)
        }
      } catch (e) {
        results['fmp_' + endpoint.name.replaceAll(' ', '_')] = '❌ ' + e.message
      }
    }

    if (!fmpOk) {
      results.fmp = '❌ Tous les endpoints FMP ont échoué'
    }
  } else {
    results.fmp = '⚠️ Clé FMP_KEY manquante dans Vercel'
  }

  // NewsAPI
  if (process.env.NEWS_API_KEY) {
    try {
      const { data } = await safeJson(
        'https://newsapi.org/v2/everything?q=AAPL&pageSize=1&apiKey=' +
          process.env.NEWS_API_KEY
      )

      results.newsapi =
        data.status === 'ok'
          ? '✅ OK'
          : '❌ ' + (data.message || JSON.stringify(data).slice(0, 200))
    } catch (e) {
      results.newsapi = '❌ ' + e.message
    }
  } else {
    results.newsapi = '⚠️ Clé manquante dans Vercel'
  }

  // FRED
  if (process.env.FRED_KEY) {
    try {
      const { data } = await safeJson(
        'https://api.stlouisfed.org/fred/series?series_id=FEDFUNDS&api_key=' +
          process.env.FRED_KEY +
          '&file_type=json'
      )

      results.fred = data.seriess ? '✅ OK' : '❌ ' + JSON.stringify(data).slice(0, 200)
    } catch (e) {
      results.fred = '❌ ' + e.message
    }
  } else {
    results.fred = '⚠️ Clé manquante dans Vercel'
  }

  // Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const modelsResponse = await safeJson(
        'https://generativelanguage.googleapis.com/v1beta/models',
        {
          headers: {
            'x-goog-api-key': process.env.GEMINI_API_KEY
          }
        }
      )

      const availableModels = modelsResponse.data.models || []

      results.gemini_models_found = availableModels.length

      const usableModel = availableModels.find((m) =>
        m.supportedGenerationMethods?.includes('generateContent')
      )

      if (!usableModel) {
        results.gemini = '❌ Clé détectée, mais aucun modèle generateContent disponible'
        results.gemini_details = JSON.stringify(modelsResponse.data).slice(0, 300)
      } else {
        const modelName = usableModel.name.replace('models/', '')

        const { status, data } = await safeJson(
          'https://generativelanguage.googleapis.com/v1beta/models/' +
            modelName +
            ':generateContent',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: 'Say OK' }]
                }
              ]
            })
          }
        )

        if (data.candidates) {
          results.gemini = '✅ OK - modèle: ' + modelName
        } else {
          results.gemini = '❌ Erreur generateContent'
          results.gemini_status = status
          results.gemini_details = JSON.stringify(data).slice(0, 300)
        }
      }
    } catch (e) {
      results.gemini = '❌ ' + e.message
    }
  } else {
    results.gemini = '⚠️ Clé GEMINI_API_KEY manquante dans Vercel'
  }

  res.setHeader('Content-Type', 'application/json')
  res.status(200).json(results)
}
