"use client"

import { useRouter } from "next/navigation"
import { useSession, signOut } from "@/lib/auth-client"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { LogOut } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu() {
  const { data: session } = useSession()
  const router = useRouter()

  if (!session?.user) {
    return null
  }

  const user = session.user

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/login")
        },
      },
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity focus:outline-none">
          <Avatar>
            <AvatarImage
              src={user.image ?? undefined}
              referrerPolicy="no-referrer"
            />
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 mr-2">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            {user.name && <p className="text-sm font-medium">{user.name}</p>}
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
