"use client";
import Link from "next/link";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

export function RecoverAccountForm() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit() {
    setError("");
    if (password !== confirmation) { setError("Пароли не совпадают."); return; }
    setBusy(true);
    try {
      await apiRequest("/api/v1/account/recover", { method: "POST", body: JSON.stringify({ username, recoveryCode: code, newPassword: password, passwordConfirmation: confirmation }) });
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось восстановить доступ."); }
    finally { setCode(""); setPassword(""); setConfirmation(""); setBusy(false); }
  }
  return <div className="account-card">
    <span className="account-symbol"><KeyRound size={25} /></span>
    <h2>{done ? "Пароль изменён" : "Восстановить доступ"}</h2>
    {done ? <p className="account-intro" role="status">Существующие сессии завершены, PIN отключён. Войдите с новым паролем и при необходимости задайте новый PIN в настройках. Использованный резервный код больше не действует. Если коды могли попасть к посторонним, выпустите новый набор в настройках.</p> : <>
      <p className="account-intro">Нужны ваш логин и один сохранённый резервный код. Все существующие сессии будут завершены, PIN будет отключён.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) void submit(); }}><fieldset disabled={busy}>
        <label htmlFor="recover-username">Логин</label><input id="recover-username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={30} value={username} onChange={(e) => setUsername(e.target.value)} />
        <label htmlFor="recover-code">Резервный код</label><input id="recover-code" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={100} value={code} onChange={(e) => setCode(e.target.value)} />
        <label htmlFor="recover-password">Новый пароль</label><input id="recover-password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} />
        <label htmlFor="recover-confirm">Повторите новый пароль</label><input id="recover-confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="button button--primary button--full" type="submit">{busy ? "Восстанавливаем…" : "Задать новый пароль"}</button>
      </fieldset></form>
      <p className="account-footnote">Без резервного кода эта форма не сможет подтвердить владение аккаунтом. Публичный ID не заменяет код.</p>
    </>}
    <Link className="text-link account-back" href="/login">Вернуться ко входу</Link>
  </div>;
}
