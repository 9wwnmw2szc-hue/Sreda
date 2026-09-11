"use client";
import { Search, X } from "lucide-react";
export function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="dashboard-search">
      <Search size={19} aria-hidden />
      <label className="sr-only" htmlFor="dashboard-search">
        Поиск по рабочему пространству
      </label>
      <input
        id="dashboard-search"
        type="search"
        placeholder="Поиск по заявкам, решениям, постам…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      {value ? (
        <button
          className="icon-button"
          aria-label="Очистить поиск"
          onClick={() => onChange("")}
        >
          <X size={17} />
        </button>
      ) : (
        <kbd aria-hidden>Поиск</kbd>
      )}
    </div>
  );
}
