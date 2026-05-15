export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  const { ticker } = req.query
  if (!ticker) return res.status(400).json({ error: 'Ticker required' })
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    const [quoteRes, summaryRes, newsRes, histRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`, { headers }),
      fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=financialData,defaultKeyStatistics,price,summaryDetail`, { headers }),
      fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${ticker}&newsCount=8&quotesCount=0`, { headers }),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=3mo`, { headers })
    ])
    const [quote, summary, news, hist] = await Promise.all([quoteRes.json(), summaryRes.json(), newsRes.json(), histRes.json()])
    res.json({ quote, summary, news, hist })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
