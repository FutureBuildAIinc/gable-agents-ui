import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface CustomerTransaction {
  id: string;
  customer_id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference_id?: string;
  description: string;
  created_at: string;
}

export default defineAction({
  description:
    "List a customer's AR ledger transactions in gable (invoices, payments, refunds, adjustments with running balance).",
  schema: withBranch({
    customerId: z.string().uuid().describe("Customer UUID"),
  }),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async (args, ctx) => {
    return await gable.get<CustomerTransaction[]>(`/api/v1/accounts/${args.customerId}/transactions`, {
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
