import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { openArtifact } from "@/lib/artifact";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";

interface OrderSummary {
  id: string;
  customer_id?: string;
  customer_name?: string;
  status?: string;
  total_amount?: number;
  created_at?: string;
  salesperson_name?: string;
}

interface AccountSummary {
  customer_id: string;
  balance_due?: number;
  credit_limit?: number;
  available_credit?: number;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "Credit Holds — Gable AR" }];
}

export default function CreditHoldsRoute() {
  useScreenTracking("credit-holds");
  const { send, isGenerating } = useSendToAgentChat();
  const [driverText, setDriverText] = useState("");
  const driverRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  // Voice transcript → driver bar (type to override).
  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const { data: orders, isLoading, error } = useActionQuery<OrderSummary[]>("list-orders", {
    limit: 200,
  });

  // Gable's order list has no status filter — the ON_HOLD queue is filtered here.
  const held = (orders ?? []).filter((o) => o.status === "ON_HOLD");

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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Credit holds</h1>
          <p className="text-muted-foreground text-sm">
            Orders parked ON_HOLD over customer credit. Release itself is owner-only —
            this queue drafts the request with the account context attached.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      {error ? (
        <p className="text-destructive text-sm">Failed to load orders: {String(error)}</p>
      ) : isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : held.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No orders on credit hold — the sales floor is clear.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {held.map((o) => (
            <HeldOrderCard key={o.id} order={o} onRequestRelease={(msg) => drive(msg)} />
          ))}
        </div>
      )}

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
              placeholder='Type or speak: "summarize the hold queue" or "call script for the Kelbrook hold"'
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
                  "Summarize the credit-holds queue: for each ON_HOLD order pull the account standing (account-summary + customer-transactions) and give me one line per hold — who, how far over, how they pay.",
                )
              }
            >
              Summarize the queue
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Release is an owner decision — the agent drafts the request and the account
            context; it never releases or confirms an order itself.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function HeldOrderCard({
  order,
  onRequestRelease,
}: {
  order: OrderSummary;
  onRequestRelease: (message: string) => void;
}) {
  const { data: summary } = useActionQuery<AccountSummary>(
    "account-summary",
    { customerId: order.customer_id ?? "" },
    // Skip the credit lookup when the order has no customer id.
    { enabled: Boolean(order.customer_id) },
  );
  const { data: classic } = useActionQuery<{ url: string }>("classic-link", {
    entity: "order",
    id: order.id,
  });

  const limit = summary?.credit_limit ?? 0;
  const balance = summary?.balance_due ?? 0;
  const overBy = limit > 0 ? balance - limit : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">
          {order.customer_name ?? "Unknown customer"}
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            order {order.id.slice(0, 8)} · {money(order.total_amount)}
          </span>
        </CardTitle>
        <Badge variant="destructive">ON_HOLD</Badge>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-muted-foreground space-y-0.5 text-sm">
          <div>
            {order.created_at
              ? `Placed ${new Date(order.created_at).toLocaleDateString()}`
              : "Order date unknown"}
            {order.salesperson_name ? ` · ${order.salesperson_name}` : ""}
          </div>
          {limit > 0 ? (
            overBy > 0 ? (
              <div className="text-destructive">
                Account is {money(overBy)} over its {money(limit)} credit limit
              </div>
            ) : (
              <div>Within credit limit — hold may be payment-history related</div>
            )
          ) : (
            <div>Credit standing unavailable — ask the agent to pull the account</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.customer_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                openArtifact(
                  `/accounts/${order.customer_id}`,
                  `${order.customer_name ?? "Customer"} — AR ledger`,
                )
              }
            >
              AR ledger
            </Button>
          )}
          {classic?.url && (
            <a href={classic.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                Open in classic ERP ↗
              </Button>
            </a>
          )}
          <Button
            size="sm"
            onClick={() =>
              onRequestRelease(
                `Draft a release-for-owner-review request for held order ${order.id} (${order.customer_name ?? "unknown customer"}, ${money(order.total_amount)}): pull the account standing with account-summary and the payment history with customer-transactions, summarize why it's held and the case for release, and draft the request as editable text in chat addressed to the owner. Release itself is owner-only — draft only.`,
              )
            }
          >
            Request release (owner review)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
