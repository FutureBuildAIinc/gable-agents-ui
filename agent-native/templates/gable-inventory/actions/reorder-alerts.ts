import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";

import { gable } from "../server/lib/gable.js";

interface ReorderAlert {
  product_id: string;
  sku?: string;
  description?: string;
  vendor?: string | null;
  reorder_point?: number;
  reorder_qty?: number;
  current_stock?: number;
  deficit?: number;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List products whose total stock has fallen below their reorder point, with suggested reorder quantity and deficit. Read-only — use it to triage what to replenish.",
  schema: withBranch({}),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<ReorderAlert[]>("/api/v1/products/reorder-alerts", {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
