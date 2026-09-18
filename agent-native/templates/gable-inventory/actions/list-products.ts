import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface IntegrationProduct {
  id: string;
  sku?: string;
  name?: string;
  category?: string;
  uom?: string;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "Search gable's product catalog by name or SKU. Returns id, sku, name, category, UOM. Use this to resolve a human's search text ('2x10x16 SPF') to product UUIDs before calling list-inventory or get-product.",
  schema: withBranch({
    q: z.string().optional().describe("Free-text search (name or SKU substring)"),
    category: z.string().optional().describe("Category filter"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<IntegrationProduct[]>("/api/integration/products", {
      query: { q: args.q, category: args.category, limit: args.limit },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
