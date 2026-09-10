// AUTO-GENERATED from prisma/postgres-init.sql — do not edit by hand.
// Full PostgreSQL schema (38 tables) executed by /api/db-setup.
// Regenerate with: python3 /home/z/my-project/scripts/gen_db_setup_sql.py

export const POSTGRES_INIT_SQL = `-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ScannerStrategy" AS ENUM ('IBKR_PULLBACK', 'CATALYST_MOMENTUM');

-- CreateEnum
CREATE TYPE "ScannerDecision" AS ENUM ('READY', 'WATCHLIST', 'NEW_CANDIDATE', 'CONFIRMED_MOMENTUM', 'MOMENTUM_PULLBACK_READY', 'RANK_UP', 'RANK_DOWN', 'FADE_RISK', 'EXTENDED_RISK', 'NO_TRADE', 'EXITED_LIST');

-- CreateEnum
CREATE TYPE "RankingChangeAction" AS ENUM ('ENTERED_LIST', 'EXITED_LIST', 'RANK_UP', 'RANK_DOWN', 'SCORE_UP', 'SCORE_DOWN', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "SignalOutcomeType" AS ENUM ('CONTINUATION', 'PULLBACK_SUCCESS', 'FADE', 'STOPPED_OUT', 'NO_EDGE', 'PENDING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT 'default',
    "ticker" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT 'default',
    "ticker" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "portfolioId" TEXT,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT 'default',
    "ticker" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertAbove" DOUBLE PRECISION,
    "alertBelow" DOUBLE PRECISION,
    "alertActive" BOOLEAN NOT NULL DEFAULT true,
    "alertedAt" TIMESTAMP(3),

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sector" TEXT,
    "horizonDays" INTEGER NOT NULL DEFAULT 1,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "benchmarkSymbol" TEXT DEFAULT 'SPY',
    "benchmarkEntryPrice" DOUBLE PRECISION,
    "actualPrice" DOUBLE PRECISION,
    "benchmarkActualPrice" DOUBLE PRECISION,
    "regime" TEXT,
    "regimeConfidence" DOUBLE PRECISION,
    "transitionRisk" DOUBLE PRECISION,
    "rawScore" DOUBLE PRECISION NOT NULL,
    "calibratedConfidence" DOUBLE PRECISION NOT NULL,
    "finalDecision" TEXT NOT NULL,
    "actualReturn" DOUBLE PRECISION,
    "benchmarkReturn" DOUBLE PRECISION,
    "excessReturn" DOUBLE PRECISION,
    "actualOutcome" INTEGER,
    "wasCorrect" BOOLEAN,
    "evaluationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionFactor" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "factorName" TEXT NOT NULL,
    "factorType" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "signal" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionSnapshot" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "price" DOUBLE PRECISION,
    "benchmarkPrice" DOUBLE PRECISION,
    "regime" TEXT,
    "regimeConfidence" DOUBLE PRECISION,
    "transitionRisk" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "PredictionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelWeight" (
    "id" TEXT NOT NULL,
    "factorName" TEXT NOT NULL,
    "factorType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "streakCorrect" INTEGER NOT NULL DEFAULT 0,
    "streakWrong" INTEGER NOT NULL DEFAULT 0,
    "minSample" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "regimeConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spyPrice" DOUBLE PRECISION,
    "spyChange5d" DOUBLE PRECISION,
    "spyChange20d" DOUBLE PRECISION,
    "vixLevel" DOUBLE PRECISION,
    "marketBreadth" DOUBLE PRECISION,
    "sectorAvg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSnapshot" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3),
    "daysUntil" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'LOW',
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalMarketSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'INDEX',
    "region" TEXT NOT NULL,
    "sector" TEXT,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return1d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return2d" DOUBLE PRECISION,
    "return5d" DOUBLE PRECISION,
    "atr14" DOUBLE PRECISION,
    "sma20" DOUBLE PRECISION,
    "sma50" DOUBLE PRECISION,
    "sma200" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalMarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpilloverSignal" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "targetSymbol" TEXT NOT NULL,
    "targetSector" TEXT,
    "setupType" TEXT NOT NULL,
    "spilloverScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'spillover-v1',
    "reasons" JSONB NOT NULL,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictionId" TEXT,
    "asiaConsensus" DOUBLE PRECISION,
    "riskAlignment" DOUBLE PRECISION,
    "vixDirection" TEXT,
    "sectorTrend" TEXT,
    "asiaAligned" BOOLEAN,

    CONSTRAINT "SpilloverSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpilloverModelResult" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "targetSymbol" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "probabilityUp" DOUBLE PRECISION NOT NULL,
    "probabilityDown" DOUBLE PRECISION NOT NULL,
    "predictedClass" TEXT NOT NULL,
    "actualClass" TEXT,
    "actualReturn" DOUBLE PRECISION,
    "wasCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpilloverModelResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegimeSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "regimeState" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "transitionRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spyReturn1d" DOUBLE PRECISION,
    "spyReturn5d" DOUBLE PRECISION,
    "spyReturn20d" DOUBLE PRECISION,
    "spyVsSma200" DOUBLE PRECISION,
    "vixLevel" DOUBLE PRECISION,
    "vixReturn1d" DOUBLE PRECISION,
    "atrZScore" DOUBLE PRECISION,
    "breadthPct" DOUBLE PRECISION,
    "adxLevel" DOUBLE PRECISION,
    "spilloverScore" DOUBLE PRECISION,
    "spilloverSetup" TEXT,
    "eventRiskScore" DOUBLE PRECISION,
    "policy" JSONB,
    "drivers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegimeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelMetricSnapshot" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "avgReturn" DOUBLE PRECISION,
    "benchmarkReturn" DOUBLE PRECISION,
    "alpha" DOUBLE PRECISION,
    "winRate" DOUBLE PRECISION,
    "brierScore" DOUBLE PRECISION,
    "precisionBuy" DOUBLE PRECISION,
    "recallBuy" DOUBLE PRECISION,
    "noTradeRate" DOUBLE PRECISION,
    "maxDrawdown" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AILesson" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "ticker" TEXT,
    "sector" TEXT,
    "mistake" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "timesApplied" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AILesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPick" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sector" TEXT,
    "scanDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "intendedPrice" DOUBLE PRECISION,
    "submittedPrice" DOUBLE PRECISION,
    "filledPrice" DOUBLE PRECISION,
    "spreadAtDecision" DOUBLE PRECISION,
    "spreadAtFill" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "ackAt" TIMESTAMP(3),
    "filledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "rejectReason" TEXT,
    "latencyMs" INTEGER,
    "slippageBps" DOUBLE PRECISION,
    "partialFillPct" DOUBLE PRECISION,
    "stopAttached" BOOLEAN NOT NULL DEFAULT false,
    "venue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStats" (
    "id" TEXT NOT NULL,
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "avgAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestSector" TEXT,
    "worstSector" TEXT,
    "streakCorrect" INTEGER NOT NULL DEFAULT 0,
    "streakWrong" INTEGER NOT NULL DEFAULT 0,
    "lessonsLearned" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accuracy1d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracy5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accuracy20d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidenceBuckets" JSONB,

    CONSTRAINT "AIStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualDecisionOverride" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT,
    "symbol" TEXT NOT NULL,
    "originalDecision" TEXT NOT NULL,
    "overrideDecision" TEXT NOT NULL,
    "overrideReason" TEXT NOT NULL,
    "notes" TEXT,
    "modelScore" DOUBLE PRECISION,
    "modelConfidence" DOUBLE PRECISION,
    "regime" TEXT,
    "outcome" TEXT,
    "actualReturn" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualDecisionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelTrainingRun" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trainingWindowFrom" TIMESTAMP(3),
    "trainingWindowTo" TIMESTAMP(3),
    "validationWindowFrom" TIMESTAMP(3),
    "validationWindowTo" TIMESTAMP(3),
    "testWindowFrom" TIMESTAMP(3),
    "testWindowTo" TIMESTAMP(3),
    "hyperParams" JSONB,
    "featureList" JSONB,
    "targetHorizonDays" INTEGER NOT NULL DEFAULT 1,
    "targetDefinition" TEXT NOT NULL DEFAULT 'trade_success_1d',
    "trainSamples" INTEGER NOT NULL DEFAULT 0,
    "valSamples" INTEGER NOT NULL DEFAULT 0,
    "testSamples" INTEGER NOT NULL DEFAULT 0,
    "trainAccuracy" DOUBLE PRECISION,
    "valAccuracy" DOUBLE PRECISION,
    "testAccuracy" DOUBLE PRECISION,
    "trainBrier" DOUBLE PRECISION,
    "valBrier" DOUBLE PRECISION,
    "testBrier" DOUBLE PRECISION,
    "valAuc" DOUBLE PRECISION,
    "testAuc" DOUBLE PRECISION,
    "calibrationEce" DOUBLE PRECISION,
    "overfittingRatio" DOUBLE PRECISION,
    "modelArtifact" TEXT,
    "calibrationState" JSONB,
    "wfFoldCount" INTEGER NOT NULL DEFAULT 0,
    "wfAvgAccuracy" DOUBLE PRECISION,
    "wfStdAccuracy" DOUBLE PRECISION,
    "wfAvgBrier" DOUBLE PRECISION,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelTrainingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelPrediction" (
    "id" TEXT NOT NULL,
    "trainingRunId" TEXT,
    "modelVersion" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sector" TEXT,
    "regime" TEXT,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizonDays" INTEGER NOT NULL DEFAULT 1,
    "features" JSONB NOT NULL,
    "featureVersion" TEXT NOT NULL,
    "rawWinProbability" DOUBLE PRECISION NOT NULL,
    "rawLossProbability" DOUBLE PRECISION NOT NULL,
    "calibratedWinProb" DOUBLE PRECISION NOT NULL,
    "confidenceCalibrated" DOUBLE PRECISION NOT NULL,
    "expectedEdge" DOUBLE PRECISION,
    "recommendedAction" TEXT NOT NULL DEFAULT 'SKIP',
    "actionReason" TEXT,
    "actualReturn" DOUBLE PRECISION,
    "wasCorrect" BOOLEAN,
    "evaluationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureSnapshot" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "schemaHash" TEXT NOT NULL,
    "featureCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriftSnapshot" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "accuracy1d" DOUBLE PRECISION,
    "accuracy5d" DOUBLE PRECISION,
    "accuracy20d" DOUBLE PRECISION,
    "sample1d" INTEGER NOT NULL DEFAULT 0,
    "sample5d" INTEGER NOT NULL DEFAULT 0,
    "sample20d" INTEGER NOT NULL DEFAULT 0,
    "brierScore" DOUBLE PRECISION,
    "ece" DOUBLE PRECISION,
    "noTradeRate" DOUBLE PRECISION,
    "regimeAccuracies" JSONB,
    "sectorAccuracies" JSONB,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerSnapshot" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategy" "ScannerStrategy" NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rank" INTEGER,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION,
    "decision" "ScannerDecision" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "priorClose" DOUBLE PRECISION,
    "dayChangePct" DOUBLE PRECISION,
    "premarketGapPct" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "averageVolume20D" DOUBLE PRECISION,
    "relativeVolume" DOUBLE PRECISION,
    "avgDollarVolume20D" DOUBLE PRECISION,
    "spreadPct" DOUBLE PRECISION,
    "liquidityScore" DOUBLE PRECISION,
    "vwap" DOUBLE PRECISION,
    "aboveVwap" BOOLEAN,
    "vwapDistancePct" DOUBLE PRECISION,
    "ema20" DOUBLE PRECISION,
    "sma50" DOUBLE PRECISION,
    "sma200" DOUBLE PRECISION,
    "atr14" DOUBLE PRECISION,
    "rsi14" DOUBLE PRECISION,
    "adx14" DOUBLE PRECISION,
    "trendScore" DOUBLE PRECISION,
    "pullbackScore" DOUBLE PRECISION,
    "catalystScore" DOUBLE PRECISION,
    "volumeScore" DOUBLE PRECISION,
    "sectorScore" DOUBLE PRECISION,
    "marketRegimeScore" DOUBLE PRECISION,
    "liquidityMapScore" DOUBLE PRECISION,
    "fadeRiskScore" DOUBLE PRECISION,
    "closingStrength" DOUBLE PRECISION,
    "marketRegime" TEXT,
    "sector" TEXT,
    "sectorStrength" DOUBLE PRECISION,
    "poc" DOUBLE PRECISION,
    "nearestBelowHvn" DOUBLE PRECISION,
    "nearestAboveHvn" DOUBLE PRECISION,
    "bidWallPrice" DOUBLE PRECISION,
    "askWallPrice" DOUBLE PRECISION,
    "newsCatalyst" TEXT,
    "catalystPublishedAt" TIMESTAMP(3),
    "secEvent" TEXT,
    "reasons" JSONB,
    "riskFlags" JSONB,
    "scoreBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingChange" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategy" "ScannerStrategy" NOT NULL,
    "fromSnapshotId" TEXT,
    "toSnapshotId" TEXT NOT NULL,
    "oldRank" INTEGER,
    "newRank" INTEGER,
    "oldScore" DOUBLE PRECISION,
    "newScore" DOUBLE PRECISION NOT NULL,
    "scoreChange" DOUBLE PRECISION,
    "oldDecision" "ScannerDecision",
    "newDecision" "ScannerDecision" NOT NULL,
    "action" "RankingChangeAction" NOT NULL,
    "reasons" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalOutcome" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategy" "ScannerStrategy" NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "priceAfter1Hour" DOUBLE PRECISION,
    "closePrice" DOUBLE PRECISION,
    "nextDayOpenPrice" DOUBLE PRECISION,
    "nextDayHighPrice" DOUBLE PRECISION,
    "nextDayClosePrice" DOUBLE PRECISION,
    "threeDayClosePrice" DOUBLE PRECISION,
    "return1HourPct" DOUBLE PRECISION,
    "returnToClosePct" DOUBLE PRECISION,
    "nextDayOpenReturnPct" DOUBLE PRECISION,
    "nextDayHighReturnPct" DOUBLE PRECISION,
    "nextDayCloseReturnPct" DOUBLE PRECISION,
    "threeDayReturnPct" DOUBLE PRECISION,
    "maxFavorableExcursionPct" DOUBLE PRECISION,
    "maxAdverseExcursionPct" DOUBLE PRECISION,
    "hitTarget5Pct" BOOLEAN,
    "hitTarget10Pct" BOOLEAN,
    "heldVwapToClose" BOOLEAN,
    "heldDayOneLow" BOOLEAN,
    "outcome" "SignalOutcomeType" NOT NULL DEFAULT 'PENDING',
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdaptiveFactorStat" (
    "id" TEXT NOT NULL,
    "strategy" "ScannerStrategy" NOT NULL,
    "factor" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "hitRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageReturnPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageDrawdownPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectancy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proposedWeight" DOUBLE PRECISION,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdaptiveFactorStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRelease" (
    "id" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "releaseType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "features" JSONB,
    "trainingWindowFrom" TIMESTAMP(3),
    "trainingWindowTo" TIMESTAMP(3),
    "validationSummary" JSONB,
    "driftStatus" TEXT,
    "robustnessScore" DOUBLE PRECISION,
    "walkForwardConsistency" DOUBLE PRECISION,
    "overfittingSeverity" TEXT,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "knownLimitations" JSONB,
    "breakingChanges" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "rolledBackAt" TIMESTAMP(3),
    "rollbackReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricalNewsEvent" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "publishedAtUtc" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT 'other',
    "sentimentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sentimentLabel" TEXT NOT NULL DEFAULT 'neutral',
    "noveltyScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "macroVsMicro" TEXT NOT NULL DEFAULT 'micro',
    "sector" TEXT NOT NULL DEFAULT '',
    "marketRegime" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "vixLevel" DOUBLE PRECISION,
    "benchmarkSymbol" TEXT NOT NULL DEFAULT 'SPY',
    "return1d" DOUBLE PRECISION DEFAULT 0,
    "return3d" DOUBLE PRECISION DEFAULT 0,
    "return7d" DOUBLE PRECISION DEFAULT 0,
    "abnormalReturn1d" DOUBLE PRECISION DEFAULT 0,
    "abnormalReturn3d" DOUBLE PRECISION DEFAULT 0,
    "abnormalReturn7d" DOUBLE PRECISION DEFAULT 0,
    "maxUpsideWindow" DOUBLE PRECISION DEFAULT 0,
    "maxDrawdownWindow" DOUBLE PRECISION DEFAULT 0,
    "sectorReturnSameWindow" DOUBLE PRECISION DEFAULT 0,
    "impactHit1d" BOOLEAN DEFAULT false,
    "horizonClass" TEXT DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalNewsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketRegimeDaily" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "spyTrendState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "qqqTrendState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "vixLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spyReturn1d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "spyReturn5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sectorStrengthRank" JSONB,
    "riskMode" TEXT NOT NULL DEFAULT 'NEUTRAL',
    "dxyState" TEXT,
    "oilState" TEXT,
    "ratesDirection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketRegimeDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanSnapshot" (
    "id" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "slot" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'IBKR_PULLBACK',
    "regime" TEXT NOT NULL,
    "spyTrend" TEXT NOT NULL,
    "tickerCount" INTEGER NOT NULL,

    CONSTRAINT "ScanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotItem" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rsSpy" DOUBLE PRECISION NOT NULL,
    "rsSector" DOUBLE PRECISION NOT NULL,
    "distEma20" DOUBLE PRECISION NOT NULL,
    "atrPct" DOUBLE PRECISION NOT NULL,
    "volVs20d" DOUBLE PRECISION NOT NULL,
    "spreadBps" DOUBLE PRECISION NOT NULL,
    "persistenceD" INTEGER NOT NULL DEFAULT 0,
    "eventRisk" TEXT NOT NULL,
    "gated" BOOLEAN NOT NULL DEFAULT false,
    "gateReason" TEXT,
    "poc" DOUBLE PRECISION,
    "vah" DOUBLE PRECISION,
    "val" DOUBLE PRECISION,
    "hvnBelow" DOUBLE PRECISION,
    "hvnAbove" DOUBLE PRECISION,
    "vpLocation" TEXT,
    "vpScore" DOUBLE PRECISION,
    "supportBelow" BOOLEAN NOT NULL DEFAULT false,
    "resistanceAbove" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SnapshotItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniverseEvent" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,

    CONSTRAINT "UniverseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeLabel" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "firstStatus" TEXT NOT NULL,
    "ret1h" DOUBLE PRECISION,
    "retClose" DOUBLE PRECISION,
    "ret1d" DOUBLE PRECISION,
    "ret3d" DOUBLE PRECISION,
    "label" TEXT NOT NULL,
    "outlier" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScannerFactorWeight" (
    "id" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannerFactorWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Top10JournalEntry" (
    "id" TEXT NOT NULL,
    "scanDate" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'IBKR_PULLBACK',
    "ticker" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "status" TEXT,
    "price" DOUBLE PRECISION,
    "entry" DOUBLE PRECISION,
    "stop" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "vixLevel" DOUBLE PRECISION,
    "vixStatus" TEXT,
    "breadthPct" DOUBLE PRECISION,
    "breadthStatus" TEXT,
    "regimeLevel" TEXT,
    "rvol" DOUBLE PRECISION,
    "rvolStatus" TEXT,
    "dist52wHighPct" DOUBLE PRECISION,
    "atrPct" DOUBLE PRECISION,
    "atrStatus" TEXT,
    "sector" TEXT,
    "enterReason" TEXT,
    "changeReason" TEXT,
    "exitedAt" TIMESTAMP(3),
    "entryHit" BOOLEAN,
    "entryHitAt" TIMESTAMP(3),
    "targetHit" BOOLEAN,
    "stopHit" BOOLEAN,
    "mfeR" DOUBLE PRECISION,
    "maeR" DOUBLE PRECISION,
    "resultR" DOUBLE PRECISION,
    "exitStatus" TEXT,
    "evalNote" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Top10JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_sessionId_ticker_key" ON "WatchlistItem"("sessionId", "ticker");

-- CreateIndex
CREATE INDEX "Prediction_symbol_predictedAt_idx" ON "Prediction"("symbol", "predictedAt");

-- CreateIndex
CREATE INDEX "Prediction_symbol_dueAt_idx" ON "Prediction"("symbol", "dueAt");

-- CreateIndex
CREATE INDEX "Prediction_evaluationStatus_dueAt_idx" ON "Prediction"("evaluationStatus", "dueAt");

-- CreateIndex
CREATE INDEX "Prediction_modelVersion_predictedAt_idx" ON "Prediction"("modelVersion", "predictedAt");

-- CreateIndex
CREATE INDEX "Prediction_regime_predictedAt_idx" ON "Prediction"("regime", "predictedAt");

-- CreateIndex
CREATE INDEX "PredictionFactor_predictionId_idx" ON "PredictionFactor"("predictionId");

-- CreateIndex
CREATE INDEX "PredictionFactor_factorName_createdAt_idx" ON "PredictionFactor"("factorName", "createdAt");

-- CreateIndex
CREATE INDEX "PredictionSnapshot_predictionId_timestamp_idx" ON "PredictionSnapshot"("predictionId", "timestamp");

-- CreateIndex
CREATE INDEX "PredictionSnapshot_snapshotType_timestamp_idx" ON "PredictionSnapshot"("snapshotType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ModelWeight_factorName_key" ON "ModelWeight"("factorName");

-- CreateIndex
CREATE UNIQUE INDEX "MarketSnapshot_predictionId_key" ON "MarketSnapshot"("predictionId");

-- CreateIndex
CREATE INDEX "EventSnapshot_ticker_eventType_idx" ON "EventSnapshot"("ticker", "eventType");

-- CreateIndex
CREATE INDEX "EventSnapshot_eventDate_idx" ON "EventSnapshot"("eventDate");

-- CreateIndex
CREATE INDEX "GlobalMarketSnapshot_symbol_date_idx" ON "GlobalMarketSnapshot"("symbol", "date");

-- CreateIndex
CREATE INDEX "GlobalMarketSnapshot_region_date_idx" ON "GlobalMarketSnapshot"("region", "date");

-- CreateIndex
CREATE INDEX "GlobalMarketSnapshot_sector_date_idx" ON "GlobalMarketSnapshot"("sector", "date");

-- CreateIndex
CREATE INDEX "GlobalMarketSnapshot_date_idx" ON "GlobalMarketSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SpilloverSignal_predictionId_key" ON "SpilloverSignal"("predictionId");

-- CreateIndex
CREATE INDEX "SpilloverSignal_targetSymbol_date_idx" ON "SpilloverSignal"("targetSymbol", "date");

-- CreateIndex
CREATE INDEX "SpilloverSignal_setupType_date_idx" ON "SpilloverSignal"("setupType", "date");

-- CreateIndex
CREATE INDEX "SpilloverSignal_modelVersion_date_idx" ON "SpilloverSignal"("modelVersion", "date");

-- CreateIndex
CREATE INDEX "SpilloverSignal_date_idx" ON "SpilloverSignal"("date");

-- CreateIndex
CREATE INDEX "SpilloverSignal_predictionId_idx" ON "SpilloverSignal"("predictionId");

-- CreateIndex
CREATE INDEX "SpilloverModelResult_targetSymbol_date_idx" ON "SpilloverModelResult"("targetSymbol", "date");

-- CreateIndex
CREATE INDEX "SpilloverModelResult_modelVersion_date_idx" ON "SpilloverModelResult"("modelVersion", "date");

-- CreateIndex
CREATE INDEX "SpilloverModelResult_date_idx" ON "SpilloverModelResult"("date");

-- CreateIndex
CREATE INDEX "RegimeSnapshot_regimeState_date_idx" ON "RegimeSnapshot"("regimeState", "date");

-- CreateIndex
CREATE INDEX "RegimeSnapshot_date_idx" ON "RegimeSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RegimeSnapshot_date_key" ON "RegimeSnapshot"("date");

-- CreateIndex
CREATE INDEX "ModelMetricSnapshot_modelVersion_createdAt_idx" ON "ModelMetricSnapshot"("modelVersion", "createdAt");

-- CreateIndex
CREATE INDEX "ModelMetricSnapshot_horizonDays_createdAt_idx" ON "ModelMetricSnapshot"("horizonDays", "createdAt");

-- CreateIndex
CREATE INDEX "DailyPick_symbol_scanDate_idx" ON "DailyPick"("symbol", "scanDate");

-- CreateIndex
CREATE INDEX "DailyPick_bucket_scanDate_idx" ON "DailyPick"("bucket", "scanDate");

-- CreateIndex
CREATE INDEX "DailyPick_scanDate_idx" ON "DailyPick"("scanDate");

-- CreateIndex
CREATE INDEX "ExecutionEvent_symbol_createdAt_idx" ON "ExecutionEvent"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionEvent_status_createdAt_idx" ON "ExecutionEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionEvent_predictionId_idx" ON "ExecutionEvent"("predictionId");

-- CreateIndex
CREATE INDEX "ManualDecisionOverride_symbol_createdAt_idx" ON "ManualDecisionOverride"("symbol", "createdAt");

-- CreateIndex
CREATE INDEX "ManualDecisionOverride_predictionId_idx" ON "ManualDecisionOverride"("predictionId");

-- CreateIndex
CREATE INDEX "ModelTrainingRun_modelVersion_createdAt_idx" ON "ModelTrainingRun"("modelVersion", "createdAt");

-- CreateIndex
CREATE INDEX "ModelTrainingRun_status_idx" ON "ModelTrainingRun"("status");

-- CreateIndex
CREATE INDEX "ModelPrediction_symbol_predictedAt_idx" ON "ModelPrediction"("symbol", "predictedAt");

-- CreateIndex
CREATE INDEX "ModelPrediction_modelVersion_predictedAt_idx" ON "ModelPrediction"("modelVersion", "predictedAt");

-- CreateIndex
CREATE INDEX "ModelPrediction_evaluationStatus_idx" ON "ModelPrediction"("evaluationStatus");

-- CreateIndex
CREATE INDEX "FeatureSnapshot_version_idx" ON "FeatureSnapshot"("version");

-- CreateIndex
CREATE INDEX "FeatureSnapshot_symbol_date_idx" ON "FeatureSnapshot"("symbol", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureSnapshot_version_symbol_date_key" ON "FeatureSnapshot"("version", "symbol", "date");

-- CreateIndex
CREATE INDEX "DriftSnapshot_date_idx" ON "DriftSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DriftSnapshot_date_key" ON "DriftSnapshot"("date");

-- CreateIndex
CREATE INDEX "ScannerSnapshot_ticker_strategy_snapshotAt_idx" ON "ScannerSnapshot"("ticker", "strategy", "snapshotAt");

-- CreateIndex
CREATE INDEX "ScannerSnapshot_strategy_snapshotAt_idx" ON "ScannerSnapshot"("strategy", "snapshotAt");

-- CreateIndex
CREATE INDEX "ScannerSnapshot_decision_snapshotAt_idx" ON "ScannerSnapshot"("decision", "snapshotAt");

-- CreateIndex
CREATE INDEX "RankingChange_ticker_strategy_createdAt_idx" ON "RankingChange"("ticker", "strategy", "createdAt");

-- CreateIndex
CREATE INDEX "RankingChange_action_createdAt_idx" ON "RankingChange"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SignalOutcome_ticker_strategy_createdAt_idx" ON "SignalOutcome"("ticker", "strategy", "createdAt");

-- CreateIndex
CREATE INDEX "SignalOutcome_outcome_evaluatedAt_idx" ON "SignalOutcome"("outcome", "evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignalOutcome_snapshotId_key" ON "SignalOutcome"("snapshotId");

-- CreateIndex
CREATE INDEX "AdaptiveFactorStat_strategy_factor_idx" ON "AdaptiveFactorStat"("strategy", "factor");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptiveFactorStat_strategy_factor_bucket_periodStart_perio_key" ON "AdaptiveFactorStat"("strategy", "factor", "bucket", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ModelRelease_modelVersion_createdAt_idx" ON "ModelRelease"("modelVersion", "createdAt");

-- CreateIndex
CREATE INDEX "ModelRelease_approvalStatus_idx" ON "ModelRelease"("approvalStatus");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_ticker_publishedAtUtc_idx" ON "HistoricalNewsEvent"("ticker", "publishedAtUtc");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_eventType_publishedAtUtc_idx" ON "HistoricalNewsEvent"("eventType", "publishedAtUtc");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_ticker_eventType_idx" ON "HistoricalNewsEvent"("ticker", "eventType");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_sentimentLabel_eventType_idx" ON "HistoricalNewsEvent"("sentimentLabel", "eventType");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_publishedAtUtc_idx" ON "HistoricalNewsEvent"("publishedAtUtc");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_marketRegime_publishedAtUtc_idx" ON "HistoricalNewsEvent"("marketRegime", "publishedAtUtc");

-- CreateIndex
CREATE INDEX "HistoricalNewsEvent_impactHit1d_idx" ON "HistoricalNewsEvent"("impactHit1d");

-- CreateIndex
CREATE UNIQUE INDEX "MarketRegimeDaily_date_key" ON "MarketRegimeDaily"("date");

-- CreateIndex
CREATE INDEX "MarketRegimeDaily_date_idx" ON "MarketRegimeDaily"("date");

-- CreateIndex
CREATE INDEX "ScanSnapshot_sessionDate_slot_idx" ON "ScanSnapshot"("sessionDate", "slot");

-- CreateIndex
CREATE INDEX "ScanSnapshot_scannedAt_idx" ON "ScanSnapshot"("scannedAt");

-- CreateIndex
CREATE INDEX "SnapshotItem_symbol_snapshotId_idx" ON "SnapshotItem"("symbol", "snapshotId");

-- CreateIndex
CREATE INDEX "SnapshotItem_status_idx" ON "SnapshotItem"("status");

-- CreateIndex
CREATE INDEX "UniverseEvent_symbol_snapshotId_idx" ON "UniverseEvent"("symbol", "snapshotId");

-- CreateIndex
CREATE INDEX "UniverseEvent_reasonCode_idx" ON "UniverseEvent"("reasonCode");

-- CreateIndex
CREATE INDEX "OutcomeLabel_label_sessionDate_idx" ON "OutcomeLabel"("label", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "OutcomeLabel_symbol_sessionDate_firstStatus_key" ON "OutcomeLabel"("symbol", "sessionDate", "firstStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ScannerFactorWeight_factor_key" ON "ScannerFactorWeight"("factor");

-- CreateIndex
CREATE INDEX "Top10JournalEntry_ticker_scanDate_idx" ON "Top10JournalEntry"("ticker", "scanDate");

-- CreateIndex
CREATE INDEX "Top10JournalEntry_scanDate_active_idx" ON "Top10JournalEntry"("scanDate", "active");

-- CreateIndex
CREATE INDEX "Top10JournalEntry_exitStatus_idx" ON "Top10JournalEntry"("exitStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Top10JournalEntry_scanDate_ticker_strategy_key" ON "Top10JournalEntry"("scanDate", "ticker", "strategy");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionFactor" ADD CONSTRAINT "PredictionFactor_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionSnapshot" ADD CONSTRAINT "PredictionSnapshot_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSnapshot" ADD CONSTRAINT "MarketSnapshot_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpilloverSignal" ADD CONSTRAINT "SpilloverSignal_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelPrediction" ADD CONSTRAINT "ModelPrediction_trainingRunId_fkey" FOREIGN KEY ("trainingRunId") REFERENCES "ModelTrainingRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingChange" ADD CONSTRAINT "RankingChange_fromSnapshotId_fkey" FOREIGN KEY ("fromSnapshotId") REFERENCES "ScannerSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RankingChange" ADD CONSTRAINT "RankingChange_toSnapshotId_fkey" FOREIGN KEY ("toSnapshotId") REFERENCES "ScannerSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalOutcome" ADD CONSTRAINT "SignalOutcome_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ScannerSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotItem" ADD CONSTRAINT "SnapshotItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ScanSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniverseEvent" ADD CONSTRAINT "UniverseEvent_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ScanSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

`;
