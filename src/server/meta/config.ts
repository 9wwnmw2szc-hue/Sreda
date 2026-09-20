/**
 * Official Meta Graph API configuration for WhatsApp Cloud API + Instagram Messaging.
 * Secrets are never committed; values come from environment.
 */
export const META_GRAPH_API_VERSION = "v25.0" as const;

export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

/** WhatsApp Cloud API Embedded Signup (v4) permissions — Advanced Access required for live. */
export const WHATSAPP_PERMISSIONS = [
  "whatsapp_business_management",
  "whatsapp_business_messaging",
] as const;

/**
 * Instagram Messaging via Messenger Platform (Page-linked professional accounts).
 * Official scopes for receiving/sending Instagram DMs.
 */
export const INSTAGRAM_PERMISSIONS = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_show_list",
  "pages_messaging",
] as const;

export type MetaConfig = {
  appId: string;
  appSecret: string;
  webhookVerifyToken: string;
  graphApiVersion: typeof META_GRAPH_API_VERSION;
  /** Facebook Login for Business config id for WhatsApp Embedded Signup v4. */
  whatsappConfigId: string | null;
  /** Facebook Login config id for Instagram Messaging. */
  instagramConfigId: string | null;
  enabled: boolean;
};

export function readMetaConfig(): MetaConfig {
  const appId = process.env.META_APP_ID?.trim() || "";
  const appSecret = process.env.META_APP_SECRET?.trim() || "";
  const webhookVerifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || "";
  const whatsappConfigId =
    process.env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null;
  const instagramConfigId =
    process.env.META_INSTAGRAM_LOGIN_CONFIG_ID?.trim() || null;
  const enabled =
    process.env.META_WEBHOOKS_ENABLED === "true" ||
    process.env.WHATSAPP_WEBHOOKS_ENABLED === "true" ||
    process.env.INSTAGRAM_WEBHOOKS_ENABLED === "true";
  return {
    appId,
    appSecret,
    webhookVerifyToken,
    graphApiVersion: META_GRAPH_API_VERSION,
    whatsappConfigId,
    instagramConfigId,
    enabled,
  };
}

export function metaConfigured(config = readMetaConfig()) {
  return Boolean(
    config.appId &&
      config.appSecret.length >= 16 &&
      config.webhookVerifyToken.length >= 16,
  );
}

/** Public, non-secret status for Connections UI. */
export function metaPublicStatus() {
  const config = readMetaConfig();
  return {
    configured: metaConfigured(config),
    enabled: config.enabled,
    graphApiVersion: config.graphApiVersion,
    whatsappEmbeddedSignupReady: Boolean(
      metaConfigured(config) && config.whatsappConfigId,
    ),
    instagramLoginReady: Boolean(
      metaConfigured(config) && config.instagramConfigId,
    ),
    appId: config.appId || null,
    whatsappConfigId: config.whatsappConfigId,
    instagramConfigId: config.instagramConfigId,
  };
}
