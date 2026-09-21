import { sql, type Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { AppError } from "../http/errors.ts";
import { requireBusiness } from "../access/permissions.ts";

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type BusinessSearchHit = {
  type: "client" | "order" | "product" | "lead" | "booking";
  id: string;
  label: string;
  subtitle: string | null;
  href: string;
};

export class BusinessSearchService {
  constructor(private db: Kysely<Database>) {}

  async search(
    userId: string,
    publicId: string,
    q: string,
    limitRaw?: string | null,
  ): Promise<{ q: string; items: BusinessSearchHit[] }> {
    const b = await requireBusiness(this.db, userId, publicId, "clients.read");
    const trimmed = typeof q === "string" ? q.trim() : "";
    if (trimmed.length < 2)
      throw new AppError(
        400,
        "INVALID_SEARCH",
        "Введите не менее 2 символов.",
      );
    if (trimmed.length > 100)
      throw new AppError(400, "INVALID_SEARCH", "Слишком длинный запрос.");

    const limit = Math.min(
      40,
      Math.max(1, Math.floor(Number(limitRaw) || 20)),
    );
    const perType = Math.max(3, Math.ceil(limit / 5));
    const pattern = "%" + escapeIlike(trimmed) + "%";
    const orderDigits = trimmed.replace(/\D/g, "");

    const [clients, orders, products, leads, bookings] = await Promise.all([
      this.db
        .selectFrom("client")
        .select(["id", "name", "phone"])
        .where("business_id", "=", b.id)
        .where("archived_at", "is", null)
        .where((eb) =>
          eb.or([
            sql<boolean>`name ilike ${pattern} escape '\\'`,
            sql<boolean>`coalesce(phone, '') ilike ${pattern} escape '\\'`,
          ]),
        )
        .orderBy("last_seen_at", "desc")
        .limit(perType)
        .execute(),
      this.db
        .selectFrom("order")
        .select(["id", "order_number", "customer_name", "status"])
        .where("business_id", "=", b.id)
        .where((eb) =>
          eb.or([
            ...(orderDigits
              ? [sql<boolean>`cast(order_number as text) like ${"%" + orderDigits + "%"}`]
              : []),
            sql<boolean>`cast(order_number as text) ilike ${pattern} escape '\\'`,
          ]),
        )
        .orderBy("created_at", "desc")
        .limit(perType)
        .execute(),
      this.db
        .selectFrom("product")
        .select(["id", "name", "sku"])
        .where("business_id", "=", b.id)
        .where("active", "=", true)
        .where((eb) =>
          eb.or([
            sql<boolean>`name ilike ${pattern} escape '\\'`,
            sql<boolean>`coalesce(sku, '') ilike ${pattern} escape '\\'`,
          ]),
        )
        .orderBy("name")
        .limit(perType)
        .execute(),
      this.db
        .selectFrom("lead")
        .select(["id", "name", "phone", "status"])
        .where("business_id", "=", b.id)
        .where((eb) =>
          eb.or([
            sql<boolean>`name ilike ${pattern} escape '\\'`,
            sql<boolean>`coalesce(phone, '') ilike ${pattern} escape '\\'`,
          ]),
        )
        .orderBy("created_at", "desc")
        .limit(perType)
        .execute(),
      this.db
        .selectFrom("booking as k")
        .innerJoin("client as c", (join) =>
          join
            .onRef("c.id", "=", "k.client_id")
            .onRef("c.business_id", "=", "k.business_id"),
        )
        .innerJoin("booking_service as s", "s.id", "k.service_id")
        .select([
          "k.id",
          "c.name as customer_name",
          "s.name as service_name",
          "k.starts_at",
          "k.status",
        ])
        .where("k.business_id", "=", b.id)
        .where("c.archived_at", "is", null)
        .where(sql<boolean>`c.name ilike ${pattern} escape '\\'`)
        .orderBy("k.starts_at", "desc")
        .limit(perType)
        .execute(),
    ]);

    const items: BusinessSearchHit[] = [
      ...clients.map((c) => ({
        type: "client" as const,
        id: c.id,
        label: c.name,
        subtitle: c.phone,
        href: `/clients?client=${c.id}`,
      })),
      ...orders.map((o) => ({
        type: "order" as const,
        id: o.id,
        label:
          o.order_number != null
            ? `Заказ №${o.order_number}`
            : `Заказ ${o.id.slice(0, 8)}`,
        subtitle: `${o.customer_name} · ${o.status}`,
        href: `/orders?order=${o.id}`,
      })),
      ...products.map((p) => ({
        type: "product" as const,
        id: p.id,
        label: p.name,
        subtitle: p.sku ? `SKU ${p.sku}` : null,
        href: `/orders?product=${p.id}`,
      })),
      ...leads.map((l) => ({
        type: "lead" as const,
        id: l.id,
        label: l.name,
        subtitle: [l.phone, l.status].filter(Boolean).join(" · ") || null,
        href: `/leads?lead=${l.id}`,
      })),
      ...bookings.map((row) => ({
        type: "booking" as const,
        id: row.id,
        label: row.customer_name,
        subtitle: `${row.service_name} · ${row.status}`,
        href: `/bookings?booking=${row.id}`,
      })),
    ].slice(0, limit);

    return { q: trimmed, items };
  }
}
