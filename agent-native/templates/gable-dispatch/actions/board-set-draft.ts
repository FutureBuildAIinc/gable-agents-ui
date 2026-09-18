import { defineAction } from "@agent-native/core/action";
import { appStateGet, appStatePut } from "@agent-native/core/application-state";
import { z } from "zod";

/**
 * The daily dispatch board's workspace state lives in application-state under
 * "dispatch-board" so BOTH the human UI and the agent drive the same screen
 * (agent-as-UI-operator). This action is the agent's write tool:
 * read-modify-write with a monotonic rev the UI polls. Passing no mutation
 * args is a pure read (no rev bump) — use it to inspect the board first.
 */

const DRAFT_KEY = "dispatch-board";

const orderCard = z.object({
  orderId: z.string().uuid().describe("Order UUID from list-orders-for-date"),
  customerName: z.string().optional(),
  town: z.string().optional().describe("City/town when known — omit when not"),
  willCall: z
    .boolean()
    .optional()
    .describe("Only when gable's wire says so (delivery_method PICKUP) — omit when unknown"),
  sizeClass: z.string().optional().describe("Size class when known — omit when not"),
  weightLbs: z
    .number()
    .nonnegative()
    .optional()
    .describe("Total order weight = sum(line.quantity * line.weight_lbs) — omit when unknown"),
  promisedWindow: z
    .string()
    .optional()
    .describe("Promised delivery window when known — omit when not"),
  status: z.string().optional().describe("Order status from gable, e.g. CONFIRMED"),
});

const routeLane = z.object({
  id: z
    .string()
    .uuid()
    .optional()
    .describe("Real gable route UUID once created — empty while still a plan"),
  vehicleId: z.string().uuid().optional(),
  vehicleLabel: z.string().optional(),
  driverId: z.string().uuid().optional(),
  driverLabel: z.string().optional(),
  stops: z.array(orderCard),
});

const patch = z.object({
  expectedRev: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Rev you last saw — the write is rejected when the board moved on"),
  setDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
    .optional()
    .describe("Working date; changing it resets the lanes (cards are date-specific)"),
  assignOrders: z
    .object({
      routeIndex: z.number().int().min(0).describe("Target route lane index"),
      orders: z.array(orderCard).min(1).describe("Cards to place on that route"),
    })
    .optional()
    .describe("Move orders onto a route lane (from unassigned or another route)"),
  addRoute: z
    .object({
      vehicleId: z.string().uuid().optional(),
      vehicleLabel: z.string().optional(),
      driverId: z.string().uuid().optional(),
      driverLabel: z.string().optional(),
    })
    .optional()
    .describe("Append an empty route lane"),
  setVehicle: z
    .object({
      routeIndex: z.number().int().min(0),
      vehicleId: z.string().uuid().nullable(),
      vehicleLabel: z.string().optional(),
    })
    .optional()
    .describe("Assign a vehicle to a route lane (null clears)"),
  setDriver: z
    .object({
      routeIndex: z.number().int().min(0),
      driverId: z.string().uuid().nullable(),
      driverLabel: z.string().optional(),
    })
    .optional()
    .describe("Assign a driver to a route lane (null clears)"),
  moveStop: z
    .object({
      orderId: z.string().uuid(),
      fromRouteIndex: z
        .number()
        .int()
        .min(-1)
        .describe("Source lane: route index, or -1 for the unassigned lane"),
      toRouteIndex: z
        .number()
        .int()
        .min(-1)
        .describe("Target lane: route index, or -1 for the unassigned lane"),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Index in the target lane's stops (append when omitted)"),
    })
    .optional()
    .describe("Move one stop between lanes — the hot-shot insert primitive"),
  removeRoute: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Remove a route lane; its stops return to unassigned"),
  setNotes: z.string().optional(),
  clear: z.boolean().optional().describe("Reset the lanes (keeps the date)"),
});

export interface OrderCard {
  orderId: string;
  customerName?: string;
  town?: string;
  willCall?: boolean;
  sizeClass?: string;
  weightLbs?: number;
  promisedWindow?: string;
  status?: string;
}

export interface BoardRouteLane {
  id?: string;
  vehicleId?: string;
  vehicleLabel?: string;
  driverId?: string;
  driverLabel?: string;
  stops: OrderCard[];
}

export interface BoardDraft {
  rev: number;
  date?: string;
  lanes: { unassigned: OrderCard[]; routes: BoardRouteLane[] };
  notes?: string;
  updatedAt?: string;
}

export async function readBoardDraft(): Promise<BoardDraft> {
  const current = await appStateGet("system", DRAFT_KEY);
  if (
    current &&
    typeof current === "object" &&
    (current as unknown as BoardDraft).lanes &&
    Array.isArray((current as unknown as BoardDraft).lanes.unassigned) &&
    Array.isArray((current as unknown as BoardDraft).lanes.routes)
  ) {
    return current as unknown as BoardDraft;
  }
  return { rev: 0, lanes: { unassigned: [], routes: [] } };
}

export async function writeBoardDraft(draft: BoardDraft): Promise<void> {
  await appStatePut("system", DRAFT_KEY, {
    ...draft,
    rev: draft.rev + 1,
    updatedAt: new Date().toISOString(),
    _writeId: `${Date.now()}`,
  });
}

export const BOARD_DRAFT_KEY = DRAFT_KEY;

function laneAt(draft: BoardDraft, index: number): BoardRouteLane | undefined {
  return draft.lanes.routes[index];
}

/** Remove an order card from wherever it currently sits. Returns the card. */
function extractCard(draft: BoardDraft, orderId: string): OrderCard | undefined {
  const fromUnassigned = draft.lanes.unassigned.findIndex((c) => c.orderId === orderId);
  if (fromUnassigned >= 0) {
    return draft.lanes.unassigned.splice(fromUnassigned, 1)[0];
  }
  for (const route of draft.lanes.routes) {
    const i = route.stops.findIndex((c) => c.orderId === orderId);
    if (i >= 0) return route.stops.splice(i, 1)[0];
  }
  return undefined;
}

export default defineAction({
  description:
    "Drive the dispatch board screen the user is looking at: set the working date, fill the unassigned lane, cluster orders into route lanes, assign vehicles/drivers, move stops between lanes, or clear. The screen updates live. Call with no arguments to read the current board without changing it. Use this instead of describing board changes — operate the screen directly.",
  schema: patch,
  run: async (args) => {
    const draft = await readBoardDraft();

    const mutating =
      args.setDate !== undefined ||
      args.assignOrders !== undefined ||
      args.addRoute !== undefined ||
      args.setVehicle !== undefined ||
      args.setDriver !== undefined ||
      args.moveStop !== undefined ||
      args.removeRoute !== undefined ||
      args.setNotes !== undefined ||
      args.clear === true;

    if (!mutating) {
      // Pure read — never bump the rev for inspection.
      return { ok: true, draft };
    }

    if (args.expectedRev !== undefined && args.expectedRev !== draft.rev) {
      return {
        ok: false,
        error: `Board is at rev ${draft.rev}, not ${args.expectedRev} — re-read with a bare board-set-draft call and re-apply.`,
        draft,
      };
    }

    if (args.clear) {
      draft.lanes = { unassigned: [], routes: [] };
      draft.notes = undefined;
    }

    if (args.setDate !== undefined && args.setDate !== draft.date) {
      draft.date = args.setDate;
      // Cards belong to a date — a date change starts a fresh board.
      draft.lanes = { unassigned: [], routes: [] };
    }

    if (args.addRoute !== undefined) {
      draft.lanes.routes.push({
        vehicleId: args.addRoute.vehicleId,
        vehicleLabel: args.addRoute.vehicleLabel,
        driverId: args.addRoute.driverId,
        driverLabel: args.addRoute.driverLabel,
        stops: [],
      });
    }

    if (args.assignOrders !== undefined) {
      const lane = laneAt(draft, args.assignOrders.routeIndex);
      if (!lane) {
        return { ok: false, error: `No route lane at index ${args.assignOrders.routeIndex}.`, draft };
      }
      for (const card of args.assignOrders.orders) {
        extractCard(draft, card.orderId);
        lane.stops.push(card);
      }
    }

    if (args.setVehicle !== undefined) {
      const lane = laneAt(draft, args.setVehicle.routeIndex);
      if (!lane) {
        return { ok: false, error: `No route lane at index ${args.setVehicle.routeIndex}.`, draft };
      }
      lane.vehicleId = args.setVehicle.vehicleId ?? undefined;
      lane.vehicleLabel = args.setVehicle.vehicleId ? args.setVehicle.vehicleLabel : undefined;
    }

    if (args.setDriver !== undefined) {
      const lane = laneAt(draft, args.setDriver.routeIndex);
      if (!lane) {
        return { ok: false, error: `No route lane at index ${args.setDriver.routeIndex}.`, draft };
      }
      lane.driverId = args.setDriver.driverId ?? undefined;
      lane.driverLabel = args.setDriver.driverId ? args.setDriver.driverLabel : undefined;
    }

    if (args.moveStop !== undefined) {
      const { orderId, fromRouteIndex, toRouteIndex, position } = args.moveStop;
      const fromLane =
        fromRouteIndex === -1 ? null : laneAt(draft, fromRouteIndex);
      if (fromRouteIndex !== -1 && !fromLane) {
        return { ok: false, error: `No route lane at index ${fromRouteIndex}.`, draft };
      }
      const source =
        fromRouteIndex === -1 ? draft.lanes.unassigned : (fromLane as BoardRouteLane).stops;
      const i = source.findIndex((c) => c.orderId === orderId);
      if (i < 0) {
        return {
          ok: false,
          error: `Order ${orderId} is not in ${fromRouteIndex === -1 ? "the unassigned lane" : `route lane ${fromRouteIndex}`}.`,
          draft,
        };
      }
      const [card] = source.splice(i, 1);
      const target =
        toRouteIndex === -1 ? draft.lanes.unassigned : laneAt(draft, toRouteIndex)?.stops;
      if (!target) {
        // Put the card back before failing.
        source.splice(i, 0, card);
        return { ok: false, error: `No route lane at index ${toRouteIndex}.`, draft };
      }
      const at = position === undefined ? target.length : Math.min(position, target.length);
      target.splice(at, 0, card);
    }

    if (args.removeRoute !== undefined) {
      const lane = laneAt(draft, args.removeRoute);
      if (!lane) {
        return { ok: false, error: `No route lane at index ${args.removeRoute}.`, draft };
      }
      draft.lanes.routes.splice(args.removeRoute, 1);
      draft.lanes.unassigned.push(...lane.stops);
    }

    if (args.setNotes !== undefined) draft.notes = args.setNotes;

    await writeBoardDraft(draft);
    return { ok: true, draft: await readBoardDraft() };
  },
});
