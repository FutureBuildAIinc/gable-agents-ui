import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description: "Get a single quote with its lines and totals by UUID.",
  schema: withBranch({
    quoteId: z.string().uuid().describe("Quote UUID"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get(`/api/v1/quotes/${args.quoteId}`, {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
