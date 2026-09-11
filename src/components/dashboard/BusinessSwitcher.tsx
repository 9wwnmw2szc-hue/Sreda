"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { initialsFromName } from "@/lib/format";
import type { Business } from "@/types";

interface BusinessSwitcherProps {
  businesses: Business[];
  currentBusiness: Business | null;
  onSelect: (businessId: string) => void;
}

export function BusinessSwitcher({
  businesses,
  currentBusiness,
  onSelect,
}: BusinessSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
      width: 280,
      zIndex: 80,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onReposition() {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right),
        width: 280,
        zIndex: 80,
      });
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  const name = currentBusiness?.name ?? "Бизнес";
  const plan = currentBusiness?.planName ?? "Базовый";

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            aria-label="Выбор бизнеса"
            style={menuStyle}
            className="overflow-hidden rounded-2xl border border-white/10 bg-[#1b1e25]/96 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <ul className="space-y-1">
              {businesses.map((business) => {
                const selected = business.id === currentBusiness?.id;
                return (
                  <li key={business.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                        selected
                          ? "bg-white/10 text-white"
                          : "text-white/80 hover:bg-white/[0.06] hover:text-white",
                      )}
                      onClick={() => {
                        onSelect(business.id);
                        setOpen(false);
                      }}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                        {initialsFromName(business.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {business.name}
                      </span>
                      {selected ? (
                        <Check
                          className="h-4 w-4 text-[var(--solution-leads)]"
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/[0.06] hover:text-white"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Добавить бизнес
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative z-20">
      <button
        ref={buttonRef}
        type="button"
        className="flex h-[54px] w-full min-w-0 items-center gap-3 rounded-[22px] border border-white/12 bg-black/25 px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md transition hover:bg-black/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 md:h-[44px] md:min-w-[190px] md:max-w-[220px] md:w-auto md:rounded-[20px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#c4a484,#8b6b4a)] text-xs font-semibold text-white shadow-[0_8px_18px_rgba(0,0,0,0.25)] md:h-8 md:w-8"
          aria-hidden
        >
          {initialsFromName(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">
            {name}
          </span>
          <span className="block truncate text-xs text-white/55">
            Тариф: {plan}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-white/60 transition",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  );
}
