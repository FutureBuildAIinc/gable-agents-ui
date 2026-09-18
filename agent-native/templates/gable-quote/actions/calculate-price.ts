import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

const item = z.object({
  productId: z.string().uuid().describe("Gable product UUID"),
  quantity: z.number().int().positive().describe("Quantity in the product's UOM"),
});

export interface PricedItem {
  product_id: string;
  product_name?: string;
  sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  uom?: string;
}

export default defineAction({
  description:
    "Price a set of quote lines using gable's pricing engine (price levels, rules, rebates). Always use this instead of guessing prices. Returns per-line unit/total in integer cents.",
  schema: withBranch({
    customerId: z.string().uuid().describe("Customer UUID (drives price level)"),
    items: z.array(item).min(1).describe("Lines to price"),
  }),
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.post<PricedItem[]>("/api/integration/quotes/bulk-price", {
      body: {
        customer_id: args.customerId,
        items: args.items.map((l) => ({ product_id: l.productId, quantity: l.quantity })),
      },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
