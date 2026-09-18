/** Map industry lead-form presets to lead_form_field rows. */

export type LeadPresetField = {
  id: string;
  label: string;
  required?: boolean;
};

const TYPE_BY_ID: Record<string, string> = {
  name: "name",
  phone: "phone",
  email: "email",
  contact: "phone",
  car: "text",
  problem: "message",
  photo: "attachment",
  work_type: "text",
  description: "message",
  address: "address",
  deadline: "date",
  budget: "budget",
  topic: "text",
  preferred_time: "text",
  date: "date",
  what: "message",
  amount: "text",
  notes: "textarea",
};

export function leadPresetToFieldBodies(fields: LeadPresetField[]) {
  return fields.map((field, index) => ({
    fieldKey: field.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase() || `f_${index}`,
    label: field.label,
    fieldType: TYPE_BY_ID[field.id] ?? "text",
    required: field.required === true,
    position: index,
    active: true,
    placeholder: "",
    options: [] as string[],
  }));
}
