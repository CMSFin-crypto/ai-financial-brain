import { z } from 'zod';

// ─── /api/model-calibration query params ─────────────────────

export const calibrationQuerySchema = z.object({
  modelVersion: z.string().min(1).optional(),
  regime: z.string().min(1).optional(),
  horizonDays: z.coerce.number().int().positive().optional(),
  bins: z.coerce.number().int().min(5).max(20).optional(),
  byRegime: z.string().transform(v => v === 'true').optional(),
  byVersion: z.string().transform(v => v === 'true').optional(),
  timeseries: z.string().transform(v => v === 'true').optional(),
  train: z.string().transform(v => v === 'true').optional(),
  days: z.coerce.number().int().positive().max(365).optional(),
});

// ─── /api/conformal/[symbol] query params ─────────────────────

export const conformalQuerySchema = z.object({
  probability: z.coerce.number().min(0).max(1),
  modelVersion: z.string().min(1).optional(),
  horizonDays: z.coerce.number().int().positive().optional(),
  regime: z.string().min(1).optional(),
  alpha: z.coerce.number().gt(0).lt(1).default(0.1),
  maxBand: z.coerce.number().min(0).max(0.5).default(0.30),
  profile: z.string().transform(v => v === 'true').optional(),
});

// ─── /api/model-metrics query params ──────────────────────────

export const modelMetricsQuerySchema = z.object({
  modelVersion: z.string().min(1).optional(),
  horizonDays: z.coerce.number().int().positive().optional(),
  regime: z.string().min(1).optional(),
  history: z.string().transform(v => v === 'true').optional(),
  days: z.coerce.number().int().positive().max(365).default(90),
});

// ─── Infer types ────────────────────────────────────────────────

export type CalibrationQuery = z.infer<typeof calibrationQuerySchema>;
export type ConformalQuery = z.infer<typeof conformalQuerySchema>;
export type ModelMetricsQuery = z.infer<typeof modelMetricsQuerySchema>;
