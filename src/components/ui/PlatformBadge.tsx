import Image from "next/image";
import { cn } from "@/lib/cn";
import { platformLabel } from "@/lib/labels";
import { SREDA_ASSETS } from "@/config/assets";
import type { Platform } from "@/types";

export function PlatformBadge({
  platform,
  compact = false,
  className,
}: {
  platform: Platform;
  compact?: boolean;
  className?: string;
}) {
  const label = platformLabel(platform);
  const iconSrc =
    platform === "telegram"
      ? SREDA_ASSETS.icons.telegram
      : platform === "vk"
        ? SREDA_ASSETS.icons.vk
        : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)]",
        className,
      )}
      title={label}
    >
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          width={100}
          height={130}
          className={cn(
            "shrink-0 object-contain",
            compact ? "h-8 w-8 md:h-9 md:w-9" : "h-9 w-9",
          )}
          aria-hidden
        />
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[10px] font-bold text-[var(--text-muted)]">
          M
        </span>
      )}
      {!compact ? <span>{label}</span> : null}
    </span>
  );
}
