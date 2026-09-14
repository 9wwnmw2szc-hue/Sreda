"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

export function RecoveryCodesPanel({ initialCodes, registration = false }: { initialCodes?: string[]; registration?: boolean }) {
  const [codes, setCodes] = useState<string[] | null>(initialCodes ?? null);
  const [remaining, setRemaining] = useState<number | null>(initialCodes?.length ?? null);
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (initialCodes) return;
    let active = true;
    void apiRequest<{ remaining: number }>("/api/v1/account/recovery-codes").then((result) => { if (active) setRemaining(result.remaining); }).catch(() => { if (active) setError("Не удалось загрузить состояние резервных кодов."); });
    return () => { active = false; };
  }, [initialCodes]);
  async function generate() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ codes: string[] }>("/api/v1/account/recovery-codes", { method: "POST", body: JSON.stringify({ currentPassword: password }) });
      setCodes(result.codes); setRemaining(result.codes.length); setSaved(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось создать коды."); }
    finally { setPassword(""); setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(codes!.join("\n")); setNotice("Коды скопированы. Сохраните их в безопасном месте."); }
    catch { setError("Не удалось скопировать автоматически. Выделите и сохраните коды вручную."); }
  }
  return <section className={registration ? "account-card" : "panel"}>
    <h2>{registration ? "Аккаунт создан. Сохраните доступ" : "Резервные коды"}</h2>
    <p>Если вы забудете пароль или потеряете Telegram/VK, логин и один резервный код помогут задать новый пароль.</p>
    <p className="account-footnote">Каждый код используется один раз. Храните их отдельно от мессенджеров — например, в менеджере паролей или на бумаге. Не передавайте коды другим людям, в том числе поддержке.</p>
    {codes ? <>
      <p>Эти коды показаны только сейчас. Позже можно будет выпустить новый набор, который отменит старый.</p>
      <ul className="recovery-codes" aria-label="Резервные коды">{codes.map((code) => <li key={code}><code>{code}</code></li>)}</ul>
      <button className="button button--outline" type="button" onClick={() => void copy()}>Скопировать коды</button>
      <label className="recovery-confirm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />Я сохранил резервные коды</label>
      <button className="button button--primary" type="button" disabled={!saved} onClick={() => { setCodes(null); setNotice("Резервные коды подготовлены."); if (registration) window.location.replace("/dashboard"); }}> {registration ? "Продолжить" : "Готово"}</button>
    </> : <>
      {remaining !== null && <p>Неиспользованных кодов: {remaining}.</p>}
      {registration && <p className="account-notice">Аккаунт уже создан. Для получения кодов подтвердите пароль; повторная регистрация не нужна.</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (!busy) void generate(); }}>
        <fieldset disabled={busy}>
          <label htmlFor="recovery-current-password">Текущий пароль</label>
          <input id="recovery-current-password" type="password" autoComplete="current-password" minLength={10} maxLength={128} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="account-footnote">Выпуск нового набора отменит все предыдущие коды, даже неиспользованные.</p>
          <button className="button button--outline" type="submit">{busy ? "Создаём…" : "Создать резервные коды"}</button>
        </fieldset>
      </form>
    </>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
  </section>;
}
