import { createGableClient } from "@gable/client";

/**
 * Shared server-side gable client for this app.
 * Env: GABLE_API_BASE_URL, GABLE_INTEGRATION_KEY (or GABLE_SERVICE_TOKEN).
 * All gable access in this app goes through this instance — never fetch gable directly.
 */
export const gable = createGableClient();
