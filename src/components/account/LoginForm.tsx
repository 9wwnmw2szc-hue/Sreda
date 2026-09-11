"use client";
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);

  async function send() {
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest("/api/auth/email-otp/send-verification-otp", {
        method: "POST", body: JSON.stringify({ email }),
      });
      setStep("code"); setCode(""); setNotice("Письмо отправлено. Код действует 5 минут.");
      requestAnimationFrame(() => codeInput.current?.focus());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось отправить код.");
    } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError("");
    try {
      await apiRequest("/api/auth/sign-in/email-otp", {
        method: "POST", body: JSON.stringify({ email, otp: code, name: name.trim() || "Предприниматель" }),
      });
      // Full navigation drops stale React data from a previous account.
      window.location.replace("/dashboard");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось войти.");
      setBusy(false);
    }
  }
  return <div className="account-card">
    <span className="account-symbol"><Mail size={26} /></span>
    <h2>{step === "email" ? "Добро пожаловать" : "Проверьте почту"}</h2>
    <p className="account-intro">{step === "email"
      ? "Войдите или создайте аккаунт. Мы отправим одноразовый код — пароль не нужен."
      : <>Введите код из письма на <strong>{email}</strong>.</>}</p>
    <form onSubmit={(event) => { event.preventDefault(); if (!busy) void (step === "email" ? send() : verify()); }}>
      <fieldset disabled={busy}>
        {step === "email" ? <>
          <label htmlFor="account-name">Как к вам обращаться <span className="field-optional">необязательно</span></label>
          <input id="account-name" autoComplete="given-name" value={name} onChange={(event) => setName(event.target.value)}
            maxLength={80} placeholder="Ваше имя" />
          <label htmlFor="account-email">Электронная почта</label>
          <input id="account-email" type="email" autoComplete="email" inputMode="email" required maxLength={254}
            value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.ru" />
        </> : <>
          <label htmlFor="account-code">Код из письма</label>
          <input ref={codeInput} id="account-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} required value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
        </>}
        {error && <p className="account-error" role="alert">{error}</p>}
        {notice && <p className="account-notice" role="status">{notice}</p>}
        <button className="button button--primary button--full" type="submit">
          {busy ? "Подождите…" : step === "email" ? "Получить код" : "Войти в Среду"}<ArrowRight size={18} />
        </button>
        {step === "code" && <div className="account-secondary-actions">
          <button type="button" className="text-link" onClick={() => { setStep("email"); setError(""); setNotice(""); }}>
            <ArrowLeft size={16} />Другой email
          </button>
          <button type="button" className="text-link" onClick={() => void send()}>Отправить ещё раз</button>
        </div>}
      </fieldset>
    </form>
    <p className="account-footnote">{step === "email" ? "У каждого бизнеса — своё пространство. Доступ к нему есть только у его участников."
      : "Не нашли письмо? Проверьте папку «Спам». Новый код можно запросить через минуту."}</p>
  </div>;
}
