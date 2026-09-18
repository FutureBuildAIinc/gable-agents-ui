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
 * Gable has no single "board" endpoint — the daily board is the date's routes
 * plus each route's stops. This composes them server-side (same pattern as
 * get-route) so the dispatch board screen has one query to poll/invalidate:
 * { date, routes: [{ route, deliveries }] }.
 */
export default defineAction({
  description:
    "The daily dispatch board from gable: every delivery route for a date with its stops (deliveries) inline — { date, routes: [{ route, deliveries }] }. Route statuses DRAFT/SCHEDULED/IN_TRANSIT/COMPLETED/CANCELLED; stop statuses PENDING/OUT_FOR_DELIVERY/DELIVERED/FAILED/PARTIAL with sequence, order, customer, address, and ETA.",
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
      .describe("Scheduled date, e.g. 2026-09-17"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    const routes = await gable.get<DeliveryRoute[]>("/api/v1/delivery/routes", {
      query: { date: args.date },
      token: tokenFromContext(ctx),
    });
    const withStops = await Promise.all(
      routes.map(async (route) => ({
        route,
        deliveries: await gable.get<DeliveryStop[]>(
          `/api/v1/delivery/routes/${route.id}/deliveries`,
          { token: tokenFromContext(ctx) },
        ),
      })),
    );
    return { date: args.date, routes: withStops };
  },
});
