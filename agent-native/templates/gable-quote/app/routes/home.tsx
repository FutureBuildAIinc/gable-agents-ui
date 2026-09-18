import { useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconClipboardList,
  IconMessage,
  IconPackage,
  IconPlus,
} from "@tabler/icons-react";
import { Link } from "react-router";

import { Card, CardContent } from "@/components/ui/card";
import { useScreenTracking } from "@/lib/screen-tracking";
import { getChatHomeThreadId } from "@/lib/chat-home-thread";

export function meta() {
  return [{ title: "Gable Quotes" }];
}

interface LauncherAction {
  to: string;
  icon: typeof IconPlus;
  title: string;
  description: string;
  agentDriver: string;
}

const ACTIONS: LauncherAction[] = [
  {
    to: "/quotes/new",
    icon: IconPlus,
    title: "New Quote",
    description: "Build a quote yourself or hand the agent a material list — same screen.",
    agentDriver: "Builds, prices, and creates quotes on the shared builder screen",
  },
  {
    to: "/quotes",
    icon: IconClipboardList,
    title: "Quotes",
    description: "Every quote with live totals and one-click accept-and-convert.",
    agentDriver: "Works a quote end-to-end on request",
  },
  {
    to: "/products",
    icon: IconPackage,
    title: "Products",
    description: "Search the catalog with SKUs and units of measure.",
    agentDriver: "Finds SKUs and alternates while you quote",
  },
];

export default function Home() {
  useScreenTracking("launcher");
  const { data: quotes } = useActionQuery<{ id: string }[]>("list-quotes", { limit: 1 });
  const chatThreadId = getChatHomeThreadId();

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">What are we doing today?</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Every action is a button with an agent behind it — click to work the screen yourself,
        or let the agent drive it while you watch.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardContent className="flex items-start gap-4">
                <a.icon className="text-primary mt-1" size={28} stroke={1.5} />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-medium">{a.title}</h2>
                    {a.to === "/quotes" && quotes && quotes.length > 0 && (
                      <span className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-xs">
                        {quotes.length ? "" : ""}
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">{a.description}</p>
                  <p className="text-muted-foreground/70 mt-2 text-xs italic">{a.agentDriver}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        <Link to={`/chat/${encodeURIComponent(chatThreadId)}`} className="group">
          <Card className="h-full border-dashed transition-shadow group-hover:shadow-md">
            <CardContent className="flex items-start gap-4">
              <IconMessage className="text-muted-foreground mt-1" size={28} stroke={1.5} />
              <div>
                <h2 className="font-medium">Other…</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Anything else — ask, analyze, automate. The agent can open any screen from here.
                </p>
                <p className="text-muted-foreground/70 mt-2 text-xs italic">Freeform chat</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
