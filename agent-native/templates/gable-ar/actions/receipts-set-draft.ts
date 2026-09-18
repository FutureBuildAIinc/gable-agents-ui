import { defineAction } from "@agent-native/core/action";
import { appStateGet, appStatePut } from "@agent-native/core/application-state";
import { z } from "zod";

/**
 * The batch-receipts workspace state lives in application-state under
 * "ar-batch" so BOTH the human UI and the agent can drive the same screen
 * (agent-as-UI-operator). This action is the agent's write tool:
 * read-modify-write with a monotonic rev the UI polls.
 */

const DRAFT_KEY = "ar-batch";

const method = z
  .enum(["CASH", "CHECK", "CARD", "ACCOUNT"])
  .describe("Tender method as gable stores it (ACCOUNT = charged on account)");

const rowStatus = z.enum(["pending", "mapped", "posted", "error"]);

const row = z.object({
  id: z.string().optional().describe("Row id — generated when omitted"),
  customerId: z.string().uuid().optional(),
  customerName: z.string().optional(),
  invoiceId: z.string().uuid().optional(),
  invoiceNumber: z.string().optional().describe("Human-facing invoice number/short id"),
  amountCents: z.number().int().positive().describe("Receipt amount in integer cents"),
  method,
  reference: z.string().optional().describe("Check number / transaction reference"),
  status: rowStatus.default("pending"),
  note: z.string().optional().describe("Exception note (short-pay reason, post error, …)"),
});

const patch = z.object({
  setSource: z
    .enum(["deposit-slip", "manual"])
    .nullable()
    .optional()
    .describe("Set the batch source (null clears)"),
  setSlipTotalCents: z
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
    .describe("The deposit-slip total in integer cents the batch reconciles against (null clears)"),
  addRows: z.array(row).optional().describe("Append rows"),
  updateRow: z
    .object({ index: z.number().int().min(0), row })
    .optional()
    .describe("Replace a row by index"),
  removeRow: z.number().int().min(0).optional().describe("Remove a row by index"),
  markMapped: z
    .object({
      index: z.number().int().min(0),
      customerId: z.string().uuid(),
      customerName: z.string().optional(),
      invoiceId: z.string().uuid(),
      invoiceNumber: z.string().optional(),
    })
    .optional()
    .describe("Map a pending row to a customer + open invoice (status becomes 'mapped')"),
  setNotes: z.string().optional(),
  clear: z.boolean().optional().describe("Reset the batch"),
});

export type PaymentMethodT = z.infer<typeof method>;
export type ArRowStatus = z.infer<typeof rowStatus>;

export interface ArBatchRow {
  id: string;
  customerId?: string;
  customerName?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amountCents: number;
  method: PaymentMethodT;
  reference?: string;
  status: ArRowStatus;
  note?: string;
}

export interface ArBatchDraft {
  rev: number;
  batch: {
    source?: "deposit-slip" | "manual";
    postedAt?: string;
    /** The paper deposit-slip total the running batch total reconciles against. */
    slipTotalCents?: number;
  };
  rows: ArBatchRow[];
  notes?: string;
  updatedAt?: string;
}

export async function readArBatchDraft(): Promise<ArBatchDraft> {
  const current = await appStateGet("system", DRAFT_KEY);
  if (
    current &&
    typeof current === "object" &&
    Array.isArray((current as unknown as ArBatchDraft).rows)
  ) {
    return current as unknown as ArBatchDraft;
  }
  return { rev: 0, batch: {}, rows: [] };
}

export async function writeArBatchDraft(draft: ArBatchDraft): Promise<void> {
  await appStatePut("system", DRAFT_KEY, {
    ...draft,
    rev: draft.rev + 1,
    updatedAt: new Date().toISOString(),
    _writeId: `${Date.now()}`,
  });
}

export const AR_BATCH_DRAFT_KEY = DRAFT_KEY;

let rowSeq = 0;
function withId(r: Omit<ArBatchRow, "id"> & { id?: string }): ArBatchRow {
  return { ...r, id: r.id ?? `row-${Date.now()}-${rowSeq++}` };
}

export default defineAction({
  description:
    "Drive the batch-receipts screen the user is looking at: set the deposit-slip source/total, add/update/remove rows, map rows to open invoices, set notes, or clear. The screen updates live. Use this instead of describing changes — operate the screen directly. NEVER posts payments; posting is human-confirmed on screen.",
  schema: patch,
  run: async (args) => {
    const draft = await readArBatchDraft();
    if (args.clear) {
      await writeArBatchDraft({ rev: draft.rev, batch: {}, rows: [] });
      return { ok: true, draft: await readArBatchDraft() };
    }
    if (args.setSource !== undefined) {
      draft.batch = { ...draft.batch, source: args.setSource ?? undefined };
    }
    if (args.setSlipTotalCents !== undefined) {
      draft.batch = { ...draft.batch, slipTotalCents: args.setSlipTotalCents ?? undefined };
    }
    if (args.setNotes !== undefined) draft.notes = args.setNotes;
    if (args.addRows) draft.rows = [...draft.rows, ...args.addRows.map(withId)];
    if (args.updateRow !== undefined && draft.rows[args.updateRow.index]) {
      draft.rows[args.updateRow.index] = withId(args.updateRow.row);
    }
    if (args.removeRow !== undefined) {
      draft.rows.splice(args.removeRow, 1);
    }
    if (args.markMapped !== undefined && draft.rows[args.markMapped.index]) {
      const m = args.markMapped;
      draft.rows[m.index] = {
        ...draft.rows[m.index],
        customerId: m.customerId,
        customerName: m.customerName ?? draft.rows[m.index].customerName,
        invoiceId: m.invoiceId,
        invoiceNumber: m.invoiceNumber ?? draft.rows[m.index].invoiceNumber,
        status: "mapped",
        note: undefined,
      };
    }
    await writeArBatchDraft(draft);
    return { ok: true, draft: await readArBatchDraft() };
  },
});
