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
  return <section className="panel">
    <h2>Смена пароля</h2>
    <p>После смены пароля на других устройствах потребуется войти заново. Резервные коды продолжат работать.</p>
    <form className="account-card" onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}>
      <fieldset disabled={busy}>
        <label htmlFor="change-current-password">Текущий пароль</label>
        <input id="change-current-password" type="password" autoComplete="current-password" minLength={10} maxLength={128} required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        <label htmlFor="change-new-password">Новый пароль</label>
        <input id="change-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <label htmlFor="change-password-confirmation">Повторите новый пароль</label>
        <input id="change-password-confirmation" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        <p className="account-footnote">От 10 до 128 символов. Используйте пароль, которого нет у вас в других сервисах.</p>
        <button className="button button--outline" type="submit">{busy ? "Сохраняем…" : "Изменить пароль"}</button>
      </fieldset>
    </form>
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
  </section>;
}
