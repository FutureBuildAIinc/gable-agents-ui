import { readClientAppState, writeClientAppState } from "@agent-native/core/client/application-state";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ArBatchDraft, ArBatchRow } from "../../actions/receipts-set-draft";

export type { ArBatchDraft, ArBatchRow };

export const EMPTY_DRAFT: ArBatchDraft = { rev: 0, batch: {}, rows: [] };

async function fetchDraft(): Promise<ArBatchDraft> {
  try {
    const value = await readClientAppState<ArBatchDraft>("ar-batch");
    if (value && typeof value === "object" && Array.isArray(value.rows)) {
      return value;
    }
  } catch {
    // unreadable and empty render identically
  }
  return EMPTY_DRAFT;
}

/**
 * The workspace's shared draft. The human edits optimistically (rev+1); the
 * agent writes via the receipts-set-draft action. Polling adopts server state
 * only when its rev is newer, so typing never gets clobbered by a stale read.
 */
export function useArBatchDraft(pollMs = 1500) {
  const [draft, setDraft] = useState<ArBatchDraft>(EMPTY_DRAFT);
  const localRevRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const server = await fetchDraft();
      if (!alive) return;
      if (server.rev > localRevRef.current) {
        localRevRef.current = server.rev;
        setDraft(server);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  const mutate = useCallback(async (next: (d: ArBatchDraft) => ArBatchDraft) => {
    const current = await fetchDraft();
    const updated = next(current);
    const rev = Math.max(current.rev, localRevRef.current) + 1;
    localRevRef.current = rev;
    const payload = { ...updated, rev, updatedAt: new Date().toISOString() };
    setDraft(payload);
    try {
      await writeClientAppState("ar-batch", payload);
    } catch {
      // keep local state; next poll re-syncs
    }
  }, []);

  return { draft, mutate };
}

/** Running batch total in integer cents — reconciles against the deposit slip. */
export function totalCents(draft: ArBatchDraft): number {
  return draft.rows.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
}

/** Rows already posted to the AR subledger this session. */
export function paidCount(draft: ArBatchDraft): number {
  return draft.rows.filter((r) => r.status === "posted").length;
}
