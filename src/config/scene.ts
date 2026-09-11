/** Coordinates belong to the complete v2 desk artwork, never the viewport.
 * Each asset anchor is its foot; label regions remain independent HTML.
 * Availability comes only from business data.
 */
export const SCENE_FRAME = {
  width: 1536,
  height: 1024,
  visibleHeight: 850,
} as const;
export type SceneModuleCode = "leads" | "sales" | "autopost" | "booking";
export interface SceneModuleDock {
  x: number;
  y: number;
  width: number;
  /** Left-side labels use their right edge as the horizontal anchor. */
  labelX: number;
  labelY: number;
  side: "left" | "right";
  zIndex: number;
}
export const MODULE_DOCKS: Record<SceneModuleCode, SceneModuleDock> = {
  leads: {
    x: 46.7,
    y: 40.5,
    width: 21,
    labelX: 38,
    labelY: 22,
    side: "left",
    zIndex: 2,
  },
  sales: {
    x: 66.4,
    y: 40.5,
    width: 20,
    labelX: 77,
    labelY: 22,
    side: "right",
    zIndex: 2,
  },
  autopost: {
    x: 45.7,
    y: 63,
    width: 22,
    labelX: 36.5,
    labelY: 44,
    side: "left",
    zIndex: 3,
  },
  booking: {
    x: 67.1,
    y: 63,
    width: 22,
    labelX: 77,
    labelY: 44,
    side: "right",
    zIndex: 3,
  },
};
export const SCENE_PAINT_ORDER: SceneModuleCode[] = [
  "leads",
  "sales",
  "autopost",
  "booking",
];
