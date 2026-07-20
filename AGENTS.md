# AGENTS.md

## Project status

This repo is a fresh scaffold (no source files yet). The stack below is the agreed plan; when bootstrapping, keep it consistent so future sessions can rely on it.

## Product intent

A installable PWA ("Clocked") for logging work start/stop and tracking accumulated worked time.
- Target: installable on Android **and** iOS (add-to-home-screen / WebAPK).
- Runs **fully local** on the device. No backend, no network calls required at runtime.
- All work-time entries live in persistent on-device storage.

## Stack (decided)

- Vite + TypeScript (vanilla, not SFC-only) + Vue 3 (`vue`, `@vueuse/core`, Pinia for state)
- PWA: `vite-plugin-pwa` (autoUpdate + workbox, generates manifest + SW)
- Storage: IndexedDB via the `idb` wrapper (do **not** use localStorage for entries — size limits + eviction risk)
- Package manager: **pnpm** (use `pnpm` for all commands; do not commit a `package-lock.json` or `yarn.lock`)

## Architecture constraints

- Single SPA bundle, served from the document root. No SSR, no server routes.
- The service worker must cache the app shell so the app is fully offline-capable after first install.
- Storage must be persistent: call `navigator.storage.persist()` on first user interaction (iOS Safari evicts non-persistent IndexedDB under storage pressure).
- Treat device clock as user-editable; never rely on it for tamper-evidence. Record wall-clock timestamps only.
- Any time export/import (planned) must round-trip the raw entry objects, not aggregates.

## Developer commands

After scaffolding, the expected commands are:

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # type-check + production build (emits dist/)
pnpm preview      # serve dist/ locally for SW testing
pnpm lint         # eslint (flat config)
pnpm typecheck    # vue-tsc --noEmit
```

Required order before committing a change: **lint -> typecheck -> build**.

## Testing the PWA locally

Service workers only register over HTTPS or on `localhost`. `pnpm preview` serves on `localhost` and is the reliable way to verify installability and offline behavior. `pnpm dev` does not exercise the real SW.

## Gotchas

- iOS PWA quirks: limited background execution, no true "background sync"; a running timer must survive screen lock via stored start-timestamp (compute elapsed on resume, do not tick while hidden).
- `vite-plugin-pwa` `injectManifest` mode is required if you need custom SW logic (e.g. background sync fallback). Default `generateSW` is fine for app-shell caching only.
- Do not add a backend, API proxy, or any runtime dependency on a remote host. Keep the app usable in airplane mode.
