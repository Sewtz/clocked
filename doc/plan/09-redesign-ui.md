# WP9 - UI redesign (Figma v1.0)

Goal: replace the WP4/WP6 UI with the dark mono/acid-green design v1.0.
Dark-only. All displays HH:MM (ADR-006); no seconds.

Strict order: T1, T2, ... T9.

## WP9-T1 - Theme tokens, fonts, dark-only palette
- Add devDep @fontsource/jetbrains-mono; import 400/700 in main.css
- @theme tokens (dark-only): bg, surface, border, text, work, break, overtime
- vite.config.ts manifest: theme_color and background_color to #0a0a0a
- index.html single theme-color #0a0a0a
- pnpm install; verify woff2 in dist/assets; no remote font requests

## WP9-T2 - Extend recompute with derived segment list
- Add DerivedSegment[] to Recomputed: work / gap-break / mandatory-break
- Walk punches -> work segs; gaps -> gap-breaks; mandatory pauses -> mandatory-breaks
- New tests: punches-only, one gap, trigger with no gap, two triggers

## WP9-T3 - Store getters for redesign
- Add getters: segments, remainingMs, overtimeMs, nextMilestone, daySpanMs

## WP9-T4 - App.vue shell + header
- Status dot, TIMECLOCK wordmark, date, gear button
- View switching: ClockInView for idle/clocked-out, RunningView for running/break
- Drop BreakOverlay; keep visibilitychange handler

## WP9-T5 - Rewrite ClockInView
- Big rectangular green CLOCK IN button
- Show worked HH:MM + WORKED TODAY when clocked out
- No +Nmin, custom time, edit-start, reset-day

## WP9-T6 - Rewrite RunningView + new Timeline
- Big worked HH:MM clock + status label
- Inline auto-break banner (orange, HH:MM countdown, progress bar)
- Next milestone hint
- CLOCK OUT button (only when working, no buttons on break)
- 3-col stats grid (worked/breaks/remaining-overtime)
- Daily target bar
- Timeline track + per-session list

## WP9-T7 - SettingsDialog
- Modal: daily target + 2 break rules (toggle, trigger, duration)
- NumberInput + Toggle sub-components
- Save converts hours/minutes to seconds; enforces break1/break2 cascade

## WP9-T8 - Remove BreakOverlay, cleanup dead code
- Delete BreakOverlay.vue and test
- Prune tests for removed affordances

## WP9-T9 - Docs update
- ADR-026 for redesign decisions
- Update architecture.md diagram, remove BreakOverlay
- Mark WP4/WP6 superseded for visual layer