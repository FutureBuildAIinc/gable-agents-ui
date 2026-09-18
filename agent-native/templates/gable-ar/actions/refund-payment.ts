import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Refund a payment in gable (full or partial). Only card payments with a gateway transaction can be refunded. Confirm with the user before calling — this is a financial write.",
  schema: withBranch({
    paymentId: z.string().uuid().describe("Payment UUID to refund"),
    amountCents: z.number().int().positive().describe("Refund amount in integer cents (may not exceed the original payment)"),
    reason: z.string().optional(),
  }),
  run: async (args, ctx) => {
    return await gable.post("/api/v1/payments/refund", {
      body: {
        payment_id: args.paymentId,
        // gable's refund API takes "amount" in cents, not amount_cents.
        amount: args.amountCents,
        reason: args.reason,
      },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
