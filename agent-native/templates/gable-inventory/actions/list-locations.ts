import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";

import { gable } from "../server/lib/gable.js";

interface IntegrationLocation {
  id: string;
  name?: string;
  address?: string;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List the dealer's active branch locations (yards). Use to resolve a human's location name ('north yard') to the UUID that list-inventory / adjust-stock / transfer-stock need.",
  schema: withBranch({}),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<IntegrationLocation[]>("/api/integration/locations", {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
