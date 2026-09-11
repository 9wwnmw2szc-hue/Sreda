import { Cable, Settings2, Sparkles } from "lucide-react";

const STEPS = [
  { label: "Подключите", icon: Cable },
  { label: "Настройте", icon: Settings2 },
  { label: "Работайте", icon: Sparkles },
] as const;

export function HeroFlowNav() {
  return (
    <nav
      aria-label="Как работает Среда"
      className="hero-flow-nav mx-auto flex items-center justify-center gap-0.5 border border-white/10 bg-[#12151b]/80 px-2 shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur-md"
    >
      {STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center">
            <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12px] font-medium text-white/88 md:px-3 md:text-[13px]">
              <Icon className="h-3.5 w-3.5 text-white/55" aria-hidden />
              {step.label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="px-0.5 text-white/25 md:px-1" aria-hidden>
                →
              </span>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
