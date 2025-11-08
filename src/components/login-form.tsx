"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup } from "@/components/ui/field"
import { signIn } from "@/lib/auth-client"
import {
  GoogleIcon,
  GitHubIcon,
  MicrosoftIcon,
} from "@/components/social-icons"

const socialProviders = [
  {
    name: "Google",
    provider: "google" as const,
    icon: <GoogleIcon />,
  },
  {
    name: "GitHub",
    provider: "github" as const,
    icon: <GitHubIcon />,
  },
  {
    name: "Microsoft",
    provider: "microsoft" as const,
    icon: <MicrosoftIcon />,
  },
]

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
        </CardHeader>
        <CardContent>
          <form>
            <FieldGroup>
              {socialProviders.map(({ name, provider, icon }) => (
                <Field key={provider}>
                  <Button
                    variant="outline"
                    type="button"
                    onClick={async () => {
                      await signIn.social({
                        provider,
                        callbackURL: "/",
                      })
                    }}
                  >
                    {icon}
                    <span>Sign with {name}</span>
                  </Button>
                </Field>
              ))}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
