import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  checkAccessCode,
  isAuthorizedRequest,
  issueSessionToken,
  isValidSessionToken,
} from "@/lib/auth/access";
import { proxy } from "@/proxy";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("DEMO_ACCESS_CODE", "correct-code");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("access code", () => {
  it("accepts only the configured code", () => {
    expect(checkAccessCode("correct-code")).toBe(true);
    expect(checkAccessCode("wrong-code")).toBe(false);
    expect(checkAccessCode("correct-code-and-more")).toBe(false);
  });

  it("fails closed when no code is configured", () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "");

    expect(checkAccessCode("")).toBe(false);
    expect(isValidSessionToken("anything")).toBe(false);
    expect(
      isAuthorizedRequest(request("/api/health", { authorization: "Bearer " }))
    ).toBe(false);
  });

  it("issues a session token that never contains the code itself", () => {
    const token = issueSessionToken();

    expect(token).not.toContain("correct-code");
    expect(isValidSessionToken(token)).toBe(true);
  });

  it("ends every session when the code changes", () => {
    const token = issueSessionToken();
    vi.stubEnv("DEMO_ACCESS_CODE", "rotated-code");

    expect(isValidSessionToken(token)).toBe(false);
  });
});

describe("isAuthorizedRequest", () => {
  it("accepts the session cookie", () => {
    const cookie = `${SESSION_COOKIE}=${issueSessionToken()}`;
    expect(isAuthorizedRequest(request("/experiments", { cookie }))).toBe(true);
  });

  it("accepts a bearer access code for scripts", () => {
    expect(
      isAuthorizedRequest(request("/api/x", { authorization: "Bearer correct-code" }))
    ).toBe(true);
  });

  it("rejects a wrong bearer even with a valid cookie", () => {
    const cookie = `${SESSION_COOKIE}=${issueSessionToken()}`;
    expect(
      isAuthorizedRequest(
        request("/api/x", { cookie, authorization: "Bearer wrong" })
      )
    ).toBe(false);
  });

  it("rejects a forged cookie", () => {
    expect(
      isAuthorizedRequest(request("/experiments", { cookie: `${SESSION_COOKIE}=forged` }))
    ).toBe(false);
  });
});

describe("proxy", () => {
  it("redirects unauthenticated pages to /access with a return path", () => {
    const response = proxy(request("/experiments/exp_001"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/access?next=%2Fexperiments%2Fexp_001"
    );
  });

  it("returns 401 JSON for unauthenticated API calls", async () => {
    const response = proxy(request("/api/experiments/exp_001"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
  });

  it("lets authorized requests through", () => {
    const response = proxy(
      request("/experiments", { authorization: "Bearer correct-code" })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
