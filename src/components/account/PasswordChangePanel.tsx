"use client";
import { useState } from "react";
import { apiRequest } from "@/lib/apiClient";

export function PasswordChangePanel() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit() {
    setError(""); setNotice("");
    if (newPassword !== confirmation) { setError("Пароли не совпадают."); return; }
    setBusy(true);
    try {
      await apiRequest("/api/v1/account/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation: confirmation }) });
      setNotice("Пароль изменён. Остальные сеансы завершены. В этой вкладке можно продолжать работу.");
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить пароль."); }
    finally { setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setBusy(false); }
  }
  return <section className="panel settings-panel">
    <h2 className="text-section-title">Смена пароля</h2>
    <p className="text-body-sm">После смены пароля на других устройствах потребуется войти заново. Резервные коды продолжат работать.</p>
    <form className="form-stack form-stack--md" onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}>
      <fieldset className="form-stack form-stack--md" disabled={busy}>
        <label className="field" htmlFor="change-current-password">
          <span className="field__label">Текущий пароль</span>
          <input className="field__control" id="change-current-password" type="password" autoComplete="current-password" minLength={10} maxLength={128} required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="field" htmlFor="change-new-password">
          <span className="field__label">Новый пароль</span>
          <input className="field__control" id="change-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <label className="field" htmlFor="change-password-confirmation">
          <span className="field__label">Повторите новый пароль</span>
          <input className="field__control" id="change-password-confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <p className="field-hint">От 10 до 128 символов. Используйте пароль, которого нет у вас в других сервисах.</p>
        <div className="actions-row">
          <button className="button button--primary" type="submit">{busy ? "Сохраняем…" : "Изменить пароль"}</button>
        </div>
      </fieldset>
    </form>
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
  </section>;
}
