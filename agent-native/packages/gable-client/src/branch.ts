import { z, type ZodTypeAny, type z as zns } from "zod";

/**
 * Adds the branchId field used by gable's branch-scoped endpoints.
 * Gable validates membership server-side (user_locations) for non-admins.
 */
export function withBranch<T extends Record<string, ZodTypeAny>>(shape: T) {
  return z.object({
    ...shape,
    branchId: z
      .string()
      .uuid()
      .optional()
      .describe("Branch UUID — sent as X-Branch-Id. Required for branch-scoped gable endpoints."),
  });
}

/** Extract a user JWT from an action run context, when the caller came over HTTP/MCP. */
export function tokenFromContext(ctx: unknown): string | undefined {
  const headers = (ctx as { requestHeaders?: Headers } | undefined)?.requestHeaders;
  const auth = headers?.get?.("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return undefined;
}

export type { zns as z };
