import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Minimal structural type of the agent-native AuthSession (avoids a hard
 * dependency on @agent-native/core from this package). Compatible with
 * `AuthSession` in packages/core/src/server/auth.ts.
 */
export interface AppwriteAuthSession {
  email: string;
  userId?: string;
  token?: string;
  name?: string;
  orgId?: string;
  orgRole?: string;
}

/** Minimal structural view of the H3 event the auth plugin passes in. */
export interface SessionEvent {
  headers: Headers;
}

export interface AppwriteSessionOptions {
  /** JWKS URL, e.g. https://api.futurebuild.ai/v1/oauth2/jwks. Defaults to env APPWRITE_JWKS_URL. */
  jwksUrl?: string;
  /** Claim carrying the org/team id. Default "org_id", fallback "teamId". */
  orgClaim?: string;
  /** Map IdP/team role -> agent-native orgRole (owner|admin|member). */
  roleMap?: Record<string, string>;
  /** Expected audience (Appwrite project id). Skipped when unset. */
  audience?: string;
  /** Expected issuer. Skipped when unset. */
  issuer?: string;
  /** Test hook: verify function override. */
  verify?: (token: string) => Promise<JWTPayload>;
}

const DEFAULT_ROLE_MAP: Record<string, string> = {
  owner: "owner",
  org_admin: "admin",
  admin: "admin",
  operator: "admin",
  reviewer: "member",
  member: "member",
};

function extractToken(event: SessionEvent): string | null {
  const auth = event.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const cookie = event.headers.get("cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === "aw_jwt") return decodeURIComponent(v.join("="));
    }
  }
  return null;
}

/**
 * BYOA getSession for agent-native apps: verifies an Appwrite-issued JWT
 * (Authorization: Bearer header or `aw_jwt` cookie) against Appwrite's JWKS
 * and maps claims to the framework session shape.
 *
 * Claim mapping: email <- email; userId <- sub; name <- name;
 * orgId <- org_id (or teamId); orgRole <- roles[0]/role mapped via roleMap.
 */
export function makeAppwriteGetSession(options: AppwriteSessionOptions = {}) {
  const jwksUrl = options.jwksUrl ?? process.env.APPWRITE_JWKS_URL;
  if (!jwksUrl) {
    throw new Error("@gable/client: APPWRITE_JWKS_URL is required for Appwrite BYOA auth");
  }
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  const roleMap = { ...DEFAULT_ROLE_MAP, ...(options.roleMap ?? {}) };
  const orgClaim = options.orgClaim ?? "org_id";

  const verify =
    options.verify ??
    (async (token: string): Promise<JWTPayload> => {
      const { payload } = await jwtVerify(token, jwks, {
        audience: options.audience ?? process.env.APPWRITE_PROJECT_ID ?? undefined,
        issuer: options.issuer,
      });
      return payload;
    });

  return async function getSession(event: SessionEvent): Promise<AppwriteAuthSession | null> {
    const token = extractToken(event);
    if (!token) return null;
    let claims: JWTPayload;
    try {
      claims = await verify(token);
    } catch {
      return null;
    }
    const email = typeof claims.email === "string" ? claims.email : undefined;
    if (!email) return null;

    const roles = Array.isArray(claims.roles)
      ? (claims.roles as unknown[]).filter((r): r is string => typeof r === "string")
      : [];
    const rawRole = (typeof claims.role === "string" && claims.role) || roles[0] || "member";
    const orgId =
      (typeof claims[orgClaim] === "string" && (claims[orgClaim] as string)) ||
      (typeof claims.teamId === "string" ? (claims.teamId as string) : undefined);

    return {
      email,
      userId: typeof claims.sub === "string" ? claims.sub : undefined,
      token,
      name: typeof claims.name === "string" ? claims.name : undefined,
      orgId,
      orgRole: roleMap[rawRole] ?? "member",
    };
  };
}
