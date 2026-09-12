"use client";
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import type { Business } from "@/types";

type Entry = { id: string; action: "invitation_created" | "invitation_accepted" | "invitation_revoked" | "member_revoked" | "member_role_changed" | "connection_connected" | "connection_disconnected"; actorUsername?: string; details?: string | null; createdAt: string; targetUserId?: string | null };
const labels: Record<Entry["action"], string> = { invitation_created: "создал приглашение", invitation_accepted: "принял приглашение", invitation_revoked: "отозвал приглашение", member_revoked: "отозвал доступ участника", member_role_changed: "изменил роль участника", connection_connected: "сохранил токен канала", connection_disconnected: "удалил токен канала" };
export function AuditLogPanel({ business }: { business: Business }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => { void apiRequest<Entry[]>(`/api/v1/businesses/${business.id}/audit`).then(setEntries).catch(() => setEntries([])); }, [business.id]);
  if (business.role !== "owner" && business.role !== "admin") return null;
  return <section className="panel"><h2><History size={19} />История действий</h2>
    {entries.length ? <ul className="audit-list">{entries.slice(0, 20).map((entry) => <li key={entry.id}><span>{entry.actorUsername} · {labels[entry.action]}</span><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</time></li>)}</ul> : <p className="account-footnote">Здесь появятся действия с участниками бизнеса.</p>}
  </section>;
}
