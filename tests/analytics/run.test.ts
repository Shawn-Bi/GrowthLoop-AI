import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { runAnalyticsAgent } from "@/lib/agents/analytics/run";
import type { AnalyticsInput } from "@/lib/agents/analytics/prompt";
import { metrics, validOutput } from "./fixtures";

const input: AnalyticsInput = {
  experiment_id: "exp_001",
  metrics,
  drafts: [
    { content_id: "cnt_001", variant_role: "control", content_dna: { hook: "question" } },
    { content_id: "cnt_002", variant_role: "variant", content_dna: { hook: "pain point" } },
  ],
};

function message(
  text: string,
  overrides: Partial<Anthropic.Message> = {}
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  } as Anthropic.Message;
}

function mockClient(...responses: (Anthropic.Message | Error)[]) {
  const create = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) {
      create.mockRejectedValueOnce(response);
    } else {
      create.mockResolvedValueOnce(response);
    }
  }
  return {
    client: { messages: { create } } as unknown as Pick<Anthropic, "messages">,
    create,
  };
}

// Each call advances the clock by 1.5s, so latency is deterministic.
function fakeClock() {
  let time = 0;
  return () => (time += 1500);
}

describe("runAnalyticsAgent", () => {
  it("returns schema-valid output with usage and latency", async () => {
    const { client, create } = mockClient(message(JSON.stringify(validOutput())));

    const result = await runAnalyticsAgent(client, "test-model", input, fakeClock());

    expect(result).toEqual({
      ok: true,
      output: validOutput(),
      run: {
        agent: "analytics",
        model: "test-model",
        status: "completed",
        attempts: 1,
        input_tokens: 100,
        output_tokens: 50,
        latency_ms: 1500,
        stop_reason: "end_turn",
        error: null,
      },
    });

    const request = create.mock.calls[0][0];
    expect(request.model).toBe("test-model");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.messages[0].content).toContain(
      "met_test_fixture_exp_001_control_qualified_demo_rate_per_visit"
    );
    expect(request.messages[0].content).toContain('"display": "4.0%"');
    expect(request).not.toHaveProperty("thinking");
    expect(request).not.toHaveProperty("tool_choice");
  });

  it("repairs one schema failure with an append-only follow-up turn", async () => {
    const invalid = message(JSON.stringify({ summary: "Incomplete" }));
    const { client, create } = mockClient(
      invalid,
      message(JSON.stringify(validOutput()))
    );

    const result = await runAnalyticsAgent(client, "test-model", input, fakeClock());

    expect(result.ok).toBe(true);
    expect(result.run).toMatchObject({
      attempts: 2,
      input_tokens: 200,
      output_tokens: 100,
    });

    const retry = create.mock.calls[1][0];
    expect(retry.messages).toHaveLength(3);
    expect(retry.messages[1]).toEqual({
      role: "assistant",
      content: invalid.content,
    });
    expect(retry.messages[2].content).toContain("findings");
  });

  it("fails visibly after a second schema failure", async () => {
    const { client } = mockClient(message("not json"), message("still not json"));

    const result = await runAnalyticsAgent(client, "test-model", input, fakeClock());

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(
      "did not match the analytics schema after one repair attempt"
    );
    expect(result.run).toMatchObject({ status: "error", attempts: 2 });
  });

  it("fails visibly on a refusal without retrying", async () => {
    const { client, create } = mockClient(
      message("", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: null },
      } as Partial<Anthropic.Message>)
    );

    const result = await runAnalyticsAgent(client, "test-model", input, fakeClock());

    expect(result).toMatchObject({
      ok: false,
      error: "The model declined the request (category: cyber).",
      run: { status: "error", stop_reason: "refusal" },
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("fails visibly when the response is truncated", async () => {
    const { client } = mockClient(
      message('{"summary": "cut', { stop_reason: "max_tokens" })
    );

    const result = await runAnalyticsAgent(client, "test-model", input, fakeClock());

    expect(!result.ok && result.error).toBe(
      "The response stopped early (max_tokens)."
    );
  });

  it("reports API errors by class and status only", async () => {
    const apiError = new Anthropic.RateLimitError(
      429,
      { type: "error", error: { type: "rate_limit_error", message: "slow down" } },
      "slow down",
      new Headers()
    );
    const { client } = mockClient(apiError);

    const result = await runAnalyticsAgent(client, "test-model", input, fakeClock());

    expect(result).toMatchObject({
      ok: false,
      error: "Anthropic API error (RateLimitError, status 429).",
      run: { status: "error", attempts: 0 },
    });
  });

  it("rethrows programming errors", async () => {
    const { client } = mockClient(new TypeError("bug"));

    await expect(
      runAnalyticsAgent(client, "test-model", input, fakeClock())
    ).rejects.toThrow("bug");
  });
});
