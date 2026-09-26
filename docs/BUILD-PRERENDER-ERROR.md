# Build prerender RCA — `/_global-error` useContext null

## Symptom

```
Error occurred prerendering page "/_global-error"
TypeError: Cannot read properties of null (reading 'useContext')
    at D (.next/server/chunks/2109.js:130:10177)
```

Next also warns when the shell pollutes `NODE_ENV`:

```
⚠ You are using a non-standard "NODE_ENV" value in your environment.
```

(Also previously observed on `/_not-found` / `admin/login` with `useState` of null under the same env.)

## Chunk analysis (`.next/server/chunks/2109.js`)

Decompiled call site at the stack frame:

```js
function D({ parallelRouterKey, error, errorStyles, /* … */ template, notFound, … }) {
  let v = (0, i.useContext)(k.LayoutRouterContext);
  // …
}
```

- **`D` is Next’s App Router `OuterLayoutRouter`** (parallel-route segment), not app code.
- **`i.useContext`** is React’s `useContext`. The TypeError means React’s dispatcher (`ReactSharedInternals.H`) is **`null`** — i.e. hooks ran outside a valid render — not that `LayoutRouterContext` itself is missing (that path throws Next’s `E56` invariant instead).
- Chunk contains `LayoutRouterContext` / `GlobalLayoutRouterContext` / `RouterContext` from `next/dist` client runtime. **No** `ThemeProvider`, `next/font`, or app `Link` from `global-error.tsx` in the failing frame.
- `/_global-error/page.js` tree wires:
  - builtin `app-error.js` as the page
  - user `src/app/global-error.tsx` as the `global-error` slot (client reference only on the server bundle)
  - user `not-found.tsx` (which does use `next/link`) as a sibling slot in the same synthesized tree

So Next **always** emits App Router client runtime (with `useContext`) into the `/_global-error` prerender graph. App `global-error.tsx` being hook-free does not remove that.

## Root cause (confirmed)

The Cloud Agent shell exports **`NODE_ENV=development`**. Running `next build` while that value remains active is invalid: Next expects **`NODE_ENV=production`** for `next build`. With a mismatched env:

1. Next prints the non-standard `NODE_ENV` warning.
2. Production webpack output is then prerendered by workers whose React dispatcher is unset/`null`.
3. The first App Router hook in the shared chunk (`OuterLayoutRouter` → `useContext(LayoutRouterContext)`) throws while generating `/_global-error`.

Evidence (same tree; only env differs):

| Command | Result |
| --- | --- |
| Shell `NODE_ENV=development` + `"build": "next build --webpack"` | **FAIL** — `/_global-error` `useContext` of null |
| `env -u NODE_ENV npm run build` | **PASS** |
| `NODE_ENV=production npm run build` | **PASS** |
| Shell `NODE_ENV=development` + `"build": "NODE_ENV=production next build --webpack"` | **PASS** |

Reproduced on `main` @ `34ef17f` and on this landing feature branch — **not a landing regression**.

CI / Docker stay green because those environments do not inject `NODE_ENV=development` into the build step.

## Fix

Force production mode in the npm build script (correct Next build contract):

```json
"build": "NODE_ENV=production next build --webpack"
```

Not a page-level bandaid: no route deletion, no `force-dynamic`, no disabled checks.

## Ruled out

- Landing / `force-dynamic` on `/`
- ThemeProvider / `next/font` / metadata “polluting” `global-error` authorship
- Deleting `global-error` or excluding routes
- Global `force-dynamic` / disabling build checks
- Missing `<Suspense>` around `useSearchParams` on `admin/login` (already present)
- Version pin of Next/React (failure is env-mode mismatch, not a unique 16.3.4/19.2.8 app bug)
- `NEXT_DISABLE_SWC_WASM` / turbopack / single worker (do not change the env root cause)

## Logs (agent VM)

- `/tmp/build-main.log` — main FAIL under polluted `NODE_ENV`
- `/tmp/build-feature.log` — feature FAIL under polluted `NODE_ENV`
- `/tmp/build-feature-unset-nodeenv.log` — PASS with `NODE_ENV` unset
- `/tmp/build-main-production-nodeenv.log` — PASS with `NODE_ENV=production`
- `/tmp/build-feature-after-fix.log` — PASS after script forces `NODE_ENV=production`
