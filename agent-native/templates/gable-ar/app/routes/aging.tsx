import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { openArtifact } from "@/lib/artifact";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";

interface InvoiceSummary {
  id: string;
  customer_id?: string;
  customer_name?: string;
  status?: string;
  total_amount?: number;
  due_date?: string;
  created_at?: string;
}

interface OrderSummary {
  id: string;
  customer_id?: string;
  customer_name?: string;
  status?: string;
  total_amount?: number;
  created_at?: string;
}

interface AccountSummary {
  customer_id: string;
  balance_due?: number;
  credit_limit?: number;
  available_credit?: number;
}

interface CustomerTransaction {
  id: string;
  type?: string;
  amount?: number;
  balance_after?: number;
  description?: string;
  created_at?: string;
}

const BUCKET_LABELS = ["Current", "1–30", "31–60", "61–90", "90+"] as const;
const OPEN_ORDER_STATUSES = new Set(["DRAFT", "CONFIRMED", "ON_HOLD"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function bucketIndex(inv: InvoiceSummary, now: number): number {
  const due = inv.due_date ?? inv.created_at;
  if (!due) return 0;
  const daysPastDue = Math.floor((now - new Date(due).getTime()) / DAY_MS);
  if (daysPastDue <= 0) return 0;
  if (daysPastDue <= 30) return 1;
  if (daysPastDue <= 60) return 2;
  if (daysPastDue <= 90) return 3;
  return 4;
}

interface CustomerAging {
  customerId: string;
  name: string;
  buckets: [number, number, number, number, number];
  total: number;
  invoiceCount: number;
  openOrders: number;
}

export function meta() {
  return [{ title: "Aging — Gable AR" }];
}

export default function AgingRoute() {
  useScreenTracking("aging");
  const { send, isGenerating } = useSendToAgentChat();
  const [driverText, setDriverText] = useState("");
  const driverRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  // Voice transcript → driver bar (type to override).
  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const { data: invoices, isLoading, error } = useActionQuery<InvoiceSummary[]>(
    "list-invoices",
    { limit: 200 },
  );
  const { data: orders } = useActionQuery<OrderSummary[]>("list-orders", { limit: 200 });

  const customers = useMemo<CustomerAging[]>(() => {
    const now = Date.now();
    const open = (invoices ?? []).filter(
      (i) => i.status === "UNPAID" || i.status === "PARTIAL" || i.status === "OVERDUE",
    );
    const byCustomer = new Map<string, CustomerAging>();
    for (const inv of open) {
      const customerId = inv.customer_id ?? inv.id;
      let row = byCustomer.get(customerId);
      if (!row) {
        row = {
          customerId,
          name: inv.customer_name ?? customerId.slice(0, 8),
          buckets: [0, 0, 0, 0, 0],
          total: 0,
          invoiceCount: 0,
          openOrders: 0,
        };
        byCustomer.set(customerId, row);
      }
      const amount = inv.total_amount ?? 0;
      row.buckets[bucketIndex(inv, now)] += amount;
      row.total += amount;
      row.invoiceCount++;
    }
    for (const o of orders ?? []) {
      if (!o.customer_id || !OPEN_ORDER_STATUSES.has(o.status ?? "")) continue;
      const row = byCustomer.get(o.customer_id);
      if (row) row.openOrders++;
    }
    return [...byCustomer.values()].sort((a, b) => b.total - a.total);
  }, [invoices, orders]);

  const bucketTotals = useMemo(() => {
    const totals = [0, 0, 0, 0, 0];
    for (const c of customers) {
      for (let i = 0; i < 5; i++) totals[i] += c.buckets[i];
    }
    return totals;
  }, [customers]);

  const drive = (message: string) => {
    send({ message, submit: true });
    toast.info("Sent to the agent.");
  };

  const submitDriver = () => {
    const v = driverText.trim();
    if (!v) return;
    drive(v);
    setDriverText("");
    voice.reset();
  };

  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    {
      key: "m",
      ctrl: true,
      action: () => voice.toggle(),
      allowInInputs: true,
      description: "Toggle voice input",
    },
    {
      key: "Enter",
      ctrl: true,
      allowInInputs: true,
      action: () => {
        if (document.activeElement === driverRef.current) submitDriver();
      },
      description: "Send driver",
    },
    { key: "Escape", action: () => (document.activeElement as HTMLElement | null)?.blur?.(), description: "Blur" },
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Aging workdown</h1>
          <p className="text-muted-foreground text-sm">
            Open AR by days past due. Click a customer to open their ledger in the pane;
            the agent reads any account aloud and drafts the dunning.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Open receivables</CardTitle>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${customers.length} customer(s) with open AR`}
          </span>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load invoices: {String(error)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  {BUCKET_LABELS.map((b) => (
                    <th key={b} className="py-2 pr-4 font-medium text-right">
                      {b}
                    </th>
                  ))}
                  <th className="py-2 pr-4 font-medium text-right">Open balance</th>
                  <th className="py-2 pr-4 font-medium">Last payment</th>
                  <th className="py-2 pr-4 font-medium text-right">Open orders</th>
                  <th className="py-2 pr-4 font-medium">Credit</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <CustomerAgingRow
                    key={c.customerId}
                    row={c}
                    onOpenLedger={() =>
                      openArtifact(`/accounts/${c.customerId}`, `${c.name} — AR ledger`)
                    }
                    onDraft={() =>
                      drive(
                        `Draft a statement + dunning note for ${c.name} (customer ${c.customerId}): read their AR ledger with customer-transactions and their credit standing with account-summary, cite invoice numbers and amounts from list-invoices, and draft the note as editable text in chat. Don't send anything.`,
                      )
                    }
                  />
                ))}
                {!isLoading && customers.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-muted-foreground py-8 text-center">
                      No open receivables — nothing to work down.
                    </td>
                  </tr>
                )}
              </tbody>
              {customers.length > 0 && (
                <tfoot>
                  <tr className="border-t">
                    <td className="py-3 font-medium">Totals</td>
                    {bucketTotals.map((t, i) => (
                      <td key={i} className="py-3 pr-4 text-right font-semibold tabular-nums">
                        {money(t)}
                      </td>
                    ))}
                    <td className="py-3 pr-4 text-right font-semibold tabular-nums">
                      {money(bucketTotals.reduce((s, t) => s + t, 0))}
                    </td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          <p className="text-muted-foreground mt-2 text-xs">
            Buckets age on the invoice due date; the open-balance column sums open-invoice
            totals (PARTIAL invoices show their full total — the ledger has the exact
            remaining balance).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent driver</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitDriver();
            }}
          >
            <Input
              name="driver"
              ref={driverRef}
              value={driverText}
              onChange={(e) => setDriverText(e.target.value)}
              placeholder='Type or speak: "who should I call first?" or "read Kelbrook&#39;s ledger aloud"'
            />
            {voice.supported && (
              <Button
                type="button"
                variant={voice.listening ? "destructive" : "outline"}
                size="icon"
                onClick={voice.toggle}
                title={voice.listening ? "Stop listening (Ctrl+M)" : "Speak (Ctrl+M)"}
                aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-4"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                </svg>
              </Button>
            )}
            <Button type="submit" disabled={isGenerating}>
              {isGenerating ? "Working…" : "Drive"}
            </Button>
          </form>
          {voice.listening && (
            <p className="text-muted-foreground animate-pulse text-xs">
              Listening… speak the work.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                drive(
                  "Who should I call first? Rank the customers on this aging screen by 90+ and 61–90 exposure, read their ledgers with customer-transactions, and give me a call list with one line of context each.",
                )
              }
            >
              Who should I call first?
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                drive(
                  "Draft statements + dunning notes for every customer with a 60+ day balance on this screen — editable text in chat, one per customer. Don't send anything.",
                )
              }
            >
              Draft dunning for 60+
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Dunning and statements are always drafts until you send them. Promise-to-pay
            notes live on the account — ask the agent to pin one after a call.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CustomerAgingRow({
  row,
  onOpenLedger,
  onDraft,
}: {
  row: CustomerAging;
  onOpenLedger: () => void;
  onDraft: () => void;
}) {
  const { data: summary } = useActionQuery<AccountSummary>("account-summary", {
    customerId: row.customerId,
  });
  const { data: txns } = useActionQuery<CustomerTransaction[]>("customer-transactions", {
    customerId: row.customerId,
  });

  const lastPayment = useMemo(() => {
    const dates = (txns ?? [])
      .filter((t) => t.type === "PAYMENT" && t.created_at)
      .map((t) => t.created_at as string)
      .sort();
    return dates.length > 0 ? dates[dates.length - 1] : null;
  }, [txns]);

  const limit = summary?.credit_limit ?? 0;
  const balance = summary?.balance_due ?? row.total;
  const pct = limit > 0 ? Math.round((balance / limit) * 100) : 0;
  const over = limit > 0 && balance > limit;

  return (
    <tr className="hover:bg-muted/50 border-b last:border-0">
      <td className="py-2 pr-4">
        <button
          type="button"
          className="text-primary font-medium hover:underline"
          onClick={onOpenLedger}
        >
          {row.name}
        </button>
        <div className="text-muted-foreground text-xs">
          {row.invoiceCount} open invoice{row.invoiceCount === 1 ? "" : "s"}
        </div>
      </td>
      {row.buckets.map((b, i) => (
        <td
          key={i}
          className={`py-2 pr-4 text-right tabular-nums ${i >= 3 && b > 0 ? "text-destructive font-medium" : ""}`}
        >
          {b > 0 ? money(b) : "—"}
        </td>
      ))}
      <td className="py-2 pr-4 text-right font-medium tabular-nums">{money(row.total)}</td>
      <td className="py-2 pr-4 text-muted-foreground">
        {lastPayment ? new Date(lastPayment).toLocaleDateString() : "—"}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{row.openOrders || "—"}</td>
      <td className="py-2 pr-4">
        {limit > 0 ? (
          <div className="w-28">
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className={`h-full ${over ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <div className={`text-[11px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
              {over ? `${money(balance - limit)} over` : `${pct}% of limit`}
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">no limit</span>
        )}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        <Button variant="ghost" size="sm" onClick={onDraft}>
          Statement + dunning
        </Button>
      </td>
    </tr>
  );
}
