"use client"

import { createAuthClient } from "better-auth/react"
import { jwtClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  basePath: "/api/auth",
  plugins: [jwtClient()],
})

export const { signIn, signOut, signUp, useSession } = authClient

export const signInWithGitHub = async () => {
  return await signIn.social({ provider: "github" })
}

export const signInWithGoogle = async () => {
  return await signIn.social({ provider: "google" })
}

export const signInWithMicrosoft = async () => {
  return await signIn.social({ provider: "microsoft" })
}

export type SessionData =
  | {
      session?: {
        id: string
        userId: string
        expiresAt: Date
        token?: string
      }
      user?: {
        id: string
        email: string
        name?: string | null
        image?: string | null
      }
    }
  | null
  | undefined

let cachedToken: string | undefined
let cachedAtMs = 0
let inflightTokenPromise: Promise<string | undefined> | null = null
let cooldownUntilMs = 0

const TOKEN_TTL_MS = 30_000 // 30s
const COOL_DOWN_MS_DEFAULT = 30_000 // 30s after 429

export async function getJWTToken(
  session?: SessionData
): Promise<string | undefined> {
  if (!session?.session) return undefined

  const now = Date.now()

  // Respect cooldown after rate limiting
  if (now < cooldownUntilMs && cachedToken) {
    return cachedToken
  }

  // Serve from cache if fresh
  if (cachedToken && now - cachedAtMs < TOKEN_TTL_MS) {
    return cachedToken
  }

  // De-duplicate concurrent requests
  if (inflightTokenPromise) return inflightTokenPromise

  inflightTokenPromise = (async () => {
    try {
      const { data, error } = await authClient.token()

      if (error) {
        // If server is rate limiting, enter cooldown but return last known token if available
        const status = (error as any)?.status
        if (status === 429) {
          cooldownUntilMs = Date.now() + COOL_DOWN_MS_DEFAULT
          return cachedToken // may be undefined
        }
        console.error("Failed to get JWT token:", error)
        return cachedToken // fall back to cached if any
      }

      if (data?.token && typeof data.token === "string") {
        cachedToken = data.token
        cachedAtMs = Date.now()
        return cachedToken
      }
      return cachedToken // unchanged
    } catch (err) {
      // Network or other error; do not spam retries
      console.error("Error fetching JWT token:", err)
      return cachedToken
    } finally {
      inflightTokenPromise = null
    }
  })()

  return inflightTokenPromise
}
