export type ChannelPlatform =
  | "telegram"
  | "vk"
  | "whatsapp"
  | "instagram";

export const INBOX_PLATFORMS: readonly ChannelPlatform[] = [
  "telegram",
  "vk",
  "whatsapp",
  "instagram",
] as const;

export const META_PLATFORMS = ["whatsapp", "instagram"] as const;
export type MetaPlatform = (typeof META_PLATFORMS)[number];

export function isChannelPlatform(value: unknown): value is ChannelPlatform {
  return (
    value === "telegram" ||
    value === "vk" ||
    value === "whatsapp" ||
    value === "instagram"
  );
}

export function isMetaPlatform(value: unknown): value is MetaPlatform {
  return value === "whatsapp" || value === "instagram";
}

export function platformLabel(platform: string) {
  switch (platform) {
    case "telegram":
      return "Telegram";
    case "vk":
      return "VK";
    case "whatsapp":
      return "WhatsApp";
    case "instagram":
      return "Instagram";
    default:
      return platform;
  }
}

export function platformShort(platform: string) {
  switch (platform) {
    case "telegram":
      return "TG";
    case "vk":
      return "VK";
    case "whatsapp":
      return "WA";
    case "instagram":
      return "IG";
    default:
      return platform.slice(0, 2).toUpperCase();
  }
}
