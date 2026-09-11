/**
 * Пути к production-ассетам «Среды».
 * Источник истины: public/assets/sreda/decor/APPROVED-DESIGN-REFERENCE.jpeg
 */

export const SREDA_ASSETS = {
  platform: {
    /** Full sheet export — includes right-side chrome; prefer `tray` for UI. */
    base: "/assets/sreda/platform/platform-base.webp",
    basePng: "/assets/sreda/platform/platform-base.png",
    /** Clean tray crop (annotations / status-card chrome removed). */
    tray: "/assets/sreda/platform/platform-tray.webp",
    trayPng: "/assets/sreda/platform/platform-tray.png",
  },
  solutions: {
    leads: "/assets/sreda/solutions/solution-leads.webp",
    leadsPng: "/assets/sreda/solutions/solution-leads.png",
    leadsHires: "/assets/sreda/solutions/solution-leads-hires.webp",
    sales: "/assets/sreda/solutions/solution-sales.webp",
    salesPng: "/assets/sreda/solutions/solution-sales.png",
    autopost: "/assets/sreda/solutions/solution-autopost.webp",
    autopostPng: "/assets/sreda/solutions/solution-autopost.png",
    booking: "/assets/sreda/solutions/solution-booking.webp",
    bookingPng: "/assets/sreda/solutions/solution-booking.png",
  },
  decor: {
    coffee: "/assets/sreda/decor/decor-coffee.png",
    plantSmall: "/assets/sreda/decor/decor-plant-small.png",
    plantLarge: "/assets/sreda/decor/decor-plant-large.png",
    leaves: "/assets/sreda/decor/decoration-leaves.png",
    logoLeaf: "/assets/sreda/decor/logo-leaf.png",
    reference: "/assets/sreda/decor/APPROVED-DESIGN-REFERENCE.jpeg",
  },
  status: {
    online: "/assets/sreda/status/status-online.png",
    offline: "/assets/sreda/status/status-offline.png",
  },
  ui: {
    promoCard: "/assets/sreda/ui/promo-card.png",
    searchBar: "/assets/sreda/ui/search-bar.png",
    bottomActions: "/assets/sreda/ui/bottom-actions.png",
    buttonAdd: "/assets/sreda/ui/button-add.png",
    buttonAddGreen: "/assets/sreda/ui/button-add-green.png",
  },
  icons: {
    home: "/assets/sreda/icons/icon-home.png",
    requests: "/assets/sreda/icons/icon-requests.png",
    posts: "/assets/sreda/icons/icon-posts.png",
    clients: "/assets/sreda/icons/icon-clients.png",
    connections: "/assets/sreda/icons/icon-connections.png",
    billing: "/assets/sreda/icons/icon-billing.png",
    settings: "/assets/sreda/icons/icon-settings.png",
    bell: "/assets/sreda/icons/icon-bell.png",
    telegram: "/assets/sreda/icons/icon-telegram.png",
    vk: "/assets/sreda/icons/icon-vk.png",
  },
} as const;

export type SolutionAssetCode = keyof typeof SREDA_ASSETS.solutions &
  ("leads" | "sales" | "autopost" | "booking");
