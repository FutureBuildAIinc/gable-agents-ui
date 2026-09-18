import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import type { PricedItem } from "../../actions/calculate-price";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";
import { draftTotalCents, useQuoteBuilderDraft, type BuilderLine } from "@/lib/quote-builder";

interface Customer {
  id: string;
  name: string;
  account_number?: string;
}

interface Product {
  id: string;
  sku?: string;
  name: string;
  uom?: string;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "New Quote — Gable Quotes" }];
}

export default function QuoteBuilderRoute() {
  useScreenTracking("quote-builder");
  const navigate = useNavigate();
  const { draft, mutate } = useQuoteBuilderDraft();
  const { send, isGenerating } = useSendToAgentChat();
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState("1");
  const [driverText, setDriverText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const driverRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  // Voice transcript → driver bar (type to override).
  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const { data: customers } = useActionQuery<Customer[]>("list-customers", { limit: 100 });
  const { data: products } = useActionQuery<Product[]>("list-products", { limit: 200 });

  const price = useActionMutation("calculate-price", {
    onError: (e) => toast.error(`Pricing failed: ${String(e)}`),
  });
  const create = useActionMutation("create-quote", {
    onSuccess: (q: { id?: string }) => {
      toast.success("Quote created in gable");
      void mutate((d) => ({ ...d, lines: [], notes: undefined }));
      if (q?.id) navigate(`/quotes/${q.id}`);
    },
    onError: (e) => toast.error(`Create failed: ${String(e)}`),
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter((p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  const total = draftTotalCents(draft);

  const addLine = (p: Product) => {
    const quantity = Math.max(1, Number.parseInt(qty, 10) || 1);
    void mutate((d) => ({
      ...d,
      lines: [
        ...d.lines,
        { productId: p.id, name: p.name, sku: p.sku, quantity, uom: p.uom },
      ],
    }));
    setSearch("");
    setQty("1");
  };

  const priceAll = async () => {
    if (!draft.customer) return toast.error("Pick a customer first");
    if (draft.lines.length === 0) return toast.error("Add at least one line");
    const priced = await price.mutateAsync({
      customerId: draft.customer.id,
      items: draft.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    });
    const rows = (Array.isArray(priced) ? priced : []) as PricedItem[];
    void mutate((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        const hit = rows.find((r) => r.product_id === l.productId);
        return hit
          ? { ...l, unitPriceCents: hit.unit_price, uom: hit.uom ?? l.uom, name: hit.product_name ?? l.name }
          : l;
      }),
    }));
  };

  const submit = async () => {
    if (!draft.customer) return toast.error("Pick a customer first");
    const unpriced = draft.lines.filter((l) => l.unitPriceCents == null);
    if (draft.lines.length === 0) return toast.error("Add at least one line");
    if (unpriced.length > 0) return toast.error("Price the lines first (every line needs a unit price)");
    create.mutate({
      customerId: draft.customer.id,
      lines: draft.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPriceCents,
      })),
    });
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

  // Hotkeys — the voice+keyboard operator's speed layer.
  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    { key: "k", ctrl: true, action: () => searchRef.current?.focus(), description: "Focus product search" },
    {
      key: "m",
      ctrl: true,
      action: () => voice.toggle(),
      allowInInputs: true,
      description: "Toggle voice input",
    },
    {
      key: "p",
      ctrl: true,
      action: () => void priceAll(),
      allowInInputs: true,
      description: "Price lines",
    },
    {
      key: "Enter",
      ctrl: true,
      allowInInputs: true,
      action: () => {
        if (document.activeElement === driverRef.current) submitDriver();
        else void submit();
      },
      description: "Create quote (driver: send)",
    },
    {
      key: "Backspace",
      ctrl: true,
      action: () => void mutate((d) => ({ ...d, lines: [], customer: null, notes: undefined })),
      description: "Clear draft",
    },
    { key: "Escape", action: () => (document.activeElement as HTMLElement | null)?.blur?.(), description: "Blur" },
  ]);

  const onUpload = async (file: File) => {
    const text = await file.text();
    drive(
      `I uploaded a material list (${file.name}). Parse it, match items to products with list-products, and fill the quote builder on this screen with builder-set-draft (reasonable quantities when unspecified). Ask me only if something can't be matched.\n\n---\n${text.slice(0, 8000)}`,
    );
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">New Quote</h1>
          <p className="text-muted-foreground text-sm">
            Drive it yourself, or let the agent: type instructions below, upload a material
            list, or press the buttons — the screen is shared.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <Label htmlFor="customer">Account</Label>
            <select
              id="customer"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={draft.customer?.id ?? ""}
              onChange={(e) => {
                const c = (customers ?? []).find((x) => x.id === e.target.value);
                void mutate((d) => ({ ...d, customer: c ? { id: c.id, name: c.name } : null }));
              }}
            >
              <option value="">Select customer…</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.account_number ? `· ${c.account_number}` : ""}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              draft.customer
                ? drive(`Price the current quote-builder lines for ${draft.customer?.name} and update the screen with the real prices.`)
                : toast.error("Pick a customer first")
            }
          >
            Ask agent to price
          </Button>
          <Button onClick={() => void priceAll()} disabled={price.isPending}>
            {price.isPending ? "Pricing…" : "Price lines"}
          </Button>
          <Button onClick={() => void submit()} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create quote"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-50 flex-1">
              <Label htmlFor="search">Add product</Label>
              <Input
                id="search"
                ref={searchRef}
                placeholder="Search by name or SKU…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {matches.length > 0 && (
                <div className="border-input mt-1 overflow-hidden rounded-md border">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      className="hover:bg-muted/50 flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                      onClick={() => addLine(p)}
                      type="button"
                    >
                      <span>
                        {p.name}
                        {p.sku && <span className="text-muted-foreground ml-2 text-xs">{p.sku}</span>}
                      </span>
                      <Badge variant="outline">{p.uom ?? "—"}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-24">
              <Label htmlFor="qty">Qty</Label>
              <Input id="qty" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 pr-4 font-medium text-right">Qty</th>
                <th className="py-2 pr-4 font-medium">UOM</th>
                <th className="py-2 pr-4 font-medium text-right">Unit</th>
                <th className="py-2 pr-4 font-medium text-right">Total</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {draft.lines.map((l: BuilderLine, i) => (
                <tr key={`${l.productId}-${i}`} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{l.name ?? l.productId.slice(0, 8)}</div>
                    {l.sku && <div className="text-muted-foreground text-xs">{l.sku}</div>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 pr-4">{l.uom ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(l.unitPriceCents)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {money(l.unitPriceCents != null ? l.unitPriceCents * l.quantity : undefined)}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void mutate((d) => {
                        const lines = [...d.lines];
                        lines.splice(i, 1);
                        return { ...d, lines };
                      })}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
              {draft.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-6 text-center">
                    No lines yet — search above, or let the agent fill this from a material list.
                  </td>
                </tr>
              )}
            </tbody>
            {total != null && (
              <tfoot>
                <tr>
                  <td colSpan={4} className="py-3 text-right font-medium">Total</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
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
              placeholder='Type or speak: "build a quote for Kelbrook: 40 sheets 7/16 OSB sheathing and 200 LF of 2x10 SPF"'
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
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Upload material list
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.md,text/plain,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                drive("Review the current quote builder draft on this screen. Suggest improvements: missing lines, quantity sanity, better-suited products. Don't change anything yet.")
              }
            >
              Ask agent to review
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void mutate((d) => ({ ...d, lines: [], customer: null, notes: undefined }))}
            >
              Clear draft
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Driver messages run in your chat thread (the “Other…” button); the agent operates
            this screen via the shared draft — you'll see lines and prices appear here as it works.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground/70">
            {[
              ["/", "driver"],
              ["Ctrl+K", "search"],
              ["Ctrl+M", "voice"],
              ["Ctrl+P", "price"],
              ["Ctrl+Enter", "create / send"],
              ["Ctrl+⌫", "clear"],
              ["Esc", "blur"],
            ].map(([k, label]) => (
              <span key={k}>
                <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">{k}</kbd>{" "}
                {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
