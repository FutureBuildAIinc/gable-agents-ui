import { useEffect, useState } from "react";

/**
 * The artifact pane state — which workbench screen is open in the right-hand
 * pane (or detached as its own window). Shared across tabs/windows of the
 * same app origin via localStorage + events.
 *
 * Detach = MOVE (not copy): the in-app pane collapses to a reattach strip
 * and the screen lives in the OS window. `detached` makes that semantic
 * explicit and prevents two confusing editors for one draft.
 */

export interface ArtifactState {
  path: string;
  title: string;
  source?: "user" | "agent";
  openedAt?: number;
  detached?: boolean;
}

const KEY = "gable-artifact";
const EVENT = "gable-artifact-change";
const WIDTH_KEY = "gable-artifact-width";

export function isPaneMode(search: string): boolean {
  return new URLSearchParams(search).get("pane") === "1";
}

function read(): ArtifactState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ArtifactState;
    if (parsed && typeof parsed.path === "string") return parsed;
  } catch {
    // unreadable == closed
  }
  return null;
}

function write(state: ArtifactState | null): void {
  try {
    if (state) window.localStorage.setItem(KEY, JSON.stringify(state));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage best-effort
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
}

export function openArtifact(path: string, title: string, source: "user" | "agent" = "user"): void {
  write({ path, title, source, openedAt: Date.now() });
}

export function closeArtifact(): void {
  write(null);
}

/** Move the screen into its own OS window; collapse the in-app pane. */
export function detachArtifact(artifact: ArtifactState): void {
  const url = `${artifact.path}${artifact.path.includes("?") ? "&" : "?"}pane=1`;
  window.open(
    url,
    `gable-artifact-${artifact.path.replace(/[^a-z0-9]/gi, "-")}`,
    "popup=yes,width=1100,height=820",
  );
  write({ ...artifact, detached: true });
}

/** Bring the screen back from the OS window into the in-app pane. */
export function reattachArtifact(): void {
  const current = read();
  if (current) write({ ...current, detached: false });
}

export function useArtifact(): ArtifactState | null {
  const [artifact, setArtifact] = useState<ArtifactState | null>(() =>
    typeof window === "undefined" ? null : read(),
  );

  useEffect(() => {
    const sync = () => setArtifact(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return artifact;
}

/* Width persistence (resizable pane) */
export function readPaneWidth(): number {
  try {
    const n = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(n) && n >= 320 ? Math.min(n, 900) : 560;
  } catch {
    return 560;
  }
}
export function writePaneWidth(px: number): void {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(Math.round(px)));
  } catch {
    // best-effort
  }
}
