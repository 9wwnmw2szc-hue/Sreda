/**
 * Dashboard scene — single coordinate system for the platform frame.
 *
 * Frame = cropped tray asset (platform-tray), native 700×310.
 * Module docking: slot (x,y) is where the pedestal contact point sits;
 * each module image is placed via its own anchor (fraction of image box).
 * Scale with one factor: module width = widthFrac × platform rendered width.
 *
 * Labels use absolute frame fractions (not PNG top-left) so back/front
 * rows never share the same landing zone under the tray.
 */

export const SCENE_FRAME = {
  /** Native tray crop size (platform-tray.png). */
  width: 700,
  height: 310,
} as const;

/** Layout chrome — starting constraints from the brief, tuned for readability. */
export const LAYOUT_TOKENS = {
  desktopWide: {
    /** ≥1360 */
    sidebarWidth: 216,
    contentPad: 24,
    columnGap: 24,
    rightColumnWidth: 280,
  },
  desktop: {
    /** 1100–1359 */
    sidebarWidth: 200,
    contentPad: 20,
    columnGap: 20,
    rightColumnWidth: 248,
  },
  tablet: {
    /** 768–1099 */
    topBarHeight: 64,
    contentPad: 20,
  },
  mobile: {
    /** <768 */
    contentPad: 16,
    cardPad: 16,
    cardGap: 12,
    assetSize: 72,
    cardMinHeight: 112,
  },
} as const;

export type SceneModuleCode = "leads" | "sales" | "autopost" | "booking";

export interface SceneModuleDock {
  /** Slot contact point X as fraction of platform frame (0–1). */
  slotX: number;
  /** Slot contact point Y as fraction of platform frame (0–1). */
  slotY: number;
  /** Module render width as fraction of platform frame width. */
  widthFrac: number;
  /** Pedestal contact within the PNG (0–1 of image box). */
  anchorX: number;
  anchorY: number;
  zIndex: number;
  /** Show connect control (available solutions). */
  plusVisible: boolean;
  /**
   * Label block center X/Y as fractions of platform frame.
   * Y may exceed 1.0 to sit in the frame padding under the tray.
   */
  labelX: number;
  labelY: number;
}

/**
 * Docking table — tuned on tray crop against APPROVED-DESIGN-REFERENCE.
 * Front row slightly larger / higher z to read as closer.
 * Back labels sit beside the tray; front labels sit under the tray.
 */
export const MODULE_DOCKS: Record<SceneModuleCode, SceneModuleDock> = {
  leads: {
    slotX: 0.3,
    slotY: 0.38,
    widthFrac: 0.185,
    anchorX: 0.39,
    anchorY: 0.946,
    zIndex: 2,
    plusVisible: false,
    labelX: 0.12,
    labelY: 0.5,
  },
  sales: {
    slotX: 0.7,
    slotY: 0.38,
    widthFrac: 0.18,
    anchorX: 0.425,
    anchorY: 0.939,
    zIndex: 2,
    plusVisible: true,
    labelX: 0.88,
    labelY: 0.5,
  },
  autopost: {
    slotX: 0.3,
    slotY: 0.78,
    widthFrac: 0.2,
    anchorX: 0.376,
    anchorY: 0.945,
    zIndex: 4,
    plusVisible: false,
    labelX: 0.28,
    labelY: 1.1,
  },
  booking: {
    slotX: 0.72,
    slotY: 0.78,
    widthFrac: 0.19,
    anchorX: 0.308,
    anchorY: 0.945,
    zIndex: 4,
    plusVisible: true,
    labelX: 0.78,
    labelY: 1.1,
  },
};

/** Paint order: back row first, front row on top. */
export const SCENE_PAINT_ORDER: SceneModuleCode[] = [
  "leads",
  "sales",
  "autopost",
  "booking",
];

export const SCENE_TYPO = {
  labelTitlePx: 15,
  labelMetaPx: 13,
  labelLineHeight: 1.4,
  plusVisualPx: 30,
  plusHitPx: 44,
} as const;

export const SHADOW_TOKENS = {
  s: "0 4px 12px rgba(20, 12, 6, 0.12)",
  m: "0 12px 28px rgba(20, 12, 6, 0.16)",
  l: "0 22px 48px rgba(18, 10, 4, 0.28)",
  xl: "0 40px 80px rgba(14, 8, 4, 0.22)",
  /** Soft ground under tray — assets already carry contact AO. */
  platform: "0 24px 48px rgba(18, 10, 4, 0.28)",
} as const;

export const RADIUS_TOKENS = {
  sidebar: 18,
  glass: 20,
  card: 20,
  mobileCard: 20,
  pill: 9999,
  button: 18,
} as const;
