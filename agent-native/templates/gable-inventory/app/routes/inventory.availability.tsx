import { useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";

interface IntegrationProduct {
  id: string;
  sku?: string;
  name?: string;
  category?: string;
  uom?: string;
}

interface InventoryRow {
  id: string;
  product_id?: string;
  location_id?: string | null;
  location?: string;
  quantity?: number;
  allocated?: number;
  updated_at?: string;
}

interface LocationLite {
  id: string;
  name?: string;
}

interface ProductDetail {
  id: string;
  sku?: string;
  description?: string;
  uom_primary?: string;
  vendor?: string | null;
  lead_time_days?: number | null;
  [key: string]: unknown;
}

function fmtQty(n?: number): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function meta() {
  return [{ title: "Availability — Gable Inventory" }];
}

/**
 * I1 — Counter availability. Search a product ("2×10×16 SPF") and get the
 * card the counter actually needs: on-hand / allocated / AVAILABLE per
 * location+bin, with the product's UOM attached and a Reserve handoff to the
 * quote flow. The agent driver bar answers the same questions free-form.
 */
export default function AvailabilityRoute() {
  useScreenTracking("inventory-availability");
  const { send, isGenerating } = useSendToAgentChat();
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [driverText, setDriverText] = useState("");
  const [reserveQty, setReserveQty] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const driverRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const { data: matches, isFetching: searching } = useActionQuery<IntegrationProduct[]>(
    "list-products",
    { q: submitted, limit: 6 },
    { enabled: submitted.trim().length >= 2 },
  );
  const { data: locations } = useActionQuery<LocationLite[]>("list-locations", {});

  const locationNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations ?? []) if (l.id) m.set(l.id, l.name ?? l.id.slice(0, 8));
    return m;
  }, [locations]);

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

  const submitSearch = () => {
    const q = search.trim();
    if (q.length < 2) return toast.error("Type at least two characters");
    setSubmitted(q);
  };

  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    { key: "k", ctrl: true, action: () => searchRef.current?.focus(), description: "Focus product search" },
    { key: "m", ctrl: true, action: () => voice.toggle(), allowInInputs: true, description: "Toggle voice" },
    {
      key: "Enter",
      ctrl: true,
      allowInInputs: true,
      action: () => {
        if (document.activeElement === driverRef.current) submitDriver();
        else submitSearch();
      },
      description: "Search / send driver",
    },
    { key: "Escape", action: () => (document.activeElement as HTMLElement | null)?.blur?.(), description: "Blur" },
  ]);

  const reserve = (p: IntegrationProduct) => {
    const qtyRaw = reserveQty[p.id]?.trim();
    const qty = qtyRaw ? Number(qtyRaw) : NaN;
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a positive quantity to reserve");
      return;
    }
    const uom = p.uom ?? "";
    drive(
      `Start a quote for ${qty} ${uom} of ${p.name ?? p.sku ?? p.id} (SKU ${p.sku ?? p.id.slice(0, 8)}, product ${p.id}). Ask me which customer this is for, then drive the quote-builder screen with builder-set-draft. Open the builder so I can watch.`,
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Availability</h1>
          <p className="text-muted-foreground text-sm">
            The counter's #1 question — on-hand vs allocated vs available, by location and bin,
            UOM attached. Search or ask the agent below.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product search</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitSearch();
            }}
          >
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Try "2x10x16 SPF" or "OSB 7/16"…'
            />
            <Button type="submit" disabled={searching}>
              {searching ? "Searching…" : "Search"}
            </Button>
          </form>
          <p className="text-muted-foreground text-xs">
            Cards show every stock row gable knows about. Allocated is what other orders have
            reserved — available = on hand − allocated.
          </p>
        </CardContent>
      </Card>

      {submitted.trim().length >= 2 && (
        <div className="grid gap-4 md:grid-cols-2">
          {(matches ?? []).map((p) => (
            <AvailabilityCard
              key={p.id}
              product={p}
              locationNames={locationNames}
              reserveQty={reserveQty[p.id] ?? ""}
              onReserveQty={(v) => setReserveQty((s) => ({ ...s, [p.id]: v }))}
              onReserve={() => reserve(p)}
            />
          ))}
          {!searching && (matches ?? []).length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="text-muted-foreground py-6 text-center text-sm">
                No products matched “{submitted}”. Try a different SKU or name — or ask the
                agent below.
              </CardContent>
            </Card>
          )}
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
              ref={driverRef}
              value={driverText}
              onChange={(e) => setDriverText(e.target.value)}
              placeholder='"2×10×16 SPF — what’ve we got?" or "what can I ship for 500 BF of cedar decking today?"'
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
            The agent answers availability questions with the same data on these cards — it
            calls list-products → list-inventory and will never fabricate a number.
          </p>
          <div className="border-border text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px]">
            {[
              ["/", "driver"],
              ["Ctrl+K", "search"],
              ["Ctrl+M", "voice"],
              ["Ctrl+Enter", "search / send"],
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

function AvailabilityCard({
  product,
  locationNames,
  reserveQty,
  onReserveQty,
  onReserve,
}: {
  product: IntegrationProduct;
  locationNames: Map<string, string>;
  reserveQty: string;
  onReserveQty: (v: string) => void;
  onReserve: () => void;
}) {
  const { data: detail } = useActionQuery<ProductDetail>("get-product", {
    productId: product.id,
  });
  const {
    data: rows,
    isLoading,
    error,
  } = useActionQuery<InventoryRow[]>("list-inventory", { productId: product.id });

  const uom = detail?.uom_primary ?? product.uom;
  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      onHand: acc.onHand + (r.quantity ?? 0),
      allocated: acc.allocated + (r.allocated ?? 0),
    }),
    { onHand: 0, allocated: 0 },
  );
  const available = totals.onHand - totals.allocated;
  const outOfStock = available <= 0;
  // Only render the lead-time chip when gable exposes the field (the product
  // detail currently doesn't, but a future migration will) — never invent one.
  const leadTimeDays =
    typeof detail?.lead_time_days === "number" ? detail.lead_time_days : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{product.name ?? product.sku ?? product.id.slice(0, 8)}</span>
          {uom && <Badge variant="outline">{uom}</Badge>}
          {outOfStock && leadTimeDays != null && (
            <Badge variant="secondary">Lead time {leadTimeDays}d</Badge>
          )}
          {outOfStock && leadTimeDays == null && <Badge variant="destructive">Out of stock</Badge>}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {product.sku && <span className="font-mono">{product.sku}</span>}
          {product.category && <span className="ml-2">{product.category}</span>}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-muted-foreground text-xs">On hand</div>
            <div className="text-lg font-semibold tabular-nums">
              {fmtQty(totals.onHand)}
              {uom && <span className="text-muted-foreground ml-1 text-xs">{uom}</span>}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Allocated</div>
            <div className="text-lg font-semibold tabular-nums">{fmtQty(totals.allocated)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Available</div>
            <div
              className={`text-lg font-semibold tabular-nums ${outOfStock ? "text-destructive" : ""}`}
            >
              {fmtQty(available)}
            </div>
          </div>
        </div>

        {error ? (
          <p className="text-destructive text-sm">Failed to load stock: {String(error)}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-1 pr-2 font-medium">Location</th>
                <th className="py-1 pr-2 font-medium">Bin</th>
                <th className="py-1 pr-2 text-right font-medium">On hand</th>
                <th className="py-1 pr-2 text-right font-medium">Alloc</th>
                <th className="py-1 text-right font-medium">Avail</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r) => {
                const rowAvailable = (r.quantity ?? 0) - (r.allocated ?? 0);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-1 pr-2 text-xs">
                      {r.location_id
                        ? (locationNames.get(r.location_id) ?? r.location_id.slice(0, 8))
                        : "—"}
                    </td>
                    <td className="text-muted-foreground py-1 pr-2 text-xs">
                      {r.location || "—"}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtQty(r.quantity)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {fmtQty(r.allocated ?? 0)}
                    </td>
                    <td
                      className={`py-1 text-right tabular-nums ${rowAvailable <= 0 ? "text-destructive" : ""}`}
                    >
                      {fmtQty(rowAvailable)}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && (rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground py-4 text-center text-xs">
                    No stock rows recorded for this product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div className="flex items-end gap-2 border-t pt-3">
          <div className="flex-1">
            <Label htmlFor={`qty-${product.id}`} className="text-xs">
              Reserve {uom ? `(${uom})` : ""}
            </Label>
            <Input
              id={`qty-${product.id}`}
              inputMode="decimal"
              value={reserveQty}
              onChange={(e) => onReserveQty(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onReserve} disabled={outOfStock}>
            Reserve → quote
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
