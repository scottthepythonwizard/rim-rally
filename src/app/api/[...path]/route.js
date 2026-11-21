import { STAFF_API_AVAILABLE, UNAVAILABLE_MESSAGE } from "@/config/backend";
import { backendBase } from "@/server/django-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Guest-only proxy. Staff sessions stay in protected server actions.
function unavailable() {
  return Response.json({ error: { code: "TEMPORARILY_UNAVAILABLE", message: UNAVAILABLE_MESSAGE } }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}
async function forward(request, { params }) {
  if (!STAFF_API_AVAILABLE) return unavailable();
  const { path } = await params;
  const route = path.map(encodeURIComponent).join("/");
  const allowed = /^(availability|open-play|holds(?:\/[^/]+)?|payment-attempts(?:\/by-key\/[^/]+|\/[^/]+(?:\/(?:proof|qr))?)?|bookings\/[^/]+(?:\/cancellations)?)$/.test(route);
  if (!allowed) return Response.json({ error: { code: "NOT_FOUND", message: "Endpoint not found." } }, { status: 404 });
  if (Number(request.headers.get("content-length") || 0) > 6 * 1024 * 1024) return Response.json({ error: { code: "FILE_TOO_LARGE", message: "Choose a PNG or JPEG up to 5 MB." } }, { status: 413 });
  try {
    const headers = new Headers({ Accept: "application/json" });
    for (const name of ["Content-Type", "X-Guest-Recovery", "Idempotency-Key"]) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    if (body?.byteLength > 6 * 1024 * 1024) return Response.json({ error: { code: "FILE_TOO_LARGE", message: "Choose a PNG or JPEG up to 5 MB." } }, { status: 413 });
    const result = await fetch(`${backendBase()}/${route}${new URL(request.url).search}`, { method: request.method, headers, body, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000) });
    return new Response(result.body, { status: result.status, headers: { "Content-Type": result.headers.get("Content-Type") || "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch {
    return Response.json({ error: { code: "BACKEND_UNAVAILABLE", message: "The booking service is unavailable. Keep your booking identifier and try again." } }, { status: 503 });
  }
}
export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
