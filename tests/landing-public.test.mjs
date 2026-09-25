import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("root page renders public landing, not dashboard redirect", async () => {
  const page = await read("src/app/page.tsx");
  assert.match(page, /LandingPage/);
  assert.doesNotMatch(page, /redirect\("\/dashboard"\)/);
  assert.match(page, /LANDING_COPY\.title|БизнеСоты — инструменты/);
});

test("landing CTAs point to existing auth routes", async () => {
  const header = await read("src/components/landing/LandingHeader.tsx");
  const hero = await read("src/components/landing/HeroSection.tsx");
  const pricing = await read("src/components/landing/PricingSection.tsx");
  const finalCta = await read("src/components/landing/FinalCtaSection.tsx");
  assert.match(header, /href="\/login"/);
  assert.match(hero, /href="\/register"/);
  assert.match(hero, /href="#features"/);
  assert.match(pricing, /href="\/register"/);
  assert.match(finalCta, /href="\/register"/);
});

test("landing stays outside app shell layout", async () => {
  const appLayout = await read("src/app/(app)/layout.tsx");
  const page = await read("src/app/page.tsx");
  assert.match(appLayout, /AppShell/);
  assert.match(page, /LandingPage/);
  assert.doesNotMatch(page, /AppShell/);
});

test("landing uses light token palette and brand assets", async () => {
  const css = await read("src/components/landing/landing.css");
  const config = await read("src/components/landing/landing-config.ts");
  assert.match(css, /--landing-bg:\s*#faf9f6/i);
  assert.match(css, /--landing-gold/);
  assert.doesNotMatch(css, /background:\s*#0[0-9a-f]{5}/i);
  assert.match(config, /hero-desktop\.webp/);
  assert.match(config, /Все инструменты/);
});
