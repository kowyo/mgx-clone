import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

// Ensure we use Node.js runtime (not edge) for better-sqlite3 compatibility
export const runtime = "nodejs"

export const { GET, POST } = toNextJsHandler(auth)

