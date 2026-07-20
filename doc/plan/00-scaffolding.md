# WP0 — Project scaffolding

Goal: a Vite + TS + Vue 3 + Pinia + vite-plugin-pwa + Tailwind v4 + Vitest project that builds and boots a blank app. No domain logic yet.

**Strict order:** T1 → T2 → ... → T11.

---

## WP0-T1 — Vite + Vue 3 + TypeScript scaffold

- **Goal:** Create the base Vite project with Vue 3 + TypeScript.
- **Files:** `package.json`, `index.html`, `src/main.ts`, `src/App.vue`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`.
- **Approach:** Use `pnpm create vite` then trim:
  ```bash
  pnpm create vite . --template vue-ts
  ```
  When prompted about non-empty directory, choose to ignore / overwrite. If the scaffolder creates `package-lock.json` or `yarn.lock`, delete them. Remove the demo content from `src/App.vue` and `src/components/` (delete `HelloWorld.vue`, etc.). Leave `App.vue` as a single `<template><div>Clocked</div></template>`.
  
  Ensure `vite.config.ts` exports a basic config:
  ```ts
  import { defineConfig } from 'vite'
  import vue from '@vitejs/plugin-vue'

  export default defineConfig({
    plugins: [vue()],
  })
  ```
- **Dependencies:** none.
- **Acceptance criteria:**
  - `pnpm install` succeeds.
  - `pnpm dev` serves a page showing "Clocked" with no console errors.
  - No `package-lock.json` or `yarn.lock` exists.
- **V&V:** `pnpm install && pnpm dev` (manual check at http://localhost:5173).
- **Pitfalls:**
  - Vite's `vue-ts` template might pull `vue-tsc` — leave it; we'll pin versions in T3.
  - If `pnpm create vite` refuses the non-empty directory, run from a parent dir and move files, or use `--force`.

---

## WP0-T2 — Install runtime dependencies

- **Goal:** Add Vue, Pinia, VueUse, and `idb` to `package.json`.
- **Files:** `package.json`.
- **Approach:**
  ```bash
  pnpm add vue@^3.5 pinia@^2.2 @vueuse/core@^11 idb@^8
  ```
  `vue` may already be present from T1 — that's fine, the version constraint will be updated.
- **Dependencies:** WP0-T1.
- **Acceptance criteria:**
  - `package.json` `dependencies` contains the four packages with the pinned major versions.
  - `pnpm install` succeeds.
- **V&V:** `pnpm install`.
- **Pitfalls:** none.

---

## WP0-T3 — Install dev dependencies and pin versions

- **Goal:** Add the full dev toolchain with major-version pins.
- **Files:** `package.json`.
- **Approach:**
  ```bash
  pnpm add -D vite@^5.4 @vitejs/plugin-vue@^5.1 vue-tsc@^2.1 \
    vite-plugin-pwa@^0.20 tailwindcss@^4 @tailwindcss/vite@^4 \
    vitest@^2.1 @vue/test-utils@^2.4 happy-dom@^15 fake-indexeddb@^6 \
    eslint@^9 @vue/eslint-config-typescript@^14 eslint-plugin-vue@^9 \
    typescript@^5.6
  ```
- **Dependencies:** WP0-T1, WP0-T2.
- **Acceptance criteria:**
  - All listed packages present in `devDependencies` with the pinned major.
  - `pnpm install` succeeds; lockfile updates.
- **V&V:** `pnpm install`.
- **Pitfalls:** if `pnpm add -D` resolves an incompatible peer (e.g. `eslint-plugin-vue` vs `eslint@9`), pin to the version noted; do not let pnpm bump majors.

---

## WP0-T4 — TypeScript configuration

- **Goal:** Strict TS config that supports Vue SFCs and Vite.
- **Files:** `tsconfig.json`, `tsconfig.node.json`, `tsconfig.app.json` (if Vite scaffold uses them).
- **Approach:** Ensure `tsconfig.json` (or `tsconfig.app.json`) has:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitOverride": true,
      "noFallthroughCasesInSwitch": true,
      "useDefineForClassFields": true,
      "verbatimModuleSyntax": true,
      "skipLibCheck": true,
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "types": ["vite/client"],
      "baseUrl": ".",
      "paths": { "@/*": ["src/*"] }
    },
    "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"],
    "references": [{ "path": "./tsconfig.node.json" }]
  }
  ```
  `tsconfig.node.json` should cover `vite.config.ts` and `vitest.config.ts`:
  ```json
  {
    "compilerOptions": {
      "composite": true,
      "skipLibCheck": true,
      "module": "ESNext",
      "moduleResolution": "Bundler",
      "allowSyntheticDefaultImports": true,
      "strict": true
    },
    "include": ["vite.config.ts", "vitest.config.ts"]
  }
  ```
  Add the `@/*` path alias by also installing `node` types and `@types/node`:
  ```bash
  pnpm add -D @types/node
  ```
- **Dependencies:** WP0-T1, WP0-T3.
- **Acceptance criteria:**
  - `pnpm typecheck` (or `vue-tsc --noEmit -p tsconfig.app.json`) runs and reports no errors on the blank app.
  - The `@/*` alias resolves (test by importing `/@` somewhere).
- **V&V:** `pnpm typecheck`.
- **Pitfalls:**
  - `verbatimModuleSyntax: true` requires `import type` for type-only imports. Enforce it.
  - Vue SFC type-check requires `vue-tsc`, not plain `tsc`.

---

## WP0-T5 — ESLint flat config

- **Goal:** ESLint flat config with Vue + TS rules, no legacy `.eslintrc`.
- **Files:** `eslint.config.js` (or `.ts` if you prefer, with `jiti`).
- **Approach:**
  ```js
  // eslint.config.js
  import pluginVue from 'eslint-plugin-vue'
  import vueTsEslintConfig from '@vue/eslint-config-typescript'

  export default [
    ...pluginVue.configs['flat/essential'],
    ...vueTsEslintConfig(),
    {
      rules: {
        'vue/multi-word-component-names': 'off', // single-word App.vue etc.
      },
    },
    {
      ignores: ['dist/**', 'dev-dist/**', 'coverage/**'],
    },
  ]
  ```
  Add the lint script to `package.json`:
  ```json
  "lint": "eslint ."
  ```
- **Dependencies:** WP0-T3.
- **Acceptance criteria:**
  - `pnpm lint` runs and reports no errors on the scaffold.
  - No `.eslintrc.*` files exist.
- **V&V:** `pnpm lint`.
- **Pitfalls:**
  - `@vue/eslint-config-typescript` v14 expects flat config; do not use the old `.eslintrc` shape.
  - If ESLint complains about `.vue` files, ensure the `vue` plugin is listed before the TS config.

---

## WP0-T6 — package.json scripts

- **Goal:** Define all developer commands required by `AGENTS.md`.
- **Files:** `package.json`.
- **Approach:** Ensure `scripts` contains:
  ```json
  {
    "scripts": {
      "dev": "vite",
      "build": "vue-tsc --noEmit -p tsconfig.app.json && vite build",
      "preview": "vite preview --host",
      "lint": "eslint .",
      "typecheck": "vue-tsc --noEmit -p tsconfig.app.json",
      "test": "vitest run",
      "test:watch": "vitest"
    }
  }
  ```
  Note `build` runs `typecheck` first, then `vite build`. `preview` uses `--host` so you can reach it from a phone on the LAN for real-device PWA checks.
- **Dependencies:** WP0-T1, WP0-T5.
- **Acceptance criteria:**
  - All six commands exist and run without "missing script" errors.
  - `pnpm build` emits `dist/index.html`.
- **V&V:** `pnpm lint && pnpm typecheck && pnpm build`.
- **Pitfalls:**
  - `vue-tsc` with `-p tsconfig.app.json` — make sure that file exists from T4.

---

## WP0-T7 — Vitest configuration

- **Goal:** Configure Vitest with the happy-dom environment, the `@/*` alias, and `fake-indexeddb` available in all tests.
- **Files:** `vitest.config.ts` (or merge into `vite.config.ts` via the `test` key — recommended to keep one file).
- **Approach:** Extend `vite.config.ts`:
  ```ts
  /// <reference types="vitest" />
  import { defineConfig } from 'vite'
  import vue from '@vitejs/plugin-vue'
  import tailwindcss from '@tailwindcss/vite'
  import { fileURLToPath, URL } from 'node:url'

  export default defineConfig({
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  })
  ```
  Create `src/test/setup.ts`:
  ```ts
  import 'fake-indexeddb/auto'
  ```
- **Dependencies:** WP0-T3, WP0-T4.
- **Acceptance criteria:**
  - `pnpm test` runs (no tests found is OK; should exit 0 if `passWithNoTests` is set or there is at least one test).
  - Add a smoke test `src/test/smoke.test.ts`:
    ```ts
    import { describe, it, expect } from 'vitest'
    describe('smoke', () => {
      it('runs', () => { expect(1 + 1).toBe(2) })
    })
    ```
  - `pnpm test` passes.
- **V&V:** `pnpm test`.
- **Pitfalls:**
  - `fake-indexeddb/auto` must be imported once globally; don't import it per-test.
  - happy-dom is faster than jsdom for our needs and supports `<input type="time">` better.

---

## WP0-T8 — Tailwind v4 setup

- **Goal:** Tailwind v4 wired via the official Vite plugin, no `tailwind.config.js` needed, no PostCSS config.
- **Files:** `src/assets/main.css`, `src/main.ts`.
- **Approach:**
  - `src/assets/main.css`:
    ```css
    @import "tailwindcss";
    ```
  - `src/main.ts`:
    ```ts
    import { createApp } from 'vue'
    import { createPinia } from 'pinia'
    import App from './App.vue'
    import './assets/main.css'

    const app = createApp(App)
    app.use(createPinia())
    app.mount('#app')
    ```
  - The `@tailwindcss/vite` plugin was already added to `vite.config.ts` in T7. Verify it's in the `plugins` array.
- **Dependencies:** WP0-T3, WP0-T7.
- **Acceptance criteria:**
  - Add a Tailwind utility class to `App.vue`'s template (e.g. `<div class="text-red-500">Clocked</div>`) and verify the red color renders in `pnpm dev`.
  - Remove the demo class afterwards.
- **V&V:** `pnpm dev` (manual check), then `pnpm build` to confirm CSS is emitted to `dist/`.
- **Pitfalls:**
  - Tailwind v4 uses `@import "tailwindcss";` not the old `@tailwind base; @tailwind components; @tailwind utilities;` directives.
  - Do NOT create `tailwind.config.js`. v4 is CSS-first; theme customization happens via `@theme` in CSS if needed (defer to WP6).

---

## WP0-T9 — index.html with iOS PWA meta tags

- **Goal:** `index.html` with correct viewport, theme color, apple-mobile-web-app tags, and a placeholder icon link.
- **Files:** `index.html`, `public/icons/` (placeholder).
- **Approach:** Replace Vite's default `index.html` `<head>`:
  ```html
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
      <title>Clocked</title>
      <meta name="theme-color" content="#dc2626" />
      <meta name="description" content="Personal work-time tracker. Fully local, no backend." />

      <!-- iOS PWA -->
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="apple-mobile-web-app-title" content="Clocked" />
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
    </head>
    <body>
      <div id="app"></div>
      <script type="module" src="/src/main.ts"></script>
    </body>
  </html>
  ```
  Place a placeholder `public/icons/apple-touch-icon-180.png` (a 180×180 red square is fine for now; real icons come in WP5-T3).
- **Dependencies:** WP0-T1.
- **Acceptance criteria:**
  - `pnpm build` emits `dist/index.html` with all the meta tags intact.
  - `pnpm preview` shows the page with the correct `<title>` in the browser tab.
- **V&V:** `pnpm build && pnpm preview` (manual check).
- **Pitfalls:**
  - `viewport-fit=cover` is needed for iOS notch / safe-area insets.
  - `user-scalable=no` matches the app-like feel but make sure accessibility is still acceptable (we'll revisit in WP6 if needed).
  - `manifest.webmanifest` will be generated by `vite-plugin-pwa` in WP5; the `<link rel="manifest">` here is fine even if the file is 404 until WP5.

---

## WP0-T10 — vite-plugin-pwa minimal config

- **Goal:** Wire `vite-plugin-pwa` with `generateSW` and `autoUpdate`, enough that `pnpm build` emits a SW and manifest. Full PWA polish is WP5; this just gets the pipeline in place.
- **Files:** `vite.config.ts`.
- **Approach:** Update the Vite plugin array:
  ```ts
  import { VitePWA } from 'vite-plugin-pwa'

  // in plugins:
  VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Clocked',
      short_name: 'Clocked',
      description: 'Personal work-time tracker. Fully local, no backend.',
      theme_color: '#dc2626',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    },
    devOptions: { enabled: false },
  })
  ```
  Put placeholder PNGs in `public/icons/` (192, 512, maskable-512) — they can be solid red squares for now; WP5-T3 replaces them.
- **Dependencies:** WP0-T3, WP0-T9.
- **Acceptance criteria:**
  - `pnpm build` emits `dist/sw.js`, `dist/workbox-*.js`, and `dist/manifest.webmanifest`.
  - `pnpm preview` serves the manifest at `/manifest.webmanifest` (HTTP 200).
- **V&V:** `pnpm build` (verify files in `dist/`); `pnpm preview` and check `/manifest.webmanifest` in a browser.
- **Pitfalls:**
  - `devOptions.enabled` stays `false` — SW in dev is flaky and we test the real SW via `preview` only.
  - If `globPatterns` is empty, Workbox emits a SW that caches nothing.

---

## WP0-T11 — WP0 smoke test

- **Goal:** Verify the whole scaffold works end-to-end.
- **Files:** none (verification only).
- **Approach:** Run the full V&V chain. Then in `pnpm preview`:
  1. Open `http://localhost:4173` in a desktop browser.
  2. Open DevTools → Application → Manifest; confirm name "Clocked", theme color `#dc2626`.
  3. Application → Service Workers; confirm a SW is registered and activated.
  4. Application → Cache Storage; confirm `workbox-precache-v2-...` exists with the app shell.
  5. Reload the page in offline mode (DevTools → Network → Offline); the app should still render.
- **Dependencies:** WP0-T1 through WP0-T10.
- **Acceptance criteria:**
  - `pnpm lint` passes.
  - `pnpm typecheck` passes.
  - `pnpm build` passes and emits `dist/`.
  - `pnpm test` passes.
  - Manual PWA checks above all pass.
- **V&V:** the full chain above.
- **Pitfalls:**
  - If SW does not register on `localhost`, check that `pnpm preview` is serving on `localhost` (not `127.0.0.1` or `0.0.0.0`) — use `--host 127.0.0.1` if needed.
  - `autoUpdate` may show a "new version available" prompt on reload of `preview`; that's expected behavior, not a bug.

---

## End of WP0

Once WP0-T11 passes, the project scaffold is complete. Proceed to `01-domain.md`.
