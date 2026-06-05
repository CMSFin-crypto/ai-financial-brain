# REAL-TIME MARKET DATA REPORT
## Albanian Financial Brain — Data Fetch for Hardcoded Value Updates
### Date: June 4, 2026 | Sources: FRED, Yahoo Finance, CNBC, Seeking Alpha, TradingEconomics

---

## 1. MACROECONOMIC INDICATORS

### Federal Funds Rate (Effective)
| Metric | Value | Source |
|--------|-------|--------|
| **Current Rate** | **3.63%** (May 2026) | FRED (`FEDFUNDS`) |
| Recent History | 3.64% (Jan-Apr 2026), 3.63% (May 2026) | FRED |
| **Hardcoded in code** | 4.25-4.50% / 5.25-5.50% | `quant-analyze/route.ts`, `analysis-input.tsx` |
| **Needs update?** | **YES — code is 70-160bps too high** | |

### CPI Inflation Rate
| Metric | Value | Source |
|--------|-------|--------|
| **Headline CPI YoY** | **~3.3%** (May 2026 est.) | TradingEconomics |
| **Core CPI YoY** | **~2.7%** (April 2026, calc'd from index) | FRED (`CPILFESL` index 335.423/326.467) |
| **Hardcoded in code** | 3.1% / 2.4% (core) | `quant-analyze/route.ts` |
| **Needs update?** | **YES — headline CPI should be ~3.3%, core ~2.7%** | |

### Treasury Yields
| Metric | Live Value | Hardcoded in Code | Source |
|--------|-----------|-------------------|--------|
| **2-Year** | **3.80%** | 4.65% | Yahoo Finance (`2YY=F`) |
| **5-Year** | **4.21%** | N/A | Yahoo Finance (`^FVX`) |
| **10-Year** | **4.49%** | 4.25% | Yahoo Finance (`^TNX`) |
| **30-Year** | **4.99%** | N/A | Yahoo Finance (`^TYX`) |
| **13-Week T-Bill** | **3.62%** | N/A | Yahoo Finance (`^IRX`) |
| **Needs update?** | **YES — 2Y is 85bps lower, 10Y is 24bps higher** | | |

### GDP Growth Rate
| Metric | Value | Source |
|--------|-------|--------|
| **Q1 2026 (annualized)** | **1.6%** | FRED (`A191RL1Q225SBEA`) |
| Q4 2025 | 0.5% | FRED |
| Q3 2025 | 4.4% | FRED |
| Q2 2025 | 3.8% | FRED |
| Q1 2025 | -0.6% | FRED |
| **Hardcoded in code** | 2.5% | `quant-analyze/route.ts` |
| **Needs update?** | **YES — 2.5% is overstated; actual Q1 2026 is 1.6%** | |

### Unemployment Rate
| Metric | Value | Source |
|--------|-------|--------|
| **April 2026** | **4.3%** | FRED (`UNRATE`) |
| March 2026 | 4.3% | FRED |
| Feb 2026 | 4.4% | FRED |
| Jan 2026 | 4.3% | FRED |
| **Hardcoded in code** | Not directly hardcoded (referenced as "NFP ~180K") | `quant-analyze/route.ts` |
| **Needs update?** | **YES — add explicit 4.3% unemployment rate** | |

### DXY Dollar Index
| Metric | Value | Source |
|--------|-------|--------|
| **Current** | **99.33** | Yahoo Finance (`DX-Y.NYB`) |
| Previous Close | 99.20 | Yahoo Finance |
| **Hardcoded in code** | "moderate" (no numeric value) | `quant-analyze/route.ts` |
| **Needs update?** | **YES — add DXY = 99.33** | |

---

## 2. MARKET INDICES (LIVE)

| Index | Current | Change | Source |
|-------|---------|--------|--------|
| **S&P 500** | **7,553.68** | +0.44% | Yahoo Finance |
| **NASDAQ** | **26,853.98** | +0.67% | Yahoo Finance |
| **DOW** | **50,687.07** | +0.08% | Yahoo Finance |
| **VIX** | **16.34** | — | Yahoo Finance |

---

## 3. COMMODITIES & CRYPTO (LIVE)

| Asset | Price | Change | Source |
|-------|-------|--------|--------|
| **Gold** | **$4,498.00** | — | Yahoo Finance (`GC=F`) |
| **WTI Oil** | **$94.66** | — | Yahoo Finance (`CL=F`) |
| **BTC** | **$62,782** | -2.11% | Yahoo Finance (`BTC-USD`) |
| **EUR/USD** | **1.1632** | — | Yahoo Finance |

---

## 4. KEY STOCK PRICES — HARD vs. LIVE

> ⚠️ **CRITICAL**: The hardcoded stock prices in `market-data.ts` are SIGNIFICANTLY outdated.
> Some stocks appear to have had splits (NVDA 10:1, AVGO 10:1). Live prices shown below.

| Ticker | Hardcoded Price | Live Price | Discrepancy | Split? |
|--------|----------------|------------|-------------|--------|
| **AAPL** | $232.85 | **$310.26** | +33% | No |
| **NVDA** | $1,318.50 | **$214.75** | -84% (price) | YES (10:1 split) |
| **MSFT** | $448.65 | **$427.34** | -5% | No |
| **GOOGL** | $178.42 | **$358.99** | +101% | Possible split |
| **AMZN** | $198.75 | **$250.02** | +26% | No |
| **META** | $528.30 | **$622.98** | +18% | No |
| **AVGO** | $1,785.20 | **$479.23** | -73% (price) | YES (10:1 split) |
| **CRM** | $345.80 | **$190.61** | -45% | Possible split |
| **ORCL** | $172.35 | **$230.33** | +34% | No |
| **TSLA** | $342.15 | **$423.70** | +24% | No |
| **LLY** | $858.50 | **$1,078.78** | +26% | No |
| **JPM** | $228.50 | **$300.85** | +32% | No |
| **V** | $328.75 | **$312.40** | -5% | No |

---

## 5. LATEST FINANCIAL NEWS HEADLINES (June 3-4, 2026)

### Market-Wide
1. **"The Stock Market Sounds an Alarm as Investors Get a Grim Update on President Trump's Economy"** — Yahoo Finance (Jun 4, 2026)
2. **"Stock Futures Drop After Market Snaps Record-Breaking Rally"** — Yahoo Finance (Jun 4, 2026)
3. **"U.S. Futures Mixed as Middle East Diplomacy, Broadcom Earnings and SpaceX IPO Capture Investor Attention"** — Yahoo Finance (Jun 4, 2026)
4. **"7 Words From Fed Chair Kevin Warsh That Should Terrify Wall Street"** — Yahoo Finance (Jun 4, 2026)
5. **"SoftBank shares plunge over 11% amid broader tech sell-off"** — CNBC (Jun 4, 2026)

### Corporate / Sector
6. **"SpaceX targets $135 IPO price at valuation of $1.77 trillion"** — CNBC (Jun 3, 2026)
7. **"Broadcom stock plunges on weak software sales, unchanged AI chip forecast"** — CNBC (Jun 3, 2026)
8. **"CrowdStrike narrowly beats estimates on AI tailwinds, but stock falls 10%"** — CNBC (Jun 3, 2026)
9. **"Jim Cramer warns excess supply could be the next biggest threat to the bull market"** — CNBC (Jun 3, 2026)
10. **"TSMC boss bets big on AI growth, says he'd 'like' to hike chip prices"** — Yahoo Finance (Jun 4, 2026)
11. **"Morgan Stanley sees major upside for Apple stock ahead of WWDC"** — Yahoo Finance (Jun 4, 2026)
12. **"Warren Buffett's Berkshire Hathaway doubles down on Google"** — Yahoo Finance (Jun 3, 2026)
13. **"Sellers are pulling homes off the market at the fastest pace since 2020"** — CNBC (Jun 3, 2026)
14. **"Amazon engineers slam employer for building AI data centers while laying off 30,000"** — CNBC (Jun 4, 2026)

### Geopolitical / Macro
15. **"The Iran war is exposing weak spots in the AI supply chain"** — CNBC (Jun 19, 2026)
16. **"Hidden beneath AI chips, Chinese-made circuit boards raise national security concerns in U.S."** — CNBC (Jun 3, 2026)

---

## 6. KEY FINDINGS & RECOMMENDED CODE UPDATES

### Macro Data Updates Needed in `quant-analyze/route.ts`

**Current hardcoded values (lines ~354-361):**
```typescript
interestRates: { fedRate: '5.25-5.50%', trend: 'expected_cuts', impact: 'positive' },
yieldCurve: { twoYear: '4.65%', tenYear: '4.25%', status: 'inverted', impact: 'caution' },
inflation: { cpi: '3.1%', trend: 'cooling', impact: 'positive' },
gdp: { growth: '2.5%', trend: 'stable', impact: 'neutral' },
fedStance: 'dovish',
dollarStrength: 'moderate',
keyFactors: ['Fed funds rate 4.25-4.50%, gradual easing cycle', 'Core CPI ~2.4%, approaching 2% target', 'Labor market stable, NFP ~180K'],
```

**Recommended updated values:**
```typescript
interestRates: { fedRate: '3.50-3.75%', trend: 'gradual_easing_complete', impact: 'positive' },
yieldCurve: { twoYear: '3.80%', tenYear: '4.49%', status: 'normal', impact: 'neutral' },
inflation: { cpi: '3.3%', trend: 'cooling_slowly', coreCpi: '2.7%', impact: 'caution' },
gdp: { growth: '1.6%', trend: 'slowing', impact: 'caution' },
employment: { unemploymentRate: '4.3%', trend: 'stable', nfp: '~150K' },
fedStance: 'data_dependent',
dollarStrength: 'moderate',
dxyIndex: 99.33,
keyFactors: [
  'Fed funds rate 3.63%, easing cycle near completion under Chair Warsh',
  'Headline CPI ~3.3%, Core CPI ~2.7%, still above 2% target',
  'Unemployment 4.3%, labor market gradually softening',
  'GDP growth 1.6% annualized (Q1 2026), down from prior quarters',
  'Yield curve normalized — 10Y at 4.49% vs 2Y at 3.80%'
],
```

**Also update in `quant-analyze/route.ts` lines ~163-171 (SYSTEM_PROMPT example):**
```typescript
"interestRates": {"fedRate": "3.50-3.75%", "trend": "near_terminal", "impact": "positive"},
"yieldCurve": {"twoYear": "3.80%", "tenYear": "4.49%", "status": "normal", "impact": "neutral"},
"inflation": {"cpi": "3.3%", "coreCpi": "2.7%", "trend": "cooling_slowly", "impact": "caution"},
"gdp": {"growth": "1.6%", "trend": "slowing", "impact": "caution"},
```

### Updates Needed in `analysis-input.tsx` (line 30)
**Current:** "The US Federal Reserve held rates steady at 4.25-4.50% in its June 2026 meeting"
**Recommended:** "The US Federal Reserve under Chair Kevin Warsh maintained rates at 3.50-3.75% in its June 2026 meeting"

### Updates Needed in `sector-scan/route.ts` (line 180)
**Current:** "Fed funds rate 4.25-4.50%, sinjalizim uljeje graduale"
**Recommended:** "Fed funds rate 3.50-3.75%, easing cikli përfundon, politikë data-dependent"

### Updates Needed in `sector-scan/route.ts` (line 182)
**Current:** "Core CPI 2.4%, duke afruar targetin 2%"
**Recommended:** "Core CPI 2.7%, afro 2.4% headline, akoma mbi targetin 2%"

### Stock Price Updates
> ⚠️ Stock prices in `market-data.ts` are dramatically stale. NVDA and AVGO show 10:1 split effects.
> The project already has `alpha-vantage.ts` for live price fetching, which is correctly used in API routes.
> However, the fallback demo data uses hardcoded prices that are now very far off.
> **Recommendation:** The demo/fallback generation functions should dynamically use `getRealPrice()` first.

### News Updates
> News headlines are entirely hardcoded in the quant analysis demo data.
> **Recommendation:** Consider adding a lightweight RSS fetcher using Yahoo Finance or CNBC RSS feeds
> to inject real headlines into the demo analysis, similar to how `alpha-vantage.ts` fetches live prices.

---

## 7. DATA SOURCES

| Source | API/URL | What Was Fetched |
|--------|---------|-----------------|
| **FRED** (Federal Reserve Economic Data) | `fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS` | Fed Funds Rate, Unemployment, GDP, Core CPI Index |
| **Yahoo Finance v8 Chart API** | `query1.finance.yahoo.com/v8/finance/chart/{ticker}` | All stock prices, treasury yields, DXY, indices, commodities |
| **CNBC RSS** | `cnbc.com/id/100003114/device/rss/rss.html` | Latest financial news headlines |
| **Yahoo Finance RSS** | `feeds.finance.yahoo.com/rss/2.0/headline` | Market-specific news headlines |
| **Seeking Alpha RSS** | `seekingalpha.com/market_currents.xml` | Market currents and analysis |
| **TradingEconomics** | `tradingeconomics.com/united-states/*` | Cross-reference for CPI, unemployment |

---

## 8. CONTEXT NOTES

- **Fed Chair**: Kevin Warsh (not Jerome Powell) — confirmed from news headlines dated June 2026
- **Market Sentiment**: Mixed to cautiously bearish. S&P at record highs but pulling back on June 4, 2026.
  "Stock Futures Drop After Market Snaps Record-Breaking Rally"
- **Geopolitical**: Iran tensions ongoing ("Iran war exposing weak spots in AI supply chain")
- **IPO Activity**: SpaceX IPO targeting $135/share at $1.77T valuation
- **AI Sector**: Broadcom earnings missed on software, CrowdStrike beat but stock fell 10%,
  TSMC signaling chip price hikes, NVDA entering PC market
- **Housing Market**: Sellers pulling homes off market at fastest pace since 2020
