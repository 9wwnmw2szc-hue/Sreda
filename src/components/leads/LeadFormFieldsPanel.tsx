"use client";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/apiClient";

type Field = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  required: boolean;
  active: boolean;
};

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: "text", label: "Текст" },
  { value: "textarea", label: "Многострочный текст" },
  { value: "phone", label: "Телефон" },
  { value: "email", label: "Email" },
  { value: "number", label: "Число" },
  { value: "select", label: "Список" },
  { value: "date", label: "Дата" },
  { value: "checkbox", label: "Флажок" },
  { value: "address", label: "Адрес" },
  { value: "budget", label: "Бюджет" },
  { value: "service", label: "Услуга" },
  { value: "message", label: "Сообщение" },
];

function keyFromLabel(label: string) {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (base && /^[a-z]/i.test(base)) return base;
  return "field_" + Date.now().toString(36);
}

export function LeadFormFieldsPanel({
  businessId,
  canEdit,
}: {
  businessId: string;
  canEdit: boolean;
}) {
  const base = `/api/v1/businesses/${encodeURIComponent(businessId)}/lead-form-fields`;
  const [fields, setFields] = useState<Field[]>([]);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [required, setRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const rows = await apiRequest<Field[]>(base);
    setFields(rows.filter((row) => row.active !== false));
  }

  useEffect(() => {
    let active = true;
    void apiRequest<Field[]>(base)
      .then((rows) => {
        if (active) {
          setFields(rows.filter((row) => row.active !== false));
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить поля.");
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [base]);

  async function add() {
    if (!canEdit || busy) return;
    const text = label.trim();
    if (!text) {
      setError("Укажите название поля.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiRequest(base, {
        method: "POST",
        body: JSON.stringify({
          fieldKey: keyFromLabel(text),
          label: text,
          fieldType,
          required,
        }),
      });
      setLabel("");
      setFieldType("text");
      setRequired(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось добавить поле.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить поле.");
    } finally {
      setBusy(false);
    }
  }

  const typeLabel = (value: string) =>
    FIELD_TYPES.find((item) => item.value === value)?.label ?? value;

  return (
    <section className="panel crm-panel" aria-label="Поля формы заявки">
      <h2>Поля формы заявки</h2>
      <p className="field-hint">
        Дополнительные вопросы для клиентов. Базовые поля сценария настраиваются
        в решении «Приём заявок».
      </p>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? (
        <p>Загрузка…</p>
      ) : !fields.length ? (
        <p>Дополнительных полей пока нет.</p>
      ) : (
        <ul className="lead-form-fields-list">
          {fields.map((field) => (
            <li key={field.id}>
              <span>
                <strong>{field.label}</strong>
                <small>
                  {typeLabel(field.fieldType)}
                  {field.required ? " · обязательно" : ""}
                </small>
              </span>
              {canEdit && (
                <button
                  type="button"
                  className="button button--outline"
                  disabled={busy}
                  onClick={() => void remove(field.id)}
                >
                  Удалить
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="lead-form-fields-add">
          <label>
            Название
            <input
              maxLength={120}
              value={label}
              disabled={busy}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Например, Бюджет"
            />
          </label>
          <label>
            Тип
            <select
              value={fieldType}
              disabled={busy}
              onChange={(e) => setFieldType(e.target.value)}
            >
              {FIELD_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lead-form-fields-required">
            <input
              type="checkbox"
              checked={required}
              disabled={busy}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Обязательное
          </label>
          <button
            type="button"
            className="button button--primary"
            disabled={busy}
            onClick={() => void add()}
          >
            Добавить поле
          </button>
        </div>
      )}
    </section>
  );
}
