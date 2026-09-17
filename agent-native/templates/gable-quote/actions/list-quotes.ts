import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description: "List quotes in gable (newest first), optionally filtered by status.",
  schema: withBranch({
    status: z
      .enum(["draft", "sent", "accepted", "expired", "converted"])
      .optional()
      .describe("Quote status filter"),
    limit: z.number().int().min(1).max(200).default(25),
    offset: z.number().int().min(0).default(0),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get("/api/v1/quotes", {
      query: { status: args.status, limit: args.limit, offset: args.offset },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
