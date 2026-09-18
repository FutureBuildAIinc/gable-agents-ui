import {
  IconClipboardList,
  IconPackage,
  IconPlus,
} from "@tabler/icons-react";

import { Card, CardContent } from "@/components/ui/card";
import { useScreenTracking } from "@/lib/screen-tracking";
import { openArtifact } from "@/lib/artifact";

export function meta() {
  return [{ title: "Launcher — Gable Quotes" }];
}

/**
 * The artifact pane's default content. Buttons open other screens in the same
 * pane (or a new detached window via the pane header's detach button).
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
    </div>
  );
}
