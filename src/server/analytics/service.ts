import type { Kysely } from "kysely";
import type { Database } from "../db/schema.ts";
import { requireBusiness, type Permission } from "../access/permissions.ts";
import { compareMetric, resolvePeriod, type PeriodPreset } from "./periods.ts";
import { emptyChart, preferDonut, type ChartSpec } from "./charts.ts";
import { formatMoney } from "./format.ts";

async function businessTz(
  db: Kysely<Database>,
  publicId: string,
  userId: string,
  permission: Permission = "analytics.view",
) {
  const b = await requireBusiness(db, userId, publicId, permission);
  const row = await db
    .selectFrom("business")
    .select(["id", "public_id", "timezone", "business_type", "name"])
    .where("id", "=", b.id)
    .executeTakeFirstOrThrow();
  return { ...b, ...row, role: b.role };
}

function moneyByCurrency(
  rows: { currency: string; total: string | number }[],
): { currency: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const cur = row.currency || "RUB";
    map.set(cur, (map.get(cur) ?? 0) + Number(row.total || 0));
  }
  return [...map.entries()].map(([currency, amount]) => ({ currency, amount }));
}

function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function fillSeries(
  from: Date,
  until: Date,
  tz: string,
  points: Map<string, number>,
) {
  const categories: string[] = [];
  const values: number[] = [];
  const cursor = new Date(+from);
  while (+cursor < +until) {
    const key = dayKey(cursor, tz);
    categories.push(key.slice(5));
    values.push(points.get(key) ?? 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { categories, values };
}

export class AnalyticsService {
  constructor(private db: Kysely<Database>) {}

  async overview(
    userId: string,
    publicId: string,
    preset: PeriodPreset = "30d",
    custom?: { from: string; until: string },
  ) {
    const b = await businessTz(this.db, publicId, userId);
    const range = resolvePeriod(preset, b.timezone, new Date(), custom);
    const [orders, leads, bookings, clients, posts, communications] =
      await Promise.all([
        this.ordersSlice(b.id, range.from, range.until, range.previous.from, range.previous.until, b.timezone),
        this.leadsSlice(b.id, range.from, range.until, range.previous.from, range.previous.until, b.timezone),
        this.bookingsSlice(b.id, range.from, range.until, range.previous.from, range.previous.until, b.timezone),
        this.clientsSlice(b.id, range.from, range.until, range.previous.from, range.previous.until),
        this.postsSlice(b.id, range.from, range.until, range.previous.from, range.previous.until),
        this.communicationsSlice(b.id, range.from, range.until, range.previous.from, range.previous.until),
      ]);

    const kpis = [];
    for (const rev of orders.revenueByCurrency) {
      kpis.push({
        id: `revenue_${rev.currency}`,
        label: orders.revenueByCurrency.length > 1 ? `Выручка (${rev.currency})` : "Выручка",
        value: rev.amount,
        display: formatMoney(rev.amount, rev.currency),
        delta: compareMetric(
          rev.amount,
          orders.prevRevenueByCurrency.find((x) => x.currency === rev.currency)?.amount ?? 0,
        ),
        kind: "money" as const,
        currency: rev.currency,
      });
    }
    if (orders.count.current > 0 || orders.count.previous > 0)
      kpis.push({
        id: "orders",
        label: "Заказы",
        value: orders.count.current,
        display: String(orders.count.current),
        delta: orders.count,
        kind: "count" as const,
      });
    if (leads.count.current > 0 || leads.count.previous > 0)
      kpis.push({
        id: "leads",
        label: "Заявки",
        value: leads.count.current,
        display: String(leads.count.current),
        delta: leads.count,
        kind: "count" as const,
      });
    if (bookings.count.current > 0 || bookings.count.previous > 0)
      kpis.push({
        id: "bookings",
        label: "Записи",
        value: bookings.count.current,
        display: String(bookings.count.current),
        delta: bookings.count,
        kind: "count" as const,
      });
    if (clients.newClients.current > 0 || clients.newClients.previous > 0)
      kpis.push({
        id: "new_clients",
        label: "Новые клиенты",
        value: clients.newClients.current,
        display: String(clients.newClients.current),
        delta: clients.newClients,
        kind: "count" as const,
      });

    const insights = buildInsights({ orders, leads, bookings, clients, posts });
    const charts: ChartSpec[] = [
      orders.ordersChart,
      orders.revenueChart,
      leads.chart,
      bookings.chart,
    ].filter((c) => c.categories.length > 0 || c.emptyMessage);

    return {
      period: {
        preset,
        label: range.label,
        previousLabel: range.previous.label,
        timezone: b.timezone,
      },
      businessType: b.business_type,
      kpis,
      insights,
      charts,
      sections: {
        orders,
        leads,
        bookings,
        clients,
        posts,
        communications,
      },
    };
  }

  async section(
    userId: string,
    publicId: string,
    section: string,
    preset: PeriodPreset = "30d",
    custom?: { from: string; until: string },
  ) {
    const overview = await this.overview(userId, publicId, preset, custom);
    const key = section as keyof typeof overview.sections;
    return {
      period: overview.period,
      insights: overview.insights,
      data: overview.sections[key] ?? null,
    };
  }

  async dashboardSummary(userId: string, publicId: string) {
    const data = await this.overview(userId, publicId, "30d");
    return {
      period: data.period,
      kpis: data.kpis.slice(0, 4),
      trend: data.charts.find((c) => c.id === "orders_trend" || c.id === "leads_trend" || c.id === "bookings_trend") ?? null,
      href: "/analytics",
    };
  }

  private async ordersSlice(
    businessId: string,
    from: Date,
    until: Date,
    prevFrom: Date,
    prevUntil: Date,
    tz: string,
  ) {
    const rows = await this.db
      .selectFrom("order")
      .select(["id", "status", "total", "currency", "source", "client_id", "created_at"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", from)
      .where("created_at", "<", until)
      .execute();
    const prev = await this.db
      .selectFrom("order")
      .select(["total", "currency", "status"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", prevFrom)
      .where("created_at", "<", prevUntil)
      .execute();

    const active = rows.filter((r) => r.status !== "cancelled");
    const revenueByCurrency = moneyByCurrency(active);
    const prevRevenueByCurrency = moneyByCurrency(
      prev.filter((r) => r.status !== "cancelled"),
    );

    const byDay = new Map<string, number>();
    const revDayByCurrency = new Map<string, Map<string, number>>();
    for (const row of active) {
      const key = dayKey(new Date(row.created_at), tz);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
      const currency = row.currency || "RUB";
      const dayMap = revDayByCurrency.get(currency) ?? new Map<string, number>();
      dayMap.set(key, (dayMap.get(key) ?? 0) + Number(row.total || 0));
      revDayByCurrency.set(currency, dayMap);
    }
    const ordersFilled = fillSeries(from, until, tz, byDay);
    const currencies = [...revDayByCurrency.keys()].sort();
    const revenueSeries = currencies.map((currency) => {
      const filled = fillSeries(
        from,
        until,
        tz,
        revDayByCurrency.get(currency) ?? new Map(),
      );
      return {
        key: `revenue_${currency}`,
        label: `Выручка (${currency})`,
        values: filled.values,
        categories: filled.categories,
      };
    });
    const revenueCategories =
      revenueSeries.find((s) => s.categories.length)?.categories ??
      ordersFilled.categories;

    const statusCounts: Record<string, number> = {};
    for (const row of rows)
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;

    const items = await this.db
      .selectFrom("order_item as oi")
      .innerJoin("order as o", "o.id", "oi.order_id")
      .select(["oi.name", "oi.quantity", "oi.line_total", "o.currency"])
      .where("o.business_id", "=", businessId)
      .where("o.created_at", ">=", from)
      .where("o.created_at", "<", until)
      .where("o.status", "!=", "cancelled")
      .execute();

    const topMap = new Map<
      string,
      { name: string; sold: number; revenue: number; currency: string }
    >();
    for (const item of items) {
      const currency = item.currency || "RUB";
      const key = item.name + "\0" + currency;
      const cur = topMap.get(key) ?? {
        name: item.name,
        sold: 0,
        revenue: 0,
        currency,
      };
      cur.sold += item.quantity;
      cur.revenue += Number(item.line_total || 0);
      topMap.set(key, cur);
    }
    // Sort within each currency by revenue, then interleave by currency for display.
    const topProducts = [...topMap.values()]
      .sort((a, b) =>
        a.currency === b.currency
          ? b.revenue - a.revenue
          : a.currency.localeCompare(b.currency),
      )
      .slice(0, 10);

    const platforms: Record<string, number> = {};
    for (const row of rows)
      platforms[row.source || "other"] =
        (platforms[row.source || "other"] ?? 0) + 1;

    const avgByCurrency = new Map<string, { sum: number; count: number }>();
    for (const row of active) {
      const currency = row.currency || "RUB";
      const cur = avgByCurrency.get(currency) ?? { sum: 0, count: 0 };
      cur.sum += Number(row.total || 0);
      cur.count += 1;
      avgByCurrency.set(currency, cur);
    }
    const averageCheckByCurrency = [...avgByCurrency.entries()]
      .map(([currency, v]) => ({
        currency,
        amount: v.count === 0 ? 0 : v.sum / v.count,
        display: formatMoney(v.count === 0 ? 0 : v.sum / v.count, currency),
      }))
      .sort((a, b) => a.currency.localeCompare(b.currency));

    return {
      count: compareMetric(rows.length, prev.length),
      completed: compareMetric(
        rows.filter((r) => r.status === "completed").length,
        prev.filter((r) => r.status === "completed").length,
      ),
      cancelled: compareMetric(
        rows.filter((r) => r.status === "cancelled").length,
        prev.filter((r) => r.status === "cancelled").length,
      ),
      revenueByCurrency,
      prevRevenueByCurrency,
      averageCheckByCurrency,
      averageCheck:
        averageCheckByCurrency.length === 1
          ? averageCheckByCurrency[0]!.amount
          : null,
      averageCheckDisplay:
        averageCheckByCurrency.length === 1
          ? averageCheckByCurrency[0]!.display
          : averageCheckByCurrency.length === 0
            ? null
            : averageCheckByCurrency.map((x) => x.display).join(" · "),
      statusCounts,
      platforms,
      topProducts,
      ordersChart:
        ordersFilled.categories.length === 0
          ? emptyChart(
              "orders_trend",
              "Динамика заказов",
              "Пока недостаточно данных для графика продаж. Когда появятся первые заказы, здесь будет отображаться динамика.",
            )
          : {
              id: "orders_trend",
              kind: "line" as const,
              title: "Динамика заказов",
              categories: ordersFilled.categories,
              series: [{ key: "orders", label: "Заказы", values: ordersFilled.values }],
              unit: "count" as const,
            },
      revenueChart:
        revenueCategories.length === 0 || !revenueSeries.length
          ? emptyChart(
              "revenue_trend",
              "Динамика выручки",
              "Пока нет выручки за выбранный период.",
            )
          : {
              id: "revenue_trend",
              kind: "bar" as const,
              title:
                revenueSeries.length === 1
                  ? `Динамика выручки (${revenueSeries[0]!.label.replace("Выручка (", "").replace(")", "")})`
                  : "Динамика выручки по валютам",
              categories: revenueCategories,
              series: revenueSeries.map(({ key, label, values }) => ({
                key,
                label,
                values,
              })),
              unit: "money" as const,
              // Multi-currency charts omit a single currency label.
              currency:
                revenueSeries.length === 1
                  ? revenueSeries[0]!.key.replace("revenue_", "")
                  : undefined,
              explanation:
                revenueSeries.length > 1
                  ? "Каждая серия — отдельная валюта. Суммы разных валют не складываются."
                  : undefined,
            },
      statusChart: (() => {
        const entries = Object.entries(statusCounts);
        if (!entries.length)
          return emptyChart("order_status", "Статусы заказов", "Нет заказов за период.");
        return {
          id: "order_status",
          kind: preferDonut(entries.length) ? ("donut" as const) : ("bar" as const),
          title: "Статусы заказов",
          categories: entries.map(([k]) => k),
          series: [
            {
              key: "count",
              label: "Заказы",
              values: entries.map(([, v]) => v),
            },
          ],
          unit: "count" as const,
        };
      })(),
    };
  }

  private async leadsSlice(
    businessId: string,
    from: Date,
    until: Date,
    prevFrom: Date,
    prevUntil: Date,
    tz: string,
  ) {
    const rows = await this.db
      .selectFrom("lead")
      .select(["id", "status", "source", "created_at", "processing_by"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", from)
      .where("created_at", "<", until)
      .execute();
    const prev = await this.db
      .selectFrom("lead")
      .select(["id", "status"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", prevFrom)
      .where("created_at", "<", prevUntil)
      .execute();

    const byDay = new Map<string, number>();
    for (const row of rows) {
      const key = dayKey(new Date(row.created_at), tz);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const filled = fillSeries(from, until, tz, byDay);
    const statusCounts: Record<string, number> = {};
    const sources: Record<string, number> = {};
    for (const row of rows) {
      statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
      sources[row.source || "other"] = (sources[row.source || "other"] ?? 0) + 1;
    }

    return {
      count: compareMetric(rows.length, prev.length),
      byStatus: {
        new: statusCounts.new ?? 0,
        processing: statusCounts.processing ?? 0,
        waiting_customer: statusCounts.waiting_customer ?? 0,
        completed: statusCounts.completed ?? 0,
        rejected: statusCounts.rejected ?? 0,
        closed: statusCounts.closed ?? 0,
      },
      sources,
      chart:
        filled.categories.length === 0
          ? emptyChart(
              "leads_trend",
              "Динамика заявок",
              "Пока недостаточно данных для графика заявок.",
            )
          : {
              id: "leads_trend",
              kind: "line" as const,
              title: "Динамика заявок",
              categories: filled.categories,
              series: [{ key: "leads", label: "Заявки", values: filled.values }],
              unit: "count" as const,
            },
    };
  }

  private async bookingsSlice(
    businessId: string,
    from: Date,
    until: Date,
    prevFrom: Date,
    prevUntil: Date,
    tz: string,
  ) {
    const rows = await this.db
      .selectFrom("booking as b")
      .leftJoin("booking_service as s", "s.id", "b.service_id")
      .leftJoin("booking_specialist as sp", "sp.id", "b.specialist_id")
      .select([
        "b.id",
        "b.status",
        "b.starts_at",
        "b.ends_at",
        "b.created_at",
        "b.client_id",
        "s.name as service_name",
        "sp.name as specialist_name",
      ])
      .where("b.business_id", "=", businessId)
      .where("b.starts_at", ">=", from)
      .where("b.starts_at", "<", until)
      .execute();
    const prev = await this.db
      .selectFrom("booking")
      .select(["id", "status"])
      .where("business_id", "=", businessId)
      .where("starts_at", ">=", prevFrom)
      .where("starts_at", "<", prevUntil)
      .execute();

    const byDay = new Map<string, number>();
    const weekday = new Array(7).fill(0) as number[];
    const hour = new Array(24).fill(0) as number[];
    const services = new Map<string, number>();
    const specialists = new Map<string, number>();
    let durationSum = 0;
    let durationN = 0;

    for (const row of rows) {
      const start = new Date(row.starts_at);
      const key = dayKey(start, tz);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
      const local = new Date(start.toLocaleString("en-US", { timeZone: tz }));
      const dayIdx = local.getDay();
      const hourIdx = local.getHours();
      weekday[dayIdx] = (weekday[dayIdx] ?? 0) + 1;
      hour[hourIdx] = (hour[hourIdx] ?? 0) + 1;
      if (row.service_name)
        services.set(row.service_name, (services.get(row.service_name) ?? 0) + 1);
      if (row.specialist_name)
        specialists.set(
          row.specialist_name,
          (specialists.get(row.specialist_name) ?? 0) + 1,
        );
      if (row.ends_at) {
        durationSum += (+new Date(row.ends_at) - +start) / 60000;
        durationN++;
      }
    }
    const filled = fillSeries(from, until, tz, byDay);
    const weekdayLabels = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

    return {
      count: compareMetric(rows.length, prev.length),
      completed: compareMetric(
        rows.filter((r) => r.status === "completed").length,
        prev.filter((r) => r.status === "completed").length,
      ),
      cancelled: compareMetric(
        rows.filter((r) => r.status === "cancelled").length,
        prev.filter((r) => r.status === "cancelled").length,
      ),
      upcoming: rows.filter(
        (r) =>
          (r.status === "pending" || r.status === "confirmed") &&
          +new Date(r.starts_at) >= Date.now(),
      ).length,
      topServices: [...services.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topSpecialists: [...specialists.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      popularWeekdays: weekday.map((count, i) => ({
        day: weekdayLabels[i]!,
        count,
      })),
      popularHours: hour
        .map((count, i) => ({ hour: i, count }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      averageDurationMinutes:
        durationN === 0 ? null : Math.round(durationSum / durationN),
      chart:
        filled.categories.length === 0
          ? emptyChart(
              "bookings_trend",
              "Динамика записей",
              "Пока недостаточно данных для графика записей.",
            )
          : {
              id: "bookings_trend",
              kind: "line" as const,
              title: "Динамика записей",
              categories: filled.categories,
              series: [
                { key: "bookings", label: "Записи", values: filled.values },
              ],
              unit: "count" as const,
            },
      weekdayChart: {
        id: "booking_weekdays",
        kind: "bar" as const,
        title: "Популярные дни недели",
        categories: weekdayLabels,
        series: [{ key: "count", label: "Записи", values: weekday }],
        unit: "count" as const,
      },
    };
  }

  private async clientsSlice(
    businessId: string,
    from: Date,
    until: Date,
    prevFrom: Date,
    prevUntil: Date,
  ) {
    const total = await this.db
      .selectFrom("client")
      .select((eb) => eb.fn.countAll<string>().as("c"))
      .where("business_id", "=", businessId)
      .executeTakeFirst();
    const created = await this.db
      .selectFrom("client")
      .select((eb) => eb.fn.countAll<string>().as("c"))
      .where("business_id", "=", businessId)
      .where("created_at", ">=", from)
      .where("created_at", "<", until)
      .executeTakeFirst();
    const prevCreated = await this.db
      .selectFrom("client")
      .select((eb) => eb.fn.countAll<string>().as("c"))
      .where("business_id", "=", businessId)
      .where("created_at", ">=", prevFrom)
      .where("created_at", "<", prevUntil)
      .executeTakeFirst();

    const identities = await this.db
      .selectFrom("client_identity")
      .innerJoin("client", "client.id", "client_identity.client_id")
      .select(["client_identity.kind"])
      .where("client.business_id", "=", businessId)
      .execute();
    const byProvider: Record<string, number> = {};
    for (const row of identities)
      byProvider[row.kind] = (byProvider[row.kind] ?? 0) + 1;

    return {
      total: Number(total?.c ?? 0),
      newClients: compareMetric(
        Number(created?.c ?? 0),
        Number(prevCreated?.c ?? 0),
      ),
      identities: byProvider,
    };
  }

  private async postsSlice(
    businessId: string,
    from: Date,
    until: Date,
    prevFrom: Date,
    prevUntil: Date,
  ) {
    const rows = await this.db
      .selectFrom("post")
      .select(["id", "status", "created_at"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", from)
      .where("created_at", "<", until)
      .execute();
    const prev = await this.db
      .selectFrom("post")
      .select(["id", "status"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", prevFrom)
      .where("created_at", "<", prevUntil)
      .execute();
    const byStatus: Record<string, number> = {};
    for (const row of rows)
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    return {
      count: compareMetric(rows.length, prev.length),
      byStatus: {
        draft: byStatus.draft ?? 0,
        scheduled: byStatus.scheduled ?? 0,
        published: byStatus.published ?? 0,
        failed: byStatus.failed ?? 0,
        partial: byStatus.partial ?? 0,
      },
    };
  }

  private async communicationsSlice(
    businessId: string,
    from: Date,
    until: Date,
    prevFrom: Date,
    prevUntil: Date,
  ) {
    const conversations = await this.db
      .selectFrom("communication_conversation")
      .select(["id", "platform", "status", "created_at"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", from)
      .where("created_at", "<", until)
      .execute();
    const prev = await this.db
      .selectFrom("communication_conversation")
      .select(["id"])
      .where("business_id", "=", businessId)
      .where("created_at", ">=", prevFrom)
      .where("created_at", "<", prevUntil)
      .execute();
    const messages = await this.db
      .selectFrom("communication_message as m")
      .innerJoin(
        "communication_conversation as c",
        "c.id",
        "m.conversation_id",
      )
      .select((eb) => eb.fn.countAll<string>().as("c"))
      .where("c.business_id", "=", businessId)
      .where("m.created_at", ">=", from)
      .where("m.created_at", "<", until)
      .executeTakeFirst();
    const platforms: Record<string, number> = {};
    for (const row of conversations)
      platforms[row.platform || "other"] =
        (platforms[row.platform || "other"] ?? 0) + 1;
    return {
      conversations: compareMetric(conversations.length, prev.length),
      messages: Number(messages?.c ?? 0),
      platforms,
      open: conversations.filter((c) => c.status === "open").length,
    };
  }
}

function buildInsights(input: {
  orders: { count: { current: number; percent: number | null }; topProducts: { name: string; revenue: number }[] };
  leads: { count: { current: number; percent: number | null } };
  bookings: {
    count: { current: number; percent: number | null };
    topServices: { name: string; count: number }[];
    popularWeekdays: { day: string; count: number }[];
  };
  clients: { newClients: { current: number; percent: number | null } };
  posts: { count: { current: number; percent: number | null } };
}): { fact: string; kind: "fact" }[] {
  const out: { fact: string; kind: "fact" }[] = [];
  const pushDelta = (label: string, percent: number | null, current: number) => {
    if (current === 0 && percent === 0) return;
    if (percent === null) return;
    if (percent === 0) return;
    const verb = percent > 0 ? "выросло" : "снизилось";
    out.push({
      kind: "fact",
      fact: `${label} ${verb} на ${Math.abs(percent)}% по сравнению с предыдущим периодом.`,
    });
  };
  pushDelta("Количество заказов", input.orders.count.percent, input.orders.count.current);
  pushDelta("Количество заявок", input.leads.count.percent, input.leads.count.current);
  pushDelta("Количество записей", input.bookings.count.percent, input.bookings.count.current);
  const topDay = [...input.bookings.popularWeekdays].sort(
    (a, b) => b.count - a.count,
  )[0];
  if (topDay && topDay.count > 0)
    out.push({
      kind: "fact",
      fact: `Наибольшая загрузка по записям приходится на ${topDay.day.toLowerCase()}.`,
    });
  const topService = input.bookings.topServices[0];
  const bookingTotal = input.bookings.count.current;
  if (topService && bookingTotal > 0) {
    const share = Math.round((topService.count / bookingTotal) * 100);
    if (share >= 20)
      out.push({
        kind: "fact",
        fact: `Услуга «${topService.name}» составляет ${share}% записей.`,
      });
  }
  return out.slice(0, 6);
}
