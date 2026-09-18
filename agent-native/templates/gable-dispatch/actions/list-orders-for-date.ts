import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface IntegrationOrderLine {
  product_id?: string;
  sku?: string;
  quantity?: number;
  weight_lbs?: number;
  [key: string]: unknown;
}

interface IntegrationOrder {
  id: string;
  status?: string;
  branch_id?: string;
  customer_name?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  scheduled_date?: string;
  lines?: IntegrationOrderLine[];
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List a day's orders from gable's integration surface — the order book a route is built from. Each order carries branch, customer, delivery address, coordinates, and lines with per-unit weights (for loading/picking and truck capacity).",
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
      .describe("Delivery date, e.g. 2026-09-17"),
    status: z.string().optional().describe("Order status filter, e.g. CONFIRMED"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args) => {
    // Integration surface: X-Integration-Key auth only — no user token, no branch header.
    return await gable.get<IntegrationOrder[]>("/api/integration/orders", {
      query: { date: args.date, status: args.status },
    });
  },
});
