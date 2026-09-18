import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useScreenTracking } from "@/lib/screen-tracking";

interface IntegrationOrderLine {
  product_id?: string;
  sku?: string;
  quantity?: number;
  weight_lbs?: number;
  [key: string]: unknown;
}

interface IntegrationOrder {
  id: string;
  status?: string;
  branch_id?: string;
  customer_name?: string;
  address?: string;
  scheduled_date?: string;
  delivery_method?: string;
  lines?: IntegrationOrderLine[];
  [key: string]: unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function townFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

/**
 * Will-call is only knowable when the order wire carries a delivery method —
 * gable's integration orders don't ship one today, so the badge appears when
 * the field exists and is never guessed otherwise.
 */
function willCallOf(o: IntegrationOrder): boolean | undefined {
  if (typeof o.delivery_method !== "string" || !o.delivery_method) return undefined;
  return o.delivery_method.toUpperCase() === "PICKUP";
}

export function meta() {
  return [{ title: "Will-call — Gable Dispatch" }];
}

export default function WillCallRoute() {
  useScreenTracking("will-call");
  const { send, isGenerating } = useSendToAgentChat();
  const [date, setDate] = useState(today());
  const dateValid = DATE_RE.test(date);

  const {
    data: orders,
    isLoading,
    error,
  } = useActionQuery<IntegrationOrder[]>("list-orders-for-date", { date }, { enabled: dateValid });

  const rows = orders ?? [];
  const derivable = rows.some((o) => willCallOf(o) !== undefined);
  const tickets = derivable ? rows.filter((o) => willCallOf(o) === true) : rows;

  const markReady = (o: IntegrationOrder) => {
    send({
      message: `Mark the pick for order ${o.id} (${o.customer_name ?? "unknown customer"}) ready and notify sales that the customer can pick up at the counter.`,
      submit: true,
    });
    toast.info("Handed to the agent — it will mark the pick ready and notify sales.");
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Will-call / pick coordination</h1>
          <p className="text-muted-foreground text-sm">
            Pick tickets for counter pickups. Ready notifies sales through the agent.
          </p>
        </div>
        {isGenerating && <Badge>agent working…</Badge>}
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="will-call-date" className="text-muted-foreground text-xs">
            Date
          </label>
          <Input
            id="will-call-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
        <span className="text-muted-foreground text-sm">
          {isLoading ? "Loading…" : `${tickets.length} pick ticket${tickets.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {!derivable && !isLoading && rows.length > 0 && (
        <p className="text-muted-foreground text-sm">
          Gable's order wire carries no will-call flag today, so every order for the date is
          shown — the will-call badge appears per ticket as soon as the wire carries a
          delivery method.
        </p>
      )}

      {error && <p className="text-destructive text-sm">Failed to load orders: {String(error)}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {tickets.map((o) => {
          const willCall = willCallOf(o);
          const lines = o.lines ?? [];
          return (
            <Card key={o.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">
                  {o.customer_name ?? o.id.slice(0, 8)}
                </CardTitle>
                <div className="flex gap-1">
                  {willCall === true && <Badge variant="secondary">will-call</Badge>}
                  {o.status && <Badge variant="outline">{o.status}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {townFromAddress(o.address) ?? "—"} · {lines.length} line
                  {lines.length === 1 ? "" : "s"}
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={`${l.product_id ?? i}`} className="border-b last:border-0">
                        <td className="py-1 pr-2">{l.sku ?? l.product_id?.slice(0, 8) ?? "—"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{l.quantity ?? "—"}</td>
                        <td className="text-muted-foreground py-1 text-right text-xs">
                          {l.weight_lbs ? `${l.weight_lbs} lb/unit` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button
                  className="w-full"
                  size="sm"
                  disabled={isGenerating}
                  onClick={() => markReady(o)}
                >
                  Ready — notify sales
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {dateValid && !isLoading && tickets.length === 0 && !error && (
        <p className="text-muted-foreground py-8 text-center text-sm">
          {derivable ? `No will-call orders for ${date}.` : `No orders for ${date}.`}
        </p>
      )}
    </div>
  );
}
