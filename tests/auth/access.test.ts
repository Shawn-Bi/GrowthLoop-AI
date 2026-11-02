import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_COOKIE,
  bearerCode,
  checkAccessCode,
  clientAddress,
  hasValidSession,
  issueSessionToken,
  isValidSessionToken,
} from "@/lib/auth/access";
import { proxy } from "@/proxy";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

function sessionCookie() {
  return `${SESSION_COOKIE}=${issueSessionToken()}`;
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

describe("request helpers", () => {
  it("accepts the session cookie and rejects a forged one", () => {
    expect(hasValidSession(request("/", { cookie: sessionCookie() }))).toBe(true);
    expect(hasValidSession(request("/", { cookie: `${SESSION_COOKIE}=forged` }))).toBe(false);
  });

  it("reads a bearer code", () => {
    expect(bearerCode(new Headers({ authorization: "Bearer abc" }))).toBe("abc");
    expect(bearerCode(new Headers({ authorization: "Basic abc" }))).toBeUndefined();
    expect(bearerCode(new Headers())).toBeUndefined();
  });

  it("uses the first forwarded address, then x-real-ip, then a fallback", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(new Headers())).toBe("unknown");
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

  it("lets pages with a valid session through", () => {
    const response = proxy(request("/experiments", { cookie: sessionCookie() }));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves bearer codes on API calls to the rate-limited route handler", () => {
    const response = proxy(request("/api/experiments/exp_001", { authorization: "Bearer guess" }));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("doesn't accept a bearer code for pages", () => {
    const response = proxy(request("/experiments", { authorization: "Bearer correct-code" }));

    expect(response.status).toBe(307);
  });
});
