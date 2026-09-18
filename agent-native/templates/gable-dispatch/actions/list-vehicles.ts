import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface IntegrationVehicle {
  id: string;
  name: string;
  vehicle_type?: string;
  license_plate?: string;
  capacity_weight_lbs?: number | null;
  make?: string;
  model?: string;
  year?: number;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List the fleet's vehicles from gable's integration surface — id, name, type, and capacity_weight_lbs when recorded (null means the rating was never recorded; treat capacity as unknown, never guessed). Use a vehicle's UUID when creating a route or assigning one on the dispatch board.",
  schema: z.object({}),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async () => {
    // Integration surface: X-Integration-Key auth only — no user token, no branch header.
    return await gable.get<IntegrationVehicle[]>("/api/integration/vehicles");
  },
});
