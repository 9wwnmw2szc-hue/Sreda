"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { adminGet, AdminApiError } from "./admin-api";

type SearchResult = {
  users: {
    publicId: string;
    name: string;
    username: string;
    email: string | null;
  }[];
  businesses: {
    publicId: string;
    name: string;
    industry: string | null;
    archived: boolean;
  }[];
};

export function AdminSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const listId = useId();

  useEffect(() => {
    const trimmed = q.trim();
    const handle = window.setTimeout(() => {
      if (trimmed.length < 2) {
        setResults(null);
        setError("");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      void (async () => {
        try {
          const data = await adminGet<SearchResult>(
            `/api/admin/search?q=${encodeURIComponent(trimmed)}`,
          );
          setResults(data);
          setOpen(true);
        } catch (e) {
          setResults(null);
          setError(
            e instanceof AdminApiError
              ? e.message
              : "Не удалось выполнить поиск",
          );
          setOpen(true);
        } finally {
          setLoading(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hasHits =
    (results?.users.length ?? 0) > 0 || (results?.businesses.length ?? 0) > 0;

  return (
    <div
      className="admin-search"
      ref={wrapRef}
      role="combobox"
      aria-expanded={open && q.trim().length >= 2}
      aria-controls={listId}
      aria-haspopup="listbox"
    >
      <label className="admin-search__label" htmlFor={inputId}>
        <Search size={16} strokeWidth={1.8} aria-hidden />
        <span className="sr-only">Глобальный поиск</span>
      </label>
      <input
        id={inputId}
        type="search"
        className="admin-search__input"
        placeholder="Поиск: пользователи, бизнесы…"
        value={q}
        autoComplete="off"
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (q.trim().length >= 2) setOpen(true);
        }}
      />
      {q ? (
        <button
          type="button"
          className="admin-search__clear"
          aria-label="Очистить поиск"
          onClick={() => {
            setQ("");
            setResults(null);
            setOpen(false);
          }}
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
      {open && q.trim().length >= 2 ? (
        <div
          id={listId}
          className="admin-search__dropdown"
          role="listbox"
          aria-label="Результаты поиска"
        >
          {loading ? (
            <p className="admin-search__hint">Ищем…</p>
          ) : error ? (
            <p className="admin-search__hint admin-search__hint--error" role="alert">
              {error}
            </p>
          ) : !hasHits ? (
            <p className="admin-search__hint">Ничего не найдено</p>
          ) : (
            <>
              {results!.users.length > 0 ? (
                <div className="admin-search__group">
                  <p className="admin-search__group-title">Пользователи</p>
                  <ul>
                    {results!.users.map((u) => (
                      <li key={u.publicId}>
                        <Link
                          href={`/admin/users/${u.publicId}`}
                          role="option"
                          onClick={() => setOpen(false)}
                        >
                          <strong>{u.name}</strong>
                          <span>@{u.username}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {results!.businesses.length > 0 ? (
                <div className="admin-search__group">
                  <p className="admin-search__group-title">Бизнесы</p>
                  <ul>
                    {results!.businesses.map((b) => (
                      <li key={b.publicId}>
                        <Link
                          href={`/admin/businesses/${b.publicId}`}
                          role="option"
                          onClick={() => setOpen(false)}
                        >
                          <strong>{b.name}</strong>
                          <span>{b.industry ?? b.publicId}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
