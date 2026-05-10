import { useState, useCallback } from 'react'

const C = {
  bg: '#0a0a0a', card: '#111', border: '#1e1e1e', text: '#f0f0f0',
  muted: '#666', green: '#22c55e', red: '#ef4444', amber: '#f59e0b',
  blue: '#3b82f6', surface: '#161616'
}

const SIG = {
  ACHETER: { color: '#22c55e', bg: '#052e16', border: '#166534' },
  VENDRE:  { color: '#ef4444', bg: '#2d0505', border: '#7f1d1d' },
  ATTENDRE:{ color: '#f59e0b', bg: '#2d1d05', border: '#92400e' }
}

async function fetchStockData(ticker) {
  const res = await fetch('/api/stock?ticker=' + ticker)
  if (!res.ok) throw new Error('Impossible de recuperer les donnees pour ' + ticker)
  return res.json()
}

function parseYahooData(data, ticker) {
  try {
    const price = data.summary && data.summary.quoteSummary && data.summary.quoteSummary.result && data.summary.quoteSummary.result[0]
    const chart = data.quote && data.quote.chart && data.quote.chart.result && data.quote.chart.result[0]
    const news = (data.news && data.news.news) || []
    const hist = data.hist && data.hist.chart && data.hist.chart.result && data.hist.chart.result[0]

    const currentPrice = (price && price.price && price.price.regularMarketPrice && price.price.regularMarketPrice.raw) || (chart && chart.meta && chart.meta.regularMarketPrice) || 0
    const prevClose = (price && price.price && price.price.regularMarketPreviousClose && price.price.regularMarketPreviousClose.raw) || (chart && chart.meta && chart.meta.chartPreviousClose) || 0
    const changePct = prevClose ? ((currentPrice - prevClose) / prevClose * 100) : 0

    const fd = (price && price.financialData) || {}
    const ks = (price && price.defaultKeyStatistics) || {}
    const sd = (price && price.summaryDetail) || {}

    const rawCloses = hist && hist.indicators && hist.indicators.quote && hist.indicators.quote[0] && hist.indicators.quote[0].close
    const closes = (rawCloses || []).filter(function(x) { return x != null })
    const rawHighs = hist && hist.indicators && hist.indicators.quote && hist.indicators.quote[0] && hist.indicators.quote[0].high
    const highs = (rawHighs || []).filter(function(x) { return x != null })
    const rawLows = hist && hist.indicators && hist.indicators.quote && hist.indicators.quote[0] && hist.indicators.quote[0].low
    const lows = (rawLows || []).filter(function(x) { return x != null })

    var rsi = null
    if (closes.length >= 15) {
      var gains = []
      var losses = []
      for (var i = 1; i < closes.length; i++) {
        var diff = closes[i] - closes[i - 1]
        gains.push(diff > 0 ? diff : 0)
        losses.push(diff < 0 ? Math.abs(diff) : 0)
      }
      var last14g = gains.slice(-14)
      var last14l = losses.slice(-14)
      var avgG = last14g.reduce(function(a, b) { return a + b }, 0) / 14
      var avgL = last14l.reduce(function(a, b) { return a + b }, 0) / 14
      rsi = avgL === 0 ? 100 : Math.round(100 - (100 / (1 + avgG / avgL)))
    }

    var sma20 = null
    var sma50 = null
    if (closes.length >= 20) {
      sma20 = (closes.slice(-20).reduce(function(a, b) { return a + b }, 0) / 20).toFixed(2)
    }
    if (closes.length >= 50) {
      sma50 = (closes.slice(-50).reduce(function(a, b) { return a + b }, 0) / 50).toFixed(2)
    }

    var bollinger = null
    if (closes.length >= 20) {
      var last20 = closes.slice(-20)
      var mean = last20.reduce(function(a, b) { return a + b }, 0) / 20
      var variance = last20.reduce(function(a, b) { return a + Math.pow(b - mean, 2) }, 0) / 20
      var std = Math.sqrt(variance)
      bollinger = {
        upper: (mean + 2 * std).toFixed(2),
        middle: mean.toFixed(2),
        lower: (mean - 2 * std).toFixed(2)
      }
    }

    var support = lows.length > 0 ? Math.min.apply(null, lows.slice(-20)).toFixed(2) : null
    var resistance = highs.length > 0 ? Math.max.apply(null, highs.slice(-20)).toFixed(2) : null
    var newsHeadlines = news.slice(0, 6).map(function(n) { return n.title }).filter(Boolean)

    return {
      ticker: ticker,
      currentPrice: currentPrice.toFixed(2),
      changePct: changePct.toFixed(2),
      marketCap: price && price.price && price.price.marketCap && price.price.marketCap.fmt,
      per: (sd.trailingPE && sd.trailingPE.raw) || (ks.trailingPE && ks.trailingPE.raw),
      eps: ks.trailingEps && ks.trailingEps.raw,
      revenue: fd.totalRevenue && fd.totalRevenue.fmt,
      revenueGrowth: fd.revenueGrowth && fd.revenueGrowth.fmt,
      grossMargins: fd.grossMargins && fd.grossMargins.fmt,
      debtToEquity: fd.debtToEquity && fd.debtToEquity.raw,
      freeCashflow: fd.freeCashflow && fd.freeCashflow.fmt,
      currentRatio: fd.currentRatio && fd.currentRatio.raw,
      rsi: rsi,
      sma20: sma20,
      sma50: sma50,
      bollinger: bollinger,
      support: support,
      resistance: resistance,
      closes: closes.slice(-30),
      newsHeadlines: newsHeadlines
    }
  } catch (e) {
    throw new Error('Erreur lecture donnees Yahoo Finance: ' + e.message)
  }
}

async function analyzeWithGemini(raw) {
  var bollingerText = raw.bollinger
    ? 'Sup:$' + raw.bollinger.upper + ' Inf:$' + raw.bollinger.lower
    : 'N/A'

  var newsText = raw.newsHeadlines.slice(0, 4).join(' | ')

  var prompt = 'Tu es expert analyste financier. Analyse ces donnees REELLES de ' + raw.ticker + ':\n'
    + 'Prix: $' + raw.currentPrice + ' (' + raw.changePct + '%) | RSI: ' + (raw.rsi || 'N/A')
    + ' | SMA20: $' + (raw.sma20 || 'N/A') + ' | SMA50: $' + (raw.sma50 || 'N/A') + '\n'
    + 'Bollinger: ' + bollingerText + '\n'
    + 'Support: $' + (raw.support || 'N/A') + ' | Resistance: $' + (raw.resistance || 'N/A') + '\n'
    + 'PER: ' + (raw.per ? raw.per.toFixed(1) : 'N/A') + ' | EPS: $' + (raw.eps ? raw.eps.toFixed(2) : 'N/A') + ' | Cap: ' + (raw.marketCap || 'N/A') + '\n'
    + 'Revenue: ' + (raw.revenue || 'N/A') + ' | Croissance: ' + (raw.revenueGrowth || 'N/A') + ' | FCF: ' + (raw.freeCashflow || 'N/A') + '\n'
    + 'News: ' + newsText + '\n'
    + 'Reponds UNIQUEMENT en JSON valide:\n'
    + '{"signal":"ACHETER|VENDRE|ATTENDRE","news_sentiment":0.0,"news_sentiment_label":"Positif|Negatif|Neutre","news_summary":"","technical_trend":"Haussiere|Baissiere|Neutre","technical_rsi_signal":"","technical_macd":"Haussier|Baissier|Neutre","technical_bollinger":"","technical_summary":"","fundamental_score":0,"fundamental_per_analysis":"","fundamental_health":"Excellent|Bon|Moyen|Faible","fundamental_summary":"","prediction_trend_7d":"","prediction_probability_up":0,"prediction_target":0,"prediction_risk":"Faible|Modere|Eleve","prediction_summary":"","recommendation":""}'

  var res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt })
  })
  var d = await res.json()
  if (d.error) throw new Error(d.error)
  var text = (d.result || '{}').replace(/```json/g, '').replace(/```/g, '').trim()
  var start = text.indexOf('{')
  var end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)
  return JSON.parse(text)
}

function Loading() {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', padding: '20px 0' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.muted, display: 'inline-block', animation: 'p 1.2s 0ms ease-in-out infinite' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.muted, display: 'inline-block', animation: 'p 1.2s 200ms ease-in-out infinite' }} />
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.muted, display: 'inline-block', animation: 'p 1.2s 400ms ease-in-out infinite' }} />
    </div>
  )
}

function SentimentBar(props) {
  var value = props.value || 0.5
  var pct = Math.round(value * 100)
  var color = pct > 60 ? C.green : pct < 40 ? C.red : C.amber
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 4 }}>
        <span>Negatif</span>
        <span style={{ color: color, fontWeight: 600 }}>{pct}% positif</span>
        <span>Positif</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.surface }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 2, background: color }} />
      </div>
    </div>
  )
}

function RsiGauge(props) {
  var value = props.value
  var v = Math.min(100, Math.max(0, Number(value) || 50))
  var color = v > 70 ? C.red : v < 30 ? C.green : C.amber
  var label = v > 70 ? 'Sur-achete' : v < 30 ? 'Sur-vendu' : 'Zone neutre'
  return (
    <div>
      <div style={{ height: 4, borderRadius: 2, background: C.surface, position: 'relative', margin: '8px 0' }}>
        <div style={{ position: 'absolute', left: 'calc(' + v + '% - 5px)', top: -4, width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid ' + C.bg }} />
      </div>
      <div style={{ fontSize: 11, color: color, textAlign: 'right' }}>RSI {v} - {label}</div>
    </div>
  )
}

function MRow(props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid ' + C.border, fontSize: 13 }}>
      <span style={{ color: C.muted }}>{props.label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: props.color || C.text }}>{props.value != null ? props.value : '—'}</span>
    </div>
  )
}

function MCard(props) {
  return (
    <div style={{ background: C.surface, borderRadius: 8, padding: '10px 12px', border: '1px solid ' + C.border }}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{props.label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: props.color || C.text }}>{props.value != null ? props.value : '—'}</div>
    </div>
  )
}

function Section(props) {
  return (
    <div>
      <button onClick={props.onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', color: C.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, padding: '10px 0', cursor: 'pointer', borderTop: '1px solid ' + C.border }}>
        <span>{props.title}</span>
        <span style={{ fontSize: 16 }}>{props.expanded ? '-' : '+'}</span>
      </button>
      {props.expanded && (
        <div style={{ fontSize: 13, lineHeight: 1.7, paddingBottom: 8 }}>
          {props.children}
        </div>
      )}
    </div>
  )
}

function StockCard(props) {
  var ticker = props.ticker
  var data = props.data
  var onAnalyze = props.onAnalyze
  var [exp, setExp] = useState({})
  var tog = function(k) { setExp(function(p) { var n = Object.assign({}, p); n[k] = !p[k]; return n }) }
  var sig = (data && data.ai && data.ai.signal) || 'ATTENDRE'
  var sc = SIG[sig] || SIG.ATTENDRE
  var raw = data && data.raw
  var ai = data && data.ai
  var chg = Number((raw && raw.changePct) || 0)

  return (
    <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{ticker}</div>
          {raw && (
            <div style={{ fontSize: 14, color: C.muted, fontFamily: 'monospace' }}>
              ${raw.currentPrice}
              <span style={{ marginLeft: 8, color: chg >= 0 ? C.green : C.red, fontWeight: 600 }}>
                {chg >= 0 ? '+' : ''}{chg}%
              </span>
              {raw.marketCap && <span style={{ marginLeft: 8, fontSize: 12 }}>{raw.marketCap}</span>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!data?.loading && !data?.error && ai && (
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, border: '1px solid ' + sc.border }}>
              {sig}
            </span>
          )}
          <button onClick={onAnalyze} style={{ padding: '8px 12px', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, cursor: 'pointer', fontSize: 16 }}>
            ↻
          </button>
        </div>
      </div>

      {data && data.loading && <Loading />}
      {data && data.error && (
        <div style={{ color: C.red, fontSize: 12, padding: 8, background: '#1a0505', borderRadius: 6 }}>
          {data.error}
        </div>
      )}

      {raw && ai && !(data && data.loading) && (
        <div>
          <Section title="News et Sentiment" expanded={exp.news} onToggle={function() { tog('news') }}>
            <SentimentBar value={ai.news_sentiment} />
            <div style={{ background: C.surface, borderRadius: 6, padding: '8px 10px', margin: '6px 0' }}>
              {raw.newsHeadlines.map(function(h, i) {
                return <div key={i} style={{ fontSize: 11, color: C.muted, paddingLeft: 8, borderLeft: '2px solid ' + C.border, marginBottom: 3 }}>· {h}</div>
              })}
            </div>
            <div style={{ color: C.muted }}>{ai.news_summary}</div>
          </Section>

          <Section title="Analyse Technique" expanded={exp.tech} onToggle={function() { tog('tech') }}>
            {raw.rsi && (
              <div>
                <div style={{ fontSize: 11, color: C.muted }}>RSI ({raw.rsi})</div>
                <RsiGauge value={raw.rsi} />
              </div>
            )}
            <MRow label="Tendance" value={ai.technical_trend} color={ai.technical_trend === 'Haussiere' ? C.green : ai.technical_trend === 'Baissiere' ? C.red : C.amber} />
            <MRow label="MACD" value={ai.technical_macd} color={ai.technical_macd === 'Haussier' ? C.green : ai.technical_macd === 'Baissier' ? C.red : C.amber} />
            <MRow label="Bollinger" value={ai.technical_bollinger} />
            <MRow label="SMA 20j" value={raw.sma20 ? '$' + raw.sma20 : null} />
            <MRow label="SMA 50j" value={raw.sma50 ? '$' + raw.sma50 : null} />
            {raw.bollinger && (
              <div>
                <MRow label="Bande sup." value={'$' + raw.bollinger.upper} color={C.red} />
                <MRow label="Bande inf." value={'$' + raw.bollinger.lower} color={C.green} />
              </div>
            )}
            <MRow label="Support" value={raw.support ? '$' + raw.support : null} color={C.green} />
            <MRow label="Resistance" value={raw.resistance ? '$' + raw.resistance : null} color={C.red} />
            <div style={{ color: C.muted, marginTop: 8 }}>{ai.technical_summary}</div>
          </Section>

          <Section title="Analyse Fondamentale" expanded={exp.fund} onToggle={function() { tog('fund') }}>
            <MRow label="PER" value={raw.per ? raw.per.toFixed(1) : null} />
            <MRow label="EPS" value={raw.eps ? '$' + raw.eps.toFixed(2) : null} />
            <MRow label="Revenue" value={raw.revenue} />
            <MRow label="Croissance" value={raw.revenueGrowth} color={raw.revenueGrowth && raw.revenueGrowth.startsWith('-') ? C.red : C.green} />
            <MRow label="Marge brute" value={raw.grossMargins} />
            <MRow label="Free Cash Flow" value={raw.freeCashflow} />
            <MRow label="Dette/Capitaux" value={raw.debtToEquity ? raw.debtToEquity.toFixed(1) : null} />
            <MRow label="Ratio courant" value={raw.currentRatio ? raw.currentRatio.toFixed(2) : null} />
            <MRow label="Sante" value={ai.fundamental_health} />
            <MRow label="Valorisation" value={ai.fundamental_per_analysis} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
              <div style={{ fontSize: 12, color: C.muted }}>Score:</div>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.surface }}>
                <div style={{ height: '100%', width: ai.fundamental_score + '%', borderRadius: 2, background: ai.fundamental_score > 70 ? C.green : ai.fundamental_score > 40 ? C.amber : C.red }} />
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{ai.fundamental_score}/100</div>
            </div>
            <div style={{ color: C.muted }}>{ai.fundamental_summary}</div>
          </Section>

          <Section title="Prediction IA 7 jours" expanded={exp.pred} onToggle={function() { tog('pred') }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <MCard label="Probabilite hausse" value={ai.prediction_probability_up + '%'} color={ai.prediction_probability_up > 60 ? C.green : ai.prediction_probability_up < 40 ? C.red : C.amber} />
              <MCard label="Prix cible 7j" value={ai.prediction_target ? '$' + ai.prediction_target : null} />
            </div>
            <MRow label="Tendance 7j" value={ai.prediction_trend_7d} />
            <MRow label="Risque" value={ai.prediction_risk} color={ai.prediction_risk === 'Faible' ? C.green : ai.prediction_risk === 'Eleve' ? C.red : C.amber} />
            <div style={{ color: C.muted, marginTop: 8 }}>{ai.prediction_summary}</div>
          </Section>

          <div style={{ marginTop: 12, padding: '12px 14px', background: C.surface, borderRadius: 8, fontSize: 13, color: C.text, borderLeft: '3px solid ' + sc.color }}>
            {ai.recommendation}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Yahoo Finance · Gemini AI · {data.date}
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  var [tab, setTab] = useState('dashboard')
  var [tickers, setTickers] = useState(['AAPL', 'TSLA', 'NVDA'])
  var [input, setInput] = useState('')
  var [data, setData] = useState({})
  var [running, setRunning] = useState(false)
  var [alerts, setAlerts] = useState([
    { id: 1, ticker: 'AAPL', type: 'price', value: '200', direction: 'above' },
    { id: 2, ticker: 'TSLA', type: 'percent', value: '5', direction: 'below' }
  ])
  var [alertForm, setAlertForm] = useState({ ticker: '', type: 'price', value: '', direction: 'above' })
  var [btTicker, setBtTicker] = useState('AAPL')
  var [btStrategy, setBtStrategy] = useState('RSI + SMA')
  var [btResult, setBtResult] = useState(null)
  var [btLoading, setBtLoading] = useState(false)

  var analyze = useCallback(async function(ticker) {
    setData(function(p) { var n = Object.assign({}, p); n[ticker] = { loading: true }; return n })
    try {
      var raw = parseYahooData(await fetchStockData(ticker), ticker)
      var ai = await analyzeWithGemini(raw)
      var date = new Date().toLocaleString('fr-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      setData(function(p) { var n = Object.assign({}, p); n[ticker] = { raw: raw, ai: ai, date: date }; return n })
    } catch (e) {
      setData(function(p) { var n = Object.assign({}, p); n[ticker] = { error: e.message }; return n })
    }
  }, [])

  var runAll = async function() {
    setRunning(true)
    for (var i = 0; i < tickers.length; i++) {
      await analyze(tickers[i])
    }
    setRunning(false)
  }

  var addTicker = function() {
    var v = input.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
    if (v && !tickers.includes(v)) setTickers(function(p) { return p.concat([v]) })
    setInput('')
  }

  var addAlert = function() {
    if (!alertForm.ticker || !alertForm.value) return
    var newAlert = Object.assign({}, alertForm, { id: Date.now(), ticker: alertForm.ticker.toUpperCase() })
    setAlerts(function(p) { return p.concat([newAlert]) })
    setAlertForm({ ticker: '', type: 'price', value: '', direction: 'above' })
  }

  var runBacktest = async function() {
    setBtLoading(true)
    setBtResult(null)
    try {
      var raw = parseYahooData(await fetchStockData(btTicker), btTicker)
      var prompt = 'Expert backtest. Donnees reelles ' + btTicker + ': Prix=' + raw.currentPrice + ', RSI=' + raw.rsi + ', SMA20=' + raw.sma20 + ', SMA50=' + raw.sma50 + ', Support=' + raw.support + ', Resistance=' + raw.resistance + ', Historique30j=[' + (raw.closes || []).join(',') + ']. Strategie: "' + btStrategy + '". Reponds JSON: {"strategy":"","ticker":"","period":"30j","total_return":"","win_rate":"","max_drawdown":"","nb_trades":0,"sharpe_ratio":"","vs_buy_hold":"","trades":[{"date":"","action":"ACHAT|VENTE","price":0,"return_pct":null,"reason":""}],"summary":""}'
      var res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt }) })
      var d = await res.json()
      var text = (d.result || '{}').replace(/```json/g, '').replace(/```/g, '').trim()
      setBtResult(JSON.parse(text))
    } catch (e) {
      setBtResult({ error: e.message })
    }
    setBtLoading(false)
  }

  var inputStyle = { width: '100%', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: C.text, marginBottom: 8 }
  var selectStyle = { width: '100%', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.text, marginBottom: 8 }
  var btnPrimary = { width: '100%', padding: 12, background: C.text, color: C.bg, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
  var cardStyle = { background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 16, marginBottom: 12 }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', paddingBottom: 80, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{'@keyframes p { 0%,100%{opacity:.2} 50%{opacity:1} } input::placeholder{color:#444}'}</style>

      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Stock Agent Pro</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Yahoo Finance · Gemini AI · 100% gratuit</div>
      </div>

      <div style={{ display: 'flex', background: C.card, borderBottom: '1px solid ' + C.border, position: 'sticky', top: 57, zIndex: 9 }}>
        {[['dashboard', 'Dashboard'], ['alerts', 'Alertes'], ['backtest', 'Backtest']].map(function(item) {
          var id = item[0]
          var label = item[1]
          return (
            <button key={id} style={{ flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 500, border: 'none', background: 'none', color: tab === id ? C.text : C.muted, borderBottom: tab === id ? '2px solid ' + C.text : '2px solid transparent', cursor: 'pointer' }} onClick={function() { setTab(id) }}>
              {label}
            </button>
          )
        })}
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={input} onChange={function(e) { setInput(e.target.value.toUpperCase()) }} placeholder="Ajouter (AAPL, TSLA...)" onKeyDown={function(e) { if (e.key === 'Enter') addTicker() }} style={Object.assign({}, inputStyle, { flex: 1, marginBottom: 0 })} />
              <button onClick={addTicker} style={{ padding: '10px 14px', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>+</button>
            </div>
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tickers.map(function(t) {
                return (
                  <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: C.surface, border: '1px solid ' + C.border, borderRadius: 20, fontSize: 12, fontWeight: 600, color: C.text, fontFamily: 'monospace' }}>
                    {t}
                    <span onClick={function() { setTickers(function(p) { return p.filter(function(x) { return x !== t }) }); setData(function(p) { var n = Object.assign({}, p); delete n[t]; return n }) }} style={{ cursor: 'pointer', color: C.muted }}>x</span>
                  </span>
                )
              })}
            </div>
            <button style={btnPrimary} onClick={runAll} disabled={running || !tickers.length}>
              {running ? 'Analyse en cours...' : 'Tout analyser'}
            </button>
            <div style={{ marginTop: 12 }}>
              {tickers.length === 0
                ? <div style={{ textAlign: 'center', color: C.muted, padding: '40px 0', fontSize: 14 }}>Ajoutez des actions pour commencer</div>
                : tickers.map(function(t) { return <StockCard key={t} ticker={t} data={data[t]} onAnalyze={function() { analyze(t) }} /> })
              }
            </div>
          </div>
        )}

        {tab === 'alerts' && (
          <div>
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Nouvelle alerte</div>
              <input placeholder="Ticker (AAPL...)" value={alertForm.ticker} onChange={function(e) { setAlertForm(function(p) { return Object.assign({}, p, { ticker: e.target.value.toUpperCase() }) }) }} style={inputStyle} />
              <select value={alertForm.type} onChange={function(e) { setAlertForm(function(p) { return Object.assign({}, p, { type: e.target.value }) }) }} style={selectStyle}>
                <option value="price">Prix ($)</option>
                <option value="percent">Variation (%)</option>
                <option value="rsi">RSI</option>
              </select>
              <select value={alertForm.direction} onChange={function(e) { setAlertForm(function(p) { return Object.assign({}, p, { direction: e.target.value }) }) }} style={selectStyle}>
                <option value="above">Au-dessus de</option>
                <option value="below">En-dessous de</option>
              </select>
              <input type="number" placeholder="Valeur" value={alertForm.value} onChange={function(e) { setAlertForm(function(p) { return Object.assign({}, p, { value: e.target.value }) }) }} style={inputStyle} />
              <button style={btnPrimary} onClick={addAlert}>+ Creer l'alerte</button>
            </div>
            {alerts.map(function(a) {
              return (
                <div key={a.id} style={Object.assign({}, cardStyle, { display: 'flex', alignItems: 'center', justifyContent: 'space-between' })}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{a.ticker}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {a.direction === 'above' ? 'Au-dessus de' : 'En-dessous de'} {a.value}{a.type === 'price' ? '$' : a.type === 'percent' ? '%' : ' RSI'}
                    </div>
                  </div>
                  <button onClick={function() { setAlerts(function(p) { return p.filter(function(x) { return x.id !== a.id }) }) }} style={{ background: 'none', border: 'none', color: C.red, fontSize: 18, cursor: 'pointer' }}>X</button>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'backtest' && (
          <div>
            <div style={cardStyle}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 12 }}>Configuration</div>
              <input value={btTicker} onChange={function(e) { setBtTicker(e.target.value.toUpperCase()) }} placeholder="Ticker" style={inputStyle} />
              <select value={btStrategy} onChange={function(e) { setBtStrategy(e.target.value) }} style={selectStyle}>
                <option value="RSI + SMA">RSI + SMA Crossover</option>
                <option value="Bollinger Bands">Bollinger Bands</option>
                <option value="RSI seul (30/70)">RSI seul (30/70)</option>
                <option value="SMA 20/50 Crossover">SMA 20/50 Crossover</option>
              </select>
              <button style={btnPrimary} onClick={runBacktest} disabled={btLoading}>
                {btLoading ? 'Simulation...' : 'Lancer le backtest'}
              </button>
            </div>
            {btLoading && <Loading />}
            {btResult && !btLoading && (
              btResult.error
                ? <div style={{ color: C.red, padding: 16, fontSize: 13 }}>{btResult.error}</div>
                : <div style={cardStyle}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>{btResult.ticker} - {btResult.strategy}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <MCard label="Rendement total" value={btResult.total_return} color={btResult.total_return && btResult.total_return.startsWith('-') ? C.red : C.green} />
                      <MCard label="Win rate" value={btResult.win_rate} color={C.blue} />
                      <MCard label="Max Drawdown" value={btResult.max_drawdown} color={C.red} />
                      <MCard label="vs Buy and Hold" value={btResult.vs_buy_hold} color={C.amber} />
                    </div>
                    <MRow label="Nombre de trades" value={btResult.nb_trades} />
                    <MRow label="Ratio de Sharpe" value={btResult.sharpe_ratio} />
                    <div style={{ color: C.muted, fontSize: 13, margin: '10px 0' }}>{btResult.summary}</div>
                    <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Historique</div>
                    {(btResult.trades || []).map(function(t, i) {
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid ' + C.border, fontSize: 12 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 12, fontWeight: 700, fontSize: 11, background: t.action === 'ACHAT' ? '#052e16' : '#2d0505', color: t.action === 'ACHAT' ? C.green : C.red }}>{t.action}</span>
                          <span style={{ color: C.muted, fontFamily: 'monospace' }}>{t.date}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>${t.price}</span>
                          {t.return_pct != null && <span style={{ color: Number(t.return_pct) >= 0 ? C.green : C.red, fontFamily: 'monospace' }}>{Number(t.return_pct) >= 0 ? '+' : ''}{t.return_pct}%</span>}
                          <span style={{ color: C.muted, fontSize: 11 }}>{t.reason}</span>
                        </div>
                      )
                    })}
                  </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
