import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface Customer {
  id: string;
  name: string;
  account_number?: string;
  tier?: string;
  credit_limit?: number;
  balance_due?: number;
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List customers for quoting. Returns ids, names, account numbers, and credit state.",
  schema: withBranch({
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<Customer[]>("/api/v1/customers", {
      query: { limit: args.limit, offset: args.offset },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
