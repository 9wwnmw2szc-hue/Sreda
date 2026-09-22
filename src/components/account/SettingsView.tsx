"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, RefreshCw, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { SignOutButton } from "./SignOutButton";
import { isDemoMode } from "@/lib/dataMode";
import { MembersPanel } from "./MembersPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import { PasswordChangePanel } from "./PasswordChangePanel";
import { SessionsPanel } from "./SessionsPanel";
import { BusinessProfilePanel } from "./BusinessProfilePanel";
import { IndustrySetupCard } from "./IndustrySetupCard";
import { PinPanel } from "./PinPanel";
import { ChannelAdminPanel } from "./ChannelAdminPanel";
import { ThemeAppearancePanel } from "@/components/theme/ThemeAppearancePanel";
import { AccountDeletionPanel } from "./AccountDeletionPanel";
import { BusinessDeletionPanel } from "./BusinessDeletionPanel";
import { ConnectionsView } from "@/components/connections/ConnectionsView";
import { NotificationsView } from "@/components/notifications/NotificationsView";
import { PRODUCT_SOLUTIONS } from "@/lib/productSolutions";

const SECTIONS = [
  ["business", "Бизнес"],
  ["solutions", "Решения"],
  ["connections", "Подключения"],
  ["notifications", "Уведомления"],
  ["ai", "AI"],
  ["billing", "Тариф"],
  ["account", "Аккаунт"],
  ["danger", "Опасная зона"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function isSection(value: string | null): value is SectionId {
  return SECTIONS.some(([id]) => id === value);
}

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="copyable-id">
      <dd className="copyable-id__value">{value}</dd>
      <button
        type="button"
        className="button button--ghost button--sm copyable-id__btn"
        onClick={() => void copy()}
        aria-label="Скопировать ID"
      >
        {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        <span>{copied ? "Скопировано" : "Копировать"}</span>
      </button>
    </div>
  );
}

export function SettingsView() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get("section");
  const section: SectionId = isSection(requested) ? requested : "business";
  const {
    user,
    currentBusiness,
    businesses,
    setCurrentBusinessId,
    refreshBusinesses,
    error,
  } = useBusinessContext();

  async function handleBusinessDeleted() {
    const remaining = businesses.filter((b) => b.id !== currentBusiness?.id);
    await refreshBusinesses(remaining[0]?.id);
    if (remaining.length === 0) {
      router.replace("/business/new");
      return;
    }
    if (remaining[0]) setCurrentBusinessId(remaining[0].id);
  }

  return (
    <div className="settings-page page-container">
      <header className="page-header">
        <span className="eyebrow">Ваше пространство</span>
        <h1 className="text-page-title">Настройки</h1>
      </header>
      <nav className="settings-nav" aria-label="Разделы настроек">
        {SECTIONS.map(([id, label]) => (
          <Link
            key={id}
            href={`/settings?section=${id}`}
            className={section === id ? "is-active" : undefined}
            aria-current={section === id ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="settings-section">
        {section === "business" && (
          <>
            <section className="panel settings-panel settings-business-panel">
              <h2 className="text-section-title">Бизнесы</h2>
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
              <div className="settings-business-stack">
                <button
                  className="button button--ghost button--sm settings-business-refresh"
                  type="button"
                  onClick={() => void refreshBusinesses().catch(() => undefined)}
                >
                  <RefreshCw size={16} aria-hidden />
                  Обновить
                </button>
                <BusinessSwitcher
                  businesses={businesses}
                  currentBusiness={currentBusiness}
                  onSelect={setCurrentBusinessId}
                />
                {!isDemoMode && (
                  <Link href="/business/new" className="button button--outline">
                    <Plus size={18} aria-hidden />
                    Добавить бизнес
                  </Link>
                )}
              </div>
              <dl className="settings-meta-list">
                <div>
                  <dt>Часовой пояс</dt>
                  <dd>{currentBusiness?.timezone ?? "Не задан"}</dd>
                </div>
                <div>
                  <dt>Ваша роль</dt>
                  <dd>
                    {currentBusiness?.role === "owner"
                      ? "Владелец"
                      : currentBusiness?.role === "admin"
                        ? "Администратор"
                        : currentBusiness?.role === "operator"
                          ? "Оператор"
                          : "Демонстрация"}
                  </dd>
                </div>
              </dl>
            </section>
            {!isDemoMode && currentBusiness && (
              <IndustrySetupCard
                key={`industry:${currentBusiness.id}`}
                businessId={currentBusiness.id}
                canEdit={currentBusiness.role !== "operator"}
              />
            )}
            {!isDemoMode && (
              <>
                <MembersPanel
                  key={`${currentBusiness?.id ?? "none"}:${currentBusiness?.role ?? "none"}`}
                  business={currentBusiness ?? undefined}
                  onAccepted={refreshBusinesses}
                />
                {currentBusiness && (
                  <AuditLogPanel
                    key={`${currentBusiness.id}:${currentBusiness.role}`}
                    business={currentBusiness}
                  />
                )}
              </>
            )}
          </>
        )}

        {section === "solutions" && (
          <section className="panel settings-panel">
            <h2 className="text-section-title">Решения</h2>
            <p className="account-footnote">
              Подключение и настройка решений — в каталоге. Здесь быстрые ссылки.
            </p>
            <ul className="settings-link-list">
              <li>
                <Link href="/solutions" className="text-link">
                  Каталог решений
                </Link>
              </li>
              {PRODUCT_SOLUTIONS.map((item) => (
                <li key={item.code}>
                  <Link href={item.setupPath} className="text-link">
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {section === "connections" && !isDemoMode && (
          <>
            <ConnectionsView />
            {currentBusiness && (
              <ChannelAdminPanel
                key={`channel-admin:${currentBusiness.id}`}
                businessId={currentBusiness.id}
                canManage={currentBusiness.role !== "operator"}
              />
            )}
          </>
        )}

        {section === "notifications" && !isDemoMode && <NotificationsView />}

        {section === "ai" && !isDemoMode && currentBusiness && (
          <BusinessProfilePanel
            key={`ai:${currentBusiness.id}`}
            businessId={currentBusiness.id}
            canEdit={currentBusiness.role !== "operator"}
          />
        )}

        {section === "billing" && (
          <section className="panel settings-panel">
            <h2 className="text-section-title">Тариф</h2>
            <p className="account-footnote">
              Активные решения и оценка по каталогу. Подключение оплаты — следующий
              шаг; списаний пока нет.
            </p>
            <Link className="button button--outline" href="/billing">
              Открыть тариф
            </Link>
          </section>
        )}

        {section === "account" && (
          <>
            <section className="panel settings-panel">
              <h2 className="text-section-title">Данные аккаунта</h2>
              <dl className="settings-meta-list">
                <div>
                  <dt>Имя</dt>
                  <dd>{user.name}</dd>
                </div>
                <div>
                  <dt>Логин</dt>
                  <dd>{user.username ?? "Демонстрация"}</dd>
                </div>
                {!isDemoMode && (
                  <div>
                    <dt>ID для приглашений</dt>
                    <CopyableId value={user.id} />
                  </div>
                )}
              </dl>
            </section>
            <ThemeAppearancePanel />
            {!isDemoMode && (
              <section className="panel settings-panel settings-sign-out-panel">
                <h2 className="text-section-title">Выход</h2>
                <p className="account-footnote">
                  Завершает текущую сессию на этом устройстве. Бизнесы и данные
                  аккаунта не удаляются.
                </p>
                <SignOutButton variant="ghost" />
              </section>
            )}
            {!isDemoMode && (
              <section
                className="settings-security-group"
                aria-labelledby="settings-security-heading"
              >
                <h2
                  id="settings-security-heading"
                  className="settings-group-title text-section-title"
                >
                  Безопасность
                </h2>
                <p className="account-footnote settings-group-desc">
                  Пароль, устройства, PIN и резервные коды для восстановления
                  доступа.
                </p>
                <PasswordChangePanel />
                <SessionsPanel />
                <PinPanel />
                <RecoveryCodesPanel />
              </section>
            )}
            {!isDemoMode && (
              <p className="account-footnote">
                Удаление аккаунта — в разделе{" "}
                <Link href="/settings?section=danger" className="text-link">
                  Опасная зона
                </Link>
                .
              </p>
            )}
          </>
        )}

        {section === "danger" && !isDemoMode && (
          <>
            <section className="panel settings-panel">
              <h2 className="text-section-title">Опасная зона</h2>
              <p className="account-footnote">
                Удаление бизнеса и удаление аккаунта — разные действия. Бизнес
                удаляет только владелец; аккаунт — только текущий пользователь.
                После удаления аккаунта сессии, интеграции и привязки каналов
                отзываются.
              </p>
            </section>
            {currentBusiness && currentBusiness.role === "owner" && (
              <div id="business-danger">
                <BusinessDeletionPanel
                  key={`biz-delete:${currentBusiness.id}`}
                  businessId={currentBusiness.id}
                  businessName={currentBusiness.name}
                  onDeleted={handleBusinessDeleted}
                />
              </div>
            )}
            <div id="account-danger">
              <AccountDeletionPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
