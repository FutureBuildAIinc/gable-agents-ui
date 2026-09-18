import { appPath } from "@agent-native/core/client/api-path";
import { IconExternalLink, IconX } from "@tabler/icons-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { closeArtifact, detachArtifact, useArtifact } from "@/lib/artifact";

/**
 * The right-hand artifact pane: a live, agent-operable workbench screen next
 * to the chat. Detach pops it into its own OS window (same app, same server
 * state — the shared draft and events keep both windows in sync).
 *
 * Also bridges the agent's `navigate` action (application-state commands) so
 * the agent can put screens in front of the user.
 */

const VIEW_TO_PATH: Record<string, string> = {
  launcher: "/launch",
  "quote-builder": "/quotes/new",
  quotes: "/quotes",
  products: "/products",
};

export function ArtifactPane() {
  const artifact = useArtifact();
  const seenNavigateRef = useRef<string>("");

  // Agent navigate commands → open the screen here.
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
        const target =
          cmd.path && cmd.path.startsWith("/")
            ? cmd.path
            : (cmd.view && VIEW_TO_PATH[cmd.view]) || undefined;
        if (target) {
          const { openArtifact } = await import("@/lib/artifact");
          openArtifact(target, titleFor(target));
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

  return (
    <aside className="bg-card hidden w-[520px] shrink-0 flex-col border-l border-border lg:flex xl:w-[600px]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="truncate text-sm font-medium">{artifact.title}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Detach to its own window"
            aria-label="Detach artifact to its own window"
            onClick={() => detachArtifact(artifact)}
          >
            <IconExternalLink className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Close pane"
            aria-label="Close artifact pane"
            onClick={() => closeArtifact()}
          >
            <IconX className="size-4" />
          </Button>
        </div>
      </div>
      <iframe
        title={artifact.title}
        src={appPath(`${artifact.path}${artifact.path.includes("?") ? "&" : "?"}pane=1`)}
        className="min-h-0 w-full flex-1 border-0 bg-background"
      />
    </aside>
  );
}

export function titleFor(path: string): string {
  if (path.startsWith("/quotes/new")) return "New Quote";
  if (path.startsWith("/quotes/")) return "Quote";
  if (path.startsWith("/quotes")) return "Quotes";
  if (path.startsWith("/products")) return "Products";
  if (path.startsWith("/launch")) return "Launcher";
  return "Gable";
}

