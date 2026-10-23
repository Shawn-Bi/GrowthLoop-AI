// Public liveness check: no configuration, data or secrets.
export function GET() {
  return Response.json({ status: "ok" });
}
