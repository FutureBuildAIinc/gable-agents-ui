import { readClientAppState, writeClientAppState } from "@agent-native/core/client/application-state";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BoardDraft, BoardRouteLane, OrderCard } from "../../actions/board-set-draft";

export type { BoardDraft, BoardRouteLane, OrderCard };

export const EMPTY_BOARD: BoardDraft = { rev: 0, lanes: { unassigned: [], routes: [] } };

async function fetchDraft(): Promise<BoardDraft> {
  try {
    const value = await readClientAppState<BoardDraft>("dispatch-board");
    if (
      value &&
      typeof value === "object" &&
      value.lanes &&
      Array.isArray(value.lanes.unassigned) &&
      Array.isArray(value.lanes.routes)
    ) {
      return value;
    }
  } catch {
    // unreadable and empty render identically
  }
  return EMPTY_BOARD;
}

/**
 * The dispatch board's shared draft. The human edits optimistically (rev+1);
 * the agent writes via the board-set-draft action. Polling adopts server state
 * only when its rev is newer, so clicking never gets clobbered by a stale read.
 */
export function useBoardDraft(pollMs = 1500) {
  const [draft, setDraft] = useState<BoardDraft>(EMPTY_BOARD);
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

  const mutate = useCallback(async (next: (d: BoardDraft) => BoardDraft) => {
    const current = await fetchDraft();
    const updated = next(current);
    // Returning the same reference means "no change" — skip the write so
    // reconciliation loops never churn the rev.
    if (updated === current) return;
    const rev = Math.max(current.rev, localRevRef.current) + 1;
    localRevRef.current = rev;
    const payload: BoardDraft = { ...updated, rev, updatedAt: new Date().toISOString() };
    setDraft(payload);
    try {
      await writeClientAppState("dispatch-board", payload);
    } catch {
      // keep local state; next poll re-syncs
    }
  }, []);

  return { draft, mutate };
}

/** Total lane weight, only when every card's weight is known. */
export function laneWeightLbs(lane: BoardRouteLane): number | null {
  if (lane.stops.length === 0) return 0;
  if (!lane.stops.every((s) => typeof s.weightLbs === "number")) return null;
  return lane.stops.reduce((sum, s) => sum + (s.weightLbs ?? 0), 0);
}
