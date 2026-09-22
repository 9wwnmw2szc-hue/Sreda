"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

export function PinPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [desired, setDesired] = useState(false);
  const [password, setPassword] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<{ enabled: boolean }>("/api/v1/account/pin")
      .then((result) => {
        if (active) {
          setEnabled(result.enabled);
          setDesired(result.enabled);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Не удалось загрузить настройку PIN.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    setError("");
    setNotice("");
    if (desired && pin !== confirmation) {
      setError("PIN-коды не совпадают.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest<{ enabled: boolean }>(
        "/api/v1/account/pin",
        {
          method: "POST",
          body: JSON.stringify({
            enabled: desired,
            currentPassword: password,
            currentPin,
            pin,
            pinConfirmation: confirmation,
          }),
        },
      );
      setEnabled(result.enabled);
      setDesired(result.enabled);
      setNotice(
        result.enabled
          ? "PIN сохранён. Для нового входа нужны пароль и PIN. Остальные сеансы завершены."
          : "PIN отключён. Для входа нужен пароль. Остальные сеансы завершены.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось изменить PIN.");
    } finally {
      setPassword("");
      setCurrentPin("");
      setPin("");
      setConfirmation("");
      setBusy(false);
    }
  }

  function toggleDesired() {
    if (busy) return;
    setDesired((v) => !v);
    setNotice("");
    setError("");
  }

  return (
    <section className="panel settings-panel">
      <h2 className="text-section-title">PIN для входа</h2>
      <p className="text-body-sm">
        Дополнительный 4-значный PIN будет запрашиваться при новом входе вместе с
        паролем.
      </p>
      {enabled === null ? (
        <p className="text-body-sm">{error || "Загружаем настройку…"}</p>
      ) : (
        <>
          <div className="settings-switch-row">
            <div className="settings-switch-row__copy">
              <span className="settings-switch-row__label">PIN-код при входе</span>
              <span className="text-caption">
                Сейчас {enabled ? "включён" : "выключен"}. Резервные коды
                сохраняются.
              </span>
            </div>
            <button
              className="settings-switch"
              type="button"
              role="switch"
              aria-checked={desired}
              aria-label="PIN-код при входе"
              disabled={busy}
              onClick={toggleDesired}
            >
              <span className="settings-switch__track" aria-hidden>
                <span className="settings-switch__thumb" />
              </span>
            </button>
          </div>

          {(desired || enabled) && (
            <form
              className="form-stack form-stack--md"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void submit();
              }}
            >
              <fieldset className="form-stack form-stack--md" disabled={busy}>
                <label className="field" htmlFor="pin-password">
                  <span className="field__label">Текущий пароль</span>
                  <input
                    className="field__control"
                    id="pin-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={10}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {enabled ? (
                  <label className="field" htmlFor="pin-current">
                    <span className="field__label">Текущий PIN</span>
                    <input
                      className="field__control field--sm"
                      id="pin-current"
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      required
                      pattern="[0-9]{4}"
                      minLength={4}
                      maxLength={4}
                      value={currentPin}
                      onChange={(e) =>
                        setCurrentPin(e.target.value.replace(/[^0-9]/g, ""))
                      }
                    />
                  </label>
                ) : null}
                {desired ? (
                  <div className="form-grid">
                    <label className="field" htmlFor="pin-new">
                      <span className="field__label">
                        {enabled ? "Новый PIN" : "Придумайте PIN"}
                      </span>
                      <input
                        className="field__control field--sm"
                        id="pin-new"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        pattern="[0-9]{4}"
                        minLength={4}
                        maxLength={4}
                        value={pin}
                        onChange={(e) =>
                          setPin(e.target.value.replace(/[^0-9]/g, ""))
                        }
                      />
                    </label>
                    <label className="field" htmlFor="pin-confirm">
                      <span className="field__label">Повторите PIN</span>
                      <input
                        className="field__control field--sm"
                        id="pin-confirm"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        required
                        pattern="[0-9]{4}"
                        minLength={4}
                        maxLength={4}
                        value={confirmation}
                        onChange={(e) =>
                          setConfirmation(e.target.value.replace(/[^0-9]/g, ""))
                        }
                      />
                    </label>
                  </div>
                ) : null}
                <p className="field-hint">
                  Изменение применится после сохранения. На других устройствах
                  потребуется войти заново.
                </p>
                <div className="actions-row">
                  <button className="button button--primary" type="submit">
                    {busy
                      ? "Сохраняем…"
                      : desired
                        ? "Сохранить PIN"
                        : "Отключить PIN"}
                  </button>
                </div>
              </fieldset>
            </form>
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

          <div className="settings-pin-recovery">
            <p className="text-caption">Забыли PIN?</p>
            <Link className="text-link" href="/recover">
              Восстановить доступ резервным кодом
            </Link>
            <p className="field-hint">
              При восстановлении PIN будет отключён.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
