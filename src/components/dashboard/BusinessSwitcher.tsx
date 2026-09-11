"use client";
import { ChevronDown, Coffee, Scissors } from "lucide-react";
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
  const Icon = currentBusiness?.id === "biz_boroda" ? Scissors : Coffee;
  return (
    <label className="business-switcher">
      <span className="business-switcher__icon">
        <Icon size={20} aria-hidden />
      </span>
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
      <ChevronDown size={16} aria-hidden />
    </label>
  );
}
