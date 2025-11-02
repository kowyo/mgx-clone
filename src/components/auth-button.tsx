"use client"

import { Button } from "@/components/ui/button"
import { useSession, signIn, signOut } from "@/lib/auth-client"
import { Loader2 } from "lucide-react"

export function AuthButton() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading...
      </Button>
    )
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        {session.user.image && (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="h-6 w-6 rounded-full shrink-0"
          />
        )}
        <span className="text-sm text-muted-foreground truncate max-w-[150px]">
          {session.user.name || session.user.email}
        </span>
        <Button variant="ghost" size="sm" onClick={() => signOut()} className="shrink-0">
          Sign Out
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() =>
        signIn.social({
          provider: "google",
        })
      }
    >
      Sign in with Google
    </Button>
  )
}

