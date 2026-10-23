import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Demo access control (PRD fixed operating policy): one shared code,
// validated on the server. It gates access; it does not identify people.

export const SESSION_COOKIE = "growthloop_access";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

function configuredCode(): string | null {
  return process.env.DEMO_ACCESS_CODE || null;
}

// Hashing both sides first keeps the comparison constant-time regardless
// of input length.
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// The cookie value is derived from the access code, so no separate session
// secret is needed and changing the code ends every session.
function sessionToken(code: string): string {
  return createHmac("sha256", code)
    .update("growthloop-demo-session-v1")
    .digest("base64url");
}

export function isAccessConfigured(): boolean {
  return configuredCode() !== null;
}

export function checkAccessCode(candidate: string): boolean {
  const code = configuredCode();
  return code !== null && safeEqual(candidate, code);
}

// Only call after checkAccessCode succeeds.
export function issueSessionToken(): string {
  const code = configuredCode();
  if (!code) {
    throw new Error("DEMO_ACCESS_CODE is not set.");
  }
  return sessionToken(code);
}

export function isValidSessionToken(token: string | undefined): boolean {
  const code = configuredCode();
  return code !== null && token !== undefined && safeEqual(token, sessionToken(code));
}

// Browsers send the session cookie; test and E2E scripts may send
// `Authorization: Bearer <access code>` instead. Fails closed when no code
// is configured.
export function isAuthorizedRequest(request: {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];

  if (bearer !== undefined) {
    return checkAccessCode(bearer);
  }

  return isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
