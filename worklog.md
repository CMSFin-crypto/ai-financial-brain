---
Task ID: 8
Agent: main
Task: Architectural refactoring — Zod validation, service layer, calibration integration, reliability dashboard

Work Log:
- Created src/lib/api-schemas.ts: Zod schemas for calibration, conformal, model-metrics query params
- Created src/lib/parse-query.ts: Generic Zod-powered query parser for Next.js routes
- Created src/lib/calibration-service.ts: Service layer decoupling routes from calibration-metrics internals. Includes getCalibrationReport, applyBucketCalibration, getCalibrationByRegime, getCalibrationByVersion, trainCalibrationModel, getCalibratorInfo
- Created src/lib/conformal-service.ts: Service layer decoupling routes from conformal-risk internals. Includes getConformalDecision, fitConformalThreshold, buildConformalDecision, getFullConformalPrediction
- Rewrote /api/model-calibration route: 5 branches (report, byRegime, byVersion, timeseries, train) all validated via Zod parseQuery
- Rewrote /api/conformal/[symbol] route: Zod validation, profile + single-prediction modes
- Integrated calibration service into predict route: bucket-calibration applied before conformal gate, calibration metadata returned in response
- Extended /model-metrics dashboard: added "Model Reliability" tab as first tab with ECE/Brier/MCE/Diagnosis/Calibrator KPIs, reliability diagram (scatter plot with diagonal reference), reliability table with color-coded errors, calibrator info footer
- Created /api/cron/rebuild-calibration route: weekly job that invalidates caches, retrains calibrator, warms conformal cache
- Updated vercel.json: added Monday 06:00 UTC cron for rebuild-calibration

Stage Summary:
- 6 new files, 4 modified files
- Clean layered architecture: api-schemas → parse-query → service → route → UI
- Zod validation protects all calibration/conformal endpoints from bad query params
- Predict route now applies bucket calibration BEFORE conformal gate (raw → calibrated → conformal)
- Dashboard shows reliability diagram (predicted vs observed with diagonal) + per-bucket table
- Weekly cron auto-retrains calibrator and warms caches
- Build passes clean, no new tsc errors

---
Task ID: 9
Agent: main
Task: Implement 5 structural advantage modules: Event-risk engine, Feature store, Ensemble/model averaging, Trade queue, Scenario planner

Work Log:
- Created src/lib/event-calendar.ts: centralized event calendar with FOMC dates 2025-2027, recurring macro events (NFP, CPI, PPI, GDP, PMI, retail, housing, jobless claims), earnings season detection, queryable by symbol/date/category/importance
- Created src/lib/event-risk-engine.ts: converts calendar events into trade restrictions (NO_TRADE 24h before earnings, SIZE_REDUCTION before major macro, NO_NEW_ENTRIES 30-60 min around events), batch assessment, quick canEnterTrade check
- Created /api/event-risk GET endpoint (single symbol, batch, quick check)
- Created src/lib/feature-definitions.ts: 30+ centralized feature definitions across 7 sources (technical, fundamental, regime, market, spillover, event, derived), versioned, with range validation, model feature sets, version hash fingerprinting
- Created src/lib/feature-store.ts: snapshot features at prediction time via PredictionFactor table, retrieve snapshots, training/inference consistency checking via version hash comparison
- Created /api/features/[symbol] GET+POST endpoint (schema view, snapshot retrieval, consistency check, feature vector validation)
- Created src/lib/model-ensemble.ts: 5-model ensemble (technical 35%, fundamental 20%, regime-sensitive 25%, mean-reversion 10%, event-risk 10%), weighted average score, confidence band from disagreement, disagreement-based action modifier (NORMAL/REDUCE_SIZE/SKIP), size multiplier
- Created /api/ensemble-predict/[symbol] GET+POST endpoint
- Created src/lib/trade-queue.ts: capital efficiency via 5-dimension scoring (EV 30pts, capital efficiency 20pts, correlation bonus 15pts, event risk penalty -20pts, agreement bonus 15pts), priority-sorted queue with capital budgeting (60% max portfolio, 10% max single trade)
- Created /api/trade-queue POST endpoint
- Created src/lib/scenario-planner.ts: pre-trade what-if with base/bull/bear cases, invalidation level, key support/resistance, assumptions with sensitivity, thesis changers, R/R calculation, time horizon
- Created /api/scenario-plan/[symbol] GET+POST endpoint
- All 11 new files compile clean (0 new tsc errors), 0 new lint errors

Stage Summary:
- 11 new files created (7 lib modules + 4 API routes)
- 5 new structural advantage modules that reduce single-model dependency, operational risk, and training/inference inconsistency
- Event-risk: protects from entering trades at bad times (earnings, FOMC, CPI)
- Feature store: 30+ versioned feature definitions with hash-based consistency checking
- Ensemble: weighted 5-model averaging with disagreement-based action modifiers
- Trade queue: priority scoring with 5 dimensions + capital budgeting
- Scenario planner: pre-trade base/bull/bear/invalidation framework

---
Task ID: 1-7
Agent: main
Task: Build 3 advanced layers (Calibration Lab, Conformal Risk, Lead-Lag Graph) + Model Promotion governance

Work Log:
- Explored full codebase: 40 lib files, 47 API routes, prisma schema, predict pipeline
- Read existing calibration (confidence-calibration.ts), spillover-promotion.ts, model-metrics.ts, save-prediction.ts
- Created calibration-metrics.ts: ECE, MCE, Brier, reliability table, per-regime/version/time-series breakdowns, auto-diagnosis
- Created probability-calibrator.ts: Isotonic regression (PAVA), Platt scaling, auto-method selection, 30-min cache
- Created conformal-risk.ts: Distribution-free uncertainty quantification, prediction sets, trade-eligibility gating, position scaling
- Created leadlag-network.ts: 15-node cross-market graph (KOSPI, Nikkei, HSI, QQQ, SMH, SPY, VIX, sector ETFs, key stocks), rolling correlation, lagged cross-correlation, BFS shock propagation
- Created leadlag-features.ts: Symbol-specific features from network, leader detection, shock risk scoring
- Created leadlag-score.ts: Lightweight scoring wrapper for prediction pipeline, symbol relevance check
- Created model-promotion.ts: 6-gate promotion system (min sample, Brier, ECE, alpha, drawdown, accuracy regression), ALL gates must pass
- Created 4 API routes: /api/model-calibration, /api/conformal/[symbol], /api/leadlag/current, /api/model-promotion
- Integrated into predict route: lead-lag as parallel Phase 1 factor, conformal as post-gate risk filter, both in response
- Enhanced /api/model-metrics to include ECE and calibration diagnosis
- Fixed all TypeScript compilation errors

Stage Summary:
- 11 new files created (7 lib modules + 4 API routes)
- Predict route upgraded with 3 new layers integrated
- System upgraded from 'prediction engine with history' to 'probability engine with uncertainty control and cross-market structure'
- All new code compiles cleanly (no new tsc errors)
---
Task ID: 1-9
Agent: main
Task: Drift monitor, portfolio allocator, validation lab, override ledger

Work Log:
- Created src/lib/drift-monitor.ts with PSI calculation, feature drift detection for rawScore/confidence/decision/RSI/etc, regime weight buckets with decay
- Created /api/model-drift endpoint
- Created src/lib/portfolio-allocator.ts with sector cap 20%, ticker cap 10%, gross exposure 60%/35%, SPY correlation penalty, intra-sector correlation penalty
- Created /api/portfolio-allocation POST endpoint
- Created src/lib/validation-lab.ts with walk-forward validation, deflated Sharpe, overfitting assessment, benchmark comparison
- Created /api/validation-summary endpoint with DEPLOY/CAUTION/MODEL_NOT_ELIGIBLE
- Added ManualDecisionOverride model to Prisma schema
- Created /api/override-stats GET+POST endpoint
- Fixed Prisma schema: lowercase string -> String, removed invalid index
- Build passed, 0 new lint errors, pushed to main

Stage Summary:
- 8 files created, 1379 lines added
- 4 new API endpoints: /api/model-drift, /api/portfolio-allocation, /api/validation-summary, /api/override-stats
- 3 new lib modules: drift-monitor.ts, portfolio-allocator.ts, validation-lab.ts
- 1 new Prisma model: ManualDecisionOverride
---
Task ID: 1-8
Agent: main
Task: Full 5-factor anticipatory prediction system refactoring

Work Log:
- Removed indicator-learning.ts from all 6 production routes (hybrid-prediction, ai-predict, ai-predict-scan, learning/evaluate, learning/stats, learning/indicators)
- Rewrote hybrid-prediction.ts as v2 with async predictHybridV2(): 5-factor scoring (technical/fundamental/spillover/regime/event), horizon-specific weights, decision gates, full factor attribution, DB save
- Extended save-prediction.ts with SpilloverSignalInput type and SpilloverSignal creation in transaction
- Updated prisma/schema.prisma: SpilloverSignal gains predictionId, asiaConsensus, riskAlignment, vixDirection, sectorTrend, asiaAligned fields
- Rewrote event-risk.ts as v2: multi-event detection (FOMC/CPI/NFP/geopolitical/earnings), checkMultiEventRisk() returns all events with composite score
- Upgraded model-weights.ts: 70/30 blending (70% old + 30% new evidence), optional horizon/sector/regime filter in updateWeightsAfterEvaluation
- Updated /api/predict-scan: 5-factor scoring with regime+event, saves full factors to DB, returns regime context and top reasons
- Updated /api/ai-predict-scan: DB-backed evaluation pipeline, no more JSON state
- Updated /api/learning/* routes: all read from DB (ModelWeight, AIStats, Prediction)
- Build: 0 errors, pushed as 053555c

Stage Summary:
- indicator-learning.ts fully removed from production path (only the file remains, no imports)
- System is now DB-single-source-of-truth with 5-factor anticipatory scoring
- Horizon weights: 1D(tech55/spill20/regime10/event10/fund5), 5D(40/20/15/10/15), 20D(20/15/20/10/35)
- Weight learning uses 70/30 blending to prevent wild swings
- Event risk now detects FOMC, CPI, NFP, earnings, geopolitical, weekend gap
- All predictions saved with full factor attribution for learning loop
