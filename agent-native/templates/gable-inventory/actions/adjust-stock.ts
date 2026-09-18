import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Adjust on-hand stock for a product at a location (cycle count or receipt/shrinkage delta). Changes real stock in gable — confirm with the user first, and re-fetch with list-inventory to verify.",
  schema: withBranch({
    productId: z.string().uuid().describe("Product UUID"),
    locationId: z.string().uuid().describe("Location UUID the stock sits at"),
    quantity: z
      .number()
      .describe(
        "In the product's UOM. When isDelta is false (default) this is the new absolute on-hand count; when true it is a signed delta (+receipt / -shrinkage).",
      ),
    reason: z.string().min(1).describe("Why the stock changed, e.g. 'cycle count 2026-09-17'"),
    isDelta: z
      .boolean()
      .default(false)
      .describe("false = set absolute quantity (cycle count); true = apply signed delta"),
  }),
  run: async (args, ctx) => {
    return await gable.post("/api/v1/inventory/adjust", {
      body: {
        product_id: args.productId,
        location_id: args.locationId,
        quantity: args.quantity,
        reason: args.reason,
        is_delta: args.isDelta,
      },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
