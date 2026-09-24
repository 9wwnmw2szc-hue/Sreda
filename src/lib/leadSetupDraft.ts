/** Only non-sensitive setup choices are stored. Never store channel credentials here. */
export const LEAD_FIELDS = [
  { id: "email", label: "Email", example: "mail@example.com", required: false },
  { id: "message", label: "Сообщение", example: "Мой вопрос", required: false },
  { id: "name", label: "Имя", example: "Анна", required: true },
  {
    id: "phone",
    label: "Телефон",
    example: "+7 900 000-00-00",
    required: false,
  },
  {
    id: "service",
    label: "Что интересует",
    example: "Хочу узнать подробнее об услуге",
    required: false,
  },
  {
    id: "comment",
    label: "Комментарий",
    example: "Удобно связаться после 15:00",
    required: false,
  },
] as const;
export type LeadFieldId = (typeof LEAD_FIELDS)[number]["id"];
export type SetupChannel = "telegram" | "vk" | "whatsapp" | "instagram";
export interface LeadSetupDraft {
  title?: string;
  greeting?: string;
  finalMessage?: string;
  fieldOptions?: Partial<
    Record<LeadFieldId, { label: string; required: boolean }>
  >;
  version: 1;
  step: 0 | 1 | 2 | 3;
  channels: SetupChannel[];
  fields: LeadFieldId[];
}
export function newLeadSetupDraft(): LeadSetupDraft {
  return {
    version: 1,
    step: 0,
    channels: [],
    fields: ["name", "phone", "service"],
  };
}
export const leadSetupStorageKey = (businessId: string) =>
  `biznesoty.leadSetup.v1:${businessId}`;
export const legacyLeadSetupStorageKey = (businessId: string) =>
  `sreda.leadSetup.v1:${businessId}`;
export function readLeadSetupDraftRaw(businessId: string): string | null {
  try {
    return (
      localStorage.getItem(leadSetupStorageKey(businessId)) ||
      localStorage.getItem(legacyLeadSetupStorageKey(businessId))
    );
  } catch {
    return null;
  }
}
export function writeLeadSetupDraftRaw(businessId: string, raw: string) {
  try {
    localStorage.setItem(leadSetupStorageKey(businessId), raw);
    localStorage.removeItem(legacyLeadSetupStorageKey(businessId));
  } catch {
    /* optional preference */
  }
}
export function parseLeadSetupDraft(raw: string | null): LeadSetupDraft {
  const fallback = newLeadSetupDraft();
  if (!raw) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return fallback;
    const draft = value as Record<string, unknown>;
    if (
      draft.version !== 1 ||
      !Array.isArray(draft.channels) ||
      !Array.isArray(draft.fields)
    )
      return fallback;
    const channels = (
      ["telegram", "vk", "whatsapp", "instagram"] as const
    ).filter((channel) => (draft.channels as unknown[]).includes(channel));
    const fields = LEAD_FIELDS.filter(
      (field) =>
        field.required || (draft.fields as unknown[]).includes(field.id),
    ).map((field) => field.id);
    const step =
      typeof draft.step === "number" &&
      Number.isInteger(draft.step) &&
      draft.step >= 0 &&
      draft.step <= 3 &&
      channels.length
        ? (draft.step as LeadSetupDraft["step"])
        : 0;
    const options: NonNullable<LeadSetupDraft["fieldOptions"]> = {};
    if (draft.fieldOptions && typeof draft.fieldOptions === "object")
      for (const field of fields) {
        const o = (draft.fieldOptions as Record<string, unknown>)[field] as
          | { label?: unknown; required?: unknown }
          | undefined;
        if (
          o &&
          typeof o.label === "string" &&
          o.label.trim() &&
          o.label.length <= 150 &&
          typeof o.required === "boolean"
        )
          options[field] = {
            label: o.label,
            required: field === "name" || o.required,
          };
      }
    return {
      version: 1,
      step,
      channels,
      fields,
      fieldOptions: options,
      ...(typeof draft.title === "string"
        ? { title: draft.title.slice(0, 100) }
        : {}),
      ...(typeof draft.greeting === "string"
        ? { greeting: draft.greeting.slice(0, 2000) }
        : {}),
      ...(typeof draft.finalMessage === "string"
        ? { finalMessage: draft.finalMessage.slice(0, 2000) }
        : {}),
    };
  } catch {
    return fallback;
  }
}
