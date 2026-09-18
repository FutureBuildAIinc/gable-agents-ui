import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link, useParams } from "react-router";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductDetail {
  id: string;
  sku?: string;
  description?: string;
  uom_primary?: string;
  base_price?: number;
  vendor?: string | null;
  upc?: string | null;
  weight_lbs?: number;
  length_in?: number | null;
  width_in?: number | null;
  height_in?: number | null;
  stackable?: boolean | null;
  reorder_point?: number;
  reorder_qty?: number;
  total_quantity?: number;
  total_allocated?: number;
  average_unit_cost?: number;
  target_margin?: number;
  [key: string]: unknown;
}

interface InventoryRow {
  id: string;
  location_id?: string | null;
  location?: string;
  quantity?: number;
  allocated?: number;
  updated_at?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function money(dollars?: number): string {
  if (dollars == null) return "—";
  return dollars.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtQty(n?: number): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function meta() {
  return [{ title: "Product — Gable Inventory" }];
}

export default function ProductDetailRoute() {
  const { productId = "" } = useParams();
  const valid = UUID_RE.test(productId);

  const { data: product, isLoading, error } = useActionQuery<ProductDetail>(
    "get-product",
    { productId },
    { enabled: valid },
  );
  const { data: rows, isLoading: rowsLoading } = useActionQuery<InventoryRow[]>(
    "list-inventory",
    { productId },
    { enabled: valid },
  );

  if (!valid) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-destructive text-sm">Invalid product id.</p>
        <Link to="/inventory" className="text-primary text-sm hover:underline">← Inventory</Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-destructive text-sm">Failed to load product: {String(error)}</p>
        <Link to="/inventory" className="text-primary text-sm hover:underline">← Inventory</Link>
      </div>
    );
  }

  const uom = product?.uom_primary;
  const onHand = product?.total_quantity ?? 0;
  const belowReorder =
    product != null &&
    product.reorder_point != null &&
    onHand < product.reorder_point;
  const dims = [product?.length_in, product?.width_in, product?.height_in].filter(
    (d) => d != null,
  ) as number[];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <Link to="/inventory" className="text-muted-foreground text-sm hover:underline">
          ← Inventory
        </Link>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          {product?.sku ?? (isLoading ? "Loading…" : productId.slice(0, 8))}
          {uom ? <Badge variant="outline">{uom}</Badge> : null}
          {belowReorder ? <Badge variant="destructive">Below reorder point</Badge> : null}
        </h1>
        {product?.description && (
          <p className="text-muted-foreground text-sm">{product.description}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock & reorder</CardTitle>
          </CardHeader>
          <CardContent>
            <Field
              label={`On hand${uom ? ` (${uom})` : ""}`}
              value={fmtQty(product?.total_quantity)}
            />
            <Field label="Allocated" value={fmtQty(product?.total_allocated)} />
            <Field
              label={`Available${uom ? ` (${uom})` : ""}`}
              value={fmtQty(
                (product?.total_quantity ?? 0) - (product?.total_allocated ?? 0),
              )}
            />
            <Field label="Reorder point" value={fmtQty(product?.reorder_point)} />
            <Field label="Reorder qty" value={fmtQty(product?.reorder_qty)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Vendor" value={product?.vendor ?? "—"} />
            <Field label="UPC" value={product?.upc ?? "—"} />
            <Field
              label="Weight"
              value={product?.weight_lbs != null ? `${fmtQty(product.weight_lbs)} lbs` : "—"}
            />
            <Field
              label="Dimensions (L×W×H in)"
              value={dims.length > 0 ? dims.map((d) => fmtQty(d)).join(" × ") : "—"}
            />
            <Field
              label="Stackable"
              value={
                product?.stackable == null ? "—" : product.stackable ? "Yes" : "No"
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing & cost</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Base price" value={money(product?.base_price)} />
            <Field label="Average unit cost" value={money(product?.average_unit_cost)} />
            <Field
              label="Target margin"
              value={
                product?.target_margin != null && product.target_margin !== 0
                  ? `${(product.target_margin * 100).toFixed(1)}%`
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Stock by location</CardTitle>
          <span className="text-muted-foreground text-sm">
            {rowsLoading ? "Loading…" : `${rows?.length ?? 0} location(s)`}
          </span>
        </CardHeader>
        <CardContent>
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
                  <td className="py-2 pr-4 text-right tabular-nums">{fmtQty(r.allocated ?? 0)}</td>
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
                    No stock rows recorded for this product.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
