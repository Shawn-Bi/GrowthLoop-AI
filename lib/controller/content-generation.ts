import { isDeepStrictEqual } from "node:util";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { z } from "zod";
import type { ContentAgentInput } from "@/lib/agents/content/prompt";
import type { ContentRunResult } from "@/lib/agents/content/run";
import { contentRequestSchema, type ContentAgentOutput } from "@/schemas/content";
import { handoffSchema, type Handoff } from "@/schemas/handoff";
import { mapExperimentVariable, receiveContentHandoff, traceHandoff, logContentTrace, type TraceSink } from "@/lib/content-agent/handoff";
import { resolveApprovedClaims } from "@/lib/content-agent/claim-registry";
import { bannedPhrases, grantReadyBrief, grantReadyIcp } from "@/lib/content-agent/seed";
import { buildNextCycleHandoff } from "./build-handoff";
import { chooseBaseline } from "./cycle-rules";
import { assertClaimRowsValid, assertDraftIntegrity } from "./draft-integrity";
import { proposalFromRow, recordAgentRun } from "@/lib/persistence/proposals";
import { releaseGenerationSlot, reserveGenerationSlot } from "@/lib/persistence/quota";
import { ControllerError, TransitionError } from "./errors";

type Db = Prisma.TransactionClient;

// Map the database's reviewed statuses explicitly into the Content Agent registry.
async function loadClaimRegistry(db: Pick<Db, "claim">, claimIds: string[]) {
  const rows = await db.claim.findMany({ where: { id: { in: claimIds } } });
  assertClaimRowsValid(rows);
  return rows.map((row) => ({ id: row.id, text: row.text,
    status: row.status === "verified_claim" || row.status === "approved_demo_claim" ? "approved" as const : "rejected" as const }));
}

async function loadRejectedClaimTexts(db: Pick<Db, "claim">) {
  const rows = await db.claim.findMany({ where: { status: "rejected_claim" }, select: { text: true } });
  return rows.map((row) => row.text);
}

export async function generateContentInTransaction(db: Db, experimentId: string, request?: unknown,
  trace: TraceSink = logContentTrace, generated?: ContentAgentOutput) {
  const experiment = await db.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new TransitionError("Experiment not found.", 404);
  if (experiment.status !== "open") throw new TransitionError("Experiment is closed.", 409);
  if (await db.contentDraft.count({ where: { experimentId } })) throw new TransitionError("Experiment drafts already exist.", 409);
  let handoff: Handoff;
  let brief: unknown;
  let baseline;
  if (experiment.parentExperimentId !== null) {
    if (request !== undefined) throw new ControllerError("Cycle 2 uses only persisted approved context.", 400);
    const stored = await db.handoff.findUnique({ where: { experimentId } });
    if (!stored) throw new TransitionError("Approved handoff is missing.", 409);
    // Inspect/log the raw payload before parsing so missing/rejected fields remain visible.
    const result = handoffSchema.safeParse(stored.payload);
    if (!result.success) {
      traceHandoff("content_reject", stored.payload, trace, result.error.issues.map((i) => i.path.join(".")));
      throw new ControllerError("Invalid stored handoff.", 400);
    }
    handoff = result.data;
    traceHandoff("controller_send", handoff, trace);
    const proposal = await db.analysisReport.findUnique({ where: { id: stored.proposalId } });
    if (!proposal || proposal.status !== "approved" || proposal.decidedByRole !== "experiment_approver" || !proposal.decidedAt) {
      throw new TransitionError("Human-approved proposal is required.", 409);
    }
    const sourceDrafts = await db.contentDraft.findMany({ where: { experimentId: experiment.parentExperimentId }, orderBy: { id: "asc" } });
    // Rebuild with the baseline the approver's recorded outcome picked.
    const expected = buildNextCycleHandoff({ proposal: proposalFromRow(proposal),
      baselineContentId: proposal.outcome ? chooseBaseline(proposal.outcome, sourceDrafts) : undefined,
      sourceContentIds: sourceDrafts.map((draft) => draft.id), approvedClaimIds: handoff.approved_claim_ids,
      nextExperimentId: experimentId, taskId: `task_${experimentId}`, correlationId: experiment.correlationId });
    if (!isDeepStrictEqual(handoff, expected) || proposal.experimentId !== experiment.parentExperimentId ||
        handoff.primary_test_variable !== experiment.primaryTestVariable) {
      throw new TransitionError("Handoff does not match the approved proposal and experiment.", 409);
    }
    if (!handoff.content_change || !handoff.source_content_ids.includes(handoff.content_change.baseline_content_id)) {
      throw new TransitionError("Approved change must select a source baseline.", 409);
    }
    const source = await db.contentDraft.findUnique({ where: { id: handoff.content_change.baseline_content_id } });
    if (!source || source.experimentId !== experiment.parentExperimentId || !["approved", "ready_for_manual_publication"].includes(source.status)) {
      throw new TransitionError("Baseline draft is not approved.", 409);
    }
    // A clear 409 rather than a schema exception, which would surface as a 500
    // when approval generates the next pair in the same transaction.
    baseline = assertDraftIntegrity(source, experiment.correlationId, "be the Cycle 2 baseline");
    brief = baseline.brief;
    const metrics = await db.metricRecord.findMany({ where: { experimentId: experiment.parentExperimentId, id: { in: handoff.metric_ids } } });
    if (metrics.length !== new Set(handoff.metric_ids).size || handoff.findings.some((f) => f.metric_ids.some((id) => !handoff.metric_ids.includes(id)))) {
      throw new TransitionError("Handoff evidence does not resolve to parent metrics.", 409);
    }
  } else {
    const result = contentRequestSchema.safeParse(request);
    if (!result.success) throw new ControllerError("A valid brief and approved claim IDs are required.", 400);
    brief = result.data.brief;
    const parsed = handoffSchema.safeParse({ schema_version: "1.1", task_id: `task_${experimentId}`,
      correlation_id: experiment.correlationId, idempotency_key: `content:${experimentId}`, experiment_id: experimentId,
      parent_experiment_id: null, source_content_ids: [], approved_claim_ids: result.data.approved_claim_ids,
      hypothesis: experiment.hypothesis, primary_test_variable: experiment.primaryTestVariable,
      control_conditions: ["Keep all dimensions except the selected variable constant."], metric_ids: [], findings: [],
      uncertainty: "Pre-authored simulated observations only.", approval_state: "approved", next_action: "generate_content_drafts" });
    if (!parsed.success) throw new ControllerError("Invalid initial experiment handoff.", 400);
    handoff = parsed.data;
    traceHandoff("controller_send", handoff, trace);
  }
  const registry = await loadClaimRegistry(db, handoff.approved_claim_ids);
  try { resolveApprovedClaims(handoff.approved_claim_ids, registry); }
  catch { throw new TransitionError("Handoff contains unknown or unapproved claims.", 409); }
  if (baseline && (baseline.claim_ids_used.length !== handoff.approved_claim_ids.length || baseline.claim_ids_used.some((id) => !handoff.approved_claim_ids.includes(id)))) {
    throw new TransitionError("Baseline claims must remain unchanged in the next cycle.", 409);
  }
  const drafts = receiveContentHandoff(handoff, brief, registry, baseline, trace,
    { generated, rejectedClaimTexts: await loadRejectedClaimTexts(db) });
  const saved = [];
  for (const draft of drafts) {
    saved.push(await db.contentDraft.create({ data: {
      id: `cnt_${experimentId}_${draft.role}`, experimentId, variantRole: draft.role, body: draft.body,
      contentDna: draft.dna, claimIdsUsed: handoff.approved_claim_ids, status: "pending_approval", reviewFlags: [],
    } }));
  }
  return { experiment_id: experimentId, correlation_id: experiment.correlationId,
    drafts: saved.map((draft) => ({ content_id: draft.id, variant_role: draft.variantRole, status: draft.status })) };
}

export type ContentAgentRunner = (input: ContentAgentInput) => Promise<ContentRunResult>;

// Everything the Content Agent is allowed to see. Checked before a slot is
// reserved, so a refused request costs nothing.
async function prepareContentAgentInput(db: PrismaClient,
  experiment: { id: string; hypothesis: string | null; primaryTestVariable: string | null }, request: unknown): Promise<ContentAgentInput> {
  if (await db.contentDraft.count({ where: { experimentId: experiment.id } })) throw new TransitionError("Experiment drafts already exist.", 409);
  const parsed = contentRequestSchema.safeParse(request);
  if (!parsed.success || !experiment.hypothesis) throw new ControllerError("A valid brief and approved claim IDs are required.", 400);
  const registry = await loadClaimRegistry(db, parsed.data.approved_claim_ids);
  let approvedClaims: string[];
  try { approvedClaims = resolveApprovedClaims(parsed.data.approved_claim_ids, registry); }
  catch { throw new TransitionError("Handoff contains unknown or unapproved claims.", 409); }
  return { experiment_id: experiment.id, hypothesis: experiment.hypothesis,
    primary_test_variable: mapExperimentVariable(experiment.primaryTestVariable),
    product_description: grantReadyBrief.product_description, brief: parsed.data.brief, icp: grantReadyIcp,
    approved_claims: approvedClaims, rejected_claims: await loadRejectedClaimTexts(db), banned_phrases: bannedPhrases };
}

// One Claude call outside any transaction. Takes a daily generation slot, given
// back if the call fails; a failure fails visibly and leaves no drafts.
async function runContentAgentForCycleOne(db: PrismaClient, experimentId: string, input: ContentAgentInput,
  runAgent: ContentAgentRunner, now: Date): Promise<ContentAgentOutput> {
  const slot = await reserveGenerationSlot(db, now);
  let result: ContentRunResult;
  try { result = await runAgent(input); }
  catch (error) {
    await releaseGenerationSlot(db, slot);
    throw error;
  }
  await recordAgentRun(db, result.run, experimentId);
  if (!result.ok) {
    await releaseGenerationSlot(db, slot);
    throw new ControllerError(result.error, 502);
  }
  return result.output;
}

// Cycle 1 asks the Content Agent, then saves in a short transaction that
// re-checks everything. Cycle 2 applies the approved change without a model
// call, normally inside the proposal approval itself.
export async function generateExperimentContent(db: PrismaClient, experimentId: string, request: unknown,
  runAgent: ContentAgentRunner, now: Date, trace?: TraceSink) {
  const experiment = await db.experiment.findUnique({ where: { id: experimentId } });
  if (!experiment) throw new TransitionError("Experiment not found.", 404);
  if (experiment.status !== "open") throw new TransitionError("Experiment is closed.", 409);
  const generated = experiment.parentExperimentId === null
    ? await runContentAgentForCycleOne(db, experimentId, await prepareContentAgentInput(db, experiment, request), runAgent, now)
    : undefined;
  try { return await db.$transaction((tx) => generateContentInTransaction(tx, experimentId, request, trace, generated)); }
  catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TransitionError("Experiment drafts already exist.", 409);
    if (error instanceof z.ZodError) throw new ControllerError("Invalid Content contract.", 400);
    throw error;
  }
}
