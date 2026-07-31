// ============================================================
// Model Card — release governance for model versions.
//
// Every model version that goes live should have a "model card"
// documenting what it does, how it was validated, and what its
// known limitations are. This creates an audit trail for
// "why did performance change?" questions.
// ============================================================

import prisma from './prisma';

// ─── Types ────────────────────────────────────────────────────

export type ModelCardInput = {
  modelVersion: string;
  releaseType: 'MAJOR' | 'MINOR' | 'HOTFIX' | 'ROLLBACK';
  description: string;
  features?: string[];
  trainingWindowFrom?: Date;
  trainingWindowTo?: Date;
  validationSummary?: Record<string, unknown>;
  driftStatus?: string;
  robustnessScore?: number;
  walkForwardConsistency?: number;
  overfittingSeverity?: string;
  sampleSize?: number;
  knownLimitations?: string[];
  breakingChanges?: boolean;
  approvedBy?: string;
};

export type ModelCard = {
  id: string;
  modelVersion: string;
  releaseType: string;
  description: string;
  features: string[] | null;
  trainingWindowFrom: Date | null;
  trainingWindowTo: Date | null;
  validationSummary: unknown;
  driftStatus: string | null;
  robustnessScore: number | null;
  walkForwardConsistency: number | null;
  overfittingSeverity: string | null;
  sampleSize: number;
  knownLimitations: string[] | null;
  breakingChanges: boolean;
  approvalStatus: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  deployedAt: Date | null;
  rolledBackAt: Date | null;
  rollbackReason: string | null;
  createdAt: Date;
};

// ─── Core ──────────────────────────────────────────────────────

/**
 * Create a new model release record (PENDING status).
 */
export async function createModelRelease(input: ModelCardInput): Promise<ModelCard> {
  return prisma.modelRelease.create({
    data: {
      modelVersion: input.modelVersion,
      releaseType: input.releaseType,
      description: input.description,
      features: input.features || null,
      trainingWindowFrom: input.trainingWindowFrom || null,
      trainingWindowTo: input.trainingWindowTo || null,
      validationSummary: input.validationSummary || null,
      driftStatus: input.driftStatus || null,
      robustnessScore: input.robustnessScore ?? null,
      walkForwardConsistency: input.walkForwardConsistency ?? null,
      overfittingSeverity: input.overfittingSeverity || null,
      sampleSize: input.sampleSize || 0,
      knownLimitations: input.knownLimitations || null,
      breakingChanges: input.breakingChanges ?? false,
      approvedBy: input.approvedBy || null,
    },
  }) as unknown as ModelCard;
}

/**
 * Approve a model release (requires manual approval).
 */
export async function approveModelRelease(
  releaseId: string,
  approvedBy: string,
): Promise<ModelCard | null> {
  return prisma.modelRelease.update({
    where: { id: releaseId },
    data: {
      approvalStatus: 'APPROVED',
      approvedBy,
      approvedAt: new Date(),
    },
  }) as unknown as ModelCard;
}

/**
 * Mark a release as deployed.
 */
export async function deployModelRelease(releaseId: string): Promise<ModelCard | null> {
  return prisma.modelRelease.update({
    where: { id: releaseId },
    data: { approvalStatus: 'DEPLOYED', deployedAt: new Date() },
  }) as unknown as ModelCard;
}

/**
 * Roll back a release.
 */
export async function rollbackModelRelease(
  releaseId: string,
  reason: string,
): Promise<ModelCard | null> {
  return prisma.modelRelease.update({
    where: { id: releaseId },
    data: {
      approvalStatus: 'ROLLED_BACK',
      rolledBackAt: new Date(),
      rollbackReason: reason,
    },
  }) as unknown as ModelCard;
}

/**
 * Get the current active (most recently deployed) model release.
 */
export async function getActiveModelRelease(): Promise<ModelCard | null> {
  const release = await prisma.modelRelease.findFirst({
    where: { approvalStatus: 'DEPLOYED' },
    orderBy: { deployedAt: 'desc' },
  });
  return release as unknown as ModelCard | null;
}

/**
 * Get all releases for a model version, newest first.
 */
export async function getModelReleaseHistory(
  modelVersion: string,
  limit = 20,
): Promise<ModelCard[]> {
  const releases = await prisma.modelRelease.findMany({
    where: { modelVersion },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return releases as unknown as ModelCard[];
}
