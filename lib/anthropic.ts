import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ControllerError } from "@/lib/controller/errors";

let client: Anthropic | undefined;

// Shared server-only client. Reads ANTHROPIC_API_KEY from the environment;
// the SDK retries 408/409/429/5xx and connection errors twice by default.
export function getAnthropicClient(): Anthropic {
  client ??= new Anthropic({ timeout: 90_000 });
  return client;
}

// The model must be verified for this account in the S1 smoke test, so it is
// configured, never hardcoded (PRD §8).
export function getAnthropicModel(): string {
  const model = process.env.ANTHROPIC_MODEL;

  if (!model) {
    throw new ControllerError("Anthropic is not configured (ANTHROPIC_MODEL).", 503);
  }

  return model;
}
