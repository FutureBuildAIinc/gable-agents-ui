import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";

interface ReorderAlert {
  product_id: string;
  sku?: string;
  description?: string;
  vendor?: string | null;
  reorder_point?: number;
  reorder_qty?: number;
  current_stock?: number;
  deficit?: number;
  // Optional forward-compat fields — only rendered when gable actually sends
  // them. Never fabricated; see HARD RULES in AGENTS.md.
  on_order?: number;
  velocity_30d?: number;
  uom?: string;
}

interface ProductDetail {
  id: string;
  uom_primary?: string;
  [key: string]: unknown;
}

function fmtQty(n?: number): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function meta() {
  return [{ title: "Reorder Review — Gable Inventory" }];
}

/**
 * I3 — Reorder review. Human tweaks suggested quantities, agent explains any
 * line ("why is allocated so high?") via the driver bar, and "Send to
 * purchasing" drafts a PO that the classic desk approves — never posted from
 * this app.
 */
export default function ReorderReviewRoute() {
  useScreenTracking("inventory-reorder");
  const { send, isGenerating } = useSendToAgentChat();
  const [driverText, setDriverText] = useState("");
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, string>>({});
  const driverRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const { data: alerts, isLoading, error } = useActionQuery<ReorderAlert[]>(
    "reorder-alerts",
    {},
  );

  const rows = useMemo(() => alerts ?? [], [alerts]);

  const effectiveQty = (a: ReorderAlert): number => {
    const override = qtyOverrides[a.product_id]?.trim();
    if (override && Number.isFinite(Number(override))) return Number(override);
    return a.reorder_qty ?? 0;
  };

  const drive = (message: string) => {
    send({ message, submit: true });
    toast.info("Sent to the agent — watch this screen as it works.");
  };

  const submitDriver = () => {
    const v = driverText.trim();
    if (!v) return;
    drive(v);
    setDriverText("");
    voice.reset();
  };

  const askWhy = (a: ReorderAlert) => {
    drive(
      `Why is ${a.sku ?? a.product_id.slice(0, 8)} below reorder point? Trace the demand — call get-product for the totals, then look at the orders surface (or list-inventory for allocated) and tell me which open orders are holding the stock. Cite specific numbers.`,
    );
  };

  const sendToPurchasing = () => {
    if (rows.length === 0) return toast.error("Nothing to send");
    const lines = rows
      .map((a) => {
        const qty = effectiveQty(a);
        if (qty <= 0) return null;
        const uom = a.uom ? ` ${a.uom}` : "";
        return `- ${a.sku ?? a.product_id.slice(0, 8)} — ${qty}${uom} (vendor: ${a.vendor ?? "?"}, deficit ${fmtQty(a.deficit)}${uom})`;
      })
      .filter(Boolean)
      .join("\n");
    if (!lines) return toast.error("Every suggested quantity is zero — nothing to send");
    const confirmed = window.confirm(
      `Draft a PO for ${rows.length} SKU(s) and hand it to the agent to surface in chat? The classic desk will approve and post it — this app never posts POs.`,
    );
    if (!confirmed) return;
    drive(
      `Draft a purchase order for the following reorder lines. Format it as a PO note in chat (vendor-grouped, SKU, qty with UOM, current deficit, suggested total) and attach a classic-link to the product detail so the buyer can finish it in the desk UI — PO approval lives there, not here. Do not post anything to gable.\n${lines}`,
    );
  };

  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    { key: "m", ctrl: true, action: () => voice.toggle(), allowInInputs: true, description: "Toggle voice" },
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
          <h1 className="text-xl font-semibold">Reorder review</h1>
          <p className="text-muted-foreground text-sm">
            SKUs below reorder point, with the suggested quantity gable computed. Tweak the
            numbers, ask the agent why a line looks off, then send the draft to purchasing —
            the PO gets approved in the classic desk.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Below reorder point</CardTitle>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${rows.length} SKU(s)`}
          </span>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load alerts: {String(error)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 font-medium">Vendor</th>
                  <th className="py-2 pr-3 text-right font-medium">On hand</th>
                  <th className="py-2 pr-3 text-right font-medium">Reorder pt</th>
                  <th className="py-2 pr-3 text-right font-medium">Deficit</th>
                  <th className="py-2 pr-3 text-right font-medium">Suggested qty</th>
                  <th className="py-2 pr-3 font-medium">UOM</th>
                  <th className="py-2 font-medium text-right">Why?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <ReorderRow
                    key={a.product_id}
                    alert={a}
                    qty={qtyOverrides[a.product_id] ?? ""}
                    onQty={(v) =>
                      setQtyOverrides((s) => ({ ...s, [a.product_id]: v }))
                    }
                    onWhy={() => askWhy(a)}
                  />
                ))}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-muted-foreground py-8 text-center">
                      Nothing below reorder point — stock is healthy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send to purchasing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Drafts a PO grouped by vendor and surfaces it in chat with a classic-link so the
            buyer can finish it in the desk UI. This app never posts POs — approval lives in
            the classic desk per module-flows.
          </p>
          <Button onClick={sendToPurchasing} disabled={rows.length === 0 || isGenerating}>
            Draft PO in chat
          </Button>
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
              ref={driverRef}
              value={driverText}
              onChange={(e) => setDriverText(e.target.value)}
              placeholder='"why is allocated so high on the 2×10 SPF?" or "digest today’s reorder alerts for me"'
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
            <p className="text-muted-foreground animate-pulse text-xs">Listening… speak the work.</p>
          )}
          <p className="text-muted-foreground text-xs">
            The agent reads the same rows you see and traces demand via get-product +
            list-inventory. It never invents on-order or velocity numbers gable doesn't
            expose.
          </p>
          <div className="border-border text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px]">
            {[
              ["/", "driver"],
              ["Ctrl+M", "voice"],
              ["Ctrl+Enter", "send driver"],
              ["Esc", "blur"],
            ].map(([k, label]) => (
              <span key={k}>
                <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">{k}</kbd> {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReorderRow({
  alert,
  qty,
  onQty,
  onWhy,
}: {
  alert: ReorderAlert;
  qty: string;
  onQty: (v: string) => void;
  onWhy: () => void;
}) {
  // Per-row UOM badge: gable's reorder-alerts payload doesn't include UOM, so
  // pull it from the product detail. Cached by React Query across rows.
  const { data: product } = useActionQuery<ProductDetail>("get-product", {
    productId: alert.product_id,
  });
  const uom = alert.uom ?? product?.uom_primary;
  const effective = qty.trim() === "" ? alert.reorder_qty : Number(qty);

  return (
    <tr className="hover:bg-muted/50 border-b last:border-0">
      <td className="py-2 pr-3 font-mono text-xs">{alert.sku ?? alert.product_id.slice(0, 8)}</td>
      <td className="max-w-64 truncate py-2 pr-3">{alert.description ?? "—"}</td>
      <td className="py-2 pr-3">{alert.vendor ?? "—"}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {fmtQty(alert.current_stock)}
        {uom && <span className="text-muted-foreground ml-1 text-xs">{uom}</span>}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(alert.reorder_point)}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        <Badge variant="destructive">−{fmtQty(alert.deficit)}</Badge>
      </td>
      <td className="py-2 pr-3 text-right">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          className={`ml-auto h-8 w-24 text-right tabular-nums ${qty.trim() !== "" && Number(qty) !== alert.reorder_qty ? "border-primary" : ""}`}
          value={qty === "" ? String(alert.reorder_qty ?? "") : qty}
          onChange={(e) => onQty(e.target.value)}
          aria-label={`Suggested qty for ${alert.sku ?? alert.product_id.slice(0, 8)}`}
        />
        {qty.trim() !== "" && Number(qty) !== alert.reorder_qty && (
          <div className="text-muted-foreground mt-0.5 text-right text-[10px]">
            was {fmtQty(alert.reorder_qty)}
          </div>
        )}
        {typeof effective === "number" && effective <= 0 && (
          <div className="text-destructive mt-0.5 text-right text-[10px]">skip</div>
        )}
      </td>
      <td className="py-2 pr-3">
        <Badge variant="outline">{uom ?? "—"}</Badge>
      </td>
      <td className="py-2 text-right">
        <Button variant="ghost" size="sm" onClick={onWhy}>
          Why?
        </Button>
      </td>
    </tr>
  );
}
