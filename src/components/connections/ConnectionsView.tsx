"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { apiRequest } from "@/lib/apiClient";
import { platformLabel } from "@/lib/labels";
import type { Platform } from "@/types";

type TokenPlatform = "telegram" | "vk";
type MetaPlatform = "whatsapp" | "instagram";
type ConnectionPlatform = TokenPlatform | MetaPlatform;

type Connection = {
  id: string;
  platform: ConnectionPlatform;
  displayName: string | null;
  status: string;
  displayPhoneNumber?: string | null;
  igUsername?: string | null;
  runtimeStatus?: string | null;
};

type MetaStatus = {
  configured: boolean;
  enabled: boolean;
  whatsappEmbeddedSignupReady: boolean;
  instagramLoginReady: boolean;
  appId: string | null;
  whatsappConfigId: string | null;
  instagramConfigId: string | null;
  graphApiVersion: string;
};

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (
        cb: (response: {
          authResponse?: { code?: string; accessToken?: string };
        }) => void,
        opts: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.FB) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v25.0",
      });
      resolve();
    };
    if (document.getElementById("facebook-jssdk")) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/ru_RU/sdk.js";
    script.async = true;
    script.onerror = () =>
      reject(new Error("Не удалось загрузить Facebook SDK."));
    document.body.appendChild(script);
  });
}

export function ConnectionsView() {
  const { currentBusiness } = useBusinessContext();
  if (!currentBusiness) return <p>Выберите бизнес.</p>;
  if (currentBusiness.role === "operator")
    return <p>Подключениями управляет владелец или администратор.</p>;
  return <Connections key={currentBusiness.id} id={currentBusiness.id} />;
}

function Connections({ id }: { id: string }) {
  const [connections, setConnections] = useState<Connection[]>([]),
    [tokens, setTokens] = useState({ telegram: "", vk: "" }),
    [metaStatus, setMetaStatus] = useState<MetaStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirmation, setConfirmation] = useState<ConnectionPlatform | null>(null),
    [igCandidates, setIgCandidates] = useState<
      {
        pageId: string;
        pageName: string;
        igUserId: string;
        igUsername: string | null;
        accessToken: string;
      }[]
    >([]);
  const base = `/api/v1/businesses/${id}`;
  useEffect(() => {
    let alive = true;
    void Promise.all([
      apiRequest<Connection[]>(base + "/connections"),
      apiRequest<MetaStatus>("/api/v1/meta/status"),
    ])
      .then(([c, status]) => {
        if (!alive) return;
        setConnections(c);
        setMetaStatus(status);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [base]);

  async function refresh() {
    setConnections(await apiRequest<Connection[]>(base + "/connections"));
    setMetaStatus(await apiRequest<MetaStatus>("/api/v1/meta/status"));
  }

  async function act(
    platform: TokenPlatform,
    action: "connect" | "start" | "disconnect",
  ) {
    if (busy) return;
    if (action === "connect" && !tokens[platform].trim()) {
      setError(
        "Вставьте токен " +
          (platform === "telegram" ? "бота из @BotFather." : "сообщества VK."),
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action === "connect") {
        const token = tokens[platform].trim();
        setTokens((v) => ({ ...v, [platform]: "" }));
        await apiRequest(base + "/connections", {
          method: "POST",
          body: JSON.stringify({ platform, token }),
        });
        setNotice(
          "Токен проверен и сохранён. Подключите нужные решения и нажмите «Запустить бота».",
        );
      } else if (action === "start") {
        await apiRequest(base + "/" + platform + "/start", { method: "POST" });
        setNotice(
          "Приём событий настроен. Проверьте ответ бота; доставка также зависит от работающего обработчика сообщений.",
        );
      } else {
        await apiRequest(base + "/connections?platform=" + platform, {
          method: "DELETE",
        });
        setConfirmation(null);
        setNotice("Подключение отключено, токен удалён.");
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function metaDisconnect(platform: MetaPlatform) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(base + "/connections?platform=" + platform, {
        method: "DELETE",
      });
      setConfirmation(null);
      setNotice("Подключение отключено.");
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось отключить канал.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function metaStart(platform: MetaPlatform) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(base + "/meta/start", {
        method: "POST",
        body: JSON.stringify({ platform }),
      });
      setNotice("Приём сообщений Meta настроен.");
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось запустить канал Meta.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function connectMeta(platform: MetaPlatform) {
    if (busy || !metaStatus?.configured) return;
    setBusy(true);
    setError("");
    setNotice("");
    setIgCandidates([]);
    try {
      const start = await apiRequest<
        MetaStatus & { state: string; configId: string | null; appId: string }
      >(base + "/meta/start", {
        method: "POST",
        body: JSON.stringify({ platform, action: "oauth" }),
      });
      if (!start.appId || !start.configId)
        throw new Error("Требуется настройка Meta на сервере.");
      await loadFacebookSdk(start.appId);
      const redirectUri = window.location.origin + "/connections";
      await new Promise<void>((resolve, reject) => {
        window.FB?.login(
          (response) => {
            void (async () => {
              try {
                const code = response.authResponse?.code;
                if (!code) {
                  reject(
                    new Error("Авторизация Meta не завершена. Попробуйте снова."),
                  );
                  return;
                }
                if (platform === "whatsapp") {
                  const session = (
                    window as unknown as {
                      __sotyWaSession?: {
                        wabaId?: string;
                        phoneNumberId?: string;
                      };
                    }
                  ).__sotyWaSession;
                  if (!session?.wabaId || !session?.phoneNumberId) {
                    reject(
                      new Error(
                        "Не получены данные WhatsApp Embedded Signup. Завершите мастер подключения в окне Meta.",
                      ),
                    );
                    return;
                  }
                  await apiRequest(base + "/meta/callback", {
                    method: "POST",
                    body: JSON.stringify({
                      action: "whatsapp_embedded_signup",
                      code,
                      redirectUri,
                      state: start.state,
                      wabaId: session.wabaId,
                      phoneNumberId: session.phoneNumberId,
                    }),
                  });
                  setNotice(
                    "WhatsApp подключён. Нажмите «Запустить приём», чтобы активировать webhook.",
                  );
                } else {
                  const result = await apiRequest<{
                    candidates: {
                      pageId: string;
                      pageName: string;
                      igUserId: string;
                      igUsername: string | null;
                      accessToken: string;
                    }[];
                  }>(base + "/meta/callback", {
                    method: "POST",
                    body: JSON.stringify({
                      action: "instagram_login",
                      code,
                      redirectUri,
                      state: start.state,
                    }),
                  });
                  if (result.candidates.length === 1) {
                    const c = result.candidates[0]!;
                    await apiRequest(base + "/meta/callback", {
                      method: "POST",
                      body: JSON.stringify({
                        action: "instagram_select",
                        pageId: c.pageId,
                        igUserId: c.igUserId,
                        accessToken: c.accessToken,
                        igUsername: c.igUsername,
                        pageName: c.pageName,
                      }),
                    });
                    setNotice(
                      "Instagram подключён. Нажмите «Запустить приём», чтобы активировать webhook.",
                    );
                  } else {
                    setIgCandidates(result.candidates);
                    setNotice("Выберите аккаунт Instagram для подключения.");
                  }
                }
                await refresh();
                resolve();
              } catch (e) {
                reject(e instanceof Error ? e : new Error("Ошибка Meta."));
              }
            })();
          },
          {
            config_id: start.configId,
            response_type: "code",
            override_default_response_type: true,
            ...(platform === "whatsapp"
              ? {
                  extras: {
                    setup: {},
                    featureType: "whatsapp_embedded_signup",
                    sessionInfoVersion: "3",
                  },
                }
              : {}),
          },
        );
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось подключить Meta.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectIg(candidate: {
    pageId: string;
    pageName: string;
    igUserId: string;
    igUsername: string | null;
    accessToken: string;
  }) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(base + "/meta/callback", {
        method: "POST",
        body: JSON.stringify({
          action: "instagram_select",
          pageId: candidate.pageId,
          igUserId: candidate.igUserId,
          accessToken: candidate.accessToken,
          igUsername: candidate.igUsername,
          pageName: candidate.pageName,
        }),
      });
      setIgCandidates([]);
      setNotice(
        "Instagram подключён. Нажмите «Запустить приём», чтобы активировать webhook.",
      );
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выбрать аккаунт.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!event.origin.includes("facebook.com")) return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data?.data) {
          (
            window as unknown as {
              __sotyWaSession?: {
                wabaId?: string;
                phoneNumberId?: string;
              };
            }
          ).__sotyWaSession = {
            wabaId: data.data.waba_id || data.data.wabaId,
            phoneNumberId:
              data.data.phone_number_id || data.data.phoneNumberId,
          };
        }
      } catch {
        /* ignore non-JSON postMessage */
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function metaLabel(platform: MetaPlatform, connection?: Connection) {
    if (platform === "whatsapp")
      return (
        connection?.displayPhoneNumber ||
        connection?.displayName ||
        "WhatsApp"
      );
    return (
      (connection?.igUsername
        ? `@${connection.igUsername.replace(/^@/, "")}`
        : null) ||
      connection?.displayName ||
      "Instagram"
    );
  }

  return (
    <div className="connections-page">
      <header>
        <h1>Подключения</h1>
        <p>Один бот бизнеса для заявок, общения и онлайн-записи.</p>
      </header>
      {error && (
        <p role="alert" className="account-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="account-notice">
          {notice}
        </p>
      )}
      {(["telegram", "vk"] as const).map((platform) => {
        const connection = connections.find((c) => c.platform === platform);
        return (
          <section className="panel connection-setup" key={platform}>
            <h2>{platform === "telegram" ? "Telegram" : "ВКонтакте"}</h2>
            {connection?.status === "connected" ? (
              <>
                <p>Токен проверен: {connection.displayName}</p>
                <div className="message-actions">
                  <Link className="button button--outline" href="/solutions">
                    Настроить решения
                  </Link>
                  <button
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void act(platform, "start")}
                  >
                    Запустить бота
                  </button>
                  <button
                    className="button button--outline"
                    disabled={busy}
                    onClick={() => setConfirmation(platform)}
                  >
                    Отключить
                  </button>
                </div>
              </>
            ) : (
              <form
                className="connection-token-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(platform, "connect");
                }}
              >
                <p>
                  {platform === "telegram" ? (
                    <>
                      Получите токен своего бота в{" "}
                      <a
                        href="https://t.me/BotFather"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        @BotFather
                      </a>
                      .
                    </>
                  ) : (
                    "Создайте ключ доступа сообщества VK с правами сообщений и управления. Включите сообщения сообщества в настройках VK."
                  )}
                </p>
                <label htmlFor={"token-" + platform}>
                  Токен {platform === "telegram" ? "бота" : "сообщества"}
                </label>
                <input
                  id={"token-" + platform}
                  type="password"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={tokens[platform]}
                  onChange={(e) =>
                    setTokens({ ...tokens, [platform]: e.target.value })
                  }
                  disabled={busy}
                />
                <p>Токен хранится на сервере в зашифрованном виде.</p>
                <button className="button button--primary" disabled={busy}>
                  {busy ? "Проверяем…" : "Подключить"}
                </button>
              </form>
            )}
          </section>
        );
      })}
      {(["whatsapp", "instagram"] as const).map((platform) => {
        const connection = connections.find((c) => c.platform === platform);
        const ready =
          platform === "whatsapp"
            ? metaStatus?.whatsappEmbeddedSignupReady
            : metaStatus?.instagramLoginReady;
        const configured = Boolean(metaStatus?.configured);
        return (
          <section className="panel connection-setup" key={platform}>
            <h2>{platformLabel(platform as Platform)}</h2>
            {!configured || !ready ? (
              <>
                <p role="status">Требуется настройка Meta</p>
                <p>
                  {platform === "whatsapp"
                    ? "Для WhatsApp Cloud API нужны META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN и META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID."
                    : "Для Instagram Messaging нужны META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN и META_INSTAGRAM_LOGIN_CONFIG_ID."}
                </p>
                <button className="button button--primary" disabled>
                  Подключить
                </button>
              </>
            ) : connection?.status === "connected" ? (
              <>
                <p>Подключено: {metaLabel(platform, connection)}</p>
                {connection.runtimeStatus === "ready" ? (
                  <p>Приём сообщений активен.</p>
                ) : (
                  <p>Сохранено. Запустите приём, чтобы активировать webhook.</p>
                )}
                <div className="message-actions">
                  <button
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void metaStart(platform)}
                  >
                    Запустить приём
                  </button>
                  <button
                    className="button button--outline"
                    disabled={busy}
                    onClick={() => void connectMeta(platform)}
                  >
                    Переподключить
                  </button>
                  <button
                    className="button button--outline"
                    disabled={busy}
                    onClick={() => setConfirmation(platform)}
                  >
                    Отключить
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  {platform === "whatsapp"
                    ? "Подключение через официальный WhatsApp Embedded Signup (Meta)."
                    : "Подключение профессиональной страницы Instagram через Facebook Login."}
                </p>
                <button
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => void connectMeta(platform)}
                >
                  {busy ? "Подключаем…" : "Подключить"}
                </button>
              </>
            )}
          </section>
        );
      })}
      {igCandidates.length > 0 && (
        <section className="panel connection-setup" aria-label="Выбор Instagram">
          <h2>Выберите Instagram</h2>
          <ul className="crm-list">
            {igCandidates.map((c) => (
              <li key={c.igUserId}>
                <button
                  className="button button--outline"
                  disabled={busy}
                  onClick={() => void selectIg(c)}
                >
                  {c.igUsername ? `@${c.igUsername}` : c.pageName} · {c.pageName}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirmation && (
        <section
          className="panel crm-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Отключение интеграции"
        >
          <h2>Отключить {platformLabel(confirmation as Platform)}?</h2>
          <p>
            Приём и отправка сообщений остановятся. Для повторного подключения
            понадобится авторизация заново.
          </p>
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() =>
              void (confirmation === "telegram" || confirmation === "vk"
                ? act(confirmation, "disconnect")
                : metaDisconnect(confirmation))
            }
          >
            Да, отключить
          </button>
          <button
            className="button button--outline"
            disabled={busy}
            onClick={() => setConfirmation(null)}
          >
            Назад
          </button>
        </section>
      )}
    </div>
  );
}
