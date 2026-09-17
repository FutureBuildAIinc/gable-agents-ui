import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

const line = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative().optional().describe("Override price; omit to use gable pricing"),
});

export default defineAction({
  description:
    "Create a draft quote in gable for a customer with priced lines. Price lines with calculate-price first.",
  schema: withBranch({
    customerId: z.string().uuid().describe("Customer UUID"),
    jobId: z.string().uuid().optional().describe("Customer job UUID, when quoting to a job"),
    lines: z.array(line).min(1),
    notes: z.string().optional(),
  }),
  run: async (args, ctx) => {
    return await gable.post("/api/integration/quotes", {
      body: {
        customer_id: args.customerId,
        job_id: args.jobId,
        notes: args.notes,
        lines: args.lines.map((l) => ({
          product_id: l.productId,
          quantity: l.quantity,
          unit_price: l.unitPrice,
        })),
      },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
