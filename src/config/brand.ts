/** User-facing product brand. */
export const APP_NAME = "БизнеСоты";
export const APP_NAME_EN = "Biznesoty";
/** Technical lowercase slug (package / host / env examples). */
export const APP_SLUG = "biznesoty";
export const APP_TAGLINE = "Ваш бизнес в гармонии";
export const APP_TAGLINE_LONG =
  "Больше, чем инструменты. БизнеСоты — для развития вашего дела.";
export const APP_DESCRIPTION =
  "БизнеСоты — простые готовые инструменты для малого бизнеса в Telegram и ВКонтакте.";
/** Legacy Telegram handle — external identifier, not renamed here. */
export const SUPPORT_TELEGRAM_URL = "https://t.me/sreda_support";
/** Neutral label — do not surface the legacy username in UI. */
export const SUPPORT_LABEL = "Поддержка";

export const BRAND_ASSETS = {
  // Physical paths under public/assets/soty remain (legacy filesystem layout).
  mark: "/assets/soty/brand/logo-mark.svg",
  favicon: "/assets/soty/brand/favicon.svg",
} as const;

export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "biznesoty.theme";
