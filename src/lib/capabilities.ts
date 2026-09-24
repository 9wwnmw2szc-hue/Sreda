import type { CapabilityId } from "./industryPresets.ts";

export type CapabilityDef = {
  id: CapabilityId;
  label: string;
  description: string;
  section:
    | "clients"
    | "products"
    | "services"
    | "booking"
    | "crm"
    | "comms"
    | "content"
    | "ai"
    | "calendar";
  /** Soft links to product solutions. */
  solutions?: string[];
  requires?: CapabilityId[];
};

export const CAPABILITY_DEFS: CapabilityDef[] = [
  {
    id: "leads",
    label: "Приём заявок",
    description: "Клиент оставляет заявку через бота — вы видите её в списке.",
    section: "clients",
    solutions: ["leads"],
  },
  {
    id: "orders",
    label: "Приём заказов",
    description: "Каталог и оформление заказа через вашего бота.",
    section: "clients",
    solutions: ["orders"],
    requires: ["catalog"],
  },
  {
    id: "booking",
    label: "Онлайн-запись",
    description: "Клиент выбирает услугу, специалиста и свободное время.",
    section: "clients",
    solutions: ["booking"],
    requires: ["services_catalog"],
  },
  {
    id: "admin_messages",
    label: "Связь с администратором",
    description: "Клиент пишет вам напрямую — сообщения в одном Inbox.",
    section: "clients",
    solutions: ["admin_messages"],
  },
  {
    id: "catalog",
    label: "Каталог",
    description: "Список товаров для заказов в боте.",
    section: "products",
    solutions: ["orders"],
  },
  {
    id: "categories",
    label: "Категории",
    description: "Группировка товаров, чтобы клиенту было проще искать.",
    section: "products",
    requires: ["catalog"],
  },
  {
    id: "variants",
    label: "Варианты товаров",
    description: "Размер, цвет, объём и другие варианты одной позиции.",
    section: "products",
    requires: ["catalog"],
  },
  {
    id: "stock",
    label: "Учёт остатков",
    description:
      "БизнеСоты уменьшают количество после подтверждённого заказа и не дадут заказать недоступное.",
    section: "products",
    requires: ["catalog"],
  },
  {
    id: "product_photos",
    label: "Фото товаров",
    description: "Картинки в каталоге помогают клиенту выбрать.",
    section: "products",
    requires: ["catalog"],
  },
  {
    id: "delivery",
    label: "Доставка",
    description: "Клиент может выбрать доставку при оформлении заказа.",
    section: "products",
    requires: ["orders"],
  },
  {
    id: "pickup",
    label: "Самовывоз",
    description: "Клиент забирает заказ сам в удобное время.",
    section: "products",
    requires: ["orders"],
  },
  {
    id: "services_catalog",
    label: "Каталог услуг",
    description: "Список услуг с названиями для записи и заявок.",
    section: "services",
    solutions: ["booking"],
  },
  {
    id: "service_duration",
    label: "Длительность услуги",
    description: "Нужна, чтобы система рассчитала свободные слоты.",
    section: "services",
    requires: ["services_catalog"],
  },
  {
    id: "service_price",
    label: "Цена услуги",
    description: "Показывается клиенту, если вы её указали.",
    section: "services",
    requires: ["services_catalog"],
  },
  {
    id: "specialists",
    label: "Специалисты",
    description: "Мастера, преподаватели или ресурсы, к которым идёт запись.",
    section: "services",
    solutions: ["booking"],
  },
  {
    id: "individual_schedules",
    label: "Индивидуальные расписания",
    description: "У каждого специалиста своё рабочее время.",
    section: "services",
    requires: ["specialists", "auto_schedule"],
  },
  {
    id: "auto_schedule",
    label: "Автоматическое расписание",
    description:
      "Задайте рабочие дни и часы — свободное время для записи рассчитается само.",
    section: "booking",
    solutions: ["booking"],
    requires: ["booking", "services_catalog"],
  },
  {
    id: "breaks",
    label: "Перерывы",
    description: "Регулярные паузы (например, обед), когда запись недоступна.",
    section: "booking",
    requires: ["auto_schedule"],
  },
  {
    id: "buffer",
    label: "Перерыв между клиентами",
    description:
      "Время после записи на уборку, подготовку или отдых — слоты сдвигаются.",
    section: "booking",
    requires: ["booking"],
  },
  {
    id: "days_off",
    label: "Выходные",
    description: "Отдельные дни без записи поверх недельного графика.",
    section: "booking",
    requires: ["auto_schedule"],
  },
  {
    id: "vacations",
    label: "Отпуска",
    description: "Период, когда специалиста нельзя предложить клиенту.",
    section: "booking",
    requires: ["specialists"],
  },
  {
    id: "exceptions",
    label: "Исключения",
    description: "Особый график на конкретную дату (короткий день и т.п.).",
    section: "booking",
    requires: ["auto_schedule"],
  },
  {
    id: "booking_horizon",
    label: "Горизонт записи",
    description: "На сколько дней вперёд клиент может выбрать дату.",
    section: "booking",
    requires: ["booking"],
  },
  {
    id: "min_notice",
    label: "Минимальное время до записи",
    description: "За сколько часов/минут до начала ещё можно записаться.",
    section: "booking",
    requires: ["booking"],
  },
  {
    id: "reminders",
    label: "Напоминания",
    description: "Сообщения клиенту перед визитом.",
    section: "booking",
    requires: ["booking"],
  },
  {
    id: "clients",
    label: "Клиенты",
    description: "Единая база людей, которые писали или записывались.",
    section: "crm",
  },
  {
    id: "client_history",
    label: "История клиента",
    description: "Заявки, заказы и записи по одному человеку.",
    section: "crm",
    requires: ["clients"],
  },
  {
    id: "statuses",
    label: "Статусы",
    description: "Этапы обработки заявок и заказов.",
    section: "crm",
  },
  {
    id: "activity_history",
    label: "История действий",
    description: "Кто что менял в рабочих сущностях.",
    section: "crm",
  },
  {
    id: "telegram",
    label: "Telegram",
    description: "Подключение бота Telegram к бизнесу.",
    section: "comms",
  },
  {
    id: "vk",
    label: "VK",
    description: "Подключение сообщества ВКонтакте.",
    section: "comms",
  },
  {
    id: "inbox",
    label: "Unified Inbox",
    description: "Все переписки Telegram/VK в одном месте.",
    section: "comms",
    solutions: ["admin_messages"],
  },
  {
    id: "auto_reply",
    label: "Автоответ",
    description: "Короткий ответ, пока вы не успели ответить вручную.",
    section: "comms",
    requires: ["inbox"],
  },
  {
    id: "faq",
    label: "FAQ",
    description: "Частые ответы, которые помогает готовить AI.",
    section: "comms",
  },
  {
    id: "staff_notifications",
    label: "Уведомления сотрудников",
    description: "Оповещения команде о новых заявках и записях.",
    section: "comms",
  },
  {
    id: "autopost",
    label: "Автопостинг",
    description: "Черновики и публикации в Telegram/VK по расписанию.",
    section: "content",
    solutions: ["autopost"],
  },
  {
    id: "ai_profile",
    label: "AI Business Profile",
    description: "Профиль бизнеса, на котором строятся тексты AI.",
    section: "ai",
  },
  {
    id: "ai_interview",
    label: "AI-интервью",
    description: "Короткие вопросы владельцу, чтобы заполнить профиль.",
    section: "ai",
    requires: ["ai_profile"],
  },
  {
    id: "ai_greeting",
    label: "AI приветствие",
    description: "Черновик приветствия бота — только после вашего подтверждения.",
    section: "ai",
    requires: ["ai_profile"],
  },
  {
    id: "ai_faq",
    label: "AI FAQ",
    description: "Черновики ответов на частые вопросы.",
    section: "ai",
    requires: ["ai_profile"],
  },
  {
    id: "ai_replies",
    label: "AI ответы",
    description: "Подсказки ответов сотрудникам в переписке.",
    section: "ai",
    requires: ["ai_profile"],
  },
  {
    id: "ai_notifications",
    label: "AI тексты уведомлений",
    description: "Черновики подтверждений и напоминаний.",
    section: "ai",
    requires: ["ai_profile"],
  },
  {
    id: "ai_posts",
    label: "AI публикации",
    description: "Помощь с текстом постов — без автопубликации без вас.",
    section: "ai",
    requires: ["ai_profile", "autopost"],
  },
  {
    id: "calendar",
    label: "Общий календарь",
    description: "Записи, задачи и занятое время в одном календаре.",
    section: "calendar",
  },
  {
    id: "blocked_time",
    label: "Blocked time",
    description: "Блокировка времени — клиент не увидит конфликтующие слоты.",
    section: "calendar",
    requires: ["calendar"],
  },
];

export const CAPABILITY_SECTIONS: {
  id: CapabilityDef["section"];
  label: string;
}[] = [
  { id: "clients", label: "Работа с клиентами" },
  { id: "products", label: "Товары" },
  { id: "services", label: "Услуги" },
  { id: "booking", label: "Запись" },
  { id: "crm", label: "CRM" },
  { id: "comms", label: "Коммуникации" },
  { id: "content", label: "Контент" },
  { id: "ai", label: "AI" },
  { id: "calendar", label: "Календарь" },
];

export function capabilityById(id: CapabilityId) {
  return CAPABILITY_DEFS.find((c) => c.id === id);
}

/** Resolve missing dependencies; returns caps to enable + human reasons. */
export function resolveCapabilityDependencies(
  enabled: CapabilityId[],
  turningOn: CapabilityId,
): { next: CapabilityId[]; reasons: string[] } {
  const set = new Set(enabled);
  const reasons: string[] = [];
  const queue = [turningOn];
  const seen = new Set<CapabilityId>();
  while (queue.length) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    set.add(id);
    const def = capabilityById(id);
    for (const req of def?.requires ?? []) {
      if (!set.has(req)) {
        const parent = capabilityById(req);
        reasons.push(
          `«${def?.label ?? id}» нуждается в «${parent?.label ?? req}».`,
        );
      }
      queue.push(req);
    }
  }
  return { next: Array.from(set), reasons };
}

export function searchCapabilities(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return CAPABILITY_DEFS;
  return CAPABILITY_DEFS.filter((c) => {
    const section =
      CAPABILITY_SECTIONS.find((s) => s.id === c.section)?.label ?? "";
    const hay = `${c.label} ${c.description} ${section} ${c.id}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Extra search aliases for advanced settings (human phrases → caps). */
export const SEARCH_ALIASES: { terms: string[]; capability: CapabilityId }[] = [
  { terms: ["обед", "перерыв"], capability: "breaks" },
  { terms: ["отпуск"], capability: "vacations" },
  { terms: ["товар", "каталог"], capability: "catalog" },
  { terms: ["остат"], capability: "stock" },
  { terms: ["телеграм", "telegram"], capability: "telegram" },
  { terms: ["вк", "вконтакте"], capability: "vk" },
  { terms: ["расписан", "авторасписан"], capability: "auto_schedule" },
  { terms: ["доставк"], capability: "delivery" },
];

export function searchSettingsIndex(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return CAPABILITY_DEFS;
  const fromAlias = SEARCH_ALIASES.filter((a) =>
    a.terms.some((t) => q.includes(t) || t.includes(q)),
  ).map((a) => a.capability);
  const direct = searchCapabilities(q).map((c) => c.id);
  const ids = new Set([...fromAlias, ...direct]);
  return CAPABILITY_DEFS.filter((c) => ids.has(c.id));
}
