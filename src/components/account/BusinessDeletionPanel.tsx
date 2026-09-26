"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiRequest, ClientError } from "@/lib/apiClient";
import {
  BUSINESS_DELETION_PHRASE,
  type BusinessDeletionImpact,
} from "@/lib/businessDeletion";

type Step = "closed" | "warn" | "impact" | "confirm";

export function BusinessDeletionPanel({
  businessId,
  businessName,
  onDeleted,
}: {
  businessId: string;
  businessName: string;
  onDeleted?: () => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>("closed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [impact, setImpact] = useState<BusinessDeletionImpact | null>(null);
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (step !== "closed") {
      if (!dialog.open) dialog.showModal();
      cancelRef.current?.focus();
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
  }, [step]);

  function close() {
    if (busy) return;
    setStep("closed");
    setError("");
    setPassword("");
    setConfirmation("");
  }

  async function loadImpactAndRequest() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiRequest<{
        token: string;
        impact: BusinessDeletionImpact;
      }>(`/api/v1/businesses/${businessId}/deletion`, {
        method: "POST",
        body: JSON.stringify({ action: "request" }),
      });
      setToken(res.token);
      setImpact(res.impact);
      setStep("impact");
    } catch (e) {
      setError(
        e instanceof ClientError || e instanceof Error
          ? e.message
          : "Не удалось подготовить удаление",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy || !impact) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1/businesses/${businessId}/deletion`, {
        method: "POST",
        body: JSON.stringify({
          action: "confirm",
          token,
          password,
          confirmation,
        }),
      });
      close();
      await onDeleted?.();
    } catch (e) {
      setError(
        e instanceof ClientError || e instanceof Error
          ? e.message
          : "Не удалось удалить бизнес",
      );
      setBusy(false);
    }
  }

  const nameOk =
    confirmation === BUSINESS_DELETION_PHRASE ||
    confirmation === businessName.trim();

  return (
    <section className="panel settings-panel business-danger-zone">
      <h2 className="text-section-title">Опасная зона бизнеса</h2>
      <p className="account-footnote">
        Бизнес и связанные с ним данные будут удалены. Это действие может быть
        необратимым. Аккаунт «БизнеСоты» при этом сохранится.
      </p>
      <button
        type="button"
        className="button button--danger"
        disabled={busy}
        aria-haspopup="dialog"
        aria-expanded={step !== "closed"}
        onClick={() => {
          setError("");
          setStep("warn");
        }}
      >
        Удалить бизнес
      </button>
      {error && step === "closed" ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}

      {step !== "closed" ? (
        <dialog
          ref={dialogRef}
          className="sign-out-dialog account-deletion-dialog"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="sign-out-dialog__inner">
            {step === "warn" ? (
              <>
                <h2 id={titleId}>Удалить бизнес?</h2>
                <p id={descId}>
                  Будет удалён бизнес «{businessName}». Сотрудники, клиенты,
                  заявки, заказы, записи, сообщения, публикации и подключённые
                  Telegram/VK этого бизнеса станут недоступны. Ваш личный
                  аккаунт «БизнеСоты» не удаляется.
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
                    onClick={close}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busy}
                    onClick={() => void loadImpactAndRequest()}
                  >
                    {busy ? "Проверяем…" : "Продолжить"}
                  </button>
                </div>
              </>
            ) : null}

            {step === "impact" && impact ? (
              <>
                <h2 id={titleId}>Что будет затронуто</h2>
                <div id={descId} className="account-deletion-impact">
                  <p>
                    Бизнес «{impact.name}» и связанные данные будут архивированы
                    и доступ к ним будет закрыт.
                  </p>
                  <ul className="business-deletion-impact-list">
                    <li>Сотрудники: {impact.members}</li>
                    <li>Клиенты: {impact.customers}</li>
                    <li>Заявки: {impact.leads}</li>
                    <li>Заказы: {impact.orders}</li>
                    <li>Записи: {impact.bookings}</li>
                    <li>Сообщения: {impact.conversations}</li>
                    <li>Публикации: {impact.posts}</li>
                    <li>Товары: {impact.products}</li>
                    <li>Подключения Telegram/VK: {impact.connections}</li>
                    <li>Файлы: {impact.files}</li>
                    <li>
                      Привязки админ-каналов: {impact.channelAdminBindings}
                    </li>
                  </ul>
                </div>
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
                    onClick={close}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setStep("confirm");
                    }}
                  >
                    Дальше
                  </button>
                </div>
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <h2 id={titleId}>Удалить бизнес навсегда</h2>
                <p id={descId}>
                  Введите пароль и название бизнеса «{businessName}» либо слово{" "}
                  <strong>{BUSINESS_DELETION_PHRASE}</strong>.
                </p>
                <label className="account-deletion-field">
                  Пароль
                  <input
                    type="password"
                    className="input"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="account-deletion-field">
                  Подтверждение
                  <input
                    type="text"
                    className="input"
                    autoComplete="off"
                    placeholder={BUSINESS_DELETION_PHRASE}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    disabled={busy}
                  />
                </label>
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
                    onClick={() => setStep("impact")}
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    className="button button--danger"
                    disabled={busy || password.length < 10 || !nameOk}
                    onClick={() => void confirmDelete()}
                  >
                    {busy ? "Удаляем…" : "Удалить бизнес навсегда"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
