export default async function handler(req, res) {
  const { ticker, period } = req.query

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker required' })
  }

  // Temporairement no-cache pendant les tests
  res.setHeader('Cache-Control', 'no-store')

  const symbol = String(ticker).toUpperCase().trim()

  const rangeMap = {
    '1j': '1d',
    '1s': '5d',
    '1m': '1mo',
    '3m': '3mo',
    '1an': '1y'
  }

  const range = rangeMap[period] || '1d'

  const AV_KEY = process.env.ALPHA_VANTAGE_KEY
  const FMP_KEY = process.env.FMP_KEY
  const NEWS_KEY = process.env.NEWS_API_KEY
  const FRED_KEY = process.env.FRED_KEY
  const GEMINI_KEY = process.env.GEMINI_API_KEY

  const YH = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json'
  }

  const jsonFetch = async (url, options = {}) => {
    const response = await fetch(url, options)
    const text = await response.text()

    try {
      return JSON.parse(text)
    } catch {
      return {
        error: 'Invalid JSON response',
        status: response.status,
        raw: text.slice(0, 300)
      }
    }
  }

  const safe = async (name, fn) => {
    try {
      return await fn()
    } catch (e) {
      return {
        error: name,
        message: e.message
      }
    }
  }

  const [
    yahooQuote,
    yahooSummary,
    yahooHist,

    avRsi,
    avMacd,
    avBbands,

    fmpQuote,
    fmpProfile,
    fmpIncome,
    fmpRatios,
    fmpInsider,
    fmpEarnings,

    newsData,

    fredRate,
    fredCpi,
    fredVix
  ] = await Promise.all([
    safe('Yahoo quote', () =>
      jsonFetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/' +
          encodeURIComponent(symbol) +
          '?interval=1d&range=' +
          range,
        { headers: YH }
      )
    ),

    safe('Yahoo summary', () =>
      jsonFetch(
        'https://query1.finance.yahoo.com/v10/finance/quoteSummary/' +
          encodeURIComponent(symbol) +
          '?modules=financialData,defaultKeyStatistics,price,summaryDetail',
        { headers: YH }
      )
    ),

    safe('Yahoo hist', () =>
      jsonFetch(
        'https://query1.finance.yahoo.com/v8/finance/chart/' +
          encodeURIComponent(symbol) +
          '?interval=1d&range=6mo',
        { headers: YH }
      )
    ),

    AV_KEY
      ? safe('Alpha RSI', () =>
          jsonFetch(
            'https://www.alphavantage.co/query?function=RSI&symbol=' +
              encodeURIComponent(symbol) +
              '&interval=daily&time_period=14&series_type=close&apikey=' +
              AV_KEY
          )
        )
      : null,

    AV_KEY
      ? safe('Alpha MACD', () =>
          jsonFetch(
            'https://www.alphavantage.co/query?function=MACD&symbol=' +
              encodeURIComponent(symbol) +
              '&interval=daily&series_type=close&apikey=' +
              AV_KEY
          )
        )
      : null,

    AV_KEY
      ? safe('Alpha BBANDS', () =>
          jsonFetch(
            'https://www.alphavantage.co/query?function=BBANDS&symbol=' +
              encodeURIComponent(symbol) +
              '&interval=daily&time_period=20&series_type=close&apikey=' +
              AV_KEY
          )
        )
      : null,

    FMP_KEY
      ? safe('FMP quote', () =>
          jsonFetch(
            'https://financialmodelingprep.com/api/v3/quote/' +
              encodeURIComponent(symbol) +
              '?apikey=' +
              FMP_KEY
          )
        )
      : null,

    FMP_KEY
      ? safe('FMP profile', () =>
          jsonFetch(
            'https://financialmodelingprep.com/api/v3/profile/' +
              encodeURIComponent(symbol) +
              '?apikey=' +
              FMP_KEY
          )
        )
      : null,

    FMP_KEY
      ? safe('FMP income', () =>
          jsonFetch(
            'https://financialmodelingprep.com/api/v3/income-statement/' +
              encodeURIComponent(symbol) +
              '?period=quarter&limit=4&apikey=' +
              FMP_KEY
          )
        )
      : null,

    FMP_KEY
      ? safe('FMP ratios', () =>
          jsonFetch(
            'https://financialmodelingprep.com/api/v3/ratios-ttm/' +
              encodeURIComponent(symbol) +
              '?apikey=' +
              FMP_KEY
          )
        )
      : null,

    FMP_KEY
      ? safe('FMP insider', () =>
          jsonFetch(
            'https://financialmodelingprep.com/api/v4/insider-trading?symbol=' +
              encodeURIComponent(symbol) +
              '&limit=10&apikey=' +
              FMP_KEY
          )
        )
      : null,

    FMP_KEY
      ? safe('FMP earnings', () =>
          jsonFetch(
            'https://financialmodelingprep.com/api/v3/historical/earning_calendar/' +
              encodeURIComponent(symbol) +
              '?limit=4&apikey=' +
              FMP_KEY
          )
        )
      : null,

    NEWS_KEY
      ? safe('NewsAPI', () =>
          jsonFetch(
            'https://newsapi.org/v2/everything?q=' +
              encodeURIComponent(symbol) +
              '&sortBy=publishedAt&pageSize=10&language=en&apiKey=' +
              NEWS_KEY
          )
        )
      : null,

    FRED_KEY
      ? safe('FRED rate', () =>
          jsonFetch(
            'https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key=' +
              FRED_KEY +
              '&file_type=json'
          )
        )
      : null,

    FRED_KEY
      ? safe('FRED CPI', () =>
          jsonFetch(
            'https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&limit=2&sort_order=desc&api_key=' +
              FRED_KEY +
              '&file_type=json'
          )
        )
      : null,

    FRED_KEY
      ? safe('FRED VIX', () =>
          jsonFetch(
            'https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&limit=1&sort_order=desc&api_key=' +
              FRED_KEY +
              '&file_type=json'
          )
        )
      : null
  ])

  const fmpQ = Array.isArray(fmpQuote) ? fmpQuote[0] : null
  const fmpP = Array.isArray(fmpProfile) ? fmpProfile[0] : null
  const fmpI = Array.isArray(fmpIncome) ? fmpIncome : []
  const fmpR = Array.isArray(fmpRatios) ? fmpRatios : []
  const fmpIns = Array.isArray(fmpInsider) ? fmpInsider : []
  const fmpE = Array.isArray(fmpEarnings) ? fmpEarnings : []

  res.status(200).json({
    debug: {
      fmpDetected: Boolean(FMP_KEY),
      geminiDetected: Boolean(GEMINI_KEY),
      alphaDetected: Boolean(AV_KEY),
      newsDetected: Boolean(NEWS_KEY),
      fredDetected: Boolean(FRED_KEY),
      fmpQuoteReceived: Boolean(fmpQ),
      fmpRatiosReceived: fmpR.length,
      fmpIncomeReceived: fmpI.length
    },

    period: range,

    yahoo: {
      quote: yahooQuote,
      summary: yahooSummary,
      hist: yahooHist
    },

    av: {
      rsi: avRsi,
      macd: avMacd,
      bbands: avBbands
    },

    fmp: {
      quote: fmpQ,
      profile: fmpP,
      income: fmpI,
      ratios: fmpR,
      insider: fmpIns,
      earnings: fmpE
    },

    news: newsData,

    macro: {
      fedRate: fredRate,
      cpi: fredCpi,
      vix: fredVix
    }
  })
}
