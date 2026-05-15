export default async function handler(req, res) {
  const FMP_KEY = process.env.FMP_KEY
  const FRED_KEY = process.env.FRED_KEY
  const YH = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }

  const safe = async (fn) => {
    try { return await fn() } catch (e) { return null }
  }

  const [
    fearGreed,
    sp500, nasdaq, dow, btc,
    gainers, losers, active,
    earningsCalendar,
    fedRate, cpi, vix
  ] = await Promise.all([
    // Fear & Greed Index - completely free, no key
    safe(() => fetch('https://api.alternative.me/fng/?limit=7').then(r => r.json())),

    // Major indices
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d', { headers: YH }).then(r => r.json())),
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?interval=1d&range=1d', { headers: YH }).then(r => r.json())),
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EDJI?interval=1d&range=1d', { headers: YH }).then(r => r.json())),
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=1d&range=1d', { headers: YH }).then(r => r.json())),

    // Top gainers
    safe(() => fetch('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=8&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume', { headers: YH }).then(r => r.json())),
    // Top losers
    safe(() => fetch('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_losers&count=8&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume', { headers: YH }).then(r => r.json())),
    // Most active
    safe(() => fetch('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=8&fields=symbol,shortName,regularMarketPrice,regularMarketChangePercent,regularMarketVolume', { headers: YH }).then(r => r.json())),

    // Earnings calendar this week (FMP free)
    FMP_KEY ? safe(() => {
      const today = new Date()
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      const from = today.toISOString().split('T')[0]
      const to = nextWeek.toISOString().split('T')[0]
      return fetch('https://financialmodelingprep.com/api/v3/earning_calendar?from=' + from + '&to=' + to + '&apikey=' + FMP_KEY).then(r => r.json())
    }) : null,

    // FRED macro data
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&limit=2&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&limit=1&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
  ])

  const parseIndex = (data) => {
    try {
      const r = data && data.chart && data.chart.result && data.chart.result[0]
      const price = r && r.meta && r.meta.regularMarketPrice
      const prev = r && r.meta && r.meta.chartPreviousClose
      const chg = prev ? ((price - prev) / prev * 100).toFixed(2) : '0'
      return { price: price ? price.toFixed(2) : null, chg }
    } catch(e) { return null }
  }

  const parseScreener = (data) => {
    try {
      const quotes = data && data.finance && data.finance.result && data.finance.result[0] && data.finance.result[0].quotes
      if (!Array.isArray(quotes)) return []
      return quotes.map(q => ({
        symbol: q.symbol,
        name: q.shortName || q.symbol,
        price: q.regularMarketPrice ? q.regularMarketPrice.toFixed(2) : null,
        chg: q.regularMarketChangePercent ? q.regularMarketChangePercent.toFixed(2) : null,
        volume: q.regularMarketVolume
      }))
    } catch(e) { return [] }
  }

  const fg = fearGreed && fearGreed.data && fearGreed.data[0]
  const earnings = Array.isArray(earningsCalendar) ? earningsCalendar.slice(0, 20).map(e => ({
    symbol: e.symbol, date: e.date, eps: e.eps, epsEstimated: e.epsEstimated
  })) : []

  res.json({
    fearGreed: fg ? { value: parseInt(fg.value), label: fg.value_classification, history: fearGreed.data.slice(0, 7).map(d => ({ value: parseInt(d.value), label: d.value_classification })) } : null,
    indices: {
      sp500: parseIndex(sp500),
      nasdaq: parseIndex(nasdaq),
      dow: parseIndex(dow),
      btc: parseIndex(btc)
    },
    screener: {
      gainers: parseScreener(gainers),
      losers: parseScreener(losers),
      active: parseScreener(active)
    },
    earnings: earnings,
    macro: {
      fedRate: FRED_KEY && fredRate && fredRate.observations && fredRate.observations[0] ? fredRate.observations[0].value : null,
      cpi: FRED_KEY && cpi && cpi.observations && cpi.observations[0] ? cpi.observations[0].value : null,
      vix: FRED_KEY && vix && vix.observations && vix.observations[0] ? parseFloat(vix.observations[0].value).toFixed(1) : null
    }
  })
}
