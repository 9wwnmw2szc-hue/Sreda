# Landing page: approved reference alignment

Reference: user-supplied IMG_3784.jpeg, 26 September 2026. Base commit: 417d348e4a5766acdbcff0105fbed82835627236.

The public landing now uses the reference's desktop proportions, gold pill buttons, thin hexagon benefit icons and full-width platform scene. The illustration is separate from live HTML navigation, headline and actions. The dashboard and application routes are unchanged.

## Asset provenance

`public/assets/landing/hero-clean.webp` was edited with the built-in ImageGen tool from the existing `hero-desktop.webp` and converted to WebP (1102 × 1428, 79,156 bytes). The original assets are retained. This is a close reconstruction of the approved illustration, not a pixel-identical crop. The new landing-only `logo-gold.svg` uses native vector geometry and gold gradients.

Prompt:

> Use case precise-object-edit. Edit this exact landing page illustration, preserve the exact 3D scene, all panels, their Russian text, logo, lighting, gold and ivory honeycomb pedestals, camera angle, proportions and positions. Only remove the extraneous website navigation at the very top (Возможности Тарифы Контакты Войти and login outline), the stray gray letter fragment at left around y=280, and small outlined hexagon fragment at bottom edge. Inpaint those three areas with matching warm ivory background. Do not remove or alter any text or graphics INSIDE the 3D panels. Do not redesign, do not add anything. Output same portrait composition and full scene, high quality crisp edges. Background should blend to warm off-white #faf9f6 at outer empty edges. This is an illustration asset for a real coded website, no page navigation or external headline/buttons.

## Validation

- Production build completed, including TypeScript and prerendering; the final narrow-screen CSS adjustment was subsequently verified in the browser.
- ESLint passed for changed TSX/TS files.
- Existing `tests/landing-public.test.mjs`: 4/4 passed; updated the expected asset filename.
- Browser capture at 320, 390, 768, 1024 and 1440 px: no horizontal document overflow, hero CTAs inside viewport, all page images decoded.
- Mobile menu open and Escape-to-close checked at 320 and 390 px.
- Screenshots taken from a local development preview; no production credentials or database required.
- No merge or deployment performed.
