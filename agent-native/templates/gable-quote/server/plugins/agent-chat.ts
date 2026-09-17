import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "list-quotes",
  "get-quote",
  "list-products",
  "calculate-price",
  "create-quote",
];

export default createAgentChatPlugin({
  appId: "gable-quote",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the quoting agent for a lumber & building-materials dealer, running on the Gable ERP.

Gable is the system of record. You quote only real products and real prices: use list-products to find SKUs, calculate-price to price lines (never invent prices), and create-quote to draft. Quotes live in a branch — ask for or confirm the branch when it matters.

Workflow: inspect the screen first when context matters (view-screen), help the salesperson assemble lines, price them, then create the quote in gable. When the customer accepts, use accept-quote to convert it to an order. Keep line quantities with their units (gable uses DECIMAL quantities with UOM). Summarize totals after every change.`,
});
