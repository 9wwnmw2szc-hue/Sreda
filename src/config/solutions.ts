import type { SolutionAccentCode } from "@/config/design";
import { SOLUTION_ACCENTS } from "@/config/design";
import { MODULE_DOCKS, type SceneModuleDock } from "./scene";

export interface SolutionVisual {
  code: SolutionAccentCode;
  accentVar: string;
  assetSrc: string;
  assetWidth: number;
  assetHeight: number;
  dock: SceneModuleDock;
}

const FALLBACK_DOCK: SceneModuleDock = {
  x: 56,
  y: 78,
  width: 18,
  labelX: 56,
  labelY: 68,
  side: "right",
  zIndex: 4,
};

function visual(code: SolutionAccentCode): SolutionVisual {
  const dock =
    code in MODULE_DOCKS
      ? MODULE_DOCKS[code as keyof typeof MODULE_DOCKS]
      : FALLBACK_DOCK;
  return {
    code,
    accentVar: SOLUTION_ACCENTS[code].cssVar,
    // Pink cube asset is shared by inbox and orders (legacy "sales" export name).
    assetSrc: `/assets/sreda/v2/module-${code === "admin_messages" || code === "orders" ? "sales" : code}.webp`,
    assetWidth: 1024,
    assetHeight: 1024,
    dock,
  };
}

export const SOLUTION_VISUALS: Record<SolutionAccentCode, SolutionVisual> = {
  leads: visual("leads"),
  admin_messages: visual("admin_messages"),
  autopost: visual("autopost"),
  booking: visual("booking"),
  orders: visual("orders"),
};

/** Desk scene keeps four cubes; orders is available via catalog + mobile cards. */
export const WORKSPACE_SOLUTION_ORDER: SolutionAccentCode[] = [
  "leads",
  "orders",
  "admin_messages",
  "autopost",
  "booking",
];
