"use client";

import { useEffect, useId, useRef, useState } from "react";

export function AdminConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  requireReason = false,
  reasonLabel = "Причина",
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

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

  if (!open) return null;

  const reasonOk =
    !requireReason || (reason.trim().length >= 3 && reason.trim().length <= 500);

  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        className="admin-dialog__inner"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && reasonOk) onConfirm(reason.trim());
        }}
      >
        <h2 id={titleId}>{title}</h2>
        {description ? <p id={descId}>{description}</p> : null}
        {requireReason ? (
          <label className="admin-dialog__reason" htmlFor={reasonId}>
            <span>
              {reasonLabel}
              <span aria-hidden> *</span>
            </span>
            <textarea
              id={reasonId}
              rows={3}
              maxLength={500}
              required
              minLength={3}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Не менее 3 символов"
            />
          </label>
        ) : null}
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-dialog__actions">
          <button
            ref={cancelRef}
            type="button"
            className="button button--outline"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className={`button ${danger ? "button--danger" : "button--primary"}`}
            disabled={busy || !reasonOk}
          >
            {busy ? "Выполняется…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
