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
export type SessionData = {
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
} | null | undefined;

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
export async function getJWTToken(session?: SessionData): Promise<string | undefined> {
  // Check if we have an active session
  // better-auth's session structure includes a session object when authenticated
  if (!session?.session) {
    return undefined;
  }

  try {
    const { data, error } = await authClient.token();
    
    if (error) {
      console.error("Failed to get JWT token:", error);
      return undefined;
    }
    
    if (data?.token && typeof data.token === "string") {
      return data.token;
    }
    
    return undefined;
  } catch (error) {
    console.error("Error fetching JWT token:", error);
    return undefined;
  }
}

/**
 * @deprecated Use getJWTToken() instead. This function is kept for backward compatibility
 * but may not reliably extract tokens from the session object structure.
 * 
 * The session object from better-auth does not reliably include a token property,
 * and JWT tokens should be fetched via the token() API method instead.
 */
export function getSessionToken(
  session: SessionData
): string | undefined {
  return session?.session?.token;
}
