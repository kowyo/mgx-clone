import { DatabaseSync } from "node:sqlite"
import path from "path"
import fs from "fs"

// Use Node.js built-in SQLite (Node 22.5.0+, we have 24.8.0)
// This doesn't require native compilation like better-sqlite3
const dbPath = path.join(process.cwd(), "auth.db")

// Ensure the database directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Create SQLite database using Node.js built-in module
export const db = new DatabaseSync(dbPath)

