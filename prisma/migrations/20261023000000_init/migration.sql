-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VariantRole" AS ENUM ('control', 'variant');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('approved_demo_claim', 'verified_claim', 'rejected_claim');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('draft', 'needs_review', 'pending_approval', 'approved', 'rejected', 'ready_for_manual_publication');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('needs_human_approval', 'approved', 'rejected', 'error');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('started', 'completed', 'error');

-- CreateEnum
CREATE TYPE "ReviewerRole" AS ENUM ('content_reviewer', 'experiment_approver');

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "registryVersion" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL,
    "sourceOrEvidence" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "demoOnly" BOOLEAN NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "parentExperimentId" TEXT,
    "hypothesis" TEXT,
    "primaryTestVariable" TEXT,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDraft" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "variantRole" "VariantRole" NOT NULL,
    "body" TEXT NOT NULL,
    "contentDna" JSONB NOT NULL,
    "claimIdsUsed" TEXT[],
    "status" "DraftStatus" NOT NULL DEFAULT 'draft',
    "reviewFlags" TEXT[],
    "decidedByRole" "ReviewerRole",
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricRecord" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "variantRole" "VariantRole" NOT NULL,
    "metric" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "record" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisReport" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "status" "ProposalStatus" NOT NULL,
    "errors" TEXT[],
    "reviewFlags" TEXT[],
    "decidedByRole" "ReviewerRole",
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "experimentId" TEXT,
    "model" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL,
    "attempts" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "stopReason" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Handoff" (
    "idempotencyKey" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "parentExperimentId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Handoff_pkey" PRIMARY KEY ("idempotencyKey")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reviewerRole" "ReviewerRole" NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_generation_quota" (
    "day" TEXT NOT NULL,
    "successful_calls" INTEGER NOT NULL,

    CONSTRAINT "daily_generation_quota_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_parentExperimentId_key" ON "Experiment"("parentExperimentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDraft_experimentId_variantRole_key" ON "ContentDraft"("experimentId", "variantRole");

-- CreateIndex
CREATE INDEX "MetricRecord_experimentId_idx" ON "MetricRecord"("experimentId");

-- CreateIndex
CREATE INDEX "AnalysisReport_experimentId_idx" ON "AnalysisReport"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_experimentId_key" ON "Handoff"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Handoff_proposalId_key" ON "Handoff"("proposalId");

-- CreateIndex
CREATE INDEX "AuditEvent_recordId_idx" ON "AuditEvent"("recordId");

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_parentExperimentId_fkey" FOREIGN KEY ("parentExperimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDraft" ADD CONSTRAINT "ContentDraft_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricRecord" ADD CONSTRAINT "MetricRecord_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Handoff" ADD CONSTRAINT "Handoff_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AnalysisReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

