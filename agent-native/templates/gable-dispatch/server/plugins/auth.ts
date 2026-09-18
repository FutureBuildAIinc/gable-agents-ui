import { createAuthPlugin } from "@agent-native/core/server";
import { makeAppwriteGetSession } from "@gable/client/auth";

/**
 * BYOA auth: sessions come from Appwrite JWTs (Bearer header or `aw_jwt` cookie),
 * verified against the Appwrite JWKS endpoint. See docs/adr/0002-unified-auth-appwrite-oidc.md.
 *
 * When APPWRITE_JWKS_URL is unset we fall back to the framework's default
 * Better Auth flow — that's the local-dev path alongside gable's AUTH_MODE=dev;
 * deployed environments must always set APPWRITE_JWKS_URL.
 */
const appwriteGetSession = process.env.APPWRITE_JWKS_URL
  ? makeAppwriteGetSession()
  : undefined;

export default createAuthPlugin({
  ...(appwriteGetSession ? { getSession: appwriteGetSession } : {}),
  workspaceAppPublicPaths: ["/"],
  marketing: {
    appName: "Gable Dispatch",
    tagline:
      "Agentic loading, picking, and dispatch on the Gable ERP — build routes, dispatch trucks, and complete deliveries with the agent.",
    features: [
      "Chat-first dispatch: the agent pulls a day's orders and builds routes with ordered stops",
      "Dispatch trucks and complete routes from the board — with confirmation before either",
      "Gable stays the system of record — routes, stops, and POD live in the ERP",
    ],
  },
});
