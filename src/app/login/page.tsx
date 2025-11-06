import Image from "next/image"
import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <Image
              src="/mgx-logo.png"
              alt="MetaGPT X Logo"
              width={24}
              height={24}
              className="rounded-sm"
            />
          </div>
          MetaGPT X
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
