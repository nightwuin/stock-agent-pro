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
  const YH = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }

  const safe = async (fn) => {
    try { return await fn() } catch (e) { return null }
  }

  const [
    yahooQuote, yahooHist,
    avOverview, avRsi,
    fmpQuote, fmpProfile,
    newsApiData, yahooNews, googleNews,
    fredRate, fredCpi, fredVix
  ] = await Promise.all([
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=' + range, { headers: YH }).then(r => r.json())),
    safe(() => fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?interval=1d&range=6mo', { headers: YH }).then(r => r.json())),

    AV_KEY ? safe(() => fetch('https://www.alphavantage.co/query?function=OVERVIEW&symbol=' + ticker + '&apikey=' + AV_KEY).then(r => r.json())) : null,
    AV_KEY ? safe(() => fetch('https://www.alphavantage.co/query?function=RSI&symbol=' + ticker + '&interval=daily&time_period=14&series_type=close&apikey=' + AV_KEY).then(r => r.json())) : null,

    FMP_KEY ? safe(() => fetch('https://financialmodelingprep.com/api/v3/quote/' + ticker + '?apikey=' + FMP_KEY).then(r => r.json())) : null,
    FMP_KEY ? safe(() => fetch('https://financialmodelingprep.com/api/v3/profile/' + ticker + '?apikey=' + FMP_KEY).then(r => r.json())) : null,

    NEWS_KEY ? safe(() => fetch('https://newsapi.org/v2/everything?q=' + encodeURIComponent(ticker) + '&sortBy=publishedAt&pageSize=8&language=en&apiKey=' + NEWS_KEY).then(r => r.json()).then(d => (d.articles || []).map(a => ({ title: a.title, url: a.url, source: a.source && a.source.name, publishedAt: a.publishedAt })))) : null,

    safe(() => fetch('https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(ticker) + '&newsCount=6&quotesCount=0', { headers: YH }).then(r => r.json()).then(d => (d.news || []).map(n => ({ title: n.title, url: n.link, source: n.publisher, publishedAt: '' })))),

    safe(() => fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(ticker + ' stock') + '&hl=en-US&gl=US&ceid=US:en', { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text()).then(xml => {
      const items = []
      const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
      for (const item of matches.slice(0, 8)) {
        const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/)
        const linkMatch = item.match(/<link>(.*?)<\/link>/) || item.match(/<guid>(.*?)<\/guid>/)
        const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/)
        const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : ''
        const url = linkMatch ? linkMatch[1].trim() : ''
        const source = sourceMatch ? sourceMatch[1].replace(/<[^>]*>/g, '').trim() : 'Google News'
        if (title && title.length > 5) items.push({ title, url, source, publishedAt: '' })
      }
      return items
    })),

    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&limit=1&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&limit=2&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
    FRED_KEY ? safe(() => fetch('https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&limit=1&sort_order=desc&api_key=' + FRED_KEY + '&file_type=json').then(r => r.json())) : null,
  ])

  const seen = new Set()
  const allNews = []
  for (const item of [...(newsApiData || []), ...(yahooNews || []), ...(googleNews || [])]) {
    if (!item || !item.title || item.title.length < 10) continue
    const key = item.title.slice(0, 40).toLowerCase()
    if (!seen.has(key)) { seen.add(key); allNews.push(item) }
    if (allNews.length >= 15) break
  }

  res.json({
    period: range,
    yahoo: { quote: yahooQuote, hist: yahooHist },
    av: { overview: avOverview, rsi: avRsi },
    fmp: {
      quote: Array.isArray(fmpQuote) ? fmpQuote[0] : null,
      profile: Array.isArray(fmpProfile) ? fmpProfile[0] : null
    },
    news: { articles: allNews },
    macro: {
      fedRate: fredRate && fredRate.observations && fredRate.observations[0] ? fredRate.observations[0].value : null,
      cpi: fredCpi && fredCpi.observations && fredCpi.observations[0] ? fredCpi.observations[0].value : null,
      vix: fredVix && fredVix.observations && fredVix.observations[0] ? parseFloat(fredVix.observations[0].value).toFixed(1) : null
    }
  })
}
