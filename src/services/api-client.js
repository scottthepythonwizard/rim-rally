export class ApiError extends Error {
  constructor(code, message, { fieldErrors = {}, retryable = false, requestId } = {}) {
    super(message); this.name = "ApiError"; this.code = code; this.fieldErrors = fieldErrors; this.retryable = retryable; this.requestId = requestId;
  }
}

export function normalizeError(body, status = 0) {
  const source = body && typeof body === "object" ? body.error || body : {};
  const messages = { 409: "Availability changed. Please refresh and choose again.", 422: "Please check your selection and try again.", 429: "Too many requests. Wait a moment and try again." };
  return new ApiError(typeof source.code === "string" ? source.code : `HTTP_${status || "NETWORK"}`, messages[status] || "We couldn’t load the schedule. Please try again.", {
    fieldErrors: source.fieldErrors && typeof source.fieldErrors === "object" ? source.fieldErrors : {},
    retryable: status === 0 || status === 429 || status >= 500,
    requestId: typeof source.requestId === "string" ? source.requestId : undefined,
  });
}

export async function requestJson(path, { signal, method = "GET", body, headers = {} } = {}) {
  const timeout = new AbortController();
  const abort = () => timeout.abort();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; timeout.abort(); }, 15000);
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!base) throw new ApiError("CONFIGURATION", "The schedule service is not configured.");
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: timeout.signal, cache: "no-store", headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers } });
    if (response.ok && response.status === 204 && method === "DELETE") return { released: true };
    const responseBody = await response.json().catch(() => null);
    if (!response.ok) throw normalizeError(responseBody, response.status);
    return responseBody;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (timedOut) throw new ApiError("TIMEOUT", "The schedule is taking too long. Please try again.", { retryable: true });
    if (error instanceof ApiError) throw error;
    throw normalizeError(null);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

export function getJson(path, options) { return requestJson(path, options); }
