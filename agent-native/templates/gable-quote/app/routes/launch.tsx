import { useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconClipboardList,
  IconExternalLink,
  IconPackage,
  IconPlus,
} from "@tabler/icons-react";

import { Card, CardContent } from "@/components/ui/card";
import { openArtifact } from "@/lib/artifact";
import { useScreenTracking } from "@/lib/screen-tracking";

export function meta() {
  return [{ title: "Launcher — Gable Quotes" }];
}

/**
 * The dual-app launcher (docs/steering/dual-frontend-scope.md): this app's
 * agent-driven workspaces AND the classic gable ERP desk as a first-class
 * tile. The classic app is a separate frontend — the tile is just a link
 * (same bridge as classic-link); no embedding, no shared chrome.
 */

const ACTIONS = [
  {
    path: "/quotes/new",
    icon: IconPlus,
    title: "New Quote",
    description: "Build it yourself or hand the agent a material list — same screen.",
    agentDriver: "Builds, prices, and creates quotes on the shared builder screen",
  },
  {
    path: "/quotes",
    icon: IconClipboardList,
    title: "Quotes",
    description: "Every quote with live totals and one-click accept-and-convert.",
    agentDriver: "Works a quote end-to-end on request",
  },
  {
    path: "/products",
    icon: IconPackage,
    title: "Products",
    description: "Search the catalog with SKUs and units of measure.",
    agentDriver: "Finds SKUs and alternates while you quote",
  },
] as const;

export default function Launcher() {
  useScreenTracking("launcher");
  // entity="home" → the classic app root; errors (unset base) simply hide the tile.
  const { data: classic } = useActionQuery<{ url: string }>("classic-link", {
    entity: "home",
  });

  return (
    <div className="p-5">
      <h1 className="text-lg font-semibold">Workbench</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Screens open here. Detach from the pane header to park one on another
        display.
      </p>
      <div className="mt-4 space-y-3">
        {ACTIONS.map((a) => (
          <button key={a.path} type="button" className="block w-full text-left" onClick={() => openArtifact(a.path, a.title)}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3">
                <a.icon className="text-primary mt-0.5" size={22} stroke={1.5} />
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{a.description}</p>
                  <p className="text-muted-foreground/70 mt-1 text-[11px] italic">{a.agentDriver}</p>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {classic?.url && (
        <>
          <h2 className="mt-6 text-sm font-semibold">Also on this backend</h2>
          <div className="mt-2">
            <a href={classic.url} target="_blank" rel="noreferrer" className="block">
              <Card className="border-dashed transition-shadow hover:shadow-md">
                <CardContent className="flex items-start gap-3">
                  <IconExternalLink className="text-muted-foreground mt-0.5" size={22} stroke={1.5} />
                  <div>
                    <div className="text-sm font-medium">Classic Gable ERP</div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      The full desk — orders, AR, inventory, dispatch, everything. Opens in
                      its own tab; you're already signed in (same front door).
                    </p>
                    <p className="text-muted-foreground/70 mt-1 text-[11px] italic">
                      Separate app, one backend — links bridge them
                    </p>
                  </div>
                </CardContent>
              </Card>
            </a>
          </div>
        </>
      )}
    </div>
  );
}
