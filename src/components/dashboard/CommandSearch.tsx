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
  Users,
  Package,
  X,
} from "lucide-react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/dataMode";

const COMMANDS = [
  { href: "/dashboard", label: "Перейти на главную", Icon: LayoutDashboard, tone: "orders" },
  { href: "/orders", label: "Открыть заказы", Icon: ShoppingBag, tone: "orders" },
  { href: "/leads", label: "Открыть заявки", Icon: Inbox, tone: "leads" },
  { href: "/bookings", label: "Создать запись", Icon: CalendarDays, tone: "booking" },
  { href: "/messages", label: "Открыть сообщения", Icon: MessageCircle, tone: "messages" },
  { href: "/posts", label: "Создать пост", Icon: PencilLine, tone: "autopost" },
  { href: "/clients", label: "Открыть клиентов", Icon: Users, tone: "orders" },
] as const;

type SearchHit = {
  type: "client" | "order" | "product" | "lead" | "booking";
  id: string;
  label: string;
  subtitle: string | null;
  href: string;
};

const HIT_LABEL: Record<SearchHit["type"], string> = {
  client: "Клиент",
  order: "Заказ",
  product: "Товар",
  lead: "Заявка",
  booking: "Запись",
};

const HIT_TONE: Record<SearchHit["type"], string> = {
  client: "orders",
  order: "orders",
  product: "orders",
  lead: "leads",
  booking: "booking",
};

export function CommandSearch({
  compact = false,
  mobile = false,
}: {
  compact?: boolean;
  /** Icon trigger + expandable field (mobile header). */
  mobile?: boolean;
}) {
  const router = useRouter();
  const { currentBusiness } = useBusinessContext();
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function closeAll() {
    setOpen(false);
    setExpanded(false);
    setQ("");
    setHits([]);
    setError("");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (mobile) {
          setExpanded(true);
          setOpen(true);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        } else {
          setOpen(true);
          rootRef.current?.querySelector("input")?.focus();
        }
      }
      if (e.key === "Escape") closeAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile]);

  useEffect(() => {
    if (!open && !expanded) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) closeAll();
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open, expanded]);

  useEffect(() => {
    if (expanded && mobile) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [expanded, mobile]);

  useEffect(() => {
    const term = q.trim();
    let alive = true;
    if (!currentBusiness || isDemoMode || term.length < 2) {
      const clear = window.setTimeout(() => {
        if (!alive) return;
        setHits([]);
        setLoading(false);
        setError("");
      }, 0);
      return () => {
        alive = false;
        window.clearTimeout(clear);
      };
    }
    const loadingTimer = window.setTimeout(() => {
      if (alive) setLoading(true);
    }, 0);
    const timer = window.setTimeout(() => {
      void apiRequest<{ items: SearchHit[] }>(
        `/api/v1/businesses/${currentBusiness.id}/search?q=${encodeURIComponent(term)}&limit=20`,
      )
        .then((res) => {
          if (!alive) return;
          setHits(res.items ?? []);
          setError("");
          setOpen(true);
        })
        .catch((e) => {
          if (!alive) return;
          setHits([]);
          setError(e instanceof Error ? e.message : "Не удалось найти");
          setOpen(true);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 280);
    return () => {
      alive = false;
      window.clearTimeout(loadingTimer);
      window.clearTimeout(timer);
    };
  }, [q, currentBusiness]);

  const term = q.trim().toLocaleLowerCase("ru-RU");
  const commands = term
    ? COMMANDS.filter((c) => c.label.toLocaleLowerCase("ru-RU").includes(term))
    : COMMANDS;

  function go(href: string) {
    closeAll();
    router.push(href);
  }

  const field = (
    <label className="biznesoty-command__field">
      <Search size={18} strokeWidth={1.7} aria-hidden />
      <input
        ref={inputRef}
        type="search"
        placeholder={
          mobile || compact
            ? "Поиск…"
            : "Найти клиента, заказ, товар…"
        }
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        enterKeyHint="search"
      />
      {!compact && !mobile ? <kbd aria-hidden>⌘K</kbd> : null}
      {mobile && expanded ? (
        <button
          type="button"
          className="biznesoty-command__close"
          aria-label="Закрыть поиск"
          onClick={closeAll}
        >
          <X size={18} strokeWidth={1.8} aria-hidden />
        </button>
      ) : null}
    </label>
  );

  const results =
    open || (mobile && expanded) ? (
      <ul id={listId} className="biznesoty-command__list" role="listbox">
        {loading ? <li className="biznesoty-command__empty">Ищем…</li> : null}
        {error ? (
          <li className="biznesoty-command__empty" role="alert">
            {error}
          </li>
        ) : null}
        {hits.map((hit) => (
          <li key={`${hit.type}:${hit.id}`}>
            <button
              type="button"
              className={`biznesoty-command__item biznesoty-command__item--${HIT_TONE[hit.type]}`}
              onClick={() => go(hit.href)}
            >
              <span className="biznesoty-command__icon" aria-hidden>
                {hit.type === "product" ? (
                  <Package size={16} strokeWidth={1.7} />
                ) : hit.type === "client" ? (
                  <Users size={16} strokeWidth={1.7} />
                ) : hit.type === "booking" ? (
                  <CalendarDays size={16} strokeWidth={1.7} />
                ) : hit.type === "lead" ? (
                  <Inbox size={16} strokeWidth={1.7} />
                ) : (
                  <ShoppingBag size={16} strokeWidth={1.7} />
                )}
              </span>
              <span className="biznesoty-command__meta">
                <strong>{hit.label}</strong>
                <small>
                  {HIT_LABEL[hit.type]}
                  {hit.subtitle ? ` · ${hit.subtitle}` : ""}
                </small>
              </span>
            </button>
          </li>
        ))}
        {commands.map(({ href, label, Icon, tone }) => (
          <li key={href}>
            <button
              type="button"
              className={`biznesoty-command__item biznesoty-command__item--${tone}`}
              onClick={() => go(href)}
            >
              <span className="biznesoty-command__icon" aria-hidden>
                <Icon size={16} strokeWidth={1.7} />
              </span>
              <span>{label}</span>
            </button>
          </li>
        ))}
        {!loading && !error && !hits.length && !commands.length ? (
          <li className="biznesoty-command__empty">Ничего не найдено</li>
        ) : null}
      </ul>
    ) : null;

  if (mobile) {
    return (
      <div
        className={`biznesoty-command biznesoty-command--mobile${expanded ? " is-expanded" : ""}`}
        ref={rootRef}
      >
        {!expanded ? (
          <button
            type="button"
            className="icon-button biznesoty-command__trigger"
            aria-label="Поиск"
            aria-expanded={false}
            onClick={() => {
              setExpanded(true);
              setOpen(true);
            }}
          >
            <Search size={20} strokeWidth={1.7} aria-hidden />
          </button>
        ) : (
          <div className="biznesoty-command__sheet" role="search">
            {field}
            {results}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`biznesoty-command${compact ? " biznesoty-command--compact" : ""}`}
      ref={rootRef}
    >
      {field}
      {results}
    </div>
  );
}
