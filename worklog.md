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
