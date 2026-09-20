import { requireAdminPage } from "@/server/admin/page-admin";

export default async function AdminModerationPage() {
  await requireAdminPage("admin.moderation.read");

  return (
    <div>
      <h1 className="admin-page-title">Модерация</h1>
      <p className="admin-page-desc">Очередь контента и жалоб</p>
      <div className="admin-state" role="status">
        Очередь модерации пока не подключена
      </div>
    </div>
  );
}
