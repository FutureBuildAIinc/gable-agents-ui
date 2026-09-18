import { useEffect, useRef } from "react";

export interface HotkeyBinding {
  /** key value (KeyboardEvent.key) — single char for letter/number keys */
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** run even when an input/textarea/select has focus (default: only outside text inputs) */
  allowInInputs?: boolean;
  /** human-readable description for a legend */
  description?: string;
  action: () => void;
}

function isTextInput(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/**
 * Global hotkeys for the workbench. Registered per-component; cleaned up on
 * unmount. Modifier-aware; ignores plain-character keys while typing in a
 * text field unless `allowInInputs` is set.
 */
export function useHotkeys(bindings: HotkeyBinding[]): void {
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const b of bindingsRef.current) {
        const wantsCtrl = Boolean(b.ctrl);
        const wantsMeta = Boolean(b.meta);
        const wantsShift = Boolean(b.shift);
        const wantsAlt = Boolean(b.alt);
        const hasCtrl = e.ctrlKey || (wantsMeta && e.metaKey);
        if (hasCtrl !== wantsCtrl && !(wantsCtrl && (e.ctrlKey || e.metaKey))) continue;
        if (e.shiftKey !== wantsShift) continue;
        if (e.altKey !== wantsAlt) continue;
        const keyMatch =
          e.key.toLowerCase() === b.key.toLowerCase() || e.key === b.key;
        if (!keyMatch) continue;
        const inInput = isTextInput(e.target);
        if (inInput && !b.allowInInputs && !wantsCtrl) continue;
        e.preventDefault();
        b.action();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
