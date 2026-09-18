import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Link, useParams } from "react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface InvoiceLine {
  id?: string;
  product_id?: string;
  product_sku?: string;
  product_name?: string;
  quantity?: number;
  price_each?: number;
}

interface InvoiceDetail {
  id: string;
  customer_id?: string;
  customer_name?: string;
  status?: string;
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  total_amount?: number;
  payment_terms?: string;
  due_date?: string;
  paid_at?: string;
  lines?: InvoiceLine[];
}

const PAYMENT_METHODS = ["CASH", "CHECK", "CARD", "ACCOUNT"] as const;

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function lineTotal(l: InvoiceLine): number | undefined {
  if (l.quantity == null || l.price_each == null) return undefined;
  return Math.round(l.quantity * l.price_each);
}

export function meta() {
  return [{ title: "Invoice — Gable AR" }];
}

export default function InvoiceDetailRoute() {
  const { invoiceId = "" } = useParams();
  const { data: invoice, isLoading, error } = useActionQuery<InvoiceDetail>("get-invoice", {
    invoiceId,
  });
  const record = useActionMutation("record-payment", {
    onSuccess: () => toast.success("Payment recorded — posted to the AR ledger in gable."),
    onError: (e) => toast.error(`Payment failed: ${String(e)}`),
  });

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("CHECK");
  const [reference, setReference] = useState("");

  const closed = invoice?.status === "PAID" || invoice?.status === "VOID";

  const submitPayment = () => {
    const cents = Math.round(Number.parseFloat(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }
    if (
      window.confirm(
        `Record ${money(cents)} ${method} payment against this invoice in gable? This posts to the AR ledger.`,
      )
    ) {
      record.mutate({
        invoiceId,
        amountCents: cents,
        method,
        reference: reference.trim() || undefined,
      });
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-destructive text-sm">Failed to load invoice: {String(error)}</p>
        <Link to="/invoices" className="text-primary text-sm hover:underline">← All invoices</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/invoices" className="text-muted-foreground text-sm hover:underline">
            ← All invoices
          </Link>
          <h1 className="text-xl font-semibold">
            Invoice {invoiceId.slice(0, 8)}{" "}
            <Badge variant="secondary" className="ml-2 align-middle">
              {invoice?.status ?? "…"}
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm">
            {invoice?.customer_name ?? invoice?.customer_id ?? ""}
            {invoice?.due_date
              ? ` · due ${new Date(invoice.due_date).toLocaleDateString()}`
              : ""}
            {invoice?.payment_terms ? ` · ${invoice.payment_terms}` : ""}
          </p>
        </div>
        {invoice?.customer_id && (
          <Link
            to={`/accounts/${invoice.customer_id}`}
            className="text-primary text-sm hover:underline"
          >
            AR ledger →
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 pr-4 font-medium text-right">Qty</th>
                <th className="py-2 pr-4 font-medium text-right">Unit</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice?.lines ?? []).map((l, i) => (
                <tr key={l.id ?? i} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{l.product_name ?? l.product_sku ?? l.product_id}</div>
                    {l.product_sku && <div className="text-muted-foreground text-xs">{l.product_sku}</div>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.quantity ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(l.price_each)}</td>
                  <td className="py-2 text-right tabular-nums">{money(lineTotal(l))}</td>
                </tr>
              ))}
              {(invoice?.lines ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground py-6 text-center">
                    {isLoading ? "Loading…" : "No line detail returned for this invoice."}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-1 pt-3 text-right font-medium">Subtotal</td>
                <td className="py-1 pt-3 text-right tabular-nums">{money(invoice?.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="py-1 text-right font-medium">
                  Tax{invoice?.tax_rate != null ? ` (${(invoice.tax_rate * 100).toFixed(2)}%)` : ""}
                </td>
                <td className="py-1 text-right tabular-nums">{money(invoice?.tax_amount)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="py-3 text-right font-medium">Total</td>
                <td className="py-3 text-right font-semibold tabular-nums">
                  {money(invoice?.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record payment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Amount (USD)
              </label>
              <Input
                inputMode="decimal"
                placeholder="1250.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="w-40">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">Method</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={method}
                onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-40 flex-1">
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Reference (check #, optional)
              </label>
              <Input
                placeholder="e.g. #1042"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <Button disabled={isLoading || record.isPending || closed} onClick={submitPayment}>
              {record.isPending ? "Recording…" : "Record payment"}
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            {closed
              ? "This invoice is closed — no further payments can be recorded."
              : "Posts to the customer's AR subledger and updates invoice status (PARTIAL/PAID)."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment history &amp; refunds</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <p>
            {invoice?.paid_at
              ? `Marked paid in gable on ${new Date(invoice.paid_at).toLocaleDateString()}.`
              : "Payment history lives in gable (GET /api/v1/invoices/{id}/payments)."}
          </p>
          <p>
            Ask the agent to pull this invoice's payments or issue a refund (card payments only).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
