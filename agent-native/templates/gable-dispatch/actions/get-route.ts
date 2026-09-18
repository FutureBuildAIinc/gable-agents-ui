import { defineAction } from "@agent-native/core/action";
import { tokenFromContext } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface DeliveryRoute {
  id: string;
  vehicle_id?: string;
  driver_id?: string;
  scheduled_date?: string;
  status?: string;
  notes?: string;
  vehicle_name?: string;
  driver_name?: string;
  stop_count?: number;
  [key: string]: unknown;
}

interface DeliveryStop {
  id: string;
  route_id?: string | null;
  order_id?: string;
  stop_sequence?: number;
  status?: string;
  customer_name?: string;
  order_number?: string;
  address?: string;
  delivery_instructions?: string;
  estimated_arrival?: string;
  pod_signed_by?: string;
  [key: string]: unknown;
}

/**
 * Gable has no GET /api/v1/delivery/routes/{id} (only the list and the
 * per-route deliveries endpoints), so the route is resolved from the list
 * and combined with its stops: { route, deliveries }.
 */
export default defineAction({
  description:
    "Get one delivery route and its stops (deliveries) by route UUID. Returns { route, deliveries } — stop sequence, order, customer, address, status (PENDING/OUT_FOR_DELIVERY/DELIVERED/FAILED/PARTIAL), and ETA per stop.",
  schema: z.object({
    routeId: z.string().uuid().describe("Delivery route UUID"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    const routes = await gable.get<DeliveryRoute[]>("/api/v1/delivery/routes", {
      token: tokenFromContext(ctx),
    });
    const route = routes.find((r) => r.id === args.routeId);
    if (!route) {
      throw new Error(`Route ${args.routeId} not found on the dispatch board.`);
    }
    const deliveries = await gable.get<DeliveryStop[]>(
      `/api/v1/delivery/routes/${args.routeId}/deliveries`,
      { token: tokenFromContext(ctx) },
    );
    return { route, deliveries };
  },
});
