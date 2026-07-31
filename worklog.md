# AI Financial Brain — Work Log

---
Task ID: 1
Agent: Main Agent
Task: Add advanced features: Multi-Analysis API, Fear & Greed Index, Browser Notifications, CI/CD

Work Log:
- Created `/api/multi-analysis/[symbol]` — combines confidence score + backtest + sentiment in parallel (Promise.allSettled)
- Created `/api/fear-greed` — fetches CNN Fear & Greed Index with 365-day history, fallback data
- Created `fear-greed-index.tsx` — circular gauge UI with gradient, comparison cards, 30-day mini bar chart
- Added "Fear & Greed" tab in page.tsx (Tregu category)
- Enhanced watchlist.tsx with browser Notification API (permission request button + push on alert trigger)
- Created `.github/workflows/deploy.yml` (build-check + Vercel deploy on push to main)
- Created `.github/workflows/lint.yml` (npm ci + next lint)
- Build verified: all 29 routes compile successfully

Stage Summary:
- 5 new files created, 2 existing files modified
- Build passes: `npm run build` ✅
- Git commit made locally (push failed — GitHub token expired)
- User needs to update GITHUB_TOKEN secret and push manually

---
Task ID: 2
Agent: Main Agent
Task: Build AI Hybrid Prediction System (Teknikë + Fundamente)

Work Log:
- Created `src/lib/fundamental-engine.ts` — Fundamental analysis engine with 5 scoring factors:
  - Vlerësimi (Valuation): PE, PEG, P/B, Forward PE discount, Analyst target upside
  - Rritja (Growth): Revenue growth, Earnings growth, Quarterly acceleration
  - Rentabiliteti (Profitability): Gross margins, Operating margins, ROE
  - Shëndeti Financiar (Financial Health): Debt/Equity, Debt/Revenue, Cash position
  - Konsensusi i Analistëve (Analyst Consensus): Recommendation key, number of analysts
  - All descriptions in Albanian, scoring range -100 to +100
- Created `src/lib/hybrid-prediction.ts` — Core hybrid engine:
  - 60% technical + 40% fundamental weighting
  - Falls back to 100% technical when fundamentals unavailable
  - Agreement bonus: +15% confidence when both analyses agree
  - Disagreement penalty: -10% confidence when analyses disagree
  - AI insight generation in Albanian (template-based)
  - `rankHybridStocks()` and `rankByTotalScore()` for scan ranking
- Created `src/app/api/ai-predict/[symbol]/route.ts` — Single stock hybrid prediction API
  - Fetches 6mo historical data + fundamentals (15s timeout)
  - Returns HybridPredictionResult with totalScore, hybridConfidence, aiInsight
- Created `src/app/api/ai-predict-scan/route.ts` — Full 116-stock hybrid scan API
  - Processes in batches of 3 (slower for fundamental fetching)
  - Parallel historical + fundamental fetch per batch
  - Returns ranked results: topPicks (20), topShorts (10), mostConfident (15)
- Modified `src/components/financial-brain/stock-predictor.tsx`:
  - Added 3rd mode toggle button: "AI Hybrid" with Sparkles icon
  - Added HybridScanResult and HybridPredictionResult types
  - Full hybrid scan UI: stats bar, sub-tabs, table with 8 columns:
    - #, Ticker, Total (combined score), Teknik (tech score), Fundamentet (fund score), Sinjali, Besim H. (hybrid confidence), AI Insight
  - Expandable detail rows showing Technical factors + Fundamental factors side by side
  - Gradient button (violet→fuchsia) for visual distinction from technical scan
  - Loading animation with Sparkles icon
- Renamed "Skanim i Plotë (116 stoqe)" to "Skanim Teknik" for clarity

Stage Summary:
- 4 new files created, 1 existing file modified
- Build passes: `npm run build` ✅ (31 routes total, all compiling successfully)
- Lint passes: 0 errors on all new files
- Existing prediction-engine.ts was NOT modified
- Dev server running, no errors in log

---
Task ID: 3
Agent: Main Agent
Task: Global Spillover Engine — Asia→US semiconductor spillover detection

Work Log:
- Added `GlobalMarketSnapshot` and `SpilloverSignal` models to Prisma schema with 4+ indexes each
- Created `src/lib/global-market-data.ts` — data loader for 13 global instruments (KOSPI, Nikkei, HSI, SPY, QQQ, SMH, VIX + 6 semis), with enrichment (return1d/2d/5d, ATR14, SMA20/50), caching, DB persistence
- Created `src/lib/global-spillover.ts` — core analysis engine:
  - `analyzeGlobalSpillover()`: main function, fetches KOSPI/SMH/QQQ/VIX in parallel
  - `computeBaseScore()`: heuristic scoring (-100 to +100)
  - `isCapitulation()`: extreme drop + VIX spike + oversold detection
  - Heuristic: Kospi2D ≤ -10% + Kospi1D > -2% + SMH < 0 → RELIEF_RALLY (score=55, conf=0.7)
  - DB persistence: upsert SpilloverSignal, save GlobalMarketSnapshot
  - `getSpilloverAccuracy()`: historical accuracy stats for RELIEF_RALLY/CONTINUATION
- Created `src/lib/spillover-backtest.ts` — 1yr walk-forward backtest:
  - RELIEF_RALLY → long, CONTINUATION → short, NEUTRAL → no-trade
  - 0.2% round-trip costs (0.1% commission + 0.05% slippage + 0.05% spread)
  - Metrics: Sharpe, Sortino, max drawdown, profit factor, expectancy, per-setup breakdown
  - `runMultiTickerBacktest()` for SMH/NVDA/AMD/MU/MRVL
- Created `src/app/api/global-spillover/[symbol]/route.ts` — GET endpoint
- Created `src/app/api/global-spillover/backtest/route.ts` — GET endpoint (single + multi)
- Modified `src/app/api/predict/[symbol]/route.ts`:
  - Spillover runs in parallel with other modules
  - 10% weight for semis/tech, 3% for other stocks
  - Stored as `global_spillover` factor with type `macro_global`
  - Included in response JSON
- Modified `src/lib/no-trade-gate.ts`:
  - 3 new spillover gates: NEUTRAL+low conf, CONTINUATION+BUY block, CAPITULATION+low conf
- Modified `src/lib/prediction-factors.ts`: added `macro_global` to FactorInput type
- Generated Prisma client, typecheck passes (0 errors in spillover files)
- Committed and pushed to GitHub

Stage Summary:
- 4 new files, 4 modified files
- Prisma schema: 2 new models (GlobalMarketSnapshot, SpilloverSignal)
- API endpoints: /api/global-spillover/[symbol], /api/global-spillover/backtest
- Pipeline integration: spillover factor flows through predict → factors → DB → gate
- Backtest engine: walk-forward with realistic cost model
- Next step: when DATABASE_URL is configured on Vercel, run migration to create tables

---
Task ID: 4
Agent: Main Agent
Task: Upgrade Global Spillover to V1+V2 with 16-feature vector, logistic regression, walk-forward

Work Log:
- Updated Prisma schema: SpilloverSignal got modelVersion/features/targetSector, GlobalMarketSnapshot got assetType/sma200, new SpilloverModelResult model
- Rewrote global-market-data.ts: getDailyHistory(days), getGlobalSnapshot(), saveMarketSnapshots(), assetType field, SMA200
- Created spillover-features.ts: 16 features (kospi1d/2d/5d, nikkei1d, hsi1d, smh1d/2d, qqq1d, vix1d, target1d/2d, targetDistanceFromSma20, targetAtrZ, semisBreadth, asiaDeceleration, oversoldScore), rollingZScore, computeATR, computeOversoldState, featuresToArray
- Rewrote global-spillover.ts as V1: detectReliefRally/detectContinuation/detectCapitulation separate scoring functions, scoreSpillover combines, modelVersion='spillover-v1'
- Created spillover-v2.ts: pure JS logistic regression (gradient descent + L2), buildSpilloverDataset (labels: RELIEF_RALLY/CONTINUATION/NEUTRAL), trainSpilloverModel, predictSpilloverV2, walkForwardValidate (12mo train / 1mo test), Brier score, OOS precision/recall, saveModelResult/evaluateModelResults
- Rewrote spillover-backtest.ts: 3 modes (v1_only/v2_only/v1_plus_v2), v1_plus_v2 agreement logic (both agree=trade, disagree=NO_TRADE, V2 probDown>=0.65=NO_TRADE), walk-forward windows in output, Brier score
- Created /api/global-spillover/backtest/[symbol]/route.ts with ?mode= param
- Updated predict route to handle V1 features in response
- Typecheck passes: 0 errors in spillover files
- Committed and pushed to GitHub

Stage Summary:
- 2 new files (spillover-features.ts, spillover-v2.ts), 8 modified files
- V1: 16-feature heuristic engine with separate detection functions
- V2: logistic regression + walk-forward validation (no external deps)
- Decision logic: V1+V2 agreement=trade, V2 probDown>=0.65=block, disagreement=NO_TRADE
- Production path: V1 live now, V2 trains on accumulated data, only activates when OOS wins

---
Task ID: 5
Agent: Main Agent
Task: Add V1 live + V2 shadow operational layer (promotion logic, compare endpoint, predict integration)

Work Log:
- Verified all V2 architecture already in place from previous session (schema, features, V2 model, 3-mode backtest, routes)
- Created `src/lib/spillover-promotion.ts`:
  - `getActiveModel()`: returns 'spillover-v1' or 'spillover-v2-logreg' with 4h in-memory cache
  - `compareModels()`: V2 must win 2/3 metrics (precision +2pp, Brier -0.01, return +0.05pp) + 50 OOS samples + no catastrophic regression
  - `runV2ShadowPrediction()`: trains on ~300d data, predicts today, saves to SpilloverModelResult
  - `runFullComparison()`: computes V1 metrics from DB signals, V2 metrics from walk-forward, returns detailed ComparisonResult
  - `computeV1MetricsFromDB()`: reads SpilloverSignal + GlobalMarketSnapshot for V1 Brier/precision/return
  - V1 always kept as fallback
- Modified `src/app/api/predict/[symbol]/route.ts`:
  - V2 shadow mode: fire-and-forget `runV2ShadowPrediction()` for semis/tech, saves to DB, does NOT affect scoring
  - Response includes `spilloverModelConfig`: activeModel, v2Status ('shadow'|'active'), v2Promotion criteria
  - Fixed fallback spillover object to include features + modelVersion for type safety
- Created `src/app/api/global-spillover/compare/route.ts`:
  - GET: full V1 vs V2 OOS comparison
  - 4-phase status tracking (Phase 1: V1 live/V2 shadow, Phase 2: weekly comparison, Phase 3: V2 promoted, Phase 4: V1 fallback)
  - `?evaluate=true` runs pending V2 outcome evaluations
  - `?refresh=true` resets promotion cache
- Type-check passes: 0 errors in all spillover/predict files
- Committed and pushed to GitHub

Stage Summary:
- 2 new files (spillover-promotion.ts, compare/route.ts), 1 modified (predict route)
- 4-Phase Activation: V1 live → weekly OOS comparison → V2 promotion → V1 fallback
- V2 promotion criteria: 50+ OOS samples, wins 2/3 (precision, Brier, return), no catastrophic regression
- V2 shadow predictions saved to SpilloverModelResult daily for semis/tech stocks
- API: /api/global-spillover/compare for monitoring V1 vs V2 performance

---
Task ID: 6
Agent: Main Agent
Task: Build Regime Intelligence Layer — 5-state orchestrator with policy routing

Work Log:
- Updated Prisma schema: added `RegimeSnapshot` model (daily regime state, features, policy, drivers), added `regimeState`/`regimeConfidence`/`regimePolicy` to Prediction model, added @@index on regimeState+wasCorrect
- Created `regime-policy.ts`: 5 policies (BULL_LOW_VOL, BEAR_HIGH_VOL, PANIC_CAPITULATION, RELIEF_RALLY, RANGE_NEUTRAL) with confidenceFloor, allowLongs/Shorts, noTradeBias, scoreMultiplier, spillover/tech/fund weight multipliers, maxPositionSize, stopLossTightening, boosted/suppressed factor lists
- Created `regime-intelligence.ts`: 18-feature classifier (spy1d/5d/20d, qqq1d/5d, vixLevel/1d, smh1d/5d, kospi1d/2d, semisBreadth, atrZScore, adxLevel, eventRiskScore, spilloverScore/Setup), priority-ordered scoring (PANIC > RELIEF > BEAR > BULL > RANGE), confidence from score dominance, transition risk estimator, DB persistence, getRegimeHistory(), getRegimeAccuracyStats()
- Created `regime-router.ts`: per-regime factor weight modifiers (e.g. PANIC: global_spillover 2x, atr 2x, valuation 0x; RELIEF: rsi 1.5x, stochastic 1.5x, analystSentiment 0.3x; BULL: maTrend 1.5x, growth 1.3x, atr 0.3x), routeWeightsByRegime() applies modifiers + normalizes, adjusts horizon ratios
- Created `regime-hmm.ts`: HMM skeleton with Gaussian emission types, 5-state definition, trainRegimeHMM/inferCurrentRegime/predictNextRegimeTransition placeholders, gaussianPDF helper
- Created `/api/regime/current/route.ts`: GET with ?history=30&accuracy=true&modifiers=true&policies=true
- Created `/api/regime/backtest/route.ts`: per-regime winRate, avgReturn, NO_TRADE count, regime distribution, transition tracking
- Modified predict route: regime intelligence runs after spillover+eventRisk, weights replaced by regime-routed weights, score multiplier applied, confidence floor enforced, direction check via policy, regimeIntelligence block in response, regimeState saved to every Prediction
- Modified no-trade-gate.ts: accepts optional RegimePolicy, PANIC_CAPITULATION blocks all trades, confidence below regime floor blocked
- Regenerated Prisma client, type-check passes (0 errors in our files)
- Committed and pushed to GitHub

Stage Summary:
- 6 new files, 3 modified files
- Pipeline flow: global-market-data → spillover-features → spillover V1/V2 → **regime-intelligence** → regime-router → confidence calibration → no-trade gate → final prediction
- Key principle: same indicators, different interpretation per regime
- RELIEF_RALLY: spillover 2x, RSI 1.5x, no shorts, confidence floor 50
- PANIC_CAPITULATION: all trades blocked, fundamentals 0x, only spillover+atr active
- BULL_LOW_VOL: fundamentals 1.2x, trend 1.5x, lower confidence floor 35
- HMM skeleton ready for future implementation (Baum-Welch, Viterbi)

---
Task ID: 2-b
Agent: Main Agent
Task: Add Brier calibration operational layer (schema, save, evaluate, metrics, dashboard)

Work Log:
- Updated prisma/schema.prisma: added `actualOutcome Int?`, `transitionRisk Float?` to Prediction model, added `ModelMetricSnapshot` model with indexes
- Created `src/lib/save-prediction.ts`: Brier-ready persistence wrapping existing savePredictionToDB with transitionRisk + batch support
- Created `src/lib/evaluate-prediction.ts`: single-prediction + batch Brier evaluator that computes actualOutcome (binary 0/1) using real entryPrice
- Created `src/lib/model-metrics.ts`: Brier score (mean((f-o)^2)), per-regime Brier, per-horizon Brier, precision/recall, max drawdown, snapshot + history
- Created `src/app/api/model-metrics/route.ts`: GET (current metrics or history timeline), POST (snapshot with validation)
- Created `src/app/api/evaluator/cron/route.ts`: POST endpoint that runs both legacy + Brier evaluators in parallel, auto-snapshots metrics
- Modified `src/app/api/predict/[symbol]/route.ts`: replaced savePredictionToDB with new savePrediction (adds transitionRisk, modelVersion v3, predictionId per horizon in response)
- Created `src/app/model-metrics/page.tsx`: full calibration dashboard with 8 KPI cards, 4 chart tabs (Brier by regime, Brier by horizon, metrics timeline, gate analysis)
- Type-check: 0 errors in all new/modified files

Stage Summary:
- Prediction lifecycle: generate → save (regime+transitionRisk) → evaluate (cron at dueAt) → compute Brier → snapshot → recalibrate
- Brier score computed as mean((f-o)^2) where f=confidence/100, o=actualOutcome (0/1)
- Dashboard at /model-metrics with recharts: horizontal bar (regime), vertical bar (horizon), line (timeline), pie (gate)
- Endpoints: GET/POST /api/model-metrics, POST /api/evaluator/cron
- Each prediction now returns predictionId per horizon for tracking
- Model version bumped to `predict-v3-regime-spillover`