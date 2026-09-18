import {
  isAgentChatHomeHandoffActive,
  useAgentChatHomeHandoff,
  useAgentChatHomeHandoffLinks,
} from "@agent-native/core/client/agentkit-chat/rail";
import { IconMenu2 } from "@tabler/icons-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

import { ArtifactPane } from "./ArtifactPane";
import { IconRail } from "./IconRail";

const Header = lazy(() =>
  import("./Header").then((module) => ({ default: module.Header })),
);
const AgentInspector = lazy(() =>
  import("./AgentInspector").then((module) => ({
    default: module.AgentInspector,
  })),
);

/**
 * Chat-first shell: narrow icon rail (left), the conversation center stage,
 * and the live workbench screen in a detachable artifact pane (right).
 * `?pane=1` renders any route chromeless for the pane's iframe or a detached
 * OS window.
 */

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const paneMode = searchParams.get("pane") === "1";
  const isChatRoute =
    location.pathname === "/home" || location.pathname.startsWith("/chat/");

  const chatHomeHandoffActive = useAgentChatHomeHandoff({
    storageKey: "chat",
    activePath: location.pathname,
    enabled: !isChatRoute,
  });
  const chatHomeHandoffPending = isAgentChatHomeHandoffActive("chat");
  useAgentChatHomeHandoffLinks({
    storageKey: "chat",
    isChatPath: (pathname) =>
      pathname === "/home" || pathname.startsWith("/chat/"),
    requireActiveHandoff: true,
  });

  useEffect(() => {
    const close = () => setMobileNavOpen(false);
    window.addEventListener("agent-chat:open-thread", close);
    return () => window.removeEventListener("agent-chat:open-thread", close);
  }, []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (paneMode) {
    return (
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        <main className="agent-native-app-main min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    );
  }

  const contentFrame = (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {isChatRoute ? (
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3 md:hidden">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <IconMenu2 className="size-4" />
          </button>
          <span className="truncate text-sm font-semibold">Gable Inventory</span>
        </div>
      ) : (
        <Suspense fallback={<div className="h-12 shrink-0" />}>
          <Header onOpenMobileSidebar={() => setMobileNavOpen(true)} />
        </Suspense>
      )}
      <main className="agent-native-app-main min-w-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
    </div>
  );

  return (
    <div className="agent-layout-shell chat-layout-shell flex h-screen w-full overflow-hidden bg-background text-foreground">
      <div className="hidden md:block">
        <IconRail />
      </div>
      {mobileNavOpen && (
        <div className="bg-card fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border md:hidden">
          <IconRail />
        </div>
      )}
      {isChatRoute ? (
        <div
          data-agent-chat-canvas="true"
          className="agent-layout-main-surface flex min-w-0 flex-1 overflow-hidden"
        >
          {contentFrame}
        </div>
      ) : (
        <Suspense fallback={contentFrame}>
          <AgentInspector
            chatHomeHandoffActive={chatHomeHandoffActive}
            chatHomeHandoffPending={chatHomeHandoffPending}
          >
            {contentFrame}
          </AgentInspector>
        </Suspense>
      )}
      <ArtifactPane />
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
    </div>
  );
}
