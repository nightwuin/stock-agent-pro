import { useState, useCallback } from 'react'

const C = {
  bg: '#f8f9fa', card: '#ffffff', border: '#e2e8f0', text: '#1a202c',
  muted: '#718096', green: '#16a34a', red: '#dc2626', amber: '#d97706',
  blue: '#2563eb', surface: '#f1f5f9', purple: '#7c3aed'
}

const SIG = {
  ACHETER:  { color: '#16a34a', bg: '#dcfce7', border: '#86efac' },
  VENDRE:   { color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
  ATTENDRE: { color: '#d97706', bg: '#fef3c7', border: '#fcd34d' }
}

async function fetchStockData(ticker, period) {
  const p = period || '1j'
  const res = await fetch('/api/stock?ticker=' + ticker + '&period=' + p)
  if (!res.ok) throw new Error('Erreur reseau pour ' + ticker)
  return res.json()
}

function parseAllData(data, ticker) {
  try {
    var yq = data.yahoo && data.yahoo.quote && data.yahoo.quote.chart && data.yahoo.quote.chart.result && data.yahoo.quote.chart.result[0]
    var ys = data.yahoo && data.yahoo.summary && data.yahoo.summary.quoteSummary && data.yahoo.summary.quoteSummary.result && data.yahoo.summary.quoteSummary.result[0]
    var yh = data.yahoo && data.yahoo.hist && data.yahoo.hist.chart && data.yahoo.hist.chart.result && data.yahoo.hist.chart.result[0]
    var news = Array.isArray(data.news && data.news.articles ? data.news.articles : null) ? data.news.articles : []
    var fmpQ = data.fmp && data.fmp.quote
    var fmpP = data.fmp && data.fmp.profile
    var fmpI = Array.isArray(data.fmp && data.fmp.income) ? data.fmp.income : []
    var fmpIns = []
    var fmpE = []
    var macro = data.macro || {}

    var price = ys || {}
    var fd = (price.financialData) || {}
    var ks = (price.defaultKeyStatistics) || {}
    var sd = (price.summaryDetail) || {}
    var pp = (price.price) || {}

    var currentPrice = (pp.regularMarketPrice && pp.regularMarketPrice.raw) || (yq && yq.meta && yq.meta.regularMarketPrice) || 0
    var prevClose = (pp.regularMarketPreviousClose && pp.regularMarketPreviousClose.raw) || (yq && yq.meta && yq.meta.chartPreviousClose) || 0
    var changePct = prevClose ? ((currentPrice - prevClose) / prevClose * 100) : 0
    var qCloses = yq && yq.indicators && yq.indicators.quote && yq.indicators.quote[0] && yq.indicators.quote[0].close
    var qClosesArr = (qCloses || []).filter(function(x) { return x != null })
    if (qClosesArr.length >= 2) {
      var firstClose = qClosesArr[0]
      var lastClose = qClosesArr[qClosesArr.length - 1]
      if (firstClose) changePct = ((lastClose - firstClose) / firstClose * 100)
    }
    var volume = (pp.regularMarketVolume && pp.regularMarketVolume.raw) || 0
    var avgVolume = (pp.averageDailyVolume10Day && pp.averageDailyVolume10Day.raw) || 0

    var rawCloses = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].close
    var closes = (rawCloses || []).filter(function(x) { return x != null })
    var rawHighs = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].high
    var highs = (rawHighs || []).filter(function(x) { return x != null })
    var rawLows = yh && yh.indicators && yh.indicators.quote && yh.indicators.quote[0] && yh.indicators.quote[0].low
    var lows = (rawLows || []).filter(function(x) { return x != null })

    var rsiOfficial = null
    var avRsiData = data.av && data.av.rsi && data.av.rsi['Technical Analysis: RSI']
    if (avRsiData) {
      var latestRsiDate = Object.keys(avRsiData)[0]
      if (latestRsiDate) rsiOfficial = parseFloat(avRsiData[latestRsiDate].RSI).toFixed(1)
    }

    var macdSignal = null
    var avMacdData = data.av && data.av.macd && data.av.macd['Technical Analysis: MACD']
    if (avMacdData) {
      var latestMacdDate = Object.keys(avMacdData)[0]
      if (latestMacdDate) {
        var macdVal = parseFloat(avMacdData[latestMacdDate].MACD)
        var macdSignalVal = parseFloat(avMacdData[latestMacdDate].MACD_Signal)
        macdSignal = macdVal > macdSignalVal ? 'Haussier' : 'Baissier'
      }
    }

    var bbandsData = null
    var avBbandsData = data.av && data.av.bbands && data.av.bbands['Technical Analysis: BBANDS']
    if (avBbandsData) {
      var latestBbDate = Object.keys(avBbandsData)[0]
      if (latestBbDate) {
        bbandsData = {
          upper: parseFloat(avBbandsData[latestBbDate]['Real Upper Band']).toFixed(2),
          middle: parseFloat(avBbandsData[latestBbDate]['Real Middle Band']).toFixed(2),
          lower: parseFloat(avBbandsData[latestBbDate]['Real Lower Band']).toFixed(2)
        }
      }
    }

    var rsiCalc = null
    if (!rsiOfficial && closes.length >= 15) {
      var gains = [], losses = []
      for (var i = 1; i < closes.length; i++) {
        var diff = closes[i] - closes[i-1]
        gains.push(diff > 0 ? diff : 0)
        losses.push(diff < 0 ? Math.abs(diff) : 0)
      }
      var avgG = gains.slice(-14).reduce(function(a,b){return a+b},0)/14
      var avgL = losses.slice(-14).reduce(function(a,b){return a+b},0)/14
      rsiCalc = avgL === 0 ? 100 : Math.round(100-(100/(1+avgG/avgL)))
    }

    var sma20 = closes.length>=20 ? (closes.slice(-20).reduce(function(a,b){return a+b},0)/20).toFixed(2) : null
    var sma50 = closes.length>=50 ? (closes.slice(-50).reduce(function(a,b){return a+b},0)/50).toFixed(2) : null

    var bollingerCalc = null
    if (!bbandsData && closes.length>=20) {
      var last20 = closes.slice(-20)
      var mean = last20.reduce(function(a,b){return a+b},0)/20
      var std = Math.sqrt(last20.reduce(function(a,b){return a+Math.pow(b-mean,2)},0)/20)
      bollingerCalc = { upper:(mean+2*std).toFixed(2), middle:mean.toFixed(2), lower:(mean-2*std).toFixed(2) }
    }

    var support = lows.length>0 ? Math.min.apply(null,lows.slice(-20)).toFixed(2) : null
    var resistance = highs.length>0 ? Math.max.apply(null,highs.slice(-20)).toFixed(2) : null

    var yahooNews = []
    var yahooNewsRaw = data.yahoo && data.yahoo.quote && data.yahoo.quote.chart
    var newsHeadlines = news.slice(0,8).map(function(n){ return { title: n.title, source: n.source && n.source.name, url: n.url } })
    if (newsHeadlines.length === 0 && data.news === null) {
      newsHeadlines = []
    }

    var quarterlyData = fmpI.slice(0,4).map(function(q) {
      return {
        date: q.date,
        revenue: q.revenue,
        netIncome: q.netIncome,
        eps: q.eps,
        revenueGrowth: q.revenueGrowth
      }
    })

    var insiderTrades = fmpIns.slice(0,6).map(function(t) {
      return {
        name: t.reportingName,
        type: t.transactionType,
        shares: t.securitiesTransacted,
        price: t.price,
        date: t.transactionDate
      }
    })

    var nextEarnings = fmpE && fmpE[0] ? fmpE[0].date : null

    var fedRate = null
    if (macro.fedRate && macro.fedRate.observations && macro.fedRate.observations[0]) {
      fedRate = macro.fedRate.observations[0].value
    }
    var cpi = null
    var cpiPrev = null
    if (macro.cpi && macro.cpi.observations) {
      cpi = macro.cpi.observations[0] && macro.cpi.observations[0].value
      cpiPrev = macro.cpi.observations[1] && macro.cpi.observations[1].value
    }
    var vix = null
    if (macro.vix && macro.vix.observations && macro.vix.observations[0]) {
      vix = parseFloat(macro.vix.observations[0].value).toFixed(1)
    }

    var sources = ['Yahoo Finance']
    if (rsiOfficial) sources.push('Alpha Vantage')
    if (fmpQ || fmpP) sources.push('FMP')
    if (newsHeadlines.length > 0 && data.news) sources.push('NewsAPI')
    if (fedRate) sources.push('FRED')

    return {
      ticker: ticker,
      currentPrice: currentPrice.toFixed(2),
      changePct: changePct.toFixed(2),
      volume: volume,
      avgVolume: avgVolume,
      marketCap: pp.marketCap && pp.marketCap.fmt,
      rsi: rsiOfficial || rsiCalc,
      rsiSource: rsiOfficial ? 'Alpha Vantage' : 'Calcule',
      macd: macdSignal,
      bollinger: bbandsData || bollingerCalc,
      bollingerSource: bbandsData ? 'Alpha Vantage' : 'Calcule',
      sma20: sma20,
      sma50: sma50,
      support: support,
      resistance: resistance,
      per: (fmpQ && fmpQ.pe ? fmpQ.pe.toFixed(1) : null) || (sd.trailingPE && sd.trailingPE.raw) || (ks.trailingPE && ks.trailingPE.raw),
      eps: (fmpQ && fmpQ.eps ? fmpQ.eps.toFixed(2) : null) || (ks.trailingEps && ks.trailingEps.raw),
      roe: null,
      roa: null,
      beta: fmpP && fmpP.beta ? fmpP.beta.toFixed(2) : null,
      sector: fmpP && fmpP.sector,
      industry: fmpP && fmpP.industry,
      debtEquity: fd.debtToEquity && fd.debtToEquity.raw,
      freeCashflow: fd.freeCashflow && fd.freeCashflow.fmt,
      revenue: fd.totalRevenue && fd.totalRevenue.fmt,
      revenueGrowth: fd.revenueGrowth && fd.revenueGrowth.fmt,
      grossMargins: fd.grossMargins && fd.grossMargins.fmt,
      currentRatio: fd.currentRatio && fd.currentRatio.raw,
      quarterlyData: quarterlyData,
      insiderTrades: insiderTrades,
      nextEarnings: nextEarnings,
      newsHeadlines: newsHeadlines,
      fedRate: fedRate,
      cpi: cpi,
      cpiPrev: cpiPrev,
      vix: vix,
      closes: closes.slice(-30),
      sources: sources
    }
  } catch (e) {
    throw new Error('Erreur parsing: ' + e.message)
  }
}

async function analyzeWithGemini(raw) {
  var bollingerText = raw.bollinger ? 'Sup:$' + raw.bollinger.upper + ' Inf:$' + raw.bollinger.lower : 'N/A'
  var macroText = 'Taux Fed:' + (raw.fedRate || 'N/A') + '% | CPI:' + (raw.cpi || 'N/A') + ' | VIX:' + (raw.vix || 'N/A')
  var newsText = raw.newsHeadlines.slice(0,5).map(function(n){ return n.title }).join(' | ')
  var quarterText = raw.quarterlyData.slice(0,2).map(function(q){ return q.date + ':Rev=' + q.revenue + ',EPS=' + q.eps }).join(' | ')
  var insiderText = raw.insiderTrades.slice(0,3).map(function(t){ return t.name + ':' + t.type }).join(' | ')

  var prompt = 'Tu es expert analyste financier senior avec acces a plusieurs sources de donnees. Analyse complete de ' + raw.ticker + ':\n\n'
    + 'PRIX: $' + raw.currentPrice + ' (' + raw.changePct + '%) | Cap: ' + (raw.marketCap || 'N/A') + '\n'
    + 'TECHNIQUE (' + raw.rsiSource + '): RSI=' + (raw.rsi || 'N/A') + ' | MACD=' + (raw.macd || 'N/A') + ' | Bollinger=' + bollingerText + '\n'
    + 'SMA20=$' + (raw.sma20 || 'N/A') + ' | SMA50=$' + (raw.sma50 || 'N/A') + ' | Support=$' + (raw.support || 'N/A') + ' | Resistance=$' + (raw.resistance || 'N/A') + '\n'
    + 'FONDAMENTAUX: PER=' + (raw.per || 'N/A') + ' | EPS=$' + (raw.eps || 'N/A') + ' | ROE=' + (raw.roe || 'N/A') + ' | ROA=' + (raw.roa || 'N/A') + '\n'
    + 'FCF=' + (raw.freeCashflow || 'N/A') + ' | Revenue=' + (raw.revenue || 'N/A') + ' | Croissance=' + (raw.revenueGrowth || 'N/A') + ' | Marge=' + (raw.grossMargins || 'N/A') + '\n'
    + 'RESULTATS TRIMESTRIELS: ' + (quarterText || 'N/A') + '\n'
    + 'INSIDER TRADING: ' + (insiderText || 'N/A') + '\n'
    + 'MACRO (FRED): ' + macroText + '\n'
    + 'NEWS (' + raw.newsHeadlines.length + ' sources): ' + (newsText || 'N/A') + '\n\n'
    + 'Sources utilisees: ' + raw.sources.join(', ') + '\n\n'
    + 'Reponds UNIQUEMENT en JSON:\n'
    + '{"signal":"ACHETER|VENDRE|ATTENDRE","confidence":0,"news_sentiment":0.0,"news_sentiment_label":"","news_summary":"","technical_trend":"","technical_rsi_signal":"","technical_macd":"","technical_bollinger":"","technical_summary":"","fundamental_score":0,"fundamental_per_analysis":"","fundamental_health":"","fundamental_summary":"","insider_signal":"Achat massif|Vente massive|Mixte|Neutre","insider_summary":"","macro_impact":"Positif|Negatif|Neutre","macro_summary":"","prediction_trend_7d":"","prediction_probability_up":0,"prediction_target":0,"prediction_risk":"Faible|Modere|Eleve","prediction_summary":"","recommendation":""}'

  var res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt })
  })
  var d = await res.json()
  if (d.error) throw new Error(d.error)
  var text = (d.result || '{}').replace(/```json/g, '').replace(/```/g, '').trim()
  var s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s !== -1 && e !== -1) text = text.slice(s, e+1)
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
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: props.color || C.text }}>{props.value != null ? props.value : '—'}</div>
    </div>
  )
}

function SBar(props) {
  var pct = Math.round((props.value || 0.5) * 100)
  var c = pct > 60 ? C.green : pct < 40 ? C.red : C.amber
  return (
    <div style={{ margin: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted, marginBottom: 4 }}>
        <span>Negatif</span><span style={{ color: c, fontWeight: 600 }}>{pct}%</span><span>Positif</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: C.surface }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 2, background: c }} />
      </div>
    </div>
  )
}

function RsiGauge(props) {
  var v = Math.min(100, Math.max(0, Number(props.value) || 50))
  var c = v > 70 ? C.red : v < 30 ? C.green : C.amber
  var label = v > 70 ? 'Sur-achete' : v < 30 ? 'Sur-vendu' : 'Neutre'
  return (
    <div>
      <div style={{ height: 4, borderRadius: 2, background: C.surface, position: 'relative', margin: '8px 0' }}>
        <div style={{ position: 'absolute', left: 'calc(' + v + '% - 5px)', top: -4, width: 12, height: 12, borderRadius: '50%', background: c, border: '2px solid ' + C.bg }} />
      </div>
      <div style={{ fontSize: 11, color: c, textAlign: 'right' }}>RSI {v} - {label} ({props.source})</div>
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
      {props.expanded && <div style={{ fontSize: 13, lineHeight: 1.7, paddingBottom: 8 }}>{props.children}</div>}
    </div>
  )
}

function SourceBadge(props) {
  return <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: C.surface, color: C.muted, border: '1px solid ' + C.border, marginLeft: 4 }}>{props.name}</span>
}

function StockCard(props) {
  var ticker = props.ticker
  var data = props.data
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
              <span style={{ marginLeft: 8, color: chg >= 0 ? C.green : C.red, fontWeight: 600 }}>{chg >= 0 ? '+' : ''}{chg}%</span>
              {raw.marketCap && <span style={{ marginLeft: 8, fontSize: 12 }}>{raw.marketCap}</span>}
            </div>
          )}
          {raw && raw.sources && (
            <div style={{ marginTop: 4 }}>
              {raw.sources.map(function(s) { return <SourceBadge key={s} name={s} /> })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!(data && data.loading) && !(data && data.error) && ai && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, border: '1px solid ' + sc.border }}>{sig}</span>
              {ai.confidence && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Confiance: {ai.confidence}%</div>}
            </div>
          )}
          <button onClick={props.onAnalyze} style={{ padding: '8px 12px', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, cursor: 'pointer', fontSize: 16 }}>↻</button>
        </div>
      </div>

      {data && data.loading && <Loading />}
      {data && data.error && <div style={{ color: C.red, fontSize: 12, padding: 8, background: '#fee2e2', borderRadius: 6 }}>{data.error}</div>}

      {raw && ai && !(data && data.loading) && (
        <div>
          <Section title="Macro (FRED)" expanded={exp.macro} onToggle={function() { tog('macro') }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <MCard label="Taux Fed" value={raw.fedRate ? raw.fedRate + '%' : null} color={parseFloat(raw.fedRate) > 4 ? C.red : C.green} />
              <MCard label="CPI Inflation" value={raw.cpi || null} color={parseFloat(raw.cpi) > 3 ? C.red : C.green} />
              <MCard label="VIX Volatilite" value={raw.vix || null} color={parseFloat(raw.vix) > 25 ? C.red : parseFloat(raw.vix) < 15 ? C.green : C.amber} />
            </div>
            <div style={{ padding: '8px 10px', background: C.surface, borderRadius: 6, fontSize: 12, color: C.muted }}>
              Impact marche: <span style={{ color: ai.macro_impact === 'Positif' ? C.green : ai.macro_impact === 'Negatif' ? C.red : C.amber, fontWeight: 600 }}>{ai.macro_impact}</span>
              <div style={{ marginTop: 4 }}>{ai.macro_summary}</div>
            </div>
          </Section>

          <Section title="News Multi-Sources" expanded={exp.news} onToggle={function() { tog('news') }}>
            <SBar value={ai.news_sentiment} />
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Sentiment: <span style={{ color: C.text }}>{ai.news_sentiment_label}</span> · {raw.newsHeadlines.length} articles</div>
            <div style={{ background: C.surface, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
              {raw.newsHeadlines.map(function(n, i) {
                return (
                  <div key={i} style={{ fontSize: 11, color: C.muted, paddingLeft: 8, borderLeft: '2px solid ' + C.border, marginBottom: 4 }}>
                    · {n.title}
                    {n.source && <span style={{ color: C.blue, marginLeft: 4 }}>({n.source})</span>}
                  </div>
                )
              })}
            </div>
            <div style={{ color: C.muted }}>{ai.news_summary}</div>
          </Section>

          <Section title="Analyse Technique" expanded={exp.tech} onToggle={function() { tog('tech') }}>
            {raw.rsi && <RsiGauge value={raw.rsi} source={raw.rsiSource} />}
            <MRow label="Tendance" value={ai.technical_trend} color={ai.technical_trend === 'Haussiere' ? C.green : ai.technical_trend === 'Baissiere' ? C.red : C.amber} />
            <MRow label="MACD" value={raw.macd || ai.technical_macd} color={raw.macd === 'Haussier' ? C.green : raw.macd === 'Baissier' ? C.red : C.amber} />
            {raw.bollinger && (
              <div>
                <MRow label={'Boll. Sup. (' + raw.bollingerSource + ')'} value={'$' + raw.bollinger.upper} color={C.red} />
                <MRow label="Boll. Mid." value={'$' + raw.bollinger.middle} />
                <MRow label="Boll. Inf." value={'$' + raw.bollinger.lower} color={C.green} />
              </div>
            )}
            <MRow label="SMA 20j" value={raw.sma20 ? '$' + raw.sma20 : null} />
            <MRow label="SMA 50j" value={raw.sma50 ? '$' + raw.sma50 : null} />
            <MRow label="Support" value={raw.support ? '$' + raw.support : null} color={C.green} />
            <MRow label="Resistance" value={raw.resistance ? '$' + raw.resistance : null} color={C.red} />
            <div style={{ color: C.muted, marginTop: 8 }}>{ai.technical_summary}</div>
          </Section>

          <Section title="Fondamentaux (FMP + Yahoo)" expanded={exp.fund} onToggle={function() { tog('fund') }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <MCard label="PER" value={raw.per || null} />
              <MCard label="EPS" value={raw.eps ? '$' + raw.eps : null} />
              <MCard label="ROE" value={raw.roe || null} color={C.green} />
              <MCard label="ROA" value={raw.roa || null} color={C.blue} />
            </div>
            {raw.sector && <MRow label="Secteur" value={raw.sector} />}
            {raw.industry && <MRow label="Industrie" value={raw.industry} />}
            {raw.beta && <MRow label="Beta" value={raw.beta} />}
            <MRow label="Revenue" value={raw.revenue} />
            <MRow label="Croissance" value={raw.revenueGrowth} color={raw.revenueGrowth && raw.revenueGrowth.startsWith('-') ? C.red : C.green} />
            <MRow label="Marge brute" value={raw.grossMargins} />
            <MRow label="Free Cash Flow" value={raw.freeCashflow} />
            <MRow label="Dette/Capitaux" value={raw.debtEquity} />
            <MRow label="Ratio courant" value={raw.currentRatio} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
              <div style={{ fontSize: 12, color: C.muted }}>Score sante:</div>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.surface }}>
                <div style={{ height: '100%', width: (ai.fundamental_score || 0) + '%', borderRadius: 2, background: ai.fundamental_score > 70 ? C.green : ai.fundamental_score > 40 ? C.amber : C.red }} />
              </div>
              <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{ai.fundamental_score}/100</div>
            </div>
            <div style={{ color: C.muted }}>{ai.fundamental_summary}</div>

            {raw.quarterlyData && raw.quarterlyData.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Resultats trimestriels</div>
                {raw.quarterlyData.map(function(q, i) {
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid ' + C.border, fontSize: 12 }}>
                      <span style={{ color: C.muted }}>{q.date}</span>
                      <span style={{ fontFamily: 'monospace' }}>EPS: {q.eps}</span>
                      <span style={{ fontFamily: 'monospace', color: q.revenueGrowth > 0 ? C.green : C.red }}>{q.revenueGrowth > 0 ? '+' : ''}{q.revenueGrowth ? (q.revenueGrowth * 100).toFixed(1) + '%' : '—'}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {raw.nextEarnings && (
              <div style={{ marginTop: 8, padding: '6px 10px', background: '#ede9fe', borderRadius: 6, fontSize: 12, color: '#7c3aed' }}>
                Prochains resultats: {raw.nextEarnings}
              </div>
            )}
          </Section>

          <Section title="Insider Trading (FMP)" expanded={exp.insider} onToggle={function() { tog('insider') }}>
            {raw.insiderTrades && raw.insiderTrades.length > 0 ? (
              <div>
                <div style={{ padding: '6px 10px', background: C.surface, borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                  Signal: <span style={{ fontWeight: 700, color: ai.insider_signal && ai.insider_signal.includes('Achat') ? C.green : ai.insider_signal && ai.insider_signal.includes('Vente') ? C.red : C.amber }}>{ai.insider_signal}</span>
                  <div style={{ color: C.muted, marginTop: 4 }}>{ai.insider_summary}</div>
                </div>
                {raw.insiderTrades.map(function(t, i) {
                  var isBuy = t.type && (t.type.includes('Buy') || t.type.includes('Achat') || t.type.includes('P-Purchase'))
                  return (
                    <div key={i} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid ' + C.border, fontSize: 12, flexWrap: 'wrap' }}>
                      <span style={{ color: isBuy ? C.green : C.red, fontWeight: 600 }}>{isBuy ? 'ACHAT' : 'VENTE'}</span>
                      <span style={{ color: C.text }}>{t.name}</span>
                      <span style={{ color: C.muted, fontFamily: 'monospace' }}>{t.shares && t.shares.toLocaleString()} actions</span>
                      <span style={{ color: C.muted, marginLeft: 'auto' }}>{t.date}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{ color: C.muted, fontSize: 12, padding: '8px 0' }}>Insider trading non disponible sur le plan gratuit FMP</div>
            )}
          </Section>

          <Section title="Prediction IA 7 jours" expanded={exp.pred} onToggle={function() { tog('pred') }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
              <MCard label="Probabilite hausse" value={(ai.prediction_probability_up || 0) + '%'} color={ai.prediction_probability_up > 60 ? C.green : ai.prediction_probability_up < 40 ? C.red : C.amber} />
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
            {raw.sources && raw.sources.join(' · ')} · {data.date}
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
  var [period, setPeriod] = useState('1j')
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
      var raw = parseAllData(await fetchStockData(ticker, period), ticker)
      var ai = await analyzeWithGemini(raw)
      var date = new Date().toLocaleString('fr-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      setData(function(p) { var n = Object.assign({}, p); n[ticker] = { raw: raw, ai: ai, date: date }; return n })
    } catch (e) {
      setData(function(p) { var n = Object.assign({}, p); n[ticker] = { error: e.message }; return n })
    }
  }, [])

  var runAll = async function() {
    setRunning(true)
    for (var i = 0; i < tickers.length; i++) { await analyze(tickers[i]) }
    setRunning(false)
  }

  var addTicker = function() {
    var v = input.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
    if (v && !tickers.includes(v)) setTickers(function(p) { return p.concat([v]) })
    setInput('')
  }

  var addAlert = function() {
    if (!alertForm.ticker || !alertForm.value) return
    setAlerts(function(p) { return p.concat([Object.assign({}, alertForm, { id: Date.now(), ticker: alertForm.ticker.toUpperCase() })]) })
    setAlertForm({ ticker: '', type: 'price', value: '', direction: 'above' })
  }

  var runBacktest = async function() {
    setBtLoading(true); setBtResult(null)
    try {
      var raw = parseAllData(await fetchStockData(btTicker), btTicker)
      var prompt = 'Backtest "' + btStrategy + '" sur ' + btTicker + '. Donnees: Prix=' + raw.currentPrice + ', RSI=' + raw.rsi + ' (' + raw.rsiSource + '), MACD=' + raw.macd + ', SMA20=' + raw.sma20 + ', SMA50=' + raw.sma50 + ', Support=' + raw.support + ', Resistance=' + raw.resistance + ', Historique30j=[' + (raw.closes||[]).join(',') + ']. Sources: ' + raw.sources.join(',') + '. Reponds JSON: {"strategy":"","ticker":"","period":"","total_return":"","win_rate":"","max_drawdown":"","nb_trades":0,"sharpe_ratio":"","vs_buy_hold":"","trades":[{"date":"","action":"ACHAT|VENTE","price":0,"return_pct":null,"reason":""}],"summary":""}'
      var res = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt }) })
      var d = await res.json()
      var text = (d.result || '{}').replace(/```json/g, '').replace(/```/g, '').trim()
      setBtResult(JSON.parse(text))
    } catch (e) { setBtResult({ error: e.message }) }
    setBtLoading(false)
  }

  var IS = { width: '100%', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: C.text, marginBottom: 8 }
  var SS = { width: '100%', background: C.surface, border: '1px solid ' + C.border, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: C.text, marginBottom: 8 }
  var BP = { width: '100%', padding: 12, background: C.text, color: C.bg, border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
  var CS = { background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 16, marginBottom: 12 }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', paddingBottom: 80, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{'@keyframes p{0%,100%{opacity:.2}50%{opacity:1}} input::placeholder{color:#a0aec0} body{background:#f8f9fa}'}</style>

      <div style={{ background: C.card, borderBottom: '1px solid ' + C.border, padding: '14px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Stock Agent Pro</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Yahoo · Alpha Vantage · FMP · NewsAPI · FRED · Gemini AI</div>
      </div>

      <div style={{ display: 'flex', background: C.card, borderBottom: '1px solid ' + C.border, position: 'sticky', top: 57, zIndex: 9 }}>
        {[['dashboard','Dashboard'],['alerts','Alertes'],['backtest','Backtest']].map(function(item) {
          return <button key={item[0]} style={{ flex: 1, padding: '11px 0', fontSize: 12, fontWeight: 500, border: 'none', background: 'none', color: tab === item[0] ? C.text : C.muted, borderBottom: tab === item[0] ? '2px solid ' + C.text : '2px solid transparent', cursor: 'pointer' }} onClick={function() { setTab(item[0]) }}>{item[1]}</button>
        })}
      </div>

      <div style={{ padding: 16 }}>
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input value={input} onChange={function(e){setInput(e.target.value.toUpperCase())}} placeholder="AAPL, TSLA, BTC-USD..." onKeyDown={function(e){if(e.key==='Enter')addTicker()}} style={Object.assign({},IS,{flex:1,marginBottom:0})} />
              <button onClick={addTicker} style={{ padding:'10px 14px', background:C.surface, border:'1px solid '+C.border, borderRadius:8, color:C.text, cursor:'pointer', fontSize:18, flexShrink:0 }}>+</button>
            </div>
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tickers.map(function(t) {
                return <span key={t} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', background:C.surface, border:'1px solid '+C.border, borderRadius:20, fontSize:12, fontWeight:600, color:C.text, fontFamily:'monospace' }}>{t}<span onClick={function(){setTickers(function(p){return p.filter(function(x){return x!==t})});setData(function(p){var n=Object.assign({},p);delete n[t];return n})}} style={{cursor:'pointer',color:C.muted}}>x</span></span>
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {['1j','1s','1m','3m','1an'].map(function(p) {
                return <button key={p} onClick={function(){setPeriod(p)}} style={{ flex:1, padding:'8px 0', fontSize:12, fontWeight:600, cursor:'pointer', borderRadius:8, border:'1px solid '+(period===p?C.blue:C.border), background:period===p?C.blue:'transparent', color:period===p?'#fff':C.muted }}>{p.toUpperCase()}</button>
              })}
            </div>
            <button style={BP} onClick={runAll} disabled={running||!tickers.length}>{running?'Analyse en cours...':'Tout analyser'}</button>
            <button onClick={function(){window.open('/api/test-keys','_blank')}} style={{ width:'100%', marginTop:6, padding:'8px', fontSize:12, cursor:'pointer', borderRadius:8, border:'1px solid '+C.border, background:'transparent', color:C.muted }}>🔑 Tester mes clés API</button>
            <div style={{ marginTop: 12 }}>
              {tickers.length===0 ? <div style={{textAlign:'center',color:C.muted,padding:'40px 0',fontSize:14}}>Ajoutez des actions pour commencer</div> : tickers.map(function(t){return <StockCard key={t} ticker={t} data={data[t]} onAnalyze={function(){analyze(t)}} />})}
            </div>
          </div>
        )}

        {tab === 'alerts' && (
          <div>
            <div style={CS}>
              <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:12}}>Nouvelle alerte</div>
              <input placeholder="Ticker (AAPL...)" value={alertForm.ticker} onChange={function(e){setAlertForm(function(p){return Object.assign({},p,{ticker:e.target.value.toUpperCase()})})}} style={IS} />
              <select value={alertForm.type} onChange={function(e){setAlertForm(function(p){return Object.assign({},p,{type:e.target.value})})}} style={SS}><option value="price">Prix ($)</option><option value="percent">Variation (%)</option><option value="rsi">RSI</option></select>
              <select value={alertForm.direction} onChange={function(e){setAlertForm(function(p){return Object.assign({},p,{direction:e.target.value})})}} style={SS}><option value="above">Au-dessus de</option><option value="below">En-dessous de</option></select>
              <input type="number" placeholder="Valeur" value={alertForm.value} onChange={function(e){setAlertForm(function(p){return Object.assign({},p,{value:e.target.value})})}} style={IS} />
              <button style={BP} onClick={addAlert}>+ Creer l'alerte</button>
            </div>
            {alerts.map(function(a){
              return <div key={a.id} style={Object.assign({},CS,{display:'flex',alignItems:'center',justifyContent:'space-between'})}>
                <div><div style={{fontSize:15,fontWeight:700,color:C.text,fontFamily:'monospace'}}>{a.ticker}</div><div style={{fontSize:12,color:C.muted}}>{a.direction==='above'?'Au-dessus de':'En-dessous de'} {a.value}{a.type==='price'?'$':a.type==='percent'?'%':' RSI'}</div></div>
                <button onClick={function(){setAlerts(function(p){return p.filter(function(x){return x.id!==a.id})})}} style={{background:'none',border:'none',color:C.red,fontSize:18,cursor:'pointer'}}>X</button>
              </div>
            })}
          </div>
        )}

        {tab === 'backtest' && (
          <div>
            <div style={CS}>
              <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:12}}>Configuration</div>
              <input value={btTicker} onChange={function(e){setBtTicker(e.target.value.toUpperCase())}} placeholder="Ticker" style={IS} />
              <select value={btStrategy} onChange={function(e){setBtStrategy(e.target.value)}} style={SS}>
                <option value="RSI + SMA">RSI + SMA Crossover</option>
                <option value="Bollinger Bands">Bollinger Bands</option>
                <option value="RSI seul (30/70)">RSI seul (30/70)</option>
                <option value="SMA 20/50 Crossover">SMA 20/50 Crossover</option>
              </select>
              <button style={BP} onClick={runBacktest} disabled={btLoading}>{btLoading?'Simulation...':'Lancer le backtest'}</button>
            </div>
            {btLoading && <Loading />}
            {btResult && !btLoading && (btResult.error ? <div style={{color:C.red,padding:16,fontSize:13}}>{btResult.error}</div> :
              <div style={CS}>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:12}}>{btResult.ticker} - {btResult.strategy}</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
                  <MCard label="Rendement total" value={btResult.total_return} color={btResult.total_return&&btResult.total_return.startsWith('-')?C.red:C.green}/>
                  <MCard label="Win rate" value={btResult.win_rate} color={C.blue}/>
                  <MCard label="Max Drawdown" value={btResult.max_drawdown} color={C.red}/>
                  <MCard label="vs Buy and Hold" value={btResult.vs_buy_hold} color={C.amber}/>
                </div>
                <MRow label="Trades" value={btResult.nb_trades}/><MRow label="Sharpe" value={btResult.sharpe_ratio}/>
                <div style={{color:C.muted,fontSize:13,margin:'10px 0'}}>{btResult.summary}</div>
                {(btResult.trades||[]).map(function(t,i){
                  return <div key={i} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',padding:'6px 0',borderBottom:'1px solid '+C.border,fontSize:12}}>
                    <span style={{padding:'2px 8px',borderRadius:12,fontWeight:700,fontSize:11,background:t.action==='ACHAT'?'#052e16':'#2d0505',color:t.action==='ACHAT'?C.green:C.red}}>{t.action}</span>
                    <span style={{color:C.muted,fontFamily:'monospace'}}>{t.date}</span>
                    <span style={{fontFamily:'monospace',fontWeight:600}}>${t.price}</span>
                    {t.return_pct!=null&&<span style={{color:Number(t.return_pct)>=0?C.green:C.red,fontFamily:'monospace'}}>{Number(t.return_pct)>=0?'+':''}{t.return_pct}%</span>}
                    <span style={{color:C.muted,fontSize:11}}>{t.reason}</span>
                  </div>
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
