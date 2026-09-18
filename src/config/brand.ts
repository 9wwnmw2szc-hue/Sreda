/** User-facing product brand. Internal codes/package names stay "sreda". */
export const APP_NAME = "Соты";
export const APP_NAME_EN = "Soty";
export const APP_TAGLINE = "Ваш бизнес в гармонии";
export const APP_TAGLINE_LONG =
  "Больше, чем инструменты. Соты — для развития вашего дела.";
export const APP_DESCRIPTION =
  "Соты — простые готовые инструменты для малого бизнеса в Telegram и ВКонтакте.";
export const SUPPORT_TELEGRAM_URL = "https://t.me/sreda_support";

export const BRAND_ASSETS = {
  mark: "/assets/soty/brand/logo-mark.svg",
  favicon: "/assets/soty/brand/favicon.svg",
} as const;

export type ThemePreference = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "soty.theme";
