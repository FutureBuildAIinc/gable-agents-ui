import { randomUUID } from "node:crypto";
import { getGableConfig, type GableConfig } from "./config.js";
import { GableApiError, parseGableErrorBody } from "./errors.js";

export interface GableRequestOptions {
  /** Query params appended to the path. Undefined values are dropped. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body (POST/PUT/PATCH). */
  body?: unknown;
  /** Branch scope — sent as X-Branch-Id (gable validates membership server-side). */
  branchId?: string;
  /** Per-call user JWT (Appwrite). Takes precedence over integration key / service token. */
  token?: string;
  /** Explicit idempotency key for mutations. Auto-generated UUID when omitted. */
  idempotencyKey?: string;
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

export interface GableClient {
  request<T>(method: string, path: string, opts?: GableRequestOptions): Promise<T>;
  get<T>(path: string, opts?: GableRequestOptions): Promise<T>;
  post<T>(path: string, opts?: GableRequestOptions): Promise<T>;
  put<T>(path: string, opts?: GableRequestOptions): Promise<T>;
  patch<T>(path: string, opts?: GableRequestOptions): Promise<T>;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function buildUrl(base: string, path: string, query?: GableRequestOptions["query"]): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Gable list endpoints return either bare arrays or { data: [...] }.
 * Unwrap to the array (or return the payload unchanged when neither shape matches).
 */
export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const data = (payload as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as T;
  }
  return payload as T;
}

export function createGableClient(config?: GableConfig): GableClient {
  const cfg = config ?? getGableConfig();

  async function request<T>(method: string, path: string, opts: GableRequestOptions = {}): Promise<T> {
    const upper = method.toUpperCase();
    const headers = new Headers();
    headers.set("accept", "application/json");

    // Auth precedence: per-call user JWT > integration key > service token.
    if (opts.token) {
      headers.set("authorization", `Bearer ${opts.token}`);
    } else if (cfg.integrationKey && path.startsWith("/api/integration/")) {
      headers.set("x-integration-key", cfg.integrationKey);
    } else if (cfg.integrationKey && !cfg.serviceToken) {
      headers.set("x-integration-key", cfg.integrationKey);
    } else if (cfg.serviceToken) {
      headers.set("authorization", `Bearer ${cfg.serviceToken}`);
    }

    if (opts.branchId) headers.set("x-branch-id", opts.branchId);
    if (MUTATING.has(upper)) {
      headers.set("x-idempotency-key", opts.idempotencyKey ?? randomUUID());
    }

    let body: string | undefined;
    if (opts.body !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(opts.body);
    }

    const fetchImpl = opts.fetchImpl ?? fetch;
    const url = buildUrl(cfg.baseUrl, path, opts.query);
    const res = await fetchImpl(url, { method: upper, headers, body });

    const text = await res.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const { message, code } = parseGableErrorBody(parsed ?? text);
      throw new GableApiError(res.status, `${upper} ${path}: ${message}`, { code, body: parsed });
    }
    return unwrap<T>(parsed);
  }

  return {
    request,
    get: <T>(path: string, opts?: GableRequestOptions) => request<T>("GET", path, opts),
    post: <T>(path: string, opts?: GableRequestOptions) => request<T>("POST", path, opts),
    put: <T>(path: string, opts?: GableRequestOptions) => request<T>("PUT", path, opts),
    patch: <T>(path: string, opts?: GableRequestOptions) => request<T>("PATCH", path, opts),
  };
}
