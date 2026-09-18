import { useEffect, useState } from "react";

/**
 * The artifact pane state — which workbench screen is open in the right-hand
 * pane (or detached as its own window). Shared across tabs of the same app
 * origin via localStorage + events so a detached window and the main window
 * agree on what's open.
 */

export interface ArtifactState {
  path: string;
  title: string;
}

const KEY = "gable-artifact";
const EVENT = "gable-artifact-change";

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

export function openArtifact(path: string, title: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, title }));
  } catch {
    // storage best-effort
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { path, title } }));
}

export function closeArtifact(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // storage best-effort
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: null }));
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

/** Open the artifact in a real OS window (drag to another screen). */
export function detachArtifact(artifact: ArtifactState): void {
  const url = `${artifact.path}${artifact.path.includes("?") ? "&" : "?"}pane=1`;
  window.open(
    url,
    `gable-artifact-${artifact.path.replace(/[^a-z0-9]/gi, "-")}`,
    "popup=yes,width=1100,height=820",
  );
}
