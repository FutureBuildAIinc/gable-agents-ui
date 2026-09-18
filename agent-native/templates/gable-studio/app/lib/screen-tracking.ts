import { writeClientAppState } from "@agent-native/core/client/application-state";
import { useEffect, useRef } from "react";

export interface ScreenSelection {
  kind: string;
  id: string;
  label?: string;
}

/**
 * Keep `navigation` + `selection` application state in sync with the visible
 * screen so the agent (view-screen action) always sees what the user sees —
 * the UI-as-agent / agent-as-UI contract.
 */
export function useScreenTracking(view: string, selection?: ScreenSelection): void {
  const lastRef = useRef("");
  const key = `${view}:${selection?.id ?? ""}`;
  useEffect(() => {
    if (lastRef.current === key) return;
    lastRef.current = key;
    void writeClientAppState("navigation", {
      view,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
      _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
    void writeClientAppState(
      "selection",
      selection
        ? { ...selection, _writeId: `${Date.now()}` }
        : { kind: "none", id: "", _writeId: `${Date.now()}` },
    );
  }, [key, view, selection]);
}
