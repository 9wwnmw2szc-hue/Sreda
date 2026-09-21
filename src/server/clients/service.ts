import { requireUuid } from "../http/validation.ts";
import { randomUUID } from "node:crypto";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";
import { audit } from "../audit/service.ts";
type Identity = {
  kind: "telegram" | "vk" | "whatsapp" | "instagram" | "phone" | "email";
  value: string;
  username?: string | null;
};
export function normalizeIdentity(identity: Identity): Identity {
  let value = identity.value.trim();
  if (identity.kind === "phone") {
    value = value.replace(/[\s().-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(value))
      throw new AppError(
        400,
        "INVALID_PHONE",
        "Укажите телефон в международном формате.",
      );
  } else if (identity.kind === "email") {
    value = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254)
      throw new AppError(400, "INVALID_EMAIL", "Проверьте email.");
  } else if (identity.kind === "whatsapp" || identity.kind === "instagram") {
    // WhatsApp: E.164 digits without +. Instagram: numeric IGSID / Page-scoped id.
    if (!/^[1-9]\d{0,31}$/.test(value))
      throw new AppError(400, "INVALID_IDENTITY", "Некорректный идентификатор.");
  } else if (!/^[1-9]\d{0,19}$/.test(value))
    throw new AppError(400, "INVALID_IDENTITY", "Некорректный идентификатор.");
  return { ...identity, value };
}
export function clientInput(raw: Record<string, unknown>) {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 100 || /[\u0000-\u001f]/.test(name))
    throw new AppError(400, "INVALID_CLIENT", "Укажите имя до 100 символов.");
  const phone = raw.phone
    ? normalizeIdentity({ kind: "phone", value: String(raw.phone) }).value
    : null;
  const email = raw.email
    ? normalizeIdentity({ kind: "email", value: String(raw.email) }).value
    : null;
  return { name, phone, email };
}
/** Only trusted platform updates or verified contact proofs may provide identities. */
export async function matchClient(
  tx: Transaction<Database>,
  businessId: string,
  input: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    identities: Identity[];
  },
) {
  const business = await tx
    .selectFrom("business")
    .select("id")
    .where("id", "=", businessId)
    .where("archived_at", "is", null)
    .forUpdate()
    .executeTakeFirst();
  if (!business)
    throw new AppError(404, "BUSINESS_NOT_FOUND", "Бизнес не найден.");
  const identities = input.identities.map(normalizeIdentity);
  const ids = new Set<string>();
  for (const i of identities) {
    const found = await tx
      .selectFrom("client_identity as i")
      .innerJoin("client as c", (join) =>
        join
          .onRef("c.id", "=", "i.client_id")
          .onRef("c.business_id", "=", "i.business_id"),
      )
      .select("i.client_id")
      .where("i.business_id", "=", businessId)
      .where("i.kind", "=", i.kind)
      .where("i.value", "=", i.value)
      .where("c.archived_at", "is", null)
      .executeTakeFirst();
    if (found) ids.add(found.client_id);
  }
  if (ids.size > 1)
    throw new AppError(
      409,
      "CLIENT_IDENTITY_CONFLICT",
      "Идентификаторы принадлежат разным клиентам. Требуется проверка сотрудником.",
    );
  const id = [...ids][0] ?? randomUUID();
  const now = new Date();
  if (ids.size === 0)
    await tx
      .insertInto("client")
      .values({
        id,
        business_id: businessId,
        name: input.name?.trim().slice(0, 100) || "Клиент",
        phone: input.phone ?? null,
        email: input.email ?? null,
      })
      .execute();
  else
    await tx
      .updateTable("client")
      .set({
        last_seen_at: now,
        updated_at: now,
        ...(input.name ? { name: input.name.trim().slice(0, 100) } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email ? { email: input.email } : {}),
      })
      .where("id", "=", id)
      .where("business_id", "=", businessId)
      .execute();
  for (const i of identities)
    await tx
      .insertInto("client_identity")
      .values({
        business_id: businessId,
        client_id: id,
        kind: i.kind,
        value: i.value,
        username: i.username ?? null,
      })
      .onConflict((oc) =>
        oc
          .columns(["business_id", "kind", "value"])
          .doUpdateSet({ username: i.username ?? null }),
      )
      .execute();
  return id;
}
export async function clientActivity(
  tx: Transaction<Database>,
  businessId: string,
  clientId: string,
  type: string,
  eventKey: string,
  targetId: string | null = null,
  actorId: string | null = null,
) {
  await tx
    .insertInto("client_activity")
    .values({
      id: randomUUID(),
      business_id: businessId,
      client_id: clientId,
      type,
      event_key: eventKey,
      target_id: targetId,
      actor_user_id: actorId,
    })
    .onConflict((oc) => oc.columns(["business_id", "event_key"]).doNothing())
    .execute();
}
export class ClientService {
  constructor(private db: Kysely<Database>) {}
  async list(
    userId: string,
    publicId: string,
    search = "",
    before?: string,
    filter = "all",
  ) {
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    let q = this.db
      .selectFrom("client as c")
      .selectAll("c")
      .where("c.business_id", "=", b.id)
      .where("c.archived_at", "is", null)
      .orderBy("c.id")
      .limit(100);
    if (!["all", "new", "active", "leads", "bookings", "open"].includes(filter))
      throw new AppError(400, "INVALID_FILTER", "Проверьте фильтр.");
    if (filter === "new")
      q = q.where("c.first_seen_at", ">=", new Date(Date.now() - 7 * 86400000));
    if (filter === "active")
      q = q.where("c.last_seen_at", ">=", new Date(Date.now() - 30 * 86400000));
    if (filter === "leads")
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom("lead")
            .select("id")
            .whereRef("client_id", "=", "c.id")
            .whereRef("business_id", "=", "c.business_id"),
        ),
      );
    if (filter === "bookings")
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom("booking")
            .select("id")
            .whereRef("client_id", "=", "c.id")
            .whereRef("business_id", "=", "c.business_id"),
        ),
      );
    if (filter === "open")
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom("communication_conversation")
            .select("id")
            .whereRef("client_id", "=", "c.id")
            .whereRef("business_id", "=", "c.business_id")
            .where("status", "in", ["open", "assigned"]),
        ),
      );
    if (search.length > 100)
      throw new AppError(400, "INVALID_SEARCH", "Слишком длинный запрос.");
    if (search)
      q = q.where((eb) =>
        eb.or([
          eb("c.name", "ilike", "%" + search + "%"),
          eb("c.phone", "ilike", "%" + search + "%"),
          eb.exists(
            eb
              .selectFrom("client_identity as i")
              .select("i.client_id")
              .whereRef("i.client_id", "=", "c.id")
              .whereRef("i.business_id", "=", "c.business_id")
              .where("i.username", "ilike", "%" + search + "%"),
          ),
        ]),
      );
    if (before) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          before,
        )
      )
        throw new AppError(400, "INVALID_CURSOR", "Обновите список.");
      q = q.where("c.id", ">", before);
    }
    return Promise.all(
      (await q.execute()).map(async (c) => ({
        ...c,
        identities: await this.db
          .selectFrom("client_identity")
          .select(["kind", "value", "username"])
          .where("business_id", "=", b.id)
          .where("client_id", "=", c.id)
          .execute(),
        lead_count: Number(
          (
            await this.db
              .selectFrom("lead")
              .select(({ fn }) => fn.countAll().as("n"))
              .where("business_id", "=", b.id)
              .where("client_id", "=", c.id)
              .executeTakeFirstOrThrow()
          ).n,
        ),
        booking_count: Number(
          (
            await this.db
              .selectFrom("booking")
              .select(({ fn }) => fn.countAll().as("n"))
              .where("business_id", "=", b.id)
              .where("client_id", "=", c.id)
              .executeTakeFirstOrThrow()
          ).n,
        ),
        open_dialog: !!(await this.db
          .selectFrom("communication_conversation")
          .select("id")
          .where("business_id", "=", b.id)
          .where("client_id", "=", c.id)
          .where("status", "in", ["open", "assigned"])
          .executeTakeFirst()),
      })),
    );
  }
  async detail(userId: string, publicId: string, id: string, page = 0) {
    if (!Number.isSafeInteger(page) || page < 0 || page > 100000)
      throw new AppError(400, "INVALID_PAGE", "Проверьте страницу истории.");
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      throw new AppError(404, "CLIENT_NOT_FOUND", "Клиент не найден.");
    const client = await this.db
      .selectFrom("client")
      .selectAll()
      .where("business_id", "=", b.id)
      .where("id", "=", id)
      .where("archived_at", "is", null)
      .executeTakeFirst();
    if (!client)
      throw new AppError(404, "CLIENT_NOT_FOUND", "Клиент не найден.");
    const [identities, leads, conversations, activity, notes, bookings, orders] =
      await Promise.all([
        this.db
          .selectFrom("client_identity")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("client_id", "=", id)
          .execute(),
        this.db
          .selectFrom("lead")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("client_id", "=", id)
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .limit(100)
          .offset(page * 100)
          .execute(),
        this.db
          .selectFrom("communication_conversation")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("client_id", "=", id)
          .execute(),
        this.db
          .selectFrom("client_activity")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("client_id", "=", id)
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .limit(100)
          .offset(page * 100)
          .execute(),
        this.db
          .selectFrom("client_note")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("client_id", "=", id)
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .limit(100)
          .offset(page * 100)
          .execute(),
        this.db
          .selectFrom("booking as k")
          .innerJoin("booking_service as s", "s.id", "k.service_id")
          .innerJoin("booking_specialist as r", "r.id", "k.specialist_id")
          .selectAll("k")
          .select(["s.name as service_name", "r.name as specialist_name"])
          .where("k.business_id", "=", b.id)
          .where("k.client_id", "=", id)
          .orderBy("k.starts_at", "desc")
          .orderBy("k.id", "desc")
          .limit(100)
          .offset(page * 100)
          .execute(),
        this.db
          .selectFrom("order")
          .selectAll()
          .where("business_id", "=", b.id)
          .where("client_id", "=", id)
          .orderBy("created_at", "desc")
          .orderBy("id", "desc")
          .limit(100)
          .offset(page * 100)
          .execute(),
      ]);
    return {
      hasMore: [leads, activity, notes, bookings, orders].some(
        (rows) => rows.length === 100,
      ),
      client,
      identities,
      leads,
      conversations,
      activity,
      notes,
      bookings,
      orders,
    };
  }
  async save(
    userId: string,
    publicId: string,
    raw: Record<string, unknown>,
    id?: string,
  ) {
    if (id !== undefined) requireUuid(id);
    const input = clientInput(raw);
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "clients.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "clients.write");
      if (id) {
        const changed = await tx
          .updateTable("client")
          .set({ ...input, updated_at: new Date() })
          .where("business_id", "=", b.id)
          .where("id", "=", id)
          .where("archived_at", "is", null)
          .returning("id")
          .executeTakeFirst();
        if (!changed)
          throw new AppError(404, "CLIENT_NOT_FOUND", "Клиент не найден.");
      } else id = await matchClient(tx, b.id, { ...input, identities: [] });
      await clientActivity(
        tx,
        b.id,
        id,
        "client.updated",
        randomUUID(),
        id,
        userId,
      );
      return { id };
    });
  }
  async note(userId: string, publicId: string, id: string, value: unknown) {
    requireUuid(id);
    if (typeof value !== "string" || !value.trim() || value.length > 4000)
      throw new AppError(
        400,
        "INVALID_NOTE",
        "Введите заметку до 4000 символов.",
      );
    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "clients.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "clients.write");
      const c = await tx
        .selectFrom("client")
        .select("id")
        .where("business_id", "=", b.id)
        .where("id", "=", id)
        .where("archived_at", "is", null)
        .executeTakeFirst();
      if (!c) throw new AppError(404, "CLIENT_NOT_FOUND", "Клиент не найден.");
      return tx
        .insertInto("client_note")
        .values({
          id: randomUUID(),
          business_id: b.id,
          client_id: id,
          actor_user_id: userId,
          text: value.trim(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  async merge(
    userId: string,
    publicId: string,
    raw: Record<string, unknown>,
  ) {
    const sourceId =
      typeof raw.source_client_id === "string" ? raw.source_client_id : "";
    const targetId =
      typeof raw.target_client_id === "string" ? raw.target_client_id : "";
    requireUuid(sourceId);
    requireUuid(targetId);
    if (sourceId === targetId)
      throw new AppError(
        400,
        "INVALID_MERGE",
        "Выберите двух разных клиентов.",
      );

    return this.db.transaction().execute(async (tx) => {
      const b = await requireBusiness(tx, userId, publicId, "clients.write");
      await tx
        .selectFrom("business")
        .select("id")
        .where("id", "=", b.id)
        .forUpdate()
        .execute();
      await requireBusiness(tx, userId, publicId, "clients.write");

      const source = await tx
        .selectFrom("client")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("id", "=", sourceId)
        .where("archived_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      const target = await tx
        .selectFrom("client")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("id", "=", targetId)
        .where("archived_at", "is", null)
        .forUpdate()
        .executeTakeFirst();
      if (!source || !target)
        throw new AppError(
          404,
          "CLIENT_NOT_FOUND",
          "Клиент не найден в этом бизнесе.",
        );

      const targetIdentities = await tx
        .selectFrom("client_identity")
        .select(["kind", "value"])
        .where("business_id", "=", b.id)
        .where("client_id", "=", targetId)
        .execute();
      const targetKeys = new Set(
        targetIdentities.map((i) => `${i.kind}:${i.value}`),
      );
      const sourceIdentities = await tx
        .selectFrom("client_identity")
        .selectAll()
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();

      for (const identity of sourceIdentities) {
        const key = `${identity.kind}:${identity.value}`;
        if (targetKeys.has(key)) {
          await tx
            .deleteFrom("client_identity")
            .where("business_id", "=", b.id)
            .where("client_id", "=", sourceId)
            .where("kind", "=", identity.kind)
            .where("value", "=", identity.value)
            .execute();
        } else {
          await tx
            .updateTable("client_identity")
            .set({ client_id: targetId })
            .where("business_id", "=", b.id)
            .where("client_id", "=", sourceId)
            .where("kind", "=", identity.kind)
            .where("value", "=", identity.value)
            .execute();
        }
      }

      await tx
        .updateTable("lead")
        .set({ client_id: targetId })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("booking")
        .set({ client_id: targetId })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("order")
        .set({ client_id: targetId })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("cart")
        .set({ client_id: targetId, updated_at: new Date() })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("client_note")
        .set({ client_id: targetId })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("client_activity")
        .set({ client_id: targetId })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("communication_conversation")
        .set({ client_id: targetId })
        .where("business_id", "=", b.id)
        .where("client_id", "=", sourceId)
        .execute();
      await tx
        .updateTable("calendar_event")
        .set({ related_client_id: targetId })
        .where("business_id", "=", b.id)
        .where("related_client_id", "=", sourceId)
        .execute();

      await tx
        .updateTable("client")
        .set({
          name: target.name || source.name,
          phone: target.phone ?? source.phone,
          email: target.email ?? source.email,
          first_seen_at:
            source.first_seen_at < target.first_seen_at
              ? source.first_seen_at
              : target.first_seen_at,
          last_seen_at:
            source.last_seen_at > target.last_seen_at
              ? source.last_seen_at
              : target.last_seen_at,
          updated_at: new Date(),
        })
        .where("business_id", "=", b.id)
        .where("id", "=", targetId)
        .execute();

      const now = new Date();
      await tx
        .updateTable("client")
        .set({
          archived_at: now,
          merged_into_id: targetId,
          updated_at: now,
        })
        .where("business_id", "=", b.id)
        .where("id", "=", sourceId)
        .execute();

      await clientActivity(
        tx,
        b.id,
        targetId,
        "client.merged",
        `client-merge:${sourceId}:${targetId}`,
        sourceId,
        userId,
      );
      await audit(tx, b.id, userId, "client_merged", targetId, {
        source_client_id: sourceId,
        target_client_id: targetId,
        source_name: source.name,
        target_name: target.name,
      });

      return { target_client_id: targetId, source_client_id: sourceId };
    });
  }
}
