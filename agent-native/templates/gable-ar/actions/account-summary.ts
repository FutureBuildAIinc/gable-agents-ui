import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface AccountSummary {
  customer_id: string;
  balance_due: number;
  credit_limit: number;
  available_credit: number;
}

export default defineAction({
  description:
    "Get a customer's AR account summary in gable: balance_due, credit_limit, available_credit — all integer cents. Use for credit-limit bars and over-limit math; never invent credit limits.",
  schema: withBranch({
    customerId: z.string().uuid().describe("Customer UUID"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<AccountSummary>(`/api/v1/accounts/${args.customerId}`, {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
