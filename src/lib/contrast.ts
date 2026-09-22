/**
 * sRGB relative luminance and WCAG contrast helpers.
 * Colors may be hex (#rgb / #rrggbb / #rrggbbaa) or { r, g, b } in 0–255.
 */

export type SrgbColor = { r: number; g: number; b: number };

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(255, Math.max(0, Math.round(n)));
}

/** Parse #rgb, #rrggbb, or #rrggbbaa into 0–255 sRGB channels (alpha ignored). */
export function parseHexColor(input: string): SrgbColor {
  const raw = input.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(raw)) {
    throw new Error(`Invalid hex color: ${input}`);
  }
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw.slice(0, 6);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function toSrgb(color: string | SrgbColor): SrgbColor {
  if (typeof color === "string") return parseHexColor(color);
  return {
    r: clampByte(color.r),
    g: clampByte(color.g),
    b: clampByte(color.b),
  };
}

/** Linearize an sRGB channel (0–1) per WCAG 2.x. */
function linearizeChannel(c: number): number {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance L ∈ [0, 1] for an sRGB color. */
export function relativeLuminance(color: string | SrgbColor): number {
  const { r, g, b } = toSrgb(color);
  const R = linearizeChannel(r / 255);
  const G = linearizeChannel(g / 255);
  const B = linearizeChannel(b / 255);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG contrast ratio between two sRGB colors (≥ 1). */
export function contrastRatio(
  foreground: string | SrgbColor,
  background: string | SrgbColor,
): number {
  const L1 = relativeLuminance(foreground);
  const L2 = relativeLuminance(background);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA thresholds. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
export const UI_CHROME_MIN = 3;
