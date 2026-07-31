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
