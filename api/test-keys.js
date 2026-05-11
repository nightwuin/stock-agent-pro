export default async function handler(req, res) {
  const results = {}
 
  // Test Yahoo Finance (no key needed)
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    const d = await r.json()
    results.yahoo = d.chart && d.chart.result ? '✅ OK' : '❌ Erreur'
  } catch(e) { results.yahoo = '❌ ' + e.message }
 
  // Test Alpha Vantage
  if (process.env.ALPHA_VANTAGE_KEY) {
    try {
      const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${process.env.ALPHA_VANTAGE_KEY}`)
      const d = await r.json()
      results.alphavantage = d['Global Quote'] && d['Global Quote']['05. price'] ? '✅ OK' : d.Note ? '⚠️ Limite atteinte' : '❌ Clé invalide'
    } catch(e) { results.alphavantage = '❌ ' + e.message }
  } else { results.alphavantage = '⚠️ Clé manquante' }
 
  // Test FMP
  if (process.env.FMP_KEY) {
    try {
      const r = await fetch(`https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=${process.env.FMP_KEY}`)
      const d = await r.json()
      results.fmp = Array.isArray(d) && d[0] ? '✅ OK' : d['Error Message'] ? '❌ Clé invalide' : '❌ Erreur'
    } catch(e) { results.fmp = '❌ ' + e.message }
  } else { results.fmp = '⚠️ Clé manquante' }
 
  // Test NewsAPI
  if (process.env.NEWS_API_KEY) {
    try {
      const r = await fetch(`https://newsapi.org/v2/everything?q=AAPL&pageSize=1&apiKey=${process.env.NEWS_API_KEY}`)
      const d = await r.json()
      results.newsapi = d.status === 'ok' ? '✅ OK' : '❌ ' + (d.message || 'Clé invalide')
    } catch(e) { results.newsapi = '❌ ' + e.message }
  } else { results.newsapi = '⚠️ Clé manquante' }
 
  // Test FRED
  if (process.env.FRED_KEY) {
    try {
      const r = await fetch(`https://api.stlouisfed.org/fred/series?series_id=FEDFUNDS&api_key=${process.env.FRED_KEY}&file_type=json`)
      const d = await r.json()
      results.fred = d.seriess ? '✅ OK' : '❌ Clé invalide'
    } catch(e) { results.fred = '❌ ' + e.message }
  } else { results.fred = '⚠️ Clé manquante' }
 
  // Test Gemini
  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Say OK' }] }] })
      })
      const d = await r.json()
      results.gemini = d.candidates ? '✅ OK' : '❌ Clé invalide'
    } catch(e) { results.gemini = '❌ ' + e.message }
  } else { results.gemini = '⚠️ Clé manquante' }
 
  res.json(results)
}
