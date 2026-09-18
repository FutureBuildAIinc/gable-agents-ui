import { readClientAppState, writeClientAppState } from "@agent-native/core/client/application-state";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BuilderDraft, BuilderLine } from "../../actions/builder-set-draft";

export type { BuilderDraft, BuilderLine };

export const EMPTY_DRAFT: BuilderDraft = { rev: 0, lines: [] };

async function fetchDraft(): Promise<BuilderDraft> {
  try {
    const value = await readClientAppState<BuilderDraft>("quote-builder");
    if (value && typeof value === "object" && Array.isArray(value.lines)) {
      return value;
    }
  } catch {
    // unreadable and empty render identically
  }
  return EMPTY_DRAFT;
}

/**
 * The workspace's shared draft. The human edits optimistically (rev+1); the
 * agent writes via the builder-set-draft action. Polling adopts server state
 * only when its rev is newer, so typing never gets clobbered by a stale read.
 */
export function useQuoteBuilderDraft(pollMs = 1500) {
  const [draft, setDraft] = useState<BuilderDraft>(EMPTY_DRAFT);
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

  const mutate = useCallback(async (next: (d: BuilderDraft) => BuilderDraft) => {
    const current = await fetchDraft();
    const updated = next(current);
    const rev = Math.max(current.rev, localRevRef.current) + 1;
    localRevRef.current = rev;
    const payload = { ...updated, rev, updatedAt: new Date().toISOString() };
    setDraft(payload);
    try {
      await writeClientAppState("quote-builder", payload);
    } catch {
      // keep local state; next poll re-syncs
    }
  }, []);

  return { draft, mutate };
}

export function draftTotalCents(draft: BuilderDraft): number | null {
  if (!draft.lines.every((l) => typeof l.unitPriceCents === "number")) return null;
  return draft.lines.reduce((sum, l) => sum + (l.unitPriceCents ?? 0) * l.quantity, 0);
}
