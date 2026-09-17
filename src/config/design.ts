export const SOLUTION_ACCENTS = {
  leads: {
    cssVar: "--solution-leads",
    label: "Приём заявок",
  },
  admin_messages: {
    cssVar: "--solution-sales",
    label: "Связь с администрацией",
  },
  autopost: {
    cssVar: "--solution-autopost",
    label: "Автопостинг",
  },
  booking: {
    cssVar: "--solution-booking",
    label: "Онлайн-запись",
  },
} as const;

export type SolutionAccentCode = keyof typeof SOLUTION_ACCENTS;
