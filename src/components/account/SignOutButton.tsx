"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/dataMode";

export type SignOutVariant = "outline" | "ghost" | "menu" | "sidebar";

/** Clears client auth/workspace caches but keeps theme preference (`biznesoty.theme`). */
export function clearClientAuthState() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith("sreda.") ||
        key.startsWith("biznesoty.currentBusinessId") ||
        key.startsWith("biznesoty.leadSetup") ||
        key.startsWith("biznesoty.business") ||
        key.startsWith("biznesoty.workspace") ||
        key === "biznesoty.currentBusinessId"
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* private mode / blocked storage */
  }
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
}

export async function performSignOut() {
  if (!isDemoMode) {
    await apiRequest("/api/auth/sign-out", { method: "POST", body: "{}" });
  }
  clearClientAuthState();
  window.location.replace("/login");
}

export function SignOutButton({
  variant = "outline",
  className = "",
  onSignedOut,
}: {
  variant?: SignOutVariant;
  className?: string;
  onSignedOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      cancelRef.current?.focus();
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
  }, [open]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await performSignOut();
      onSignedOut?.();
    } catch {
      setError("Не удалось выйти. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  const buttonClass =
    variant === "outline"
      ? "button button--outline sign-out-button"
      : variant === "ghost"
        ? "button button--ghost sign-out-button"
        : variant === "menu"
          ? "create-menu__item sign-out-button sign-out-button--menu"
          : "sign-out-button sign-out-button--sidebar";

  return (
    <div className={`sign-out${className ? ` ${className}` : ""}`}>
      <button
        type="button"
        className={buttonClass}
        role={variant === "menu" ? "menuitem" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Выйти из аккаунта"
        disabled={busy}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <LogOut size={variant === "sidebar" ? 18 : 16} strokeWidth={1.8} aria-hidden />
        <span>{busy ? "Выходим…" : "Выйти из аккаунта"}</span>
      </button>
      {error && !open ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      {open ? (
        <dialog
          ref={dialogRef}
          className="sign-out-dialog"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setOpen(false);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || !dialogRef.current) return;
            const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (focusable.length < 2) return;
            const first = focusable[0]!;
            const last = focusable[focusable.length - 1]!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className="sign-out-dialog__inner">
            <h2 id={titleId}>Выйти из аккаунта?</h2>
            <p id={descId}>
              Текущая сессия будет завершена на этом устройстве.
            </p>
            {error ? (
              <p className="account-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="sign-out-dialog__actions">
              <button
                ref={cancelRef}
                type="button"
                className="button button--outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="button button--primary sign-out-dialog__confirm"
                disabled={busy}
                onClick={() => void confirm()}
              >
                {busy ? "Выходим…" : "Выйти"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </div>
  );
}
