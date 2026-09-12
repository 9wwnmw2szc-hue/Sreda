"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { apiRequest } from "@/lib/apiClient";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div>
    <button disabled={busy} className="button button--outline" onClick={async () => {
      setBusy(true); setError("");
      try {
        await apiRequest("/api/auth/sign-out", { method: "POST", body: "{}" });
        try {
          for (const key of Object.keys(localStorage)) {
            if (key.startsWith("sreda.")) localStorage.removeItem(key);
          }
        } catch { /* device storage may be unavailable */ }
        window.location.replace("/login");
      } catch { setError("Не удалось выйти. Попробуйте ещё раз."); setBusy(false); }
    }}><LogOut size={18} />{busy ? "Выходим…" : "Выйти из аккаунта"}</button>
    {error && <p className="account-error" role="alert">{error}</p>}
  </div>;
}
