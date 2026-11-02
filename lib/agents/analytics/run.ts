import {
  analyticsOutputSchema,
  type AnalyticsOutput,
} from "@/schemas/analytics";
import {
  runStructuredAgent,
  type AgentRunResult,
  type MessagesClient,
} from "../structured-run";
import {
  ANALYTICS_SYSTEM_PROMPT,
  buildAnalyticsUserMessage,
  type AnalyticsInput,
} from "./prompt";

export type AnalyticsRunResult = AgentRunResult<AnalyticsOutput>;

export function runAnalyticsAgent(
  client: MessagesClient,
  model: string,
  input: AnalyticsInput,
  now: () => number = Date.now
): Promise<AnalyticsRunResult> {
  return runStructuredAgent(
    client,
    {
      agent: "analytics",
      model,
      system: ANALYTICS_SYSTEM_PROMPT,
      userMessage: buildAnalyticsUserMessage(input),
      schema: analyticsOutputSchema,
    },
    now
  );
}
