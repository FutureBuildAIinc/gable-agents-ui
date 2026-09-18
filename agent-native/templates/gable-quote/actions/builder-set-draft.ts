import { defineAction } from "@agent-native/core/action";
import { appStateGet, appStatePut } from "@agent-native/core/application-state";
import { z } from "zod";

/**
 * The quote-builder workspace state lives in application-state under
 * "quote-builder" so BOTH the human UI and the agent can drive the same
 * screen (agent-as-UI-operator). This action is the agent's write tool:
 * read-modify-write with a monotonic rev the UI polls.
 */

const DRAFT_KEY = "quote-builder";

const line = z.object({
  productId: z.string().uuid(),
  name: z.string().optional(),
  sku: z.string().optional(),
  quantity: z.number().int().positive(),
  uom: z.string().optional(),
  unitPriceCents: z.number().int().nonnegative().optional(),
});

const patch = z.object({
  setCustomer: z
    .object({ id: z.string().uuid(), name: z.string().optional() })
    .nullable()
    .optional()
    .describe("Select the customer (null clears)"),
  addLines: z.array(line).optional().describe("Append lines"),
  updateLine: z
    .object({ index: z.number().int().min(0), line })
    .optional()
    .describe("Replace a line by index"),
  removeLine: z.number().int().min(0).optional().describe("Remove a line by index"),
  setNotes: z.string().optional(),
  clear: z.boolean().optional().describe("Reset the draft"),
});

export interface BuilderLine {
  productId: string;
  name?: string;
  sku?: string;
  quantity: number;
  uom?: string;
  unitPriceCents?: number;
}

export interface BuilderDraft {
  rev: number;
  customer?: { id: string; name?: string } | null;
  lines: BuilderLine[];
  notes?: string;
  updatedAt?: string;
}

export async function readBuilderDraft(): Promise<BuilderDraft> {
  const current = await appStateGet("system", DRAFT_KEY);
  if (
    current &&
    typeof current === "object" &&
    Array.isArray((current as unknown as BuilderDraft).lines)
  ) {
    return current as unknown as BuilderDraft;
  }
  return { rev: 0, lines: [] };
}

export async function writeBuilderDraft(draft: BuilderDraft): Promise<void> {
  await appStatePut("system", DRAFT_KEY, {
    ...draft,
    rev: draft.rev + 1,
    updatedAt: new Date().toISOString(),
    _writeId: `${Date.now()}`,
  });
}

export const BUILDER_DRAFT_KEY = DRAFT_KEY;

export default defineAction({
  description:
    "Drive the quote-builder screen the user is looking at: set customer, add/update/remove lines, set notes, or clear. The screen updates live. Use this instead of describing changes — operate the screen directly.",
  schema: patch,
  run: async (args) => {
    const draft = await readBuilderDraft();
    if (args.clear) {
      await writeBuilderDraft({ rev: draft.rev, lines: [] });
      return { ok: true, draft: await readBuilderDraft() };
    }
    if (args.setCustomer !== undefined) draft.customer = args.setCustomer;
    if (args.setNotes !== undefined) draft.notes = args.setNotes;
    if (args.addLines) draft.lines = [...draft.lines, ...args.addLines];
    if (args.updateLine !== undefined && draft.lines[args.updateLine.index]) {
      draft.lines[args.updateLine.index] = args.updateLine.line;
    }
    if (args.removeLine !== undefined) {
      draft.lines.splice(args.removeLine, 1);
    }
    await writeBuilderDraft(draft);
    return { ok: true, draft: await readBuilderDraft() };
  },
});
