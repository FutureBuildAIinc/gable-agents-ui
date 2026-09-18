import { lazy, Suspense } from "react";

/**
 * In-process pane route manifest — the workbench screens rendered inside the
 * artifact pane WITHOUT an iframe (shared React tree, providers, selection).
 * Client components only (no loaders/nested layouts — true of all five today).
 * The detached OS window uses the normal app at ?pane=1 instead (iframe-free
 * is impossible across documents; chromeless mode is that window's chrome).
 */

export interface PaneRoute {
  match: (path: string) => boolean;
  load: () => Promise<{ default: React.ComponentType<any> }>;
}

export const PANE_ROUTES: PaneRoute[] = [
  {
    match: (p) => p === "/quotes/new" || p.startsWith("/quotes/new"),
    load: () => import("../routes/quotes.new"),
  },
  {
    match: (p) => /^\/quotes\/[^/]+$/.test(p),
    load: () => import("../routes/quotes.$quoteId"),
  },
  {
    match: (p) => p === "/quotes" || p.startsWith("/quotes?"),
    load: () => import("../routes/quotes._index"),
  },
  {
    match: (p) => p === "/products" || p.startsWith("/products"),
    load: () => import("../routes/products._index"),
  },
  {
    match: () => true, // launcher fallback
    load: () => import("../routes/launch"),
  },
];

export function resolvePaneRoute(path: string): PaneRoute {
  return PANE_ROUTES.find((r) => r.match(path)) ?? PANE_ROUTES[PANE_ROUTES.length - 1];
}

export function lazyPaneComponent(path: string) {
  return lazy(() => resolvePaneRoute(path).load());
}
