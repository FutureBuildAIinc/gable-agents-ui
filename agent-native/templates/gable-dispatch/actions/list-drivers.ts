import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { gable } from "../server/lib/gable.js";

interface IntegrationDriver {
  id: string;
  name: string;
  status?: string; // ACTIVE / INACTIVE / ON_LEAVE
  [key: string]: unknown;
}

export default defineAction({
  description:
    "List the fleet's drivers from gable's integration surface — id, name, and status (ACTIVE/INACTIVE/ON_LEAVE). Use a driver's UUID when creating a route or assigning one on the dispatch board; prefer ACTIVE drivers.",
  schema: z.object({}),
  http: { method: "GET" },
  grounding: true,
  readOnly: true,
  run: async () => {
    // Integration surface: X-Integration-Key auth only — no user token, no branch header.
    return await gable.get<IntegrationDriver[]>("/api/integration/drivers");
  },
});
