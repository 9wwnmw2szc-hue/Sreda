"use client";

import { Search } from "lucide-react";

export function SearchField() {
  return (
    <label className="relative block w-full">
      <span className="sr-only">Поиск</span>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-white/45"
        aria-hidden
      />
      <input
        type="search"
        placeholder="Поиск по заявкам, постам, настройкам..."
        className="h-[42px] w-full rounded-[21px] border border-white/12 bg-black/25 py-2.5 pr-4 pl-11 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md placeholder:text-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 md:h-[42px] max-md:h-[49px] max-md:rounded-[23px]"
        disabled
        aria-disabled="true"
        title="Поиск появится позже"
      />
    </label>
  );
}
