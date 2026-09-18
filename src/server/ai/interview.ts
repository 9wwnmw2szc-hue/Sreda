import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";
import { completeAiDraft } from "./posts.ts";
import { buildAiContext } from "./context.ts";
import { audit } from "../audit/service.ts";
import { industryPreset } from "../../lib/industryPresets.ts";

export type InterviewAnswer = { id: string; question: string; answer: string };

export type InterviewState = {
  version: 1;
  step: number;
  answers: InterviewAnswer[];
  clarifying: InterviewAnswer[];
  summary: null | {
    name: string;
    about: string;
    tone: string;
    strengths: string;
    faq: string;
    restrictions: string;
  };
  confirmed: boolean;
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
  };
}

function parseState(raw: unknown): InterviewState {
  if (!raw || typeof raw !== "object") return emptyState();
  const o = raw as InterviewState;
  if (o.version !== 1) return emptyState();
  return {
    version: 1,
    step: Number.isInteger(o.step) ? Math.max(0, Math.min(o.step, 20)) : 0,
    answers: Array.isArray(o.answers) ? o.answers : [],
    clarifying: Array.isArray(o.clarifying) ? o.clarifying : [],
    summary: o.summary ?? null,
    confirmed: o.confirmed === true,
  };
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
    private options: { token?: string; model?: string } = {},
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
      let next: InterviewState = {
        ...state,
        answers: nextAnswers,
        step,
        confirmed: false,
      };
      if (step >= questions.length && !next.summary) {
        next = await this.buildSummary(tx, b.id, next);
      }
      await tx
        .updateTable("business")
        .set({ ai_interview: JSON.stringify(next) } as never)
        .where("id", "=", b.id)
        .execute();
      return { state: next, questions };
    });
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
    } catch {
      text = "";
    }
    let summary = state.summary;
    try {
      const parsed = JSON.parse(text) as InterviewState["summary"];
      if (parsed && typeof parsed === "object") summary = parsed;
    } catch {
      const byId = Object.fromEntries(
        state.answers.map((a) => [a.id, a.answer]),
      );
      summary = {
        name: byId.name || "",
        about: byId.about || byId.freeform || "",
        tone: byId.tone || "дружелюбный",
        strengths: byId.important || "",
        faq: byId.faq || "",
        restrictions: byId.restrictions || "",
      };
    }
    return { ...state, summary };
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
      const next = { ...state, confirmed: true };
      const patch: Record<string, unknown> = {
        ai_interview: JSON.stringify(next),
        ai_summary_confirmed_at: new Date(),
      };
      if (apply) {
        patch.ai_about = state.summary.about.slice(0, 8000);
        patch.ai_tone = state.summary.tone.slice(0, 1000);
        patch.ai_important_facts = state.summary.strengths.slice(0, 4000);
        patch.ai_restrictions = state.summary.restrictions.slice(0, 4000);
        if (state.summary.name.trim()) {
          patch.public_name = state.summary.name.trim().slice(0, 100);
        }
        const greetingBits = [
          `Добро пожаловать в ${state.summary.name || row.name}!`,
          state.summary.about ? state.summary.about.slice(0, 400) : "",
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
      return { state: next, applied: apply };
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
        "Короткое приветствие клиента в боте бизнеса (не сервиса Соты).",
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
        "Не представляй бот как сервис «Соты». Говори от имени бизнеса.",
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
      proposal = JSON.parse(draft.text);
    } catch {
      proposal = null;
    }
    return { text: draft.text, proposal };
  }
}
