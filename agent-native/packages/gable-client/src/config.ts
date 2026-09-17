import { z } from "zod";

/**
 * Server-side env config for the gable client. Read once per process.
 *
 * - GABLE_API_BASE_URL  e.g. http://localhost:8080 or https://gable.futurebuild.ai (required)
 * - GABLE_INTEGRATION_KEY  X-Integration-Key for /api/integration/* (preferred for agent/background calls)
 * - GABLE_SERVICE_TOKEN  fallback JWT for /api/v1/* when no per-call user token is available
 */
const envSchema = z.object({
  GABLE_API_BASE_URL: z.string().url(),
  GABLE_INTEGRATION_KEY: z.string().min(1).optional(),
  GABLE_SERVICE_TOKEN: z.string().min(1).optional(),
});

export interface GableConfig {
  baseUrl: string;
  integrationKey?: string;
  serviceToken?: string;
}

let cached: GableConfig | null = null;

export function getGableConfig(env: NodeJS.ProcessEnv = process.env): GableConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `@gable/client: invalid env — ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}. Set GABLE_API_BASE_URL (and GABLE_INTEGRATION_KEY or GABLE_SERVICE_TOKEN).`,
    );
  }
  cached = {
    baseUrl: parsed.data.GABLE_API_BASE_URL.replace(/\/+$/, ""),
    integrationKey: parsed.data.GABLE_INTEGRATION_KEY,
    serviceToken: parsed.data.GABLE_SERVICE_TOKEN,
  };
  return cached;
}

/** Test hook: reset the cached config. */
export function resetGableConfigForTests(): void {
  cached = null;
}
