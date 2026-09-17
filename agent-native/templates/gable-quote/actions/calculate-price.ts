import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

const line = z.object({
  productId: z.string().uuid().describe("Gable product UUID"),
  quantity: z.number().positive().describe("Quantity in the product's UOM"),
});

export default defineAction({
  description:
    "Price a set of quote lines using gable's pricing engine (price levels, rules, rebates). Always use this instead of guessing prices.",
  schema: withBranch({
    customerId: z.string().uuid().describe("Customer UUID (drives price level)"),
    lines: z.array(line).min(1).describe("Lines to price"),
  }),
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.post("/api/integration/quotes/bulk-price", {
      body: { customer_id: args.customerId, lines: args.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity })) },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
