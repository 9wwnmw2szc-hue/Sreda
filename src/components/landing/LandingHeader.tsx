"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { LandingLogo } from "./LandingLogo";

const NAV = [
  { href: "#features", label: "Возможности" },
  { href: "#pricing", label: "Тарифы" },
  { href: "#contacts", label: "Контакты" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function onNavClick() {
    setOpen(false);
  }

  return (
    <header className="landing-header">
      <div className="landing-header__inner">
        <LandingLogo />
        <nav className="landing-header__nav" aria-label="Разделы сайта">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="landing-header__link">
              {item.label}
            </a>
          ))}
        </nav>
        <div className="landing-header__actions">
          <Link href="/login" className="landing-btn landing-btn--ghost landing-btn--login">
            Войти
          </Link>
          <button
            type="button"
            className="landing-burger"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      {open ? (
        <div id={menuId} className="landing-mobile-menu" role="dialog" aria-label="Меню">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="landing-mobile-menu__link"
              onClick={onNavClick}
            >
              {item.label}
            </a>
          ))}
          <Link href="/login" className="landing-btn landing-btn--ghost" onClick={onNavClick}>
            Войти
          </Link>
          <Link href="/register" className="landing-btn landing-btn--primary" onClick={onNavClick}>
            Попробовать
          </Link>
        </div>
      ) : null}
    </header>
  );
}
