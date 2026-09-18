import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DeliveryRoute {
  id: string;
  scheduled_date?: string;
  status?: string;
  notes?: string;
  vehicle_name?: string;
  driver_name?: string;
  stop_count?: number;
  [key: string]: unknown;
}

interface DeliveryStop {
  id: string;
  stop_sequence?: number;
  status?: string;
  customer_name?: string;
  order_number?: string;
  address?: string;
  delivery_instructions?: string;
  estimated_arrival?: string;
  pod_signed_by?: string;
  [key: string]: unknown;
}

interface RouteDetail {
  route: DeliveryRoute;
  deliveries: DeliveryStop[];
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

function stopStatusVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "OUT_FOR_DELIVERY":
      return "default";
    case "DELIVERED":
      return "secondary";
    case "FAILED":
      return "destructive";
    default:
      return "outline";
  }
}

export function meta() {
  return [{ title: "Route — Gable Dispatch" }];
}

export default function RouteDetailRoute() {
  const { routeId = "" } = useParams();
  const { data, isLoading, error } = useActionQuery<RouteDetail>("get-route", {
    routeId,
  });

  const dispatch = useActionMutation("dispatch-route", {
    onSuccess: () => toast.success("Route dispatched — truck is IN_TRANSIT."),
    onError: (e) => toast.error(`Dispatch failed: ${String(e)}`),
  });
  const complete = useActionMutation("complete-route", {
    onSuccess: () => toast.success("Route completed."),
    onError: (e) => toast.error(`Complete failed: ${String(e)}`),
  });

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-destructive text-sm">Failed to load route: {String(error)}</p>
        <Link to="/routes" className="text-primary text-sm hover:underline">← Dispatch board</Link>
      </div>
    );
  }

  const route = data?.route;
  const stops = [...(data?.deliveries ?? [])].sort(
    (a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0),
  );
  const canDispatch = route?.status === "DRAFT" || route?.status === "SCHEDULED";
  const canComplete = route?.status === "IN_TRANSIT";

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/routes" className="text-muted-foreground text-sm hover:underline">
            ← Dispatch board
          </Link>
          <h1 className="text-xl font-semibold">
            Route {routeId.slice(0, 8)}{" "}
            <Badge variant={routeStatusVariant(route?.status)} className="ml-2 align-middle">
              {route?.status ?? (isLoading ? "…" : "DRAFT")}
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(route?.scheduled_date)}
            {route?.vehicle_name ? ` · ${route.vehicle_name}` : ""}
            {route?.driver_name ? ` · ${route.driver_name}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={!canDispatch || dispatch.isPending}
            onClick={() => {
              if (window.confirm("Dispatch this route? The truck goes IN_TRANSIT in gable.")) {
                dispatch.mutate({ routeId });
              }
            }}
          >
            {canDispatch ? "Dispatch" : "Dispatched"}
          </Button>
          <Button
            variant="outline"
            disabled={!canComplete || complete.isPending}
            onClick={() => {
              if (window.confirm("Complete this route? Every stop must be DELIVERED, FAILED, or PARTIAL.")) {
                complete.mutate({ routeId });
              }
            }}
          >
            Complete
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Stops</CardTitle>
          <span className="text-muted-foreground text-sm">{stops.length} stops</span>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">#</th>
                <th className="py-2 pr-4 font-medium">Order</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Address</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">ETA</th>
              </tr>
            </thead>
            <tbody>
              {stops.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 tabular-nums">{s.stop_sequence ?? "—"}</td>
                  <td className="py-2 pr-4 font-medium">{s.order_number ?? s.id.slice(0, 8)}</td>
                  <td className="py-2 pr-4">{s.customer_name ?? "—"}</td>
                  <td className="py-2 pr-4">{s.address ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge variant={stopStatusVariant(s.status)}>{s.status ?? "PENDING"}</Badge>
                  </td>
                  <td className="py-2 text-muted-foreground">{formatTime(s.estimated_arrival)}</td>
                </tr>
              ))}
              {!isLoading && stops.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted-foreground py-8 text-center">
                    No stops on this route yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {route?.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{route.notes}</CardContent>
        </Card>
      )}
    </div>
  );
}
