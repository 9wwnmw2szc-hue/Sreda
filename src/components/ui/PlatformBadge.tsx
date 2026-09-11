import { Send } from "lucide-react";
import { platformLabel } from "@/lib/labels";
import type { Platform } from "@/types";
export function PlatformBadge({
  platform,
  compact = false,
  className = "",
}: {
  platform: Platform;
  compact?: boolean;
  className?: string;
}) {
  const label = platformLabel(platform);
  return (
    <span
      className={`platform-badge ${compact ? "platform-badge--compact" : ""} ${className}`}
      title={label}
    >
      <span className={`platform-icon platform-icon--${platform}`} aria-hidden>
        {platform === "telegram" ? (
          <Send size={19} fill="currentColor" strokeWidth={1.2} />
        ) : platform === "vk" ? (
          <b>vk</b>
        ) : (
          <b>M</b>
        )}
      </span>
      {!compact ? (
        <span>{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
