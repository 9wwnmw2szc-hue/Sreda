"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";
import type { Business } from "@/types";

type Invitation = { id: string; businessId: string; businessName: string; role: "admin" | "operator"; expiresAt: string };
type Member = { userId: string; username: string; name: string; role: "owner" | "admin" | "operator" };
export function MembersPanel({ business, onAccepted }: { business?: Business; onAccepted?: (businessId: string) => Promise<void> }) {
  const router = useRouter();
  const [userId, setUserId] = useState(""); const [role, setRole] = useState<"admin" | "operator">("operator");
  const [incoming, setIncoming] = useState<Invitation[]>([]); const [members, setMembers] = useState<Member[]>([]); const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void Promise.all([apiRequest<Invitation[]>("/api/v1/invitations"), business?.role === "owner" ? apiRequest<Member[]>(`/api/v1/businesses/${business.id}/members`) : Promise.resolve([])]).then(([invites, list]) => { if (active) { setIncoming(invites); setMembers(list); } }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Не удалось загрузить участников."); });
    return () => { active = false; };
  }, [business?.id, business?.role]);
  async function invite() { if (!business) return; setBusy(true); setError(""); setNotice(""); try { await apiRequest(`/api/v1/businesses/${business.id}/invitations`, { method: "POST", body: JSON.stringify({ userId: userId.trim(), role }) }); setUserId(""); setNotice("Приглашение создано."); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось создать приглашение."); } finally { setBusy(false); } }
  async function accept(id: string) {
    const invitation = incoming.find((item) => item.id === id);
    if (!invitation) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`/api/v1/invitations/${id}/accept`, { method: "POST", body: "{}" });
      setIncoming((items) => items.filter((item) => item.id !== id));
      setNotice("Приглашение принято. Доступ к бизнесу добавлен.");
      if (onAccepted) await onAccepted(invitation.businessId);
      router.push("/dashboard"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось обновить доступ. Обновите список бизнесов."); }
    finally { setBusy(false); }
  }
  async function revoke(userId: string) { if (!business) return; setBusy(true); setError(""); try { await apiRequest(`/api/v1/businesses/${business.id}/members`, { method: "POST", body: JSON.stringify({ action: "revoke", userId }) }); setMembers((items) => items.filter((item) => item.userId !== userId)); setNotice("Доступ отозван."); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось отозвать доступ."); } finally { setBusy(false); } }
  async function changeRole(userId: string, nextRole: "admin" | "operator") { if (!business) return; setBusy(true); setError(""); try { await apiRequest(`/api/v1/businesses/${business.id}/members`, { method: "POST", body: JSON.stringify({ action: "change_role", userId, role: nextRole }) }); setMembers((items) => items.map((item) => item.userId === userId ? { ...item, role: nextRole } : item)); setNotice("Роль обновлена."); } catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить роль."); } finally { setBusy(false); } }
  return <section className="panel"><h2>Участники</h2>
    {business?.role === "owner" && <><p className="account-footnote">Добавьте пользователя по его публичному ID `usr_...`.</p><div className="settings-business">
      <input aria-label="ID пользователя" placeholder="usr_..." value={userId} onChange={(e) => setUserId(e.target.value)} />
      <select aria-label="Роль участника" value={role} onChange={(e) => setRole(e.target.value as typeof role)}><option value="operator">Оператор</option><option value="admin">Администратор</option></select>
      <button className="button button--outline" type="button" disabled={busy || !userId.trim()} onClick={() => void invite()}><UserPlus size={18} />Пригласить</button>
    </div></>}
    {members.length > 0 && <div className="account-invitations"><strong>Активные участники</strong>{members.map((item) => <div key={item.userId} className="settings-business"><span>{item.name} · {item.role === "owner" ? "Владелец" : item.role === "admin" ? "Администратор" : "Оператор"}</span>{item.role !== "owner" && <><select aria-label={`Роль ${item.name}`} value={item.role} disabled={busy} onChange={(e) => void changeRole(item.userId, e.target.value as "admin" | "operator")}><option value="operator">Оператор</option><option value="admin">Администратор</option></select><button className="button button--outline" type="button" disabled={busy} onClick={() => void revoke(item.userId)}>Отозвать</button></>}</div>)}</div>}
    {incoming.length > 0 && <div className="account-invitations"><strong>Входящие приглашения</strong>{incoming.map((item) => <div key={item.id} className="settings-business"><span>{item.businessName} · {item.role === "admin" ? "Администратор" : "Оператор"}</span><button className="button button--outline" type="button" disabled={busy} onClick={() => void accept(item.id)}><Check size={16} />Принять</button></div>)}</div>}
    {notice && <p className="account-notice" role="status">{notice}</p>}{error && <p className="account-error" role="alert">{error}</p>}
  </section>;
}
