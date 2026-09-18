import { appPath } from "@agent-native/core/client/api-path";
import { Link, useParams } from "react-router";

export function meta() {
  return [{ title: "Preview — Gable Studio" }];
}

/**
 * Thin wrapper around the raw preview served by
 * server/routes/preview/[id].get.ts (nitro routes that path before the SSR
 * catch-all, so the iframe target is the stored HTML itself).
 */
export default function PreviewRoute() {
  const { id = "" } = useParams();
  const rawUrl = appPath(`/preview/${encodeURIComponent(id)}`);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex h-11 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link to="/studio" className="text-muted-foreground hover:underline">
            ← Studio
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate font-medium">Preview {id.slice(0, 8)}</span>
        </div>
        <a
          href={rawUrl}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground shrink-0 text-sm hover:underline"
        >
          Open raw ↗
        </a>
      </div>
      <iframe
        src={rawUrl}
        title={`Preview ${id.slice(0, 8)}`}
        className="h-full w-full flex-1 border-0 bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}
