export default async function handler(req, res) {
  const { ticker, period } = req.query
  if (!ticker) return res.status(400).json({ error: 'Ticker required' })

  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate')

  const rangeMap = { '1j': '1d', '1s': '5d', '1m': '1mo', '3m': '3mo', '1an': '1y' }
  const range = rangeMap[period] || '1d'

  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  const FMP_KEY = process.env.FMP_KEY
  const NEWS_KEY = process.env.NEWS_API_KEY
  const FRED_KEY = process.env.FRED_KEY
  const YH = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }

  const safe = async (fn) => {
    try { return await fn() } catch (e) { return null }
  }

  const [
    yahooQuote, yahooHist,
    avOverview, avRsi,
    fmpQuote, fmpProfile,
    newsData,
    fredRate, fredCpi, fredVix
  ] = await Promise.all([
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=' + range, { headers: YH }).then(r => r.json())),
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=6mo', { headers: YH }).then(r => r.json())),

    // Alpha Vantage OVERVIEW = FREE endpoint giving ALL fundamentals
    AV_KEY ? safe(() => fetch('https://www.alphavantage.co/query?function=OVERVIEW&symbol=' + ticker + '&apikey=' + AV_KEY).then(r => r.json())) : null,
    AV_KEY ? safe(() => fetch('https://www.alphavantage.co/query?function=RSI&symbol=' + ticker + '&interval=daily&time_period=14&series_type=close&apikey=' + AV_KEY).then(r => r.json())) : null,

    FMP_KEY ? safe(() => fetch('https://financialmodelingprep.com/api/v3/quote/' + ticker + '?apikey=' + FMP_KEY).then(r => r.json())) : null,
    FMP_KEY ? safe(() => fetch('https://financialmodelingprep.com/api/v3/profile/' + ticker + '?apikey=' + FMP_KEY).then(r => r.json())) : null,

    NEWS_KEY ? safe(() => fetch('https://newsapi.org/v2/everything?q=' + encodeURIComponent(ticker) + '&sortBy=publishedAt&pageSize=10&language=en&apiKey=' + NEWS_KEY).then(r => r.json())) : null,

    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&limit=2&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&limit=1&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
  ])

  res.json({
    period: range,
    yahoo: { quote: yahooQuote, hist: yahooHist },
    av: { overview: avOverview, rsi: avRsi },
    fmp: {
      quote: Array.isArray(fmpQuote) ? fmpQuote[0] : null,
      profile: Array.isArray(fmpProfile) ? fmpProfile[0] : null
    },
    news: newsData,
    macro: {
      fedRate: fredRate && fredRate.observations && fredRate.observations[0] ? fredRate.observations[0].value : null,
      cpi: fredCpi && fredCpi.observations && fredCpi.observations[0] ? fredCpi.observations[0].value : null,
      vix: fredVix && fredVix.observations && fredVix.observations[0] ? parseFloat(fredVix.observations[0].value).toFixed(1) : null
    }
  })
}
