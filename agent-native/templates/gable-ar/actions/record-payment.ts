import { defineAction } from "@agent-native/core/action";
import { tokenFromContext, withBranch } from "@gable/client";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

export default defineAction({
  description:
    "Record a payment against an invoice in gable. Posts to the customer's AR subledger and updates the invoice status (PARTIAL/PAID). Confirm with the user before calling — this is a financial write.",
  schema: withBranch({
    invoiceId: z.string().uuid().describe("Invoice UUID the payment applies to"),
    amountCents: z.number().int().positive().describe("Payment amount in integer cents"),
    method: z
      .enum(["CASH", "CHECK", "CARD", "ACCOUNT"])
      .describe("Tender method as gable stores it (ACCOUNT = charged on account)"),
    reference: z.string().optional().describe("Check number / transaction reference"),
    notes: z.string().optional(),
  }),
  run: async (args, ctx) => {
    return await gable.post("/api/v1/payments", {
      body: {
        invoice_id: args.invoiceId,
        // gable's payment API takes "amount" in cents, not amount_cents.
        amount: args.amountCents,
        method: args.method,
        reference: args.reference,
        notes: args.notes,
      },
      branchId: args.branchId,
      token: tokenFromContext(ctx),
    });
  },
});
