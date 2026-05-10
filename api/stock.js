export default async function handler(req, res) {
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'Ticker required' })

  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  const FMP_KEY = process.env.FMP_KEY
  const NEWS_KEY = process.env.NEWS_API_KEY
  const FRED_KEY = process.env.FRED_KEY
  const YH = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }

  const safe = async (fn) => {
    try { return await fn() } catch (e) { return null }
  }

  const [
    yahooQuote, yahooSummary, yahooHist,
    avRsi, avMacd, avBbands,
    fmpRatios, fmpIncome, fmpInsider, fmpEarnings,
    newsData,
    fredRate, fredCpi, fredVix
  ] = await Promise.all([
    safe(() => fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`, { headers: YH }).then(r => r.json())),
    safe(() => fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=financialData,defaultKeyStatistics,price,summaryDetail`, { headers: YH }).then(r => r.json())),
    safe(() => fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`, { headers: YH }).then(r => r.json())),
    AV_KEY ? safe(() => fetch(`https://www.alphavantage.co/query?function=RSI&symbol=${ticker}&interval=daily&time_period=14&series_type=close&apikey=${AV_KEY}`).then(r => r.json())) : null,
    AV_KEY ? safe(() => fetch(`https://www.alphavantage.co/query?function=MACD&symbol=${ticker}&interval=daily&series_type=close&apikey=${AV_KEY}`).then(r => r.json())) : null,
    AV_KEY ? safe(() => fetch(`https://www.alphavantage.co/query?function=BBANDS&symbol=${ticker}&interval=daily&time_period=20&series_type=close&apikey=${AV_KEY}`).then(r => r.json())) : null,
    FMP_KEY ? safe(() => fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${ticker}?apikey=${FMP_KEY}`).then(r => r.json())) : null,
    FMP_KEY ? safe(() => fetch(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=4&apikey=${FMP_KEY}`).then(r => r.json())) : null,
    FMP_KEY ? safe(() => fetch(`https://financialmodelingprep.com/api/v4/insider-trading?symbol=${ticker}&limit=8&apikey=${FMP_KEY}`).then(r => r.json())) : null,
    FMP_KEY ? safe(() => fetch(`https://financialmodelingprep.com/api/v3/historical/earning_calendar/${ticker}?apikey=${FMP_KEY}`).then(r => r.json())) : null,
    NEWS_KEY ? safe(() => fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(ticker)}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${NEWS_KEY}`).then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key=${FRED_KEY}&file_type=json`).then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&limit=2&sort_order=desc&api_key=${FRED_KEY}&file_type=json`).then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&limit=1&sort_order=desc&api_key=${FRED_KEY}&file_type=json`).then(r => r.json())) : null,
  ])

  res.json({
    yahoo: { quote: yahooQuote, summary: yahooSummary, hist: yahooHist },
    av: { rsi: avRsi, macd: avMacd, bbands: avBbands },
    fmp: { ratios: fmpRatios, income: fmpIncome, insider: fmpInsider, earnings: fmpEarnings },
    news: newsData,
    macro: { fedRate: fredRate, cpi: fredCpi, vix: fredVix }
  })
}
