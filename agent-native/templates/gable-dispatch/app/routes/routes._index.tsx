import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DeliveryRoute {
  id: string;
  scheduled_date?: string;
  status?: string;
  vehicle_name?: string;
  driver_name?: string;
  stop_count?: number;
  [key: string]: unknown;
}

interface IntegrationOrder {
  id: string;
  status?: string;
  branch_id?: string;
  customer_name?: string;
  address?: string;
  scheduled_date?: string;
  lines?: { sku?: string; quantity?: number }[];
  [key: string]: unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function routeStatusVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "IN_TRANSIT":
      return "default";
    case "SCHEDULED":
    case "COMPLETED":
      return "secondary";
    case "CANCELLED":
      return "destructive";
    default:
      return "outline";
  }
}

export function meta() {
  return [{ title: "Routes — Gable Dispatch" }];
}

export default function RoutesIndex() {
  const [date, setDate] = useState(today());
  const dateValid = DATE_RE.test(date);

  const { data: routes, isLoading, error } = useActionQuery<DeliveryRoute[]>("list-routes", {});

  const {
    data: orders,
    isLoading: ordersLoading,
    error: ordersError,
  } = useActionQuery<IntegrationOrder[]>("list-orders-for-date", { date }, { enabled: dateValid });

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Dispatch board</CardTitle>
          <span className="text-muted-foreground text-sm">
            {isLoading ? "Loading…" : `${routes?.length ?? 0} routes`}
          </span>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-destructive text-sm">Failed to load routes: {String(error)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Route</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Vehicle</th>
                  <th className="py-2 pr-4 font-medium">Driver</th>
                  <th className="py-2 font-medium text-right">Stops</th>
                </tr>
              </thead>
              <tbody>
                {(routes ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-muted/50 border-b last:border-0">
                    <td className="py-2 pr-4">
                      <Link to={`/routes/${r.id}`} className="text-primary font-medium hover:underline">
                        {r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{formatDate(r.scheduled_date)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={routeStatusVariant(r.status)}>{r.status ?? "DRAFT"}</Badge>
                    </td>
                    <td className="py-2 pr-4">{r.vehicle_name ?? "—"}</td>
                    <td className="py-2 pr-4">{r.driver_name ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{r.stop_count ?? 0}</td>
                  </tr>
                ))}
                {!isLoading && (routes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground py-8 text-center">
                      No routes yet — ask the agent to build one from a day's orders.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Orders needing dispatch</CardTitle>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
            aria-label="Order date"
          />
        </CardHeader>
        <CardContent>
          {ordersError ? (
            <p className="text-destructive text-sm">Failed to load orders: {String(ordersError)}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Order</th>
                  <th className="py-2 pr-4 font-medium">Customer</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Deliver to</th>
                  <th className="py-2 font-medium text-right">Lines</th>
                </tr>
              </thead>
              <tbody>
                {(orders ?? []).map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{o.id.slice(0, 8)}</td>
                    <td className="py-2 pr-4">{o.customer_name ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="outline">{o.status ?? "—"}</Badge>
                    </td>
                    <td className="py-2 pr-4">{o.address ?? "—"}</td>
                    <td className="py-2 text-right tabular-nums">{o.lines?.length ?? 0}</td>
                  </tr>
                ))}
                {dateValid && !ordersLoading && (orders ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground py-8 text-center">
                      No orders for {date}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p className="text-muted-foreground mt-4 text-sm">
            Ask the agent to build a route from these orders — it picks the truck and driver,
            orders the stops, and creates the route in gable.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
