import { defineAction } from "@agent-native/core/action";
import { tokenFromContext } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface CompleteRouteResponse {
  status?: string;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "Complete a delivery route after every stop is terminal (DELIVERED, FAILED, or PARTIAL). Gable rejects completion while any stop is still PENDING or OUT_FOR_DELIVERY. Confirm with the user before calling.",
  schema: z.object({
    routeId: z.string().uuid().describe("Delivery route UUID to complete"),
  }),
  run: async (args, ctx) => {
    return await gable.post<CompleteRouteResponse>(
      `/api/v1/delivery/routes/${args.routeId}/complete`,
      { token: tokenFromContext(ctx) },
    );
  },
});
