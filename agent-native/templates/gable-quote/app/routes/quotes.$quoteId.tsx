import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QuoteLine {
  id?: string;
  product_id?: string;
  description?: string;
  sku?: string;
  quantity?: number;
  uom?: string;
  unit_price_cents?: number;
  total_cents?: number;
}

interface QuoteDetail {
  id: string;
  quote_number?: string;
  customer_name?: string;
  status?: string;
  notes?: string;
  lines?: QuoteLine[];
  total_cents?: number;
}

function money(cents?: number): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function meta() {
  return [{ title: "Quote — Gable Quotes" }];
}

export default function QuoteDetailRoute() {
  const { quoteId = "" } = useParams();
  const { data: quote, isLoading, error } = useActionQuery<QuoteDetail>("get-quote", {
    quoteId,
  });
  const accept = useActionMutation("accept-quote", {
    onSuccess: () => toast.success("Quote accepted — order created in gable."),
    onError: (e) => toast.error(`Convert failed: ${String(e)}`),
  });
  const { send, isGenerating } = useSendToAgentChat();
  const voice = useVoiceInput();
  const [note, setNote] = useState("");
  useEffect(() => {
    if (voice.transcript) setNote(voice.transcript);
  }, [voice.transcript]);
  useScreenTracking("quote-detail", {
    kind: "quote",
    id: quoteId,
    label: quote?.quote_number ?? quote?.customer_name,
  });

  const handoff = () => {
    send({
      message: `Work quote ${quote?.quote_number ?? quoteId.slice(0, 8)} for ${quote?.customer_name ?? "this customer"}: review the lines and margins on screen, then tell me what you'd adjust before we accept.`,
      submit: true,
    });
    toast.info("Handed to the agent — it can see this quote via view-screen.");
  };

  const submit = () => {
    if (window.confirm("Accept this quote and convert it to a sales order in gable?")) {
      accept.mutate({ quoteId });
    }
  };

  useHotkeys([
    { key: "a", ctrl: true, action: handoff, allowInInputs: true, description: "Ask agent to work this quote" },
    { key: "Enter", ctrl: true, action: submit, allowInInputs: true, description: "Accept & convert" },
    { key: "m", ctrl: true, action: () => voice.toggle(), allowInInputs: true, description: "Voice note" },
  ]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-destructive text-sm">Failed to load quote: {String(error)}</p>
        <Link to="/quotes" className="text-primary text-sm hover:underline">← All quotes</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/quotes" className="text-muted-foreground text-sm hover:underline">
            ← All quotes
          </Link>
          <h1 className="text-xl font-semibold">
            Quote {quote?.quote_number ?? quoteId.slice(0, 8)}{" "}
            <Badge variant="secondary" className="ml-2 align-middle">
              {quote?.status ?? "…"}
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm">{quote?.customer_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={isGenerating} onClick={handoff}>
            {isGenerating ? "Agent working…" : "Ask agent to work this quote"}
          </Button>
          <Button
            disabled={isLoading || accept.isPending || quote?.status === "converted"}
            onClick={submit}
          >
            {quote?.status === "converted" ? "Converted" : "Accept & convert to order"}
          </Button>
        </div>
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
                <th className="py-2 pr-4 font-medium">UOM</th>
                <th className="py-2 pr-4 font-medium text-right">Unit</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(quote?.lines ?? []).map((l, i) => (
                <tr key={l.id ?? i} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <div className="font-medium">{l.description ?? l.sku ?? l.product_id}</div>
                    {l.sku && <div className="text-muted-foreground text-xs">{l.sku}</div>}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{l.quantity ?? "—"}</td>
                  <td className="py-2 pr-4">{l.uom ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(l.unit_price_cents)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.total_cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-3 text-right font-medium">Total</td>
                <td className="py-3 text-right font-semibold tabular-nums">
                  {money(quote?.total_cents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {quote?.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{quote.notes}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voice note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <textarea
              className="border-input bg-background min-h-16 w-full rounded-md border px-3 py-2 text-sm"
              placeholder='Speak a note (Ctrl+M) — e.g. "call before delivery, gate code 4114"'
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {voice.supported && (
              <Button
                type="button"
                variant={voice.listening ? "destructive" : "outline"}
                size="icon"
                className="shrink-0 self-start"
                onClick={voice.toggle}
                title={voice.listening ? "Stop listening" : "Speak (Ctrl+M)"}
                aria-label="Toggle voice note"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                </svg>
              </Button>
            )}
          </div>
          {note.trim() && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                send({
                  message: `Append this note to quote ${quote?.quote_number ?? quoteId.slice(0, 8)} on screen: "${note.trim()}" — add it to the quote's notes in gable if there's a path, otherwise just confirm you'll remember it for this conversation.`,
                  submit: true,
                });
                toast.info("Sent the note to the agent.");
                setNote("");
                voice.reset();
              }}
            >
              Send note to agent
            </Button>
          )}
          <div className="text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px]">
            {[["Ctrl+A", "ask agent"], ["Ctrl+Enter", "accept & convert"], ["Ctrl+M", "voice note"]].map(([k, label]) => (
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
