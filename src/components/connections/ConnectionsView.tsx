"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bot, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { isDemoMode } from "@/lib/dataMode";
import type { Business } from "@/types";
import { apiRequest } from "@/lib/apiClient";

type Connection = { id: string; platform: "telegram" | "vk"; displayName: string | null; status: "pending" | "connected" | "error" | "disconnected" };
export function ConnectionsView() {
  const { currentBusiness } = useBusinessContext();
  if (isDemoMode) return <p className="account-footnote">Подключения доступны после входа в аккаунт.</p>;
  if (!currentBusiness) return <p className="account-footnote">Сначала создайте бизнес.</p>;
  if (currentBusiness.role !== "owner" && currentBusiness.role !== "admin") return <p className="account-footnote">Подключениями управляет владелец или администратор.</p>;
  return <ConnectionSetup key={currentBusiness.id} currentBusiness={currentBusiness} />;
}
function ConnectionSetup({ currentBusiness }: { currentBusiness: Business }) {
  const tokenInput = useRef<HTMLInputElement>(null);
  const [tokenError, setTokenError] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]); const [token, setToken] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  useEffect(() => { if (!currentBusiness) return; void apiRequest<Connection[]>(`/api/v1/businesses/${currentBusiness.id}/connections`).then(setConnections).catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить подключения.")); }, [currentBusiness]);
  async function connectTelegram() { if (busy) return; if (!token.trim()) { setTokenError("Вставьте токен бота из @BotFather."); tokenInput.current?.focus(); return; } setTokenError(""); setBusy(true); setError(""); setNotice(""); const value = token.trim(); setToken(""); try { const result = await apiRequest<{ status: Connection["status"] }>(`/api/v1/businesses/${currentBusiness.id}/connections`, { method: "POST", body: JSON.stringify({ platform: "telegram", token: value }) }); setNotice(result.status === "connected" ? "Токен Telegram проверен и сохранён." : "Подключение отправлено на проверку."); const updated = await apiRequest<Connection[]>(`/api/v1/businesses/${currentBusiness.id}/connections`); setConnections(updated); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось подключить Telegram."); } finally { setBusy(false); } }
  async function disconnectTelegram() { if (!currentBusiness) return; setBusy(true); setError(""); try { await apiRequest(`/api/v1/businesses/${currentBusiness.id}/connections?platform=telegram`, { method: "DELETE" }); setConnections((items) => items.filter((item) => item.platform !== "telegram")); setNotice("Telegram отключён, токен удалён."); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось отключить Telegram."); } finally { setBusy(false); } }
  if (!currentBusiness) return <p className="account-footnote">Сначала создайте бизнес.</p>;
  const telegram = connections.find((item) => item.platform === "telegram");
  return <div className="connections-page"><header><span className="eyebrow">Каналы бизнеса</span><h1>Подключения</h1><p>Подключите Telegram и VK к единому ядру «Среды».</p></header>
    <p className="account-footnote">После проверки токена завершите настройку «Приёма заявок» и запустите Telegram. Вход в аккаунт по коду появится отдельно.</p><section className="panel connection-setup"><div className="connection-setup__title"><Bot size={24} /><div><h2>Telegram</h2><p>Токен бота от @BotFather</p></div>{telegram?.status === "connected" && <CheckCircle2 className="connection-ok" size={22} />}</div>
      {telegram?.status === "connected" ? <><p className="account-notice">Токен проверен: {telegram.displayName ?? "Telegram-бот"}</p><Link className="button button--primary" href="/solutions/leads/setup">Настроить приём заявок</Link><button className="button button--outline" type="button" disabled={busy} onClick={() => void disconnectTelegram()}>Отключить Telegram</button></> : <form className="connection-token-form" onSubmit={(event) => { event.preventDefault(); void connectTelegram(); }}>
        <p id="telegram-token-help">Откройте <a className="text-link" href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> в Telegram, создайте бота командой /newbot или выберите своего через /mybots → API Token. Скопируйте токен и вставьте его ниже.</p>
        <label htmlFor="telegram-token">Токен бота</label>
        <input ref={tokenInput} id="telegram-token" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={token} onChange={(event) => { setToken(event.target.value); setTokenError(""); }} placeholder="Вставьте токен из @BotFather" disabled={busy} aria-invalid={Boolean(tokenError)} aria-describedby={`telegram-token-help telegram-token-security${tokenError ? " telegram-token-error" : ""}`} />
        {tokenError && <p id="telegram-token-error" className="account-error" role="alert">{tokenError}</p>}
        <p id="telegram-token-security" className="account-footnote"><ShieldCheck size={15} />Токен передаётся по защищённому соединению и не показывается после сохранения.</p>
        <button className="button button--primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}{busy ? "Проверяем…" : "Подключить Telegram"}</button>
      </form>}

      {error && <p className="account-error" role="alert">{error}</p>}{notice && <p className="account-notice" role="status">{notice}</p>}
    </section><section className="panel connection-setup connection-setup--muted"><div className="connection-setup__title"><span className="connection-vk-mark">VK</span><div><h2>ВКонтакте</h2><p>Подключение сообщества появится следующим шагом.</p></div></div></section>
  </div>;
}

