import Link from "next/link";
import { requireAdminPage } from "@/server/admin/page-admin";

export default async function AdminSupportPage() {
  await requireAdminPage("admin.support.read");

  return (
    <div>
      <h1 className="admin-page-title">Поддержка</h1>
      <p className="admin-page-desc">
        Краткая шпаргалка по разбору инцидентов каналов
      </p>
      <div className="admin-panel">
        <h2 className="admin-panel__title">Как разбирать ошибки интеграций</h2>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.875rem" }}>
          <li>Откройте список интеграций со статусом error.</li>
          <li>Проверьте диагностику: секрет (configured/not), runtime, outbox.</li>
          <li>При failed/uncertain outbox — retry с обязательной причиной.</li>
          <li>Секреты и токены в API не отдаются — только флаги configured.</li>
          <li>Имперсонация пользователей не поддерживается.</li>
        </ol>
        <p style={{ marginTop: 14 }}>
          <Link
            className="button button--primary button--sm"
            href="/admin/integrations?status=error"
          >
            Интеграции с ошибками
          </Link>
        </p>
      </div>
    </div>
  );
}
