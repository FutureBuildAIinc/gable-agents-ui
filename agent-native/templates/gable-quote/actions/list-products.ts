import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface Product {
  id: string;
  sku?: string;
  name: string;
  category?: string;
  uom?: string;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List/search gable products, optionally filtered by category. Returns SKUs, names, and UOM for quoting.",
  schema: withBranch({
    category: z.string().optional().describe("Product category filter, e.g. 'framing'"),
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<Product[]>("/api/integration/products", {
      query: { category: args.category, limit: args.limit, offset: args.offset },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
