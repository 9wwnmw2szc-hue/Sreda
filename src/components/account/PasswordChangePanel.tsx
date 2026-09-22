"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <span className="field__password">
        <input
          className="field__control"
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={10}
          maxLength={128}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="field__password-toggle"
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? (
            <EyeOff size={18} aria-hidden />
          ) : (
            <Eye size={18} aria-hidden />
          )}
        </button>
      </span>
    </label>
  );
}

export function PasswordChangePanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit() {
    setError("");
    setNotice("");
    if (newPassword !== confirmation) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/v1/account/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          passwordConfirmation: confirmation,
        }),
      });
      setNotice(
        "Пароль изменён. Остальные сеансы завершены. В этой вкладке можно продолжать работу.",
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить пароль.");
    } finally {
      setBusy(false);
    }
  }

  const invalid =
    currentPassword.length < 10 ||
    newPassword.length < 10 ||
    confirmation.length < 10;

  return (
    <section className="panel settings-panel">
      <h2 className="text-section-title">Смена пароля</h2>
      <p className="text-body-sm">
        После смены пароля на других устройствах потребуется войти заново.
        Резервные коды продолжат работать.
      </p>
      <form
        className="form-stack form-stack--md"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) void submit();
        }}
      >
        <fieldset className="form-stack form-stack--md" disabled={busy}>
          <PasswordField
            id="change-current-password"
            label="Текущий пароль"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            id="change-new-password"
            label="Новый пароль"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <PasswordField
            id="change-password-confirmation"
            label="Повторите новый пароль"
            autoComplete="new-password"
            value={confirmation}
            onChange={setConfirmation}
          />
          <p className="field-hint">
            От 10 до 128 символов. Используйте пароль, которого нет у вас в других
            сервисах.
          </p>
          <div className="actions-row">
            <button
              className="button button--primary"
              type="submit"
              disabled={busy || invalid}
            >
              {busy ? "Сохраняем…" : "Изменить пароль"}
            </button>
          </div>
        </fieldset>
      </form>
      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
