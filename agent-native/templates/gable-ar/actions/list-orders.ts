import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "List orders in gable (statuses: DRAFT, CONFIRMED, ON_HOLD, FULFILLED, CANCELLED). Gable's order list endpoint has no status filter — fetch and filter client-side (e.g. status === 'ON_HOLD' for the credit-holds queue).",
  schema: withBranch({
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get("/api/v1/orders", {
      query: { limit: args.limit, offset: args.offset },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
