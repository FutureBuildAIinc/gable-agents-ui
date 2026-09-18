import { lazy } from "react";

export interface PaneRoute {
  match: (path: string) => boolean;
  load: () => Promise<{ default: React.ComponentType<any> }>;
}

export const PANE_ROUTES: PaneRoute[] = [
  { match: (p) => p === "/routes/board", load: () => import("../routes/routes.board") },
  { match: (p) => p === "/will-call", load: () => import("../routes/will-call") },
  { match: (p) => /^\/routes\/[^/]+$/.test(p), load: () => import("../routes/routes.$routeId") },
  { match: (p) => p.startsWith("/routes"), load: () => import("../routes/routes._index") },
  { match: () => true, load: () => import("../routes/launch") },
];

export function resolvePaneRoute(path: string): PaneRoute {
  return PANE_ROUTES.find((r) => r.match(path)) ?? PANE_ROUTES[PANE_ROUTES.length - 1];
}
export function lazyPaneComponent(path: string) {
  return lazy(() => resolvePaneRoute(path).load());
}
