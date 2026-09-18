"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/apiClient";
import {
  CAPABILITY_DEFS,
  CAPABILITY_SECTIONS,
  resolveCapabilityDependencies,
  searchSettingsIndex,
} from "@/lib/capabilities";
import type { CapabilityId } from "@/lib/industryPresets";
import {
  CustomerPreview,
  FieldHint,
  StickySaveBar,
} from "@/components/ui/SetupChrome";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

type IndustryPayload = {
  name: string;
  capabilities_enabled: CapabilityId[];
  setup_mode: "guided" | "advanced";
};

function previewButtons(enabled: CapabilityId[]): string[] {
  const lines: string[] = [];
  if (enabled.includes("booking")) lines.push("• Записаться");
  if (enabled.includes("orders")) lines.push("• Каталог");
  if (enabled.includes("leads")) lines.push("• Оставить заявку");
  if (enabled.includes("admin_messages"))
    lines.push("• Связаться с администратором");
  if (!lines.length) lines.push("• Написать сообщение");
  return lines;
}

export function AdvancedConfigurator({
  businessId,
  initialEnabled,
  onSaved,
}: {
  businessId: string;
  initialEnabled?: string[];
  onSaved?: () => void;
}) {
  const url = `/api/v1/businesses/${businessId}/industry`;
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState<CapabilityId[]>(
    (initialEnabled as CapabilityId[] | undefined) ?? [],
  );
  const [baseline, setBaseline] = useState<CapabilityId[]>(
    (initialEnabled as CapabilityId[] | undefined) ?? [],
  );
  const [query, setQuery] = useState("");
  const [searchRemote, setSearchRemote] = useState<CapabilityId[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [depNotice, setDepNotice] = useState("");

  useEffect(() => {
    let active = true;
    void apiRequest<IndustryPayload>(url)
      .then((data) => {
        if (!active) return;
        setName(data.name);
        setEnabled(data.capabilities_enabled);
        setBaseline(data.capabilities_enabled);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Не удалось загрузить.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let active = true;
    const t = window.setTimeout(() => {
      void apiRequest<{ results: { id: CapabilityId }[] }>(
        `${url}?q=${encodeURIComponent(q)}`,
      )
        .then((res) => {
          if (!active) return;
          setSearchRemote(res.results.map((r) => r.id));
        })
        .catch(() => {
          if (!active) return;
          setSearchRemote(searchSettingsIndex(q).map((c) => c.id));
        });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [query, url]);

  const dirty = useMemo(() => {
    if (enabled.length !== baseline.length) return true;
    const set = new Set(enabled);
    return baseline.some((id) => !set.has(id));
  }, [enabled, baseline]);

  useUnsavedChanges(dirty);

  const visibleIds = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    if (searchRemote) return new Set(searchRemote);
    return new Set(searchSettingsIndex(q).map((c) => c.id));
  }, [query, searchRemote]);

  function toggle(id: CapabilityId) {
    setNotice("");
    setError("");
    if (enabled.includes(id)) {
      setEnabled(enabled.filter((x) => x !== id));
      setDepNotice("");
      return;
    }
    const { next, reasons } = resolveCapabilityDependencies(enabled, id);
    if (reasons.length) {
      const ok = window.confirm(
        `Чтобы включить эту настройку, понадобятся ещё:\n\n${reasons.join("\n")}\n\nВключить вместе?`,
      );
      if (!ok) return;
      setDepNotice(reasons.join(" "));
    } else {
      setDepNotice("");
    }
    setEnabled(next);
  }

  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await apiRequest<IndustryPayload>(url, {
        method: "PATCH",
        body: JSON.stringify({
          capabilities_enabled: enabled,
          setup_mode: "advanced",
        }),
      });
      setEnabled(data.capabilities_enabled);
      setBaseline(data.capabilities_enabled);
      setNotice("Настройки сохранены.");
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="panel crm-panel">
        <p>Загружаем расширенную настройку…</p>
      </section>
    );
  }

  return (
    <section className="panel crm-panel advanced-configurator">
      <header className="stack-sm">
        <span className="eyebrow">Расширенная настройка</span>
        <h1 className="text-page-title">Что должен уметь бот</h1>
        <p className="text-body">
          Включайте только нужные возможности. Зависимости подтянутся сами —
          с подтверждением.
        </p>
      </header>

      <label className="stack-sm">
        Найти настройку
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Например, обед или каталог"
          autoComplete="off"
        />
      </label>
      <FieldHint>
        Поиск ищет по названию и смыслу. Можно также открыть раздел ниже.
      </FieldHint>

      {depNotice ? (
        <p className="account-notice" role="status">
          {depNotice}
        </p>
      ) : null}

      <div className="capability-sections">
        {CAPABILITY_SECTIONS.map((section) => {
          const items = CAPABILITY_DEFS.filter((c) => c.section === section.id);
          const filtered = visibleIds
            ? items.filter((c) => visibleIds.has(c.id))
            : items;
          if (!filtered.length) return null;
          return (
            <section key={section.id} className="stack-sm">
              <h2 className="text-section-title">{section.label}</h2>
              {filtered.map((cap) => (
                <div key={cap.id} className="capability-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={enabled.includes(cap.id)}
                      disabled={busy}
                      onChange={() => toggle(cap.id)}
                    />
                    <span>
                      <strong>{cap.label}</strong>
                      <br />
                      <span className="text-caption">{cap.description}</span>
                    </span>
                  </label>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      <CustomerPreview
        title={`Так это увидит клиент · ${name || "Ваш бизнес"}`}
        lines={[
          name ? `Добро пожаловать в ${name}!` : "Добро пожаловать!",
          "Выберите действие:",
          ...previewButtons(enabled),
        ]}
      />

      <StickySaveBar
        dirty={dirty}
        busy={busy}
        onSave={() => void save()}
        onCancel={() => {
          setEnabled(baseline);
          setNotice("");
          setError("");
          setDepNotice("");
        }}
        notice={notice}
        error={error}
      />
    </section>
  );
}
