"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

export function RecoveryCodesPanel({
  initialCodes,
  registration = false,
}: {
  initialCodes?: string[];
  registration?: boolean;
}) {
  const [codes, setCodes] = useState<string[] | null>(initialCodes ?? null);
  const [remaining, setRemaining] = useState<number | null>(
    initialCodes?.length ?? null,
  );
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (initialCodes) return;
    let active = true;
    void apiRequest<{ remaining: number }>("/api/v1/account/recovery-codes")
      .then((result) => {
        if (active) setRemaining(result.remaining);
      })
      .catch(() => {
        if (active)
          setError("Не удалось загрузить состояние резервных кодов.");
      });
    return () => {
      active = false;
    };
  }, [initialCodes]);

  async function generate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ codes: string[] }>(
        "/api/v1/account/recovery-codes",
        {
          method: "POST",
          body: JSON.stringify({ currentPassword: password }),
        },
      );
      setCodes(result.codes);
      setRemaining(result.codes.length);
      setSaved(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать коды.");
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes!.join("\n"));
      setNotice("Коды скопированы. Сохраните их в безопасном месте.");
    } catch {
      setError(
        "Не удалось скопировать автоматически. Выделите и сохраните коды вручную.",
      );
    }
  }

  function downloadTxt() {
    if (!codes?.length) return;
    const blob = new Blob([codes.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "soty-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Файл сохранён. Храните его отдельно от мессенджеров.");
  }

  return (
    <section className={registration ? "account-card" : "panel settings-panel"}>
      <h2 className="text-section-title">
        {registration ? "Аккаунт создан. Сохраните доступ" : "Резервные коды"}
      </h2>
      <p className="text-body-sm">
        Если вы забудете пароль или потеряете Telegram/VK, логин и один резервный
        код помогут задать новый пароль.
      </p>
      <p className="account-footnote">
        Каждый код используется один раз. Не передавайте коды другим людям, в том
        числе поддержке.
      </p>

      {codes ? (
        <>
          <p className="text-body-sm" role="status">
            Эти коды показаны только сейчас. После закрытия они больше не
            отображаются. Новый набор отменяет предыдущий.
          </p>
          <ul className="recovery-codes" aria-label="Резервные коды">
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
          <div className="actions-row">
            <button
              className="button button--outline button--nowrap"
              type="button"
              onClick={() => void copy()}
            >
              Скопировать
            </button>
            {!registration ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={downloadTxt}
              >
                Скачать .txt
              </button>
            ) : null}
          </div>
          <label className="recovery-confirm">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            <span>Я сохранил резервные коды</span>
          </label>
          <button
            className="button button--primary"
            type="button"
            disabled={!saved}
            onClick={() => {
              setCodes(null);
              setNotice("Резервные коды подготовлены.");
              if (registration) window.location.replace("/dashboard");
            }}
          >
            {registration ? "Продолжить" : "Готово"}
          </button>
        </>
      ) : (
        <>
          {remaining !== null ? (
            <p className="settings-status-line">
              <span className="field__label">Осталось кодов</span>
              <strong className="settings-status-value">{remaining}</strong>
            </p>
          ) : null}
          {registration ? (
            <p className="account-notice">
              Аккаунт уже создан. Для получения кодов подтвердите пароль;
              повторная регистрация не нужна.
            </p>
          ) : null}
          <form
            className="form-stack form-stack--md"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void generate();
            }}
          >
            <fieldset className="form-stack form-stack--md" disabled={busy}>
              <label className="field" htmlFor="recovery-current-password">
                <span className="field__label">Текущий пароль</span>
                <input
                  className="field__control"
                  id="recovery-current-password"
                  type="password"
                  autoComplete="current-password"
                  minLength={10}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p className="field-hint">
                Выпуск нового набора отменит все предыдущие коды, даже
                неиспользованные.
              </p>
              <button className="button button--secondary" type="submit">
                {busy ? "Создаём…" : "Создать новый набор"}
              </button>
            </fieldset>
          </form>
        </>
      )}
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
