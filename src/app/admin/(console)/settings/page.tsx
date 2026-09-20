import Link from "next/link";
import { requireAdminPage } from "@/server/admin/page-admin";

export default async function AdminSettingsPage() {
  await requireAdminPage("admin.admins.manage");

  return (
    <div>
      <h1 className="admin-page-title">Настройки</h1>
      <p className="admin-page-desc">Управление доступом к панели</p>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Bootstrap первого SUPER_ADMIN</h2>
        <p style={{ margin: "0 0 10px", fontSize: "0.875rem" }}>
          Первый супер-админ создаётся только через CLI (не через UI):
        </p>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 8,
            background: "var(--bg-page)",
            fontSize: "0.75rem",
            overflow: "auto",
          }}
        >
          {`npm run admin:bootstrap -- --username <login>`}
        </pre>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          Требуются переменные окружения и существующий пользователь продукта.
          Подробности — в{" "}
          <code>docs/admin/README.md</code>.
        </p>
      </div>

      <div className="admin-panel">
        <h2 className="admin-panel__title">Назначение ролей</h2>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.875rem" }}>
          <li>
            Найдите пользователя в{" "}
            <Link href="/admin/users">Пользователях</Link>.
          </li>
          <li>Откройте карточку пользователя.</li>
          <li>
            В блоке «Роли платформы» назначьте SUPER_ADMIN / SUPPORT / MODERATOR
            / FINANCE или отзовите роль (с причиной).
          </li>
        </ol>
        <p
          style={{
            margin: "12px 0 0",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}
        >
          MFA для админов отложена. Имперсонация не реализуется. Секреты
          интеграций в API не возвращаются.
        </p>
      </div>
    </div>
  );
}
