export const SOLUTION_ACCENTS = {
  leads: {
    cssVar: "--solution-leads",
    label: "Приём заявок",
  },
  admin_messages: {
    cssVar: "--solution-sales",
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
    cssVar: "--solution-sales",
    label: "Приём заказов",
  },
} as const;

export type SolutionAccentCode = keyof typeof SOLUTION_ACCENTS;
