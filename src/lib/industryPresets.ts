/** Deterministic industry presets — starting points, not hard locks. */

export type IndustryId =
  | "beauty"
  | "automotive"
  | "retail"
  | "food"
  | "construction"
  | "education"
  | "sport_health"
  | "professional_services"
  | "rental"
  | "other";

export type BusinessModel = "services" | "commerce" | "hybrid";
export type SetupMode = "guided" | "advanced";

export type CapabilityId =
  | "leads"
  | "orders"
  | "booking"
  | "admin_messages"
  | "autopost"
  | "catalog"
  | "categories"
  | "variants"
  | "stock"
  | "product_photos"
  | "delivery"
  | "pickup"
  | "services_catalog"
  | "service_duration"
  | "service_price"
  | "specialists"
  | "individual_schedules"
  | "auto_schedule"
  | "breaks"
  | "buffer"
  | "days_off"
  | "vacations"
  | "exceptions"
  | "booking_horizon"
  | "min_notice"
  | "reminders"
  | "clients"
  | "client_history"
  | "statuses"
  | "activity_history"
  | "telegram"
  | "vk"
  | "inbox"
  | "auto_reply"
  | "faq"
  | "staff_notifications"
  | "calendar"
  | "blocked_time"
  | "ai_profile"
  | "ai_interview"
  | "ai_greeting"
  | "ai_faq"
  | "ai_replies"
  | "ai_notifications"
  | "ai_posts";

export type Terminology = {
  specialist: string;
  specialists: string;
  service: string;
  booking: string;
};

export type IndustryPreset = {
  id: IndustryId;
  label: string;
  description: string;
  subtypes: { id: string; label: string }[];
  defaultBusinessModel: BusinessModel;
  recommendedSolutions: string[];
  optionalSolutions: string[];
  recommendedCapabilities: CapabilityId[];
  optionalCapabilities: CapabilityId[];
  terminology: Terminology;
  questions: { id: string; question: string }[];
  leadFormPreset?: { id: string; label: string; required?: boolean }[];
  bookingPreset?: string;
};

export const INDUSTRY_CARDS: {
  id: IndustryId;
  label: string;
  hint: string;
}[] = [
  { id: "beauty", label: "Красота и уход", hint: "Салоны, барбершопы, маникюр" },
  { id: "automotive", label: "Авто", hint: "Сервис, мойка, запчасти" },
  { id: "retail", label: "Магазин", hint: "Товары и каталог" },
  { id: "food", label: "Еда и напитки", hint: "Кафе, торты, доставка" },
  { id: "construction", label: "Ремонт и строительство", hint: "Заявки и сметы" },
  { id: "education", label: "Образование", hint: "Уроки и курсы" },
  { id: "sport_health", label: "Спорт и здоровье", hint: "Тренировки и секции" },
  {
    id: "professional_services",
    label: "Профессиональные услуги",
    hint: "Консультации и агентства",
  },
  { id: "rental", label: "Аренда и бронирование", hint: "Студии и помещения" },
  { id: "other", label: "Другое", hint: "Опишите бизнес своими словами" },
];

const COMMON_QUESTIONS: { id: string; question: string }[] = [
  { id: "name", question: "Как называется ваш бизнес?" },
  { id: "about", question: "Чем вы занимаетесь?" },
  { id: "offer", question: "Какие товары или услуги для вас основные?" },
  { id: "clients", question: "Кто обычно ваши клиенты?" },
  {
    id: "tone",
    question:
      "Как вы хотите общаться с клиентами? (дружелюбно / делово / коротко / премиально)",
  },
  { id: "important", question: "Что особенно важно рассказать клиенту?" },
  { id: "faq", question: "Какие вопросы клиенты задают чаще всего?" },
  {
    id: "restrictions",
    question: "Что AI никогда не должен обещать или утверждать?",
  },
];

const PRESETS: Record<IndustryId, IndustryPreset> = {
  beauty: {
    id: "beauty",
    label: "Красота и уход",
    description: "Запись к мастерам, услуги и напоминания.",
    subtypes: [
      { id: "hair", label: "Парикмахерская" },
      { id: "barbershop", label: "Барбершоп" },
      { id: "nails", label: "Маникюр" },
      { id: "brows", label: "Брови/ресницы" },
      { id: "cosmo", label: "Косметология" },
      { id: "massage", label: "Массаж" },
      { id: "tattoo", label: "Тату" },
      { id: "makeup", label: "Визаж" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "services",
    recommendedSolutions: ["booking", "admin_messages", "autopost", "leads"],
    optionalSolutions: ["orders"],
    recommendedCapabilities: [
      "booking",
      "services_catalog",
      "specialists",
      "auto_schedule",
      "calendar",
      "reminders",
      "inbox",
      "admin_messages",
    ],
    optionalCapabilities: ["orders", "catalog", "autopost", "ai_interview"],
    terminology: {
      specialist: "Мастер",
      specialists: "Мастера",
      service: "Услуга",
      booking: "Запись",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "specialist_count", question: "Сколько мастеров работает?" },
      {
        id: "same_schedule",
        question: "Все работают по одинаковому расписанию?",
      },
      {
        id: "typical_duration",
        question: "Сколько обычно длится основная услуга (минут)?",
      },
      {
        id: "need_buffer",
        question: "Нужен перерыв между клиентами? Сколько минут?",
      },
      {
        id: "horizon",
        question: "На сколько дней вперёд разрешить запись?",
      },
    ],
    bookingPreset: "service_master_datetime",
  },
  automotive: {
    id: "automotive",
    label: "Авто",
    description: "Заявки, запись на работы, иногда запчасти.",
    subtypes: [
      { id: "service", label: "Автосервис" },
      { id: "tires", label: "Шиномонтаж" },
      { id: "wash", label: "Автомойка" },
      { id: "detailing", label: "Детейлинг" },
      { id: "electric", label: "Автоэлектрика" },
      { id: "diagnostics", label: "Диагностика" },
      { id: "install", label: "Установка оборудования" },
      { id: "parts", label: "Автозапчасти" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "hybrid",
    recommendedSolutions: ["leads", "booking", "admin_messages", "autopost"],
    optionalSolutions: ["orders"],
    recommendedCapabilities: [
      "leads",
      "booking",
      "services_catalog",
      "auto_schedule",
      "inbox",
      "calendar",
      "admin_messages",
    ],
    optionalCapabilities: ["orders", "catalog", "stock", "autopost"],
    terminology: {
      specialist: "Мастер",
      specialists: "Мастера",
      service: "Работа",
      booking: "Запись",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "works", question: "Какие работы выполняете?" },
      {
        id: "lead_or_book",
        question: "Клиент записывается сразу или сначала оставляет заявку?",
      },
      {
        id: "car_fields",
        question:
          "Какие данные автомобиля нужны? (марка, модель, год — без обязательного VIN/номера)",
      },
      { id: "need_photos", question: "Нужно ли прикладывать фотографии?" },
      { id: "sell_parts", question: "Есть ли продажа запчастей?" },
    ],
    leadFormPreset: [
      { id: "name", label: "Имя", required: true },
      { id: "phone", label: "Телефон", required: true },
      { id: "car", label: "Автомобиль" },
      { id: "problem", label: "Описание проблемы", required: true },
      { id: "photo", label: "Фото" },
    ],
    bookingPreset: "service_master_optional_datetime",
  },
  retail: {
    id: "retail",
    label: "Магазин",
    description: "Каталог, заказы и остатки.",
    subtypes: [
      { id: "clothes", label: "Одежда" },
      { id: "shoes", label: "Обувь" },
      { id: "flowers", label: "Цветы" },
      { id: "cosmetics", label: "Косметика" },
      { id: "gifts", label: "Подарки" },
      { id: "pets", label: "Товары для животных" },
      { id: "grocery", label: "Продукты" },
      { id: "electronics", label: "Электроника" },
      { id: "parts", label: "Автозапчасти" },
      { id: "handmade", label: "Handmade" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "commerce",
    recommendedSolutions: ["orders", "admin_messages", "autopost"],
    optionalSolutions: ["leads", "booking"],
    recommendedCapabilities: [
      "orders",
      "catalog",
      "categories",
      "product_photos",
      "variants",
      "stock",
      "inbox",
      "admin_messages",
    ],
    optionalCapabilities: ["delivery", "pickup", "autopost", "leads"],
    terminology: {
      specialist: "Специалист",
      specialists: "Специалисты",
      service: "Услуга",
      booking: "Запись",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "what_sell", question: "Что продаёте?" },
      { id: "need_categories", question: "Нужны категории товаров?" },
      {
        id: "need_variants",
        question: "Нужны варианты (размер, цвет, объём)?",
      },
      { id: "need_stock", question: "Нужно учитывать остатки?" },
      { id: "fulfillment", question: "Есть доставка и/или самовывоз?" },
    ],
  },
  food: {
    id: "food",
    label: "Еда и напитки",
    description: "Заказы, каталог, иногда индивидуальные заявки.",
    subtypes: [
      { id: "cafe", label: "Кафе" },
      { id: "bakery", label: "Пекарня" },
      { id: "confectionery", label: "Кондитерская" },
      { id: "delivery", label: "Доставка еды" },
      { id: "cakes", label: "Торты на заказ" },
      { id: "catering", label: "Кейтеринг" },
      { id: "home", label: "Домашнее производство" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "commerce",
    recommendedSolutions: ["orders", "admin_messages", "autopost"],
    optionalSolutions: ["leads"],
    recommendedCapabilities: [
      "orders",
      "catalog",
      "categories",
      "product_photos",
      "inbox",
      "pickup",
      "admin_messages",
    ],
    optionalCapabilities: ["delivery", "leads", "autopost"],
    terminology: {
      specialist: "Специалист",
      specialists: "Специалисты",
      service: "Позиция",
      booking: "Бронирование",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "menu", question: "Что в меню или ассортименте?" },
      { id: "custom", question: "Принимаете индивидуальные заказы?" },
      { id: "fulfillment", question: "Самовывоз, доставка или оба варианта?" },
    ],
    leadFormPreset: [
      { id: "name", label: "Имя", required: true },
      { id: "phone", label: "Телефон", required: true },
      { id: "date", label: "Дата" },
      { id: "what", label: "Что необходимо", required: true },
      { id: "amount", label: "Количество/вес" },
      { id: "notes", label: "Пожелания" },
      { id: "photo", label: "Фото-референс" },
    ],
  },
  construction: {
    id: "construction",
    label: "Ремонт и строительство",
    description: "Заявки, CRM и календарь встреч.",
    subtypes: [
      { id: "apartment", label: "Ремонт квартир" },
      { id: "build", label: "Строительство" },
      { id: "electric", label: "Электрика" },
      { id: "plumbing", label: "Сантехника" },
      { id: "cleaning", label: "Клининг" },
      { id: "appliances", label: "Ремонт техники" },
      { id: "furniture", label: "Мебель на заказ" },
      { id: "windows", label: "Окна/двери" },
      { id: "install", label: "Монтаж" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "services",
    recommendedSolutions: ["leads", "admin_messages", "autopost"],
    optionalSolutions: ["booking", "orders"],
    recommendedCapabilities: [
      "leads",
      "inbox",
      "clients",
      "calendar",
      "admin_messages",
    ],
    optionalCapabilities: ["booking", "autopost", "ai_interview"],
    terminology: {
      specialist: "Мастер",
      specialists: "Мастера",
      service: "Работа",
      booking: "Выезд",
    },
    questions: [
      ...COMMON_QUESTIONS,
      {
        id: "lead_fields",
        question: "Какие данные нужны до связи с клиентом?",
      },
      { id: "need_photos", question: "Нужны фото объекта?" },
    ],
    leadFormPreset: [
      { id: "name", label: "Имя", required: true },
      { id: "phone", label: "Телефон", required: true },
      { id: "work_type", label: "Тип работ" },
      { id: "description", label: "Описание", required: true },
      { id: "address", label: "Адрес" },
      { id: "deadline", label: "Желаемые сроки" },
      { id: "budget", label: "Бюджет" },
      { id: "photo", label: "Фото" },
    ],
  },
  education: {
    id: "education",
    label: "Образование",
    description: "Уроки, преподаватели и расписание.",
    subtypes: [
      { id: "tutor", label: "Репетитор" },
      { id: "language", label: "Языковая школа" },
      { id: "driving", label: "Автошкола" },
      { id: "music", label: "Музыкальная школа" },
      { id: "kids", label: "Детский центр" },
      { id: "courses", label: "Курсы" },
      { id: "online", label: "Онлайн-обучение" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "services",
    recommendedSolutions: ["booking", "leads", "admin_messages"],
    optionalSolutions: ["autopost", "orders"],
    recommendedCapabilities: [
      "booking",
      "services_catalog",
      "specialists",
      "auto_schedule",
      "calendar",
      "reminders",
      "inbox",
      "leads",
    ],
    optionalCapabilities: ["autopost", "admin_messages"],
    terminology: {
      specialist: "Преподаватель",
      specialists: "Преподаватели",
      service: "Занятие",
      booking: "Запись",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "subjects", question: "Какие предметы или курсы?" },
      {
        id: "group_or_private",
        question: "Индивидуальные занятия, группы или оба формата?",
      },
    ],
    bookingPreset: "lesson_teacher_datetime",
  },
  sport_health: {
    id: "sport_health",
    label: "Спорт и здоровье",
    description: "Тренировки и запись без медицинской карты.",
    subtypes: [
      { id: "fitness", label: "Фитнес-тренер" },
      { id: "section", label: "Спортивная секция" },
      { id: "yoga", label: "Йога" },
      { id: "training", label: "Тренировки" },
      { id: "massage", label: "Массаж" },
      { id: "wellness", label: "Оздоровительные услуги" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "services",
    recommendedSolutions: ["booking", "admin_messages"],
    optionalSolutions: ["leads", "autopost"],
    recommendedCapabilities: [
      "booking",
      "calendar",
      "services_catalog",
      "specialists",
      "reminders",
      "inbox",
    ],
    optionalCapabilities: ["auto_schedule", "leads", "autopost"],
    terminology: {
      specialist: "Тренер",
      specialists: "Тренеры",
      service: "Тренировка",
      booking: "Запись",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "formats", question: "Индивидуальные занятия или группы?" },
    ],
  },
  professional_services: {
    id: "professional_services",
    label: "Профессиональные услуги",
    description: "Заявки, консультации и календарь.",
    subtypes: [
      { id: "lawyer", label: "Юрист" },
      { id: "accountant", label: "Бухгалтер" },
      { id: "consultant", label: "Консультант" },
      { id: "designer", label: "Дизайнер" },
      { id: "marketer", label: "Маркетолог" },
      { id: "agency", label: "Агентство" },
      { id: "it", label: "IT-услуги" },
      { id: "realtor", label: "Риелтор" },
      { id: "photo", label: "Фотограф" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "services",
    recommendedSolutions: ["leads", "booking", "admin_messages", "autopost"],
    optionalSolutions: ["orders"],
    recommendedCapabilities: [
      "leads",
      "booking",
      "inbox",
      "clients",
      "calendar",
      "admin_messages",
    ],
    optionalCapabilities: ["autopost", "ai_interview"],
    terminology: {
      specialist: "Специалист",
      specialists: "Специалисты",
      service: "Услуга",
      booking: "Встреча",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "intake", question: "Что нужно узнать до первой связи?" },
    ],
    leadFormPreset: [
      { id: "name", label: "Имя", required: true },
      { id: "contact", label: "Контакт", required: true },
      { id: "topic", label: "Тема обращения" },
      { id: "description", label: "Описание" },
      { id: "preferred_time", label: "Удобное время для связи" },
    ],
  },
  rental: {
    id: "rental",
    label: "Аренда и бронирование",
    description: "Бронирование ресурсов и календаря.",
    subtypes: [
      { id: "studio", label: "Фотостудия" },
      { id: "room", label: "Помещение" },
      { id: "equipment", label: "Оборудование" },
      { id: "tools", label: "Инструменты" },
      { id: "sport", label: "Спортивная площадка" },
      { id: "meeting", label: "Переговорная" },
      { id: "other", label: "Другое" },
    ],
    defaultBusinessModel: "services",
    recommendedSolutions: ["booking", "admin_messages"],
    optionalSolutions: ["leads", "autopost"],
    recommendedCapabilities: [
      "booking",
      "calendar",
      "auto_schedule",
      "inbox",
      "reminders",
      "specialists",
    ],
    optionalCapabilities: ["leads", "admin_messages", "autopost"],
    terminology: {
      specialist: "Ресурс",
      specialists: "Ресурсы",
      service: "Тариф",
      booking: "Бронирование",
    },
    questions: [
      ...COMMON_QUESTIONS,
      { id: "resources", question: "Что сдаёте в аренду?" },
      { id: "slot_length", question: "Какая типичная длительность аренды?" },
    ],
    bookingPreset: "resource_datetime_duration",
  },
  other: {
    id: "other",
    label: "Другое",
    description: "Опишите бизнес — подберём инструменты.",
    subtypes: [{ id: "custom", label: "Свой вариант" }],
    defaultBusinessModel: "hybrid",
    recommendedSolutions: ["leads", "admin_messages"],
    optionalSolutions: ["orders", "booking", "autopost"],
    recommendedCapabilities: ["leads", "inbox", "admin_messages"],
    optionalCapabilities: [
      "orders",
      "booking",
      "catalog",
      "auto_schedule",
      "autopost",
    ],
    terminology: {
      specialist: "Специалист",
      specialists: "Специалисты",
      service: "Услуга",
      booking: "Запись",
    },
    questions: [
      {
        id: "freeform",
        question: "Расскажите в двух-трёх предложениях, чем занимается бизнес.",
      },
      ...COMMON_QUESTIONS.filter((q) => q.id !== "about"),
    ],
  },
};

export function industryPreset(id: IndustryId | string | null | undefined) {
  if (!id || !(id in PRESETS)) return null;
  return PRESETS[id as IndustryId];
}

export function allIndustryPresets() {
  return Object.values(PRESETS);
}

export function businessModelFromIndustry(
  industry: IndustryId | null | undefined,
): BusinessModel {
  return industryPreset(industry)?.defaultBusinessModel ?? "hybrid";
}

/** Map industry default model → legacy business_type for soft catalog hints. */
export function businessTypeFromModel(model: BusinessModel | null | undefined) {
  switch (model) {
    case "commerce":
      return "store" as const;
    case "services":
      return "service" as const;
    default:
      return "hybrid" as const;
  }
}

export function terminologyFor(
  industry: IndustryId | string | null | undefined,
): Terminology {
  return (
    industryPreset(industry)?.terminology ?? {
      specialist: "Специалист",
      specialists: "Специалисты",
      service: "Услуга",
      booking: "Запись",
    }
  );
}

export function recommendedSolutionsForIndustry(
  industry: IndustryId | string | null | undefined,
): string[] {
  return industryPreset(industry)?.recommendedSolutions ?? [];
}
