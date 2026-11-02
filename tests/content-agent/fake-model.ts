import type { ContentAgentInput } from "@/lib/agents/content/prompt";
import type { ContentAgentOutput } from "@/schemas/content";

// A valid Content Agent answer for the given claims and test variable.
export function fakeContentOutput(
  input: Pick<ContentAgentInput, "primary_test_variable" | "approved_claims">
): ContentAgentOutput {
  const control = {
    hook: "Did a grant deadline slip past your team?",
    pain_point: "Small teams track deadlines in too many places.",
    value_proposition: "Keep grant work in one place.",
    evidence: input.approved_claims.join("\n"),
    cta: "Which deadline is hardest to track?",
  };
  const variant_value = input.primary_test_variable === "evidence"
    ? `Approved information:\n${control.evidence}`
    : `Variant ${input.primary_test_variable} text.`;
  return { control, variant_value };
}

export function modelResponse(output: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

// Stands in for the Anthropic transport on Content Agent calls: answers from
// the JSON in the user turn, as the real model does.
export async function fakeContentModel(params: { messages: { content: unknown }[] }) {
  const message = String(params.messages[0].content);
  const input = JSON.parse(message.slice(message.indexOf("\n\n") + 2)) as ContentAgentInput;
  return modelResponse(fakeContentOutput(input));
}
