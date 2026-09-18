import { lazy } from "react";

export interface PaneRoute {
  match: (path: string) => boolean;
  load: () => Promise<{ default: React.ComponentType<any> }>;
}

export const PANE_ROUTES: PaneRoute[] = [
  { match: (p) => p.startsWith("/receipts/batch"), load: () => import("../routes/receipts.batch") },
  { match: (p) => p.startsWith("/aging"), load: () => import("../routes/aging") },
  { match: (p) => p.startsWith("/credit-holds"), load: () => import("../routes/credit-holds") },
  { match: (p) => /^\/invoices\/[^/]+$/.test(p), load: () => import("../routes/invoices.$invoiceId") },
  { match: (p) => /^\/accounts\/[^/]+$/.test(p), load: () => import("../routes/accounts.$customerId") },
  { match: (p) => p.startsWith("/invoices"), load: () => import("../routes/invoices._index") },
  { match: () => true, load: () => import("../routes/launch") },
];

export function resolvePaneRoute(path: string): PaneRoute {
  return PANE_ROUTES.find((r) => r.match(path)) ?? PANE_ROUTES[PANE_ROUTES.length - 1];
}
export function lazyPaneComponent(path: string) {
  return lazy(() => resolvePaneRoute(path).load());
}
