import { betterAuth } from "better-auth"
import { db } from "./db"

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  basePath: "/api/auth",
  database: db, // Better-auth supports SQLite directly via Kysely adapter
  emailAndPassword: {
    enabled: false, // We only want Google SSO
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    },
  },
  secret: process.env.BETTER_AUTH_SECRET || "your-secret-key-change-in-production",
})

