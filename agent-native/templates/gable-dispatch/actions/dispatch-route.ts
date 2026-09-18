import { defineAction } from "@agent-native/core/action";
import { tokenFromContext } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Dispatch a delivery route — sends the truck out and moves the route to IN_TRANSIT. Only DRAFT or SCHEDULED routes can be dispatched. Confirm with the user before calling; this puts a real truck on the road.",
  schema: z.object({
    routeId: z.string().uuid().describe("Delivery route UUID to dispatch"),
  }),
  run: async (args, ctx) => {
    await gable.post(`/api/v1/delivery/routes/${args.routeId}/dispatch`, {
      token: tokenFromContext(ctx),
    });
    return { routeId: args.routeId, status: "IN_TRANSIT", dispatched: true };
  },
});
