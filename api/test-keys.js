export default async function handler(req, res) {
  const results = {}

  // Yahoo Finance
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d', { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const d = await r.json()
    results.yahoo = d.chart && d.chart.result ? '✅ OK' : '❌ Erreur'
  } catch(e) { results.yahoo = '❌ ' + e.message }

  // Alpha Vantage
  if (process.env.ALPHA_VANTAGE_KEY) {
    try {
      const r = await fetch('https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=' + process.env.ALPHA_VANTAGE_KEY)
      const d = await r.json()
      if (d.Note) results.alphavantage = '⚠️ Limite atteinte (cle OK)'
      else if (d['Global Quote'] && d['Global Quote']['05. price']) results.alphavantage = '✅ OK - Prix: $' + d['Global Quote']['05. price']
      else results.alphavantage = '❌ ' + JSON.stringify(d).slice(0, 150)
    } catch(e) { results.alphavantage = '❌ ' + e.message }
  } else results.alphavantage = '⚠️ Cle manquante dans Vercel'

  // FMP - test 3 endpoints differents
  if (process.env.FMP_KEY) {
    results.fmp_key_length = process.env.FMP_KEY.length + ' caracteres'
    results.fmp_key_preview = process.env.FMP_KEY.slice(0, 4) + '...' + process.env.FMP_KEY.slice(-4)

    const endpoints = [
      'https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=' + process.env.FMP_KEY,
      'https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=' + process.env.FMP_KEY,
      'https://financialmodelingprep.com/stable/profile?symbol=AAPL&apikey=' + process.env.FMP_KEY
    ]

    for (let i = 0; i < endpoints.length; i++) {
      try {
        const r = await fetch(endpoints[i])
        const d = await r.json()
        const key = 'fmp_endpoint_' + (i + 1)
        if (Array.isArray(d) && d.length > 0 && (d[0].symbol || d[0].companyName)) {
          results.fmp = '✅ OK - endpoint ' + (i + 1)
          break
        } else {
          results[key] = JSON.stringify(d).slice(0, 150)
        }
      } catch(e) { results['fmp_endpoint_' + (i + 1)] = '❌ ' + e.message }
    }
    if (!results.fmp) results.fmp = '❌ Tous les endpoints ont echoue - voir details ci-dessus'
  } else results.fmp = '⚠️ Cle FMP_KEY manquante dans Vercel'

  // NewsAPI
  if (process.env.NEWS_API_KEY) {
    try {
      const r = await fetch('https://newsapi.org/v2/everything?q=AAPL&pageSize=1&apiKey=' + process.env.NEWS_API_KEY)
      const d = await r.json()
      results.newsapi = d.status === 'ok' ? '✅ OK' : '❌ ' + (d.message || JSON.stringify(d).slice(0, 100))
    } catch(e) { results.newsapi = '❌ ' + e.message }
  } else results.newsapi = '⚠️ Cle manquante dans Vercel'

  // FRED
  if (process.env.FRED_KEY) {
    try {
      const r = await fetch('https://api.stlouisfed.org/fred/series?series_id=FEDFUNDS&api_key=' + process.env.FRED_KEY + '&file_type=json')
      const d = await r.json()
      results.fred = d.seriess ? '✅ OK' : '❌ ' + JSON.stringify(d).slice(0, 100)
    } catch(e) { results.fred = '❌ ' + e.message }
  } else results.fred = '⚠️ Cle manquante dans Vercel'

  // Gemini - avec header X-goog-api-key comme la commande curl
  if (process.env.GEMINI_API_KEY) {
    results.gemini_key_length = process.env.GEMINI_API_KEY.length + ' caracteres'
    results.gemini_key_preview = process.env.GEMINI_API_KEY.slice(0, 6) + '...' + process.env.GEMINI_API_KEY.slice(-4)

    const models = ['gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash']
    let found = false

    for (const model of models) {
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }] })
        })
        const d = await r.json()
        if (d.candidates) {
          results.gemini = '✅ OK - modele: ' + model
          found = true
          break
        } else {
          results['gemini_' + model] = JSON.stringify(d).slice(0, 150)
        }
      } catch(e) { results['gemini_' + model] = '❌ ' + e.message }
    }
    if (!found) results.gemini = '❌ Tous les modeles ont echoue - voir details'
  } else results.gemini = '⚠️ Cle GEMINI_API_KEY manquante dans Vercel'

  res.setHeader('Content-Type', 'application/json')
  res.json(results)
}
