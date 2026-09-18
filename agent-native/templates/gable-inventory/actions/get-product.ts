import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Get one product/PIM record by UUID: SKU, description, primary UOM, base price, dimensions, reorder point/quantity, and aggregated stock totals.",
  schema: withBranch({
    productId: z.string().uuid().describe("Product UUID"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get(`/api/v1/products/${args.productId}`, {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
