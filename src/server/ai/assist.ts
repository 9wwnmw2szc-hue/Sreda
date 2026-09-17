import type { Kysely } from "kysely";
import { AppError } from "../http/errors.ts";
import type { Database } from "../db/schema.ts";
import { buildAiContext } from "./context.ts";
import { completeAiDraft, type AiDraftResult } from "./posts.ts";

type AssistOptions = {
  token?: string;
  model?: string;
  transport?: typeof fetch;
};

const SECRET_RE =
  /\b\d{6,}:\w{20,}|\bsk-[a-zA-Z0-9_-]{16,}|-----BEGIN .*PRIVATE KEY-----/;

function rejectSecrets(...parts: string[]) {
  if (SECRET_RE.test(parts.join("\n")))
    throw new AppError(
      400,
      "AI_SECRET_REJECTED",
      "Удалите секретные ключи из текста.",
    );
}

async function withContext(
  db: Kysely<Database>,
  businessId: string,
  task: string,
  input: string,
  options: AssistOptions,
): Promise<AiDraftResult> {
  let contextFragment = "";
  try {
    const ctx = await buildAiContext(db, businessId);
    contextFragment = ctx.systemPromptFragment;
  } catch {
    contextFragment = "";
  }
  return completeAiDraft(
    [
      "Ты помощник бизнеса. Верни только текст черновика до 4096 символов.",
      "Не публикуй, не отправляй сообщения клиентам и не изменяй данные бизнеса.",
      task,
      contextFragment,
    ]
      .filter(Boolean)
      .join("\n\n"),
    input,
    options,
  );
}

export async function suggestReply(
  db: Kysely<Database>,
  businessId: string,
  raw: { message?: unknown; goal?: unknown },
  options: AssistOptions = {},
): Promise<AiDraftResult> {
  const message = typeof raw.message === "string" ? raw.message.trim() : "";
  const goal = typeof raw.goal === "string" ? raw.goal.trim() : "";
  if (!message || message.length > 8000 || goal.length > 2000)
    throw new AppError(
      400,
      "INVALID_AI_INPUT",
      "Укажите сообщение клиента для ответа.",
    );
  rejectSecrets(message, goal);
  return withContext(
    db,
    businessId,
    "Предложи черновик ответа клиенту. Без выдуманных фактов.",
    [message, goal ? "Цель: " + goal : ""].filter(Boolean).join("\n\n"),
    options,
  );
}

export async function suggestGreeting(
  db: Kysely<Database>,
  businessId: string,
  raw: { notes?: unknown } = {},
  options: AssistOptions = {},
): Promise<AiDraftResult> {
  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  if (notes.length > 2000)
    throw new AppError(400, "INVALID_AI_INPUT", "Слишком длинные заметки.");
  rejectSecrets(notes);
  return withContext(
    db,
    businessId,
    "Предложи короткое приветствие для бота или первого сообщения клиенту.",
    notes || "Составь приветствие по профилю бизнеса.",
    options,
  );
}

export async function suggestProductDescription(
  db: Kysely<Database>,
  businessId: string,
  raw: { name?: unknown; facts?: unknown },
  options: AssistOptions = {},
): Promise<AiDraftResult> {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const facts = typeof raw.facts === "string" ? raw.facts.trim() : "";
  if (!name || name.length > 200 || facts.length > 4000)
    throw new AppError(
      400,
      "INVALID_AI_INPUT",
      "Укажите название товара и известные факты.",
    );
  rejectSecrets(name, facts);
  return withContext(
    db,
    businessId,
    "Предложи описание товара. Используй только переданные факты и контекст из базы; не выдумывай цены и наличие.",
    ["Товар: " + name, facts].filter(Boolean).join("\n\n"),
    options,
  );
}

export async function suggestServiceDescription(
  db: Kysely<Database>,
  businessId: string,
  raw: { name?: unknown; facts?: unknown },
  options: AssistOptions = {},
): Promise<AiDraftResult> {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const facts = typeof raw.facts === "string" ? raw.facts.trim() : "";
  if (!name || name.length > 200 || facts.length > 4000)
    throw new AppError(
      400,
      "INVALID_AI_INPUT",
      "Укажите название услуги и известные факты.",
    );
  rejectSecrets(name, facts);
  return withContext(
    db,
    businessId,
    "Предложи описание услуги. Используй только переданные факты и контекст из базы; не выдумывай цены и расписание.",
    ["Услуга: " + name, facts].filter(Boolean).join("\n\n"),
    options,
  );
}
