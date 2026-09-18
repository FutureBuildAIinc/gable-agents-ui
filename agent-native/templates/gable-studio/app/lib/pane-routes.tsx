import { lazy } from "react";

/**
 * In-process pane route manifest for gable-studio. Client components only.
 * The detached OS window uses the normal app at ?pane=1.
 */

export interface PaneRoute {
  match: (path: string) => boolean;
  load: () => Promise<{ default: React.ComponentType<any> }>;
}

export const PANE_ROUTES: PaneRoute[] = [
  {
    match: (p) => p.startsWith("/studio/preview"),
    load: () => import("../routes/studio.preview"),
  },
  {
    match: (p) => p.startsWith("/studio/templates") || p.startsWith("/studio/new"),
    load: () => import("../routes/studio.templates"),
  },
  {
    match: () => true,
    load: () => import("../routes/launch"),
  },
];

export function resolvePaneRoute(path: string): PaneRoute {
  return PANE_ROUTES.find((r) => r.match(path)) ?? PANE_ROUTES[PANE_ROUTES.length - 1];
}

export function lazyPaneComponent(path: string) {
  return lazy(() => resolvePaneRoute(path).load());
}
