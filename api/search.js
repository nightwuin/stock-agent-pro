export default async function handler(req, res) {
  const { q } = req.query
  if (!q || q.length < 1) return res.json([])

  res.setHeader('Cache-Control', 's-maxage=3600')

  try {
    const r = await fetch(
      'https://query1.finance.yahoo.com/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=8&newsCount=0&listsCount=0',
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } }
    )
    const d = await r.json()
    const quotes = (d.quotes || [])
      .filter(q => q.symbol && q.quoteType && ['EQUITY','ETF','CRYPTOCURRENCY','MUTUALFUND'].includes(q.quoteType))
      .slice(0, 8)
      .map(q => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        type: q.quoteType,
        exchange: q.exchDisp || q.exchange
      }))
    res.json(quotes)
  } catch(e) {
    res.json([])
  }
}
