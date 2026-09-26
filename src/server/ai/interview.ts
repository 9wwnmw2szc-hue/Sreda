import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";
import { completeAiDraft } from "./posts.ts";
import { buildAiContext } from "./context.ts";
import { audit } from "../audit/service.ts";
import { industryPreset } from "../../lib/industryPresets.ts";

export type InterviewAnswer = { id: string; question: string; answer: string };

export type InterviewSummary = {
  name: string;
  about: string;
  tone: string;
  strengths: string;
  faq: string;
  restrictions: string;
};

export type InterviewState = {
  version: 1;
  step: number;
  answers: InterviewAnswer[];
  clarifying: InterviewAnswer[];
  summary: InterviewSummary | null;
  confirmed: boolean;
  /** True when summary was built without a live AI response. */
  aiFallback?: boolean;
  /** Last recoverable AI error code, if any. */
  lastAiError?: string | null;
};

const BASE_QUESTIONS: { id: string; question: string }[] = [
  { id: "name", question: "Как называется ваш бизнес?" },
  { id: "about", question: "Чем вы занимаетесь?" },
  { id: "offer", question: "Какие товары или услуги для вас основные?" },
  { id: "clients", question: "Кто обычно ваши клиенты?" },
  {
    id: "tone",
    question:
      "Как вы хотите общаться с клиентами? (дружелюбно / делово / коротко / премиально / свой вариант)",
  },
  { id: "important", question: "Что особенно важно рассказать клиенту?" },
  { id: "faq", question: "Какие вопросы клиенты задают чаще всего?" },
  {
    id: "restrictions",
    question: "Что AI никогда не должен обещать или утверждать?",
  },
  {
    id: "special",
    question: "Есть ли особенности работы, которые важно учитывать?",
  },
];

function emptyState(): InterviewState {
  return {
    version: 1,
    step: 0,
    answers: [],
    clarifying: [],
    summary: null,
    confirmed: false,
    aiFallback: false,
    lastAiError: null,
  };
}

function asString(value: unknown, max = 8000): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value).slice(0, max);
  return "";
}

export function normalizeSummary(
  raw: unknown,
  answers: InterviewAnswer[] = [],
): InterviewSummary {
  const byId = Object.fromEntries(answers.map((a) => [a.id, a.answer]));
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    name: asString(obj.name, 200) || asString(byId.name, 200),
    about:
      asString(obj.about, 8000) ||
      asString(byId.about, 8000) ||
      asString(byId.freeform, 8000),
    tone: asString(obj.tone, 1000) || asString(byId.tone, 1000) || "дружелюбный",
    strengths:
      asString(obj.strengths, 4000) || asString(byId.important, 4000),
    faq: asString(obj.faq, 4000) || asString(byId.faq, 4000),
    restrictions:
      asString(obj.restrictions, 4000) || asString(byId.restrictions, 4000),
  };
}

/** Strip markdown fences / leading prose before JSON parse. */
export function extractJsonPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function parseState(raw: unknown): InterviewState {
  if (!raw || typeof raw !== "object") return emptyState();
  const o = raw as InterviewState;
  if (o.version !== 1) return emptyState();
  const answers = Array.isArray(o.answers) ? o.answers : [];
  return {
    version: 1,
    step: Number.isInteger(o.step) ? Math.max(0, Math.min(o.step, 20)) : 0,
    answers,
    clarifying: Array.isArray(o.clarifying) ? o.clarifying : [],
    summary: o.summary ? normalizeSummary(o.summary, answers) : null,
    confirmed: o.confirmed === true,
    aiFallback: o.aiFallback === true,
    lastAiError: typeof o.lastAiError === "string" ? o.lastAiError : null,
  };
}

function fallbackSummary(answers: InterviewAnswer[]): InterviewSummary {
  return normalizeSummary({}, answers);
}

function questionsForBusiness(
  industry: string | null,
  type: string,
): { id: string; question: string }[] {
  const preset = industryPreset(industry);
  if (preset?.questions?.length) return preset.questions;
  const extra =
    type === "store"
      ? [
          { id: "delivery", question: "Есть ли доставка или самовывоз?" },
          {
            id: "stock_q",
            question: "Как клиент обычно узнаёт, есть ли товар в наличии?",
          },
        ]
      : type === "service"
        ? [
            {
              id: "need_booking",
              question: "Нужна ли предварительная запись на услуги?",
            },
            {
              id: "specialists",
              question: "Есть ли специалисты, между которыми выбирает клиент?",
            },
          ]
        : [
            {
              id: "hybrid_focus",
              question:
                "Что важнее для клиентов: товары, услуги или и то и другое?",
            },
          ];
  return [...BASE_QUESTIONS, ...extra];
}

export class AiInterviewService {
  constructor(
    private db: Kysely<Database>,
    private options: {
      token?: string;
      model?: string;
      transport?: typeof fetch;
    } = {},
  ) {}

  async get(userId: string, publicId: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "settings.manage",
    );
    const row = await this.db
      .selectFrom("business")
      .select([
        "business_type",
        "industry",
        "ai_interview",
        "name",
        "greeting",
        "ai_about",
      ])
      .where("id", "=", b.id)
      .executeTakeFirstOrThrow();
    const state = parseState(row.ai_interview);
    const questions = questionsForBusiness(row.industry, row.business_type);
    const current =
      state.step < questions.length ? questions[state.step] : null;
    return {
      state,
      questions,
      currentQuestion: current,
      business_type: row.business_type,
      industry: row.industry,
      name: row.name,
    };
  }

  async answer(
    userId: string,
    publicId: string,
    body: { questionId?: string; answer?: string },
  ) {
    const answer = String(body.answer ?? "").trim();
    const questionId = String(body.questionId ?? "");
    if (!questionId || !answer || answer.length > 4000)
      throw new AppError(400, "INVALID_INTERVIEW", "Введите ответ на вопрос.");

    // Persist answers first in a short lock — never hold FOR UPDATE across AI I/O.
    const saved = await this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "settings.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      const row = await tx
        .selectFrom("business")
        .select(["business_type", "industry", "ai_interview"])
        .where("id", "=", b.id)
        .executeTakeFirstOrThrow();
      const state = parseState(row.ai_interview);
      const questions = questionsForBusiness(row.industry, row.business_type);
      const q = questions.find((item) => item.id === questionId);
      if (!q)
        throw new AppError(400, "INVALID_INTERVIEW", "Неизвестный вопрос.");
      const nextAnswers = [
        ...state.answers.filter((a) => a.id !== questionId),
        { id: questionId, question: q.question, answer },
      ];
      const step = Math.min(state.step + 1, questions.length);
      const needsSummary = step >= questions.length && !state.summary;
      const next: InterviewState = {
        ...state,
        answers: nextAnswers,
        step,
        confirmed: false,
        // Keep existing summary unless regenerating later.
        summary: needsSummary ? null : state.summary,
        lastAiError: needsSummary ? null : state.lastAiError,
      };
      await tx
        .updateTable("business")
        .set({ ai_interview: JSON.stringify(next) } as never)
        .where("id", "=", b.id)
        .execute();
      return {
        businessId: b.id,
        state: next,
        questions,
        needsSummary,
      };
    });

    if (!saved.needsSummary) {
      return { state: saved.state, questions: saved.questions };
    }

    const summarized = await this.buildAndPersistSummary(
      saved.businessId,
      saved.state,
    );
    return { state: summarized, questions: saved.questions };
  }

  /** Rebuild summary from saved answers (retry after AI outage). Idempotent. */
  async regenerateSummary(userId: string, publicId: string) {
    const prepared = await this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "settings.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      const row = await tx
        .selectFrom("business")
        .select(["business_type", "industry", "ai_interview"])
        .where("id", "=", b.id)
        .executeTakeFirstOrThrow();
      const state = parseState(row.ai_interview);
      const questions = questionsForBusiness(row.industry, row.business_type);
      if (state.step < questions.length)
        throw new AppError(
          400,
          "INVALID_INTERVIEW",
          "Сначала ответьте на все вопросы.",
        );
      if (state.confirmed)
        throw new AppError(
          409,
          "INTERVIEW_CONFIRMED",
          "Интервью уже подтверждено.",
        );
      // Clear summary so rebuild replaces it; answers stay intact.
      const next: InterviewState = {
        ...state,
        summary: null,
        confirmed: false,
        lastAiError: null,
      };
      await tx
        .updateTable("business")
        .set({ ai_interview: JSON.stringify(next) } as never)
        .where("id", "=", b.id)
        .execute();
      return { businessId: b.id, state: next, questions };
    });

    const summarized = await this.buildAndPersistSummary(
      prepared.businessId,
      prepared.state,
    );
    return { state: summarized, questions: prepared.questions };
  }

  private async buildAndPersistSummary(
    businessId: string,
    state: InterviewState,
  ): Promise<InterviewState> {
    const built = await this.buildSummary(this.db, businessId, state);
    await this.db
      .updateTable("business")
      .set({ ai_interview: JSON.stringify(built) } as never)
      .where("id", "=", businessId)
      .execute();
    return built;
  }

  private async buildSummary(
    db: Kysely<Database>,
    businessId: string,
    state: InterviewState,
  ): Promise<InterviewState> {
    const transcript = state.answers
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join("\n\n");
    let text = "";
    let aiError: string | null = null;
    try {
      const ctx = await buildAiContext(db, businessId);
      const draft = await completeAiDraft(
        [
          "Собери краткое резюме бизнеса по ответам владельца.",
          "Верни строго JSON с ключами: name, about, tone, strengths, faq, restrictions.",
          "Не выдумывай цены, наличие, адрес, расписание.",
          ctx.systemPromptFragment,
        ].join("\n\n"),
        transcript,
        this.options,
      );
      text = draft.text;
    } catch (error) {
      aiError =
        error instanceof AppError ? error.code : "AI_UNAVAILABLE";
      text = "";
    }

    let summary: InterviewSummary;
    let aiFallback = false;
    if (text) {
      try {
        const parsed = JSON.parse(extractJsonPayload(text)) as unknown;
        summary = normalizeSummary(parsed, state.answers);
        // If AI returned empty object / all blanks, treat as fallback.
        if (!summary.name && !summary.about) {
          summary = fallbackSummary(state.answers);
          aiFallback = true;
          aiError = aiError ?? "AI_MALFORMED_RESPONSE";
        }
      } catch {
        summary = fallbackSummary(state.answers);
        aiFallback = true;
        aiError = "AI_MALFORMED_RESPONSE";
      }
    } else {
      summary = fallbackSummary(state.answers);
      aiFallback = true;
      aiError = aiError ?? "AI_UNAVAILABLE";
    }

    return {
      ...state,
      summary,
      aiFallback,
      lastAiError: aiFallback ? aiError : null,
      confirmed: false,
    };
  }

  async confirm(userId: string, publicId: string, apply: boolean) {
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "settings.manage");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      const row = await tx
        .selectFrom("business")
        .select(["ai_interview", "name"])
        .where("id", "=", b.id)
        .executeTakeFirstOrThrow();
      const state = parseState(row.ai_interview);
      if (!state.summary)
        throw new AppError(
          400,
          "INVALID_INTERVIEW",
          "Сначала завершите ответы, чтобы получить резюме.",
        );
      // Idempotent: already confirmed — return current state without re-applying.
      if (state.confirmed) {
        return { state, applied: false, alreadyConfirmed: true as const };
      }
      const summary = normalizeSummary(state.summary, state.answers);
      const next: InterviewState = {
        ...state,
        summary,
        confirmed: true,
      };
      const patch: Record<string, unknown> = {
        ai_interview: JSON.stringify(next),
        ai_summary_confirmed_at: new Date(),
      };
      if (apply) {
        patch.ai_about = summary.about.slice(0, 8000);
        patch.ai_tone = summary.tone.slice(0, 1000);
        patch.ai_important_facts = summary.strengths.slice(0, 4000);
        patch.ai_restrictions = summary.restrictions.slice(0, 4000);
        if (summary.name.trim()) {
          patch.public_name = summary.name.trim().slice(0, 100);
        }
        const greetingBits = [
          `Добро пожаловать в ${summary.name || row.name}!`,
          summary.about ? summary.about.slice(0, 400) : "",
        ].filter(Boolean);
        patch.greeting = greetingBits.join("\n\n").slice(0, 2000);
      }
      await tx
        .updateTable("business")
        .set(patch as never)
        .where("id", "=", b.id)
        .execute();
      await audit(tx, b.id, userId, "settings_changed", b.id, {
        ai_interview_confirmed: true,
        applied: apply,
      });
      return { state: next, applied: apply, alreadyConfirmed: false as const };
    });
  }

  async suggestTexts(userId: string, publicId: string, kind: string) {
    const b = await requireBusiness(
      this.db,
      userId,
      publicId,
      "settings.manage",
    );
    const kinds: Record<string, string> = {
      greeting:
        "Короткое приветствие клиента в боте бизнеса (не сервиса БизнеСоты).",
      faq: "3 коротких FAQ для клиентов на основе профиля. Без выдуманных цен.",
      after_lead: "Сообщение после отправки заявки.",
      after_order: "Сообщение после оформления заказа.",
      after_booking: "Сообщение подтверждения записи.",
      admin_button: "Текст кнопки «связаться с администратором».",
    };
    const task = kinds[kind];
    if (!task)
      throw new AppError(400, "INVALID_AI_INPUT", "Выберите тип текста.");
    const ctx = await buildAiContext(this.db, b.id);
    return completeAiDraft(
      [
        "Ты помощник владельца бизнеса. Верни только текст черновика.",
        "Не представляй бот как сервис «БизнеСоты». Говори от имени бизнеса.",
        "Не выдумывай цены, наличие, расписание, адрес.",
        task,
        ctx.systemPromptFragment,
      ].join("\n\n"),
      "Составь текст.",
      this.options,
    );
  }

  async suggestSchedule(userId: string, publicId: string, notes: string) {
    await requireBusiness(
      this.db,
      userId,
      publicId,
      "solutions.manage",
    );
    if (notes.length > 4000)
      throw new AppError(400, "INVALID_AI_INPUT", "Слишком длинные заметки.");
    const draft = await completeAiDraft(
      [
        "Помоги настроить рабочее расписание для онлайн-записи.",
        'Верни строго JSON: {"weekdays":[{"weekday":1,"enabled":true,"start":"09:00","end":"18:00","breaks":[{"start":"13:00","end":"14:00"}]}],"buffer_minutes":15,"horizon_days":30,"slot_interval":30,"notice_minutes":120}',
        "weekday: 0=вс … 6=сб. Не сохраняй и не активируй — только черновик.",
      ].join("\n\n"),
      notes || "Обычный график пн–пт 9–18, обед 13–14.",
      this.options,
    );
    let proposal: unknown = null;
    try {
      proposal = JSON.parse(extractJsonPayload(draft.text));
    } catch {
      proposal = null;
    }
    return { text: draft.text, proposal };
  }
}
