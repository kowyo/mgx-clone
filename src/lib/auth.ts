import { betterAuth } from "better-auth"
import Database from "better-sqlite3"
import { jwt } from "better-auth/plugins"

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000",
  basePath: "/api/auth",
  database: new Database("./auth.db"),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      mapProfileToUser: (profile) => ({
        name: profile.name,
        email: profile.email,
        image: profile.picture,
      }),
    },
  },
  secret:
    process.env.BETTER_AUTH_SECRET || "your-secret-key-change-in-production",
  plugins: [jwt()],
})
