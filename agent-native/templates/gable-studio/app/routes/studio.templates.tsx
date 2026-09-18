import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TemplateSummary {
  name: string;
  description: string;
  hasReadme: boolean;
}

export function meta() {
  return [{ title: "Studio — Gable Studio" }];
}

/**
 * Supplementary landing: browse the gable-* templates in the workspace and
 * jump into the chat, which is the main studio surface (the agent lists,
 * reads, customizes, previews, and deploys).
 */
export default function StudioIndex() {
  const {
    data: templates,
    isLoading,
    error,
  } = useActionQuery<TemplateSummary[]>("list-templates", {});

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Template Studio</h1>
          <p className="text-muted-foreground text-sm">
            Customize a gable micro-UI or build a new one — from chat, with
            in-surface previews.
          </p>
        </div>
        <Button asChild>
          <Link to="/home">Open the studio chat</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-destructive text-sm">
          Failed to load templates: {String(error)}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(templates ?? []).map((t) => (
            <Card key={t.name} className="flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <span className="font-mono">{t.name}</span>
                  {t.hasReadme ? (
                    <Badge variant="secondary">README</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                <p className="text-muted-foreground min-h-10 text-sm">
                  {t.description || "No description in package.json."}
                </p>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="self-start"
                >
                  <Link to="/home">Customize in chat →</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
          {!isLoading && (templates ?? []).length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm sm:col-span-2">
              No gable-* templates found — tell the chat agent “new” to start
              one.
            </p>
          )}
          {isLoading && (
            <p className="text-muted-foreground py-8 text-center text-sm sm:col-span-2">
              Loading templates…
            </p>
          )}
        </div>
      )}

      <Card>
        <CardContent className="text-muted-foreground pt-6 text-sm">
          The chat is the studio: the agent reads the template you pick, makes
          small edits, shows you a live preview URL after each meaningful
          change, and registers the result with{" "}
          <span className="font-mono">deploy-template</span> when you are happy.
        </CardContent>
      </Card>
    </div>
  );
}
