import type { NextRequest } from "next/server";
import type { ZodType } from "zod";
import { isAuthorizedRequest } from "@/lib/auth/access";
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

// Every API route goes through here: access is checked again next to the
// data (not only in the proxy), expected failures keep their status, and
// unexpected ones are logged by class only so no secrets reach the logs.
export async function handleRoute(
  request: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!isAuthorizedRequest(request)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return await handler();
  } catch (error) {
    if (error instanceof ControllerError) {
      return Response.json(
        { error: error.message },
        { status: error.httpStatus }
      );
    }

    const kind = error instanceof Error ? error.name : typeof error;
    console.error(
      `Unhandled ${kind} in ${request.method} ${request.nextUrl.pathname}`
    );
    return Response.json({ error: "Internal error." }, { status: 500 });
  }
}
