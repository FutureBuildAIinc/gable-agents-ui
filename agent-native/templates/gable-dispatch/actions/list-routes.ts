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

export default defineAction({
  description:
    "List delivery routes from gable's dispatch board, optionally filtered by scheduled date (YYYY-MM-DD) and/or driver UUID. Returns route status (DRAFT/SCHEDULED/IN_TRANSIT/COMPLETED/CANCELLED), vehicle, driver, and stop count.",
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
      .optional()
      .describe("Scheduled date filter, e.g. 2026-09-17"),
    driverId: z.string().uuid().optional().describe("Driver UUID filter"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<DeliveryRoute[]>("/api/v1/delivery/routes", {
      query: { date: args.date, driver_id: args.driverId },
      token: tokenFromContext(ctx),
    });
  },
});
