import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuoteSummary {
  id: string;
  quote_number?: string;
  customer_name?: string;
  status?: string;
  total_cents?: number;
  created_at?: string;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "Quotes — Gable Quotes" }];
}

export default function QuotesIndex() {
  const { data: quotes, isLoading, error } = useActionQuery<QuoteSummary[]>("list-quotes", {
    limit: 50,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Quotes</CardTitle>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${quotes?.length ?? 0} shown`}
          </span>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load quotes: {String(error)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Quote</th>
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {(quotes ?? []).map((q) => (
                  <tr key={q.id} className="hover:bg-muted/50 border-b last:border-0">
                    <td className="py-2 pr-4">
                      <Link to={`/quotes/${q.id}`} className="text-primary font-medium hover:underline">
                        {q.quote_number ?? q.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{q.customer_name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{q.status ?? "draft"}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(q.total_cents)}</td>
                    <td className="py-2 text-muted-foreground">
                      {q.created_at ? new Date(q.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {!isLoading && (quotes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground py-8 text-center">
                      No quotes yet — ask the agent to draft one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
