import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { computeVariance, useCountDraft, type CountRow, type ReasonCode } from "@/lib/count-draft";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";

interface LocationLite {
  id: string;
  name?: string;
}

interface IntegrationProduct {
  id: string;
  sku?: string;
  name?: string;
  uom?: string;
}

interface InventoryRow {
  id: string;
  product_id?: string;
  location_id?: string | null;
  location?: string;
  quantity?: number;
  allocated?: number;
}

const REASON_CODES: { code: ReasonCode; label: string }[] = [
  { code: "damage", label: "Damage" },
  { code: "mispick", label: "Mis-pick" },
  { code: "receiving", label: "Receiving" },
  { code: "shrink", label: "Shrink" },
  { code: "other", label: "Other" },
];

function fmtQty(n?: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function meta() {
  return [{ title: "Count Sheet — Gable Inventory" }];
}

/**
 * I2 — Blind cycle count. The grid hides gable's on-hand while `blindMode`
 * is on so the counter writes down what they actually see. The agent driver
 * bar can load the rows, narrate variances, and draft the adjust-stock calls;
 * posting is always human-confirmed.
 */
export default function CountRoute() {
  useScreenTracking("inventory-count");
  const { draft, mutate } = useCountDraft();
  const { send, isGenerating } = useSendToAgentChat();
  const [driverText, setDriverText] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [posting, setPosting] = useState(false);
  const driverRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();

  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const { data: locations } = useActionQuery<LocationLite[]>("list-locations", {});
  const { data: productMatches, isFetching: searchingProducts } =
    useActionQuery<IntegrationProduct[]>(
      "list-products",
      { q: productSearch, limit: 6 },
      { enabled: productSearch.trim().length >= 2 },
    );

  const adjust = useActionMutation("adjust-stock", {
    onError: (e) => toast.error(`Adjust failed: ${String(e)}`),
  });
  // Imperative lookup used when the human adds a row by hand — the agent does
  // the same fetch via its own tool calls.
  const lookupInventory = useActionMutation<InventoryRow[], { productId: string }>(
    "list-inventory",
    { skipActionQueryInvalidation: true },
  );

  const blind = draft.blindMode !== false;
  const counted = draft.rows.filter((r) => r.status !== "uncounted").length;
  const variances = useMemo(
    () =>
      draft.rows
        .map((r, i) => ({ row: r, index: i, variance: computeVariance(r) }))
        .filter((v) => v.variance !== undefined && v.variance !== 0),
    [draft.rows],
  );
  const reviewedCount = variances.filter((v) => v.row.reasonCode).length;

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

  const setCounted = (index: number, qty: number | undefined) => {
    void mutate((d) => {
      const rows = [...d.rows];
      const target = rows[index];
      if (!target) return d;
      const next: CountRow = { ...target };
      if (qty === undefined || !Number.isFinite(qty)) {
        delete next.counted;
        delete next.variance;
        next.status = "uncounted";
      } else {
        next.counted = qty;
        next.variance = computeVariance({ ...next, counted: qty });
        next.status = "counted";
      }
      rows[index] = next;
      return { ...d, rows };
    });
  };

  const setReason = (index: number, code: ReasonCode) => {
    void mutate((d) => {
      const rows = [...d.rows];
      const target = rows[index];
      if (!target) return d;
      rows[index] = { ...target, reasonCode: code, status: "reviewed" };
      return { ...d, rows };
    });
  };

  const reveal = () => {
    if (blind && counted === 0) {
      toast.error("Enter at least one count before revealing");
      return;
    }
    void mutate((d) => ({ ...d, blindMode: !blind }));
  };

  const addProduct = async (p: IntegrationProduct) => {
    // Look up gable's stock for this product at the selected location so the
    // row's onHand is real, not guessed.
    const rows = await lookupInventory
      .mutateAsync({ productId: p.id })
      .catch(() => [] as InventoryRow[]);
    const atLocation = (Array.isArray(rows) ? rows : []).find(
      (r) => r.location_id === (draft.locationId ?? null),
    );
    void mutate((d) => ({
      ...d,
      rows: [
        ...d.rows,
        {
          productId: p.id,
          sku: p.sku,
          name: p.name,
          uom: p.uom,
          onHand: atLocation?.quantity ?? null,
          status: "uncounted",
        },
      ],
    }));
    setProductSearch("");
  };

  const proposeAdjustments = () => {
    if (variances.length === 0) return toast.error("No variances to adjust");
    const lines = variances
      .map(({ row, index, variance }) => {
        const uom = row.uom ? ` ${row.uom}` : "";
        const reason = row.reasonCode ?? "(no reason code yet)";
        return `- row ${index + 1}: ${row.sku ?? row.productId.slice(0, 8)} — counted ${fmtQty(row.counted)}${uom}, on-hand ${fmtQty(row.onHand)}${uom}, variance ${variance && variance > 0 ? "+" : ""}${fmtQty(variance)}${uom} (${reason})`;
      })
      .join("\n");
    drive(
      `Draft the adjust-stock calls for these cycle-count variances at location ${draft.locationId ?? "(unset)"}. Use isDelta=true with the signed variance, and reason "cycle count <today's date> — <reasonCode>". Do NOT post yet — list the calls as a table for me to confirm.\n${lines}`,
    );
  };

  const postAdjustments = async () => {
    if (variances.length === 0) return toast.error("No variances to post");
    const unreviewed = variances.filter((v) => !v.row.reasonCode);
    if (unreviewed.length > 0) {
      toast.error(`${unreviewed.length} variance(s) still need a reason code`);
      return;
    }
    if (!draft.locationId) {
      toast.error("Pick a location first");
      return;
    }
    const confirmed = window.confirm(
      `Post ${variances.length} adjustment(s) to gable at this location? Each will call adjust-stock with the signed variance and the reason code you picked.`,
    );
    if (!confirmed) return;
    setPosting(true);
    try {
      for (const { row, variance } of variances) {
        if (variance === undefined || variance === 0) continue;
        const reason = `cycle count ${new Date().toISOString().slice(0, 10)} — ${row.reasonCode}`;
        await adjust.mutateAsync({
          productId: row.productId,
          locationId: draft.locationId,
          quantity: variance,
          isDelta: true,
          reason,
        });
      }
      toast.success(`Posted ${variances.length} adjustment(s) to gable`);
    } catch (e) {
      toast.error(`Batch failed part-way: ${String(e)}`);
    } finally {
      setPosting(false);
    }
  };

  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    { key: "m", ctrl: true, action: () => voice.toggle(), allowInInputs: true, description: "Toggle voice" },
    { key: "r", ctrl: true, action: reveal, allowInInputs: true, description: "Reveal / hide on-hand" },
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
          <h1 className="text-xl font-semibold">Cycle count sheet</h1>
          <p className="text-muted-foreground text-sm">
            Blind counts: the on-hand column stays hidden until you reveal it. Enter what you
            see; the agent narrates variances and drafts the adjustments for you to post.
          </p>
        </div>
        <div className="flex gap-2">
          {isGenerating && <Badge>agent driving…</Badge>}
          <Badge variant={blind ? "default" : "secondary"}>{blind ? "Blind" : "Revealed"}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Where are you counting?</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Label htmlFor="location">Location</Label>
            <select
              id="location"
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              value={draft.locationId ?? ""}
              onChange={(e) => {
                const loc = (locations ?? []).find((l) => l.id === e.target.value);
                void mutate((d) => ({
                  ...d,
                  locationId: e.target.value || null,
                  locationLabel: loc?.name,
                }));
              }}
            >
              <option value="">Select location…</option>
              {(locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name ?? l.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <Label htmlFor="bin">Bin / aisle (optional)</Label>
            <Input
              id="bin"
              value={draft.bin ?? ""}
              onChange={(e) => void mutate((d) => ({ ...d, bin: e.target.value || null }))}
              placeholder="A3, rack 12…"
            />
          </div>
          <Button
            variant="outline"
            onClick={() =>
              draft.locationId
                ? drive(
                    `Load the count sheet for location ${draft.locationLabel ?? draft.locationId}${draft.bin ? ` bin ${draft.bin}` : ""}: pick a sensible cycle-count sample (10-20 SKUs that live here), call list-inventory for each to get the on-hand at this location, and call count-set-draft.loadProducts with the rows. Keep blindMode on — do not speak the on-hand values.`,
                  )
                : toast.error("Pick a location first")
            }
          >
            Ask agent to load rows
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Count grid</CardTitle>
          <span className="text-muted-foreground text-sm">
            {counted} / {draft.rows.length} counted
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Label htmlFor="add">Add product</Label>
              <Input
                id="add"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Search by name or SKU…"
              />
              {productSearch.trim().length >= 2 && (
                <div className="border-input mt-1 overflow-hidden rounded-md border">
                  {(productMatches ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="hover:bg-muted/50 flex w-full items-center justify-between px-3 py-2 text-left text-sm"
                      onClick={() => void addProduct(p)}
                    >
                      <span>
                        {p.name}
                        {p.sku && <span className="text-muted-foreground ml-2 text-xs">{p.sku}</span>}
                      </span>
                      <Badge variant="outline">{p.uom ?? "—"}</Badge>
                    </button>
                  ))}
                  {!searchingProducts && (productMatches ?? []).length === 0 && (
                    <p className="text-muted-foreground px-3 py-2 text-xs">No matches.</p>
                  )}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={reveal}>
              {blind ? "Reveal on-hand" : "Hide on-hand"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void mutate((d) => ({ ...d, rows: [] }))}
              disabled={draft.rows.length === 0}
            >
              Clear rows
            </Button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">SKU</th>
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">UOM</th>
                {!blind && <th className="py-2 pr-3 text-right font-medium">On hand</th>}
                <th className="py-2 pr-3 text-right font-medium">Counted</th>
                <th className="py-2 pr-3 text-right font-medium">Variance</th>
                <th className="py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((row, i) => {
                const variance = computeVariance(row);
                const hasVariance = variance !== undefined && variance !== 0;
                return (
                  <tr key={`${row.productId}-${i}`} className="border-b last:border-0">
                    <td className="text-muted-foreground py-2 pr-3 text-xs">{i + 1}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{row.sku ?? row.productId.slice(0, 8)}</td>
                    <td className="max-w-64 truncate py-2 pr-3">{row.name ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{row.uom ?? "—"}</Badge>
                    </td>
                    {!blind && (
                      <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(row.onHand)}</td>
                    )}
                    <td className="py-2 pr-3 text-right">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        className="ml-auto h-8 w-24 text-right tabular-nums"
                        value={row.counted === undefined ? "" : String(row.counted)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCounted(i, v === "" ? undefined : Number(v));
                        }}
                        aria-label={`Counted quantity for row ${i + 1}`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {variance === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : variance === 0 ? (
                        <Badge variant="secondary">0</Badge>
                      ) : (
                        <Badge variant={variance > 0 ? "default" : "destructive"}>
                          {variance > 0 ? "+" : ""}
                          {fmtQty(variance)}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2">
                      {hasVariance ? (
                        <div className="flex flex-wrap gap-1">
                          {REASON_CODES.map(({ code, label }) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => setReason(i, code)}
                              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                                row.reasonCode === code
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input hover:bg-muted/50"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {draft.rows.length === 0 && (
                <tr>
                  <td colSpan={blind ? 7 : 8} className="text-muted-foreground py-8 text-center">
                    No rows yet. Pick a location, then ask the agent to load a sample — or add
                    products by hand.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p className="text-muted-foreground text-xs">
            Double-entry helper: an adjustment is a signed delta against one location — gable
            never lets stock go negative, and the reason you pick becomes the audit note.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Variance review</CardTitle>
          <span className="text-muted-foreground text-sm">
            {variances.length} variance(s), {reviewedCount} reasoned
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          {variances.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {counted === 0
                ? "Enter some counts to see variances here."
                : "Everything counted matches the book — nothing to adjust."}
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {variances.map(({ row, index, variance }) => (
                <li key={`${row.productId}-${index}`} className="flex flex-wrap items-center gap-2">
                  <Badge variant={variance && variance > 0 ? "default" : "destructive"}>
                    {variance && variance > 0 ? "+" : ""}
                    {fmtQty(variance)} {row.uom ?? ""}
                  </Badge>
                  <span className="font-mono text-xs">{row.sku ?? row.productId.slice(0, 8)}</span>
                  <span className="text-muted-foreground text-xs">
                    counted {fmtQty(row.counted)} / on-hand {blind ? "?" : fmtQty(row.onHand)}
                  </span>
                  {row.reasonCode && <Badge variant="secondary">{row.reasonCode}</Badge>}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={proposeAdjustments}
              disabled={variances.length === 0}
            >
              Propose adjustments (agent drafts)
            </Button>
            <Button
              size="sm"
              onClick={() => void postAdjustments()}
              disabled={posting || variances.length === 0 || reviewedCount < variances.length}
              title={
                reviewedCount < variances.length
                  ? "Every variance needs a reason code first"
                  : undefined
              }
            >
              {posting ? "Posting…" : "Post adjustments"}
            </Button>
          </div>
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
              placeholder='"load a sample from the north yard", "row 3 counted 42", "tag row 5 as receiving damage", "why is row 7 off?"'
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
            While blindMode is on, the agent is bound by the same blind rule — it will not
            read out the on-hand column. Reveal when you're done.
          </p>
          <div className="border-border text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px]">
            {[
              ["/", "driver"],
              ["Ctrl+M", "voice"],
              ["Ctrl+R", "reveal / hide"],
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
