# Build prerender RCA — Cloud Agent VM

## Symptom

```
Error occurred prerendering page "/_global-error"
TypeError: Cannot read properties of null (reading 'useContext')
```

(Also previously observed on `/_not-found` / `admin/login` with `useState` null.)

Next also warns:

```
⚠ You are using a non-standard "NODE_ENV" value in your environment.
```

## Root cause (confirmed)

The Cloud Agent shell exports **`NODE_ENV=development`**. Running `next build` with that value leaves React/Next in an inconsistent mode: production webpack output is prerendered by workers whose React dispatcher is `null`, so any App Router client hook (`useContext` / `useState`, including Next internals used while prerendering `/_global-error`) throws.

Evidence:

| Command | Result |
| --- | --- |
| `NODE_ENV=development npm run build` (agent default) | **FAIL** — `/_global-error` `useContext` of null |
| `env -u NODE_ENV npm run build` | **PASS** |
| `NODE_ENV=production npm run build` | **PASS** |

Reproduced on `main` @ `34ef17f` and on the landing feature branch — **not a landing regression**.

`src/app/global-error.tsx` is a minimal Client Component with **no** `Link`; the stack still points at a shared App Router client chunk (`.next/server/chunks/2109.js`) calling `useContext(AppRouterContext)` during static generation of `/_global-error`.

CI / Docker stay green because those environments do not inject `NODE_ENV=development` into the build step (Dockerfile sets `NODE_ENV=production` only on the runtime image).

## Fix

Force production mode in the npm build script:

```json
"build": "NODE_ENV=production next build --webpack"
```

This is the correct build contract (production compile + prerender), not a page-level bandaid.

## Ruled out

- Landing / `force-dynamic` on `/`
- Deleting `global-error` or excluding routes
- Global `force-dynamic` / disabling build checks
- Missing `<Suspense>` around `useSearchParams` on `admin/login` (already present)

## Logs (agent VM)

- `/tmp/build-main.log` — main FAIL under polluted `NODE_ENV`
- `/tmp/build-feature.log` — feature FAIL under polluted `NODE_ENV`
- `/tmp/build-feature-unset-nodeenv.log` — PASS with `NODE_ENV` unset
- `/tmp/build-main-production-nodeenv.log` — PASS with `NODE_ENV=production`
