"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/apiClient";
import type { IndustryId, SetupMode } from "@/lib/industryPresets";
import { FieldHint } from "@/components/ui/SetupChrome";

type IndustryState = {
  industry: IndustryId | null;
  industry_subtype: string | null;
  setup_mode: SetupMode;
  setup_progress: Record<string, boolean>;
  preset: { label: string; subtypes: { id: string; label: string }[] } | null;
  catalogs: {
    industries: { id: IndustryId; label: string; hint: string }[];
  };
};

export function IndustrySetupCard({
  businessId,
  canEdit,
}: {
  businessId: string;
  canEdit: boolean;
}) {
  const url = `/api/v1/businesses/${businessId}/industry`;
  const [data, setData] = useState<IndustryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void apiRequest<IndustryState>(url)
      .then((row) => {
        if (active) setData(row);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Не удалось загрузить.");
      });
    return () => {
      active = false;
    };
  }, [url]);

  async function saveMode(setup_mode: SetupMode) {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await apiRequest<IndustryState>(url, {
        method: "PATCH",
        body: JSON.stringify({ setup_mode }),
      });
      setData(next);
      setNotice("Режим настройки сохранён.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }

  const industryLabel =
    data?.preset?.label ??
    data?.catalogs.industries.find((i) => i.id === data.industry)?.label ??
    null;
  const subtypeLabel =
    data?.preset?.subtypes.find((s) => s.id === data.industry_subtype)?.label ??
    data?.industry_subtype;

  return (
    <section className="panel stack-md">
      <h2>Настройка по отрасли</h2>
      <p className="text-body-sm">
        Выберите режим: подсказки по отрасли или расширенный список
        возможностей.
      </p>
      {error ? (
        <p className="account-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="account-notice" role="status">
          {notice}
        </p>
      ) : null}
      {!data ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <dl className="stack-sm">
            <div>
              <dt>Направление</dt>
              <dd>{industryLabel ?? "Ещё не выбрано"}</dd>
            </div>
            {subtypeLabel ? (
              <div>
                <dt>Формат</dt>
                <dd>{subtypeLabel}</dd>
              </div>
            ) : null}
          </dl>
          <label className="stack-sm">
            Режим настройки
            <select
              disabled={!canEdit || busy}
              value={data.setup_mode}
              onChange={(e) =>
                void saveMode(e.target.value as SetupMode)
              }
            >
              <option value="guided">С подсказками (guided)</option>
              <option value="advanced">Расширенный (advanced)</option>
            </select>
          </label>
          <FieldHint>
            Guided предлагает стартовый набор. Advanced открывает полный список
            настроек бота.
          </FieldHint>
          <div className="message-actions">
            <Link href="/onboarding" className="button button--primary">
              Открыть онбординг
            </Link>
            <Link href="/settings/advanced" className="button button--outline">
              Расширенная настройка
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
