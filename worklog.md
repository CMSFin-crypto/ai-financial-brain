---
Task ID: 1
Agent: Main
Task: Add Historical Pattern Learning to 5 Pillars Momentum scanner

Work Log:
- Created `/src/lib/historical-pattern-engine.ts` — analyzes 90 days of a stock's own history to find similar momentum days (RVol≥3x, change≥5%), then measures forward returns over 1/2/3/5 days
- Updated `FivePillarsCandidate` interface with `historicalScore: number` and `historicalPattern: PatternAnalysis`
- Modified `analyzeFivePillarsCandidate()` to call historical analysis and boost momentum score with historical signal
- Updated API route sorting: within ELIGIBLE/WATCH groups, candidates now sort by historicalScore first (higher = historically more likely to continue rising)
- Added full UI section in expanded card view: Win Rate Grid (1D/2D/3D/5D), Key Metrics (History Score, Similar Cases, Avg Max Gain, Avg Drawdown, Model Confidence), Setup Type Breakdown, Historical Setups Table
- Added compact History Score badge on each card header (📈/➡️/📉 with score)
- Build verified: 0 errors in modified files, Next.js build succeeds

Stage Summary:
- New file: `src/lib/historical-pattern-engine.ts` (345 lines)
- Modified: `src/lib/five-pillars-engine.ts` (added import, interface fields, analysis call, return fields)
- Modified: `src/app/api/momentum/5-pillars/route.ts` (sorting by historicalScore)
- Modified: `src/components/financial-brain/five-pillars.tsx` (types, WinRateCard helper, compact badge, expanded section)
