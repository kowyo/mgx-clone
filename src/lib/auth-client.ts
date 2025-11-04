"use client";

import { createAuthClient } from "better-auth/react";
import { jwtClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  basePath: "/api/auth",
  plugins: [jwtClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;

/**
 * Type for the session object returned by useSession hook.
 * This matches the structure returned by better-auth's useSession.
 */
export type SessionData =
  | {
      session?: {
        id: string;
        userId: string;
        expiresAt: Date;
        token?: string;
      };
      user?: {
        id: string;
        email: string;
        name?: string | null;
        image?: string | null;
      };
    }
  | null
  | undefined;

/**
 * Retrieves a JWT token for authenticated API requests.
 *
 * This is the recommended way to get JWT tokens with better-auth.
 * The token is fetched via the /api/auth/token endpoint, which
 * requires an active session.
 *
 * @param session - Optional session object. If not provided, checks for active session internally.
 * @returns Promise that resolves to the JWT token string, or undefined if:
 *   - No session is active
 *   - Token retrieval fails
 *   - Token endpoint returns an error
 *
 * @example
 * ```ts
 * const { data: session } = useSession();
 * const token = await getJWTToken(session);
 * if (token) {
 *   headers['Authorization'] = `Bearer ${token}`;
 * }
 * ```
 */
// Lightweight client-side cache and backoff to avoid hammering /api/auth/token
let cachedToken: string | undefined;
let cachedAtMs = 0;
let inflightTokenPromise: Promise<string | undefined> | null = null;
let cooldownUntilMs = 0;

// How long to keep a token before re-fetching (conservative short TTL)
const TOKEN_TTL_MS = 30_000; // 30s
const COOL_DOWN_MS_DEFAULT = 30_000; // 30s after 429

export async function getJWTToken(
  session?: SessionData,
): Promise<string | undefined> {
  if (!session?.session) return undefined;

  const now = Date.now();

  // Respect cooldown after rate limiting
  if (now < cooldownUntilMs && cachedToken) {
    return cachedToken;
  }

  // Serve from cache if fresh
  if (cachedToken && now - cachedAtMs < TOKEN_TTL_MS) {
    return cachedToken;
  }

  // De-duplicate concurrent requests
  if (inflightTokenPromise) return inflightTokenPromise;

  inflightTokenPromise = (async () => {
    try {
      const { data, error, response } = await authClient.token();

      if (error) {
        // If server is rate limiting, enter cooldown but return last known token if available
        const status = (error as any)?.status ?? response?.status;
        if (status === 429) {
          cooldownUntilMs = Date.now() + COOL_DOWN_MS_DEFAULT;
          return cachedToken; // may be undefined
        }
        console.error("Failed to get JWT token:", error);
        return cachedToken; // fall back to cached if any
      }

      if (data?.token && typeof data.token === "string") {
        cachedToken = data.token;
        cachedAtMs = Date.now();
        return cachedToken;
      }
      return cachedToken; // unchanged
    } catch (err) {
      // Network or other error; do not spam retries
      console.error("Error fetching JWT token:", err);
      return cachedToken;
    } finally {
      inflightTokenPromise = null;
    }
  })();

  return inflightTokenPromise;
}

/**
 * @deprecated Use getJWTToken() instead. This function is kept for backward compatibility
 * but may not reliably extract tokens from the session object structure.
 *
 * The session object from better-auth does not reliably include a token property,
 * and JWT tokens should be fetched via the token() API method instead.
 */
export function getSessionToken(session: SessionData): string | undefined {
  return session?.session?.token;
}
