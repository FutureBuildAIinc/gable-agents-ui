import { lazy } from "react";

export interface PaneRoute {
  match: (path: string) => boolean;
  load: () => Promise<{ default: React.ComponentType<any> }>;
}

export const PANE_ROUTES: PaneRoute[] = [
  { match: (p) => /^\/products\/[^/]+$/.test(p), load: () => import("../routes/products.$productId") },
  { match: (p) => p.startsWith("/inventory"), load: () => import("../routes/inventory._index") },
  { match: () => true, load: () => import("../routes/launch") },
];

export function resolvePaneRoute(path: string): PaneRoute {
  return PANE_ROUTES.find((r) => r.match(path)) ?? PANE_ROUTES[PANE_ROUTES.length - 1];
}
export function lazyPaneComponent(path: string) {
  return lazy(() => resolvePaneRoute(path).load());
}
