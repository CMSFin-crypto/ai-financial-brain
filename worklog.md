---
Task ID: 2
Agent: Main
Task: Fix criteria to user spec ($1-$20, Float<10M) and scan ALL US stocks

Work Log:
- Fixed PILLAR_CONFIG: priceMin=1 (was 2), floatMaxMillions=10 (was 20)
- Fixed price/float detail texts to match new thresholds
- Created `src/lib/us-stock-universe.ts` with 3 methods:
  - Method 1: NASDAQ Screener API (returns ALL 7,165 US stocks with prices in ONE call)
  - Method 2: NASDAQ Trader TXT files (fallback for ticker list only)
  - Method 3: Yahoo Finance gainers (fallback)
- Fixed parser: field names (lastsale not lastsaleprice), $ and % stripping
- Tested: NASDAQ API returns 7,165 stocks, 466 in $0.8-$25 with >=2% change, 52 with >=10%
- Rewrote `src/app/api/momentum/5-pillars/route.ts`:
  - Removed 500-line hand-picked SMALL_CAP_UNIVERSE
  - Now calls getAllUSStockSnapshots() to get ALL 7,165 US stocks
  - Pre-filters using price/change from NASDAQ data (no individual price fetches needed)
  - Falls back to Yahoo + NASDAQ Trader if primary fails
  - Summary now includes totalUniverse and totalPreFiltered
- Updated UI: labels show Price $1-$20, Float <10M, badge shows "X,XXX US stocks scanned"
- Build verified: 0 TS errors, Next.js build succeeds

Stage Summary:
- New file: `src/lib/us-stock-universe.ts` (3 methods, comprehensive US stock fetching)
- Modified: `src/lib/five-pillars-engine.ts` (price $1-$20, float <10M)
- Rewritten: `src/app/api/momentum/5-pillars/route.ts` (scans ALL 7,165 US stocks)
- Modified: `src/components/financial-brain/five-pillars.tsx` (labels, universe badge)
