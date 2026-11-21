import { STAFF_API_AVAILABLE, UNAVAILABLE_MESSAGE } from "@/config/backend";
import { djangoRequest } from "@/server/django-client";
import { requireStaff } from "@/server/staff-session";
export const runtime = "nodejs";
export async function GET(_request, { params }) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
  if (!STAFF_API_AVAILABLE) return new Response(UNAVAILABLE_MESSAGE, { status: 503, headers });
  await requireStaff();
  try {
    const { id } = await params;
    const result = await djangoRequest(`/staff/proofs/${encodeURIComponent(id)}`, { raw: true });
    return new Response(result.body, { headers: { ...headers, "Content-Type": result.headers.get("Content-Type") || "application/octet-stream", ...(result.headers.get("Content-Disposition") ? { "Content-Disposition": result.headers.get("Content-Disposition") } : {}) } });
  } catch (error) { return new Response(error.message, { status: error.status || 503, headers }); }
}
