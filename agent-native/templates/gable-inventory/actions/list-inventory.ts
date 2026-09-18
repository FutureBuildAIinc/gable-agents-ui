import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface InventoryRow {
  id: string;
  product_id?: string;
  location_id?: string | null;
  location?: string;
  quantity?: number;
  allocated?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List on-hand stock rows for one product across locations (quantity, allocated, updated). Gable requires product_id on this endpoint — get it from get-product or reorder-alerts.",
  schema: withBranch({
    productId: z.string().uuid().describe("Product UUID to list stock rows for"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<InventoryRow[]>("/api/v1/inventory", {
      query: { product_id: args.productId },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
