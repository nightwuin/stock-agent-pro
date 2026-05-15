import { useState, useCallback, useEffect, useRef } from 'react'

// ─── COLORS ────────────────────────────────────────────
const C = {
  bg: '#f8f9fa', card: '#ffffff', border: '#e2e8f0', text: '#1a202c',
  muted: '#718096', green: '#16a34a', red: '#dc2626', amber: '#d97706',
  blue: '#2563eb', surface: '#f1f5f9', purple: '#7c3aed',
  greenBg: '#dcfce7', redBg: '#fee2e2', amberBg: '#fef3c7', blueBg: '#dbeafe'
}
const SIG = {
  ACHETER:  { color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  VENDRE:   { color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  ATTENDRE: { color: '#d97706', bg: '#fef3c7', border: '#fcd34d' }
}

// ─── CACHE SYSTEM ──────────────────────────────────────
const CACHE = {}
const CACHE_TTL = 15 * 60 * 1000
function getCache(key) {
  const item = CACHE[key]
  if (item && Date.now() - item.t < CACHE_TTL) return item.d
  return null
}
function setCache(key, data) { CACHE[key] = { d: data, t: Date.now() } }
function cacheAge(key) {
  const item = CACHE[key]
  if (!item) return null
  const mins = Math.floor((Date.now() - item.t) / 60000)
  return mins < 1 ? 'A l\'instant' : 'Il y a ' + mins + ' min'
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

async function fetchStock(ticker, period) {
  const key = ticker + '_' + (period || '1j')
  const cached = getCache(key)
  if (cached) return { ...cached, fromCache: true }
  const r = await fetch('/api/stock?ticker=' + ticker + '&period=' + (period || '1j'))
  if (!r.ok) throw new Error('Erreur réseau pour ' + ticker)
  const d = await r.json()
  setCache(key, d)
  return d
}

function parseStock(data, ticker) {
  try {
    const yq = data.yahoo && data.yahoo.quote && data.yahoo.quote.chart && data.yahoo.quote.chart.result && data.yahoo.quote.chart.result[0]
    const ys = data.yahoo && data.yahoo.summary && data.yahoo.summary.quoteSummary && data.yahoo.summary.quoteSummary.result && data.yahoo.summary.quoteSummary.result[0]
    const yh = data.yahoo && data.yahoo.hist && data.yahoo.hist.chart && data.yahoo.hist.chart.result && data.yahoo.hist.chart.result[0]
    const fmpQ = data.fmp && data.fmp.quote
    const fmpP = data.fmp && data.fmp.profile
    const fmpI = Array.isArray(data.fmp && data.fmp.income) ? data.fmp.income : []
    const news = Array.isArray(data.news && data.news.articles) ? data.news.articles : []
    const fd = (ys && ys.financialData) || {}
    const ks = (ys && ys.defaultKeyStatistics) || {}
    const sd = (ys && ys.summaryDetail) || {}
    const pp = (ys && ys.price) || {}

    const currentPrice = (pp.regularMarketPrice && pp.regularMarketPrice.raw) || (yq && yq.meta && yq.meta.regularMarketPrice) || 0
    const prevClose = (pp.regularMarketPreviousClose && pp.regularMarketPreviousClose.raw) || (yq && yq.meta && yq.meta.chartPreviousClose) || 0
    let changePct = prevClose ? ((currentPrice - prevClose) / prevClose * 100) : 0
    const qCloses = yq && yq.indicators && yq.indicators.quote && yq.indicators.quote[0] && yq.indicators.quote[0].close
    const qArr = (qCloses || []).filter(x => x != null)
    if (qArr.length >= 2) changePct = ((qArr[qArr.length-1] - qArr[0]) / qArr[0] * 100)

    const rawCloses = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].close
    const closes = (rawCloses || []).filter(x => x != null)
    const highs = ((yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].high) || []).filter(x => x != null)
    const lows = ((yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].low) || []).filter(x => x != null)
    const timestamps = (yh && yh.timestamp) || []

    // RSI
    let rsi = null, rsiSrc = 'Calculé'
    const avRsiData = data.av && data.av.rsi && data.av.rsi['Technical Analysis: RSI']
    if (avRsiData) { const k = Object.keys(avRsiData)[0]; if (k) { rsi = parseFloat(avRsiData[k].RSI).toFixed(1); rsiSrc = 'Alpha Vantage' } }
    if (!rsi && closes.length >= 15) {
      const gains = [], losses = []
      for (let i = 1; i < closes.length; i++) { const d = closes[i] - closes[i-1]; gains.push(d > 0 ? d : 0); losses.push(d < 0 ? Math.abs(d) : 0) }
      const avgG = gains.slice(-14).reduce((a,b)=>a+b,0)/14
      const avgL = losses.slice(-14).reduce((a,b)=>a+b,0)/14
      rsi = avgL === 0 ? 100 : Math.round(100-(100/(1+avgG/avgL)))
    }

    // MACD
    let macd = null
    const avMacd = data.av && data.av.macd && data.av.macd['Technical Analysis: MACD']
    if (avMacd) { const k = Object.keys(avMacd)[0]; if (k) macd = parseFloat(avMacd[k].MACD) > parseFloat(avMacd[k].MACD_Signal) ? 'Haussier' : 'Baissier' }

    // Bollinger
    let bollinger = null, bSrc = 'Calculé'
    const avBb = data.av && data.av.bbands && data.av.bbands['Technical Analysis: BBANDS']
    if (avBb) { const k = Object.keys(avBb)[0]; if (k) { bollinger = { upper: parseFloat(avBb[k]['Real Upper Band']).toFixed(2), middle: parseFloat(avBb[k]['Real Middle Band']).toFixed(2), lower: parseFloat(avBb[k]['Real Lower Band']).toFixed(2) }; bSrc = 'Alpha Vantage' } }
    if (!bollinger && closes.length >= 20) {
      const l = closes.slice(-20), m = l.reduce((a,b)=>a+b,0)/20, s = Math.sqrt(l.reduce((a,b)=>a+Math.pow(b-m,2),0)/20)
      bollinger = { upper: (m+2*s).toFixed(2), middle: m.toFixed(2), lower: (m-2*s).toFixed(2) }
    }

    const sma20 = closes.length>=20 ? (closes.slice(-20).reduce((a,b)=>a+b,0)/20).toFixed(2) : null
    const sma50 = closes.length>=50 ? (closes.slice(-50).reduce((a,b)=>a+b,0)/50).toFixed(2) : null
    const support = lows.length > 0 ? Math.min(...lows.slice(-20)).toFixed(2) : null
    const resistance = highs.length > 0 ? Math.max(...highs.slice(-20)).toFixed(2) : null

    const newsHeadlines = news.slice(0,8).map(n => ({ title: n.title, source: n.source && n.source.name, url: n.url }))
    const quarterlyData = fmpI.slice(0,4).map(q => ({ date: q.date, revenue: q.revenue, eps: q.eps, revenueGrowth: q.revenueGrowth }))

    const sources = ['Yahoo Finance']
    if (rsiSrc === 'Alpha Vantage') sources.push('Alpha Vantage')
    if (fmpQ || fmpP) sources.push('FMP')
    if (newsHeadlines.length > 0) sources.push('NewsAPI')

    return {
      ticker, currentPrice: currentPrice.toFixed(2), changePct: changePct.toFixed(2),
      volume: (pp.regularMarketVolume && pp.regularMarketVolume.raw) || 0,
      marketCap: pp.marketCap && pp.marketCap.fmt,
      rsi, rsiSrc, macd, bollinger, bSrc, sma20, sma50, support, resistance,
      per: (fmpQ && fmpQ.pe ? Number(fmpQ.pe).toFixed(1) : null) || (sd.trailingPE && sd.trailingPE.raw ? Number(sd.trailingPE.raw).toFixed(1) : null),
      eps: (fmpQ && fmpQ.eps ? Number(fmpQ.eps).toFixed(2) : null) || (ks.trailingEps && ks.trailingEps.raw ? Number(ks.trailingEps.raw).toFixed(2) : null),
      revenue: fd.totalRevenue && fd.totalRevenue.fmt,
      revenueGrowth: fd.revenueGrowth && fd.revenueGrowth.fmt,
      grossMargins: fd.grossMargins && fd.grossMargins.fmt,
      freeCashflow: fd.freeCashflow && fd.freeCashflow.fmt,
      debtToEquity: fd.debtToEquity && fd.debtToEquity.raw,
      currentRatio: fd.currentRatio && fd.currentRatio.raw,
      sector: fmpP && fmpP.sector,
      industry: fmpP && fmpP.industry,
      beta: fmpP && fmpP.beta ? fmpP.beta.toFixed(2) : null,
      quarterlyData, newsHeadlines,
      closes: closes.slice(-30), timestamps: timestamps.slice(-30), sources
    }
  } catch(e) { throw new Error('Erreur parsing: ' + e.message) }
}

async function analyzeWithGemini(raw) {
  const prompt = 'Expert analyste financier. Analyse ' + raw.ticker + ':\n'
    + 'Prix:$' + raw.currentPrice + '(' + raw.changePct + '%) Cap:' + (raw.marketCap||'N/A') + '\n'
    + 'RSI:' + (raw.rsi||'N/A') + '(' + raw.rsiSrc + ') MACD:' + (raw.macd||'N/A') + '\n'
    + 'Boll:' + (raw.bollinger ? 'Sup$'+raw.bollinger.upper+' Inf$'+raw.bollinger.lower : 'N/A') + '\n'
    + 'SMA20:$' + (raw.sma20||'N/A') + ' SMA50:$' + (raw.sma50||'N/A') + '\n'
    + 'Support:$' + (raw.support||'N/A') + ' Res:$' + (raw.resistance||'N/A') + '\n'
    + 'PER:' + (raw.per||'N/A') + ' EPS:$' + (raw.eps||'N/A') + ' Secteur:' + (raw.sector||'N/A') + '\n'
    + 'Revenue:' + (raw.revenue||'N/A') + ' Growth:' + (raw.revenueGrowth||'N/A') + ' FCF:' + (raw.freeCashflow||'N/A') + '\n'
    + 'News:' + raw.newsHeadlines.slice(0,4).map(n=>n.title).join('|') + '\n'
    + 'Sources:' + raw.sources.join(',') + '\n\n'
    + 'JSON UNIQUEMENT:\n'
    + '{"signal":"ACHETER|VENDRE|ATTENDRE","confidence":0,"news_sentiment":0.0,"news_sentiment_label":"","news_summary":"","technical_trend":"Haussiere|Baissiere|Neutre","technical_rsi_signal":"","technical_macd":"","technical_bollinger":"","technical_summary":"","fundamental_score":0,"fundamental_per_analysis":"","fundamental_health":"","fundamental_summary":"","macro_impact":"Positif|Negatif|Neutre","macro_summary":"","prediction_trend_7d":"","prediction_probability_up":0,"prediction_target":0,"prediction_risk":"Faible|Modere|Eleve","prediction_summary":"","recommendation":""}'

  const r = await fetch('/api/ai', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt}) })
  const d = await r.json()
  if (d.error) throw new Error(d.error)
  let text = (d.result||'{}').replace(/```json|```/g,'').trim()
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s !== -1 && e !== -1) text = text.slice(s, e+1)
  return JSON.parse(text)
}

// ─── UI COMPONENTS ─────────────────────────────────────
function Dot({ delay = 0 }) {
  return <span style={{ width:5,height:5,borderRadius:'50%',background:C.muted,display:'inline-block',animation:'p 1.2s '+delay+'ms ease-in-out infinite' }} />
}
function Loading() {
  return <div style={{display:'flex',gap:5,justifyContent:'center',padding:'20px 0'}}><Dot/><Dot delay={200}/><Dot delay={400}/></div>
}
function MRow({ label, value, color }) {
  return <div style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid '+C.border,fontSize:13}}>
    <span style={{color:C.muted}}>{label}</span>
    <span style={{fontFamily:'monospace',fontWeight:600,color:color||C.text}}>{value != null ? value : '—'}</span>
  </div>
}
function MCard({ label, value, color }) {
  return <div style={{background:C.surface,borderRadius:8,padding:'10px 12px',border:'1px solid '+C.border}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{label}</div>
    <div style={{fontSize:18,fontWeight:700,fontFamily:'monospace',color:color||C.text}}>{value != null ? value : '—'}</div>
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
      <span>{title}</span><span style={{fontSize:16}}>{expanded?'−':'+'}</span>
    </button>
    {expanded && <div style={{fontSize:13,lineHeight:1.7,paddingBottom:8}}>{children}</div>}
  </div>
}

function FearGreedGauge({ value, label }) {
  const color = value >= 75 ? C.green : value >= 55 ? '#22c55e' : value >= 45 ? C.amber : value >= 25 ? C.red : '#991b1b'
  const emoji = value >= 75 ? '🟢' : value >= 55 ? '🟡' : value >= 45 ? '🟠' : value >= 25 ? '🔴' : '⚫'
  return (
    <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:12,padding:'12px 14px',textAlign:'center'}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Fear & Greed</div>
      <div style={{fontSize:28,fontWeight:700,color,fontFamily:'monospace'}}>{value}</div>
      <div style={{fontSize:12,color,fontWeight:600,marginTop:2}}>{emoji} {label}</div>
      <div style={{height:4,borderRadius:2,background:C.surface,marginTop:8}}>
        <div style={{height:'100%',width:value+'%',borderRadius:2,background:color}}/>
      </div>
    </div>
  )
}

function IndexCard({ name, data }) {
  if (!data || !data.price) return <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:8,padding:'8px 12px',opacity:0.5}}>
    <div style={{fontSize:11,color:C.muted}}>{name}</div><div style={{fontSize:14,color:C.muted}}>—</div>
  </div>
  const chg = parseFloat(data.chg)
  return <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:8,padding:'8px 12px'}}>
    <div style={{fontSize:11,color:C.muted,marginBottom:2}}>{name}</div>
    <div style={{fontSize:14,fontWeight:600,fontFamily:'monospace',color:C.text}}>{parseFloat(data.price).toLocaleString()}</div>
    <div style={{fontSize:12,color:chg>=0?C.green:C.red,fontWeight:500}}>{chg>=0?'+':''}{data.chg}%</div>
  </div>
}

function StockRow({ stock, onAnalyze }) {
  const chg = parseFloat(stock.chg||0)
  return <div onClick={onAnalyze} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderBottom:'1px solid '+C.border,cursor:'pointer',background:C.card}}>
    <div>
      <div style={{fontSize:13,fontWeight:600,fontFamily:'monospace'}}>{stock.symbol}</div>
      <div style={{fontSize:11,color:C.muted,maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stock.name}</div>
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
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol: ticker, interval: 'D', timezone: 'Europe/Paris',
      theme: 'light', style: '1', locale: 'fr', backgroundColor: '#ffffff',
      gridColor: '#f1f5f9', width: '100%', height: 280,
      hide_top_toolbar: false, hide_legend: false, save_image: false,
      calendar: false, hide_volume: false
    })
    ref.current.appendChild(script)
  }, [ticker])
  return <div style={{borderRadius:8,overflow:'hidden',border:'1px solid '+C.border,marginBottom:8}}>
    <div className="tradingview-widget-container" ref={ref}/>
  </div>
}

function StockCard({ ticker, data, onAnalyze }) {
  const [exp, setExp] = useState({})
  const [showChart, setShowChart] = useState(false)
  const tog = k => setExp(p => ({...p,[k]:!p[k]}))
  const sig = (data && data.ai && data.ai.signal) || 'ATTENDRE'
  const sc = SIG[sig] || SIG.ATTENDRE
  const raw = data && data.raw
  const ai = data && data.ai
  const chg = Number((raw && raw.changePct) || 0)

  return (
    <div style={{background:C.card,border:'1px solid '+C.border,borderRadius:12,padding:16,marginBottom:12}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:C.text,fontFamily:'monospace'}}>{ticker}</div>
          {raw && <div style={{fontSize:14,color:C.muted,fontFamily:'monospace'}}>
            ${raw.currentPrice}
            <span style={{marginLeft:8,color:chg>=0?C.green:C.red,fontWeight:600}}>{chg>=0?'+':''}{chg}%</span>
            {raw.marketCap && <span style={{marginLeft:8,fontSize:12}}>{raw.marketCap}</span>}
            {data.fromCache && <span style={{marginLeft:8,fontSize:10,color:C.muted,background:C.surface,padding:'1px 6px',borderRadius:10}}>cache</span>}
          </div>}
          {raw && raw.sources && <div style={{marginTop:4}}>
            {raw.sources.map(s => <span key={s} style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:C.surface,color:C.muted,border:'1px solid '+C.border,marginRight:4}}>{s}</span>)}
          </div>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          {!(data&&data.loading) && !(data&&data.error) && ai && (
            <div style={{textAlign:'right'}}>
              <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700,color:sc.color,background:sc.bg,border:'1px solid '+sc.border}}>✦ {sig}</span>
              {ai.confidence && <div style={{fontSize:10,color:C.muted,marginTop:2}}>Confiance: {ai.confidence}%</div>}
            </div>
          )}
          <button onClick={() => setShowChart(p=>!p)} style={{padding:'6px 10px',background:C.surface,border:'1px solid '+C.border,borderRadius:8,cursor:'pointer',fontSize:12,color:C.text}}>📈</button>
          <button onClick={onAnalyze} style={{padding:'8px 10px',background:C.surface,border:'1px solid '+C.border,borderRadius:8,color:C.text,cursor:'pointer',fontSize:16}}>↻</button>
        </div>
      </div>

      {showChart && raw && <TradingViewChart ticker={ticker} />}
      {data&&data.loading && <Loading/>}
      {data&&data.error && <div style={{color:C.red,fontSize:12,padding:8,background:C.redBg,borderRadius:6}}>{data.error}</div>}

      {raw && ai && !(data&&data.loading) && <>
        <Section title="📰 News & Sentiment" expanded={exp.news} onToggle={()=>tog('news')}>
          <SBar value={ai.news_sentiment}/>
          <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Sentiment: <span style={{color:C.text}}>{ai.news_sentiment_label}</span> · {raw.newsHeadlines.length} articles</div>
          <div style={{background:C.surface,borderRadius:6,padding:'8px 10px',marginBottom:8}}>
            {raw.newsHeadlines.map((n,i) => <div key={i} style={{fontSize:11,color:C.muted,paddingLeft:8,borderLeft:'2px solid '+C.border,marginBottom:3}}>
              · {n.title}{n.source && <span style={{color:C.blue,marginLeft:4}}>({n.source})</span>}
            </div>)}
          </div>
          <div style={{color:C.muted}}>{ai.news_summary}</div>
        </Section>

        <Section title="📊 Analyse Technique" expanded={exp.tech} onToggle={()=>tog('tech')}>
          {raw.rsi && <><div style={{fontSize:11,color:C.muted}}>RSI ({raw.rsi})</div><RsiGauge value={raw.rsi} source={raw.rsiSrc}/></>}
          <MRow label="Tendance" value={ai.technical_trend} color={ai.technical_trend==='Haussiere'?C.green:ai.technical_trend==='Baissiere'?C.red:C.amber}/>
          <MRow label="MACD" value={raw.macd||ai.technical_macd} color={raw.macd==='Haussier'?C.green:raw.macd==='Baissier'?C.red:C.amber}/>
          {raw.bollinger && <>
            <MRow label={'Boll. Sup ('+raw.bSrc+')'} value={'$'+raw.bollinger.upper} color={C.red}/>
            <MRow label="Boll. Mid." value={'$'+raw.bollinger.middle}/>
            <MRow label="Boll. Inf." value={'$'+raw.bollinger.lower} color={C.green}/>
          </>}
          <MRow label="SMA 20j" value={raw.sma20?'$'+raw.sma20:null}/>
          <MRow label="SMA 50j" value={raw.sma50?'$'+raw.sma50:null}/>
          <MRow label="Support" value={raw.support?'$'+raw.support:null} color={C.green}/>
          <MRow label="Résistance" value={raw.resistance?'$'+raw.resistance:null} color={C.red}/>
          <div style={{color:C.muted,marginTop:8}}>{ai.technical_summary}</div>
        </Section>

        <Section title="💰 Fondamentaux" expanded={exp.fund} onToggle={()=>tog('fund')}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <MCard label="PER" value={raw.per}/>
            <MCard label="EPS" value={raw.eps?'$'+raw.eps:null}/>
          </div>
          {raw.sector && <MRow label="Secteur" value={raw.sector}/>}
          {raw.industry && <MRow label="Industrie" value={raw.industry}/>}
          {raw.beta && <MRow label="Beta" value={raw.beta}/>}
          <MRow label="Revenue" value={raw.revenue}/>
          <MRow label="Croissance" value={raw.revenueGrowth} color={raw.revenueGrowth&&raw.revenueGrowth.startsWith('-')?C.red:C.green}/>
          <MRow label="Marge brute" value={raw.grossMargins}/>
          <MRow label="Free Cash Flow" value={raw.freeCashflow}/>
          <MRow label="Dette/Capitaux" value={raw.debtToEquity?Number(raw.debtToEquity).toFixed(1):null}/>
          <MRow label="Ratio courant" value={raw.currentRatio?Number(raw.currentRatio).toFixed(2):null}/>
          <div style={{display:'flex',alignItems:'center',gap:8,margin:'8px 0'}}>
            <span style={{fontSize:12,color:C.muted}}>Score santé:</span>
            <div style={{flex:1,height:4,borderRadius:2,background:C.surface}}>
              <div style={{height:'100%',width:(ai.fundamental_score||0)+'%',borderRadius:2,background:ai.fundamental_score>70?C.green:ai.fundamental_score>40?C.amber:C.red}}/>
            </div>
            <span style={{fontSize:12,fontFamily:'monospace',fontWeight:600}}>{ai.fundamental_score}/100</span>
          </div>
          {raw.quarterlyData && raw.quarterlyData.length > 0 && <>
            <div style={{fontSize:11,color:C.muted,textTransform:'uppercase',letterSpacing:1,margin:'8px 0 4px'}}>Résultats trimestriels</div>
            {raw.quarterlyData.map((q,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid '+C.border,fontSize:12}}>
              <span style={{color:C.muted}}>{q.date}</span>
              <span style={{fontFamily:'monospace'}}>EPS: {q.eps}</span>
              <span style={{color:q.revenueGrowth>0?C.green:C.red,fontFamily:'monospace'}}>{q.revenueGrowth?(Number(q.revenueGrowth)*100).toFixed(1)+'%':'—'}</span>
            </div>)}
          </>}
          <div style={{color:C.muted,marginTop:8}}>{ai.fundamental_summary}</div>
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

        <div style={{marginTop:12,padding:'12px 14px',background:C.surface,borderRadius:8,fontSize:13,color:C.text,borderLeft:'3px solid '+sc.color}}>
          {ai.recommendation}
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:6}}>{raw.sources.join(' · ')} · {data.date}</div>
      </>}
    </div>
  )
}

// ─── MAIN APP ──────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [tickers, setTickers] = useState(['AAPL', 'TSLA', 'NVDA'])
  const [input, setInput] = useState('')
  const [analyses, setAnalyses] = useState({})
  const [running, setRunning] = useState(false)
  const [period, setPeriod] = useState('1j')
  const [market, setMarket] = useState(null)
  const [marketLoading, setMarketLoading] = useState(false)
  const [screenerTab, setScreenerTab] = useState('gainers')
  const [alerts, setAlerts] = useState([
    { id: 1, ticker: 'AAPL', type: 'price', value: '200', direction: 'above' },
    { id: 2, ticker: 'TSLA', type: 'percent', value: '5', direction: 'below' }
  ])
  const [alertForm, setAlertForm] = useState({ ticker: '', type: 'price', value: '', direction: 'above' })
  const [journal, setJournal] = useState([])
  const [journalForm, setJournalForm] = useState({ ticker: '', action: 'ACHAT', price: '', quantity: '', date: new Date().toISOString().split('T')[0], note: '' })
  const [btTicker, setBtTicker] = useState('AAPL')
  const [btStrategy, setBtStrategy] = useState('RSI + SMA')
  const [btResult, setBtResult] = useState(null)
  const [btLoading, setBtLoading] = useState(false)

  useEffect(() => {
    loadMarket()
    const interval = setInterval(loadMarket, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const loadMarket = async () => {
    setMarketLoading(true)
    try { const d = await fetchMarket(); setMarket(d) } catch(e) {}
    setMarketLoading(false)
  }

  const analyze = useCallback(async (ticker) => {
    setAnalyses(p => ({...p,[ticker]:{loading:true}}))
    try {
      const rawData = await fetchStock(ticker, period)
      const raw = parseStock(rawData, ticker)
      const ai = await analyzeWithGemini(raw)
      const date = new Date().toLocaleString('fr-BE', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
      setAnalyses(p => ({...p,[ticker]:{raw,ai,date,fromCache:rawData.fromCache}}))
    } catch(e) {
      setAnalyses(p => ({...p,[ticker]:{error:e.message}}))
    }
  }, [period])

  const runAll = async () => {
    setRunning(true)
    for (const t of tickers) await analyze(t)
    setRunning(false)
  }

  const addTicker = () => {
    const v = input.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'')
    if (v && !tickers.includes(v)) setTickers(p=>[...p,v])
    setInput('')
  }

  const quickAnalyze = (symbol) => {
    if (!tickers.includes(symbol)) setTickers(p=>[...p,symbol])
    setTab('dashboard')
    setTimeout(() => analyze(symbol), 100)
  }

  const addAlert = () => {
    if (!alertForm.ticker || !alertForm.value) return
    setAlerts(p=>[...p,{...alertForm,id:Date.now(),ticker:alertForm.ticker.toUpperCase()}])
    setAlertForm({ticker:'',type:'price',value:'',direction:'above'})
  }

  const addJournalEntry = () => {
    if (!journalForm.ticker || !journalForm.price || !journalForm.quantity) return
    const entry = { ...journalForm, id: Date.now(), ticker: journalForm.ticker.toUpperCase(), price: parseFloat(journalForm.price), quantity: parseFloat(journalForm.quantity), total: parseFloat(journalForm.price) * parseFloat(journalForm.quantity) }
    setJournal(p => [entry, ...p])
    setJournalForm({ ticker:'', action:'ACHAT', price:'', quantity:'', date:new Date().toISOString().split('T')[0], note:'' })
  }

  const journalStats = () => {
    const trades = journal
    const buys = trades.filter(t => t.action === 'ACHAT')
    const sells = trades.filter(t => t.action === 'VENTE')
    const totalInvested = buys.reduce((a,b) => a + b.total, 0)
    const totalSold = sells.reduce((a,b) => a + b.total, 0)
    const pnl = totalSold - totalInvested
    return { totalTrades: trades.length, totalInvested, totalSold, pnl }
  }

  const runBacktest = async () => {
    setBtLoading(true); setBtResult(null)
    try {
      const rawData = await fetchStock(btTicker, '3m')
      const raw = parseStock(rawData, btTicker)
      const prompt = 'Backtest "'+btStrategy+'" sur '+btTicker+'. Prix='+raw.currentPrice+', RSI='+raw.rsi+', MACD='+raw.macd+', SMA20='+raw.sma20+', SMA50='+raw.sma50+', Historique=['+raw.closes.join(',')+'] JSON: {"strategy":"","ticker":"","period":"","total_return":"","win_rate":"","max_drawdown":"","nb_trades":0,"sharpe_ratio":"","vs_buy_hold":"","trades":[{"date":"","action":"ACHAT|VENTE","price":0,"return_pct":null,"reason":""}],"summary":""}'
      const r = await fetch('/api/ai', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})})
      const d = await r.json()
      setBtResult(JSON.parse((d.result||'{}').replace(/```json|```/g,'').trim()))
    } catch(e) { setBtResult({error:e.message}) }
    setBtLoading(false)
  }

  const IS = {width:'100%',background:C.surface,border:'1px solid '+C.border,borderRadius:8,padding:'10px 12px',fontSize:14,color:C.text,marginBottom:8}
  const SS = {width:'100%',background:C.surface,border:'1px solid '+C.border,borderRadius:8,padding:'10px 12px',fontSize:13,color:C.text,marginBottom:8}
  const BP = {width:'100%',padding:12,background:C.text,color:C.bg,border:'none',borderRadius:8,fontSize:14,fontWeight:600,cursor:'pointer'}
  const CS = {background:C.card,border:'1px solid '+C.border,borderRadius:12,padding:16,marginBottom:12}

  return (
    <div style={{background:C.bg,minHeight:'100vh',paddingBottom:80,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"}}>
      <style>{`@keyframes p{0%,100%{opacity:.2}50%{opacity:1}} input::placeholder{color:#a0aec0} select,input{font-family:inherit} * {-webkit-tap-highlight-color:transparent}`}</style>

      {/* HEADER */}
      <div style={{background:C.card,borderBottom:'1px solid '+C.border,padding:'12px 16px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.text}}>📈 Stock Agent Pro</div>
            <div style={{fontSize:10,color:C.muted}}>Yahoo · Alpha Vantage · FMP · NewsAPI · FRED · Gemini</div>
          </div>
          {market && market.fearGreed && <FearGreedGauge value={market.fearGreed.value} label={market.fearGreed.label}/>}
        </div>

        {/* Market Bar */}
        {market && market.indices && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginTop:10}}>
            <IndexCard name="S&P 500" data={market.indices.sp500}/>
            <IndexCard name="NASDAQ" data={market.indices.nasdaq}/>
            <IndexCard name="DOW" data={market.indices.dow}/>
            <IndexCard name="BTC" data={market.indices.btc}/>
          </div>
        )}
      </div>

      {/* TABS */}
      <div style={{display:'flex',background:C.card,borderBottom:'1px solid '+C.border,overflowX:'auto'}}>
        {[['dashboard','📊','Analyse'],['screener','🔥','Screener'],['calendar','📅','Calendrier'],['journal','📓','Journal'],['alerts','🔔','Alertes'],['backtest','🔬','Backtest']].map(([id,icon,label]) =>
          <button key={id} style={{flexShrink:0,padding:'10px 14px',fontSize:12,fontWeight:500,border:'none',background:'none',color:tab===id?C.text:C.muted,borderBottom:tab===id?'2px solid '+C.text:'2px solid transparent',cursor:'pointer'}} onClick={()=>setTab(id)}>{icon} {label}</button>
        )}
      </div>

      <div style={{padding:16}}>

        {/* ── DASHBOARD ─────────────────────────────── */}
        {tab === 'dashboard' && <>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            {['1j','1s','1m','3m','1an'].map(p =>
              <button key={p} onClick={()=>setPeriod(p)} style={{flex:1,padding:'7px 0',fontSize:12,fontWeight:600,cursor:'pointer',borderRadius:8,border:'1px solid '+(period===p?C.blue:C.border),background:period===p?C.blueBg:'transparent',color:period===p?C.blue:C.muted}}>{p.toUpperCase()}</button>
            )}
          </div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input value={input} onChange={e=>setInput(e.target.value.toUpperCase())} placeholder="Ajouter (AAPL, TSLA, BTC-USD...)" onKeyDown={e=>e.key==='Enter'&&addTicker()} style={{...IS,flex:1,marginBottom:0}}/>
            <button onClick={addTicker} style={{padding:'10px 14px',background:C.surface,border:'1px solid '+C.border,borderRadius:8,color:C.text,cursor:'pointer',fontSize:18,flexShrink:0}}>+</button>
          </div>
          <div style={{marginBottom:10,display:'flex',flexWrap:'wrap',gap:6}}>
            {tickers.map(t => <span key={t} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',background:C.surface,border:'1px solid '+C.border,borderRadius:20,fontSize:12,fontWeight:600,fontFamily:'monospace'}}>
              {t}
              {analyses[t] && analyses[t].raw && <span style={{fontSize:10,color:Number(analyses[t].raw.changePct)>=0?C.green:C.red}}>{Number(analyses[t].raw.changePct)>=0?'▲':'▼'}</span>}
              <span onClick={()=>{setTickers(p=>p.filter(x=>x!==t));setAnalyses(p=>{const n={...p};delete n[t];return n})}} style={{cursor:'pointer',color:C.muted}}>×</span>
            </span>)}
          </div>
          <button style={BP} onClick={runAll} disabled={running||!tickers.length}>{running?'⏳ Analyse en cours...':'▶ Tout analyser'}</button>
          <button onClick={()=>window.open('/api/test-keys','_blank')} style={{width:'100%',marginTop:6,padding:8,fontSize:12,cursor:'pointer',borderRadius:8,border:'1px solid '+C.border,background:'transparent',color:C.muted}}>🔑 Tester mes clés API</button>
          <div style={{marginTop:12}}>
            {tickers.length===0
              ? <div style={{textAlign:'center',color:C.muted,padding:'40px 0',fontSize:14}}>Ajoutez des actions pour commencer</div>
              : tickers.map(t => <StockCard key={t} ticker={t} data={analyses[t]} onAnalyze={()=>analyze(t)}/>)
            }
          </div>
        </>}

        {/* ── SCREENER ──────────────────────────────── */}
        {tab === 'screener' && <>
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            {[['gainers','🟢 Hausse'],['losers','🔴 Baisse'],['active','🔥 Actifs']].map(([id,label]) =>
              <button key={id} onClick={()=>setScreenerTab(id)} style={{flex:1,padding:'8px 0',fontSize:12,fontWeight:600,cursor:'pointer',borderRadius:8,border:'1px solid '+(screenerTab===id?C.blue:C.border),background:screenerTab===id?C.blueBg:'transparent',color:screenerTab===id?C.blue:C.muted}}>{label}</button>
            )}
          </div>
          {!market ? <Loading/> : <>
            {market.screener && market.screener[screenerTab] && market.screener[screenerTab].length > 0
              ? <div style={CS}>
                  {market.screener[screenerTab].map((s,i) => <StockRow key={i} stock={s} onAnalyze={()=>quickAnalyze(s.symbol)}/>)}
                </div>
              : <div style={{textAlign:'center',color:C.muted,padding:'40px 0',fontSize:13}}>
                  Données non disponibles · <span style={{color:C.blue,cursor:'pointer'}} onClick={loadMarket}>Rafraîchir</span>
                </div>
            }
          </>}
          <div style={{fontSize:11,color:C.muted,textAlign:'center',marginTop:8}}>
            Cliquez sur une action pour l'analyser automatiquement · {cacheAge('market')||''}
          </div>
        </>}

        {/* ── CALENDRIER ────────────────────────────── */}
        {tab === 'calendar' && <>
          <div style={{...CS,marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>📅 Prochains résultats trimestriels</div>
            {!market ? <Loading/> : market.earnings && market.earnings.length > 0
              ? market.earnings.map((e,i) => <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid '+C.border}}>
                  <div>
                    <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',cursor:'pointer',color:C.blue}} onClick={()=>quickAnalyze(e.symbol)}>{e.symbol}</span>
                    <span style={{fontSize:11,color:C.muted,marginLeft:8}}>{e.date}</span>
                  </div>
                  <div style={{fontSize:12,fontFamily:'monospace',color:C.muted}}>
                    {e.epsEstimated ? 'Est: $'+e.epsEstimated : ''}
                  </div>
                </div>)
              : <div style={{color:C.muted,fontSize:13}}>Ajoutez votre clé FMP pour voir les earnings · Données FRED disponibles ci-dessous</div>
            }
          </div>

          {market && market.macro && <div style={CS}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>🏦 Indicateurs Macro (FRED)</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <MCard label="Taux Fed" value={market.macro.fedRate?market.macro.fedRate+'%':null} color={parseFloat(market.macro.fedRate)>4?C.red:C.green}/>
              <MCard label="CPI Inflation" value={market.macro.cpi||null} color={parseFloat(market.macro.cpi)>3?C.red:C.green}/>
              <MCard label="VIX" value={market.macro.vix||null} color={parseFloat(market.macro.vix)>25?C.red:parseFloat(market.macro.vix)<15?C.green:C.amber}/>
            </div>
          </div>}

          <div style={CS}>
            <div style={{fontSize:14,fontWeight:600,marginBottom:12}}>📊 Fear & Greed — 7 derniers jours</div>
            {market && market.fearGreed && market.fearGreed.history ? market.fearGreed.history.map((d,i) => {
              const c = d.value>=60?C.green:d.value>=40?C.amber:C.red
              return <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'6px 0',borderBottom:'1px solid '+C.border}}>
                <div style={{width:40,height:6,borderRadius:3,background:C.surface}}>
                  <div style={{width:d.value+'%',height:'100%',borderRadius:3,background:c}}/>
                </div>
                <span style={{fontFamily:'monospace',fontWeight:600,color:c,minWidth:30}}>{d.value}</span>
                <span style={{fontSize:12,color:C.muted}}>{d.label}</span>
              </div>
            }) : <div style={{color:C.muted,fontSize:13}}>Chargement...</div>}
          </div>
        </>}

        {/* ── JOURNAL ───────────────────────────────── */}
        {tab === 'journal' && <>
          {(() => { const s = journalStats(); return (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              <MCard label="Nombre de trades" value={s.totalTrades}/>
              <MCard label="P&L Total" value={s.pnl ? (s.pnl>=0?'+':'')+s.pnl.toFixed(2)+'$' : '—'} color={s.pnl>=0?C.green:C.red}/>
              <MCard label="Total investi" value={s.totalInvested?s.totalInvested.toFixed(0)+'$':null}/>
              <MCard label="Total vendu" value={s.totalSold?s.totalSold.toFixed(0)+'$':null}/>
            </div>
          )})()}

          <div style={CS}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:12}}>➕ Nouveau trade</div>
            <input placeholder="Ticker (AAPL...)" value={journalForm.ticker} onChange={e=>setJournalForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} style={IS}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <select value={journalForm.action} onChange={e=>setJournalForm(p=>({...p,action:e.target.value}))} style={SS}>
                <option value="ACHAT">ACHAT</option>
                <option value="VENTE">VENTE</option>
              </select>
              <input type="date" value={journalForm.date} onChange={e=>setJournalForm(p=>({...p,date:e.target.value}))} style={SS}/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <input type="number" placeholder="Prix ($)" value={journalForm.price} onChange={e=>setJournalForm(p=>({...p,price:e.target.value}))} style={IS}/>
              <input type="number" placeholder="Quantité" value={journalForm.quantity} onChange={e=>setJournalForm(p=>({...p,quantity:e.target.value}))} style={IS}/>
            </div>
            <input placeholder="Note (optionnel)" value={journalForm.note} onChange={e=>setJournalForm(p=>({...p,note:e.target.value}))} style={IS}/>
            <button style={BP} onClick={addJournalEntry}>➕ Ajouter au journal</button>
          </div>

          {journal.length === 0
            ? <div style={{textAlign:'center',color:C.muted,padding:'30px 0',fontSize:13}}>Aucun trade enregistré</div>
            : journal.map(t => <div key={t.id} style={{...CS,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{padding:'2px 8px',borderRadius:12,fontSize:11,fontWeight:700,background:t.action==='ACHAT'?C.greenBg:C.redBg,color:t.action==='ACHAT'?C.green:C.red}}>{t.action}</span>
                    <span style={{fontSize:14,fontWeight:600,fontFamily:'monospace'}}>{t.ticker}</span>
                  </div>
                  <div style={{fontSize:12,color:C.muted,marginTop:4}}>{t.date} · {t.quantity} × ${t.price} = <strong>${t.total.toFixed(2)}</strong></div>
                  {t.note && <div style={{fontSize:11,color:C.muted,marginTop:2,fontStyle:'italic'}}>{t.note}</div>}
                </div>
                <button onClick={()=>setJournal(p=>p.filter(x=>x.id!==t.id))} style={{background:'none',border:'none',color:C.red,cursor:'pointer',fontSize:18}}>×</button>
              </div>)
          }
        </>}

        {/* ── ALERTES ───────────────────────────────── */}
        {tab === 'alerts' && <>
          <div style={CS}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:12}}>🔔 Nouvelle alerte</div>
            <input placeholder="Ticker (AAPL...)" value={alertForm.ticker} onChange={e=>setAlertForm(p=>({...p,ticker:e.target.value.toUpperCase()}))} style={IS}/>
            <select value={alertForm.type} onChange={e=>setAlertForm(p=>({...p,type:e.target.value}))} style={SS}>
              <option value="price">Prix ($)</option>
              <option value="percent">Variation (%)</option>
              <option value="rsi">RSI</option>
              <option value="volume">Volume anormal</option>
            </select>
            <select value={alertForm.direction} onChange={e=>setAlertForm(p=>({...p,direction:e.target.value}))} style={SS}>
              <option value="above">Au-dessus de</option>
              <option value="below">En-dessous de</option>
            </select>
            <input type="number" placeholder="Valeur cible" value={alertForm.value} onChange={e=>setAlertForm(p=>({...p,value:e.target.value}))} style={IS}/>
            <button style={BP} onClick={addAlert}>+ Créer l'alerte</button>
          </div>
          {alerts.map(a => <div key={a.id} style={{...CS,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,fontFamily:'monospace'}}>{a.ticker}</div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>
                {a.direction==='above'?'↑ Au-dessus de':'↓ En-dessous de'} {a.value}{a.type==='price'?'$':a.type==='percent'?'%':' RSI'}
              </div>
            </div>
            <button onClick={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} style={{background:'none',border:'none',color:C.red,fontSize:18,cursor:'pointer'}}>🗑</button>
          </div>)}
          <div style={{...CS,fontSize:12,color:C.muted}}>
            💡 Sur Android Chrome → ⋮ → Paramètres du site → Notifications → Autoriser
          </div>
        </>}

        {/* ── BACKTEST ──────────────────────────────── */}
        {tab === 'backtest' && <>
          <div style={CS}>
            <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:12}}>🔬 Configuration</div>
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
          {btLoading && <Loading/>}
          {btResult && !btLoading && (btResult.error
            ? <div style={{color:C.red,padding:16,fontSize:13}}>{btResult.error}</div>
            : <div style={CS}>
                <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>{btResult.ticker} — {btResult.strategy}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                  <MCard label="Rendement total" value={btResult.total_return} color={btResult.total_return&&btResult.total_return.startsWith('-')?C.red:C.green}/>
                  <MCard label="Win rate" value={btResult.win_rate} color={C.blue}/>
                  <MCard label="Max Drawdown" value={btResult.max_drawdown} color={C.red}/>
                  <MCard label="vs Buy & Hold" value={btResult.vs_buy_hold} color={C.amber}/>
                </div>
                <MRow label="Nombre de trades" value={btResult.nb_trades}/>
                <MRow label="Ratio de Sharpe" value={btResult.sharpe_ratio}/>
                <div style={{color:C.muted,fontSize:13,margin:'10px 0'}}>{btResult.summary}</div>
                <div style={{fontSize:11,color:C.muted,textTransform:'uppercase',letterSpacing:1,marginBottom:8}}>Historique des trades</div>
                {(btResult.trades||[]).map((t,i) => <div key={i} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',padding:'6px 0',borderBottom:'1px solid '+C.border,fontSize:12}}>
                  <span style={{padding:'2px 8px',borderRadius:12,fontWeight:700,fontSize:11,background:t.action==='ACHAT'?C.greenBg:C.redBg,color:t.action==='ACHAT'?C.green:C.red}}>{t.action}</span>
                  <span style={{color:C.muted,fontFamily:'monospace'}}>{t.date}</span>
                  <span style={{fontFamily:'monospace',fontWeight:600}}>${t.price}</span>
                  {t.return_pct!=null && <span style={{color:Number(t.return_pct)>=0?C.green:C.red,fontFamily:'monospace'}}>{Number(t.return_pct)>=0?'+':''}{t.return_pct}%</span>}
                  <span style={{color:C.muted,fontSize:11}}>{t.reason}</span>
                </div>)}
              </div>
          )}
        </>}

      </div>
    </div>
  )
}
