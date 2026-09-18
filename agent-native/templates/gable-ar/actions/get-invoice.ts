import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description: "Get a single invoice with its lines and totals by UUID.",
  schema: withBranch({
    invoiceId: z.string().uuid().describe("Invoice UUID"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get(`/api/v1/invoices/${args.invoiceId}`, {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
