import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

const line = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitPrice: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("Override price in integer cents; omit to use gable pricing"),
});

export default defineAction({
  description:
    "Create a draft quote in gable for a customer with priced lines. Price lines with calculate-price first — unit prices are integer cents.",
  schema: withBranch({
    customerId: z.string().uuid().describe("Customer UUID"),
    lines: z.array(line).min(1),
  }),
  run: async (args, ctx) => {
    return await gable.post("/api/integration/quotes", {
      body: {
        customer_id: args.customerId,
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
