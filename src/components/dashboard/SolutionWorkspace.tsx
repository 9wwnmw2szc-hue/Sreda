"use client";

import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { SolutionModule } from "@/components/dashboard/SolutionModule";
import { WorkspaceGlassHints } from "@/components/dashboard/WorkspaceGlassHints";
import { HeroFlowNav } from "@/components/dashboard/HeroFlowNav";
import { SREDA_ASSETS } from "@/config/assets";
import {
  MOBILE_ACTIVE_ORDER,
  MOBILE_AVAILABLE_ORDER,
} from "@/config/solutions";
import { SCENE_FRAME, SCENE_PAINT_ORDER } from "@/config/scene";
import type { WorkspaceSolutionItem } from "@/hooks/useDashboardData";

interface SolutionWorkspaceProps {
  items: WorkspaceSolutionItem[];
}

/**
 * Central station scene.
 * Desktop: modules dock to tray slots via shared scene coordinates.
 * Mobile: compact horizontal cards — no scaled desktop platform.
 */
export function SolutionWorkspace({ items }: SolutionWorkspaceProps) {
  const searchParams = useSearchParams();
  const debug =
    searchParams.get("debugScene") === "1" ||
    searchParams.get("debugScene") === "true";

  const byCode = Object.fromEntries(
    items.map((item) => [item.code, item]),
  ) as Partial<Record<WorkspaceSolutionItem["code"], WorkspaceSolutionItem>>;

  const mobileActive = MOBILE_ACTIVE_ORDER.map((code) => byCode[code]).filter(
    Boolean,
  ) as WorkspaceSolutionItem[];
  const mobileAvailable = MOBILE_AVAILABLE_ORDER.map(
    (code) => byCode[code],
  ).filter(Boolean) as WorkspaceSolutionItem[];

  return (
    <section className="solution-scene relative flex min-h-0 flex-1 flex-col">
      {/* ===== Desktop / tablet (md+) ===== */}
      <div className="relative hidden flex-1 md:block">
        <WorkspaceGlassHints />

        <div
          className="solution-scene__decor-back pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden
        >
          <Image
            src={SREDA_ASSETS.decor.plantLarge}
            alt=""
            width={195}
            height={245}
            className="absolute top-[8%] -left-10 w-[88px] opacity-[0.22] blur-[2px] lg:w-[100px]"
          />
        </div>

        <div className="relative z-[10] flex justify-center px-1 pt-2 pb-1">
          <div className="solution-scene__stage relative w-full">
            <div className="solution-scene__desk-plane" aria-hidden />
            <div className="solution-scene__contact-shadow" aria-hidden />

            <div className="solution-scene__platform-root mx-auto overflow-visible">
              <div className="solution-scene__platform-frame relative w-full overflow-visible">
                <div
                  className="solution-scene__platform-board relative w-full overflow-visible"
                  style={{
                    aspectRatio: `${SCENE_FRAME.width} / ${SCENE_FRAME.height}`,
                  }}
                  data-scene-debug={debug ? "true" : undefined}
                >
                  <div className="solution-scene__platform-crop relative h-full w-full overflow-hidden">
                    <Image
                      src={SREDA_ASSETS.platform.tray}
                      alt=""
                      width={SCENE_FRAME.width}
                      height={SCENE_FRAME.height}
                      className="solution-scene__platform"
                      priority
                      sizes="(max-width: 1100px) 480px, (max-width: 1360px) 520px, 560px"
                    />
                  </div>

                  {debug ? (
                    <div
                      className="pointer-events-none absolute inset-0 z-[1] border border-cyan-400/70"
                      aria-hidden
                    />
                  ) : null}

                  <div className="solution-scene__modules pointer-events-none absolute inset-0 overflow-visible">
                    {SCENE_PAINT_ORDER.map((code) => {
                      const item = byCode[code];
                      if (!item) return null;
                      return (
                        <SolutionModule
                          key={code}
                          item={item}
                          placement="absolute"
                          className="pointer-events-auto"
                          debug={debug}
                        />
                      );
                    })}
                  </div>

                  {debug
                    ? SCENE_PAINT_ORDER.map((code) => {
                        const item = byCode[code];
                        if (!item) return null;
                        const { dock } = item.visual;
                        return (
                          <span
                            key={`label-debug-${code}`}
                            className="pointer-events-none absolute z-[9] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-amber-300 ring-1 ring-black/50"
                            style={{
                              left: `${dock.labelX * 100}%`,
                              top: `${dock.labelY * 100}%`,
                            }}
                            aria-hidden
                          />
                        );
                      })
                    : null}
                </div>
              </div>
            </div>

            <div
              className="solution-scene__decor-front pointer-events-none absolute bottom-[-4%] left-[-4px] hidden xl:block"
              aria-hidden
            >
              <Image
                src={SREDA_ASSETS.decor.coffee}
                alt=""
                width={240}
                height={235}
                className="w-[64px] opacity-80 drop-shadow-[0_12px_18px_rgba(0,0,0,0.35)]"
              />
            </div>
          </div>
        </div>

        <div className="solution-scene__flow relative z-[40]">
          <HeroFlowNav />
        </div>
      </div>

      {/* ===== Mobile — separate composition ===== */}
      <div className="flex flex-col gap-5 md:hidden">
        {mobileActive.length > 0 ? (
          <div>
            <p className="mb-3 text-[11px] font-medium tracking-[0.1em] text-white/50 uppercase">
              Ваши решения
            </p>
            <div className="flex flex-col gap-3">
              {mobileActive.map((item) => (
                <div key={item.solution.id} className="mobile-solution-card">
                  <SolutionModule
                    item={item}
                    placement="flow"
                    size="mobile"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {mobileAvailable.length > 0 ? (
          <div>
            <p className="mb-3 text-[11px] font-medium tracking-[0.1em] text-white/50 uppercase">
              Доступные решения
            </p>
            <div className="flex flex-col gap-3">
              {mobileAvailable.map((item) => (
                <div key={item.solution.id} className="mobile-solution-card">
                  <SolutionModule
                    item={item}
                    placement="flow"
                    size="mobile"
                  />
                  <Link
                    href="/solutions"
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[18px] bg-white/12 px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-white/18"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Подключить · {item.solution.price} ₽/мес.
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
