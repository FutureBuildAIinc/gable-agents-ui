import { defineAction } from "@agent-native/core/action";
import { appStateGet, appStatePut } from "@agent-native/core/application-state";
import { z } from "zod";

/**
 * The blind cycle-count sheet's workspace state lives in application-state
 * under "inventory-count" so BOTH the human UI and the agent drive the same
 * screen (agent-as-UI-operator). This action is the agent's write tool:
 * read-modify-write with a monotonic rev the UI polls.
 *
 * BLIND-MODE CONTRACT: when `blindMode` is true, the screen hides the
 * `onHand` column and the agent must not speak or write the on-hand values —
 * a blind count is only blind if the expected quantity stays invisible until
 * the counter enters their number. `count-set-draft` itself never strips
 * onHand (it's needed to compute variance when the user reveals), so treat
 * the field as confidential in chat while blindMode is on.
 */

const DRAFT_KEY = "inventory-count";

export const REASON_CODES = ["damage", "mispick", "receiving", "shrink", "other"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

const row = z.object({
  productId: z.string().uuid(),
  sku: z.string().optional(),
  name: z.string().optional(),
  uom: z.string().optional(),
  onHand: z
    .number()
    .nullable()
    .describe("Last-known on-hand from gable (null = unknown). Hidden from the UI while blindMode is on."),
  counted: z.number().optional().describe("Quantity the counter physically saw"),
  variance: z
    .number()
    .optional()
    .describe("counted − onHand; only meaningful once counted is set and onHand is known"),
  reasonCode: z.enum(REASON_CODES).optional(),
  status: z.enum(["uncounted", "counted", "reviewed"]).default("uncounted"),
});

const patch = z.object({
  setLocation: z
    .object({ locationId: z.string().uuid().nullable(), label: z.string().optional() })
    .optional()
    .describe("Set the location being counted (null clears)"),
  setBin: z.string().nullable().optional().describe("Set the bin/aisle filter (null clears)"),
  loadProducts: z
    .array(row.omit({ counted: true, variance: true, reasonCode: true, status: true }))
    .optional()
    .describe("Replace the sheet's rows with the products to count at this location (from list-inventory)"),
  setCounted: z
    .object({ index: z.number().int().min(0), qty: z.number() })
    .optional()
    .describe("Record a physical count for the row at index; marks the row counted and computes variance"),
  setReason: z
    .object({ index: z.number().int().min(0), code: z.enum(REASON_CODES) })
    .optional()
    .describe("Tag a variance with a reason code; marks the row reviewed"),
  setNotes: z.string().optional(),
  toggleBlind: z.boolean().optional().describe("Flip blindMode (true = on-hand hidden, false = revealed)"),
  clear: z.boolean().optional().describe("Reset the sheet"),
});

export interface CountRow {
  productId: string;
  sku?: string;
  name?: string;
  uom?: string;
  onHand: number | null;
  counted?: number;
  variance?: number;
  reasonCode?: ReasonCode;
  status: "uncounted" | "counted" | "reviewed";
}

export interface CountDraft {
  rev: number;
  locationId?: string | null;
  locationLabel?: string;
  bin?: string | null;
  rows: CountRow[];
  blindMode: boolean;
  notes?: string;
  updatedAt?: string;
}

export async function readCountDraft(): Promise<CountDraft> {
  const current = await appStateGet("system", DRAFT_KEY);
  if (
    current &&
    typeof current === "object" &&
    Array.isArray((current as unknown as CountDraft).rows)
  ) {
    const d = current as unknown as CountDraft;
    return { ...d, blindMode: d.blindMode !== false };
  }
  return { rev: 0, rows: [], blindMode: true };
}

export async function writeCountDraft(draft: CountDraft): Promise<void> {
  await appStatePut("system", DRAFT_KEY, {
    ...draft,
    rev: draft.rev + 1,
    updatedAt: new Date().toISOString(),
    _writeId: `${Date.now()}`,
  });
}

export const COUNT_DRAFT_KEY = DRAFT_KEY;

function computeVariance(row: CountRow): number | undefined {
  if (row.counted == null || row.onHand == null) return undefined;
  return row.counted - row.onHand;
}

export default defineAction({
  description:
    "Drive the cycle-count sheet the user is looking at: set location/bin, load the product rows to count, record counted quantities, tag variances with reason codes, toggle blind mode, or clear. The screen updates live. While blindMode is on, never reveal the onHand values in chat — the count is blind until the user reveals it.",
  schema: patch,
  run: async (args) => {
    const draft = await readCountDraft();

    if (args.clear) {
      await writeCountDraft({ rev: draft.rev, rows: [], blindMode: true });
      return { ok: true, draft: await readCountDraft() };
    }

    if (args.setLocation !== undefined) {
      draft.locationId = args.setLocation.locationId;
      draft.locationLabel = args.setLocation.label;
    }
    if (args.setBin !== undefined) draft.bin = args.setBin;
    if (args.setNotes !== undefined) draft.notes = args.setNotes;
    if (args.toggleBlind !== undefined) draft.blindMode = !draft.blindMode;

    if (args.loadProducts) {
      draft.rows = args.loadProducts.map((r) => ({
        ...r,
        status: "uncounted" as const,
      }));
    }

    if (args.setCounted !== undefined) {
      const target = draft.rows[args.setCounted.index];
      if (target) {
        target.counted = args.setCounted.qty;
        target.variance = computeVariance(target);
        target.status = "counted";
      }
    }

    if (args.setReason !== undefined) {
      const target = draft.rows[args.setReason.index];
      if (target) {
        target.reasonCode = args.setReason.code;
        target.status = "reviewed";
      }
    }

    await writeCountDraft(draft);
    return { ok: true, draft: await readCountDraft() };
  },
});
