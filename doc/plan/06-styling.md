# WP6 — Styling & polish

Goal: take the working-but-ugly app from WP4 and give it a consistent mobile-first look using Tailwind v4 utilities. Big round red button that's easy to tap. Safe-area handling for iOS notch. Theme color. No new dependencies.

**Strict order:** T1 → T2 → ... → T5.

---

## WP6-T1 — Base CSS and theme tokens

- **Goal:** Establish the visual language: background, text, font stack, and the red theme color as a CSS variable.
- **Files:** `src/assets/main.css` (extend what was created in WP0-T8).
- **Approach:** Tailwind v4 uses CSS-first config via `@theme`. Add tokens:
  ```css
  @import "tailwindcss";

  @theme {
    --color-brand: #dc2626;
    --color-brand-dark: #b91c1c;
    --color-bg: #fafafa;
    --color-surface: #ffffff;
    --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  }

  html, body, #app {
    height: 100%;
  }

  body {
    margin: 0;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
  }

  /* iOS safe-area insets */
  #app {
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
  ```
- **Dependencies:** WP0-T8.
- **Acceptance criteria:**
  - The `--color-brand` token is usable as `bg-brand` in Tailwind utility classes.
  - `pnpm build` emits the CSS with the custom properties.
- **V&V:** `pnpm dev` — change `App.vue`'s root div to `bg-brand` and confirm it renders red. Revert.
- **Pitfalls:**
  - Tailwind v4 generates utility classes for any `@theme` token. `--color-brand` becomes `bg-brand`, `text-brand`, etc.
  - The `env(safe-area-inset-*)` values are 0 on non-iOS browsers, so the padding is harmless elsewhere.
  - `-webkit-tap-highlight-color: transparent` removes the gray flash on iOS taps.

---

## WP6-T2 — Big round red button polish

- **Goal:** Make `ClockInView`'s main button look great and feel responsive on touch.
- **Files:** `src/components/ClockInView.vue`.
- **Approach:** Refine the existing button class:
  ```html
  <button
    type="button"
    class="
      w-56 h-56 rounded-full
      bg-brand text-white text-3xl font-semibold
      shadow-xl shadow-brand/30
      active:scale-95 active:bg-brand-dark
      transition-all duration-150
      select-none touch-manipulation
    "
    @click="clockInNow"
  >
    Clock In
  </button>
  ```
  Key points:
  - `w-56 h-56` → 224px, plenty of touch target.
  - `rounded-full` → circle.
  - `bg-brand` → uses the theme token from T1.
  - `shadow-brand/30` → tinted shadow (Tailwind v4 supports color/opacity on shadows).
  - `active:scale-95 active:bg-brand-dark` → tactile feedback on tap.
  - `transition-all duration-150` → smooth.
  - `select-none touch-manipulation` → no text selection, optimized touch events (disables 300ms tap delay on iOS).
- **Dependencies:** WP6-T1.
- **Acceptance criteria:**
  - The button renders as a large red circle with white text and a tinted shadow.
  - Tapping the button scales it down briefly (visible in `pnpm dev`).
  - No 300ms tap delay on mobile.
- **V&V:** `pnpm dev` — manual check on desktop; `pnpm preview --host` — manual check on a phone.
- **Pitfalls:**
  - `touch-manipulation` is the Tailwind class for `touch-action: manipulation`. It's safe to use globally on the button.

---

## WP6-T3 — Touch targets and accessibility on all buttons

- **Goal:** Ensure every button in the app meets the 44×44px minimum touch target and has an accessible label.
- **Files:** all components in `src/components/`.
- **Approach:** Audit each `<button>`:
  - If the button has only an icon, add `aria-label`.
  - If the button is small, pad it to at least `min-w-[44px] min-h-[44px]`.
  
  Update the +1/+5/+10 buttons:
  ```html
  <button
    type="button"
    class="min-w-[44px] min-h-[44px] px-5 py-2 rounded-lg bg-neutral-200 text-neutral-800 active:scale-95 transition-transform"
    @click="adjust(1)"
  >
    +1min
  </button>
  ```
  Update the clock-out and reset buttons similarly with `min-h-[44px]`.
  
  For the reset button (text only, small text), keep the text but ensure the clickable area is large:
  ```html
  <button
    type="button"
    class="min-h-[44px] px-4 py-2 text-sm text-brand underline"
    @click="store.reset()"
  >
    Reset day
  </button>
  ```
- **Dependencies:** WP6-T1.
- **Acceptance criteria:**
  - Every button has computed dimensions >= 44×44px (check in DevTools).
  - Buttons with icons have `aria-label`.
  - Buttons with text have a clear visible label (no icon-only ambiguity).
- **V&V:** `pnpm dev` — DevTools → Elements → Computed → check `width` and `height` for each button.
- **Pitfalls:**
  - iOS requires 44×44pt = 44×44px at 1x. At 2x and 3x screens this is 88 and 132 device pixels, but CSS px stays 44.
  - Don't make the reset button too prominent — it's destructive. Keep the text small and red, but with adequate touch area.

---

## WP6-T4 — Dark mode via `prefers-color-scheme`

- **Goal:** Respect the user's system color preference.
- **Files:** `src/assets/main.css`, all components.
- **Approach:** Tailwind v4 supports `dark:` variants out of the box via `prefers-color-scheme`. No JS needed.
  
  Update `App.vue`'s root:
  ```html
  <main class="min-h-dvh flex flex-col items-center justify-center bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
  ```
  
  Update `ClockInView` adjustment buttons:
  ```html
  <button class="min-w-[44px] min-h-[44px] px-5 py-2 rounded-lg bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100 ...">
  ```
  
  Similarly for `RunningView` and `BreakOverlay`. The big red button and the break overlay (amber) stay the same in both modes.
  
  Add a dark-mode-aware theme color to `index.html`:
  ```html
  <meta name="theme-color" content="#dc2626" media="(prefers-color-scheme: light)" />
  <meta name="theme-color" content="#7f1d1d" media="(prefers-color-scheme: dark)" />
  ```
- **Dependencies:** WP6-T1, WP6-T2, WP6-T3.
- **Acceptance criteria:**
  - In light mode: neutral background, dark text, red brand color.
  - In dark mode: dark background, light text, red brand color (slightly muted if desired).
  - The browser chrome (mobile) matches the dark theme color in dark mode.
- **V&V:** `pnpm dev` — toggle system color scheme and verify. `pnpm preview` on a phone — same.
- **Pitfalls:**
  - Tailwind v4's dark variant is on by default. No need to set `darkMode: 'class'` like v3.
  - If the break overlay's `bg-amber-100` looks wrong in dark mode, swap for `dark:bg-amber-900 dark:text-amber-50`.

---

## WP6-T5 — View-specific layout polish

- **Goal:** Final visual pass on each view: spacing, typography, focus states, the loading state.
- **Files:** `src/App.vue`, `src/components/ClockInView.vue`, `src/components/RunningView.vue`, `src/components/BreakOverlay.vue`.
- **Approach:**
  
  **App.vue:**
  - The "Loading…" state should be a simple spinner or a pulsing "Clocked" wordmark:
    ```html
    <div class="text-neutral-400 animate-pulse text-xl">Clocked</div>
    ```
  - Add top padding for the safe area is already handled by `#app`. Inside, the centered content already avoids notches due to `min-h-dvh` + flex centering.
  
  **ClockInView:**
  - Wrap everything in a container with vertical rhythm:
    ```html
    <div class="flex flex-col items-center gap-10 px-6">
    ```
  - Add a small heading above the button:
    ```html
    <h1 class="text-2xl font-semibold text-neutral-700 dark:text-neutral-300">Ready to work?</h1>
    ```
  - Label the custom time picker clearly.
  
  **RunningView:**
  - Make the elapsed display the focal point:
    ```html
    <div class="text-7xl font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
      {{ display }}
    </div>
    <div class="text-sm uppercase tracking-wide text-neutral-500">worked (excl. breaks)</div>
    ```
  - Group the secondary actions (clock-out, edit, reset) below the main display.
  
  **BreakOverlay:**
  - Center the countdown, use a large font, add a small icon or emoji (if desired) — actually no emojis per project conventions.
  - Make the overlay visually distinct from the running state (amber background).
  - Add a subtitle "Resumes automatically" so the user knows they don't need to do anything.
  
  **Focus states:** ensure keyboard focus is visible:
  ```html
  <button class="... focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
  ```
- **Dependencies:** WP6-T1 through WP6-T4.
- **Acceptance criteria:**
  - Each view looks polished in light and dark mode.
  - Keyboard focus is visible on every interactive element.
  - The loading state is not a flash — it shows briefly then disappears.
- **V&V:** `pnpm dev` — click through the views; `pnpm preview` on a phone — visual check.
- **Pitfalls:**
  - Don't over-design. The app has three screens; keep it minimal.
  - The `tabular-nums` class on `font-mono` is critical — without it, the HH:MM digits shift every second and the layout jitters.
  - `font-mono` is for the timer only — body text should be sans-serif.

---

## End of WP6

Once WP6-T5 passes, the app is visually consistent and mobile-friendly. Proceed to `07-vnv.md` for the final manual verification pass.
