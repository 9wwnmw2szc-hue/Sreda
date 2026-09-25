# Build prerender RCA — Cloud Agent VM

## Symptom

```
Error occurred prerendering page "/_global-error"
TypeError: Cannot read properties of null (reading 'useContext')
```

(Also previously observed on `/_not-found` / `admin/login` with `useState` null.)

## Reproduction

Isolated git worktree at exact `main` SHA `34ef17f27369f062452eb94b1cb2eb624cae308f`:

```
npm ci
NODE_OPTIONS=--max-old-space-size=4096 npm run build
# and
NEXT_CPU_COUNT=1 npx next build --webpack
```

**Result on main: FAIL** (same class of error).

Feature branch fails the same way — **not a landing regression**.

## Root cause (evidence)

Failing chunk `.next/server/chunks/2109.js` calls `h.default.useContext(j.AppRouterContext)` inside Next.js `Link` / App Router client runtime during static prerender of `/_global-error`.

`src/app/global-error.tsx` is a minimal Client Component with **no** `Link` import; Next still prerenders shared App Router client chunks for the `/_global-error` route. During that pass React’s dispatcher is `null` → `useContext` / `useState` throw.

Concurrent symptoms: React “unique key” warnings on `<html>` / `<head>` / `<meta>` during the same prerender phase (Next 16.3.4 + React 19.2.8 metadata path).

## What we ruled out

- Not introduced by landing / `force-dynamic` on `/`
- Not fixed by single-CPU build
- `admin/login` already wraps `useSearchParams` in `<Suspense>`

## Safe remediation options (not applied as bandaids)

1. Confirm green `npm run build` in GitHub Actions / Docker on Linux runners (CI historically green for this repo).
2. Track Next.js upgrade when App Router error-page prerender is fixed.
3. Avoid deleting `global-error` or disabling SSR globally.

## Agent stance

Documented as **environment/tooling failure reproducible on main**. Landing changes do not own this failure.
