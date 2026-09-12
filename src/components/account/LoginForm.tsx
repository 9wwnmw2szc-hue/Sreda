"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

export function LoginForm({ register = false }: { register?: boolean }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    setError("");
    if (register && password !== confirmation) { setError("Пароли не совпадают."); return; }
    setBusy(true);
    try {
      await apiRequest(`/api/auth/${register ? "sign-up" : "sign-in"}/username`, {
        method: "POST", body: JSON.stringify({ username, password, ...(register ? { passwordConfirmation: confirmation } : {}) }),
      });
      window.location.replace("/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось войти."); setBusy(false);
    }
  }
  return <div className="account-card">
    <span className="account-symbol"><LockKeyhole size={26} /></span>
    <h2>{register ? "Создать аккаунт" : "Войти в Среду"}</h2>
    <p className="account-intro">{register ? "Придумайте логин и пароль — и можно начинать." : "Введите логин и пароль вашего аккаунта."}</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!busy) void submit(); }}>
      <fieldset disabled={busy}>
        <label htmlFor="account-login">Логин</label>
        <input id="account-login" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={30}
          pattern="[a-zA-Z0-9_.]{3,30}" value={username} onChange={(event) => setUsername(event.target.value)} aria-describedby="login-hint" />
        <p id="login-hint" className="account-footnote">3–30 символов: латинские буквы, цифры, точка или подчёркивание.</p>
        <label htmlFor="account-password">Пароль</label>
        <input id="account-password" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={10} maxLength={128}
          value={password} onChange={(event) => setPassword(event.target.value)} aria-describedby={register ? "password-hint" : undefined} />
        {register && <><p id="password-hint" className="account-footnote">От 10 символов.</p>
          <label htmlFor="account-confirmation">Повторите пароль</label>
          <input id="account-confirmation" type="password" autoComplete="new-password" required minLength={10} maxLength={128}
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></>}
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="button button--primary button--full" type="submit">{busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"}<ArrowRight size={18} /></button>
      </fieldset>
    </form>
    <p className="account-footnote">{register ? "Уже есть аккаунт?" : "Первый раз в Среде?"} <Link className="text-link" href={register ? "/login" : "/register"}>{register ? "Войти" : "Зарегистрироваться"}</Link></p>
  </div>;
}
