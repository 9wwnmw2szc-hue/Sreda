export const SOLUTION_ACCENTS = {
  leads: {
    cssVar: "--solution-leads",
    label: "Приём заявок",
  },
  admin_messages: {
    cssVar: "--solution-admin-messages",
    label: "Связь с администратором",
  },
  autopost: {
    cssVar: "--solution-autopost",
    label: "Автопостинг",
  },
  booking: {
    cssVar: "--solution-booking",
    label: "Онлайн-запись",
  },
  orders: {
    cssVar: "--solution-orders",
    label: "Приём заказов",
  },
} as const;

export type SolutionAccentCode = keyof typeof SOLUTION_ACCENTS;
