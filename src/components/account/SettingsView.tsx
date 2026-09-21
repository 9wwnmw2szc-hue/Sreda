"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { SignOutButton } from "./SignOutButton";
import { isDemoMode } from "@/lib/dataMode";
import { MembersPanel } from "./MembersPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";
import { PasswordChangePanel } from "./PasswordChangePanel";
import { BusinessProfilePanel } from "./BusinessProfilePanel";
import { IndustrySetupCard } from "./IndustrySetupCard";
import { PinPanel } from "./PinPanel";
import { ChannelAdminPanel } from "./ChannelAdminPanel";
import { ThemeAppearancePanel } from "@/components/theme/ThemeAppearancePanel";
import { AccountDeletionPanel } from "./AccountDeletionPanel";
import { BusinessDeletionPanel } from "./BusinessDeletionPanel";
import { ConnectionsView } from "@/components/connections/ConnectionsView";
import { NotificationsView } from "@/components/notifications/NotificationsView";

const SECTIONS = [
  ["business", "Бизнес"],
  ["connections", "Подключения"],
  ["members", "Сотрудники"],
  ["notifications", "Уведомления"],
  ["account", "Аккаунт"],
  ["security", "Безопасность"],
  ["billing", "Тариф"],
  ["danger", "Опасная зона"],
] as const;

type SectionId = (typeof SECTIONS)[number][0];

function isSection(value: string | null): value is SectionId {
  return SECTIONS.some(([id]) => id === value);
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
          <section className="panel">
            <h2>Бизнесы</h2>
            {error && (
              <p className="account-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button--outline"
              type="button"
              onClick={() => void refreshBusinesses().catch(() => undefined)}
            >
              Обновить список
            </button>
            <div className="settings-business">
              <BusinessSwitcher
                businesses={businesses}
                currentBusiness={currentBusiness}
                onSelect={setCurrentBusinessId}
              />
              {!isDemoMode && (
                <Link href="/business/new" className="button button--outline">
                  <Plus size={18} />
                  Добавить бизнес
                </Link>
              )}
            </div>
            <dl className="account-footnote">
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
          {!isDemoMode && currentBusiness && (
            <BusinessProfilePanel
              key={currentBusiness.id}
              businessId={currentBusiness.id}
              canEdit={currentBusiness.role !== "operator"}
            />
          )}
          {!isDemoMode &&
            currentBusiness &&
            currentBusiness.role === "owner" && (
              <div id="business-danger">
                <BusinessDeletionPanel
                  key={`biz-delete:${currentBusiness.id}`}
                  businessId={currentBusiness.id}
                  businessName={currentBusiness.name}
                  onDeleted={handleBusinessDeleted}
                />
              </div>
            )}
        </>
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

      {section === "members" && !isDemoMode && (
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

      {section === "notifications" && !isDemoMode && <NotificationsView />}

      {section === "account" && (
        <>
          <section className="panel settings-panel">
            <h2 className="text-section-title">Данные аккаунта</h2>
            <dl>
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
                  <dt>Ваш ID для приглашений</dt>
                  <dd>{user.id}</dd>
                </div>
              )}
            </dl>
          </section>
          <ThemeAppearancePanel />
          {!isDemoMode && (
            <section className="panel settings-panel settings-sign-out-panel">
              <h2 className="text-section-title">Сессия</h2>
              <p className="account-footnote">
                Завершает текущую сессию на этом устройстве. Бизнесы и данные
                аккаунта не удаляются.
              </p>
              <SignOutButton variant="ghost" />
            </section>
          )}
        </>
      )}

      {section === "security" && !isDemoMode && (
        <>
          <section className="settings-security-group" aria-label="Безопасность">
            <h2 className="settings-group-title text-section-title">
              Безопасность
            </h2>
            <PasswordChangePanel />
            <PinPanel />
            <RecoveryCodesPanel />
          </section>
          <section className="panel">
            <h2>Вход по коду</h2>
            <p>
              После подключения бота здесь можно будет включить получение кодов
              в вашей админ-панели Telegram или VK.
            </p>
            <p className="account-footnote">
              Сначала нужно подтвердить, что получатель кодов — вы. Вход по
              логину и паролю сохранится.
            </p>
            <dl>
              <div>
                <dt>Telegram</dt>
                <dd>Пока недоступно</dd>
              </div>
              <div>
                <dt>VK</dt>
                <dd>Пока недоступно</dd>
              </div>
            </dl>
          </section>
        </>
      )}

      {section === "billing" && (
        <section className="panel">
          <h2>Тариф</h2>
          <p className="account-footnote">
            Текущий тариф и подключённые решения. Оплата на этом этапе не
            списывается.
          </p>
          <Link className="button button--outline" href="/billing">
            Открыть тариф
          </Link>
        </section>
      )}

      {section === "danger" && !isDemoMode && (
        <>
          <p className="account-footnote">
            Удаление бизнеса и удаление аккаунта — разные действия. Бизнес
            удаляет только владелец в разделе «Бизнес».
          </p>
          <AccountDeletionPanel />
        </>
      )}
      </div>
    </div>
  );
}
