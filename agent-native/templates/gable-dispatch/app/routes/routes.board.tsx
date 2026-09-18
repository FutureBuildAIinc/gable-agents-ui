import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { useSendToAgentChat } from "@agent-native/core/client/agent-chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useHotkeys } from "@/lib/hotkeys";
import { useScreenTracking } from "@/lib/screen-tracking";
import { useVoiceInput } from "@/lib/voice";
import {
  laneWeightLbs,
  useBoardDraft,
  type BoardDraft,
  type OrderCard,
} from "@/lib/board-draft";

interface IntegrationOrderLine {
  product_id?: string;
  sku?: string;
  quantity?: number;
  weight_lbs?: number;
  [key: string]: unknown;
}

interface IntegrationOrder {
  id: string;
  status?: string;
  branch_id?: string;
  customer_name?: string;
  address?: string;
  latitude?: number | null;
  longitude?: number | null;
  scheduled_date?: string;
  delivery_method?: string;
  lines?: IntegrationOrderLine[];
  [key: string]: unknown;
}

interface DeliveryRoute {
  id: string;
  vehicle_id?: string;
  driver_id?: string;
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
  order_id?: string;
  stop_sequence?: number;
  status?: string;
  customer_name?: string;
  order_number?: string;
  address?: string;
  estimated_arrival?: string;
  [key: string]: unknown;
}

interface BoardData {
  date: string;
  routes: { route: DeliveryRoute; deliveries: DeliveryStop[] }[];
}

interface Vehicle {
  id: string;
  name: string;
  vehicle_type?: string;
  capacity_weight_lbs?: number | null;
}

interface Driver {
  id: string;
  name: string;
  status?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "street, city, state zip" → "city". Display hint only; omitted when shapeless. */
function townFromAddress(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

/** sum(quantity * weight_lbs); gable's weight_lbs 0 means unknown → omit. */
function orderWeightLbs(o: IntegrationOrder): number | undefined {
  const lines = o.lines ?? [];
  if (lines.length === 0) return undefined;
  const total = lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.weight_lbs ?? 0), 0);
  return total > 0 ? total : undefined;
}

function orderToCard(o: IntegrationOrder): OrderCard {
  const card: OrderCard = { orderId: o.id };
  if (o.customer_name) card.customerName = o.customer_name;
  const town = townFromAddress(o.address);
  if (town) card.town = town;
  // Will-call only when the wire actually carries a delivery method — never guessed.
  if (typeof o.delivery_method === "string" && o.delivery_method) {
    card.willCall = o.delivery_method.toUpperCase() === "PICKUP";
  }
  const w = orderWeightLbs(o);
  if (w != null) card.weightLbs = w;
  if (o.status) card.status = o.status;
  return card;
}

function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function lbs(n: number): string {
  return `${Math.round(n).toLocaleString()} lb`;
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

const TERMINAL_STOP_STATUSES = new Set(["DELIVERED", "FAILED", "PARTIAL"]);

/**
 * Keep the shared draft seeded from gable truth: on date change the board
 * reseeds from that date's orders; afterwards, newly arrived unrouted orders
 * join the unassigned lane and cards that landed on a real gable route leave
 * the draft. Returns the SAME reference when nothing changed (mutate skips).
 */
function reconcile(
  d: BoardDraft,
  date: string,
  orders: IntegrationOrder[],
  liveOrderIds: Set<string>,
): BoardDraft {
  if (d.date !== date) {
    return {
      ...d,
      date,
      lanes: {
        unassigned: orders.filter((o) => !liveOrderIds.has(o.id)).map(orderToCard),
        routes: [],
      },
    };
  }
  const placed = new Set<string>();
  for (const c of d.lanes.unassigned) placed.add(c.orderId);
  for (const r of d.lanes.routes) for (const c of r.stops) placed.add(c.orderId);

  const missing = orders.filter((o) => !placed.has(o.id) && !liveOrderIds.has(o.id));
  const unassigned = d.lanes.unassigned.filter((c) => !liveOrderIds.has(c.orderId));
  const routes = d.lanes.routes.map((r) => ({
    ...r,
    stops: r.stops.filter((c) => !liveOrderIds.has(c.orderId)),
  }));

  const dropped =
    d.lanes.unassigned.length - unassigned.length +
    d.lanes.routes.reduce((s, r, i) => s + (r.stops.length - routes[i].stops.length), 0);
  if (missing.length === 0 && dropped === 0) return d;
  return {
    ...d,
    lanes: { unassigned: [...unassigned, ...missing.map(orderToCard)], routes },
  };
}

export function meta() {
  return [{ title: "Dispatch board — Gable Dispatch" }];
}

export default function DispatchBoardRoute() {
  useScreenTracking("dispatch-board");
  const { draft, mutate } = useBoardDraft();
  const { send, isGenerating } = useSendToAgentChat();
  const [date, setDate] = useState(today());
  const [driverText, setDriverText] = useState("");
  const driverRef = useRef<HTMLInputElement>(null);
  const voice = useVoiceInput();
  const dateValid = DATE_RE.test(date);

  useEffect(() => {
    if (voice.transcript) setDriverText(voice.transcript);
  }, [voice.transcript]);

  const {
    data: board,
    error: boardError,
  } = useActionQuery<BoardData>("get-board", { date }, { enabled: dateValid });
  const { data: orders, error: ordersError } = useActionQuery<IntegrationOrder[]>(
    "list-orders-for-date",
    { date },
    { enabled: dateValid },
  );
  const { data: vehicles } = useActionQuery<Vehicle[]>("list-vehicles", {});
  const { data: drivers } = useActionQuery<Driver[]>("list-drivers", {});

  const liveRoutes = useMemo(() => board?.routes ?? [], [board]);
  const liveOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of liveRoutes)
      for (const s of r.deliveries) if (s.order_id) ids.add(s.order_id);
    return ids;
  }, [liveRoutes]);

  // Seed/merge the shared draft from gable truth (no-op when already in sync).
  useEffect(() => {
    if (!dateValid || !orders) return;
    void mutate((d) => reconcile(d, date, orders, liveOrderIds));
  }, [dateValid, date, orders, liveOrderIds, mutate]);

  const createRoute = useActionMutation("create-route", {
    onError: (e) => toast.error(`Create route failed: ${String(e)}`),
  });
  const dispatchRoute = useActionMutation("dispatch-route", {
    onSuccess: () => toast.success("Route dispatched — truck is IN_TRANSIT."),
    onError: (e) => toast.error(`Dispatch failed: ${String(e)}`),
  });
  const completeRoute = useActionMutation("complete-route", {
    onSuccess: () => toast.success("Route completed."),
    onError: (e) => toast.error(`Complete failed: ${String(e)}`),
  });

  const drive = (message: string) => {
    send({ message, submit: true });
    toast.info("Sent to the agent — watch this board as it works.");
  };

  const submitDriver = () => {
    const v = driverText.trim();
    if (!v) return;
    drive(v);
    setDriverText("");
    voice.reset();
  };

  const buildRoutes = () =>
    drive(
      `Work the dispatch board for ${date}. Read the current board with a bare board-set-draft call and pull the day's orders with list-orders-for-date (date ${date}). Cluster the unassigned orders into sensible routes by geography — use each order's latitude/longitude, and when coordinates are missing say so instead of guessing locations. Mind each vehicle's capacity_weight_lbs from list-vehicles against the orders' summed line weights (quantity × weight_lbs). Fill the board live with board-set-draft: setDate ${date}, addRoute per route, setVehicle/setDriver using real UUIDs from list-vehicles/list-drivers, and assignOrders with full card details (orderId, customerName, town, weightLbs, status — willCall only if the order wire carries a delivery method). Sequence stops sensibly (heavy drops last-on-first-off where loading matters). Don't create anything in gable yet — the dispatcher confirms each route.`,
    );

  useHotkeys([
    { key: "/", action: () => driverRef.current?.focus(), description: "Focus agent driver" },
    {
      key: "m",
      ctrl: true,
      action: () => voice.toggle(),
      allowInInputs: true,
      description: "Toggle voice input",
    },
    {
      key: "b",
      ctrl: true,
      action: () => buildRoutes(),
      allowInInputs: true,
      description: "Build routes (agent)",
    },
    {
      key: "Enter",
      ctrl: true,
      allowInInputs: true,
      action: () => {
        if (document.activeElement === driverRef.current) submitDriver();
      },
      description: "Send driver message",
    },
    {
      key: "Escape",
      action: () => (document.activeElement as HTMLElement | null)?.blur?.(),
      description: "Blur",
    },
  ]);

  const moveCard = (orderId: string, from: number, to: number, position?: number) => {
    void mutate((d) => {
      const lanes = {
        unassigned: [...d.lanes.unassigned],
        routes: d.lanes.routes.map((r) => ({ ...r, stops: [...r.stops] })),
      };
      const source = from === -1 ? lanes.unassigned : lanes.routes[from]?.stops;
      const target = to === -1 ? lanes.unassigned : lanes.routes[to]?.stops;
      if (!source || !target) return d;
      const i = source.findIndex((c) => c.orderId === orderId);
      if (i < 0) return d;
      const [card] = source.splice(i, 1);
      target.splice(position === undefined ? target.length : Math.min(position, target.length), 0, card);
      return { ...d, lanes };
    });
  };

  const laneSelectValue = (orderId: string): string => {
    if (draft.lanes.unassigned.some((c) => c.orderId === orderId)) return "-1";
    const idx = draft.lanes.routes.findIndex((r) => r.stops.some((c) => c.orderId === orderId));
    return String(idx);
  };

  const createInGable = (routeIndex: number) => {
    const lane = draft.lanes.routes[routeIndex];
    if (!lane) return;
    if (!lane.vehicleId) return toast.error("Pick a vehicle first");
    if (lane.stops.length === 0) return toast.error("Add at least one stop");
    if (
      !window.confirm(
        `Create this route in gable for ${date} (${lane.stops.length} stops on ${lane.vehicleLabel ?? "this vehicle"})?`,
      )
    )
      return;
    const byId = new Map((orders ?? []).map((o) => [o.id, o]));
    createRoute.mutate(
      {
        vehicleId: lane.vehicleId,
        driverId: lane.driverId,
        scheduledDate: date,
        stops: lane.stops.map((s, i) => {
          const o = byId.get(s.orderId);
          return {
            orderId: s.orderId,
            sequence: i + 1,
            lat: typeof o?.latitude === "number" ? o.latitude : undefined,
            lng: typeof o?.longitude === "number" ? o.longitude : undefined,
          };
        }),
      },
      {
        onSuccess: (resp: { route_id?: string }) => {
          toast.success(`Route created in gable (${resp?.route_id?.slice(0, 8) ?? "ok"})`);
          void mutate((d) => {
            const routes = d.lanes.routes.filter((_, i) => i !== routeIndex);
            return { ...d, lanes: { ...d.lanes, routes } };
          });
        },
      },
    );
  };

  const laneCount = 1 + draft.lanes.routes.length + liveRoutes.length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dispatch board</h1>
          <p className="text-muted-foreground text-sm">
            Today's orders on trucks, in the right order. Drive it yourself, or let the
            agent cluster routes — the board is shared.
          </p>
        </div>
        {isGenerating && <Badge>agent driving…</Badge>}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="board-date" className="text-muted-foreground text-xs">
            Date
          </label>
          <Input
            id="board-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
        </div>
        <Button onClick={() => buildRoutes()} disabled={isGenerating}>
          Build routes
        </Button>
        <Button
          variant="outline"
          onClick={() => void mutate((d) => ({ ...d, lanes: { unassigned: [], routes: [] } }))}
        >
          Clear board
        </Button>
        <span className="text-muted-foreground ml-auto text-sm">
          {liveRoutes.length} live · {draft.lanes.routes.length} planned ·{" "}
          {draft.lanes.unassigned.length} unassigned
        </span>
      </div>

      {(boardError || ordersError) && (
        <p className="text-destructive text-sm">
          {boardError ? `Failed to load routes: ${String(boardError)}. ` : ""}
          {ordersError ? `Failed to load orders: ${String(ordersError)}` : ""}
        </p>
      )}

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${Math.max(laneCount, 1)}, minmax(16rem, 1fr))` }}
      >
        {/* Unassigned lane */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Unassigned</CardTitle>
            <Badge variant="outline">{draft.lanes.unassigned.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {draft.lanes.unassigned.map((c, i) => (
              <OrderCardView
                key={c.orderId}
                card={c}
                index={i}
                laneLength={draft.lanes.unassigned.length}
                laneValue={laneSelectValue(c.orderId)}
                routeCount={draft.lanes.routes.length}
                onMove={(to, pos) => moveCard(c.orderId, -1, to, pos)}
                onReorder={(pos) => moveCard(c.orderId, -1, -1, pos)}
              />
            ))}
            {draft.lanes.unassigned.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                Nothing unassigned — every order is on a route, or no orders for this date.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Planned (draft) route lanes */}
        {draft.lanes.routes.map((lane, routeIndex) => {
          const totalWeight = laneWeightLbs(lane);
          const vehicle = (vehicles ?? []).find((v) => v.id === lane.vehicleId);
          const capacity =
            typeof vehicle?.capacity_weight_lbs === "number" ? vehicle.capacity_weight_lbs : null;
          const overCapacity = capacity != null && totalWeight != null && totalWeight > capacity;
          return (
            <Card key={`planned-${routeIndex}`}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">Route {routeIndex + 1} (plan)</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void mutate((d) => {
                      const lanes = {
                        unassigned: [...d.lanes.unassigned, ...lane.stops],
                        routes: d.lanes.routes.filter((_, i) => i !== routeIndex),
                      };
                      return { ...d, lanes };
                    })
                  }
                >
                  Remove
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <select
                    className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
                    value={lane.vehicleId ?? ""}
                    onChange={(e) => {
                      const v = (vehicles ?? []).find((x) => x.id === e.target.value);
                      void mutate((d) => {
                        const routes = d.lanes.routes.map((r, i) =>
                          i === routeIndex
                            ? { ...r, vehicleId: v?.id, vehicleLabel: v?.name }
                            : r,
                        );
                        return { ...d, lanes: { ...d.lanes, routes } };
                      });
                    }}
                    aria-label="Vehicle"
                  >
                    <option value="">Vehicle…</option>
                    {(vehicles ?? []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.vehicle_type ? ` · ${v.vehicle_type}` : ""}
                      </option>
                    ))}
                  </select>
                  <select
                    className="border-input bg-background h-8 w-full rounded-md border px-2 text-sm"
                    value={lane.driverId ?? ""}
                    onChange={(e) => {
                      const drv = (drivers ?? []).find((x) => x.id === e.target.value);
                      void mutate((d) => {
                        const routes = d.lanes.routes.map((r, i) =>
                          i === routeIndex
                            ? { ...r, driverId: drv?.id, driverLabel: drv?.name }
                            : r,
                        );
                        return { ...d, lanes: { ...d.lanes, routes } };
                      });
                    }}
                    aria-label="Driver"
                  >
                    <option value="">Driver…</option>
                    {(drivers ?? []).map((drv) => (
                      <option key={drv.id} value={drv.id}>
                        {drv.name}
                        {drv.status && drv.status !== "ACTIVE" ? ` · ${drv.status}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {totalWeight != null && <Badge variant="outline">{lbs(totalWeight)}</Badge>}
                  {capacity != null && (
                    <Badge variant={overCapacity ? "destructive" : "secondary"}>
                      capacity {lbs(capacity)}
                    </Badge>
                  )}
                  {overCapacity && (
                    <span className="text-destructive text-xs">
                      Over capacity — split the load or take a bigger truck.
                    </span>
                  )}
                </div>
                {lane.stops.map((c, i) => (
                  <OrderCardView
                    key={c.orderId}
                    card={c}
                    index={i}
                    laneLength={lane.stops.length}
                    laneValue={laneSelectValue(c.orderId)}
                    routeCount={draft.lanes.routes.length}
                    onMove={(to, pos) => moveCard(c.orderId, routeIndex, to, pos)}
                    onReorder={(pos) => moveCard(c.orderId, routeIndex, routeIndex, pos)}
                  />
                ))}
                {lane.stops.length === 0 && (
                  <p className="text-muted-foreground py-2 text-center text-sm">
                    Drop orders here with the card's lane picker.
                  </p>
                )}
                <Button
                  className="w-full"
                  size="sm"
                  disabled={createRoute.isPending || !lane.vehicleId || lane.stops.length === 0}
                  onClick={() => createInGable(routeIndex)}
                >
                  {createRoute.isPending ? "Creating…" : "Create in gable"}
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {/* Live gable routes for the date */}
        {liveRoutes.map(({ route, deliveries }) => {
          const stops = [...deliveries].sort(
            (a, b) => (a.stop_sequence ?? 0) - (b.stop_sequence ?? 0),
          );
          const canDispatch = route.status === "DRAFT" || route.status === "SCHEDULED";
          const allTerminal =
            stops.length > 0 && stops.every((s) => TERMINAL_STOP_STATUSES.has(s.status ?? ""));
          const canComplete = route.status === "IN_TRANSIT" && allTerminal;
          return (
            <Card key={route.id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">
                  <Link to={`/routes/${route.id}`} className="text-primary hover:underline">
                    Route {route.id.slice(0, 8)}
                  </Link>
                </CardTitle>
                <Badge variant={routeStatusVariant(route.status)}>{route.status ?? "DRAFT"}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-muted-foreground text-xs">
                  {route.vehicle_name ?? "—"}
                  {route.driver_name ? ` · ${route.driver_name}` : ""} · {stops.length} stops
                </p>
                {stops.map((s) => (
                  <div key={s.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {s.customer_name ?? s.order_number ?? s.id.slice(0, 8)}
                      </span>
                      <Badge variant={stopStatusVariant(s.status)}>{s.status ?? "PENDING"}</Badge>
                    </div>
                    <div className="text-muted-foreground mt-0.5 text-xs">
                      #{s.stop_sequence ?? "—"} · {s.address ?? "—"}
                      {s.estimated_arrival ? ` · ETA ${formatTime(s.estimated_arrival)}` : ""}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!canDispatch || dispatchRoute.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Dispatch this route? The truck goes IN_TRANSIT in gable.",
                        )
                      )
                        dispatchRoute.mutate({ routeId: route.id });
                    }}
                  >
                    {canDispatch ? "Dispatch route" : "Dispatched"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    disabled={!canComplete || completeRoute.isPending}
                    title={
                      route.status === "IN_TRANSIT" && !allTerminal
                        ? "Every stop must be DELIVERED, FAILED, or PARTIAL first"
                        : undefined
                    }
                    onClick={() => {
                      if (
                        window.confirm(
                          "Complete this route? Every stop must be DELIVERED, FAILED, or PARTIAL.",
                        )
                      )
                        completeRoute.mutate({ routeId: route.id });
                    }}
                  >
                    Complete route
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
              placeholder='Type or speak: "cluster these into 2 routes by geography" · "add a hot-shot stop for Kelbrook to Route 2"'
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
            <Button variant="outline" size="sm" onClick={() => buildRoutes()} disabled={isGenerating}>
              Build routes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                drive(
                  `Review the dispatch board for ${date} (bare board-set-draft read + get-board). Flag problems only: overloaded vehicles vs capacity_weight_lbs, routes with no driver, stops whose geography makes no sense. Don't change anything yet.`,
                )
              }
            >
              Ask agent to review
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Driver messages run in your chat thread; the agent operates this board via the
            shared draft — lanes and stops appear here as it works. Creating, dispatching, and
            completing routes in gable always asks you first.
          </p>
          <div className="border-border text-muted-foreground/70 flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-[11px]">
            {[
              ["/", "driver"],
              ["Ctrl+M", "voice"],
              ["Ctrl+B", "build routes"],
              ["Ctrl+Enter", "send"],
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

function OrderCardView(props: {
  card: OrderCard;
  index: number;
  laneLength: number;
  laneValue: string;
  routeCount: number;
  onMove: (toRouteIndex: number, position?: number) => void;
  onReorder: (position: number) => void;
}) {
  const { card, index, laneLength, laneValue, routeCount, onMove, onReorder } = props;
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{card.customerName ?? card.orderId.slice(0, 8)}</div>
          <div className="text-muted-foreground text-xs">
            {card.town ?? "—"}
            {card.weightLbs != null ? ` · ${lbs(card.weightLbs)}` : ""}
            {card.sizeClass ? ` · ${card.sizeClass}` : ""}
            {card.promisedWindow ? ` · ${card.promisedWindow}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {card.willCall === true && <Badge variant="secondary">will-call</Badge>}
          {card.status && <Badge variant="outline">{card.status}</Badge>}
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5"
          disabled={index === 0}
          onClick={() => onReorder(index - 1)}
          aria-label="Move earlier"
        >
          ↑
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5"
          disabled={index === laneLength - 1}
          onClick={() => onReorder(index + 1)}
          aria-label="Move later"
        >
          ↓
        </Button>
        <select
          className="border-input bg-background ml-auto h-6 rounded-md border px-1 text-xs"
          value={laneValue}
          onChange={(e) => onMove(Number.parseInt(e.target.value, 10))}
          aria-label="Move to lane"
        >
          <option value="-1">Unassigned</option>
          {Array.from({ length: routeCount }, (_, i) => (
            <option key={i} value={String(i)}>
              Route {i + 1}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
