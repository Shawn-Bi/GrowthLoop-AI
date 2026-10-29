-- CreateEnum
CREATE TYPE "ProposalOutcome" AS ENUM ('control_better', 'variant_better', 'inconclusive');

-- AlterTable
ALTER TABLE "AnalysisReport" ADD COLUMN "outcome" "ProposalOutcome";

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN "outcome" "ProposalOutcome";
