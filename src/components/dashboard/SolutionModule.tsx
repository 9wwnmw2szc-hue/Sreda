"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { solutionStatusLabel } from "@/lib/labels";
import { SCENE_TYPO } from "@/config/scene";
import type { WorkspaceSolutionItem } from "@/hooks/useDashboardData";

interface SolutionModuleProps {
  item: WorkspaceSolutionItem;
  className?: string;
  /** Desktop absolute dock on platform / mobile flow card. */
  placement?: "absolute" | "flow";
  /** Mobile card sizing. */
  size?: "desktop" | "mobile";
  /** Show scene debug marks (slot + anchor). */
  debug?: boolean;
}

/**
 * One solution on the station.
 * Desktop docking: slot contact point + image anchor (not top-left of PNG).
 * Labels are siblings of the asset (not under the anchor transform).
 */
export function SolutionModule({
  item,
  className,
  placement = "flow",
  size = "desktop",
  debug = false,
}: SolutionModuleProps) {
  const isActive = item.status === "active";
  const isAvailable =
    item.status === "available" || item.status === "unavailable";
  const needsSetup = item.status === "setup_required";
  const { dock, assetSrc, assetWidth, assetHeight, accentVar, code } =
    item.visual;
  const isAbsolute = placement === "absolute";
  const showPlus = isAbsolute ? dock.plusVisible && isAvailable : isAvailable;

  const statusText = isActive
    ? "Работает"
    : needsSetup
      ? "Настроить"
      : `${item.solution.price} ₽/мес.`;

  const channelsText =
    isActive || item.status === "setup_required"
      ? "Telegram · VK"
      : "Подключается за 5 минут";

  if (isAbsolute) {
    return (
      <>
        {/* Asset — anchored to slot */}
        <Link
          href="/solutions"
          className={cn(
            "solution-module solution-module--docked group absolute",
            `solution-module--${code}`,
            className,
          )}
          style={{
            left: `${dock.slotX * 100}%`,
            top: `${dock.slotY * 100}%`,
            width: `${dock.widthFrac * 100}%`,
            transform: `translate(-${dock.anchorX * 100}%, -${dock.anchorY * 100}%)`,
            zIndex: dock.zIndex,
          }}
          aria-label={`${item.solution.name}: ${solutionStatusLabel(item.status)}`}
        >
          <span className="solution-module__asset-wrap relative block w-full">
            <Image
              src={assetSrc}
              alt=""
              width={assetWidth}
              height={assetHeight}
              className="solution-module__asset relative z-[1] h-auto w-full select-none object-contain"
              sizes="(max-width: 1100px) 140px, 180px"
              priority
            />

            {showPlus ? (
              <span
                className="solution-module__plus absolute z-[2] flex items-center justify-center"
                style={{
                  right: "4%",
                  bottom: "10%",
                  width: SCENE_TYPO.plusHitPx,
                  height: SCENE_TYPO.plusHitPx,
                }}
                aria-hidden
              >
                <span
                  className="flex items-center justify-center rounded-full border border-white/45 bg-white/20 text-white shadow-[var(--shadow-s)] backdrop-blur-md"
                  style={{
                    width: SCENE_TYPO.plusVisualPx,
                    height: SCENE_TYPO.plusVisualPx,
                  }}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                </span>
              </span>
            ) : null}

            {debug ? (
              <span
                className="pointer-events-none absolute z-[5] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-white"
                style={{
                  left: `${dock.anchorX * 100}%`,
                  top: `${dock.anchorY * 100}%`,
                }}
                aria-hidden
              />
            ) : null}
          </span>
        </Link>

        {/* Label zone — absolute frame coords, not under asset transform */}
        <div
          className="solution-module__label-zone pointer-events-none absolute z-[6] flex w-[28%] max-w-[9.5rem] -translate-x-1/2 flex-col items-center text-center"
          style={{
            left: `${dock.labelX * 100}%`,
            top: `${dock.labelY * 100}%`,
          }}
        >
          <p
            className="solution-module__title font-semibold text-white"
            style={{
              fontSize: SCENE_TYPO.labelTitlePx,
              lineHeight: SCENE_TYPO.labelLineHeight,
            }}
          >
            {item.solution.name}
          </p>
          <p
            className="solution-module__status mt-0.5 text-white/80"
            style={{
              fontSize: SCENE_TYPO.labelMetaPx,
              lineHeight: SCENE_TYPO.labelLineHeight,
            }}
          >
            <span
              className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
              style={{
                background: isActive
                  ? `var(${accentVar})`
                  : isAvailable
                    ? "rgba(255,255,255,0.45)"
                    : "var(--warning)",
              }}
              aria-hidden
            />
            {statusText}
          </p>
        </div>

        {debug ? (
          <span
            className="pointer-events-none absolute z-[8] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-400 ring-2 ring-black/40"
            style={{
              left: `${dock.slotX * 100}%`,
              top: `${dock.slotY * 100}%`,
            }}
            title={`slot ${code}`}
            aria-hidden
          />
        ) : null}
      </>
    );
  }

  /* —— Mobile / flow card —— */
  const isMobile = size === "mobile";

  return (
    <Link
      href="/solutions"
      className={cn(
        "group solution-module flex",
        isMobile
          ? "w-full flex-row items-center gap-3 text-left"
          : "flex-col items-center text-center",
        className,
      )}
      aria-label={`${item.solution.name}: ${solutionStatusLabel(item.status)}`}
    >
      <span
        className={cn(
          "solution-module__asset-wrap relative block shrink-0",
          isMobile ? "w-[72px]" : "w-full",
        )}
      >
        <Image
          src={assetSrc}
          alt=""
          width={assetWidth}
          height={assetHeight}
          className={cn(
            "solution-module__asset relative z-[1] h-auto w-full select-none object-contain",
            isMobile && "max-h-[80px]",
          )}
          sizes={isMobile ? "80px" : "170px"}
          priority
        />
      </span>

      <span className="solution-module__meta relative z-[2] flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            "font-semibold text-white",
            isMobile ? "text-[16px] leading-snug" : "text-[14px]",
          )}
        >
          {item.solution.name}
        </span>
        <span
          className={cn(
            "mt-1 text-white/75",
            isMobile ? "text-[13px] leading-snug" : "text-[12px]",
          )}
        >
          {isActive ? `● ${statusText}` : statusText}
        </span>
        {isMobile ? (
          <span className="mt-1 text-[13px] text-white/55">{channelsText}</span>
        ) : null}
      </span>
    </Link>
  );
}
