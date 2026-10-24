import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { bearerCode, hasValidSession } from "@/lib/auth/access";
import { verifyAccessCode } from "@/lib/auth/verify";
import { getDb } from "@/lib/db";
import { TooManyAttemptsError } from "@/lib/persistence/access-attempts";
import { ControllerError } from "./errors";

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ControllerError("Request body must be JSON.", 400);
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new ControllerError(`Invalid request. ${issues}`, 400);
  }

  return result.data;
}

// Expected failures keep their status (429 adds Retry-After); unexpected
// ones are logged by class only so no secrets reach the logs.
export function errorResponse(error: unknown, request: NextRequest): Response {
  if (error instanceof ControllerError) {
    const headers =
      error instanceof TooManyAttemptsError
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined;
    return Response.json(
      { error: error.message },
      { status: error.httpStatus, headers }
    );
  }

  const kind = error instanceof Error ? error.name : typeof error;
  console.error(
    `Unhandled ${kind} in ${request.method} ${request.nextUrl.pathname}`
  );
  return Response.json({ error: "Internal error." }, { status: 500 });
}

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const code = bearerCode(request.headers);

  if (code === undefined) {
    return hasValidSession(request);
  }
  return verifyAccessCode(getDb(), code, request.headers, new Date());
}

// Every API route goes through here, so access is checked again next to the
// data rather than only in the proxy.
export async function handleRoute(
  request: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  try {
    if (!(await isAuthorized(request))) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }
    return await handler();
  } catch (error) {
    return errorResponse(error, request);
  }
}
