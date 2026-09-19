"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ShoppingBag,
  Inbox,
  CalendarDays,
  MessageCircle,
  PencilLine,
  LayoutDashboard,
} from "lucide-react";

const COMMANDS = [
  { href: "/dashboard", label: "Перейти на главную", Icon: LayoutDashboard, tone: "orders" },
  { href: "/orders", label: "Открыть заказы", Icon: ShoppingBag, tone: "orders" },
  { href: "/leads", label: "Открыть заявки", Icon: Inbox, tone: "leads" },
  { href: "/bookings", label: "Создать запись", Icon: CalendarDays, tone: "booking" },
  { href: "/messages", label: "Открыть сообщения", Icon: MessageCircle, tone: "messages" },
  { href: "/posts", label: "Создать пост", Icon: PencilLine, tone: "autopost" },
] as const;

export function CommandSearch() {
  const router = useRouter();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  const term = q.trim().toLocaleLowerCase("ru-RU");
  const items = term
    ? COMMANDS.filter((c) => c.label.toLocaleLowerCase("ru-RU").includes(term))
    : COMMANDS;

  return (
    <div className="soty-command" ref={rootRef}>
      <label className="soty-command__field">
        <Search size={18} strokeWidth={1.7} aria-hidden />
        <input
          type="search"
          placeholder="Найти раздел или действие…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
        />
        <kbd aria-hidden>⌘K</kbd>
      </label>
      {open ? (
        <ul id={listId} className="soty-command__list" role="listbox">
          {items.map(({ href, label, Icon, tone }) => (
            <li key={href}>
              <button
                type="button"
                className={`soty-command__item soty-command__item--${tone}`}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(href);
                }}
              >
                <span className="soty-command__icon" aria-hidden>
                  <Icon size={16} strokeWidth={1.7} />
                </span>
                <span>{label}</span>
              </button>
            </li>
          ))}
          {!items.length ? (
            <li className="soty-command__empty">Ничего не найдено</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
