import { audit } from "../audit/service.ts";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import {
  newLeadSetupDraft,
  LEAD_FIELDS,
  type LeadSetupDraft,
} from "../../lib/leadSetupDraft.ts";
import { syncLeadFormFields } from "../leads/forms.ts";
import { SOLUTIONS, normalizeSolutionCode } from "./catalog.ts";
import type { SolutionStatus } from "../../types/index.ts";
export function validateSetup(raw: unknown): LeadSetupDraft {
  const d = raw as LeadSetupDraft;
  if (
    !d ||
    d.version !== 1 ||
    !Number.isInteger(d.step) ||
    d.step < 0 ||
    d.step > 3 ||
    !Array.isArray(d.channels) ||
    !Array.isArray(d.fields) ||
    d.channels.some((v) => !["telegram", "vk"].includes(v)) ||
    new Set(d.channels).size !== d.channels.length ||
    d.fields.some((v) => !LEAD_FIELDS.some((f) => f.id === v)) ||
    new Set(d.fields).size !== d.fields.length ||
    !d.fields.includes("name") ||
    (d.step > 0 && !d.channels.length)
  )
    throw new AppError(
      400,
      "INVALID_SETUP",
      "Проверьте площадки и вопросы заявки.",
    );
  const copy = (key: "title" | "greeting" | "finalMessage", max: number) => {
    const v = d[key];
    if (v !== undefined && (typeof v !== "string" || v.length > max))
      throw new AppError(400, "INVALID_SETUP", "Проверьте тексты сценария.");
    return v?.trim();
  };
  const fieldOptions: NonNullable<LeadSetupDraft["fieldOptions"]> = {};
  if (d.fieldOptions)
    for (const field of d.fields) {
      const o = d.fieldOptions[field];
      if (o) {
        if (
          typeof o.label !== "string" ||
          !o.label.trim() ||
          o.label.length > 150 ||
          typeof o.required !== "boolean"
        )
          throw new AppError(400, "INVALID_SETUP", "Проверьте вопросы.");
        fieldOptions[field] = {
          label: o.label.trim(),
          required: field === "name" || o.required,
        };
      }
    }
  return {
    ...(d.title !== undefined ? { title: copy("title", 100) } : {}),
    ...(d.greeting !== undefined ? { greeting: copy("greeting", 2000) } : {}),
    ...(d.finalMessage !== undefined
      ? { finalMessage: copy("finalMessage", 2000) }
      : {}),
    ...(d.fieldOptions ? { fieldOptions } : {}),
    version: 1,
    step: d.step,
    channels: [...d.channels],
    fields: LEAD_FIELDS.filter((f) => d.fields.includes(f.id)).map((f) => f.id),
  };
}
export class SolutionService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly telegramEnabled = false,
    private readonly vkEnabled = false,
  ) {}
  async business(userId: string, publicId: string, write = false) {
    const row = await this.db
      .selectFrom("business")
      .innerJoin("business_member as m", "m.business_id", "business.id")
      .select(["business.id", "m.role"])
      .where("business.public_id", "=", publicId)
      .where("business.archived_at", "is", null)
      .where("m.user_id", "=", userId)
      .where("m.status", "=", "active")
      .executeTakeFirst();
    if (!row)
      throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
    if (write && row.role === "operator")
      throw new AppError(
        403,
        "FORBIDDEN",
        "Настройку меняют владелец и администратор.",
      );
    return row.id;
  }
  async get(userId: string, publicId: string) {
    const id = await this.business(userId, publicId);
    const row = await this.db
      .selectFrom("lead_setup")
      .selectAll()
      .where("business_id", "=", id)
      .executeTakeFirst();
    return {
      draft: row ? validateSetup(JSON.parse(row.draft)) : newLeadSetupDraft(),
      revision: row?.revision ?? 0,
    };
  }
  async save(userId: string, publicId: string, body: Record<string, unknown>) {
    const draft = validateSetup(body.draft);
    if (!Number.isInteger(body.revision) || Number(body.revision) < 0)
      throw new AppError(400, "INVALID_REVISION", "Обновите настройку.");
    return this.db.transaction().execute(async (tx) => {
      const id = await new SolutionService(tx).business(userId, publicId, true);
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", id)
        .forUpdate()
        .execute();
      await new SolutionService(tx).business(userId, publicId, true);
      const current = await tx
        .selectFrom("lead_setup")
        .selectAll()
        .where("business_id", "=", id)
        .executeTakeFirst();
      if ((current?.revision ?? 0) !== body.revision)
        throw new AppError(
          409,
          "SETUP_CONFLICT",
          "Настройка изменена в другой вкладке. Обновите страницу перед сохранением.",
        );
      const revision = Number(body.revision) + 1;
      await tx
        .insertInto("lead_setup")
        .values({
          business_id: id,
          draft: JSON.stringify(draft),
          revision,
          updated_at: new Date(),
        })
        .onConflict((oc) =>
          oc
            .column("business_id")
            .doUpdateSet({
              draft: JSON.stringify(draft),
              revision,
              updated_at: new Date(),
            }),
        )
        .execute();
      if (draft.step === 3)
        await tx
          .insertInto("business_solution")
          .values({
            business_id: id,
            solution_code: "leads",
            status: "active",
            starts_at: new Date(),
            expires_at: null,
          })
          .onConflict((oc) =>
            oc
              .columns(["business_id", "solution_code"])
              .doUpdateSet({
                status: "active",
                expires_at: null,
                updated_at: new Date(),
              }),
          )
          .execute();
      if (body.syncFields !== false) await syncLeadFormFields(tx, id, draft);
      await audit(tx, id, userId, "settings_changed", id, {
        solution: "leads",
        revision,
      });
      return { draft, revision };
    });
  }
  async activate(
    userId: string,
    publicId: string,
    raw: Record<string, unknown>,
  ) {
    const code = normalizeSolutionCode(String(raw.code));
    if (
      !["leads", "booking", "autopost", "admin_messages", "orders"].includes(
        code,
      ) ||
      typeof raw.enabled !== "boolean"
    )
      throw new AppError(400, "INVALID_SOLUTION", "Выберите решение.");
    return this.db.transaction().execute(async (tx) => {
      const id = await new SolutionService(tx).business(userId, publicId, true);
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", id)
        .forUpdate()
        .execute();
      await new SolutionService(tx).business(userId, publicId, true);
      const status = raw.enabled ? "active" : "disabled";
      await tx
        .insertInto("business_solution")
        .values({
          business_id: id,
          solution_code: code,
          status,
          starts_at: new Date(),
          expires_at: null,
        })
        .onConflict((oc) =>
          oc
            .columns(["business_id", "solution_code"])
            .doUpdateSet({ status, expires_at: null, updated_at: new Date() }),
        )
        .execute();
      await audit(tx, id, userId, "settings_changed", id, {
        solution: code,
        status,
      });
      return { ok: true };
    });
  }
  async list(userId: string, publicId: string) {
    const id = await this.business(userId, publicId);
    const setup = await this.get(userId, publicId);
    const enabledSolutions = await this.db
      .selectFrom("business_solution")
      .select(["solution_code", "status", "expires_at"])
      .where("business_id", "=", id)
      .execute();
    const now = Date.now();
    const solutionState = new Map(
      enabledSolutions.map((item) => [
        normalizeSolutionCode(item.solution_code),
        {
          active:
            (item.status === "active" || item.status === "trial") &&
            (!item.expires_at || item.expires_at.getTime() > now),
          status: item.status,
        },
      ]),
    );
    const connections = await this.db
      .selectFrom("business_connection")
      .select(["id", "platform"])
      .where("business_id", "=", id)
      .where("status", "=", "connected")
      .execute();
    const beats = await this.db
      .selectFrom("worker_heartbeat")
      .selectAll()
      .execute();
    const alive = (name: string) =>
      beats.some((b) => b.name === name && +b.seen_at > now - 60000);
    const states = new Map<string, { ready: boolean; error: boolean }>();
    for (const c of connections) {
      const r = await this.db
        .selectFrom(
          c.platform === "telegram" ? "telegram_runtime" : "vk_runtime",
        )
        .select("status")
        .where("connection_id", "=", c.id)
        .executeTakeFirst();
      states.set(c.platform, {
        ready:
          r?.status === "ready" &&
          alive(c.platform) &&
          (c.platform === "telegram" ? this.telegramEnabled : this.vkEnabled),
        error:
          r?.status === "error" ||
          (r?.status === "ready" && !alive(c.platform)),
      });
    }
    return SOLUTIONS.map((solution) => {
      const configured = solutionState.get(solution.code)?.active;
      const channels =
        solution.code === "leads" ? setup.draft.channels : [...states.keys()];
      const ready =
        channels.length > 0 && channels.every((c) => states.get(c)?.ready);
      const scheduler =
        solution.code === "autopost"
          ? alive("autopost")
          : solution.code === "booking"
            ? alive("booking_reminders")
            : true;
      let status: SolutionStatus = configured
        ? ready && scheduler
          ? "active"
          : "paused"
        : "unavailable";
      let note = configured
        ? ready && scheduler
          ? "Подключения и обработчики отвечают."
          : "Проверьте запуск каналов и состояние обработчиков на сервере."
        : "Подключите решение, чтобы настроить его функции.";
      if (solution.code === "leads") {
        if (!setup.revision) {
          status = "available";
          note = "Выберите площадки и вопросы.";
        } else if (
          setup.draft.step !== 3 ||
          !channels.length ||
          !channels.every((c) => states.has(c))
        ) {
          status = "setup_required";
          note = "Завершите настройку и подключите выбранные каналы.";
        } else if (configured && ready) {
          status = "active";
          note = "Каналы приёма заявок и обработчики отвечают.";
        } else if (channels.some((c) => states.get(c)?.error)) {
          status = "paused";
          note = "Обработчик сообщений не отвечает или канал приостановлен.";
        } else {
          status = "setup_required";
          note = "Запустите выбранные каналы в разделе «Подключения».";
        }
      }
      return {
        id: publicId + ":" + solution.code,
        businessId: publicId,
        solutionId: solution.id,
        status,
        note,
      };
    });
  }
}
