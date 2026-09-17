import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Accept a quote and convert it to a sales order in gable. Confirm with the user before calling — this creates a real order.",
  schema: withBranch({
    quoteId: z.string().uuid().describe("Quote UUID to accept and convert"),
  }),
  run: async (args, ctx) => {
    return await gable.post(`/api/integration/quotes/${args.quoteId}/accept-and-convert`, {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
