import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { UIMessage } from "ai";
import type { ComponentProps, HTMLAttributes } from "react";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full items-end justify-end gap-2 py-2",
      from === "user" ? "is-user" : "is-assistant flex-row-reverse justify-end",
      className,
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "flat";
};

export const MessageContent = ({
  children,
  className,
  variant = "default",
  ...props
}: MessageContentProps) => {
  const isFlat = variant === "flat";

  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-foreground text-sm",
        // Default variant styling
        !isFlat && [
          "overflow-hidden rounded-lg py-3",
          "px-4 group-[.is-assistant]:pl-2",
          "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
        ],
        // Flat variant styling
        isFlat && [
          "group-[.is-user]:bg-secondary/50 group-[.is-user]:border group-[.is-user]:border-border/50 group-[.is-user]:rounded-lg group-[.is-user]:px-4 group-[.is-user]:py-3",
          "group-[.is-assistant]:w-full group-[.is-assistant]:p-0",
        ],
        className,
      )}
      {...props}
    >
      <div className="is-user:dark">{children}</div>
    </div>
  );
};

export type MessageAvatarProps = ComponentProps<typeof Avatar> & {
  src: string;
  name?: string;
};

export const MessageAvatar = ({
  src,
  name,
  className,
  ...props
}: MessageAvatarProps) => (
  <Avatar
    className={cn("size-8 ring ring-1 ring-border", className)}
    {...props}
  >
    <AvatarImage alt="" className="mt-0 mb-0" src={src} />
    <AvatarFallback>{name?.slice(0, 2) || "ME"}</AvatarFallback>
  </Avatar>
);
