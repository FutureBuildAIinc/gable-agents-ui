import { describe, expect, it, vi } from "vitest";
import { createGableClient, unwrap } from "./client.js";
import { GableApiError } from "./errors.js";
import { getGableConfig, resetGableConfigForTests } from "./config.js";

const cfg = { baseUrl: "http://gable.test", integrationKey: "int-key", serviceToken: "svc-jwt" };

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => {
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return new Response(text, {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function lastCall(fetchImpl: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchImpl.mock.calls.at(-1)! as [string, RequestInit];
  return { url, init, headers: new Headers(init.headers) };
}

describe("createGableClient", () => {
  it("sends X-Integration-Key on /api/integration/* when no token is given", async () => {
    const f = mockFetch(200, []);
    const client = createGableClient(cfg);
    await client.get("/api/integration/products", { fetchImpl: f });
    const { headers } = lastCall(f as never);
    expect(headers.get("x-integration-key")).toBe("int-key");
    expect(headers.get("authorization")).toBeNull();
  });

  it("prefers a per-call user JWT over the integration key", async () => {
    const f = mockFetch(200, {});
    const client = createGableClient(cfg);
    await client.get("/api/v1/quotes", { token: "user-jwt", fetchImpl: f });
    const { headers } = lastCall(f as never);
    expect(headers.get("authorization")).toBe("Bearer user-jwt");
    expect(headers.get("x-integration-key")).toBeNull();
  });

  it("sets X-Branch-Id when branchId is passed", async () => {
    const f = mockFetch(200, {});
    const client = createGableClient(cfg);
    await client.get("/api/v1/quotes", { branchId: "b-123", fetchImpl: f });
    const { headers } = lastCall(f as never);
    expect(headers.get("x-branch-id")).toBe("b-123");
  });

  it("auto-generates an idempotency key on POST and honors an explicit one", async () => {
    const f = mockFetch(200, {});
    const client = createGableClient(cfg);
    await client.post("/api/integration/quotes", { body: { a: 1 }, fetchImpl: f });
    const auto = lastCall(f as never).headers.get("x-idempotency-key");
    expect(auto).toMatch(/^[0-9a-f-]{36}$/);

    await client.post("/api/integration/quotes", {
      body: { a: 1 },
      idempotencyKey: "fixed-key",
      fetchImpl: f,
    });
    expect(lastCall(f as never).headers.get("x-idempotency-key")).toBe("fixed-key");
  });

  it("does not send an idempotency key on GET", async () => {
    const f = mockFetch(200, {});
    const client = createGableClient(cfg);
    await client.get("/api/v1/quotes", { fetchImpl: f });
    expect(lastCall(f as never).headers.get("x-idempotency-key")).toBeNull();
  });

  it("builds query strings, dropping undefined values", async () => {
    const f = mockFetch(200, []);
    const client = createGableClient(cfg);
    await client.get("/api/integration/products", {
      query: { category: "framing", skip: undefined, limit: 50 },
      fetchImpl: f,
    });
    const { url } = lastCall(f as never);
    expect(url).toBe("http://gable.test/api/integration/products?category=framing&limit=50");
  });

  it("throws GableApiError with parsed code on error bodies", async () => {
    const f = mockFetch(404, { error: "app_disabled" });
    const client = createGableClient(cfg);
    const err = await client.get("/api/v1/millwork", { fetchImpl: f }).catch((e) => e);
    expect(err).toBeInstanceOf(GableApiError);
    expect((err as GableApiError).isAppDisabled).toBe(true);
    expect((err as GableApiError).status).toBe(404);
  });

  it("unwraps { data: [...] } list envelopes and passes bare arrays through", async () => {
    expect(unwrap<unknown[]>({ data: [1, 2] })).toEqual([1, 2]);
    expect(unwrap<unknown[]>([3])).toEqual([3]);
    expect(unwrap<Record<string, number>>({ a: 1 })).toEqual({ a: 1 });
  });
});

describe("getGableConfig", () => {
  it("parses env and caches", () => {
    resetGableConfigForTests();
    const c = getGableConfig({
      GABLE_API_BASE_URL: "http://x.test/",
      GABLE_INTEGRATION_KEY: "k",
    } as NodeJS.ProcessEnv);
    expect(c.baseUrl).toBe("http://x.test");
    expect(c.integrationKey).toBe("k");
    resetGableConfigForTests();
  });

  it("throws a helpful error when the base URL is missing", () => {
    resetGableConfigForTests();
    expect(() => getGableConfig({} as NodeJS.ProcessEnv)).toThrow(/GABLE_API_BASE_URL/);
    resetGableConfigForTests();
  });
});
