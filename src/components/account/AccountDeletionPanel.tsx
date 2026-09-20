"use client";

import { useEffect, useId, useRef, useState } from "react";
import { apiRequest, ClientError } from "@/lib/apiClient";
import {
  ACCOUNT_DELETION_PHRASE,
  type BusinessDecision,
  type DeletionImpact,
} from "@/lib/accountDeletion";
import { clearClientAuthState } from "./SignOutButton";

type Step = "closed" | "warn" | "impact" | "confirm";

export function AccountDeletionPanel() {
  const [step, setStep] = useState<Step>("closed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [token, setToken] = useState("");
  const [decisions, setDecisions] = useState<Record<string, BusinessDecision>>(
    {},
  );
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
        impact: DeletionImpact;
      }>("/api/v1/account/deletion", {
        method: "POST",
        body: JSON.stringify({ action: "request" }),
      });
      setToken(res.token);
      setImpact(res.impact);
      const initial: Record<string, BusinessDecision> = {};
      for (const b of res.impact.ownedBusinesses) {
        initial[b.id] = {
          businessId: b.id,
          action: b.otherMembers.length ? "transfer" : "archive",
          transferToUserId: b.otherMembers[0]?.id,
        };
      }
      setDecisions(initial);
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
      await apiRequest("/api/v1/account/deletion", {
        method: "POST",
        body: JSON.stringify({
          action: "confirm",
          token,
          password,
          confirmation,
          decisions: Object.values(decisions),
        }),
      });
      clearClientAuthState();
      window.location.replace("/login?deleted=1");
    } catch (e) {
      setError(
        e instanceof ClientError || e instanceof Error
          ? e.message
          : "Не удалось удалить аккаунт",
      );
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-panel account-danger-zone">
      <h2 className="text-section-title">Опасная зона</h2>
      <p className="account-footnote">
        Удаление аккаунта приведёт к потере доступа к «Соты». Перед удалением мы
        покажем, какие бизнесы и данные будут затронуты.
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
        Удалить аккаунт
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
                <h2 id={titleId}>Удалить аккаунт?</h2>
                <p id={descId}>
                  Вы потеряете доступ к аккаунту «Соты» и связанным с ним данным.
                  Это действие может затронуть ваши бизнесы, подключения Telegram
                  и VK, настройки и другие данные.
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
                    {busy ? "Проверяем…" : "Продолжить удаление"}
                  </button>
                </div>
              </>
            ) : null}

            {step === "impact" && impact ? (
              <>
                <h2 id={titleId}>Что будет затронуто</h2>
                <div id={descId} className="account-deletion-impact">
                  {impact.ownedBusinesses.length === 0 &&
                  impact.memberBusinesses.length === 0 ? (
                    <p>У вас нет активных бизнесов. Аккаунт можно удалить.</p>
                  ) : null}
                  {impact.ownedBusinesses.map((b) => (
                    <div key={b.id} className="account-deletion-biz">
                      <strong>Владелец: {b.name}</strong>
                      <p className="account-footnote">
                        Вы единственный владелец. Выберите действие.
                        {b.memberCount > 1
                          ? " После удаления бизнеса сотрудники потеряют доступ."
                          : ""}
                      </p>
                      <label className="account-deletion-choice">
                        <input
                          type="radio"
                          name={`dec-${b.id}`}
                          checked={decisions[b.id]?.action === "archive"}
                          onChange={() =>
                            setDecisions((prev) => ({
                              ...prev,
                              [b.id]: {
                                businessId: b.id,
                                action: "archive",
                              },
                            }))
                          }
                        />
                        Удалить бизнес вместе с аккаунтом
                      </label>
                      {b.otherMembers.length > 0 ? (
                        <label className="account-deletion-choice">
                          <input
                            type="radio"
                            name={`dec-${b.id}`}
                            checked={decisions[b.id]?.action === "transfer"}
                            onChange={() =>
                              setDecisions((prev) => ({
                                ...prev,
                                [b.id]: {
                                  businessId: b.id,
                                  action: "transfer",
                                  transferToUserId:
                                    prev[b.id]?.transferToUserId ??
                                    b.otherMembers[0]?.id,
                                },
                              }))
                            }
                          />
                          Передать владение
                        </label>
                      ) : null}
                      {decisions[b.id]?.action === "transfer" &&
                      b.otherMembers.length > 0 ? (
                        <select
                          className="input"
                          value={decisions[b.id]?.transferToUserId ?? ""}
                          onChange={(e) =>
                            setDecisions((prev) => ({
                              ...prev,
                              [b.id]: {
                                businessId: b.id,
                                action: "transfer",
                                transferToUserId: e.target.value,
                              },
                            }))
                          }
                        >
                          {b.otherMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} (@{m.username}) — {m.role}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ))}
                  {impact.memberBusinesses.map((b) => (
                    <p key={b.id} className="account-footnote">
                      Участие в «{b.name}» ({b.role}) будет отозвано. Бизнес
                      останется у других участников.
                    </p>
                  ))}
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
                <h2 id={titleId}>Удалить аккаунт безвозвратно?</h2>
                <p id={descId}>
                  После завершения удаления восстановить аккаунт обычным способом
                  будет невозможно. Введите пароль и слово{" "}
                  <strong>{ACCOUNT_DELETION_PHRASE}</strong>.
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
                    placeholder={ACCOUNT_DELETION_PHRASE}
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
                    disabled={
                      busy ||
                      password.length < 10 ||
                      confirmation !== ACCOUNT_DELETION_PHRASE
                    }
                    onClick={() => void confirmDelete()}
                  >
                    {busy ? "Удаляем…" : "Удалить аккаунт"}
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
