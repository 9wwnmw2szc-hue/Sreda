"use client";
import { ChevronDown, Building2 } from "lucide-react";
import type { Business } from "@/types";

interface Props {
  businesses: Business[];
  currentBusiness: Business | null;
  onSelect: (id: string) => void;
}

export function BusinessSwitcher({
  businesses,
  currentBusiness,
  onSelect,
}: Props) {
  return (
    <label className="business-switcher">
      <span className="business-switcher__icon" aria-hidden>
        <Building2 size={18} strokeWidth={1.7} />
      </span>
      <span className="business-switcher__meta">
        <small>Мой бизнес</small>
        <span className="sr-only">Выбрать бизнес</span>
        <select
          value={currentBusiness?.id ?? ""}
          onChange={(event) => onSelect(event.target.value)}
          disabled={!businesses.length}
        >
          {!businesses.length && <option value="">Загрузка бизнеса…</option>}
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </span>
      <ChevronDown size={16} aria-hidden />
    </label>
  );
}
