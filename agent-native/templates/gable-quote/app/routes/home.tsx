import { markAgentChatHomeHandoff } from "@agent-native/core/client/agentkit-chat/rail";
import { appPath } from "@agent-native/core/client/api-path";
import { useEffect, useRef, useState } from "react";

import { getChatHomeThreadId } from "@/lib/chat-home-thread";
import { openArtifact } from "@/lib/artifact";

export function meta() {
  return [{ title: "Gable Quotes" }];
}

/**
 * Chat is front and center. The workbench opens in the artifact pane (or a
 * detached window); the launcher tiles below offer the fastest pointer into
 * the quote builder and the account-engagement view.
 */
export default function ChatHome() {
  const [threadId] = useState(getChatHomeThreadId);
  const handoffStartedRef = useRef(false);

  useEffect(() => {
    if (handoffStartedRef.current) return;
    handoffStartedRef.current = true;
    markAgentChatHomeHandoff("chat");
    try {
      window.location.replace(appPath(`/chat/${encodeURIComponent(threadId)}`));
    } catch (error) {
      handoffStartedRef.current = false;
      throw error;
    }
  }, [threadId]);

  return (
    <div className="flex h-full items-center justify-center gap-3">
      <button
        type="button"
        className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
        onClick={() => openArtifact("/quotes/new", "New Quote")}
      >
        New Quote →
      </button>
      <button
        type="button"
        className="border-input text-foreground rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent"
        onClick={() => openArtifact("/accounts", "Accounts")}
      >
        Accounts needing outreach →
      </button>
    </div>
  );
}
