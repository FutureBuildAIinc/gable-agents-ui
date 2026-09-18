import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReorderAlert {
  product_id: string;
  sku?: string;
  description?: string;
  vendor?: string | null;
  reorder_point?: number;
  reorder_qty?: number;
  current_stock?: number;
  deficit?: number;
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

interface Product {
  id: string;
  sku?: string;
  description?: string;
  uom_primary?: string;
  [key: string]: unknown;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtQty(n?: number): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function meta() {
  return [{ title: "Inventory — Gable Inventory" }];
}

export default function InventoryIndex() {
  const { data: alerts, isLoading: alertsLoading, error: alertsError } =
    useActionQuery<ReorderAlert[]>("reorder-alerts", {});

  // Stock lookup: gable's inventory list requires a product UUID.
  const [lookupInput, setLookupInput] = useState("");
  const [productId, setProductId] = useState("");
  const lookupValid = UUID_RE.test(productId);
  const { data: product, isLoading: productLoading } = useActionQuery<Product>(
    "get-product",
    { productId },
    { enabled: lookupValid },
  );
  const { data: rows, isLoading: rowsLoading, error: rowsError } =
    useActionQuery<InventoryRow[]>(
      "list-inventory",
      { productId },
      { enabled: lookupValid },
    );

  function selectProduct(id: string): void {
    setLookupInput(id);
    setProductId(id);
    setAdj((a) => ({ ...a, productId: id }));
    setXfer((t) => ({ ...t, productId: id }));
  }

  // Adjust form
  const [adj, setAdj] = useState({
    productId: "",
    locationId: "",
    quantity: "",
    reason: "",
    isDelta: false,
  });
  const adjust = useActionMutation("adjust-stock", {
    onSuccess: () => {
      toast.success("Stock adjusted in gable.");
      setAdj((a) => ({ ...a, quantity: "", reason: "" }));
    },
    onError: (e) => toast.error(`Adjust failed: ${String(e)}`),
  });

  // Transfer form
  const [xfer, setXfer] = useState({
    productId: "",
    fromLocationId: "",
    toLocationId: "",
    quantity: "",
    reason: "",
  });
  const transfer = useActionMutation("transfer-stock", {
    onSuccess: () => {
      toast.success("Stock transferred in gable.");
      setXfer((t) => ({ ...t, quantity: "", reason: "" }));
    },
    onError: (e) => toast.error(`Transfer failed: ${String(e)}`),
  });

  const uom = (product as { uom_primary?: string } | undefined)?.uom_primary;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Inventory</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Adjust stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="adj-product">Product UUID</Label>
                <Input
                  id="adj-product"
                  value={adj.productId}
                  onChange={(e) => setAdj((a) => ({ ...a, productId: e.target.value }))}
                  placeholder="00000000-…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adj-location">Location UUID</Label>
                <Input
                  id="adj-location"
                  value={adj.locationId}
                  onChange={(e) => setAdj((a) => ({ ...a, locationId: e.target.value }))}
                  placeholder="00000000-…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adj-quantity">Quantity</Label>
                <Input
                  id="adj-quantity"
                  inputMode="decimal"
                  value={adj.quantity}
                  onChange={(e) => setAdj((a) => ({ ...a, quantity: e.target.value }))}
                  placeholder="e.g. 120"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="adj-reason">Reason</Label>
                <Input
                  id="adj-reason"
                  value={adj.reason}
                  onChange={(e) => setAdj((a) => ({ ...a, reason: e.target.value }))}
                  placeholder="cycle count 2026-09-17"
                />
              </div>
            </div>
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={adj.isDelta}
                onChange={(e) => setAdj((a) => ({ ...a, isDelta: e.target.checked }))}
              />
              Apply as delta (+ / −) instead of setting the absolute count
            </label>
            <Button
              disabled={adjust.isPending}
              onClick={() => {
                const quantity = Number(adj.quantity);
                if (
                  !UUID_RE.test(adj.productId) ||
                  !UUID_RE.test(adj.locationId) ||
                  !Number.isFinite(quantity) ||
                  !adj.reason.trim()
                ) {
                  toast.error("Fill product, location, a numeric quantity, and a reason.");
                  return;
                }
                if (
                  window.confirm(
                    adj.isDelta
                      ? `Apply ${quantity} to stock for this product at this location in gable?`
                      : `Set on-hand stock to ${quantity} for this product at this location in gable?`,
                  )
                ) {
                  adjust.mutate({
                    productId: adj.productId,
                    locationId: adj.locationId,
                    quantity,
                    reason: adj.reason,
                    isDelta: adj.isDelta,
                  });
                }
              }}
            >
              Adjust stock
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfer stock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="xfer-product">Product UUID</Label>
                <Input
                  id="xfer-product"
                  value={xfer.productId}
                  onChange={(e) => setXfer((t) => ({ ...t, productId: e.target.value }))}
                  placeholder="00000000-…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="xfer-qty">Quantity</Label>
                <Input
                  id="xfer-qty"
                  inputMode="decimal"
                  value={xfer.quantity}
                  onChange={(e) => setXfer((t) => ({ ...t, quantity: e.target.value }))}
                  placeholder="e.g. 40"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="xfer-from">From location UUID</Label>
                <Input
                  id="xfer-from"
                  value={xfer.fromLocationId}
                  onChange={(e) => setXfer((t) => ({ ...t, fromLocationId: e.target.value }))}
                  placeholder="00000000-…"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="xfer-to">To location UUID</Label>
                <Input
                  id="xfer-to"
                  value={xfer.toLocationId}
                  onChange={(e) => setXfer((t) => ({ ...t, toLocationId: e.target.value }))}
                  placeholder="00000000-…"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="xfer-reason">Reason</Label>
                <Input
                  id="xfer-reason"
                  value={xfer.reason}
                  onChange={(e) => setXfer((t) => ({ ...t, reason: e.target.value }))}
                  placeholder="yard A to delivery truck"
                />
              </div>
            </div>
            <Button
              disabled={transfer.isPending}
              onClick={() => {
                const quantity = Number(xfer.quantity);
                if (
                  !UUID_RE.test(xfer.productId) ||
                  !UUID_RE.test(xfer.fromLocationId) ||
                  !UUID_RE.test(xfer.toLocationId) ||
                  !Number.isFinite(quantity) ||
                  quantity <= 0 ||
                  !xfer.reason.trim()
                ) {
                  toast.error("Fill product, both locations, a positive quantity, and a reason.");
                  return;
                }
                if (
                  window.confirm(
                    `Move ${quantity} from the source to the destination location in gable?`,
                  )
                ) {
                  transfer.mutate({
                    productId: xfer.productId,
                    fromLocationId: xfer.fromLocationId,
                    toLocationId: xfer.toLocationId,
                    quantity,
                    reason: xfer.reason,
                  });
                }
              }}
            >
              Transfer stock
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Stock lookup</CardTitle>
          {lookupValid && (
            <span className="text-muted-foreground text-sm">
              {productLoading || rowsLoading
                ? "Loading…"
                : `${rows?.length ?? 0} location(s)`}
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="Product UUID (pick a reorder alert below or paste one)"
              className="font-mono text-xs"
            />
            <Button variant="secondary" onClick={() => setProductId(lookupInput.trim())}>
              Look up
            </Button>
          </div>
          {lookupValid ? (
            <>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">
                  {(product as { sku?: string } | undefined)?.sku ?? productId.slice(0, 8)}
                </span>
                <span className="text-muted-foreground text-sm">
                  {(product as { description?: string } | undefined)?.description ?? ""}
                </span>
                {uom ? <Badge variant="outline">{uom}</Badge> : null}
              </div>
              {rowsError ? (
                <p className="text-destructive text-sm">
                  Failed to load stock rows: {String(rowsError)}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left">
                      <th className="py-2 pr-4 font-medium">Location</th>
                      <th className="py-2 pr-4 font-medium text-right">On hand</th>
                      <th className="py-2 pr-4 font-medium text-right">Allocated</th>
                      <th className="py-2 pr-4 font-medium text-right">Available</th>
                      <th className="py-2 font-medium">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rows ?? []).map((r) => (
                      <tr key={r.id} className="hover:bg-muted/50 border-b last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">
                          {r.location_id?.slice(0, 8) ?? r.location ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtQty(r.quantity)}
                          {uom ? <span className="text-muted-foreground ml-1 text-xs">{uom}</span> : null}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {(r.allocated ?? 0) > 0 ? (
                            <Badge variant="secondary">{fmtQty(r.allocated)}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {fmtQty((r.quantity ?? 0) - (r.allocated ?? 0))}
                        </td>
                        <td className="text-muted-foreground py-2 text-xs">
                          {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                    {!rowsLoading && (rows ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-muted-foreground py-8 text-center">
                          No stock rows for this product.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Enter a product UUID to see on-hand stock by location — or select a product from
              the reorder alerts below.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Reorder alerts</CardTitle>
          <span className="text-muted-foreground text-sm">
            {alertsLoading ? "Loading…" : `${alerts?.length ?? 0} below reorder point`}
          </span>
        </CardHeader>
        <CardContent>
          {alertsError ? (
            <p className="text-destructive text-sm">
              Failed to load reorder alerts: {String(alertsError)}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">SKU</th>
                  <th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium">Vendor</th>
                  <th className="py-2 pr-4 font-medium text-right">On hand</th>
                  <th className="py-2 pr-4 font-medium text-right">Reorder pt</th>
                  <th className="py-2 pr-4 font-medium text-right">Suggested qty</th>
                  <th className="py-2 font-medium text-right">Deficit</th>
                </tr>
              </thead>
              <tbody>
                {(alerts ?? []).map((a) => (
                  <tr
                    key={a.product_id}
                    className="hover:bg-muted/50 cursor-pointer border-b last:border-0"
                    onClick={() => selectProduct(a.product_id)}
                  >
                    <td className="py-2 pr-4 font-medium">{a.sku ?? a.product_id.slice(0, 8)}</td>
                    <td className="max-w-64 truncate py-2 pr-4">{a.description ?? "—"}</td>
                    <td className="py-2 pr-4">{a.vendor ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtQty(a.current_stock)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtQty(a.reorder_point)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fmtQty(a.reorder_qty)}</td>
                    <td className="py-2 text-right">
                      <Badge variant="destructive">−{fmtQty(a.deficit)}</Badge>
                    </td>
                  </tr>
                ))}
                {!alertsLoading && (alerts ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-muted-foreground py-8 text-center">
                      Nothing below reorder point — stock is healthy.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
