import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InvoiceSummary {
  id: string;
  customer_name?: string;
  status?: string;
  total_amount?: number;
  created_at?: string;
  due_date?: string;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "Invoices — Gable AR" }];
}

export default function InvoicesIndex() {
  const { data: invoices, isLoading, error } = useActionQuery<InvoiceSummary[]>("list-invoices", {
    limit: 50,
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Invoices</CardTitle>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${invoices?.length ?? 0} shown`}
          </span>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load invoices: {String(error)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Invoice</th>
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th>
                  <th className="py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {(invoices ?? []).map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/50 border-b last:border-0">
                    <td className="py-2 pr-4">
                      <Link to={`/invoices/${inv.id}`} className="text-primary font-medium hover:underline">
                        {inv.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{inv.customer_name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{inv.status ?? "UNPAID"}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(inv.total_amount)}</td>
                    <td className="py-2 text-muted-foreground">
                      {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {!isLoading && (invoices ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground py-8 text-center">
                      No invoices yet — ask the agent to pull AR for a branch.
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
