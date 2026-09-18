import { useActionQuery } from "@agent-native/core/client/hooks";
import { useParams } from "react-router";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CustomerTransaction {
  id: string;
  customer_id: string;
  type?: string;
  amount?: number;
  balance_after?: number;
  reference_id?: string;
  description?: string;
  created_at?: string;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "AR Ledger — Gable AR" }];
}

export default function AccountLedgerRoute() {
  const { customerId = "" } = useParams();
  const { data: transactions, isLoading, error } = useActionQuery<CustomerTransaction[]>(
    "customer-transactions",
    { customerId },
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">AR Ledger</CardTitle>
            <p className="text-muted-foreground text-sm">Customer {customerId.slice(0, 8)}</p>
          </div>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${transactions?.length ?? 0} transactions`}
          </span>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load transactions: {String(error)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Description</th>
                  <th className="py-2 pr-4 font-medium text-right">Amount</th>
                  <th className="py-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(transactions ?? []).map((t) => (
                  <tr key={t.id} className="hover:bg-muted/50 border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary">{t.type ?? "—"}</Badge>
                    </td>
                    <td className="py-2 pr-4">{t.description ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {money(t.amount)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(t.balance_after)}</td>
                  </tr>
                ))}
                {!isLoading && (transactions ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground py-8 text-center">
                      No AR transactions for this customer yet.
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
