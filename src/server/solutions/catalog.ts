import {
  PRODUCT_SOLUTIONS,
  type ProductSolutionCode,
} from "../../lib/productSolutions.ts";

export type SolutionCode =
  | "leads"
  | "orders"
  | "sales"
  | "autopost"
  | "booking"
  | "admin_messages"
  | "moderation";

export type SolutionDefinition = {
  code: Exclude<SolutionCode, "sales">;
  id: string;
  title: string;
  description: string;
  priceRub: number;
  menu: string[];
  messageLimit?: number;
};

const PRODUCT_MENUS: Record<ProductSolutionCode, string[]> = {
  leads: ["Новая заявка", "Все заявки", "Статусы"],
  orders: ["Товары", "Заказы", "Клиенты"],
  autopost: [
    "Создать публикацию",
    "Запланированные посты",
    "Черновики",
    "История",
  ],
  booking: ["Новая запись", "Расписание", "Клиенты"],
  admin_messages: ["Новое сообщение", "Диалоги", "Ответственные"],
};

/** Единственный каталог возможностей универсального бота. */
export const SOLUTIONS: readonly SolutionDefinition[] = [
  ...PRODUCT_SOLUTIONS.map((item) => ({
    code: item.code,
    id: item.id,
    title: item.name,
    description: item.description,
    priceRub: item.price,
    menu: PRODUCT_MENUS[item.code],
    ...(item.messageLimit ? { messageLimit: item.messageLimit } : {}),
  })),
  {
    code: "moderation",
    id: "sol_moderation",
    title: "Модерация",
    description: "Фильтрация спама и подозрительных сообщений.",
    priceRub: 250,
    menu: ["Правила", "На проверке", "Журнал фильтрации"],
  },
];

/** Solutions exposed in owner UI / activation allowlist. */
export const ACTIVATABLE_SOLUTIONS: readonly ProductSolutionCode[] = [
  "leads",
  "orders",
  "booking",
  "admin_messages",
  "autopost",
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
