/** The approved visual code matches the solution code 1:1 (no shared sales alias). */
export function solutionVisualCode(code: string) {
  if (code === "admin_messages") return "messages";
  return code;
}

export const SOLUTION_DESTINATIONS = {
  leads: "/solutions/leads/setup",
  admin_messages: "/messages",
  booking: "/bookings",
  autopost: "/posts",
  orders: "/orders",
} as const;

export type PresentedSolutionCode = keyof typeof SOLUTION_DESTINATIONS;

export function solutionRoute(code: string) {
  return SOLUTION_DESTINATIONS[code as PresentedSolutionCode] ?? "/solutions";
}

export function solutionModuleAsset(code: string) {
  return `/assets/soty/v1/module-${solutionVisualCode(code)}.webp`;
}

export const DASHBOARD_SOLUTION_COPY: Record<
  string,
  { title: string; subtitle: string }
> = {
  orders: {
    title: "Приём заказов",
    subtitle: "Онлайн-заказы из Telegram, VK и сайта",
  },
  leads: {
    title: "Приём заявок",
    subtitle: "Не теряйте ни одного потенциального клиента",
  },
  booking: {
    title: "Онлайн-запись",
    subtitle: "Удобная запись на ваши услуги",
  },
  admin_messages: {
    title: "Связь с клиентами",
    subtitle: "Все сообщения в одном окне",
  },
  autopost: {
    title: "Автопостинг",
    subtitle: "Планируйте и публикуйте в Telegram и VK",
  },
};
