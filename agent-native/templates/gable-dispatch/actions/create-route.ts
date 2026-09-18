import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface CreateRouteResponse {
  route_id?: string;
  stop_count?: number;
  created?: boolean;
  replaced?: boolean;
  [key: string]: unknown;
}

const stop = z.object({
  orderId: z.string().uuid().describe("Order UUID for this stop"),
  sequence: z.number().int().min(1).describe("Stop position on the route, 1-based"),
  lat: z.number().optional().describe("Stop latitude, when known"),
  lng: z.number().optional().describe("Stop longitude, when known"),
});

export default defineAction({
  description:
    "Create a delivery route (with its stops) on gable's dispatch board via the integration surface. Requires vehicle UUID, scheduled date, and at least one ordered stop. Idempotent per (vehicle, date): a not-yet-dispatched route for the same vehicle+date is replaced. Confirm the stop order with the user before calling.",
  schema: z.object({
    vehicleId: z.string().uuid().describe("Vehicle UUID"),
    driverId: z.string().uuid().optional().describe("Driver UUID (optional — unassigned truck)"),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
      .describe("Route date, e.g. 2026-09-17"),
    notes: z.string().optional().describe("Route notes for the driver/yard"),
    stops: z.array(stop).min(1).describe("Ordered stops — one per order"),
    loadManifest: z.unknown().optional().describe("Opaque packing manifest persisted verbatim"),
  }),
  run: async (args) => {
    // Integration surface: X-Integration-Key auth only — no user token, no branch header.
    return await gable.post<CreateRouteResponse>("/api/integration/delivery-routes", {
      body: {
        vehicle_id: args.vehicleId,
        driver_id: args.driverId ?? "",
        scheduled_date: args.scheduledDate,
        notes: args.notes ?? "",
        stops: args.stops.map((s) => ({
          order_id: s.orderId,
          sequence: s.sequence,
          lat: s.lat,
          lng: s.lng,
        })),
        load_manifest: args.loadManifest,
      },
    });
  },
});
