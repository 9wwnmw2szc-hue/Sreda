/** Human-facing setup / status copy. Internal statuses stay in API. */

export type UserSolutionStatus =
  | "not_connected"
  | "in_progress"
  | "ready"
  | "running"
  | "needs_attention";

export function userSolutionStatusLabel(status: UserSolutionStatus): string {
  switch (status) {
    case "not_connected":
      return "Не подключено";
    case "in_progress":
      return "Настраивается";
    case "ready":
      return "Готово к запуску";
    case "running":
      return "Работает";
    case "needs_attention":
      return "Требует внимания";
  }
}

/** Map API SolutionStatus → owner-facing status. */
export function toUserSolutionStatus(
  api: string | undefined | null,
): UserSolutionStatus {
  switch (api) {
    case "active":
      return "running";
    case "setup_required":
      return "in_progress";
    case "paused":
      return "needs_attention";
    case "available":
    case "unavailable":
    default:
      return api === "unavailable" ? "needs_attention" : "not_connected";
  }
}

export const FIELD_HINTS = {
  bufferAfter:
    "Перерыв между клиентами — время, которое автоматически блокируется после записи (уборка, подготовка, отдых).",
  slotInterval:
    "Как часто предлагать время клиенту. Например, каждые 30 минут: 09:00, 09:30, 10:00… Услуга всё равно должна целиком поместиться в свободное окно.",
  bookingHorizon:
    "На сколько дней вперёд клиенты могут записаться. Если 30 дней — дальше этого окна даты не покажем.",
  minNotice:
    "За сколько времени до начала ещё можно записаться. Например, при «2 часа» слот через час уже не предложим.",
  scheduleModeAuto:
    "Укажите рабочие дни и часы. Соты рассчитают свободное время с учётом длительности услуг, перерывов, записей, выходных и отпусков.",
  scheduleModeManual:
    "Вы сами добавляете свободные окна. Подходит, если расписание каждый день разное.",
  greeting:
    "Первое сообщение, которое клиент увидит в боте вашего бизнеса — не сервиса «Соты».",
  aiRestrictions:
    "Что AI никогда не должен обещать: цены, скидки, наличие, адрес, сроки — если этого нет в ваших данных.",
} as const;

export const WEEKDAY_LABELS = [
  "Воскресенье",
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
] as const;

/** Monday-first order for UI cards. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
