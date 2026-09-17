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
function visual(code: SolutionAccentCode): SolutionVisual {
  return {
    code,
    accentVar: SOLUTION_ACCENTS[code].cssVar,
    // The pink chat cube is the approved visual for the administration inbox.
    assetSrc: `/assets/sreda/v2/module-${code === "admin_messages" ? "sales" : code}.webp`,
    assetWidth: 1024,
    assetHeight: 1024,
    dock: MODULE_DOCKS[code],
  };
}
export const SOLUTION_VISUALS: Record<SolutionAccentCode, SolutionVisual> = {
  leads: visual("leads"),
  admin_messages: visual("admin_messages"),
  autopost: visual("autopost"),
  booking: visual("booking"),
};
export const WORKSPACE_SOLUTION_ORDER: SolutionAccentCode[] = [
  "leads",
  "admin_messages",
  "autopost",
  "booking",
];
