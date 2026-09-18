import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { ArBatchRow } from "../../actions/receipts-set-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";
import { useArBatchDraft, EMPTY_DRAFT } from "@/lib/ar-batch";

interface Invoice {
  id: string;
  invoice_number?: string;
  customer_id?: string;
  customer_name?: string;
  status?: string;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "Post receipts — Gable AR" }];
}

const METHODS = ["CHECK", "CASH", "CARD", "ACCOUNT"] as const;

export default function ReceiptsBatchRoute() {
  useScreenTracking("ar-batch");
  const { draft, mutate } = useArBatchDraft();
  const { send, isGenerating } = useSendToAgentChat();
  const voice = useVoiceInput();
  const [driverText, setDriverText] = useState("");
  const driverRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [slipText, setSlipText] = useState("");
  const [newRow, setNewRow] = useState({ invoiceId: "", amount: "", method: "CHECK" as string, reference: "" });

  const { data: invoices } = useActionQuery<Invoice[]>("list-invoices", { limit: 200 });

  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const post = useActionMutation("record-payment", {
    onError: (e) => toast.error(`Post failed: ${String(e)}`),
  });

  const openInvoices = useMemo(
    () => (invoices ?? []).filter((i) => (i.status ?? "").toUpperCase() !== "PAID"),
    [invoices],
  );

  const batchTotal = draft.rows
    .filter((r) => r.status !== "posted")
    .reduce((s, r) => s + (r.amountCents || 0), 0);
  const slipTotal = draft.batch.slipTotalCents ?? 0;
  const reconciles = slipTotal > 0 && batchTotal === slipTotal;
  const mappedCount = draft.rows.filter((r) => r.status === "mapped").length;

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

  const setSlip = () => {
    const cents = Math.round(parseFloat(slipText.replace(/[^0-9.]/g, "")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Enter the deposit-slip total (e.g. 12,340.55)");
    void mutate((d) => ({ ...d, batch: { ...d.batch, source: "deposit-slip", slipTotalCents: cents } }));
    toast.success("Slip total set — batch reconciles when they match.");
  };

  const addRow = () => {
    const amount = Math.round(parseFloat(newRow.amount || "0") * 100);
    if (!newRow.invoiceId) return toast.error("Pick an open invoice");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Enter an amount");
    const inv = openInvoices.find((i) => i.id === newRow.invoiceId);
    void mutate((d) => ({
      ...d,
      rows: [
        ...d.rows,
        {
          id: `manual-${Date.now()}`,
          customerId: inv?.customer_id,
          customerName: inv?.customer_name,
          invoiceId: inv?.id,
          invoiceNumber: inv?.invoice_number,
          amountCents: amount,
          method: newRow.method as ArBatchRow["method"],
          reference: newRow.reference || undefined,
          status: "mapped",
        },
      ],
    }));
    setNewRow({ invoiceId: "", amount: "", method: "CHECK", reference: "" });
  };

  const removeRow = (index: number) =>
    void mutate((d) => {
      const rows = [...d.rows];
      rows.splice(index, 1);
      return { ...d, rows };
    });

  const postBatch = async () => {
    const toPost = draft.rows.filter((r) => r.status === "mapped");
    if (toPost.length === 0) return toast.error("Map at least one row first");
    if (!window.confirm(`Post ${toPost.length} payment(s), ${money(batchTotal)} total, to the AR ledger?`)) return;
    for (let i = 0; i < draft.rows.length; i++) {
      const r = draft.rows[i];
      if (r.status !== "mapped" || !r.invoiceId) continue;
      try {
        await post.mutateAsync({
          invoiceId: r.invoiceId,
          amountCents: r.amountCents,
          method: r.method,
          reference: r.reference,
          notes: r.note,
        });
        void mutate((d) => {
          const rows = [...d.rows];
          rows[i] = { ...rows[i], status: "posted" };
          return { ...d, rows };
        });
      } catch (e) {
        void mutate((d) => {
          const rows = [...d.rows];
          rows[i] = { ...rows[i], status: "error", note: String(e) };
          return { ...d, rows };
        });
      }
    }
    toast.success("Batch posted — exceptions are flagged below.");
  };

  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    { key: "m", ctrl: true, action: () => voice.toggle(), allowInInputs: true, description: "Voice" },
    { key: "Enter", ctrl: true, allowInInputs: true, action: () => void postBatch(), description: "Post batch" },
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Post receipts</h1>
          <p className="text-muted-foreground text-sm">
            Morning cash. Type the deposit-slip total, build the batch (or let the agent),
            then post after your confirm.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Deposit slip</CardTitle>
          {slipTotal > 0 && (
            <Badge variant={reconciles ? "default" : "secondary"}>
              {reconciles ? "✓ reconciles" : `batch ${money(batchTotal)} vs slip ${money(slipTotal)}`}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Label htmlFor="slip">Slip total</Label>
            <Input id="slip" placeholder="0.00" value={slipText} onChange={(e) => setSlipText(e.target.value)} />
          </div>
          <Button variant="outline" onClick={setSlip}>Set</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>Upload deposit list</Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.md,text/plain,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const text = await f.text();
                drive(
                  `This is a deposit/remittance list (${f.name}). Map each remittance to an open invoice with list-invoices, fill the receipts batch on this screen with receipts-set-draft (amount in cents, method, reference). Report any you can't match.\n\n---\n${text.slice(0, 8000)}`,
                );
              }
              e.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch ({draft.rows.length} rows · {mappedCount} mapped)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[1fr_120px_120px_160px_auto] items-end gap-2">
            <div>
              <Label>Open invoice</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={newRow.invoiceId}
                onChange={(e) => setNewRow((r) => ({ ...r, invoiceId: e.target.value }))}
              >
                <option value="">Select…</option>
                {openInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.invoice_number ?? i.id.slice(0, 8)} · {i.customer_name ?? ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input inputMode="decimal" placeholder="0.00" value={newRow.amount} onChange={(e) => setNewRow((r) => ({ ...r, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Method</Label>
              <select
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                value={newRow.method}
                onChange={(e) => setNewRow((r) => ({ ...r, method: e.target.value }))}
              >
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <Label>Reference</Label>
              <Input placeholder="check #" value={newRow.reference} onChange={(e) => setNewRow((r) => ({ ...r, reference: e.target.value }))} />
            </div>
            <Button onClick={addRow}>Add</Button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Invoice</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 pr-4 font-medium">Method</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((r, i) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{r.invoiceNumber ?? r.invoiceId?.slice(0, 8) ?? "—"}</td>
                  <td className="py-2 pr-4">{r.customerName ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(r.amountCents)}</td>
                  <td className="py-2 pr-4">{r.method}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={r.status === "posted" ? "default" : r.status === "error" ? "destructive" : "secondary"}>
                      {r.status}
                    </Badge>
                    {r.note && <div className="text-destructive text-xs">{r.note}</div>}
                  </td>
                  <td className="py-2 text-right">
                    {r.status !== "posted" && (
                      <Button variant="ghost" size="sm" onClick={() => removeRow(i)}>Remove</Button>
                    )}
                  </td>
                </tr>
              ))}
              {draft.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-6 text-center">
                    No rows yet — add one, upload a deposit list, or ask the agent.
                  </td>
                </tr>
              )}
            </tbody>
            {draft.rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2} className="py-3 font-medium">Batch total</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{money(batchTotal)}</td>
                  <td colSpan={3} />
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
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submitDriver(); }}>
            <Input
              ref={driverRef}
              value={driverText}
              onChange={(e) => setDriverText(e.target.value)}
              placeholder='Type or speak: "map these three checks to open invoices and post them"'
            />
            {voice.supported && (
              <Button type="button" variant={voice.listening ? "destructive" : "outline"} size="icon" onClick={voice.toggle} title="Speak (Ctrl+M)" aria-label="Toggle voice">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" /></svg>
              </Button>
            )}
            <Button type="submit" disabled={isGenerating}>{isGenerating ? "Working…" : "Drive"}</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => drive("Map every pending row in the receipts batch to an open invoice (match by amount/customer via list-invoices), mark them mapped. Report any you can't match.")}>
              Map rows to invoices
            </Button>
            <Button onClick={() => void postBatch()} disabled={post.isPending || mappedCount === 0}>
              {post.isPending ? "Posting…" : `Post batch (${mappedCount})`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void mutate(() => EMPTY_DRAFT)}>Clear batch</Button>
          </div>
          <div className="text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px]">
            {[["/", "driver"], ["Ctrl+M", "voice"], ["Ctrl+Enter", "post batch"]].map((pair) => (
              <span key={pair[0]}><kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">{pair[0]}</kbd> {pair[1]}</span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
