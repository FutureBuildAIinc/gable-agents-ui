# ADR 0002 — Unified auth via Appwrite OIDC

**Status:** accepted · **Date:** 2026-09-17

## Context

Agent-native apps default to Better Auth (own user/session/org tables). Gable verifies JWTs against an external `JWKS_URL` with claims `{email, roles[], org_id, role, plan_tier}` and scopes branches per-request via `X-Branch-Id`. The FB platform already designates Appwrite as the identity root: Auth + Teams (`org:<slug>`, `tenant:<org>:<slug>`), OAuth 2.1/OIDC provider with discovery + JWKS (`infra/context/FUTURESHADE-CONTEXT.md`, `infra/docs/adr/adr-011-app-shape.md`). Running two identity systems would fork the user model per app.

## Decision

1. **One user pool**: Appwrite Users in the single platform project. Teams represent orgs and dealer tenants.
2. **Micro-UIs (agent-native)**: BYOA — a custom `getSession` (`@gable/client/auth/appwrite-session.ts`) verifies the Appwrite-issued JWT against the Appwrite JWKS endpoint (using `jose`) and returns the framework `AuthSession {email, userId, name, orgId, orgRole}`. `orgId` = Appwrite Team ID; `orgRole` mapped from team role → `owner|admin|member`. Better Auth's own user pool is not used for gable-* apps.
3. **Gable**: point `JWKS_URL` at the Appwrite JWKS endpoint. Role mapping Appwrite team role → gable role (`owner/admin/sales/warehouse/finance/cashier`) is owned by the deployment config (subject to verification that team memberships surface as JWT claims — fallback: an Appwrite Function enriching userinfo, per `infra/context/FUTURESHADE-CONTEXT.md` "verify on first install").
4. **Interactive calls**: the user's Appwrite JWT flows browser → micro-UI server → gable (`Authorization: Bearer` + `X-Branch-Id`). Both sides verify against the same issuer, so no token exchange service is needed.
5. **Agent loop / background calls**: agent tool contexts carry no request headers, so actions resolve server-side credentials at call time — `X-Integration-Key` for `/api/integration/*`, or a service-account JWT stored in the app's secrets for `/api/v1/*`. Branch ID is an explicit action input (validated by gable against `user_locations` for non-admins).
6. Local dev shortcut: `AUTH_MODE=dev` on gable + `AUTH_DISABLED=true` on the micro-UI bypasses both; never in deployed environments.

## Consequences

- Sign-out/account management happens in Appwrite (FB Console), not per app.
- The open verification items (OIDC server present in self-hosted CE 2.1.0; team claims in tokens) gate step 3/4 in production; the code paths tolerate the fallback (Function-enriched claims) without API changes.
- Cross-app SSO between gable-* micro-UIs comes free: same JWT accepted everywhere, per `agent-native/packages/core/docs/content/cross-app-sso.mdx` pattern.
