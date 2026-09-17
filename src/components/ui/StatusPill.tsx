import { cn } from "@/lib/cn";
import type { LeadStatus, PostStatus } from "@/types";

const leadStyles: Record<LeadStatus, string> = {
  new: "bg-[color-mix(in_srgb,var(--success)_16%,white)] text-[var(--success)]",
  processing:
    "bg-[color-mix(in_srgb,var(--warning)_18%,white)] text-[#9a6b12]",
  waiting_customer:
    "bg-[color-mix(in_srgb,var(--warning)_12%,white)] text-[#8a6410]",
  completed:
    "bg-[color-mix(in_srgb,var(--success)_12%,white)] text-[var(--success)]",
  rejected: "bg-[var(--surface-elevated)] text-[var(--text-muted)]",
  closed: "bg-[var(--surface-elevated)] text-[var(--text-muted)]",
};

const postStyles: Record<PostStatus, string> = {
  published:
    "bg-[color-mix(in_srgb,var(--success)_16%,white)] text-[var(--success)]",
  scheduled: "bg-[var(--surface-elevated)] text-[var(--text-secondary)]",
  draft: "bg-[var(--surface-elevated)] text-[var(--text-muted)]",
};

export function LeadStatusPill({ status, label }: { status: LeadStatus; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        leadStyles[status],
      )}
    >
      {label}
    </span>
  );
}

export function PostStatusPill({ status, label }: { status: PostStatus; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        postStyles[status],
      )}
    >
      {label}
    </span>
  );
}
