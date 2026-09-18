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
    appName: "Gable AR",
    tagline:
      "Agentic invoicing and accounts receivable on the Gable ERP — invoices, payments, refunds, and AR history with the agent.",
    features: [
      "Chat-first AR: the agent pulls invoices, records payments, and traces customer ledgers",
      "Every action is shared by chat, UI, HTTP, MCP, A2A, and CLI",
      "Gable stays the system of record — payments post to the AR subledger in the ERP",
    ],
  },
});
