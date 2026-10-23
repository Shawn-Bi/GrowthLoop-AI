import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  analyticsOutputSchema,
  type AnalyticsOutput,
} from "@/schemas/analytics";
import {
  ANALYTICS_SYSTEM_PROMPT,
  buildAnalyticsUserMessage,
  type AnalyticsInput,
} from "./prompt";

// Token usage and latency for the AgentRun audit record (PRD §7).
export type AgentRunRecord = {
  agent: "analytics";
  model: string;
  status: "completed" | "error";
  attempts: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  stop_reason: string | null;
  error: string | null;
};

export type AnalyticsRunResult =
  | { ok: true; output: AnalyticsOutput; run: AgentRunRecord }
  | { ok: false; error: string; run: AgentRunRecord };

type MessagesClient = Pick<Anthropic, "messages">;

const MAX_ATTEMPTS = 2;

function parseOutput(
  text: string
): { ok: true; output: AnalyticsOutput } | { ok: false; issues: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: "The response was not valid JSON." };
  }

  const result = analyticsOutputSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("\n"),
    };
  }

  return { ok: true, output: result.data };
}

// Calls the Analytics Agent with structured output, allowing one schema
// repair. Refusals, truncation and API errors fail visibly instead of
// producing a report (PRD §9).
export async function runAnalyticsAgent(
  client: MessagesClient,
  model: string,
  input: AnalyticsInput,
  now: () => number = Date.now
): Promise<AnalyticsRunResult> {
  const run: AgentRunRecord = {
    agent: "analytics",
    model,
    status: "error",
    attempts: 0,
    input_tokens: 0,
    output_tokens: 0,
    latency_ms: 0,
    stop_reason: null,
    error: null,
  };
  const fail = (error: string): AnalyticsRunResult => ({
    ok: false,
    error,
    run: { ...run, error },
  });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildAnalyticsUserMessage(input) },
  ];
  const started = now();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 16000,
        system: ANALYTICS_SYSTEM_PROMPT,
        messages,
        output_config: {
          effort: "medium",
          format: zodOutputFormat(analyticsOutputSchema),
        },
      });
    } catch (error) {
      run.latency_ms = now() - started;
      if (error instanceof Anthropic.APIError) {
        // Status and class only: never echo request details or secrets.
        return fail(`Anthropic API error (${error.constructor.name}, status ${error.status ?? "none"}).`);
      }
      throw error;
    }

    run.attempts = attempt;
    run.input_tokens += response.usage.input_tokens;
    run.output_tokens += response.usage.output_tokens;
    run.latency_ms = now() - started;
    run.stop_reason = response.stop_reason;

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      return fail(`The model declined the request (category: ${category}).`);
    }

    if (response.stop_reason !== "end_turn") {
      return fail(`The response stopped early (${response.stop_reason}).`);
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = parseOutput(text);

    if (parsed.ok) {
      return {
        ok: true,
        output: parsed.output,
        run: { ...run, status: "completed" },
      };
    }

    if (attempt === MAX_ATTEMPTS) {
      return fail(
        `The response did not match the analytics schema after one repair attempt:\n${parsed.issues}`
      );
    }

    // Append-only repair turn: keep the assistant content unchanged.
    messages.push(
      { role: "assistant", content: response.content },
      {
        role: "user",
        content: `Your previous response did not match the required schema:\n${parsed.issues}\n\nReply with the complete, corrected JSON object.`,
      }
    );
  }

  return fail("No response was produced.");
}
