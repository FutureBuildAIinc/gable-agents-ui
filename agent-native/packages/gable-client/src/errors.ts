/** Error thrown for any non-2xx gable response. */
export class GableApiError extends Error {
  readonly status: number;
  /** Machine code when gable provides one (e.g. "app_disabled"). */
  readonly code?: string;
  /** Raw parsed body when available. */
  readonly body?: unknown;

  constructor(status: number, message: string, opts?: { code?: string; body?: unknown }) {
    super(message);
    this.name = "GableApiError";
    this.status = status;
    this.code = opts?.code;
    this.body = opts?.body;
  }

  /** True when gable answered 404 {"error":"app_disabled"} for a gated capability. */
  get isAppDisabled(): boolean {
    return this.status === 404 && this.code === "app_disabled";
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Extract the best available message/code from a gable error body. */
export function parseGableErrorBody(body: unknown): { message: string; code?: string } {
  if (typeof body === "string" && body.trim()) return { message: body.trim() };
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return { message: b.error, code: b.error };
    const err = b.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === "string") {
      return { message: err.message, code: typeof err.code === "string" ? err.code : undefined };
    }
    if (typeof b.message === "string") return { message: b.message };
  }
  return { message: "gable request failed" };
}
