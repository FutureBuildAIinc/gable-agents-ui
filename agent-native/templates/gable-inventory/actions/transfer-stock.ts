import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Move stock from one location to another (double-entry: gable subtracts at the source and adds at the destination in one transaction). Cross-branch moves are rejected by gable. Changes real stock — confirm with the user first and verify with list-inventory afterwards.",
  schema: withBranch({
    productId: z.string().uuid().describe("Product UUID"),
    fromLocationId: z.string().uuid().describe("Source location UUID"),
    toLocationId: z.string().uuid().describe("Destination location UUID"),
    quantity: z.number().positive().describe("Quantity to move, in the product's UOM"),
    reason: z.string().min(1).describe("Why the stock is moving, e.g. 'yard to delivery truck'"),
  }),
  run: async (args, ctx) => {
    return await gable.post("/api/v1/inventory/transfer", {
      body: {
        product_id: args.productId,
        from_location_id: args.fromLocationId,
        to_location_id: args.toLocationId,
        quantity: args.quantity,
        reason: args.reason,
      },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
