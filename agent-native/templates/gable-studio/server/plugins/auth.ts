import { createAuthPlugin } from "@agent-native/core/server";

import { makeAppwriteGetSession } from "../lib/appwrite-session.js";

/**
 * BYOA auth: sessions come from Appwrite JWTs (Bearer header or `aw_jwt` cookie),
 * verified against the Appwrite JWKS endpoint. See docs/adr/0002-unified-auth-appwrite-oidc.md.
 * The verifier is inlined in server/lib/appwrite-session.ts — the studio does
 * not use @gable/client (it never calls the gable ERP).
 *
 * When APPWRITE_JWKS_URL is unset we fall back to the framework's default
 * Better Auth flow — that's the local-dev path; deployed environments must
 * always set APPWRITE_JWKS_URL.
 *
 * "/preview" is public (the allowed non-JSON public exception): preview URLs
 * are shareable static mockups; unknown ids 404.
 */
const appwriteGetSession = process.env.APPWRITE_JWKS_URL
  ? makeAppwriteGetSession()
  : undefined;

export default createAuthPlugin({
  ...(appwriteGetSession ? { getSession: appwriteGetSession } : {}),
  workspaceAppPublicPaths: ["/"],
  publicPaths: ["/preview"],
  marketing: {
    appName: "Gable Studio",
    tagline:
      "Customize or build gable micro-UI templates from chat — preview in-surface, deploy when ready.",
    features: [
      "Chat-first studio: the agent reads templates, applies edits, and shows live preview URLs",
      "Every action is shared by chat, UI, HTTP, MCP, A2A, and CLI",
      "The repo is the workspace — customizations land in templates/<name>/ and deploy to the shared catalog",
    ],
  },
});
