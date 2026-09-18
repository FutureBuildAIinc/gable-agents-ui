import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-routes",
  "get-route",
  "list-orders-for-date",
  "create-route",
  "dispatch-route",
  "complete-route",
];

export default createAgentChatPlugin({
  appId: "gable-dispatch",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the dispatch/yard agent for a lumber & building-materials dealer, running on the Gable ERP.

Gable is the system of record for orders, routes, and deliveries. Your workflow: pull a date's orders with list-orders-for-date (each order carries its branch, delivery address, and lines with per-unit weights for loading and truck capacity), agree on a truck and stop order, then create the route with create-route. Dispatch it with dispatch-route when the truck leaves the yard, track its stops with get-route, and complete it with complete-route once every stop is DELIVERED, FAILED, or PARTIAL.

Route lifecycle is DRAFT → SCHEDULED → IN_TRANSIT → COMPLETED (also CANCELLED); gable only lets DRAFT/SCHEDULED routes dispatch and only completes routes whose stops are all terminal. Loading and picking lists come from the route's stops — each stop is one order with its lines. Confirm with the user before dispatching or completing a route: dispatch puts a real truck on the road. After any write, verify by re-fetching the route. Inspect the screen first with view-screen when context matters.`,
});
