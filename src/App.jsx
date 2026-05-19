import { useState, useCallback, useEffect, useRef } from 'react'

const C = {
  bg: '#e8edf2', card: '#ffffff', border: '#94a3b8', text: '#000000',
  muted: '#1e293b', green: '#166534', red: '#991b1b', amber: '#92400e',
  blue: '#1e40af', surface: '#dde3ea', purple: '#4c1d95',
  greenBg: '#bbf7d0', redBg: '#fecaca', amberBg: '#fde68a', blueBg: '#bfdbfe'
}
const SIG = {
  ACHETER:  { color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  VENDRE:   { color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  ATTENDRE: { color: '#d97706', bg: '#fef3c7', border: '#fcd34d' }
}

// ─── CACHE ─────────────────────────────────────────────
const CACHE = {}
const CACHE_TTL = 15 * 60 * 1000
const getCache = k => { const i = CACHE[k]; return (i && Date.now()-i.t < CACHE_TTL) ? i.d : null }
const setCache = (k,d) => { CACHE[k] = {d, t: Date.now()} }
const cacheAge = k => { const i = CACHE[k]; if(!i) return null; const m = Math.floor((Date.now()-i.t)/60000); return m < 1 ? 'A l\'instant' : 'Il y a '+m+' min' }

// ─── TECHNICAL CALCULATIONS ────────────────────────────
function calcEMA(prices, period) {
  if (prices.length < period) return null
  const k = 2 / (period + 1)
  let ema = prices.slice(0, period).reduce((a,b)=>a+b,0) / period
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1-k)
  return ema
}

function calcMACD(closes) {
  if (closes.length < 26) return null
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  if (!ema12 || !ema26) return null
  return ema12 > ema26 ? 'Haussier' : 'Baissier'
}

function calcRSI(closes) {
  if (closes.length < 15) return null
  const gains = [], losses = []
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1]
    gains.push(d > 0 ? d : 0)
    losses.push(d < 0 ? Math.abs(d) : 0)
  }
  const avgG = gains.slice(-14).reduce((a,b)=>a+b,0)/14
  const avgL = losses.slice(-14).reduce((a,b)=>a+b,0)/14
  return avgL === 0 ? 100 : Math.round(100-(100/(1+avgG/avgL)))
}

function calcBollinger(closes) {
  if (closes.length < 20) return null
  const last20 = closes.slice(-20)
  const mean = last20.reduce((a,b)=>a+b,0)/20
  const std = Math.sqrt(last20.reduce((a,b)=>a+Math.pow(b-mean,2),0)/20)
  return { upper: (mean+2*std).toFixed(2), middle: mean.toFixed(2), lower: (mean-2*std).toFixed(2) }
}

// ─── API CALLS ─────────────────────────────────────────
async function fetchMarket() {
  const cached = getCache('market')
  if (cached) return cached
  const r = await fetch('/api/market')
  const d = await r.json()
  setCache('market', d)
  return d
}

async function fetchStockData(ticker, period) {
  const key = ticker+'_'+(period||'1j')
  const cached = getCache(key)
  if (cached) return { ...cached, fromCache: true }
  const r = await fetch('/api/stock?ticker='+ticker+'&period='+(period||'1j'))
  if (!r.ok) throw new Error('Erreur réseau pour '+ticker)
  const d = await r.json()
  setCache(key, d)
  return d
}

function parseStock(data, ticker) {
  try {
    const yq = data.yahoo && data.yahoo.quote && data.yahoo.quote.chart && data.yahoo.quote.chart.result && data.yahoo.quote.chart.result[0]
    const yh = data.yahoo && data.yahoo.hist && data.yahoo.hist.chart && data.yahoo.hist.chart.result && data.yahoo.hist.chart.result[0]
    const avo = data.av && data.av.overview
    const fmpQ = data.fmp && data.fmp.quote
    const fmpP = data.fmp && data.fmp.profile
    const news = (data.news && data.news.articles) || []
    const macro = data.macro || {}

    // Price from chart (works without crumb)
    const meta = yq && yq.meta
    const currentPrice = (meta && meta.regularMarketPrice) || 0
    const prevClose = (meta && meta.chartPreviousClose) || 0
    let changePct = prevClose ? ((currentPrice - prevClose) / prevClose * 100) : 0

    // If period > 1d, calculate change from first to last close
    const qCloses = yq && yq.indicators && yq.indicators.quote && yq.indicators.quote[0] && yq.indicators.quote[0].close
    const qArr = (qCloses||[]).filter(x => x != null)
    if (qArr.length >= 2) changePct = ((qArr[qArr.length-1] - qArr[0]) / qArr[0] * 100)

    // Historical data for technicals
    const rawCloses = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].close
    const closes = (rawCloses||[]).filter(x => x != null)
    const rawHighs = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].high
    const highs = (rawHighs||[]).filter(x => x != null)
    const rawLows = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].low
    const lows = (rawLows||[]).filter(x => x != null)

    // RSI - try Alpha Vantage first, then calculate
    let rsi = null, rsiSrc = 'Calculé'
    const avRsiData = data.av && data.av.rsi && data.av.rsi['Technical Analysis: RSI']
    if (avRsiData && !data.av.rsi.Information) {
      const k = Object.keys(avRsiData)[0]
      if (k) { rsi = parseFloat(avRsiData[k].RSI).toFixed(1); rsiSrc = 'Alpha Vantage' }
    }
    if (!rsi) rsi = calcRSI(closes)

    // MACD - calculated manually (AV MACD is premium)
    const macd = calcMACD(closes)

    // Bollinger - calculate manually
    const bollinger = calcBollinger(closes)

    const sma20 = closes.length>=20 ? (closes.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(2) : null
    const sma50 = closes.length>=50 ? (closes.slice(-50).reduce((a,b)=>a+b,0)/50).toFixed(2) : null
    const support = lows.length > 0 ? Math.min(...lows.slice(-20)).toFixed(2) : null
    const resistance = highs.length > 0 ? Math.max(...highs.slice(-20)).toFixed(2) : null

    // Fundamentals from Alpha Vantage OVERVIEW (free, no crumb needed)
    const avValid = avo && avo.Symbol && !avo.Information && !avo.Note
    const per = avValid && avo.PERatio && avo.PERatio !== 'None' ? parseFloat(avo.PERatio).toFixed(1)
              : fmpQ && fmpQ.pe ? parseFloat(fmpQ.pe).toFixed(1) : null
    const eps = avValid && avo.EPS && avo.EPS !== 'None' ? parseFloat(avo.EPS).toFixed(2)
              : fmpQ && fmpQ.eps ? parseFloat(fmpQ.eps).toFixed(2) : null
    const revenue = avValid && avo.RevenueTTM && avo.RevenueTTM !== 'None' ? formatNum(parseInt(avo.RevenueTTM)) : null
    const revenueGrowth = avValid && avo.QuarterlyRevenueGrowthYOY && avo.QuarterlyRevenueGrowthYOY !== 'None' ? (parseFloat(avo.QuarterlyRevenueGrowthYOY)*100).toFixed(1)+'%' : null
    const grossMargins = avValid && avo.GrossProfitTTM && avo.GrossProfitTTM !== 'None' ? formatNum(parseInt(avo.GrossProfitTTM)) : null
    const debtToEquity = avValid && avo.DebtToEquityRatio && avo.DebtToEquityRatio !== 'None' ? parseFloat(avo.DebtToEquityRatio).toFixed(2) : null
    const currentRatio = avValid && avo.CurrentRatio && avo.CurrentRatio !== 'None' ? parseFloat(avo.CurrentRatio).toFixed(2) : null
    const beta = (avValid && avo.Beta && avo.Beta !== 'None') ? parseFloat(avo.Beta).toFixed(2) : (fmpP && fmpP.beta ? parseFloat(fmpP.beta).toFixed(2) : null)
    const sector = (avValid && avo.Sector) || (fmpP && fmpP.sector) || null
    const industry = (avValid && avo.Industry) || (fmpP && fmpP.industry) || null
    const marketCap = (avValid && avo.MarketCapitalization && avo.MarketCapitalization !== 'None') ? formatNum(parseInt(avo.MarketCapitalization)) : (meta && meta.regularMarketPrice ? null : null)
    const fiftyTwoWeekHigh = avValid && avo['52WeekHigh'] ? parseFloat(avo['52WeekHigh']).toFixed(2) : (meta && meta.fiftyTwoWeekHigh ? meta.fiftyTwoWeekHigh.toFixed(2) : null)
    const fiftyTwoWeekLow = avValid && avo['52WeekLow'] ? parseFloat(avo['52WeekLow']).toFixed(2) : (meta && meta.fiftyTwoWeekLow ? meta.fiftyTwoWeekLow.toFixed(2) : null)
    const dividendYield = avValid && avo.DividendYield && avo.DividendYield !== 'None' && parseFloat(avo.DividendYield) > 0 ? (parseFloat(avo.DividendYield)*100).toFixed(2)+'%' : null
    const analystTarget = avValid && avo.AnalystTargetPrice && avo.AnalystTargetPrice !== 'None' ? parseFloat(avo.AnalystTargetPrice).toFixed(2) : null
    const roe = avValid && avo.ReturnOnEquityTTM && avo.ReturnOnEquityTTM !== 'None' ? (parseFloat(avo.ReturnOnEquityTTM)*100).toFixed(1)+'%' : null
    const roa = avValid && avo.ReturnOnAssetsTTM && avo.ReturnOnAssetsTTM !== 'None' ? (parseFloat(avo.ReturnOnAssetsTTM)*100).toFixed(1)+'%' : null

    const newsHeadlines = news.slice(0,8).map(n => ({ title: n.title, source: n.source && n.source.name, url: n.url }))

    const sources = ['Yahoo Finance']
    if (rsiSrc === 'Alpha Vantage' || avValid) sources.push('Alpha Vantage')
    if (fmpQ || fmpP) sources.push('FMP')
    if (newsHeadlines.length > 0 && data.news) sources.push('NewsAPI')
    if (macro.fedRate) sources.push('FRED')

    return {
      ticker, currentPrice: currentPrice.toFixed(2), changePct: changePct.toFixed(2),
      volume: (meta && meta.regularMarketVolume) || 0,
      marketCap, fiftyTwoWeekHigh, fiftyTwoWeekLow,
      rsi, rsiSrc, macd, bollinger, sma20, sma50, support, resistance,
      per, eps, revenue, revenueGrowth, grossMargins, debtToEquity, currentRatio,
      roe, roa, beta, sector, industry, dividendYield, analystTarget,
      newsHeadlines, closes: closes.slice(-30), sources,
      macro: { fedRate: macro.fedRate, cpi: macro.cpi, vix: macro.vix }
    }
  } catch(e) { throw new Error('Erreur parsing: ' + e.message) }
}

function formatNum(n) {
  if (!n || isNaN(n)) return null
  if (n >= 1e12) return (n/1e12).toFixed(2)+'T'
  if (n >= 1e9) return (n/1e9).toFixed(2)+'B'
  if (n >= 1e6) return (n/1e6).toFixed(2)+'M'
  return n.toString()
}

async function analyzeWithGemini(raw) {
  const prompt = 'Expert analyste financier senior. Analyse complète de ' + raw.ticker + ':\n'
    + 'PRIX: $' + raw.currentPrice + ' (' + raw.changePct + '%) | Cap: ' + (raw.marketCap||'N/A') + '\n'
    + '52W: Low=$' + (raw.fiftyTwoWeekLow||'N/A') + ' High=$' + (raw.fiftyTwoWeekHigh||'N/A') + '\n'
    + 'TECHNIQUE: RSI=' + (raw.rsi||'N/A') + '(' + raw.rsiSrc + ') MACD=' + (raw.macd||'N/A') + '\n'
    + 'Boll: Sup=$' + (raw.bollinger&&raw.bollinger.upper||'N/A') + ' Inf=$' + (raw.bollinger&&raw.bollinger.lower||'N/A') + '\n'
    + 'SMA20=$' + (raw.sma20||'N/A') + ' SMA50=$' + (raw.sma50||'N/A') + ' Support=$' + (raw.support||'N/A') + ' Res=$' + (raw.resistance||'N/A') + '\n'
    + 'FONDAMENTAUX (Alpha Vantage): PER=' + (raw.per||'N/A') + ' EPS=$' + (raw.eps||'N/A') + ' ROE=' + (raw.roe||'N/A') + ' ROA=' + (raw.roa||'N/A') + '\n'
    + 'Revenue=' + (raw.revenue||'N/A') + ' Growth=' + (raw.revenueGrowth||'N/A') + ' Marge=' + (raw.grossMargins||'N/A') + '\n'
    + 'Beta=' + (raw.beta||'N/A') + ' Dividende=' + (raw.dividendYield||'N/A') + ' CibleAnalystes=$' + (raw.analystTarget||'N/A') + '\n'
    + 'Secteur=' + (raw.sector||'N/A') + ' | Industrie=' + (raw.industry||'N/A') + '\n'
    + 'MACRO: Fed=' + (raw.macro&&raw.macro.fedRate||'N/A') + '% CPI=' + (raw.macro&&raw.macro.cpi||'N/A') + ' VIX=' + (raw.macro&&raw.macro.vix||'N/A') + '\n'
    + 'NEWS: ' + raw.newsHeadlines.slice(0,5).map(n=>n.title).join(' | ') + '\n'
    + 'Sources: ' + raw.sources.join(',') + '\n\n'
    + 'JSON UNIQUEMENT:\n'
    + '{"signal":"ACHETER|VENDRE|ATTENDRE","confidence":0,"news_sentiment":0.0,"news_sentiment_label":"","news_summary":"","technical_trend":"Haussiere|Baissiere|Neutre","technical_rsi_signal":"","technical_macd":"","technical_bollinger":"","technical_summary":"","fundamental_score":0,"fundamental_per_analysis":"","fundamental_health":"Excellent|Bon|Moyen|Faible","fundamental_summary":"","macro_impact":"Positif|Negatif|Neutre","macro_summary":"","prediction_trend_7d":"","prediction_probability_up":0,"prediction_target":0,"prediction_risk":"Faible|Modere|Eleve","prediction_summary":"","recommendation":""}'

  const r = await fetch('/api/ai', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt}) })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  let text = (d.result||'{}').replace(/```json|```/g,'').trim()
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s !== -1 && e !== -1) text = text.slice(s, e+1)
  return JSON.parse(text)
}

// ─── UI COMPONENTS ─────────────────────────────────────
function Loading() {
  return <div style={{display:'flex',gap:5,justifyContent:'center',padding:'20px 0'}}>
    {[0,200,400].map((d,i) => <span key={i} style={{width:5,height:5,borderRadius:'50%',background:C.muted,display:'inline-block',animation:'p 1.2s '+d+'ms ease-in-out infinite'}}/>)}
  </div>
}
function MRow({ label, value, color }) {
  return <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid '+C.border,fontSize:13}}>
    <span style={{color:'#334155',fontWeight:500}}>{label}</span>
    <span style={{fontFamily:'monospace',fontWeight:700,color:color||'#000000'}}>{value != null ? value : '—'}</span>
  </div>
}
function MCard({ label, value, color, sub }) {
  return <div style={{background:C.surface,borderRadius:8,padding:'10px 12px',border:'1px solid '+C.border}}>
    <div style={{fontSize:11,color:'#334155',marginBottom:4,fontWeight:600}}>{label}</div>
    <div style={{fontSize:16,fontWeight:700,fontFamily:'monospace',color:color||C.text}}>{value != null ? value : '—'}</div>
    {sub && <div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
  </div>
}
function SBar({ value=0.5 }) {
  const pct = Math.round(value*100), c = pct>60?C.green:pct<40?C.red:C.amber
  return <div style={{margin:'8px 0'}}>
    <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:C.muted,marginBottom:4}}>
      <span>Négatif</span><span style={{color:c,fontWeight:600}}>{pct}%</span><span>Positif</span>
    </div>
    <div style={{height:4,borderRadius:2,background:C.surface}}><div style={{height:'100%',width:pct+'%',borderRadius:2,background:c}}/></div>
  </div>
}
function RsiGauge({ value, source }) {
  const v = Math.min(100,Math.max(0,Number(value)||50))
  const c = v>70?C.red:v<30?C.green:C.amber
  return <div>
    <div style={{height:4,borderRadius:2,background:C.surface,position:'relative',margin:'8px 0'}}>
      <div style={{position:'absolute',left:'calc('+v+'% - 5px)',top:-4,width:12,height:12,borderRadius:'50%',background:c,border:'2px solid '+C.bg}}/>
    </div>
    <div style={{fontSize:11,color:c,textAlign:'right'}}>RSI {v} — {v>70?'Sur-acheté ⚠️':v<30?'Sur-vendu ✅':'Neutre'} ({source})</div>
  </div>
}
function Section({ title, expanded, onToggle, children }) {
  return <div>
    <button onClick={onToggle} style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%',background:'none',border:'none',color:C.muted,fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:1,padding:'10px 0',cursor:'pointer',borderTop:'1px solid '+C.border}}>
      <span style={{color:'#1e293b',fontWeight:700}}>{title}</span><span style={{fontSize:16,color:'#1e293b'}}>{expanded?'−':'+'}</span>
    </button>
    {expanded && <div style={{fontSize:13,lineHeight:1.7,paddingBottom:8}}>{children}</div>}
  </div>
}
function FearGreedGauge({ value, label }) {
  const c = value>=75?C.green:value>=55?'#22c55e':value>=45?C.amber:value>=25?C.red:'#991b1b'
  const emoji = value>=75?'🟢':value>=55?'🟡':value>=45?'🟠':value>=25?'🔴':'⚫'
  return <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:10,padding:'8px 12px',textAlign:'center',minWidth:80}}>
    <div style={{fontSize:10,color:C.muted,marginBottom:2,textTransform:'uppercase',letterSpacing:0.5}}>Fear&Greed</div>
    <div style={{fontSize:22,fontWeight:700,color:c,fontFamily:'monospace'}}>{value}</div>
    <div style={{fontSize:10,color:c,fontWeight:600}}>{emoji} {label}</div>
  </div>
}
function IndexCard({ name, data }) {
  if (!data||!data.price) return <div style={{background:C.surface,borderRadius:8,padding:'6px 10px',opacity:0.4}}><div style={{fontSize:10,color:C.muted}}>{name}</div><div style={{fontSize:12,color:C.muted}}>—</div></div>
  const chg = parseFloat(data.chg)
  return <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:8,padding:'6px 10px'}}>
    <div style={{fontSize:10,color:'#334155',fontWeight:600}}>{name}</div>
    <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:'#000000'}}>{parseFloat(data.price).toLocaleString()}</div>
    <div style={{fontSize:11,color:chg>=0?C.green:C.red,fontWeight:500}}>{chg>=0?'+':''}{data.chg}%</div>
  </div>
}
function StockRow({ stock, onAnalyze }) {
  const chg = parseFloat(stock.chg||0)
  return <div onClick={onAnalyze} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid '+C.border,cursor:'pointer'}}>
    <div>
      <div style={{fontSize:13,fontWeight:700,fontFamily:'monospace',color:'#1e40af'}}>{stock.symbol}</div>
      <div style={{fontSize:11,color:'#334155',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:500}}>{stock.name}</div>
    </div>
    <div style={{textAlign:'right'}}>
      <div style={{fontSize:13,fontWeight:600,fontFamily:'monospace'}}>${stock.price}</div>
      <div style={{fontSize:12,fontWeight:600,color:chg>=0?C.green:C.red}}>{chg>=0?'+':''}{chg}%</div>
    </div>
  </div>
}
function TradingViewChart({ ticker }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const c = document.createElement('div')
    c.className = 'tradingview-widget-container'
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.async = true
    s.innerHTML = JSON.stringify({ symbol: ticker, interval: 'D', timezone: 'Europe/Paris', theme: 'light', style: '1', locale: 'fr', backgroundColor: C.card, width: '100%', height: 280, hide_top_toolbar: false, save_image: false })
    c.appendChild(s)
    ref.current.appendChild(c)
  }, [ticker])
  return <div ref={ref} style={{borderRadius:8,overflow:'hidden',border:'1px solid '+C.border,marginBottom:8}}/>
}

function StockCard({ ticker, data, onAnalyze }) {
  const [exp, setExp] = useState({})
  const [showChart, setShowChart] = useState(false)
  const tog = k => setExp(p=>({...p,[k]:!p[k]}))
  const sig = (data&&data.ai&&data.ai.signal)||'ATTENDRE'
  const sc = SIG[sig]||SIG.ATTENDRE
  const raw = data&&data.raw
  const ai = data&&data.ai
  const chg = Number((raw&&raw.changePct)||0)

  return <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:12,padding:16,marginBottom:12}}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
      <div>
        <div style={{fontSize:20,fontWeight:700,fontFamily:'monospace',color:'#000000'}}>{ticker}</div>
        {raw && <div style={{fontSize:14,color:'#1e293b',fontFamily:'monospace',fontWeight:600}}>
          ${raw.currentPrice}
          <span style={{marginLeft:8,color:chg>=0?C.green:C.red,fontWeight:600}}>{chg>=0?'+':''}{chg}%</span>
          {raw.marketCap && <span style={{marginLeft:8,fontSize:12}}>{raw.marketCap}</span>}
          {data.fromCache && <span style={{marginLeft:6,fontSize:10,background:C.surface,color:C.muted,padding:'1px 5px',borderRadius:8}}>cache</span>}
        </div>}
        {raw&&raw.sources && <div style={{marginTop:4}}>{raw.sources.map(s=><span key={s} style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:C.surface,color:C.muted,border:'1px solid '+C.border,marginRight:3}}>{s}</span>)}</div>}
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        {!(data&&data.loading)&&!(data&&data.error)&&ai && <div style={{textAlign:'right'}}>
          <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700,color:sc.color,background:sc.bg,border:'1px solid '+sc.border}}>✦ {sig}</span>
          {ai.confidence && <div style={{fontSize:10,color:C.muted,marginTop:2}}>Confiance: {ai.confidence}%</div>}
        </div>}
        <button onClick={()=>setShowChart(p=>!p)} title="Graphique TradingView" style={{padding:'6px 10px',background:C.surface,border:'1px solid '+C.border,borderRadius:8,cursor:'pointer',fontSize:14}}>📈</button>
        <button onClick={onAnalyze} style={{padding:'8px 10px',background:C.surface,border:'1px solid '+C.border,borderRadius:8,color:C.text,cursor:'pointer',fontSize:16}}>↻</button>
      </div>
    </div>

    {showChart && raw && <TradingViewChart ticker={ticker}/>}
    {data&&data.loading && <Loading/>}
    {data&&data.error && <div style={{color:C.red,fontSize:12,padding:8,background:C.redBg,borderRadius:6}}>{data.error}</div>}

    {raw && ai && !(data&&data.loading) && <>
      {/* Macro bar */}
      {(raw.macro&&(raw.macro.fedRate||raw.macro.vix)) && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8,padding:'8px 0',borderBottom:'1px solid '+C.border}}>
        <MCard label="Taux Fed" value={raw.macro.fedRate?raw.macro.fedRate+'%':null} color={parseFloat(raw.macro.fedRate)>4?C.red:C.green}/>
        <MCard label="CPI" value={raw.macro.cpi||null} color={parseFloat(raw.macro.cpi)>3?C.red:C.green}/>
        <MCard label="VIX" value={raw.macro.vix||null} color={parseFloat(raw.macro.vix)>25?C.red:parseFloat(raw.macro.vix)<15?C.green:C.amber}/>
      </div>}

      <Section title="📰 News & Sentiment" expanded={exp.news} onToggle={()=>tog('news')}>
        <SBar value={ai.news_sentiment}/>
        <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Sentiment: <strong style={{color:C.text}}>{ai.news_sentiment_label}</strong> · {raw.newsHeadlines.length} articles</div>
        <div style={{background:C.surface,borderRadius:6,padding:'8px 10px',marginBottom:8}}>
          {raw.newsHeadlines.map((n,i)=><div key={i} style={{fontSize:11,color:C.muted,paddingLeft:8,borderLeft:'2px solid '+C.border,marginBottom:3}}>
            · {n.title}{n.source&&<span style={{color:C.blue,marginLeft:4}}>({n.source})</span>}
          </div>)}
        </div>
        <div style={{color:C.muted}}>{ai.news_summary}</div>
      </Section>

      <Section title="📊 Analyse Technique" expanded={exp.tech} onToggle={()=>tog('tech')}>
        {raw.rsi && <><div style={{fontSize:11,color:C.muted}}>RSI ({raw.rsi})</div><RsiGauge value={raw.rsi} source={raw.rsiSrc}/></>}
        <MRow label="Tendance" value={ai.technical_trend} color={ai.technical_trend==='Haussiere'?C.green:ai.technical_trend==='Baissiere'?C.red:C.amber}/>
        <MRow label="MACD" value={raw.macd} color={raw.macd==='Haussier'?C.green:raw.macd==='Baissier'?C.red:C.amber}/>
        {raw.bollinger && <>
          <MRow label="Bollinger Sup." value={'$'+raw.bollinger.upper} color={C.red}/>
          <MRow label="Bollinger Mid." value={'$'+raw.bollinger.middle}/>
          <MRow label="Bollinger Inf." value={'$'+raw.bollinger.lower} color={C.green}/>
        </>}
        <MRow label="SMA 20j" value={raw.sma20?'$'+raw.sma20:null}/>
        <MRow label="SMA 50j" value={raw.sma50?'$'+raw.sma50:null}/>
        <MRow label="Support" value={raw.support?'$'+raw.support:null} color={C.green}/>
        <MRow label="Résistance" value={raw.resistance?'$'+raw.resistance:null} color={C.red}/>
        <MRow label="52S Haut" value={raw.fiftyTwoWeekHigh?'$'+raw.fiftyTwoWeekHigh:null}/>
        <MRow label="52S Bas" value={raw.fiftyTwoWeekLow?'$'+raw.fiftyTwoWeekLow:null}/>
        <div style={{color:C.muted,marginTop:8}}>{ai.technical_summary}</div>
      </Section>

      <Section title="💰 Fondamentaux (Alpha Vantage)" expanded={exp.fund} onToggle={()=>tog('fund')}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <MCard label="PER" value={raw.per} sub="Price/Earnings"/>
          <MCard label="EPS" value={raw.eps?'$'+raw.eps:null} sub="Earnings/Share"/>
          <MCard label="ROE" value={raw.roe} color={C.green} sub="Return on Equity"/>
          <MCard label="ROA" value={raw.roa} color={C.blue} sub="Return on Assets"/>
        </div>
        {raw.sector && <MRow label="Secteur" value={raw.sector}/>}
        {raw.industry && <MRow label="Industrie" value={raw.industry}/>}
        {raw.beta && <MRow label="Beta" value={raw.beta} color={parseFloat(raw.beta)>1.5?C.red:parseFloat(raw.beta)<0.5?C.green:C.amber}/>}
        <MRow label="Revenue" value={raw.revenue}/>
        <MRow label="Croissance Rev." value={raw.revenueGrowth} color={raw.revenueGrowth&&raw.revenueGrowth.startsWith('-')?C.red:C.green}/>
        {raw.grossMargins && <MRow label="Profit brut" value={raw.grossMargins}/>}
        <MRow label="Dette/Capitaux" value={raw.debtToEquity}/>
        <MRow label="Ratio courant" value={raw.currentRatio}/>
        {raw.dividendYield && <MRow label="Dividende" value={raw.dividendYield} color={C.green}/>}
        {raw.analystTarget && <MRow label="Cible analystes" value={'$'+raw.analystTarget} color={parseFloat(raw.analystTarget)>parseFloat(raw.currentPrice)?C.green:C.red}/>}
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'8px 0'}}>
          <span style={{fontSize:12,color:C.muted}}>Score santé:</span>
          <div style={{flex:1,height:4,borderRadius:2,background:C.surface}}>
            <div style={{height:'100%',width:(ai.fundamental_score||0)+'%',borderRadius:2,background:ai.fundamental_score>70?C.green:ai.fundamental_score>40?C.amber:C.red}}/>
          </div>
          <span style={{fontSize:12,fontFamily:'monospace',fontWeight:600}}>{ai.fundamental_score}/100</span>
        </div>
        <div style={{color:C.muted}}>{ai.fundamental_summary}</div>
      </Section>

      <Section title="🔮 Prédiction IA 7 jours" expanded={exp.pred} onToggle={()=>tog('pred')}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
          <MCard label="Probabilité hausse" value={(ai.prediction_probability_up||0)+'%'} color={ai.prediction_probability_up>60?C.green:ai.prediction_probability_up<40?C.red:C.amber}/>
          <MCard label="Prix cible 7j" value={ai.prediction_target?'$'+ai.prediction_target:null}/>
        </div>
        <MRow label="Tendance 7j" value={ai.prediction_trend_7d}/>
        <MRow label="Risque" value={ai.prediction_risk} color={ai.prediction_risk==='Faible'?C.green:ai.prediction_risk==='Eleve'?C.red:C.amber}/>
        <div style={{color:C.muted,marginTop:8}}>{ai.prediction_summary}</div>
      </Section>

      <div style={{marginTop:12,padding:'12px 14px',background:C.surface,borderRadius:8,fontSize:13,borderLeft:'3px solid '+sc.color}}>
        {ai.recommendation}
      </div>
      <div style={{fontSize:11,color:C.muted,marginTop:6}}>{raw.sources.join(' · ')} · {data.date}</div>
    </>}
  </div>
}

// ─── MAIN APP ──────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [tickers, setTickers] = useState(['AAPL','TSLA','NVDA'])
  const [input, setInput] = useState('')
  const [analyses, setAnalyses] = useState({})
  const [running, setRunning] = useState(false)
  const [period, setPeriod] = useState('1j')
  const [market, setMarket] = useState(null)
  const [screenerTab, setScreenerTab] = useState('gainers')
  const [alerts, setAlerts] = useState([
    {id:1,ticker:'AAPL',type:'price',value:'200',direction:'above'},
    {id:2,ticker:'TSLA',type:'percent',value:'5',direction:'below'}
  ])
  const [alertForm, setAlertForm] = useState({ticker:'',type:'price',value:'',direction:'above'})
  const [journal, setJournal] = useState([])
  const [jForm, setJForm] = useState({ticker:'',action:'ACHAT',price:'',quantity:'',date:new Date().toISOString().split('T')[0],note:''})
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const btTicker_init = 'AAPL'
  const [btTicker, setBtTicker] = useState(btTicker_init)
  const [btStrategy, setBtStrategy] = useState('RSI + SMA')
  const [btResult, setBtResult] = useState(null)
  const [btLoading, setBtLoading] = useState(false)

  useEffect(() => {
    fetchMarket().then(setMarket).catch(()=>{})
    const t = setInterval(()=>fetchMarket().then(setMarket).catch(()=>{}), 15*60*1000)
    return ()=>clearInterval(t)
  }, [])

  const analyze = useCallback(async ticker => {
    setAnalyses(p=>({...p,[ticker]:{loading:true}}))
    try {
      const rawData = await fetchStockData(ticker, period)
      const raw = parseStock(rawData, ticker)
      const ai = await analyzeWithGemini(raw)
      const date = new Date().toLocaleString('fr-BE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      setAnalyses(p=>({...p,[ticker]:{raw,ai,date,fromCache:rawData.fromCache}}))
    } catch(e) {
      setAnalyses(p=>({...p,[ticker]:{error:e.message}}))
    }
  }, [period])

  const runAll = async () => { setRunning(true); for(const t of tickers) await analyze(t); setRunning(false) }
  const addTicker = () => { const v=input.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,''); if(v&&!tickers.includes(v)) setTickers(p=>[...p,v]); setInput('') }
  const quickAnalyze = s => { if(!tickers.includes(s)) setTickers(p=>[...p,s]); setTab('dashboard'); setTimeout(()=>analyze(s),200) }

  const searchTimeout = useRef(null)
  const searchStocks = (q) => {
    setInput(q)
    if (!q || q.length < 1) { setSuggestions([]); setShowSuggestions(false); return }
    clearTimeout(searchTimeout.current)
    setSearchLoading(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(q))
        const d = await r.json()
        setSuggestions(d)
        setShowSuggestions(d.length > 0)
      } catch(e) { setSuggestions([]) }
      setSearchLoading(false)
    }, 300)
  }

  const selectSuggestion = (symbol) => {
    const v = symbol.toUpperCase()
    if (v && !tickers.includes(v)) {
      const newList = [...tickers, v]
      setTickers(newList)
      try { localStorage.setItem('stock_tickers', JSON.stringify(newList)) } catch(e){}
    }
    setInput('')
    setSuggestions([])
    setShowSuggestions(false)
  }
  const addAlert = () => { if(!alertForm.ticker||!alertForm.value) return; setAlerts(p=>[...p,{...alertForm,id:Date.now(),ticker:alertForm.ticker.toUpperCase()}]); setAlertForm({ticker:'',type:'price',value:'',direction:'above'}) }
  const addJournal = () => {
    if(!jForm.ticker||!jForm.price||!jForm.quantity) return
    setJournal(p=>[{...jForm,id:Date.now(),ticker:jForm.ticker.toUpperCase(),price:parseFloat(jForm.price),quantity:parseFloat(jForm.quantity),total:parseFloat(jForm.price)*parseFloat(jForm.quantity)},...p])
    setJForm({ticker:'',action:'ACHAT',price:'',quantity:'',date:new Date().toISOString().split('T')[0],note:''})
  }
  const jStats = () => {
    const buys=journal.filter(t=>t.action==='ACHAT'), sells=journal.filter(t=>t.action==='VENTE')
    const inv=buys.reduce((a,b)=>a+b.total,0), sold=sells.reduce((a,b)=>a+b.total,0)
    return {total:journal.length,inv,sold,pnl:sold-inv}
  }
  const runBacktest = async () => {
    setBtLoading(true); setBtResult(null)
    try {
      const rawData = await fetchStockData(btTicker,'3m')
      const raw = parseStock(rawData,btTicker)
      const prompt='Backtest "'+btStrategy+'" sur '+btTicker+'. RSI='+raw.rsi+' MACD='+raw.macd+' SMA20='+raw.sma20+' SMA50='+raw.sma50+' Support='+raw.support+' Resistance='+raw.resistance+' Historique=['+raw.closes.join(',')+'] JSON: {"strategy":"","ticker":"","period":"","total_return":"","win_rate":"","max_drawdown":"","nb_trades":0,"sharpe_ratio":"","vs_buy_hold":"","trades":[{"date":"","action":"ACHAT|VENTE","price":0,"return_pct":null,"reason":""}],"summary":""}'
      const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})})
      const d=await r.json()
      setBtResult(JSON.parse((d.result||'{}').replace(/```json|```/g,'').trim()))
    } catch(e){setBtResult({error:e.message})}
    setBtLoading(false)
  }

  const IS={width:'100%',background:C.surface,border:'1px solid '+C.border,borderRadius:8,padding:'10px 12px',fontSize:16,color:C.text,marginBottom:8,boxSizing:'border-box',WebkitAppearance:'none'}
  const SS={width:'100%',background:C.surface,border:'1px solid '+C.border,borderRadius:8,padding:'10px 12px',fontSize:16,color:C.text,marginBottom:8,boxSizing:'border-box',WebkitAppearance:'none'}
  const BP={width:'100%',padding:'14px 12px',background:C.text,color:C.bg,border:'none',borderRadius:8,fontSize:15,fontWeight:600,cursor:'pointer',WebkitTapHighlightColor:'transparent'}
  const CS={background:C.card,border:'1px solid '+C.border,borderRadius:12,padding:16,marginBottom:12}

  return <div style={{background:C.bg,minHeight:'100vh',paddingBottom:80,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
    <style>{'@keyframes p{0%,100%{opacity:.2}50%{opacity:1}} * {color: inherit;} body,div,span,p,h1,h2,h3,button,input,select,a {color: #000000;} input,select{font-size:16px!important; color:#000000!important; background:#dde3ea!important;} input::placeholder{color:#475569!important} button{min-height:44px}'}</style>

    {/* HEADER */}
    <div style={{background:C.card,borderBottom:'1px solid '+C.border,padding:'12px 16px',position:'sticky',top:0,zIndex:10}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:'#000000'}}>📈 Stock Agent Pro</div>
          <div style={{fontSize:10,color:'#1e293b'}}>Yahoo · Alpha Vantage · FRED · NewsAPI · Gemini AI</div>
        </div>
        {market&&market.fearGreed&&<FearGreedGauge value={market.fearGreed.value} label={market.fearGreed.label}/>}
      </div>
      {market&&market.indices&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
        <IndexCard name="S&P 500" data={market.indices.sp500}/>
        <IndexCard name="NASDAQ" data={market.indices.nasdaq}/>
        <IndexCard name="DOW" data={market.indices.dow}/>
        <IndexCard name="BTC" data={market.indices.btc}/>
      </div>}
    </div>

    {/* TABS */}
    <div style={{display:'flex',background:C.card,borderBottom:'1px solid '+C.border,overflowX:'auto'}}>
      {[['dashboard','📊','Analyse'],['screener','🔥','Screener'],['calendar','📅','Calendrier'],['journal','📓','Journal'],['alerts','🔔','Alertes'],['backtest','🔬','Backtest']].map(([id,icon,label])=>
        <button key={id} style={{flexShrink:0,padding:'10px 14px',fontSize:12,fontWeight:600,border:'none',background:'none',color:tab===id?'#000000':'#334155',borderBottom:tab===id?'2px solid #000000':'2px solid transparent',cursor:'pointer'}} onClick={()=>setTab(id)}>{icon} {label}</button>
      )}
    </div>

    <div style={{padding:16}}>

      {/* DASHBOARD */}
      {tab==='dashboard'&&<>
        <div style={{display:'flex',gap:6,marginBottom:8}}>
          {['1j','1s','1m','3m','1an'].map(p=><button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:'7px 0',fontSize:12,fontWeight:700,cursor:'pointer',borderRadius:8,border:'1px solid '+(period===p?C.blue:C.border),background:period===p?C.blueBg:'#f8fafc',color:period===p?C.blue:'#334155'}}>{p.toUpperCase()}</button>)}
        </div>
        <div style={{position:'relative',marginBottom:8}}>
          <div style={{display:'flex',gap:8}}>
            <input
              value={input}
              onChange={e=>searchStocks(e.target.value)}
              onKeyDown={e=>{
                if(e.key==='Enter'){addTicker();setShowSuggestions(false)}
                if(e.key==='Escape'){setShowSuggestions(false)}
              }}
              onBlur={()=>setTimeout(()=>setShowSuggestions(false),200)}
              placeholder="Rechercher une action (Apple, Tesla, BTC...)"
              style={{...IS,flex:1,marginBottom:0}}
              autoComplete="off"
            />
            <button onClick={()=>{addTicker();setShowSuggestions(false)}} style={{padding:'10px 14px',background:C.surface,border:'1px solid '+C.border,borderRadius:8,cursor:'pointer',fontSize:18,flexShrink:0}}>+</button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div style={{position:'absolute',top:'100%',left:0,right:44,background:C.card,border:'1px solid '+C.border,borderRadius:8,zIndex:100,boxShadow:'0 4px 20px rgba(0,0,0,0.1)',maxHeight:280,overflowY:'auto'}}>
              {suggestions.map((s,i) => (
                <div key={i} onMouseDown={()=>selectSuggestion(s.symbol)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',cursor:'pointer',borderBottom:i<suggestions.length-1?'1px solid '+C.border:'none',background:C.card}} onMouseEnter={e=>e.currentTarget.style.background=C.surface} onMouseLeave={e=>e.currentTarget.style.background=C.card}>
                  <div>
                    <span style={{fontSize:14,fontWeight:700,fontFamily:'monospace',color:C.text}}>{s.symbol}</span>
                    <span style={{fontSize:12,color:C.muted,marginLeft:8,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'inline-block',verticalAlign:'middle'}}>{s.name}</span>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center',flexShrink:0}}>
                    {s.exchange && <span style={{fontSize:10,color:C.muted,background:C.surface,padding:'2px 6px',borderRadius:6}}>{s.exchange}</span>}
                    <span style={{fontSize:10,padding:'2px 6px',borderRadius:6,background:s.type==='CRYPTOCURRENCY'?C.amberBg:s.type==='ETF'?C.blueBg:C.greenBg,color:s.type==='CRYPTOCURRENCY'?C.amber:s.type==='ETF'?C.blue:C.green,fontWeight:600}}>{s.type==='EQUITY'?'ACTION':s.type==='ETF'?'ETF':s.type==='CRYPTOCURRENCY'?'CRYPTO':'FOND'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {searchLoading && <div style={{position:'absolute',right:56,top:10,fontSize:12,color:C.muted}}>⏳</div>}
        </div>
        <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:6}}>
          {tickers.map(t=><span key={t} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',background:C.surface,border:'1px solid '+C.border,borderRadius:20,fontSize:12,fontWeight:600,fontFamily:'monospace'}}>
            {t}
            {analyses[t]&&analyses[t].raw&&<span style={{fontSize:10,color:Number(analyses[t].raw.changePct)>=0?C.green:C.red}}>{Number(analyses[t].raw.changePct)>=0?'▲':'▼'}</span>}
            <span onClick={()=>{setTickers(p=>p.filter(x=>x!==t));setAnalyses(p=>{const n={...p};delete n[t];return n})}} style={{cursor:'pointer',color:C.muted}}>×</span>
          </span>)}
        </div>
        <button style={BP} onClick={runAll} disabled={running||!tickers.length}>{running?'⏳ Analyse en cours...':'▶ Tout analyser'}</button>
        <button onClick={()=>window.open('/api/test-keys','_blank')} style={{width:'100%',marginTop:6,padding:8,fontSize:12,cursor:'pointer',borderRadius:8,border:'1px solid '+C.border,background:'transparent',color:C.muted}}>🔑 Tester mes clés API</button>
        <div style={{marginTop:12}}>
          {tickers.length===0?<div style={{textAlign:'center',color:C.muted,padding:'40px 0',fontSize:14}}>Ajoutez des actions pour commencer</div>:tickers.map(t=><StockCard key={t} ticker={t} data={analyses[t]} onAnalyze={()=>analyze(t)}/>)}
        </div>
      </>}

      {/* SCREENER */}
      {tab==='screener'&&<>
        <div style={{display:'flex',gap:6,marginBottom:12}}>
          {[['gainers','🟢 Hausse'],['losers','🔴 Baisse'],['active','🔥 Actifs']].map(([id,label])=>
            <button key={id} onClick={()=>setScreenerTab(id)} style={{flex:1,padding:'8px 0',fontSize:12,fontWeight:700,cursor:'pointer',borderRadius:8,border:'1px solid '+(screenerTab===id?C.blue:C.border),background:screenerTab===id?C.blueBg:'#f8fafc',color:screenerTab===id?C.blue:'#334155'}}>{label}</button>
          )}
        </div>
        {!market?<Loading/>:market.screener&&market.screener[screenerTab]&&market.screener[screenerTab].length>0
          ?<div style={CS}>{market.screener[screenerTab].map((s,i)=><StockRow key={i} stock={s} onAnalyze={()=>quickAnalyze(s.symbol)}/>)}</div>
          :<div style={{textAlign:'center',color:C.muted,padding:'40px 0',fontSize:13}}>Données non disponibles · <span style={{color:C.blue,cursor:'pointer'}} onClick={()=>fetchMarket().then(setMarket).catch(()=>{})}>Rafraîchir</span></div>
        }
        <div style={{fontSize:11,color:C.muted,textAlign:'center',marginTop:8}}>Cliquez pour analyser · {cacheAge('market')||''}</div>
      </>}

      {/* CALENDRIER */}
      {tab==='calendar'&&<>
        {market&&market.macro&&<div style={{...CS,marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:10}}>🏦 Macro (FRED)</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            <MCard label="Taux Fed" value={market.macro.fedRate?market.macro.fedRate+'%':null} color={parseFloat(market.macro.fedRate)>4?C.red:C.green} sub="Avril 2026"/>
            <MCard label="CPI" value={market.macro.cpi||null} color={parseFloat(market.macro.cpi)>3?C.red:C.green} sub="Indice prix"/>
            <MCard label="VIX" value={market.macro.vix||null} color={parseFloat(market.macro.vix)>25?C.red:parseFloat(market.macro.vix)<15?C.green:C.amber} sub="Volatilité"/>
          </div>
        </div>}
        {market&&market.fearGreed&&<div style={CS}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:10}}>📊 Fear & Greed — 7 jours</div>
          {market.fearGreed.history&&market.fearGreed.history.map((d,i)=>{
            const c=d.value>=60?C.green:d.value>=40?C.amber:C.red
            return <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:'1px solid '+C.border}}>
              <div style={{width:60,height:6,borderRadius:3,background:C.surface}}><div style={{width:d.value+'%',height:'100%',borderRadius:3,background:c}}/></div>
              <span style={{fontFamily:'monospace',fontWeight:600,color:c,minWidth:25}}>{d.value}</span>
              <span style={{fontSize:12,color:C.muted}}>{d.label}</span>
            </div>
          })}
        </div>}
        {market&&market.earnings&&market.earnings.length>0&&<div style={CS}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:10}}>📅 Prochains résultats</div>
          {market.earnings.map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid '+C.border}}>
            <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color:C.blue,cursor:'pointer'}} onClick={()=>quickAnalyze(e.symbol)}>{e.symbol}</span>
            <span style={{fontSize:11,color:C.muted}}>{e.date}</span>
            <span style={{fontSize:12,fontFamily:'monospace',color:C.muted}}>{e.epsEstimated?'Est: $'+e.epsEstimated:''}</span>
          </div>)}
        </div>}
        {!market&&<Loading/>}
      </>}

      {/* JOURNAL */}
      {tab==='journal'&&<>
        {(()=>{const s=jStats();return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          <MCard label="Trades" value={s.total}/>
          <MCard label="P&L" value={s.pnl?(s.pnl>=0?'+':'')+s.pnl.toFixed(2)+'$':null} color={s.pnl>=0?C.green:C.red}/>
          <MCard label="Investi" value={s.inv?s.inv.toFixed(0)+'$':null}/>
          <MCard label="Vendu" value={s.sold?s.sold.toFixed(0)+'$':null}/>
        </div>})()}
        <div style={CS}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>➕ Nouveau trade</div>
          <input placeholder="Ticker" value={jForm.ticker} onChange={e=>setJForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} style={IS}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <select value={jForm.action} onChange={e=>setJForm(p=>({...p,action:e.target.value}))} style={SS}><option value="ACHAT">ACHAT</option><option value="VENTE">VENTE</option></select>
            <input type="date" value={jForm.date} onChange={e=>setJForm(p=>({...p,date:e.target.value}))} style={SS}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <input type="number" placeholder="Prix ($)" value={jForm.price} onChange={e=>setJForm(p=>({...p,price:e.target.value}))} style={IS}/>
            <input type="number" placeholder="Quantité" value={jForm.quantity} onChange={e=>setJForm(p=>({...p,quantity:e.target.value}))} style={IS}/>
          </div>
          <input placeholder="Note" value={jForm.note} onChange={e=>setJForm(p=>({...p,note:e.target.value}))} style={IS}/>
          <button style={BP} onClick={addJournal}>➕ Ajouter</button>
        </div>
        {journal.length===0?<div style={{textAlign:'center',color:C.muted,padding:'30px 0',fontSize:13}}>Aucun trade</div>:journal.map(t=><div key={t.id} style={{...CS,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:700,background:t.action==='ACHAT'?C.greenBg:C.redBg,color:t.action==='ACHAT'?C.green:C.red}}>{t.action}</span>
              <span style={{fontSize:14,fontWeight:600,fontFamily:'monospace'}}>{t.ticker}</span>
            </div>
            <div style={{fontSize:12,color:C.muted,marginTop:4}}>{t.date} · {t.quantity}× ${t.price} = <strong>${t.total.toFixed(2)}</strong></div>
            {t.note&&<div style={{fontSize:11,color:C.muted,fontStyle:'italic'}}>{t.note}</div>}
          </div>
          <button onClick={()=>setJournal(p=>p.filter(x=>x.id!==t.id))} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:18}}>×</button>
        </div>)}
      </>}

      {/* ALERTES */}
      {tab==='alerts'&&<>
        <div style={CS}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>🔔 Nouvelle alerte</div>
          <input placeholder="Ticker" value={alertForm.ticker} onChange={e=>setAlertForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} style={IS}/>
          <select value={alertForm.type} onChange={e=>setAlertForm(p=>({...p,type:e.target.value}))} style={SS}><option value="price">Prix ($)</option><option value="percent">Variation (%)</option><option value="rsi">RSI</option><option value="volume">Volume anormal</option></select>
          <select value={alertForm.direction} onChange={e=>setAlertForm(p=>({...p,direction:e.target.value}))} style={SS}><option value="above">Au-dessus de</option><option value="below">En-dessous de</option></select>
          <input type="number" placeholder="Valeur" value={alertForm.value} onChange={e=>setAlertForm(p=>({...p,value:e.target.value}))} style={IS}/>
          <button style={BP} onClick={addAlert}>+ Créer l'alerte</button>
        </div>
        {alerts.map(a=><div key={a.id} style={{...CS,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,fontFamily:'monospace'}}>{a.ticker}</div>
            <div style={{fontSize:12,color:C.muted}}>{a.direction==='above'?'↑ Au-dessus de':'↓ En-dessous de'} {a.value}{a.type==='price'?'$':a.type==='percent'?'%':' RSI'}</div>
          </div>
          <button onClick={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} style={{background:'none',border:'none',color:C.red,fontSize:18,cursor:'pointer'}}>🗑</button>
        </div>)}
      </>}

      {/* BACKTEST */}
      {tab==='backtest'&&<>
        <div style={CS}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>🔬 Configuration</div>
          <input value={btTicker} onChange={e=>setBtTicker(e.target.value.toUpperCase())} placeholder="Ticker" style={IS}/>
          <select value={btStrategy} onChange={e=>setBtStrategy(e.target.value)} style={SS}>
            <option value="RSI + SMA">RSI + SMA Crossover</option>
            <option value="Bollinger Bands">Bollinger Bands Breakout</option>
            <option value="RSI seul (30/70)">RSI seul (30/70)</option>
            <option value="SMA 20/50 Crossover">SMA 20/50 Crossover</option>
            <option value="MACD Crossover">MACD Crossover</option>
          </select>
          <button style={BP} onClick={runBacktest} disabled={btLoading}>{btLoading?'⏳ Simulation...':'▶ Lancer le backtest'}</button>
        </div>
        {btLoading&&<Loading/>}
        {btResult&&!btLoading&&(btResult.error?<div style={{color:C.red,padding:16,fontSize:13}}>{btResult.error}</div>:<div style={CS}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>{btResult.ticker} — {btResult.strategy}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            <MCard label="Rendement total" value={btResult.total_return} color={btResult.total_return&&btResult.total_return.startsWith('-')?C.red:C.green}/>
            <MCard label="Win rate" value={btResult.win_rate} color={C.blue}/>
            <MCard label="Max Drawdown" value={btResult.max_drawdown} color={C.red}/>
            <MCard label="vs Buy & Hold" value={btResult.vs_buy_hold} color={C.amber}/>
          </div>
          <MRow label="Trades" value={btResult.nb_trades}/><MRow label="Sharpe" value={btResult.sharpe_ratio}/>
          <div style={{color:C.muted,fontSize:13,margin:'10px 0'}}>{btResult.summary}</div>
          {(btResult.trades||[]).map((t,i)=><div key={i} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',padding:'6px 0',borderBottom:'1px solid '+C.border,fontSize:12}}>
            <span style={{padding:'2px 8px',borderRadius:12,fontWeight:700,fontSize:11,background:t.action==='ACHAT'?C.greenBg:C.redBg,color:t.action==='ACHAT'?C.green:C.red}}>{t.action}</span>
            <span style={{color:C.muted,fontFamily:'monospace'}}>{t.date}</span>
            <span style={{fontFamily:'monospace',fontWeight:600}}>${t.price}</span>
            {t.return_pct!=null&&<span style={{color:Number(t.return_pct)>=0?C.green:C.red,fontFamily:'monospace'}}>{Number(t.return_pct)>=0?'+':''}{t.return_pct}%</span>}
            <span style={{color:C.muted,fontSize:11}}>{t.reason}</span>
          </div>)}
        </div>)}
      </>}
    </div>
  </div>
}
