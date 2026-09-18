import { appPath } from "@agent-native/core/client/api-path";
import {
  IconExternalLink,
  IconLayoutSidebarRight,
  IconX,
} from "@tabler/icons-react";
import { Suspense, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  closeArtifact,
  detachArtifact,
  readPaneWidth,
  reattachArtifact,
  useArtifact,
  writePaneWidth,
} from "@/lib/artifact";
import { lazyPaneComponent } from "@/lib/pane-routes";

/**
 * The artifact pane: a live, agent-operable workbench screen beside the chat,
 * rendered IN-PROCESS (shared React tree — no iframe double-chrome, shared
 * selection context). Detach MOVES it to its own OS window (the pane
 * collapses to a reattach strip); the detached window renders via the normal
 * app at ?pane=1 (chromeless) and stays synced through server state.
 *
 * Resizable (drag handle), collapsible, and shows "opened by agent" state.
 */

const MIN_W = 380;
const MAX_W = 760;
const COLLAPSED_W = 44;

export function ArtifactPane() {
  const artifact = useArtifact();
  const [width, setWidth] = useState(() => readPaneWidth());
  const [collapsed, setCollapsed] = useState(false);
  const draggingRef = useRef(false);
  const [lastOpen, setLastOpen] = useState(artifact);

  // Track the last non-detached artifact so the reattach strip knows the title.
  useEffect(() => {
    if (artifact && !artifact.detached) setLastOpen(artifact);
  }, [artifact]);

  // Agent navigate commands (application-state) → open the screen here.
  const seenNavigateRef = useRef<string>("");
  useEffect(() => {
    const tick = async () => {
      try {
        const { readClientAppState } = await import(
          "@agent-native/core/client/application-state"
        );
        const cmd = (await readClientAppState("navigate")) as {
          _writeId?: string;
          view?: string;
          path?: string;
        } | null;
        if (!cmd?._writeId || cmd._writeId === seenNavigateRef.current) return;
        seenNavigateRef.current = cmd._writeId;
        const VIEW: Record<string, string> = {
          launcher: "/launch",
          "quote-builder": "/quotes/new",
          quotes: "/quotes",
          products: "/products",
        };
        const target =
          cmd.path && cmd.path.startsWith("/")
            ? cmd.path
            : (cmd.view && VIEW[cmd.view]) || undefined;
        if (target) {
          const { openArtifact } = await import("@/lib/artifact");
          openArtifact(target, titleFor(target), "agent");
        }
      } catch {
        // navigation bridge is best-effort
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 1000);
    return () => clearInterval(id);
  }, []);

  if (!artifact) return null;

  // Detached = moved to an OS window → collapse to a reattach strip.
  if (artifact.detached) {
    return (
      <aside className="bg-card hidden w-11 shrink-0 flex-col items-center gap-2 border-l border-border py-3 lg:flex">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title={`Reattach ${lastOpen?.title ?? "screen"} to the pane`}
          aria-label="Reattach artifact"
          onClick={() => reattachArtifact()}
        >
          <IconLayoutSidebarRight className="size-4" />
        </Button>
        <span className="text-muted-foreground text-[10px] font-medium uppercase tracking-widest [writing-mode:vertical-rl]">
          detached
        </span>
      </aside>
    );
  }

  const Comp = lazyPaneComponent(artifact.path);
  const effectiveWidth = collapsed ? COLLAPSED_W : width;

  return (
    <aside
      className="bg-card relative hidden shrink-0 flex-col border-l border-border lg:flex"
      style={{ width: effectiveWidth }}
    >
      {/* drag handle */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize artifact pane"
          className="hover:bg-primary/40 absolute inset-y-0 -left-1 z-10 w-1.5 cursor-col-resize transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            draggingRef.current = true;
            const startX = e.clientX;
            const startW = effectiveWidth;
            const onMove = (ev: MouseEvent) => {
              if (!draggingRef.current) return;
              const delta = startX - ev.clientX;
              const w = Math.min(MAX_W, Math.max(MIN_W, startW + delta));
              setWidth(w);
            };
            const onUp = () => {
              draggingRef.current = false;
              setWidth((w) => {
                writePaneWidth(w);
                return w;
              });
              window.removeEventListener("mousemove", onMove);
              window.removeEventListener("mouseup", onUp);
            };
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
          }}
        />
      )}

      {/* header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-2">
        {collapsed ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground mx-auto"
            title="Expand pane"
            aria-label="Expand artifact pane"
            onClick={() => setCollapsed(false)}
          >
            <IconLayoutSidebarRight className="size-4" />
          </button>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              {artifact.source === "agent" && (
                <span
                  className="gable-agent-active inline-block size-1.5 shrink-0 rounded-full bg-[hsl(160,100%,50%)]"
                  title="Opened by the agent"
                />
              )}
              <span className="truncate text-sm font-medium">{artifact.title}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Collapse pane"
                aria-label="Collapse artifact pane"
                onClick={() => setCollapsed(true)}
              >
                <IconLayoutSidebarRight className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Detach to its own window"
                aria-label="Detach artifact to its own window"
                onClick={() => detachArtifact(artifact)}
              >
                <IconExternalLink className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title="Close pane"
                aria-label="Close artifact pane"
                onClick={() => closeArtifact()}
              >
                <IconX className="size-3.5" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* live screen, in-process */}
      {!collapsed && (
        <div className="min-h-0 w-full flex-1 overflow-y-auto bg-background">
          <Suspense
            fallback={
              <div className="space-y-3 p-4">
                <div className="gable-skeleton h-8 w-1/2" />
                <div className="gable-skeleton h-24 w-full" />
                <div className="gable-skeleton h-24 w-full" />
              </div>
            }
          >
            <Comp key={artifact.path} />
          </Suspense>
        </div>
      )}
    </aside>
  );
}

export function titleFor(path: string): string {
  if (path.startsWith("/quotes/new")) return "New Quote";
  if (path.startsWith("/quotes/")) return "Quote";
  if (path.startsWith("/quotes")) return "Quotes";
  if (path.startsWith("/products")) return "Products";
  if (path.startsWith("/launch")) return "Workbench";
  return "Gable";
}

