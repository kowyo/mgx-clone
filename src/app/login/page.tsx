import { LoginForm } from "@/components/login-form"
import { MetaGPTLogo } from "@/components/social-icons"

export default function LoginPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-0.5 self-center">
          <div className="h-6 w-6 shrink-0">
            <MetaGPTLogo />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">MGX</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
