import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";

export type AiProductFact = {
  name: string;
  price: string;
  availability: string;
};

export type AiServiceFact = {
  name: string;
  price: string | null;
  duration_minutes: number;
};

export type AiContext = {
  businessId: string;
  name: string;
  publicName: string | null;
  timezone: string;
  businessType: "store" | "service" | "hybrid";
  about: string;
  tone: string;
  importantFacts: string;
  restrictions: string[];
  deliveryInfo: string;
  geography: string;
  returnsInfo: string;
  extraInstructions: string;
  products: AiProductFact[];
  services: AiServiceFact[];
  systemPromptFragment: string;
};

function splitRestrictions(raw: string): string[] {
  return raw
    .split(/\r?\n|•|;/g)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function buildSystemPromptFragment(ctx: Omit<AiContext, "systemPromptFragment">): string {
  const lines: string[] = [
    "Контекст бизнеса (только факты из базы; не выдумывай ничего сверх этого):",
    `Название: ${ctx.name}`,
  ];
  if (ctx.publicName) lines.push(`Публичное название: ${ctx.publicName}`);
  lines.push(`Часовой пояс: ${ctx.timezone}`);
  lines.push(`Тип: ${ctx.businessType}`);
  if (ctx.about) lines.push(`О бизнесе: ${ctx.about}`);
  if (ctx.tone) lines.push(`Тон общения: ${ctx.tone}`);
  if (ctx.importantFacts) lines.push(`Важные факты: ${ctx.importantFacts}`);
  if (ctx.geography) lines.push(`География: ${ctx.geography}`);
  if (ctx.deliveryInfo) lines.push(`Доставка: ${ctx.deliveryInfo}`);
  if (ctx.returnsInfo) lines.push(`Возвраты: ${ctx.returnsInfo}`);
  if (ctx.extraInstructions)
    lines.push(`Доп. инструкции: ${ctx.extraInstructions}`);
  if (ctx.restrictions.length) {
    lines.push("Ограничения (обязательно соблюдать):");
    for (const item of ctx.restrictions) lines.push(`- ${item}`);
  }
  if (ctx.products.length) {
    lines.push("Активные товары (цены и наличие только из этого списка):");
    for (const p of ctx.products) {
      lines.push(`- ${p.name}: ${p.price} (${p.availability})`);
    }
  } else {
    lines.push("Активные товары: в базе нет данных — не называй цены и наличие.");
  }
  if (ctx.services.length) {
    lines.push("Услуги записи (цены и длительность только из этого списка):");
    for (const s of ctx.services) {
      const price = s.price ?? "цена не указана";
      lines.push(`- ${s.name}: ${price}, ${s.duration_minutes} мин`);
    }
  } else {
    lines.push("Услуги записи: в базе нет данных — не называй цены и расписание.");
  }
  lines.push(
    "СТРОГО: НИКОГДА не выдумывай цены, наличие/остатки, расписание, адрес, условия доставки, гарантии или возвраты. Если факта нет в контексте — так и скажи, что данных нет. Черновик только; ничего не публикуй и не меняй данные бизнеса.",
  );
  return lines.join("\n");
}

export async function buildAiContext(
  db: Kysely<Database>,
  businessId: string,
): Promise<AiContext> {
  const business = await db
    .selectFrom("business")
    .select([
      "id",
      "name",
      "public_name",
      "timezone",
      "business_type",
      "ai_about",
      "ai_tone",
      "ai_important_facts",
      "ai_restrictions",
      "ai_delivery_info",
      "ai_geography",
      "ai_returns_info",
      "ai_extra_instructions",
    ])
    .where("id", "=", businessId)
    .executeTakeFirstOrThrow();

  let products: AiProductFact[] = [];
  try {
    products = await db
      .selectFrom("product")
      .select(["name", "price", "availability"])
      .where("business_id", "=", businessId)
      .where("active", "=", true)
      .orderBy("name")
      .execute()
      .then((rows) =>
        rows.map((row) => ({
          name: row.name,
          price: String(row.price),
          availability: row.availability,
        })),
      );
  } catch {
    products = [];
  }

  const services = await db
    .selectFrom("booking_service")
    .select(["name", "price", "duration_minutes"])
    .where("business_id", "=", businessId)
    .where("active", "=", true)
    .orderBy("name")
    .execute()
    .then((rows) =>
      rows.map((row) => ({
        name: row.name,
        price: row.price,
        duration_minutes: row.duration_minutes,
      })),
    );

  const base: Omit<AiContext, "systemPromptFragment"> = {
    businessId: business.id,
    name: business.name,
    publicName: business.public_name,
    timezone: business.timezone,
    businessType: business.business_type,
    about: business.ai_about,
    tone: business.ai_tone,
    importantFacts: business.ai_important_facts,
    restrictions: splitRestrictions(business.ai_restrictions),
    deliveryInfo: business.ai_delivery_info,
    geography: business.ai_geography,
    returnsInfo: business.ai_returns_info,
    extraInstructions: business.ai_extra_instructions,
    products,
    services,
  };

  return {
    ...base,
    systemPromptFragment: buildSystemPromptFragment(base),
  };
}
