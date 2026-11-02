import { findContentIssues } from "@/lib/content-agent/content-checks";
import { contentAgentOutputSchema, type ContentAgentOutput } from "@/schemas/content";
import {
  runStructuredAgent,
  type AgentRunResult,
  type MessagesClient,
} from "../structured-run";
import {
  CONTENT_SYSTEM_PROMPT,
  buildContentUserMessage,
  type ContentAgentInput,
} from "./prompt";

export type ContentRunResult = AgentRunResult<ContentAgentOutput>;

// Rules the schema can't express. Anything found here earns the model its one
// repair turn before the run fails visibly.
export function checkContentOutput(output: ContentAgentOutput, input: ContentAgentInput): string | null {
  const variable = input.primary_test_variable;
  const issues: string[] = [];

  if (output.variant_value.trim() === output.control[variable].trim()) {
    issues.push(`variant_value must differ from the control's ${variable}.`);
  }

  const claimFields = variable === "evidence"
    ? { "control.evidence": output.control.evidence, variant_value: output.variant_value }
    : { "control.evidence": output.control.evidence };
  for (const [field, text] of Object.entries(claimFields)) {
    for (const claim of input.approved_claims) {
      if (!text.includes(claim)) issues.push(`${field} must repeat this approved claim exactly: ${claim}`);
    }
  }

  const fields = { ...output.control, variant_value: output.variant_value };
  for (const [field, text] of Object.entries(fields)) {
    for (const issue of findContentIssues(text, input.rejected_claims)) {
      issues.push(`${field} contains a ${issue}.`);
    }
  }

  return issues.length > 0 ? issues.join("\n") : null;
}

export function runContentAgent(
  client: MessagesClient,
  model: string,
  input: ContentAgentInput,
  now: () => number = Date.now
): Promise<ContentRunResult> {
  return runStructuredAgent(
    client,
    {
      agent: "content",
      model,
      system: CONTENT_SYSTEM_PROMPT,
      userMessage: buildContentUserMessage(input),
      schema: contentAgentOutputSchema,
      check: (output) => checkContentOutput(output, input),
    },
    now
  );
}
