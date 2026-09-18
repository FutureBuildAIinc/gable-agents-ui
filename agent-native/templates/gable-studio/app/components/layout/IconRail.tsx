import {
  IconClipboardList,
  IconHome,
  IconPackage,
  IconLayoutSidebarLeftExpand,
  IconPlus,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { openArtifact } from "@/lib/artifact";
import { cn } from "@/lib/utils";

import { Sidebar } from "./Sidebar";

/**
 * Narrow icon rail (the app's left navbar). Workspace icons open screens in
 * the artifact pane; Chat is always center stage. The panel icon reveals the
 * full thread-history sidebar as an overlay.
 */

interface RailItem {
  kind: "link" | "artifact";
  to: string;
  title: string;
  icon: typeof IconHome;
  artifactTitle?: string;
}

const ITEMS: RailItem[] = [
  { kind: "link", to: "/home", title: "Chat", icon: IconHome },
  {
    kind: "artifact",
    to: "/quotes/new",
    title: "New Quote",
    icon: IconPlus,
    artifactTitle: "New Quote",
  },
  {
    kind: "artifact",
    to: "/quotes",
    title: "Quotes",
    icon: IconClipboardList,
    artifactTitle: "Quotes",
  },
  {
    kind: "artifact",
    to: "/products",
    title: "Products",
    icon: IconPackage,
    artifactTitle: "Products",
  },
];

export function IconRail() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <nav className="bg-card flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border py-3">
        <Link
          to="/home"
          className="bg-primary text-primary-foreground mb-2 flex size-9 items-center justify-center rounded-lg text-sm font-bold"
          title="Gable Studio"
        >
          G
        </Link>
        {ITEMS.map((item) => {
          const active =
            item.kind === "link" && location.pathname === item.to;
          const button = (
            <button
              type="button"
              className={cn(
                "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-accent text-foreground",
              )}
              onClick={() => {
                if (item.kind === "artifact" && item.artifactTitle) {
                  openArtifact(item.to, item.artifactTitle);
                }
              }}
            >
              <item.icon className="size-[18px]" stroke={1.6} />
            </button>
          );
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                {item.kind === "link" ? (
                  <Link
                    to={item.to}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                      active && "bg-accent text-foreground",
                    )}
                  >
                    <item.icon className="size-[18px]" stroke={1.6} />
                  </Link>
                ) : (
                  button
                )}
              </TooltipTrigger>
              <TooltipContent side="right">{item.title}</TooltipContent>
            </Tooltip>
          );
        })}
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-9"
              onClick={() => setSidebarOpen(true)}
            >
              <IconLayoutSidebarLeftExpand className="size-[18px]" stroke={1.6} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Threads & workspace</TooltipContent>
        </Tooltip>
      </nav>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[var(--chat-sidebar-width)] p-0">
          <SheetTitle className="sr-only">Threads & workspace</SheetTitle>
          <SheetDescription className="sr-only">
            Chat threads and workspace navigation
          </SheetDescription>
          <Sidebar collapsed={false} collapsible={false} />
        </SheetContent>
      </Sheet>
    </>
  );
}
