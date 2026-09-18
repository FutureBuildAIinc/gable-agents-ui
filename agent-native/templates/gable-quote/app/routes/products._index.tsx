import { useActionQuery } from "@agent-native/core/client/hooks";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useScreenTracking } from "@/lib/screen-tracking";

interface Product {
  id: string;
  sku?: string;
  name: string;
  category?: string;
  uom?: string;
}

export function meta() {
  return [{ title: "Products — Gable Quotes" }];
}

export default function ProductsIndex() {
  useScreenTracking("products");
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useActionQuery<Product[]>("list-products", { limit: 200 });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products ?? [];
    return (products ?? []).filter(
      (p) => p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Products</CardTitle>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${filtered.length} of ${products?.length ?? 0}`}
          </span>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Filter by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">SKU</th>
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 font-medium">UOM</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 100).map((p) => (
                <tr key={p.id} className="hover:bg-muted/50 border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{p.sku ?? "—"}</td>
                  <td className="py-2 pr-4">{p.name}</td>
                  <td className="text-muted-foreground py-2 pr-4">{p.category ?? "—"}</td>
                  <td className="py-2">
                    <Badge variant="outline">{p.uom ?? "—"}</Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={4} className="text-muted-foreground py-8 text-center">
                    No products match.
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
