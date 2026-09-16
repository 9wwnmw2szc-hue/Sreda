"use client";
import Link from "next/link";
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
import { PinPanel } from "./PinPanel";

export function SettingsView() {
  const { user, currentBusiness, businesses, setCurrentBusinessId, refreshBusinesses, error } = useBusinessContext();
  return <div className="settings-page">
    <header><span className="eyebrow">Ваше пространство</span><h1>Настройки</h1></header>
    <section className="panel"><h2>Аккаунт</h2><dl>
      <div><dt>Имя</dt><dd>{user.name}</dd></div>
      <div><dt>Логин</dt><dd>{user.username ?? "Демонстрация"}</dd></div>
    {!isDemoMode && <div><dt>Ваш ID для приглашений</dt><dd>{user.id}</dd></div>}
    </dl>{!isDemoMode && <SignOutButton />}</section>
    {!isDemoMode && <PasswordChangePanel />}
    {!isDemoMode && <PinPanel />}
    {!isDemoMode && <RecoveryCodesPanel />}
    <section className="panel"><h2>Вход по коду</h2>
      <p>После подключения бота здесь можно будет включить получение кодов в вашей админ-панели Telegram или VK.</p>
      <p className="account-footnote">Сначала нужно подтвердить, что получатель кодов — вы. Вход по логину и паролю сохранится.</p>
      <dl><div><dt>Telegram</dt><dd>Пока недоступно</dd></div><div><dt>VK</dt><dd>Пока недоступно</dd></div></dl>
      <p className="account-footnote">Подключение ботов и доставка кодов появятся на этапе интеграций.</p>
    </section>
    <section className="panel"><h2>Бизнесы</h2>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="button button--outline" type="button" onClick={() => void refreshBusinesses().catch(() => undefined)}>Обновить список</button>
      <div className="settings-business">
        <BusinessSwitcher businesses={businesses} currentBusiness={currentBusiness} onSelect={setCurrentBusinessId} />
        {!isDemoMode && <Link href="/business/new" className="button button--outline"><Plus size={18} />Добавить бизнес</Link>}
      </div>
      <dl className="account-footnote">
        <div><dt>Часовой пояс</dt><dd>{currentBusiness?.timezone ?? "Не задан"}</dd></div>
        <div><dt>Ваша роль</dt><dd>{currentBusiness?.role === "owner" ? "Владелец"
          : currentBusiness?.role === "admin" ? "Администратор"
          : currentBusiness?.role === "operator" ? "Оператор" : "Демонстрация"}</dd></div>
      </dl>
    </section>
    {!isDemoMode && currentBusiness && <BusinessProfilePanel key={currentBusiness.id} businessId={currentBusiness.id} canEdit={currentBusiness.role !== "operator"} />}
    {!isDemoMode && <MembersPanel key={`${currentBusiness?.id ?? "none"}:${currentBusiness?.role ?? "none"}`} business={currentBusiness ?? undefined} onAccepted={refreshBusinesses} />}
    {!isDemoMode && currentBusiness && <AuditLogPanel key={`${currentBusiness.id}:${currentBusiness.role}`} business={currentBusiness} />}
  </div>;
}
