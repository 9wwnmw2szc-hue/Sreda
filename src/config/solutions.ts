import type { SolutionAccentCode } from "@/config/design";
import { SOLUTION_ACCENTS } from "@/config/design";
import { SREDA_ASSETS } from "@/config/assets";
import {
  MODULE_DOCKS,
  SCENE_TYPO,
  type SceneModuleCode,
} from "@/config/scene";

export interface SolutionVisual {
  code: SolutionAccentCode;
  accentVar: string;
  assetSrc: string;
  assetWidth: number;
  assetHeight: number;
  /** Platform-relative docking (fractions of tray frame). */
  dock: {
    slotX: number;
    slotY: number;
    widthFrac: number;
    anchorX: number;
    anchorY: number;
    zIndex: number;
    plusVisible: boolean;
    labelX: number;
    labelY: number;
  };
}

function dockFor(code: SceneModuleCode) {
  const d = MODULE_DOCKS[code];
  return {
    slotX: d.slotX,
    slotY: d.slotY,
    widthFrac: d.widthFrac,
    anchorX: d.anchorX,
    anchorY: d.anchorY,
    zIndex: d.zIndex,
    plusVisible: d.plusVisible,
    labelX: d.labelX,
    labelY: d.labelY,
  };
}

/**
 * Solution visuals — docking comes from MODULE_DOCKS (scene.ts).
 * No scattered left/top magic numbers in components.
 */
export const SOLUTION_VISUALS: Record<SolutionAccentCode, SolutionVisual> = {
  leads: {
    code: "leads",
    accentVar: SOLUTION_ACCENTS.leads.cssVar,
    assetSrc: SREDA_ASSETS.solutions.leads,
    assetWidth: 355,
    assetHeight: 365,
    dock: dockFor("leads"),
  },
  sales: {
    code: "sales",
    accentVar: SOLUTION_ACCENTS.sales.cssVar,
    assetSrc: SREDA_ASSETS.solutions.sales,
    assetWidth: 365,
    assetHeight: 365,
    dock: dockFor("sales"),
  },
  autopost: {
    code: "autopost",
    accentVar: SOLUTION_ACCENTS.autopost.cssVar,
    assetSrc: SREDA_ASSETS.solutions.autopost,
    assetWidth: 395,
    assetHeight: 365,
    dock: dockFor("autopost"),
  },
  booking: {
    code: "booking",
    accentVar: SOLUTION_ACCENTS.booking.cssVar,
    assetSrc: SREDA_ASSETS.solutions.booking,
    assetWidth: 385,
    assetHeight: 365,
    dock: dockFor("booking"),
  },
};

export const WORKSPACE_SOLUTION_ORDER: SolutionAccentCode[] = [
  "leads",
  "sales",
  "autopost",
  "booking",
];

export const MOBILE_ACTIVE_ORDER: SolutionAccentCode[] = ["leads", "autopost"];
export const MOBILE_AVAILABLE_ORDER: SolutionAccentCode[] = ["sales", "booking"];

export const SOLUTION_LABEL_TYPO = SCENE_TYPO;
