export type SolutionCode =
  | "leads"
  | "orders"
  | "sales"
  | "autopost"
  | "booking"
  | "admin_messages"
  | "moderation";

export type SolutionDefinition = {
  code: "leads" | "orders" | "autopost" | "booking" | "admin_messages" | "moderation";
  id: string;
  title: string;
  description: string;
  priceRub: number;
  menu: string[];
};

/** Единственный каталог возможностей универсального бота. */
export const SOLUTIONS: readonly SolutionDefinition[] = [
  { code: "leads", id: "sol_leads", title: "Заявки", description: "Сбор и обработка обращений клиентов.", priceRub: 250, menu: ["Новая заявка", "Все заявки", "Статусы"] },
  { code: "orders", id: "sol_orders", title: "Заказы", description: "Каталог, корзина и обработка заказов.", priceRub: 250, menu: ["Товары", "Заказы", "Клиенты"] },
  { code: "autopost", id: "sol_autopost", title: "Автопостинг", description: "Подготовка и публикация контента по расписанию.", priceRub: 250, menu: ["Создать публикацию", "Запланированные посты", "Черновики", "История"] },
  { code: "booking", id: "sol_booking", title: "Запись клиентов", description: "Онлайн-запись и расписание для клиентов.", priceRub: 250, menu: ["Новая запись", "Расписание", "Клиенты"] },
  { code: "admin_messages", id: "sol_admin_messages", title: "Сообщения администраторам", description: "Приём обращений и передача их ответственным сотрудникам.", priceRub: 250, menu: ["Новое сообщение", "Диалоги", "Ответственные"] },
  { code: "moderation", id: "sol_moderation", title: "Модерация", description: "Фильтрация спама и подозрительных сообщений.", priceRub: 250, menu: ["Правила", "На проверке", "Журнал фильтрации"] },
];

/** Normalize legacy `sales` activations to `orders`. */
export function normalizeSolutionCode(code: string) {
  return code === "sales" ? "orders" : code;
}

export function solutionByCode(code: string) {
  const normalized = normalizeSolutionCode(code);
  return SOLUTIONS.find((solution) => solution.code === normalized);
}

export function solutionMenu(activeCodes: readonly string[]) {
  const normalized = new Set(activeCodes.map(normalizeSolutionCode));
  return SOLUTIONS.filter((solution) => normalized.has(solution.code)).flatMap(
    (solution) => solution.menu,
  );
}
