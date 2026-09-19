"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemePreference } from "@/config/brand";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "system", label: "Как в системе" },
];

export function ThemeAppearancePanel() {
  const { preference, setPreference } = useTheme();
  return (
    <section className="panel settings-panel theme-appearance-panel" aria-labelledby="theme-heading">
      <h2 id="theme-heading" className="text-section-title">Внешний вид</h2>
      <p className="text-body-sm">
        Тема применяется сразу и сохраняется на этом устройстве.
      </p>
      <div className="theme-appearance-panel__options" role="radiogroup" aria-label="Тема">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="theme-appearance-panel__option">
            <input
              type="radio"
              name="theme"
              value={opt.value}
              checked={preference === opt.value}
              onChange={() => setPreference(opt.value)}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
