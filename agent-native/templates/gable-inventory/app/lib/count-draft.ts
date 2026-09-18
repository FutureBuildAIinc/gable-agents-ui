import { readClientAppState, writeClientAppState } from "@agent-native/core/client/application-state";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CountDraft, CountRow, ReasonCode } from "../../actions/count-set-draft";

export type { CountDraft, CountRow, ReasonCode };

export const EMPTY_COUNT_DRAFT: CountDraft = { rev: 0, rows: [], blindMode: true };

async function fetchDraft(): Promise<CountDraft> {
  try {
    const value = await readClientAppState<CountDraft>("inventory-count");
    if (value && typeof value === "object" && Array.isArray(value.rows)) {
      return { ...value, blindMode: value.blindMode !== false };
    }
  } catch {
    // unreadable and empty render identically
  }
  return EMPTY_COUNT_DRAFT;
}

/**
 * The count sheet's shared draft. The human edits optimistically (rev+1); the
 * agent writes via the count-set-draft action. Polling adopts server state
 * only when its rev is newer, so typing never gets clobbered by a stale read.
 *
 * Blind-count rule: while `draft.blindMode` is true, callers must not render
 * `row.onHand` anywhere on screen — that number stays hidden until the human
 * reveals it. The draft itself keeps the value so variance math still works.
 */
export function useCountDraft(pollMs = 1500) {
  const [draft, setDraft] = useState<CountDraft>(EMPTY_COUNT_DRAFT);
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

  const mutate = useCallback(async (next: (d: CountDraft) => CountDraft) => {
    const current = await fetchDraft();
    const updated = next(current);
    const rev = Math.max(current.rev, localRevRef.current) + 1;
    localRevRef.current = rev;
    const payload = { ...updated, rev, updatedAt: new Date().toISOString() };
    setDraft(payload);
    try {
      await writeClientAppState("inventory-count", payload);
    } catch {
      // keep local state; next poll re-syncs
    }
  }, []);

  return { draft, mutate };
}

export function computeVariance(row: CountRow): number | undefined {
  if (row.counted == null || row.onHand == null) return undefined;
  return row.counted - row.onHand;
}
