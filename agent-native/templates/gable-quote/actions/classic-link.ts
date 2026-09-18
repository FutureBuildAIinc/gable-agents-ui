import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

/**
 * Deterministic deep link into the CLASSIC gable ERP UI (the Lit app —
 * a separately deployed frontend over the same backend; see
 * docs/steering/dual-frontend-scope.md). The agent must call this instead of
 * fabricating URLs.
 *
 * Env: CLASSIC_UI_BASE_URL, e.g. https://erp.acme.futurebuild.ai
 * (local dev: http://localhost:5173).
 */

// Verified against gable/app/src/routes.ts — the Lit UI's actual paths.
// Note: a customer's desk surface is its AR account page (/accounts/{id});
// product detail lives under /inventory/{id}.
const ENTITY_ROUTES: Record<string, string> = {
  home: "",
  quote: "/quotes/{id}",
  order: "/orders/{id}",
  invoice: "/invoices/{id}",
  product: "/inventory/{id}",
  customer: "/accounts/{id}",
};

export default defineAction({
  description:
    "Get a link that opens an entity (or the app home, entity='home') in the CLASSIC gable ERP UI (the full desk interface). Use whenever the user asks to open/view something 'in the ERP' or 'in the classic UI' — never invent URLs yourself. Returns the URL; present it as a link that opens in a new tab.",
  schema: z.object({
    entity: z.enum(["home", "quote", "order", "invoice", "product", "customer"]),
    id: z.string().uuid().optional().describe("Entity UUID (not needed for entity='home')"),
  }),
  grounding: true,
  readOnly: true,
  http: { method: "GET" },
  run: async ({ entity, id }) => {
    const base = process.env.CLASSIC_UI_BASE_URL?.replace(/\/+$/, "");
    const template = ENTITY_ROUTES[entity];
    if (!template && template !== "") throw new Error(`No classic route mapped for entity '${entity}'`);
    if (entity !== "home" && !id) throw new Error(`id is required for entity '${entity}'`);
    if (!base) {
      throw new Error(
        "CLASSIC_UI_BASE_URL is not configured — the classic ERP frontend location is unknown.",
      );
    }
    return {
      url: `${base}${template.replace("{id}", id ?? "")}`,
      openInNewTab: true,
    };
  },
});
